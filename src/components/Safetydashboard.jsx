import { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { getCameras } from '../api'
import LocationCameraPanel from './LocationCameraPanel'
import StatCardsPanel from './StatCardsPanel'

Chart.register(...registerables)

export default function SafetyDashboard({ selectedDate, onDateChange, alerts, kpi }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  const [cameras,       setCameras]       = useState([])
  const [compliance,    setCompliance]    = useState({ helmet: 0, vest: 0 })
  const [trendData,     setTrendData]     = useState(null)
  const [minuteData,    setMinuteData]    = useState([])
  const [extTrendData,  setExtTrendData]  = useState(null)
  const [ackedIds,      setAckedIds]      = useState(new Set())
  const [selectedShift, setSelectedShift] = useState('day')
  const [daySafe,       setDaySafe]       = useState(0)
  const [dayViolated,   setDayViolated]   = useState(0)
  const [isLoading,     setIsLoading]     = useState(false)
  const [viewMode,      setViewMode]      = useState('hourly')
  const [viewBy,        setViewBy]        = useState('date')

  const [safeWorkers7day, setSafeWorkers7day] = useState([])
  const [shiftSafe,       setShiftSafe]       = useState({ morning: 0, afternoon: 0, night: 0 })
  const [cameraSafe,      setCameraSafe]      = useState([])

  // ── fetch trend data ───────────────────────────────────────────────────────
  useEffect(() => {
    setTrendData(null)
    setMinuteData([])
    setExtTrendData(null)
    setIsLoading(true)

    const params = new URLSearchParams({ date: selectedDate, shift: selectedShift })

    const baseRequests = [
      fetch(`/api/hourly-trend?${params}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/minute-trend?${params}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ppe-compliance-summary?date=${selectedDate}`).then(r => r.ok ? r.json() : {}),
      fetch(`/api/safe-workers-7day?date=${selectedDate}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/shift-safe-summary?date=${selectedDate}`).then(r => r.ok ? r.json() : {}),
      fetch(`/api/camera-safe-summary?date=${selectedDate}`).then(r => r.ok ? r.json() : []),
    ]

    const extRequest = viewBy !== 'date'
      ? fetch(`/api/violations-trend?mode=${viewBy}&shift=${selectedShift}&date=${selectedDate}`)
          .then(r => r.ok ? r.json() : null)
      : Promise.resolve(null)

    Promise.all([...baseRequests, extRequest])
      .then(([trendRaw, minuteRaw, complianceRaw, safeRaw, shiftRaw, cameraRaw, extRaw]) => {
        const safe = Array.isArray(trendRaw) ? trendRaw : []
        setTrendData(safe)
        setMinuteData(Array.isArray(minuteRaw) ? minuteRaw : [])
        setExtTrendData(extRaw)

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
        setSafeWorkers7day(Array.isArray(safeRaw)   ? safeRaw  : [])
        setShiftSafe(shiftRaw || { morning: 0, afternoon: 0, night: 0 })
        setCameraSafe(Array.isArray(cameraRaw) ? cameraRaw : [])
        setIsLoading(false)
      })
      .catch(err => {
        console.error('[SafetyDashboard] fetch error:', err)
        setTrendData([])
        setMinuteData([])
        setExtTrendData(null)
        setSafeWorkers7day([])
        setShiftSafe({ morning: 0, afternoon: 0, night: 0 })
        setCameraSafe([])
        setIsLoading(false)
      })
  }, [selectedDate, selectedShift, viewBy])

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

    let chartLabels, workersData, violationsData
    let chartType = 'line'
    const isMinuteMode = viewMode === 'minute'

    if (viewBy === 'month' || viewBy === 'year') {
      chartType = 'line'
      if (!extTrendData || !extTrendData.labels?.length) return
      chartLabels    = extTrendData.labels
      violationsData = extTrendData.critical?.map((c, i) => c + (extTrendData.warning?.[i] || 0)) || []
      workersData    = extTrendData.workers || violationsData.map(() => 0)
    } else if (isMinuteMode) {
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

    const isBarMode = chartType === 'bar'
    const ctx = chartRef.current.getContext('2d')
    chartInst.current = new Chart(ctx, {
      type: chartType,
      data: {
        labels: chartLabels,
        datasets: [
          {
            label:                'Total Workers',
            data:                 workersData,
            borderColor:          '#22c55e',
            backgroundColor:      isBarMode ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,0.10)',
            fill:                 !isBarMode,
            tension:              0.4,
            pointRadius:          isMinuteMode ? 0 : (isBarMode ? undefined : 4),
            pointHoverRadius:     isMinuteMode ? 4 : 5,
            pointBackgroundColor: '#22c55e',
            borderWidth:          isBarMode ? 0 : 2.5,
            borderRadius:         isBarMode ? 3 : undefined,
            order:                2,
          },
          {
            label:                'Violations',
            data:                 violationsData,
            borderColor:          '#e53e3e',
            backgroundColor:      isBarMode ? 'rgba(229,62,62,0.8)' : 'rgba(229,62,62,0.08)',
            fill:                 !isBarMode,
            tension:              0.4,
            pointRadius:          isMinuteMode ? 0 : (isBarMode ? undefined : 4),
            pointHoverRadius:     isMinuteMode ? 4 : 5,
            pointBackgroundColor: '#e53e3e',
            borderWidth:          isBarMode ? 0 : 2.5,
            borderDash:           isBarMode ? undefined : [5, 3],
            borderRadius:         isBarMode ? 3 : undefined,
            order:                3,
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
                if (isMinuteMode || isBarMode) return label
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
              text: isBarMode
                ? `violations · ${viewBy === 'month' ? 'daily' : 'monthly'}`
                : isMinuteMode ? 'count (per minute, real data)' : 'count (max per hour)',
              color: '#5a6a82',
              font:  { size: 11 },
            },
          },
        },
      },
    })

    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    }
  }, [trendData, minuteData, extTrendData, viewMode, viewBy])

  // ── helpers ────────────────────────────────────────────────────────────────
  const ackAlert      = (id) => setAckedIds(prev => new Set([...prev, id]))
  const visibleAlerts = (alerts || []).filter(a =>
    !ackedIds.has(a._id) && a.timestamp?.startsWith(selectedDate)
  )
  const unacked           = visibleAlerts.length
  const displaySafe       = daySafe
  const displayViolated   = dayViolated
  const displayTotal      = displaySafe + displayViolated
  const displayCompliance = displayTotal > 0
    ? Math.round((displaySafe / displayTotal) * 100)
    : null

  const maxSafe       = trendData ? Math.max(...trendData.map(d => d.workers_active), 0) : 0
  const maxViolations = trendData ? Math.max(...trendData.map(d => d.violations),     0) : 0
  const maxSHour      = trendData?.find(d => d.workers_active === maxSafe)?.hour     || '--'
  const maxVHour      = trendData?.find(d => d.violations     === maxViolations)?.hour || '--'

  const todaySafe  = safeWorkers7day.find(d => d.date === selectedDate)?.safe_count ?? 0
  const todayViols = safeWorkers7day.find(d => d.date === selectedDate)?.violations ?? 0

  const chartTitle = viewBy === 'month'
    ? `📈 Violations — Daily Trend · ${selectedDate.slice(0, 7)}`
    : viewBy === 'year'
    ? `📈 Violations — Monthly Trend · ${selectedDate.slice(0, 4)}`
    : `📈 Total Workers vs Violations — ${viewMode === 'minute' ? 'Per-Minute Trend' : 'Hourly Trend'}`

  const shiftLabel  = selectedShift === 'day' ? 'Day' : selectedShift === 'night' ? 'Night' : 'All'
  const viewByLabel = viewBy === 'date' ? 'Daily' : viewBy === 'month' ? 'Monthly' : 'Yearly'

  const canvasVisible = viewBy !== 'date'
    ? extTrendData?.labels?.length > 0
    : viewMode === 'hourly' ? trendData?.length > 0 : minuteData.length > 0

  const maxShiftVal = Math.max(shiftSafe.morning, shiftSafe.afternoon, shiftSafe.night, 1)

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

      {/* 3. STAT CARDS PANEL — 2x2 small + tall alerts/detail panel */}
      <StatCardsPanel
        isLoading={isLoading}
        todaySafe={todaySafe}
        todayViols={todayViols}
        displaySafe={displaySafe}
        displayViolated={displayViolated}
        displayTotal={displayTotal}
        displayCompliance={displayCompliance}
        maxViolations={maxViolations}
        maxVHour={maxVHour}
        compliance={compliance}
        safeWorkers7day={safeWorkers7day}
        shiftSafe={shiftSafe}
        cameraSafe={cameraSafe}
        trendData={trendData}
        visibleAlerts={visibleAlerts}
        ackAlert={ackAlert}
        selectedDate={selectedDate}
      />

      {/* 4. TREND CHART */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">{chartTitle}</div>

          <div className="panel-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{ display: 'inline-block', width: 22, height: 3, background: '#22c55e', borderRadius: 2 }} />
                Total Workers
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{
                  display:      'inline-block',
                  width:        22,
                  height:       3,
                  borderRadius: 2,
                  background:   'repeating-linear-gradient(90deg,#e53e3e 0 5px,transparent 5px 9px)',
                }} />
                Violations
              </span>
            </div>

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
              value={viewBy}
              onChange={e => {
                setViewBy(e.target.value)
                setViewMode('hourly')
                setSelectedShift('day')
              }}
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
              <option value="date"  style={{ background: '#1a2236', color: '#e2e8f0' }}>📅 By Date (Daily)</option>
              <option value="month" style={{ background: '#1a2236', color: '#e2e8f0' }}>📆 By Month</option>
              <option value="year"  style={{ background: '#1a2236', color: '#e2e8f0' }}>📊 By Year</option>
            </select>

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
              <option value="day"   style={{ background: '#1a2236', color: '#e2e8f0' }}>☀️ Day Shift (06:00–18:00)</option>
              <option value="night" style={{ background: '#1a2236', color: '#e2e8f0' }}>🌙 Night Shift (18:00–06:00)</option>
              <option value="both"  style={{ background: '#1a2236', color: '#e2e8f0' }}>🔄 Both Shifts</option>
            </select>

            <div className="panel-subtitle" style={{ margin: 0 }}>
              {viewByLabel} · {shiftLabel} Shift · {selectedDate}
            </div>

          </div>
        </div>

        <div className="panel-body">
          {viewBy === 'date' && trendData && trendData.length > 0 && (
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

          {viewBy !== 'date' && extTrendData && (
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
              <span style={{ color: 'var(--red-alert)' }}>
                🚨 Total Violations: <strong>
                  {(extTrendData.critical || []).reduce((s, v, i) => s + v + (extTrendData.warning?.[i] || 0), 0)}
                </strong>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: '#e53e3e' }}>
                Critical: <strong>{(extTrendData.critical || []).reduce((s, v) => s + v, 0)}</strong>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: '#f59e0b' }}>
                Warning: <strong>{(extTrendData.warning || []).reduce((s, v) => s + v, 0)}</strong>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                📊 {viewBy === 'month' ? `${selectedDate.slice(0, 7)} daily breakdown` : `${selectedDate.slice(0, 4)} monthly breakdown`}
              </span>
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
                opacity:  canvasVisible ? 1 : 0,
              }}
            />
            {isLoading && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                Loading data for {selectedDate}…
              </div>
            )}
            {!isLoading && viewBy === 'date' && viewMode === 'hourly' && (!trendData || trendData.length === 0) && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No data for {shiftLabel} Shift · {selectedDate}
              </div>
            )}
            {!isLoading && viewBy === 'date' && viewMode === 'minute' && minuteData.length === 0 && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No per-minute data for {shiftLabel} Shift · {selectedDate}
              </div>
            )}
            {!isLoading && viewBy !== 'date' && (!extTrendData || !extTrendData.labels?.length) && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No {viewBy === 'month' ? 'monthly' : 'yearly'} data available · {shiftLabel} Shift
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. PPE COMPLIANCE SUMMARY */}
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
                {selectedShift === 'day' ? '☀️ Day' : selectedShift === 'night' ? '🌙 Night' : '🔄 All'} Shift violations · {selectedDate}
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}
