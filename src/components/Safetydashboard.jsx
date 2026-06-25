// =============================================================================
// SafetyDashboard.jsx
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { useUser, CAMERA_LOCATIONS } from './UserContext'
import LocationCameraPanel from './LocationCameraPanel'
import StatCardsPanel from './StatCardsPanel'

Chart.register(...registerables)

// =============================================================================
// UTILITIES
// =============================================================================
function getCameraLocationLabel(cam) {
  if (!cam) return null
  if (cam.location) return cam.location
  if (cam.label)    return cam.label
  const id = cam.id || ''
  if (id.includes('HYD')) return 'Hyderabad'
  if (id.includes('BLR')) return 'Bangalore'
  if (id.includes('CHN')) return 'Chennai'
  return null
}

function getLocationFromCamera(camId) {
  if (!camId) return 'Unknown'
  const idStr = String(camId).trim()
  if (idStr.includes('16389')) return 'Bangalore'
  if (idStr.includes('16388')) return 'Hyderabad'
  if (idStr.includes('16387')) return 'Chennai - Location 1'
  if (idStr.includes('16386')) return 'Chennai - Location 2'
  for (const loc of CAMERA_LOCATIONS) {
    const allCams = [
      ...(loc.cameras || []),
      ...(loc.subLocations?.flatMap(s => s.cameras) || [])
    ]
    const match = allCams.find(c =>
      c.db_id === idStr ||
      c.id === idStr ||
      (c.name && idStr.includes(c.name))
    )
    if (match) return loc.label
  }
  return 'Unknown Location'
}

function parseAlertTimestamp(ts) {
  if (!ts) return null
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts
  const str = String(ts).trim()
  if (str === 'Invalid Date' || str === 'null' || str === 'undefined' || str === '') return null
  const cleaned = str.replace(/\s*IST$/i, '').replace(' ', 'T').trim()
  const d = new Date(cleaned)
  return isNaN(d.getTime()) ? null : d
}

function getTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function SafetyDashboard({ alerts, kpi, theme = 'dark', isStreaming = false }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  // Always today — no date selection
  const selectedDate = getTodayStr()

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
  const [showRepeated,     setShowRepeated]     = useState(true)
  const [safeWorkers7day,  setSafeWorkers7day]  = useState([])
  const [shiftSafe,        setShiftSafe]        = useState({ morning: 0, afternoon: 0, night: 0 })
  const [cameraSafe,       setCameraSafe]       = useState([])
  const [selectedCamera,   setSelectedCamera]   = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [alertFilter,      setAlertFilter]      = useState('all')

  const [violationStats, setViolationStats] = useState({
    total: 0,
    onlyHelmet: 0,
    onlyVest: 0,
    both: 0,
    pctHelmet: 0,
    pctVest: 0,
    pctBoth: 0
  });

  const { visibleLocations } = useUser()
  const calRef      = useRef(null)
  const chartCalRef = useRef(null)

  // ── Fetch all dashboard data ───────────────────────────────────────────────
  useEffect(() => {
    setTrendData(null)
    setMinuteData([])
    setIsLoading(true)

    const camId    = selectedCamera?.db_id || selectedCamera?.id || null
    const camParam = camId && !camId.includes(',')
      ? `&camera=${encodeURIComponent(camId)}`
      : ''

    const locationParam = (() => {
      if (camId || !selectedLocation) return ''
      const allCams = [
        ...(selectedLocation.cameras || []),
        ...(selectedLocation.subLocations?.flatMap(s => s.cameras) || []),
      ]
      const dbIds = [...new Set(allCams.map(c => c.db_id || c.id).filter(Boolean))]
      return dbIds.length > 0 ? `&camera=${encodeURIComponent(dbIds.join(','))}` : ''
    })()

    const defaultCameraParam = (() => {
      if (camParam || locationParam) return ''  // already filtered
      const allCams = visibleLocations.flatMap(loc => [
        ...(loc.cameras || []),
        ...(loc.subLocations?.flatMap(s => s.cameras || []) || []),
      ])
      const dbIds = [...new Set(allCams.map(c => c.db_id || c.id).filter(Boolean))]
      return dbIds.length > 0 ? `&camera=${encodeURIComponent(dbIds.join(','))}` : ''
    })()

    const filterParam = camParam || locationParam || defaultCameraParam
    const params = new URLSearchParams({ date: selectedDate, shift: selectedShift })

    const requests = [
      fetch(`/api/hourly-trend?${params}${filterParam}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/live-trend?${params}${filterParam}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ppe-compliance-summary?date=${selectedDate}${filterParam}`).then(r => r.ok ? r.json() : {}),
      fetch(`/api/safe-workers-7day?date=${selectedDate}${filterParam}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/shift-safe-summary?date=${selectedDate}${filterParam}`).then(r => r.ok ? r.json() : {}),
      fetch(`/api/camera-safe-summary?date=${selectedDate}${filterParam}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/ppe-violations?date=${selectedDate}&limit=2000${filterParam}`)
        .then(r => r.ok ? r.json() : [])
        .then(violations => {
          if (!Array.isArray(violations)) return;

          const total = violations.length;
          const onlyHelmet = violations.filter(v => v.violation_type === 'no_helmet').length;
          const onlyVest   = violations.filter(v => v.violation_type === 'no_vest').length;
          const both       = violations.filter(v => v.violation_type === 'both_missing').length;

          const pctHelmet = total > 0 ? Math.round((onlyHelmet / total) * 100) : 0;
          const pctVest   = total > 0 ? Math.round((onlyVest   / total) * 100) : 0;
          const pctBoth   = total > 0 ? Math.round((both       / total) * 100) : 0;

          setViolationStats({
            total, 
            onlyHelmet, 
            onlyVest, 
            both,
            pctHelmet, 
            pctVest, 
            pctBoth
          });
        })
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
        setSafeWorkers7day(Array.isArray(safeRaw) ? safeRaw : [])
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
  }, [selectedDate, selectedShift, selectedCamera, selectedLocation, visibleLocations])

  // ── Build / rebuild Chart.js ───────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }

    let chartLabels, workersData, violationsData, totalData, repeatedViolationsData
    const isMinuteMode = viewMode === 'minute'

    if (isMinuteMode) {
      if (!minuteData || minuteData.length === 0) return
      chartLabels            = minuteData.map(d => d.minute)
      totalData              = minuteData.map(d => d.max_workers || 0)
      workersData            = minuteData.map(d => d.workers_safe || 0)
      violationsData         = minuteData.map(d => d.violations)
      repeatedViolationsData = minuteData.map(d => d.repeated_violations || 0)
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
      chartLabels            = chartData.map(d => d.hour)
      totalData              = chartData.map(d => d.workers_active || 0)
      workersData            = chartData.map(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0)))
      violationsData         = chartData.map(d => d.violations || 0)
      repeatedViolationsData = chartData.map(d => d.repeated_violations || 0)
    }

    const ctx      = chartRef.current.getContext('2d')
    const datasets = [
      showTotal && {
        label: 'Total workers', data: totalData,
        borderColor: '#3b9eff', backgroundColor: 'rgba(59,158,255,0.05)',
        fill: true, tension: 0.4,
        pointRadius: isMinuteMode ? 0 : 4, pointHoverRadius: isMinuteMode ? 4 : 5,
        pointBackgroundColor: '#3b9eff', borderWidth: 2, order: 1,
      },
      showSafe && {
        label: 'Safe workers', data: workersData,
        borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.10)',
        fill: true, tension: 0.4,
        pointRadius: isMinuteMode ? 0 : 4, pointHoverRadius: isMinuteMode ? 4 : 5,
        pointBackgroundColor: '#22c55e', borderWidth: 2.5, order: 2,
      },
      showViols && {
        label: 'New Violations', data: violationsData,
        borderColor: '#e53e3e', backgroundColor: 'rgba(229,62,62,0.08)',
        fill: true, tension: 0.4,
        pointRadius: isMinuteMode ? 0 : 4, pointHoverRadius: isMinuteMode ? 4 : 5,
        pointBackgroundColor: '#e53e3e', borderWidth: 2.5, borderDash: [5, 3], order: 3,
      },
      showRepeated && {
        label: 'Repeated Violations', data: repeatedViolationsData,
        borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)',
        fill: true, tension: 0.4,
        pointRadius: isMinuteMode ? 0 : 4, pointHoverRadius: isMinuteMode ? 4 : 5,
        pointBackgroundColor: '#f59e0b', borderWidth: 2, borderDash: [2, 2], order: 4,
      },
    ].filter(Boolean)

    chartInst.current = new Chart(ctx, {
      type: 'line',
      data: { labels: chartLabels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
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
                return `${String(hour).padStart(2, '00')}:00 – ${next}:00`
              },
              label: (ctx) => {
                const val    = Math.round(ctx.parsed.y)
                const suffix = ctx.dataset.label === 'New Violations'      ? ' violations'
                             : ctx.dataset.label === 'Repeated Violations' ? ' repeated violations'
                             : ctx.dataset.label === 'Total workers'       ? ' total workers'
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
              color: '#5a6a82', maxRotation: 0, autoSkip: false, font: { size: 11 },
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
            ticks: { color: '#a0aec0', font: { size: 11 }, callback: (val) => Number.isInteger(val) ? val : null },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: {
              display: true,
              text: isMinuteMode ? 'count (per minute)' : 'count (avg per hour)',
              color: '#5a6a82', font: { size: 11 },
            },
          },
        },
      },
    })

    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    }
  }, [trendData, minuteData, viewMode, showTotal, showSafe, showViols, showRepeated])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const ackAlert = (id) => setAckedIds(prev => new Set([...prev, id]))

  const scopedDbIds = (() => {
    if (selectedCamera) {
      const dbId = selectedCamera.db_id || selectedCamera.name || selectedCamera.id
      return dbId ? new Set([dbId]) : null
    }
    if (selectedLocation) {
      const allCams = [
        ...(selectedLocation.cameras || []),
        ...(selectedLocation.subLocations?.flatMap(s => s.cameras || []) || []),
      ]
      const ids = [...new Set(allCams.map(c => c.db_id || c.name || c.id).filter(Boolean))]
      return ids.length > 0 ? new Set(ids) : null
    }
    return null
  })()
      const todayStr = (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      })()
    // WITH THIS:
    const visibleAlerts = selectedDate !== todayStr ? [] : (alerts || []).filter(a => {
      if (!a._id)              return false
      if (ackedIds.has(a._id)) return false

      // ── extract camera id from all possible fields including message text ──
    const alertCam = (
      a.camera || a.camera_id || a.camera_name ||
      (a.message || '').match(/Pier_Cap_Cam_\d+/)?.[0] ||
      ''
    ).trim()

    const rawTs = a.analyzed_at_ist || a.camera_ts_ist || a.camera_ts || a.created_at || a.timestamp || a.time
    if (rawTs) {
      const d = parseAlertTimestamp(rawTs)
      if (d && !isNaN(d.getTime())) {
        const dateStr = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
        ].join('-')
        if (dateStr !== selectedDate) return false
      }
    }

    if (scopedDbIds) {
      if (!alertCam) return false
      const matches =
        scopedDbIds.has(alertCam) ||
        [...scopedDbIds].some(dbId =>
          alertCam.includes(dbId) || dbId.includes(alertCam)
        )
      if (!matches) return false
    }

    return true
  })

  const sortedAlerts = [...visibleAlerts].sort((a, b) => {
    const getTs = (alert) => {
      const raw = alert.analyzed_at_ist || alert.camera_ts_ist ||
                  alert.camera_ts || alert.created_at ||
                  alert.timestamp || alert.time
      return parseAlertTimestamp(raw)
    }
    const da = getTs(a)
    const db = getTs(b)
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return db.getTime() - da.getTime()
  })
    .sort((a, b) => {
      const da = parseAlertTimestamp(a.timestamp || a.camera_ts_ist || a.camera_ts || a.created_at || '')
      const db = parseAlertTimestamp(b.timestamp || b.camera_ts_ist || b.camera_ts || b.created_at || '')
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return db.getTime() - da.getTime()
    })

  const filteredAlerts = sortedAlerts.filter(a => {
    if (alertFilter === 'all') return true
    const severity = (a.severity || a.alert_type || a.type || '').toLowerCase()
    if (alertFilter === 'critical') return severity.includes('critical')
    if (alertFilter === 'warning')  return severity.includes('warning')
    return true
  })

  // ── Enrich alerts ─────────────────────────────────────────────────────────
  const enrichedAlerts = filteredAlerts.map(alert => {
    const camId = alert.camera ||
                  alert.camera_id ||
                  alert.camera_name ||
                  (alert.message || '').match(/Pier_Cap_Cam_\d+/)?.[0]

    const locationName = getLocationFromCamera(camId)

    let displayTime = '—'
    const rawTs = alert.analyzed_at_ist || alert.camera_ts_ist || alert.camera_ts || alert.created_at || alert.timestamp || alert.time
    if (rawTs) {
      const parsed = parseAlertTimestamp(rawTs);
      if (parsed) {
        displayTime = parsed.toLocaleTimeString('en-IN', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
      }
    }

    return {
      ...alert,
      displayLocation: locationName,
      displayTime: displayTime
    };
  });

  // ── Derived display values ─────────────────────────────────────────────────
  const displaySafe       = daySafe
  const displayViolated   = dayViolated
  const displayTotal      = displaySafe + displayViolated
  const displayCompliance = displayTotal > 0 ? Math.round((displaySafe / displayTotal) * 100) : null
  const alertSummaryTotal =
    Number(kpi?.critical_alerts ?? kpi?.critical ?? 0) +
    Number(kpi?.warning_alerts  ?? kpi?.warning  ?? 0)

  const safeTrend     = trendData || []
  const maxSafe       = safeTrend.length > 0 ? Math.max(...safeTrend.map(d => Math.max(0, (d.workers_active||0) - (d.violations||0))), 0) : 0
  const maxViolations = safeTrend.length > 0 ? Math.max(...safeTrend.map(d => d.violations||0), 0) : 0
  const maxVHour      = safeTrend.find(d => (d.violations||0) === maxViolations)?.hour || '--'

  // ── todaySafe / todayViols from safeWorkers7day ───────────────────────────
  const todaySafe  = safeWorkers7day.find(d => d.date === selectedDate)?.safe_count ?? 0
  const todayViols = safeWorkers7day.find(d => d.date === selectedDate)?.violations ?? 0

  const shiftLabel    = selectedShift === 'day' ? 'Day' : selectedShift === 'night' ? 'Night' : 'All'
  const canvasVisible = viewMode === 'hourly' ? (safeTrend.length > 0) : (minuteData.length > 0)
  const scopeLabel    = selectedLocation?.label || getCameraLocationLabel(selectedCamera) || null
  const chartTitle    = `📈 Avg Safe Workers vs Violations — ${viewMode === 'minute' ? 'Per-Minute' : 'Hourly'} Trend`

  // ── Camera / location selection handlers ───────────────────────────────────
  const handleCamSelect = (cam) => {
    if (!cam) { setSelectedCamera(null); setSelectedLocation(null); return }
    if (cam._isLocation) {
      const fullLoc = CAMERA_LOCATIONS.find(l => l.label === cam.name || l.id === cam.id) || null
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
    if (!cam.id) { setSelectedCamera(null); setSelectedLocation(null); return }
    if (cam.db_id) { setSelectedCamera(cam); setSelectedLocation(null); return }
    let dbId = null
    for (const loc of CAMERA_LOCATIONS) {
      const allCams = [...(loc.cameras || []), ...(loc.subLocations?.flatMap(s => s.cameras) || [])]
      const found = allCams.find(c => c.id === cam.id)
      if (found?.db_id) { dbId = found.db_id; break }
    }
    setSelectedCamera({ ...cam, db_id: dbId || cam.id })
    setSelectedLocation(null)
  }

  const handleClearCamera   = () => { setSelectedCamera(null);   setSelectedLocation(null) }
  const handleClearLocation = () => { setSelectedLocation(null); setSelectedCamera(null)   }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="screen active" id="screen-safety-dashboard">

      {/* SECTION 1: LIVE CAMERA GRID */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>
          📹 Live Camera Grid
        </div>
        <LocationCameraPanel cameras={visibleLocations} onCamSelect={handleCamSelect} />
      </div>

      {/* SECTION 2: SCOPE FILTER BAR — today only, no date picker */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '7px 16px',
        background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8,
        marginBottom: 14, flexWrap: 'wrap',
      }}>
        {/* Today badge */}
        <span style={{
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700,
          color: '#4ade80', letterSpacing: '0.05em',
        }}>
          📅 Today · {selectedDate}
        </span>

        <span style={{ color: 'var(--border)', fontSize: 16, userSelect: 'none' }}>|</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
            background: selectedCamera ? '#3b82f6' : selectedLocation ? '#6366f1' : '#22c55e',
          }} />
          <span style={{ color: 'var(--text-muted)' }}>Showing:</span>
          <span style={{
            fontWeight: 700,
            color: selectedCamera ? '#93c5fd' : selectedLocation ? '#a5b4fc' : '#4ade80',
          }}>
            {selectedCamera
              ? (scopeLabel || selectedCamera?.id)
              : selectedLocation
                ? `${selectedLocation.icon || ''} ${selectedLocation.label}`.trim()
                : '🌐 All Locations'}
          </span>
          {(selectedLocation || selectedCamera) && (
            <button
              onClick={handleClearCamera}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5,
                color: '#64748b', cursor: 'pointer', fontSize: 11, padding: '1px 8px', lineHeight: 1.6,
              }}
            >
              ✕ Show all
            </button>
          )}
        </div>
      </div>

      {/* SECTION 3: STAT CARDS PANEL */}
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
        trendData={safeTrend}
        visibleAlerts={enrichedAlerts}
        alertFeedNewCount={alertSummaryTotal || filteredAlerts.length}
        alertFilter={alertFilter}
        onAlertFilterChange={setAlertFilter}
        ackAlert={ackAlert}
        selectedDate={selectedDate}
        selectedCamera={selectedCamera}
        onClearCamera={handleClearCamera}
        selectedLocation={selectedLocation}
        onClearLocation={handleClearLocation}
        visibleLocations={visibleLocations}
        theme={theme}
        isStreaming={isStreaming}
        onNavigateToAlerts={() => {
          window.dispatchEvent(new CustomEvent('yolo-navigate', { detail: { tab: 'alerts' } }))
        }}
      />

      {/* SECTION 4: TREND CHART */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {chartTitle}
            {(selectedLocation || selectedCamera) && (
              <span style={{
                background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.4)',
                borderRadius: 6, padding: '3px 10px', fontSize: 11,
                color: '#c4b5fd', fontWeight: 600,
              }}>
                📍 {selectedLocation
                  ? `${selectedLocation.icon || ''} ${selectedLocation.label}`.trim()
                  : scopeLabel || selectedCamera?.id}
              </span>
            )}
          </div>

          <div className="panel-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px',
              border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-panel)',
            }}>
              
              
            </div>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', fontSize: 12 }}>
              {['hourly', 'minute'].map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{
                  padding: '3px 10px', border: 'none', cursor: 'pointer', fontSize: 12,
                  background: viewMode === mode ? 'var(--blue-vivid)' : 'var(--bg-panel)',
                  color: viewMode === mode ? '#fff' : 'var(--text-muted)',
                  transition: 'background 0.15s',
                }}>
                  {mode === 'hourly' ? '⏱ Hourly' : '🕐 Per Minute'}
                </button>
              ))}
            </div>

            <select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} style={{
              background: 'var(--bg-panel)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 4,
              padding: '3px 8px', fontSize: 12, cursor: 'pointer',
            }}>
              <option value="day"   style={{ background: '#1a2236', color: '#e2e8f0' }}>☀️ Day Shift (06:00–18:00)</option>
              <option value="night" style={{ background: '#1a2236', color: '#e2e8f0' }}>🌙 Night Shift (18:00–06:00)</option>
              <option value="both"  style={{ background: '#1a2236', color: '#e2e8f0' }}>🔄 Both Shifts</option>
            </select>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px',
              border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-panel)',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#22c55e', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={showSafe} onChange={e => setShowSafe(e.target.checked)}
                  style={{ accentColor: '#22c55e', cursor: 'pointer', width: 13, height: 13 }} />
                Safe workers
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#e53e3e', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={showViols} onChange={e => setShowViols(e.target.checked)}
                  style={{ accentColor: '#e53e3e', cursor: 'pointer', width: 13, height: 13 }} />
                New violations
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#f59e0b', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={showRepeated} onChange={e => setShowRepeated(e.target.checked)}
                  style={{ accentColor: '#f59e0b', cursor: 'pointer', width: 13, height: 13 }} />
                Repeated violations
              </label>
            </div>
          </div>
        </div>

        <div className="panel-body">
          <div style={{ position: 'relative', height: 220, width: '100%' }}>
            <canvas ref={chartRef} style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: canvasVisible ? 1 : 0,
            }} />
            {isLoading && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                Loading data{scopeLabel ? ` for ${scopeLabel}` : ''}...
              </div>
            )}
            {!isLoading && viewMode === 'hourly' && (!trendData || trendData.length === 0) && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No data for {shiftLabel} Shift{scopeLabel ? ` - ${scopeLabel}` : ''}
              </div>
            )}
            {!isLoading && viewMode === 'minute' && minuteData.length === 0 && (
              <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>
                No per-minute data for {shiftLabel} Shift{scopeLabel ? ` - ${scopeLabel}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 5: PPE COMPLIANCE SUMMARY */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🦺 PPE Compliance — Shift Summary</div>
          <div className="panel-subtitle">Helmet &amp; Vest</div>
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
                      <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 3, transition: 'width 0.4s' }} />
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
                      <div style={{ width: `${pct}%`, height: '100%', background: '#4ade80', borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 6 }}>
                <div className="text-xs text-muted text-mono mb-8">WORKERS</div>
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
                {safeTrend.map((d, i) => {
                  const max = Math.max(...safeTrend.map(x => x.violations || 0), 1)
                  const h   = Math.round(((d.violations || 0) / max) * 100)
                  return (
                    <div key={i} className="spark-bar" title={`${d.hour} — ${d.violations} violations`} style={{
                      height: `${h || 5}%`,
                      background: h > 60 ? 'var(--red-alert)' : h > 30 ? 'var(--amber)' : 'var(--blue-vivid)',
                    }} />
                  )
                })}
              </div>
              {safeTrend.length === 0 && (
                <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                  {isLoading ? 'Loading...' : 'No trend data'}
                </div>
              )}
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                {selectedShift === 'day' ? 'Day' : selectedShift === 'night' ? 'Night' : 'All'} Shift
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}