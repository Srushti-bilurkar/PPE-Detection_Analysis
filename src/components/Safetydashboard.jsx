import { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { getCameras } from '../api'
import LocationCameraPanel from './LocationCameraPanel'
import StatCardsPanel from './StatCardsPanel'
import { CAMERA_LOCATIONS } from './UserContext'
Chart.register(...registerables)

// ── Mini Calendar ─────────────────────────────────────────────────────────
function MiniCalendar({ selectedDate, onSelect }) {
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const todayISO = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const selParts   = selectedDate.split('-').map(Number)
  const [viewYear,  setViewYear]  = useState(selParts[0])
  const [viewMonth, setViewMonth] = useState(selParts[1] - 1)
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayStr    = todayISO()
  const todayParts  = todayStr.split('-').map(Number)
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y=>y-1) } else setViewMonth(m=>m-1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y=>y+1) } else setViewMonth(m=>m+1) }
  const isFuture  = d => {
    const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return iso > todayStr
  }
  const pickDay = d => {
    if (isFuture(d)) return
    const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    onSelect(iso)
  }

  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 14px',
      width: 224,
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <button onClick={prevMonth} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18, padding:'0 6px' }}>‹</button>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:18, padding:'0 6px' }}>›</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:10, color:'var(--text-muted)', padding:'2px 0', fontWeight:600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((d,i) => {
          if (!d) return <div key={`e${i}`} />
          const isSel   = selParts[0]===viewYear && selParts[1]===viewMonth+1 && selParts[2]===d
          const isToday = todayParts[0]===viewYear && todayParts[1]===viewMonth+1 && todayParts[2]===d
          const fut     = isFuture(d)
          return (
            <div
              key={d}
              onClick={() => pickDay(d)}
              style={{
                textAlign:'center', fontSize:11, padding:'5px 2px', borderRadius:5,
                cursor: fut ? 'not-allowed' : 'pointer',
                background: isSel ? '#7c3aed' : isToday ? 'rgba(124,58,237,0.18)' : 'transparent',
                color: fut ? 'var(--text-muted)' : isSel ? '#fff' : isToday ? '#7c3aed' : 'var(--text-primary)',
                fontWeight: isSel||isToday ? 700 : 400,
                border: isToday&&!isSel ? '1px solid rgba(124,58,237,0.5)' : '1px solid transparent',
                opacity: fut ? 0.4 : 1,
              }}
            >{d}</div>
          )
        })}
      </div>
    </div>
  )
}

// ── Derive a clean human-readable location name from a camera object ───────
function getCameraLocationLabel(cam) {
  if (!cam) return null
  if (cam.location)           return cam.location
  if (cam.label)              return cam.label
  const id = cam.id || ''
  if (id.includes('HYD'))     return 'Hyderabad'
  if (id.includes('BLR'))     return 'Bangalore'
  if (id.includes('CHN'))     return 'Chennai'
  return null
}

// ── Parse a timestamp string flexibly (handles IST suffix, spaces, etc.) ──
function parseAlertTimestamp(ts) {
  if (!ts) return null
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts
  const cleaned = String(ts)
    .replace(' IST', '')
    .replace(' ', 'T')
    .trim()
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? null : d
}

export default function SafetyDashboard({ selectedDate, onDateChange, alerts, kpi }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  const [cameras,          setCameras]          = useState([])
  const [compliance,       setCompliance]       = useState({ helmet: 0, vest: 0 })
  const [trendData,        setTrendData]        = useState(null)
  const [minuteData,       setMinuteData]       = useState([])
  const [ackedIds,         setAckedIds]         = useState(new Set())
  const [selectedShift,    setSelectedShift]    = useState('day')
  const [daySafe,          setDaySafe]          = useState(0)
  const [dayViolated,      setDayViolated]      = useState(0)
  const [isLoading,        setIsLoading]        = useState(false)
  const [viewMode,         setViewMode]         = useState('hourly')
  const [calOpen,          setCalOpen]          = useState(false)
  const [chartCalOpen,     setChartCalOpen]     = useState(false)
  const [showTotal,        setShowTotal]        = useState(true)
  const [showSafe,         setShowSafe]         = useState(true)
  const [showViols,        setShowViols]        = useState(true)
  const [safeWorkers7day,  setSafeWorkers7day]  = useState([])
  const [shiftSafe,        setShiftSafe]        = useState({ morning: 0, afternoon: 0, night: 0 })
  const [cameraSafe,       setCameraSafe]       = useState([])

  // ── Camera / location filter state ────────────────────────────────────
  const [selectedCamera,   setSelectedCamera]   = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)

  const calRef      = useRef(null)
  const chartCalRef = useRef(null)

  // ── Close calendars on outside click ──────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (calRef.current      && !calRef.current.contains(e.target))      setCalOpen(false)
      if (chartCalRef.current && !chartCalRef.current.contains(e.target)) setChartCalOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── fetch trend data ───────────────────────────────────────────────────
  useEffect(() => {
    setTrendData(null)
    setMinuteData([])
    setIsLoading(true)

    const camId    = selectedCamera?.db_id || selectedCamera?.id || null
    const camParam = camId && !camId.includes(',') ? `&camera=${encodeURIComponent(camId)}` : ''
    const params   = new URLSearchParams({ date: selectedDate, shift: selectedShift })

    const requests = [
      fetch(`/api/hourly-trend?${params}${camParam}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/minute-trend?${params}${camParam}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ppe-compliance-summary?date=${selectedDate}${camParam}`).then(r => r.ok ? r.json() : {}),
      fetch(`/api/safe-workers-7day?date=${selectedDate}${camParam}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/shift-safe-summary?date=${selectedDate}${camParam}`).then(r => r.ok ? r.json() : {}),
      fetch(`/api/camera-safe-summary?date=${selectedDate}${camParam}`).then(r => r.ok ? r.json() : []),
    ]

    Promise.all(requests)
      .then(([trendRaw, minuteRaw, complianceRaw, safeRaw, shiftRaw, cameraRaw]) => {
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
        setCompliance({ helmet: complianceRaw.helmet ?? 0, vest: complianceRaw.vest ?? 0 })
        setSafeWorkers7day(Array.isArray(safeRaw)   ? safeRaw  : [])
        setShiftSafe(shiftRaw || { morning: 0, afternoon: 0, night: 0 })
        setCameraSafe(Array.isArray(cameraRaw) ? cameraRaw : [])
        setIsLoading(false)
      })
      .catch(err => {
        console.error('[SafetyDashboard] fetch error:', err)
        setTrendData([])
        setMinuteData([])
        setSafeWorkers7day([])
        setShiftSafe({ morning: 0, afternoon: 0, night: 0 })
        setCameraSafe([])
        setIsLoading(false)
      })
  }, [selectedDate, selectedShift, selectedCamera])

  // ── camera polling ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => getCameras().then(setCameras).catch(() => {})
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  // ── chart ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }

    let chartLabels, workersData, violationsData, totalData
    const isMinuteMode = viewMode === 'minute'

    if (isMinuteMode) {
      if (!minuteData || minuteData.length === 0) return
      chartLabels    = minuteData.map(d => d.minute)
      totalData      = minuteData.map(d => d.workers_active || 0)
      workersData    = minuteData.map(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0)))
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
      totalData      = chartData.map(d => d.workers_active || 0)
      workersData    = chartData.map(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0)))
      violationsData = chartData.map(d => d.violations)
    }

    const ctx      = chartRef.current.getContext('2d')
    const datasets = [
      showTotal && {
        label:                'Total workers',
        data:                 totalData,
        borderColor:          '#3b9eff',
        backgroundColor:      'rgba(59,158,255,0.05)',
        fill:                 true,
        tension:              0.4,
        pointRadius:          isMinuteMode ? 0 : 4,
        pointHoverRadius:     isMinuteMode ? 4 : 5,
        pointBackgroundColor: '#3b9eff',
        borderWidth:          2,
        order:                1,
      },
      showSafe && {
        label:                'Safe workers',
        data:                 workersData,
        borderColor:          '#22c55e',
        backgroundColor:      'rgba(34,197,94,0.10)',
        fill:                 true,
        tension:              0.4,
        pointRadius:          isMinuteMode ? 0 : 4,
        pointHoverRadius:     isMinuteMode ? 4 : 5,
        pointBackgroundColor: '#22c55e',
        borderWidth:          2.5,
        order:                2,
      },
      showViols && {
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
        order:                3,
      },
    ].filter(Boolean)

    chartInst.current = new Chart(ctx, {
      type: 'line',
      data: { labels: chartLabels, datasets },
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
                return `${String(hour).padStart(2, '0')}:00 – ${next}:00`
              },
              label: (ctx) => {
                const val    = Math.round(ctx.parsed.y)
                const suffix = ctx.dataset.label === 'Violations'     ? ' violations'
                             : ctx.dataset.label === 'Total workers'  ? ' total workers'
                             : ' safe workers'
                return ` ${ctx.dataset.label}: ${val}${suffix}`
              },
              afterBody: (items) => {
                if (!items.length || !showSafe || !showViols) return []
                const idx = items[0].dataIndex
                const s   = workersData[idx]    ?? 0
                const v   = violationsData[idx] ?? 0
                const tot = s + v
                const pct = tot > 0 ? Math.round(s / tot * 100) : 0
                return ['', ` Compliance: ${pct}%`]
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color:       '#5a6a82',
              maxRotation: 0,
              autoSkip:    false,
              font:        { size: 11 },
              callback: isMinuteMode
                ? function(_, index) {
                    const lbl = chartLabels[index]
                    if (!lbl) return null
                    const [h] = lbl.split(':')
                    const firstIdx = chartLabels.findIndex(l => l.startsWith(h + ':'))
                    return index === firstIdx ? h : null
                  }
                : function(_, index) {
                    const lbl = chartLabels[index]
                    if (!lbl) return null
                    return parseInt(lbl.split(':')[0])
                  },
            },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: 'Hour', color: '#5a6a82', font: { size: 11 } },
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
              text:    isMinuteMode ? 'count (per minute)' : 'count (peak per hour)',
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
  }, [trendData, minuteData, viewMode, showTotal, showSafe, showViols])

  // ── helpers ────────────────────────────────────────────────────────────
  const ackAlert = (id) => setAckedIds(prev => new Set([...prev, id]))

  // ── visibleAlerts: robust filter that works during streaming ──────────
  const visibleAlerts = (alerts || []).filter(a => {
    // Must have an id
    if (!a._id) return false
    // Must not be acknowledged locally
    if (ackedIds.has(a._id)) return false
    // Must have some form of timestamp
    const rawTs = a.timestamp || a.camera_ts_ist || a.camera_ts || a.created_at || a.time
    if (!rawTs) return false
    // Parse flexibly (handles IST suffix, spaces, etc.)
    const d = parseAlertTimestamp(rawTs)
    if (!d) return false
    // Match against selectedDate using local date parts to avoid UTC shift issues
    const year  = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day   = String(d.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    return dateStr === selectedDate
    // NOTE: isLoading guard intentionally removed — alerts must show during live streaming
  })

  // Sort by most recent first, take top 10 for the alerts panel
  const sortedAlerts = [...visibleAlerts].sort((a, b) => {
    const da = parseAlertTimestamp(a.timestamp || a.camera_ts_ist || a.camera_ts || a.created_at || '')
    const db = parseAlertTimestamp(b.timestamp || b.camera_ts_ist || b.camera_ts || b.created_at || '')
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return db.getTime() - da.getTime()
  })

  const displaySafe       = daySafe
  const displayViolated   = dayViolated
  const displayTotal      = displaySafe + displayViolated
  const displayCompliance = displayTotal > 0
    ? Math.round((displaySafe / displayTotal) * 100)
    : null

  const maxSafe       = trendData ? Math.max(...trendData.map(d => Math.max(0, (d.workers_active||0) - (d.violations||0))), 0) : 0
  const maxViolations = trendData ? Math.max(...trendData.map(d => d.violations), 0) : 0
  const maxSHour      = trendData?.find(d => Math.max(0,(d.workers_active||0)-(d.violations||0)) === maxSafe)?.hour || '--'
  const maxVHour      = trendData?.find(d => d.violations === maxViolations)?.hour || '--'

  const todaySafe  = safeWorkers7day.find(d => d.date === selectedDate)?.safe_count ?? 0
  const todayViols = safeWorkers7day.find(d => d.date === selectedDate)?.violations ?? 0

  const shiftLabel    = selectedShift === 'day' ? 'Day' : selectedShift === 'night' ? 'Night' : 'All'
  const canvasVisible = viewMode === 'hourly' ? (trendData?.length > 0) : (minuteData.length > 0)

  const scopeLabel = selectedLocation?.label
    || getCameraLocationLabel(selectedCamera)
    || null

  const chartTitle = `📈 Safe Workers vs Violations — ${viewMode === 'minute' ? 'Per-Minute' : 'Hourly'} Trend`

  // ── Handlers from LocationCameraPanel ─────────────────────────────────
  const handleCamSelect = (cam) => {
    if (!cam) {
      setSelectedCamera(null)
      setSelectedLocation(null)
      return
    }

    if (cam._isLocation) {
      const fullLoc = CAMERA_LOCATIONS.find(
        l => l.label === cam.name || l.id === cam.id
      ) || null

      if (fullLoc) {
        setSelectedLocation(fullLoc)
      } else {
        let found = null
        for (const loc of CAMERA_LOCATIONS) {
          if (loc.subLocations) {
            const sub = loc.subLocations.find(s => s.label === cam.name)
            if (sub) { found = sub; break }
          }
        }
        setSelectedLocation(found)
      }
      setSelectedCamera(null)
      return
    }

    if (!cam.id) {
      setSelectedCamera(null)
      setSelectedLocation(null)
      return
    }

    if (cam.db_id) {
      setSelectedCamera(cam)
      setSelectedLocation(null)
      return
    }

    let dbId = null
    for (const loc of CAMERA_LOCATIONS) {
      const allCams = [
        ...(loc.cameras || []),
        ...(loc.subLocations?.flatMap(s => s.cameras) || [])
      ]
      const found = allCams.find(c => c.id === cam.id)
      if (found?.db_id) { dbId = found.db_id; break }
    }
    setSelectedCamera({ ...cam, db_id: dbId || cam.id })
    setSelectedLocation(null)
  }

  const handleClearCamera   = () => { setSelectedCamera(null);   setSelectedLocation(null) }
  const handleClearLocation = () => { setSelectedLocation(null); setSelectedCamera(null)   }

  return (
    <div className="screen active" id="screen-safety-dashboard">

      {/* 1. CAMERAS */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">📹 Live Camera Grid</div>
        </div>
        <div className="panel-body">
          <LocationCameraPanel
            cameras={cameras}
            onCamSelect={handleCamSelect}
          />
        </div>
      </div>

      {/* 2. DATE BAR */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        gap:            12,
        padding:        '7px 16px',
        background:     'var(--bg-panel)',
        border:         '1px solid var(--border)',
        borderRadius:   8,
        marginBottom:   14,
        flexWrap:       'wrap',
        position:       'relative',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          📅 Viewing data for:
        </span>

        <div ref={calRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            onClick={() => setCalOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: calOpen ? 'rgba(124,58,237,0.12)' : 'var(--bg-base)',
              color: calOpen ? '#c4b5fd' : 'var(--text-primary)',
              fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {selectedDate} ▾
          </button>
          {calOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0,
              zIndex: 999, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)',
            }}>
              <MiniCalendar selectedDate={selectedDate} onSelect={date => { onDateChange(date); setCalOpen(false) }} />
            </div>
          )}
        </div>

        {(selectedLocation || selectedCamera) && (
          <span style={{ color: 'var(--border)', fontSize: 16, userSelect: 'none' }}>|</span>
        )}

        {(selectedLocation || selectedCamera) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: selectedLocation ? '#6366f1' : '#3b82f6',
              display: 'inline-block',
            }} />
            <span style={{ color: 'var(--text-muted)' }}>Showing:</span>
            <span style={{
              color:      selectedLocation ? '#a5b4fc' : '#93c5fd',
              fontWeight: 700,
            }}>
              {selectedLocation
                ? `${selectedLocation.icon || ''} ${selectedLocation.label}`.trim()
                : scopeLabel || selectedCamera?.id}
            </span>
            <button
              onClick={handleClearCamera}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 5,
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 11,
                padding: '1px 8px',
                lineHeight: 1.6,
              }}
            >
              ✕ Show all
            </button>
          </div>
        )}
      </div>

      {/* 3. STAT CARDS PANEL */}
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
        visibleAlerts={sortedAlerts}
        ackAlert={ackAlert}
        selectedDate={selectedDate}
        selectedCamera={selectedCamera}
        onClearCamera={handleClearCamera}
        selectedLocation={selectedLocation}
        onClearLocation={handleClearLocation}
      />

      {/* 4. TREND CHART */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">{chartTitle}</div>

          <div className="panel-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{ display: 'inline-block', width: 22, height: 3, background: '#3b9eff', borderRadius: 2 }} />
                Total workers
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{ display: 'inline-block', width: 22, height: 3, background: '#22c55e', borderRadius: 2 }} />
                Safe workers
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#a0aec0' }}>
                <span style={{
                  display: 'inline-block', width: 22, height: 3, borderRadius: 2,
                  background: 'repeating-linear-gradient(90deg,#e53e3e 0 5px,transparent 5px 9px)',
                }} />
                Violations
              </span>
            </div>

            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', fontSize: 12 }}>
              {['hourly', 'minute'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '3px 10px', border: 'none', cursor: 'pointer', fontSize: 12,
                    background: viewMode === mode ? 'var(--blue-vivid)' : 'var(--bg-panel)',
                    color:      viewMode === mode ? '#fff' : 'var(--text-muted)',
                    transition: 'background 0.15s',
                  }}
                >
                  {mode === 'hourly' ? '⏱ Hourly' : '🕐 Per Minute'}
                </button>
              ))}
            </div>

            <div ref={chartCalRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                onClick={() => setChartCalOpen(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px',
                  border: '1px solid var(--border)', borderRadius: 4,
                  background: chartCalOpen ? 'rgba(241,238,246,0.18)' : 'var(--bg-panel)',
                  color: chartCalOpen ? '#c4b5fd' : 'var(--text-primary)',
                  fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s',
                }}
              >
                📅 {selectedDate} ▾
              </button>
              {chartCalOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  zIndex: 999, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border)',
                }}>
                  <MiniCalendar selectedDate={selectedDate} onSelect={date => { onDateChange(date); setChartCalOpen(false) }} />
                </div>
              )}
            </div>

            <select
              value={selectedShift}
              onChange={e => setSelectedShift(e.target.value)}
              style={{
                background: 'var(--bg-panel)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '3px 8px', fontSize: 12, cursor: 'pointer',
              }}
            >
              <option value="day"   style={{ background: '#1a2236', color: '#e2e8f0' }}>☀️ Day Shift (06:00–18:00)</option>
              <option value="night" style={{ background: '#1a2236', color: '#e2e8f0' }}>🌙 Night Shift (18:00–06:00)</option>
              <option value="both"  style={{ background: '#1a2236', color: '#e2e8f0' }}>🔄 Both Shifts</option>
            </select>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '4px 10px', border: '1px solid var(--border)',
              borderRadius: 4, background: 'var(--bg-panel)',
            }}>
              <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#22c55e', cursor:'pointer', userSelect:'none' }}>
                <input
                  type="checkbox" checked={showSafe} onChange={e => setShowSafe(e.target.checked)}
                  style={{ accentColor:'#22c55e', cursor:'pointer', width:13, height:13 }}
                />
                Safe workers
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#e53e3e', cursor:'pointer', userSelect:'none' }}>
                <input
                  type="checkbox" checked={showViols} onChange={e => setShowViols(e.target.checked)}
                  style={{ accentColor:'#e53e3e', cursor:'pointer', width:13, height:13 }}
                />
                Violations
              </label>
            </div>

          </div>
        </div>

        <div className="panel-body">
          {((viewMode === 'hourly' && trendData && trendData.length > 0) ||
            (viewMode === 'minute' && minuteData && minuteData.length > 0)) && (
            <div style={{
              display: 'flex', gap: 16, marginBottom: 12, padding: '8px 12px',
              background: 'var(--bg-base)', borderRadius: 6, fontSize: 12, flexWrap: 'wrap',
            }}>
              {viewMode === 'hourly' ? (
                <>
                  <span style={{ color: 'var(--green-safe)' }}>
                    👷 Peak Safe: <strong>{maxSafe}</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>@ {maxSHour}</span>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                  <span style={{ color: 'var(--red-alert)' }}>
                    🚨 Peak Violations: <strong>{maxViolations}</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>@ {maxVHour}</span>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Total Safe: <strong>{trendData.reduce((s, d) => s + Math.max(0,(d.workers_active||0)-(d.violations||0)), 0)}</strong>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Total Violations: <strong>{trendData.reduce((s, d) => s + (d.violations||0), 0)}</strong>
                  </span>
                </>
              ) : (
                (() => {
                  const minMaxSafe  = Math.max(...minuteData.map(d => Math.max(0,(d.workers_active||0)-(d.violations||0))), 0)
                  const minMaxViols = Math.max(...minuteData.map(d => d.violations||0), 0)
                  const minMaxSTime = minuteData.find(d => Math.max(0,(d.workers_active||0)-(d.violations||0)) === minMaxSafe)?.minute || '--'
                  const minMaxVTime = minuteData.find(d => (d.violations||0) === minMaxViols)?.minute || '--'
                  return (
                    <>
                      <span style={{ color: 'var(--green-safe)' }}>
                        👷 Peak Safe/min: <strong>{minMaxSafe}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>@ {minMaxSTime}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>|</span>
                      <span style={{ color: 'var(--red-alert)' }}>
                        🚨 Peak Violations/min: <strong>{minMaxViols}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>@ {minMaxVTime}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>|</span>
                      <span style={{ color: 'var(--green-safe)', fontStyle: 'italic' }}>
                        ✅ {minuteData.length} minute readings
                      </span>
                    </>
                  )
                })()
              )}
            </div>
          )}

          <div style={{ position: 'relative', height: 220, width: '100%' }}>
            <canvas
              ref={chartRef}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                opacity: canvasVisible ? 1 : 0,
              }}
            />
            {isLoading && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                Loading data{scopeLabel ? ` for ${scopeLabel}` : ''} · {selectedDate}…
              </div>
            )}
            {!isLoading && viewMode === 'hourly' && (!trendData || trendData.length === 0) && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No data for {shiftLabel} Shift · {selectedDate}{scopeLabel ? ` · ${scopeLabel}` : ''}
              </div>
            )}
            {!isLoading && viewMode === 'minute' && minuteData.length === 0 && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No per-minute data for {shiftLabel} Shift · {selectedDate}{scopeLabel ? ` · ${scopeLabel}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. PPE COMPLIANCE SUMMARY */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🦺 PPE Compliance — Shift Summary</div>
          <div className="panel-subtitle">
            Helmet &amp; Vest · {selectedDate}
          </div>
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
                        width: `${item.pct}%`, height: '100%',
                        background: item.color, borderRadius: 3, transition: 'width 0.4s',
                      }} />
                    </div>
                    <div className="text-mono text-xs" style={{ color: item.color, width: 34 }}>{item.pct}%</div>
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
                        width: `${pct}%`, height: '100%',
                        background: '#4ade80', borderRadius: 3, transition: 'width 0.4s',
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
                        height: `${h || 5}%`,
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
                {selectedShift === 'day' ? '☀️ Day' : selectedShift === 'night' ? '🌙 Night' : '🔄 All'} Shift · {selectedDate}
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}
