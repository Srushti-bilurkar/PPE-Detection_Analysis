import { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { getCameras } from '../api'
import LocationCameraPanel from './LocationCameraPanel'

Chart.register(...registerables)

export default function SafetyDashboard({ selectedDate, onDateChange, alerts, kpi }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  const [cameras,       setCameras]       = useState([])
  const [compliance,    setCompliance]    = useState({ helmet: 0, vest: 0 })
  const [trendData,     setTrendData]     = useState(null)
  const [ackedIds,      setAckedIds]      = useState(new Set())
  const [selectedShift, setSelectedShift] = useState('day')
  const [daySafe,       setDaySafe]       = useState(0)
  const [dayViolated,   setDayViolated]   = useState(0)
  const [isLoading,     setIsLoading]     = useState(false)

  // ── fetch trend + compliance in parallel when date or shift changes ────────
  useEffect(() => {
    setTrendData(null)
    setIsLoading(true)

    const params = new URLSearchParams({ date: selectedDate, shift: selectedShift })

    Promise.all([
      fetch(`/api/hourly-trend?${params}`)
        .then(r => r.ok ? r.json() : []),
      fetch(`/api/ppe-compliance-summary?date=${selectedDate}`)
        .then(r => r.ok ? r.json() : {}),
    ])
      .then(([trendRaw, complianceRaw]) => {
        const safe = Array.isArray(trendRaw) ? trendRaw : []
        setTrendData(safe)
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
    if (!trendData || trendData.length === 0) return

    let chartData = trendData
    if (trendData.length === 1) {
      const hour     = trendData[0].hour.split(':')[0]
      const prevHour = `${String(Math.max(0,  parseInt(hour) - 1)).padStart(2, '0')}:00`
      const nextHour = `${String(Math.min(23, parseInt(hour) + 1)).padStart(2, '0')}:00`
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
          },
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
              // Show range in title e.g. "12:00 – 13:00" instead of just "12:00"
              title: (items) => {
                if (!items.length) return ''
                const label = items[0].label  // e.g. "12:00"
                const hour  = parseInt(label.split(':')[0])
                const next  = String(hour + 1).padStart(2, '0')
                return `${label} – ${next}:00`
              },
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
  const visibleAlerts = (alerts || []).filter(a =>
    !ackedIds.has(a._id) && a.timestamp?.startsWith(selectedDate)
  )
  const unacked           = visibleAlerts.length
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
    {/* 1. CAMERAS — responsive resizable grid */}
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

    {/* 3. KPI CARDS (left) + ACTIVE ALERTS (right) */}
    <div className="grid-60-40" style={{ marginBottom: 16 }}>

      {/* 4 KPI boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
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
          <div className="stat-label"> Max Violations</div>
          <div className="stat-value red">{isLoading ? '…' : displayViolated}</div>
          <div className="stat-delta"></div>
        </div>

        <div className="stat-card amber">
          <div className="stat-icon">🦺</div>
          <div className="stat-label">PPE Compliance</div>
          <div className="stat-value amber">{isLoading ? '…' : displayCompliance !== null ? `${displayCompliance}%` : '—'}</div>
          <div className="stat-delta">Shift average · All cameras</div>
        </div>
      </div>

      {/* Active alerts */}
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
                <div key={a._id} className={`alert-item ${
                  a.severity === 'critical' ? 'critical' :
                  a.severity === 'warning'  ? 'warning'  : 'info'
                }`}>
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
            {isLoading && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                Loading data for {selectedDate}…
              </div>
            )}
            {!isLoading && (!trendData || trendData.length === 0) && (
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

    </div>
  )
}
