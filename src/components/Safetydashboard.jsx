import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import { getCameras } from '../api'
import LocationCameraPanel from './LocationCameraPanel'

Chart.register(...registerables)

// ── Camera ID → Friendly name map ─────────────────────────────────────────────
const CAMERA_NAME_MAP = {
  'Pier_Cap_Cam_16389': 'Bangalore (CAM-A01)',
  'Pier_Cap_Cam_16388': 'Hyderabad (CAM-A02)',
  'Pier_Cap_Cam_16387': 'Chennai L1 (CAM-A03)',
  'Pier_Cap_Cam_16386': 'Chennai L2 (CAM-A07)',
  'CAM-A01': 'Bangalore',
  'CAM-A02': 'Hyderabad',
  'CAM-A03': 'Chennai Location 1',
  'CAM-A07': 'Chennai Location 2',
}

function friendlyCamera(raw) {
  if (!raw) return '—'
  return CAMERA_NAME_MAP[raw] || raw
}

function timeAgo(ts) {
  if (!ts) return '—'
  const cleaned = typeof ts === 'string' ? ts.replace(' IST', '').trim() : ts
  const diff    = Math.floor((Date.now() - new Date(cleaned).getTime()) / 1000)
  if (isNaN(diff))  return '—'
  if (diff < 10)    return 'Just now'
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function alertTypeLabel(a) {
  const missing    = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
  const helmetMiss = missing.includes('helmet')
  const vestMiss   = missing.includes('vest')
  if (helmetMiss && vestMiss) return 'CRITICAL — helmet & vest missing'
  if (helmetMiss)             return 'WARNING — helmet missing'
  if (vestMiss)               return 'WARNING — vest missing'
  return 'WARNING — ppe violation'
}

function severityClass(a) {
  const missing = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
  if (missing.includes('helmet') && missing.includes('vest')) return 'critical'
  if (missing.includes('helmet') || missing.includes('vest')) return 'warning'
  return 'info'
}

export default function SafetyDashboard({ selectedDate, onDateChange, alerts, kpi }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  const [cameras,       setCameras]       = useState([])
  const [compliance,    setCompliance]    = useState({ helmet: 0, vest: 0 })
  const [trendData,     setTrendData]     = useState(null)
  const [minuteData,    setMinuteData]    = useState([])
  const [ackedIds,      setAckedIds]      = useState(new Set())
  const [selectedShift, setSelectedShift] = useState('day')
  const [daySafe,       setDaySafe]       = useState(0)
  const [dayViolated,   setDayViolated]   = useState(0)
  const [isLoading,     setIsLoading]     = useState(false)
  const [viewMode,      setViewMode]      = useState('hourly')

  // ── NEW: latest violations for Active Alerts panel ─────────────────────────
  const [recentViolations, setRecentViolations] = useState([])

  const fetchRecentViolations = useCallback(() => {
    fetch(`/api/ppe-violations?date=${selectedDate}&limit=500`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (!Array.isArray(data)) return
        // unacknowledged only, sorted newest first, top 10
        const unacked = data
          .filter(v => !v.acknowledged)
          .sort((a, b) => {
            const ta = new Date((a.timestamp || a.detected_at || '').replace(' IST', ''))
            const tb = new Date((b.timestamp || b.detected_at || '').replace(' IST', ''))
            return tb - ta
          })
          .slice(0, 10)
        setRecentViolations(unacked)
      })
      .catch(() => {})
  }, [selectedDate])

  useEffect(() => {
    fetchRecentViolations()
    const id = setInterval(fetchRecentViolations, 15_000)
    return () => clearInterval(id)
  }, [fetchRecentViolations])

  // ── fetch hourly trend + minute trend + compliance in parallel ─────────────
  useEffect(() => {
    setTrendData(null)
    setMinuteData([])
    setIsLoading(true)

    const params = new URLSearchParams({ date: selectedDate, shift: selectedShift })

    Promise.all([
      fetch(`/api/hourly-trend?${params}`)
        .then(r => r.ok ? r.json() : []),

      fetch(`/api/minute-trend?${params}`)
        .then(r => r.ok ? r.json() : []),

      fetch(`/api/ppe-compliance-summary?date=${selectedDate}`)
        .then(r => r.ok ? r.json() : {}),
    ])
      .then(([trendRaw, minuteRaw, complianceRaw]) => {
        const safe = Array.isArray(trendRaw) ? trendRaw : []
        setTrendData(safe)
        setMinuteData(Array.isArray(minuteRaw) ? minuteRaw : [])

        if (safe.length > 0) {
          setDaySafe(safe.reduce((s, d) => s + (d.workers_active || 0), 0))
          setDayViolated(safe.reduce((s, d) => s + (d.violations || 0), 0))
        } else {
          setDaySafe(0)
          setDayViolated(0)
        }
        setCompliance({
          helmet: complianceRaw.helmet ?? 0,
          vest:   complianceRaw.vest   ?? 0,
        })
        setIsLoading(false)
      })
      .catch(err => {
        console.error('[SafetyDashboard] fetch error:', err)
        setTrendData([])
        setMinuteData([])
        setIsLoading(false)
      })
  }, [selectedDate, selectedShift])

  // ── camera polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => getCameras().then(setCameras).catch(() => {})
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  // ── chart ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }

    const isMinuteMode = viewMode === 'minute'

    let chartLabels, workersData, violationsData

    if (isMinuteMode) {
      if (!minuteData || minuteData.length === 0) return

      chartLabels    = minuteData.map(d => d.minute)
      workersData    = minuteData.map(d => d.workers_active)
      violationsData = minuteData.map(d => d.violations)
    } else {
      if (!trendData || trendData.length === 0) return

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
      chartLabels    = chartData.map(d => d.hour)
      workersData    = chartData.map(d => d.workers_active)
      violationsData = chartData.map(d => d.violations)
    }

    const ctx = chartRef.current.getContext('2d')
    chartInst.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label:                'Total Workers',
            data:                 workersData,
            borderColor:          '#22c55e',
            backgroundColor:      'rgba(34,197,94,0.10)',
            fill:                 true,
            tension:              0.4,
            pointRadius:          isMinuteMode ? 0 : 4,
            pointHoverRadius:     isMinuteMode ? 4 : 5,
            pointBackgroundColor: '#22c55e',
            borderWidth:          2.5,
          },
          {
            label:                'Violations',
            data:                 violationsData,
            borderColor:          '#e53e3e',
            backgroundColor:      'rgba(229,62,62,0.08)',
            fill:                 true,
            tension:              0.4,
            pointRadius:          isMinuteMode ? 0 : 4,
            pointHoverRadius:     isMinuteMode ? 4 : 5,
            pointBackgroundColor: '#e53e3e',
            borderWidth:          2.5,
            borderDash:           [5, 3],
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items.length) return ''
                const label = items[0].label
                if (isMinuteMode) return label
                const hour = parseInt(label.split(':')[0])
                const next = String(hour + 1).padStart(2, '0')
                return `${label} – ${next}:00`
              },
              label: (ctx) => {
                const val    = Math.round(ctx.parsed.y)
                const suffix = ctx.dataset.label === 'Violations' ? ' violations' : ' workers'
                return ` ${ctx.dataset.label}: ${val}${suffix}`
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color:       '#5a6a82',
              maxRotation: 45,
              callback: isMinuteMode
                ? function(_, index) {
                    const lbl = chartLabels[index]
                    return lbl && lbl.endsWith(':00') ? lbl : null
                  }
                : undefined,
              autoSkip: !isMinuteMode,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#a0aec0',
              font:  { size: 11 },
              callback: (val) => Number.isInteger(val) ? val : null,
            },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: {
              display: true,
              text:    isMinuteMode ? 'count (per minute, real data)' : 'count (max per hour)',
              color:   '#5a6a82',
              font:    { size: 11 },
            },
          },
        },
      },
    })

    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    }
  }, [trendData, minuteData, viewMode])

  // ── helpers ────────────────────────────────────────────────────────────────
  const ackAlert      = (id) => setAckedIds(prev => new Set([...prev, id]))
  const visibleAlerts = (alerts || []).filter(a =>
    !ackedIds.has(a._id) && a.timestamp?.startsWith(selectedDate)
  )
  const unacked           = recentViolations.length
  const compColor         = (pct) => pct >= 90 ? 'var(--green-safe)' : pct >= 75 ? 'var(--amber)' : 'var(--red-alert)'
  const displaySafe       = daySafe
  const displayViolated   = dayViolated
  const displayTotal      = displaySafe + displayViolated
  const isToday           = selectedDate === new Date().toISOString().split('T')[0]
  const displayCompliance = displayTotal > 0
    ? Math.round((displaySafe / displayTotal) * 100)
    : null

  const maxSafe       = trendData ? Math.max(...trendData.map(d => d.workers_active), 0) : 0
  const maxViolations = trendData ? Math.max(...trendData.map(d => d.violations),     0) : 0
  const maxSHour      = trendData?.find(d => d.workers_active === maxSafe)?.hour     || '--'
  const maxVHour      = trendData?.find(d => d.violations     === maxViolations)?.hour || '--'

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

      {/* 1. CAMERAS */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">📹 Live Camera Grid</div>
        </div>
        <div className="panel-body">
          <LocationCameraPanel cameras={cameras} />
        </div>
      </div>

      {/* 2. DATE BAR */}
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing data for:</span>
        <input
          type="date"
          className="date-picker"
          value={selectedDate}
          onChange={e => onDateChange(e.target.value)}
        />
        <span className="date-bar-hint">← change date to update all stats</span>
      </div>

      {/* 3. KPI CARDS + ACTIVE ALERTS */}
      <div className="grid-60-40" style={{ marginBottom: 16 }}>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <div className="stat-card green">
            <div className="stat-icon">👷</div>
            <div className="stat-label">Workers Safe On-Site</div>
            <div className="stat-value green">{isLoading ? '…' : displaySafe}</div>
            <div className="stat-delta">
              <span className="up">{displaySafe}</span> safe ·{' '}
              <span style={{ color: 'var(--red-alert)' }}>{displayViolated}</span> violated
            </div>
          </div>

          <div className="stat-card red">
            <div className="stat-icon">🚨</div>
            <div className="stat-label">Max Violations</div>
            <div className="stat-value red">{isLoading ? '…' : displayViolated}</div>
            <div className="stat-delta"></div>
          </div>

          <div className="stat-card amber">
            <div className="stat-icon">🦺</div>
            <div className="stat-label">PPE Compliance</div>
            <div className="stat-value amber">
              {isLoading ? '…' : displayCompliance !== null ? `${displayCompliance}%` : '—'}
            </div>
            <div className="stat-delta">Shift average · All cameras</div>
          </div>

          <div className="stat-card red">
            <div className="stat-icon">⚠️</div>
            <div className="stat-label">PPE Violations</div>
            <div className="stat-value red">
              {isLoading ? '…' : displayCompliance !== null ? `${100 - displayCompliance}%` : '—'}
            </div>
            <div className="stat-delta">workers without full PPE</div>
          </div>
        </div>

        {/* ── Active Alerts — now pulls from recentViolations ── */}
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-header">
            <div className="panel-title">🔔 Active Alerts</div>
            <div className="panel-subtitle">{unacked} Alerts</div>
          </div>
          <div className="panel-body" style={{ overflowY: 'auto', maxHeight: 300 }}>
            {recentViolations.length === 0 ? (
              <div className="text-xs text-muted" style={{ padding: '12px 0' }}>
                No active alerts — waiting for live data…
              </div>
            ) : (
              <div className="alert-feed">
                {recentViolations.map(a => {
                  const missing  = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
                  const helmetOk = !missing.includes('helmet')
                  const vestOk   = !missing.includes('vest')
                  return (
                    <div
                      key={a._id}
                      className={`alert-item ${severityClass(a)}`}
                    >
                      <div className="alert-dot" />
                      <div className="alert-content" style={{ minWidth: 0 }}>
                        <div className="alert-type" style={{ fontSize: 12, fontWeight: 700 }}>
                          {alertTypeLabel(a)}
                        </div>
                        <div className="alert-msg" style={{ fontSize: 13 }}>
                          Worker <strong>{a.worker_id || 'Unknown'}</strong>
                          {a.collage_num && (
                            <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '1px 5px', borderRadius: 3 }}>
                              C{a.collage_num}
                            </span>
                          )}
                          {' — '}
                          <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`} style={{ fontSize: 11, padding: '2px 7px' }}>
                            🪖 {helmetOk ? '✓ Helmet OK' : '✗ Missing'}
                          </span>
                          {' '}
                          <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`} style={{ fontSize: 11, padding: '2px 7px' }}>
                            🦺 {vestOk ? '✓ Vest OK' : '✗ Missing'}
                          </span>
                        </div>
                        <div className="alert-meta" style={{ fontSize: 11 }}>
                          📹 {friendlyCamera(a.camera || a.zone)}
                          {' · '}
                          {timeAgo(a.timestamp || a.detected_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
      {/* end grid-60-40 */}

      {/* 4. TREND CHART */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">
            📈 Total Workers vs Violations —{' '}
            {viewMode === 'minute' ? 'Per-Minute Trend' : 'Hourly Trend'}
          </div>
          <div className="panel-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{ display: 'inline-block', width: 22, height: 3, background: '#22c55e', borderRadius: 2 }} />
                Total Workers
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{
                  display:    'inline-block',
                  width:      22,
                  height:     3,
                  borderRadius: 2,
                  background: 'repeating-linear-gradient(90deg,#e53e3e 0 5px,transparent 5px 9px)',
                }} />
                Violations
              </span>
            </div>

            {/* Hourly / Per-Minute toggle */}
            <div style={{
              display:      'flex',
              border:       '1px solid var(--border)',
              borderRadius: 4,
              overflow:     'hidden',
              fontSize:     12,
            }}>
              {['hourly', 'minute'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding:    '3px 10px',
                    border:     'none',
                    cursor:     'pointer',
                    fontSize:   12,
                    background: viewMode === mode ? 'var(--blue-vivid)' : 'var(--bg-panel)',
                    color:      viewMode === mode ? '#fff' : 'var(--text-muted)',
                    transition: 'background 0.15s',
                  }}
                >
                  {mode === 'hourly' ? '⏱ Hourly' : '🕐 Per Minute'}
                </button>
              ))}
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
              {viewMode === 'minute' && minuteData.length > 0 && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                  <span style={{ color: 'var(--green-safe)', fontStyle: 'italic' }}>
                    ✅ Real data — {minuteData.length} minute readings from DB
                  </span>
                </>
              )}
            </div>
          )}

          <div style={{ position: 'relative', height: 220, width: '100%' }}>
            <canvas
              ref={chartRef}
              style={{
                position: 'absolute',
                inset:    0,
                width:    '100%',
                height:   '100%',
                opacity:  (viewMode === 'hourly' ? trendData?.length > 0 : minuteData.length > 0) ? 1 : 0,
              }}
            />
            {isLoading && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                Loading data for {selectedDate}…
              </div>
            )}
            {!isLoading && viewMode === 'hourly' && (!trendData || trendData.length === 0) && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No data for {selectedShift === 'day' ? 'Day' : 'Night'} Shift · {selectedDate}
              </div>
            )}
            {!isLoading && viewMode === 'minute' && minuteData.length === 0 && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No per-minute data for {selectedShift === 'day' ? 'Day' : 'Night'} Shift · {selectedDate}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* end TREND CHART */}

      {/* 5. PPE COMPLIANCE SUMMARY */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🦺 PPE Compliance — Shift Summary</div>
          <div className="panel-subtitle">Helmet &amp; Vest · {selectedDate}</div>
        </div>
        <div className="panel-body">
          <div className="grid-3">

            {/* Violation Breakdown */}
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

            {/* PPE Item Compliance — BARS & TEXT CHANGED TO GREEN */}
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
                      <span style={{ color: '#4ade80', fontFamily: 'var(--font-mono)' }}>{pct}%</span>
                    </div>
                    <div style={{ background: 'var(--bg-base)', borderRadius: 3, height: 6 }}>
                      <div style={{
                        width:        `${pct}%`,
                        height:       '100%',
                        background:   '#4ade80',
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

            {/* Shift Trend Sparkline */}
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
                  {isLoading ? 'Loading…' : `No trend data for ${selectedDate}`}
                </div>
              )}
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                {selectedShift === 'day' ? '☀️ Day' : '🌙 Night'} Shift violations · {selectedDate}
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* end PPE COMPLIANCE SUMMARY */}

    </div>
  )
}
