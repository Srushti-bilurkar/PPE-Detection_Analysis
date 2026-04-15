import { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { useSSE } from '../hooks/useSSE'
import { getPPECompliance, getCameras } from '../api'

Chart.register(...registerables)

function CameraFeed({ cam }) {
  const videoRef    = useRef(null)
  const hlsRef      = useRef(null)
  const retryTimer  = useRef(null)
  const watchdogRef = useRef(null)
  const lastTime    = useRef(null)

  useEffect(() => {
    if (!cam.hls_url) return

    function startWatchdog() {
      clearInterval(watchdogRef.current)
      lastTime.current = null
      watchdogRef.current = setInterval(() => {
        const video = videoRef.current
        if (!video) return
        const ct = video.currentTime
        if (lastTime.current !== null && ct === lastTime.current) {
          console.warn(`[${cam.id}] stream stalled at ${ct.toFixed(2)}s — reconnecting`)
          clearInterval(watchdogRef.current)
          clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(attachHls, 1000)
        }
        lastTime.current = ct
      }, 5000)
    }

    function attachHls() {
      const video = videoRef.current
      if (!video) return
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      const bustUrl = `${cam.hls_url}?t=${Date.now()}`

      if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
          lowLatencyMode:            true,
          enableWorker:              true,
          backBufferLength:          0,
          maxBufferLength:           10,
          maxMaxBufferLength:        15,
          manifestLoadingTimeOut:    10000,
          manifestLoadingMaxRetry:   20,
          manifestLoadingRetryDelay: 2000,
          levelLoadingTimeOut:       10000,
          levelLoadingMaxRetry:      20,
          fragLoadingTimeOut:        10000,
          fragLoadingMaxRetry:       20,
          xhrSetup: (xhr) => {
            xhr.setRequestHeader('Cache-Control', 'no-cache')
            xhr.setRequestHeader('Pragma', 'no-cache')
          },
        })
        hls.loadSource(bustUrl)
        hls.attachMedia(video)
        hlsRef.current = hls
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
          startWatchdog()
        })
        hls.on(window.Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.warn(`[${cam.id}] fatal HLS error — reconnecting in 4s`, data)
            clearInterval(watchdogRef.current)
            clearTimeout(retryTimer.current)
            retryTimer.current = setTimeout(attachHls, 4000)
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = bustUrl
        video.play().catch(() => {})
        startWatchdog()
      }
    }

    function attach() {
      if (typeof window.Hls === 'undefined') {
        if (!document.querySelector('script[data-hls]')) {
          const script = document.createElement('script')
          script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js'
          script.setAttribute('data-hls', '1')
          script.onload = attachHls
          document.head.appendChild(script)
        } else {
          retryTimer.current = setTimeout(attach, 500)
        }
      } else {
        attachHls()
      }
    }

    const video = videoRef.current
    const onStall = () => {
      console.warn(`[${cam.id}] native stall/error detected — reconnecting in 3s`)
      clearInterval(watchdogRef.current)
      clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(attachHls, 3000)
    }
    video?.addEventListener('stalled', onStall)
    video?.addEventListener('error',   onStall)
    attach()

    return () => {
      clearInterval(watchdogRef.current)
      clearTimeout(retryTimer.current)
      video?.removeEventListener('stalled', onStall)
      video?.removeEventListener('error',   onStall)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [cam.hls_url])

  return (
    <div className="camera-feed">
      <video
        ref={videoRef}
        autoPlay muted playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      <div className="cam-overlay">
        <div className="cam-top">
          <div className="cam-id">{cam.id}</div>
          <div className={`cam-status ${cam.ready ? 'live' : 'offline'}`}>
            {cam.ready ? '● REC' : '○ WAIT'}
          </div>
        </div>
        <div className="cam-bottom">
          <div className="cam-zone">HLS STREAM</div>
          <div className="cam-fps">{cam.ready ? 'LIVE' : 'STARTING...'}</div>
        </div>
      </div>
    </div>
  )
}

export default function SafetyDashboard() {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  const { kpi, alerts: liveAlerts } = useSSE()

  const [cameras,       setCameras]       = useState([])
  const [compliance,    setCompliance]    = useState({ helmet: 0, vest: 0 })
  const [trendData,     setTrendData]     = useState(null)
  const [ackedIds,      setAckedIds]      = useState(new Set())
  const [selectedDate,  setSelectedDate]  = useState(new Date().toISOString().split('T')[0])
  const [selectedShift, setSelectedShift] = useState('day')
  const [daySafe,       setDaySafe]       = useState(0)
  const [dayViolated,   setDayViolated]   = useState(0)

  // ── fetch trend + compliance when date or shift changes ───────────────────
  useEffect(() => {
    setDaySafe(0)
    setDayViolated(0)
    setTrendData(null)

    const params = new URLSearchParams({ date: selectedDate, shift: selectedShift })
    fetch(`/api/hourly-trend?${params}`)
      .then(r => {
        if (!r.ok) throw new Error(`hourly-trend ${r.status}`)
        return r.json()
      })
      .then(data => {
        // Guard: API must return an array — reject objects like {"detail":"Not Found"}
        const safe = Array.isArray(data) ? data : []
        setTrendData(safe)
        if (safe.length > 0) {
          setDaySafe(safe.reduce((s, d) => s + (d.workers_active || 0), 0))
          setDayViolated(safe.reduce((s, d) => s + (d.violations || 0), 0))
        }
      })
      .catch(err => {
        console.error('[SafetyDashboard] hourly-trend error:', err)
        setTrendData([])   // ensure it stays an array so .map() never crashes
      })

    fetch(`/api/ppe-compliance-summary?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setCompliance({ helmet: d.helmet ?? 0, vest: d.vest ?? 0 }))
      .catch(() => {
        getPPECompliance(selectedDate)
          .then(d => setCompliance({ helmet: d.helmet ?? 0, vest: d.vest ?? 0 }))
          .catch(() => {})
      })
  }, [selectedDate, selectedShift])

  // ── camera polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => getCameras().then(setCameras).catch(() => {})
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  // ── chart ─────────────────────────────────────────────────────────────────
  // Two lines on a single Y-axis (count):
  //   • Compliance     = workers_safe  (green, solid)
  //   • Non-compliance = violations    (red, dashed)
  // Each point is the MAX value observed in that hour from the API.
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    if (!trendData || trendData.length === 0) return

    // Pad single-point data so the chart draws a curve, not just a dot
    let chartData = trendData
    if (trendData.length === 1) {
      const hour     = trendData[0].hour.split(':')[0]
      const prevHour = `${String(Math.max(0,  parseInt(hour) - 1)).padStart(2, '0')}:00`
      const nextHour = `${String(Math.min(23, parseInt(hour) + 1)).padStart(2, '00')}:00`
      chartData = [
        { hour: prevHour, workers_active: 0, violations: 0 },
        ...trendData,
        { hour: nextHour, workers_active: 0, violations: 0 },
      ]
    }

    const ctx = chartRef.current.getContext('2d')

    chartInst.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.map(d => d.hour),
        datasets: [
          // ── Compliance (safe workers) ─────────────────────────────────────
          {
            label:                'Total Workers',
            data:                 chartData.map(d => d.workers_active),
            borderColor:          '#22c55e',
            backgroundColor:      'rgba(34,197,94,0.10)',
            fill:                 true,
            tension:              0.4,
            pointRadius:          4,
            pointBackgroundColor: '#22c55e',
            borderWidth:          2.5,
            // solid line — no borderDash
          },
          // ── Non-compliance (violations) ───────────────────────────────────
          {
            label:                'Violations',
            data:                 chartData.map(d => d.violations),
            borderColor:          '#e53e3e',
            backgroundColor:      'rgba(229,62,62,0.08)',
            fill:                 true,
            tension:              0.4,
            pointRadius:          4,
            pointBackgroundColor: '#e53e3e',
            borderWidth:          2.5,
            borderDash:           [5, 3],   // dashed so color isn't the only differentiator
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },   // custom legend rendered in JSX below
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const suffix = ctx.dataset.label === 'Violations' ? ' violations' : ' workers (total)'
                return ` ${ctx.dataset.label}: ${ctx.parsed.y}${suffix}`
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#5a6a82', autoSkip: false, maxRotation: 45 },
            grid:  { color: 'rgba(255,255,255,0.04)' },
          },
          // Single shared Y-axis — count
          y: {
            beginAtZero: true,
            ticks: { color: '#a0aec0', font: { size: 11 } },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: 'count (max per hour)', color: '#5a6a82', font: { size: 11 } },
          },
        },
      },
    })

    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    }
  }, [trendData])

  // ── helpers ────────────────────────────────────────────────────────────────
  const ackAlert      = (id) => setAckedIds(prev => new Set([...prev, id]))
  const visibleAlerts = liveAlerts.filter(a =>
    !ackedIds.has(a._id) && a.timestamp?.startsWith(selectedDate)
  )
  const unacked         = visibleAlerts.length
  const compColor       = (pct) => pct >= 90 ? 'var(--green-safe)' : pct >= 75 ? 'var(--amber)' : 'var(--red-alert)'
  const displaySafe     = daySafe
  const displayViolated = dayViolated
  const displayTotal    = displaySafe + displayViolated

  // peak stats
  const maxSafe       = trendData ? Math.max(...trendData.map(d => d.workers_active), 0) : 0
  const maxViolations = trendData ? Math.max(...trendData.map(d => d.violations),   0) : 0
  const maxSHour      = trendData?.find(d => d.workers_active === maxSafe)?.hour     || '--'
  const maxVHour      = trendData?.find(d => d.violations   === maxViolations)?.hour || '--'

  const cameraSlots = cameras.length > 0
    ? cameras.slice(0, 4)
    : [
        { id: 'CAM-A01', hls_url: '/hls/CAM-A01/stream.m3u8', ready: false },
        { id: 'CAM-A02', hls_url: '/hls/CAM-A02/stream.m3u8', ready: false },
        { id: 'CAM-A03', hls_url: '/hls/CAM-A03/stream.m3u8', ready: false },
        { id: 'CAM-A07', hls_url: '/hls/CAM-A07/stream.m3u8', ready: false },
      ]

  return (
    <div className="screen active" id="screen-safety-dashboard">

      {/* ── DATE BAR ── */}
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing data for:</span>
        <input
          type="date"
          className="date-picker"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
        />
        <span className="date-bar-hint">← change date to update all stats</span>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon">👷</div>
          <div className="stat-label">Workers Safe On-Site</div>
          <div className="stat-value green">{displaySafe}</div>
          <div className="stat-delta">
            <span className="up">{displaySafe}</span> safe ·{' '}
            <span style={{ color: 'var(--red-alert)' }}>{displayViolated}</span> violated
          </div>
        </div>

        <div className="stat-card red">
          <div className="stat-icon">🚨</div>
          <div className="stat-label">Active Violations</div>
          <div className="stat-value red">{displayViolated}</div>
          <div className="stat-delta">
            <span className="down">{kpi.critical_alerts ?? 0}</span> critical ·{' '}
            {kpi.warning_alerts ?? 0} warnings
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-icon">🦺</div>
          <div className="stat-label">PPE Compliance</div>
          <div className="stat-value amber">{kpi.compliance_pct ?? 100}%</div>
          <div className="stat-delta">Shift average · All cameras</div>
        </div>

        <div className="stat-card blue">
          <div className="stat-icon">📹</div>
          <div className="stat-label">Camera Streams</div>
          <div className="stat-value blue">{cameras.filter(c => c.ready).length}</div>
          <div className="stat-delta">
            <span className="up">{cameras.filter(c => c.ready).length} Live</span> ·{' '}
            {cameras.filter(c => !c.ready).length} Starting
          </div>
        </div>
      </div>

      {/* ── CAMERA GRID + ALERTS ── */}
      <div className="grid-60-40" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">📹 Live Camera Grid</div>
            <div className="panel-actions">
              <button className="topbar-btn" style={{ padding: '4px 8px', fontSize: 11 }}>Grid 2×2</button>
              <button className="topbar-btn" style={{ padding: '4px 8px', fontSize: 11 }}>Fullscreen</button>
            </div>
          </div>
          <div className="panel-body">
            <div className="camera-grid">
              {cameraSlots.map(cam => (
                <CameraFeed key={cam.id} cam={cam} />
              ))}
            </div>
          </div>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div className="panel-title">🔔 Active Alerts</div>
            <div className="panel-subtitle">{unacked} unacknowledged</div>
          </div>
          <div className="panel-body" style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
            {visibleAlerts.length === 0 ? (
              <div className="text-xs text-muted" style={{ padding: '12px 0' }}>
                No active alerts — waiting for live data…
              </div>
            ) : (
              <div className="alert-feed">
                {visibleAlerts.map(a => (
                  <div
                    key={a._id}
                    className={`alert-item ${
                      a.severity === 'critical' ? 'critical' :
                      a.severity === 'warning'  ? 'warning'  : 'info'
                    }`}
                  >
                    <div className="alert-dot" />
                    <div className="alert-content">
                      <div className="alert-type">
                        {a.severity?.toUpperCase()} — {a.type?.replace('_', ' ')}
                      </div>
                      <div className="alert-msg">{a.message}</div>
                      <div className="alert-meta">
                        📹 {a.camera} · Worker {a.worker_id} ·{' '}
                        {new Date(a.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <button
                      className="alert-ack"
                      style={{ color: 'var(--green-safe)', borderColor: 'rgba(34,197,94,0.3)' }}
                      onClick={() => ackAlert(a._id)}
                    >
                      ✓ ACK
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── HOURLY TREND CHART ── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">📈 Total Workers vs Violations — Hourly Trend</div>
          <div className="panel-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

            {/* ── Inline legend ── */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{ display: 'inline-block', width: 22, height: 3, background: '#22c55e', borderRadius: 2 }} />
                Total Workers
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{
                  display: 'inline-block', width: 22, height: 3, borderRadius: 2,
                  background: 'repeating-linear-gradient(90deg,#e53e3e 0 5px,transparent 5px 9px)',
                }} />
                Violations
              </span>
            </div>

            <select
              value={selectedShift}
              onChange={e => setSelectedShift(e.target.value)}
              style={{
                background:   'var(--bg-panel)',
                color:        'var(--text-primary)',
                border:       '1px solid var(--border)',
                borderRadius: 4,
                padding:      '3px 8px',
                fontSize:     12,
                cursor:       'pointer',
              }}
            >
              <option value="day">☀️ Day Shift (06:00–18:00)</option>
              <option value="night">🌙 Night Shift (18:00–06:00)</option>
            </select>
            <div className="panel-subtitle" style={{ margin: 0 }}>
              {selectedShift === 'day' ? 'Day' : 'Night'} Shift · {selectedDate}
            </div>
          </div>
        </div>

        <div className="panel-body">

          {/* Peak stats bar */}
          {trendData && trendData.length > 0 && (
            <div style={{
              display:      'flex',
              gap:          16,
              marginBottom: 12,
              padding:      '8px 12px',
              background:   'var(--bg-base)',
              borderRadius: 6,
              fontSize:     12,
              flexWrap:     'wrap',
            }}>
              <span style={{ color: 'var(--green-safe)' }}>
                👷 Peak Total Workers: <strong>{maxSafe}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>@ {maxSHour}</span>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: 'var(--red-alert)' }}>
                🚨 Peak Violations: <strong>{maxViolations}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>@ {maxVHour}</span>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: 'var(--text-muted)' }}>
                Total Workers: <strong>{trendData.reduce((s, d) => s + d.workers_active, 0)}</strong>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: 'var(--text-muted)' }}>
                Total Violations: <strong>{trendData.reduce((s, d) => s + d.violations, 0)}</strong>
              </span>
            </div>
          )}

          <div style={{ position: 'relative', height: 220, width: '100%' }}>
            <canvas
              ref={chartRef}
              style={{
                position: 'absolute', inset: 0,
                width:    '100%',     height: '100%',
                opacity:  trendData && trendData.length > 0 ? 1 : 0,
              }}
            />
            {(!trendData || trendData.length === 0) && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No data for {selectedShift === 'day' ? 'Day' : 'Night'} Shift · {selectedDate}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PPE COMPLIANCE SUMMARY ── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🦺 PPE Compliance — Shift Summary</div>
          <div className="panel-subtitle">Helmet &amp; Vest · {selectedDate}</div>
        </div>
        <div className="panel-body">
          <div className="grid-3">

            <div>
              <div className="text-xs text-muted text-mono mb-8">VIOLATION BREAKDOWN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'No Helmet', pct: Math.round(100 - (compliance.helmet || 0)), color: 'var(--red-alert)' },
                  { label: 'No Vest',   pct: Math.round(100 - (compliance.vest   || 0)), color: 'var(--amber)'     },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 110, fontSize: 12 }}>{item.label}</div>
                    <div style={{ flex: 1, background: 'var(--bg-base)', borderRadius: 3, height: 8 }}>
                      <div style={{
                        width:        `${item.pct}%`,
                        height:       '100%',
                        background:   item.color,
                        borderRadius: 3,
                        transition:   'width 0.4s',
                      }} />
                    </div>
                    <div className="text-mono text-xs" style={{ color: item.color, width: 34 }}>
                      {item.pct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted text-mono mb-8">PPE ITEM COMPLIANCE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                {[
                  { key: 'Helmet', pct: compliance.helmet ?? 0 },
                  { key: 'Vest',   pct: compliance.vest   ?? 0 },
                ].map(({ key, pct }) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{key}</span>
                      <span style={{ color: compColor(pct), fontFamily: 'var(--font-mono)' }}>{pct}%</span>
                    </div>
                    <div style={{ background: 'var(--bg-base)', borderRadius: 3, height: 6 }}>
                      <div style={{
                        width:        `${pct}%`,
                        height:       '100%',
                        background:   compColor(pct),
                        borderRadius: 3,
                        transition:   'width 0.4s',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 6 }}>
                <div className="text-xs text-muted text-mono mb-8">WORKERS · {selectedDate}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--green-safe)' }}>✓ Safe: <strong>{displaySafe}</strong></span>
                  <span style={{ color: 'var(--red-alert)' }}>✗ Violated: <strong>{displayViolated}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>Total: <strong>{displayTotal}</strong></span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted text-mono mb-8">SHIFT TREND (VIOLATIONS)</div>
              <div className="sparkline-container">
                {(trendData || []).map((d, i) => {
                  const max = Math.max(...(trendData || []).map(x => x.violations), 1)
                  const h   = Math.round((d.violations / max) * 100)
                  return (
                    <div
                      key={i}
                      className="spark-bar"
                      title={`${d.hour} — ${d.violations} violations`}
                      style={{
                        height:     `${h || 5}%`,
                        background: h > 60 ? 'var(--red-alert)' : h > 30 ? 'var(--amber)' : 'var(--blue-vivid)',
                      }}
                    />
                  )
                })}
              </div>
              {(!trendData || trendData.length === 0) && (
                <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                  No trend data for {selectedDate}
                </div>
              )}
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                {selectedShift === 'day' ? '☀️ Day' : '🌙 Night'} Shift violations · {selectedDate}
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}
