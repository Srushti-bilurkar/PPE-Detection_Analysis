import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

function toApiDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split('-')
    return `${yyyy}-${mm}-${dd}`
  }
  return dateStr
}

/* ============================================================
   ZoneComplianceChart — per-camera grouped bar chart
   ============================================================ */
function ZoneComplianceChart({ zoneData, loading }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => {
    const ctx = canvasRef.current
    if (!ctx) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    if (!zoneData || zoneData.length === 0) return

    const labels = zoneData.map(z => z.camera || z.zone || z.cam_id || 'Unknown')

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           'Helmet — Compliance',
            data:            zoneData.map(z => z.wearing_helmet ?? 0),
            backgroundColor: 'rgba(29,158,117,0.70)',
            borderColor:     'rgba(29,158,117,0.95)',
            borderWidth: 1, borderRadius: 3,
          },
          {
            label:           'Helmet — Non-Compliance',
            data:            zoneData.map(z => z.not_wearing_helmet ?? 0),
            backgroundColor: 'rgba(192,57,43,0.65)',
            borderColor:     'rgba(192,57,43,0.90)',
            borderWidth: 1, borderRadius: 3,
          },
          {
            label:           'Vest — Compliance',
            data:            zoneData.map(z => z.wearing_vest ?? 0),
            backgroundColor: 'rgba(24,95,165,0.65)',
            borderColor:     'rgba(24,95,165,0.90)',
            borderWidth: 1, borderRadius: 3,
          },
          {
            label:           'Vest — Non-Compliance',
            data:            zoneData.map(z => z.not_wearing_vest ?? 0),
            backgroundColor: 'rgba(186,117,23,0.65)',
            borderColor:     'rgba(186,117,23,0.90)',
            borderWidth: 1, borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#888780', font: { size: 11 }, autoSkip: false },
            grid:  { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#888780', font: { size: 11 }, stepSize: 5 },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: 'count', color: '#5a6a82', font: { size: 11 } },
          },
        },
      },
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [zoneData])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
      Loading zone data…
    </div>
  )
  if (!zoneData || zoneData.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
      No zone data for this date
    </div>
  )
  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
}

/* ── Zone chart legend ── */
const ZONE_LEGEND = [
  { label: 'Helmet — Compliance',     color: 'rgba(29,158,117,0.85)'  },
  { label: 'Helmet — Non-Compliance', color: 'rgba(192,57,43,0.85)'   },
  { label: 'Vest — Compliance',       color: 'rgba(24,95,165,0.85)'   },
  { label: 'Vest — Non-Compliance',   color: 'rgba(186,117,23,0.85)'  },
]

function ZoneLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginBottom: 10 }}>
      {ZONE_LEGEND.map(({ label, color }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          {label}
        </span>
      ))}
    </div>
  )
}

/* ============================================================
   WorkerViolationTrendChart — date / date-range / monthly / yearly
   DEFAULT MODE: 'date' (single day hourly breakdown)
   ============================================================ */

const RANGE_MODES = [
  { key: 'date',    label: 'Date'       },
  { key: 'range',   label: 'Date Range' },
  { key: 'monthly', label: 'Monthly'    },
  { key: 'yearly',  label: 'Yearly'     },
]

function WorkerViolationTrendChart() {
  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  // ── DEFAULT MODE IS 'date' ──
  const [mode,       setMode]       = useState('date')
  const [singleDate, setSingleDate] = useState(today)
  const [rangeFrom,  setRangeFrom]  = useState(firstOfMonth)
  const [rangeTo,    setRangeTo]    = useState(today)
  const [month,      setMonth]      = useState(today.slice(0, 7))
  const [year,       setYear]       = useState(today.slice(0, 4))

  const [trendData,      setTrendData]      = useState([])
  const [loading,        setLoading]        = useState(false)
  const [peakWorkers,    setPeakWorkers]    = useState(null)
  const [peakViolations, setPeakViolations] = useState(null)
  const [totals,         setTotals]         = useState({ workers: 0, violations: 0 })
  const [showWorkers,    setShowWorkers]    = useState(true)
  const [showViols,      setShowViols]      = useState(true)

  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  /* ── fetch trend data ── */
  const loadTrend = useCallback(async () => {
    setLoading(true)
    try {

      /* ── DATE mode: single day, hourly breakdown ── */
      if (mode === 'date') {
        const apiDate = toApiDate(singleDate)
        try {
          const r = await fetch(`/api/hourly-trend?date=${apiDate}&shift=both`)
          if (!r.ok) { setTrendData([]); setLoading(false); return }
          const raw = await r.json()
          const points = (Array.isArray(raw) ? raw : []).map(d => ({
            label:         d.hour,
            total_workers: d.workers_active || 0,
            violations:    d.violations     || 0,
          }))
          setTrendData(points)
        } catch {
          setTrendData([])
        }
        setLoading(false)
        return
      }

      /* ── RANGE / MONTHLY mode: one point per day ── */
      if (mode === 'range' || mode === 'monthly') {
        const from = mode === 'monthly' ? `${month}-01` : rangeFrom
        const to   = mode === 'monthly'
          ? new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5, 7)), 0)
              .toISOString().split('T')[0]
          : rangeTo

        const days = []
        const cur  = new Date(from)
        const end  = new Date(to)
        while (cur <= end) {
          days.push(cur.toISOString().split('T')[0])
          cur.setDate(cur.getDate() + 1)
        }

        const todayStr   = new Date().toISOString().split('T')[0]
        const cappedDays = days.filter(d => d <= todayStr)

        const points = await Promise.all(
          cappedDays.map(async (day) => {
            try {
              const r = await fetch(`/api/kpi-period?date_from=${day}&date_to=${day}`)
              if (!r.ok) return { label: day, total_workers: 0, violations: 0 }
              const d = await r.json()
              return {
                label:         day,
                total_workers: d.total_workers    ?? 0,
                violations:    d.total_violations ?? 0,
              }
            } catch {
              return { label: day, total_workers: 0, violations: 0 }
            }
          })
        )
        setTrendData(points.filter(p => p.total_workers > 0 || p.violations > 0))

      /* ── YEARLY mode: one point per month ── */
      } else {
        const MONTHS  = ['01','02','03','04','05','06','07','08','09','10','11','12']
        const MLABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const todayStr    = new Date().toISOString().split('T')[0]
        const currentYear = todayStr.slice(0, 4)
        const currentMon  = parseInt(todayStr.slice(5, 7))

        const points = await Promise.all(
          MONTHS.map(async (mm, idx) => {
            const monthNum = idx + 1
            if (year === currentYear && monthNum > currentMon) return null

            const from    = `${year}-${mm}-01`
            const lastDay = (year === currentYear && monthNum === currentMon)
              ? todayStr
              : new Date(parseInt(year), monthNum, 0).toISOString().split('T')[0]

            try {
              const r = await fetch(`/api/kpi-period?date_from=${from}&date_to=${lastDay}`)
              if (!r.ok) return { label: `${MLABELS[idx]} ${year}`, total_workers: 0, violations: 0 }
              const d = await r.json()
              return {
                label:         `${MLABELS[idx]} ${year}`,
                total_workers: d.total_workers    ?? 0,
                violations:    d.total_violations ?? 0,
              }
            } catch {
              return { label: `${MLABELS[idx]} ${year}`, total_workers: 0, violations: 0 }
            }
          })
        )
        setTrendData(points.filter(p => p !== null))
      }

    } catch (err) {
      console.error('Trend load error:', err)
      setTrendData([])
    }
    setLoading(false)
  }, [mode, singleDate, rangeFrom, rangeTo, month, year])

  /* ── auto-reload whenever any dependency changes ── */
  useEffect(() => { loadTrend() }, [loadTrend])

  /* ── compute peak / totals ── */
  useEffect(() => {
    if (!trendData.length) {
      setPeakWorkers(null)
      setPeakViolations(null)
      setTotals({ workers: 0, violations: 0 })
      return
    }
    const maxW = trendData.reduce((m, d) => d.total_workers > (m?.v ?? 0) ? { v: d.total_workers, l: d.label } : m, null)
    const maxV = trendData.reduce((m, d) => d.violations    > (m?.v ?? 0) ? { v: d.violations,    l: d.label } : m, null)
    const sumW = trendData.reduce((s, d) => s + (d.total_workers ?? 0), 0)
    const sumV = trendData.reduce((s, d) => s + (d.violations    ?? 0), 0)
    setPeakWorkers(maxW)
    setPeakViolations(maxV)
    setTotals({ workers: sumW, violations: sumV })
  }, [trendData])

  /* ── draw / update chart ── */
  useEffect(() => {
    const ctx = canvasRef.current
    if (!ctx) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    if (!trendData.length) return

    const labels     = trendData.map(d => d.label)
    const workerVals = trendData.map(d => d.total_workers ?? 0)
    const violVals   = trendData.map(d => d.violations    ?? 0)

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          showWorkers && {
            label:            'Total Workers',
            data:             workerVals,
            borderColor:      'rgba(29,200,130,1)',
            backgroundColor:  'rgba(29,200,130,0.10)',
            borderWidth:      2.5,
            pointRadius:      mode === 'date' ? 4 : 3,
            pointHoverRadius: 6,
            tension:          0.4,
            fill:             true,
          },
          showViols && {
            label:            'Violations',
            data:             violVals,
            borderColor:      'rgba(229,62,62,0.9)',
            backgroundColor:  'rgba(229,62,62,0.07)',
            borderWidth:      2,
            borderDash:       [5, 3],
            pointRadius:      mode === 'date' ? 4 : 3,
            pointHoverRadius: 6,
            tension:          0.4,
            fill:             true,
          },
        ].filter(Boolean),
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(16,24,36,0.92)',
            titleColor:      '#c8d4e8',
            bodyColor:       '#8a9ab8',
            borderColor:     'rgba(255,255,255,0.08)',
            borderWidth:     1,
            padding:         10,
            callbacks: {
              title: (items) => {
                if (!items.length) return ''
                const lbl = items[0].label
                if (mode === 'date') {
                  const hour = parseInt(lbl.split(':')[0])
                  const next = String(hour + 1).padStart(2, '0')
                  return `${String(hour).padStart(2, '0')}:00 – ${next}:00`
                }
                return lbl
              },
              label: c => ` ${c.dataset.label}: ${c.parsed.y}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color:         '#666f82',
              font:          { size: 10 },
              maxTicksLimit: mode === 'date' ? 24 : 12,
              autoSkip:      true,
              callback: function(_, index) {
                const lbl = labels[index]
                if (!lbl) return null
                // For date mode show just the hour number (e.g. "07" → "7")
                if (mode === 'date') return parseInt(lbl.split(':')[0])
                return lbl
              },
            },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: {
              display: true,
              text:    mode === 'date' ? 'Hour of day' : mode === 'yearly' ? 'Month' : 'Date',
              color:   '#5a6a82',
              font:    { size: 10 },
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#666f82',
              font:  { size: 10 },
              callback: (val) => Number.isInteger(val) ? val : null,
            },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: {
              display: true,
              text:    mode === 'date' ? 'count (per hour)' : 'count',
              color:   '#4a5a72',
              font:    { size: 10 },
            },
          },
        },
      },
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [trendData, showWorkers, showViols, mode])

  /* ── year options ── */
  const currentYear = parseInt(today.slice(0, 4))
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  /* ── subtitle text ── */
  const subtitle = (() => {
    const pts = trendData.length > 0 ? ` · ${trendData.length} data point${trendData.length > 1 ? 's' : ''}` : ''
    if (mode === 'date')    return `Hourly · ${singleDate}${pts}`
    if (mode === 'range')   return `${rangeFrom} → ${rangeTo}${pts}`
    if (mode === 'monthly') return `Daily · ${month}${pts}`
    if (mode === 'yearly')  return `Monthly · ${year}${pts}`
    return ''
  })()

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      {/* ── header ── */}
      <div className="panel-header">
        <div className="panel-title">📈 Total Workers vs Violations — Trend</div>
        <div className="panel-subtitle">{subtitle}</div>
      </div>

      <div className="panel-body">

        {/* ── controls row ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>

          {/* mode toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 3 }}>
            {RANGE_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                style={{
                  padding:    '4px 12px',
                  borderRadius: 4,
                  border:     'none',
                  cursor:     'pointer',
                  fontSize:   11,
                  fontWeight: mode === m.key ? 600 : 400,
                  background: mode === m.key ? 'rgba(29,158,117,0.25)' : 'transparent',
                  color:      mode === m.key ? 'var(--green-safe)' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Date mode: single date picker */}
          {mode === 'date' && (
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              📅 Date
              <input
                type="date"
                className="date-picker"
                value={singleDate}
                max={today}
                onChange={e => setSingleDate(e.target.value)}
                style={{ marginLeft: 4 }}
              />
              {singleDate === today && (
                <span style={{ fontSize: 10, color: 'rgba(29,200,130,1)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
                  TODAY
                </span>
              )}
            </label>
          )}

          {/* Date Range mode */}
          {mode === 'range' && (
            <>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                From
                <input
                  type="date" className="date-picker"
                  value={rangeFrom} max={rangeTo}
                  onChange={e => setRangeFrom(e.target.value)}
                  style={{ marginLeft: 4 }}
                />
              </label>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                To
                <input
                  type="date" className="date-picker"
                  value={rangeTo} min={rangeFrom} max={today}
                  onChange={e => setRangeTo(e.target.value)}
                  style={{ marginLeft: 4 }}
                />
              </label>
            </>
          )}

          {/* Monthly mode */}
          {mode === 'monthly' && (
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Month
              <input
                type="month" className="date-picker"
                value={month} max={today.slice(0, 7)}
                onChange={e => setMonth(e.target.value)}
                style={{ marginLeft: 4 }}
              />
            </label>
          )}

          {/* Yearly mode */}
          {mode === 'yearly' && (
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Year
              <select
                className="date-picker" value={year}
                onChange={e => setYear(e.target.value)}
                style={{ marginLeft: 4 }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          )}

          {/* Checkboxes */}
          <div style={{
            display:    'flex',
            alignItems: 'center',
            gap:        10,
            padding:    '4px 10px',
            border:     '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--bg-panel)',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(29,200,130,1)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox" checked={showWorkers}
                onChange={e => setShowWorkers(e.target.checked)}
                style={{ accentColor: 'rgba(29,200,130,1)', cursor: 'pointer', width: 13, height: 13 }}
              />
              Total Workers
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(229,62,62,0.9)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox" checked={showViols}
                onChange={e => setShowViols(e.target.checked)}
                style={{ accentColor: 'rgba(229,62,62,0.9)', cursor: 'pointer', width: 13, height: 13 }}
              />
              Violations
            </label>
          </div>

          {/* Refresh button */}
          <button
            onClick={loadTrend}
            disabled={loading}
            style={{
              marginLeft:   'auto',
              background:   'var(--bg-base)',
              border:       '1px solid var(--border)',
              borderRadius: 4,
              color:        'var(--text-muted)',
              padding:      '3px 10px',
              fontSize:     11,
              cursor:       loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* ── peak stats bar ── */}
        {!loading && peakWorkers && (
          <div style={{
            display:      'flex',
            flexWrap:     'wrap',
            gap:          '6px 20px',
            marginBottom: 10,
            padding:      '8px 12px',
            background:   'var(--bg-base)',
            borderRadius: 6,
            fontSize:     11,
            color:        'var(--text-muted)',
          }}>
            <span>
              👷 <strong style={{ color: 'rgba(29,200,130,0.95)' }}>
                Peak Workers: {peakWorkers.v}
              </strong>
              <span style={{ opacity: 0.6 }}> @ {peakWorkers.l}</span>
            </span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span>
              🚨 <strong style={{ color: 'rgba(229,62,62,0.9)' }}>
                Peak Violations: {peakViolations?.v ?? 0}
              </strong>
              <span style={{ opacity: 0.6 }}> @ {peakViolations?.l}</span>
            </span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span style={{ opacity: 0.6 }}>Total Workers: <strong>{totals.workers}</strong></span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span style={{ opacity: 0.6 }}>Total Violations: <strong>{totals.violations}</strong></span>
          </div>
        )}

        {/* ── chart canvas ── */}
        <div style={{ height: 220, position: 'relative' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading trend data…
            </div>
          ) : trendData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
              No data for selected period
            </div>
          ) : (
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>

      </div>
    </div>
  )
}


/* ============================================================
   PPECompliance  (main export)
   ============================================================ */
export default function PPECompliance({ selectedDate, onDateChange }) {
  const today = new Date().toISOString().split('T')[0]

  const [date,        setDate]        = useState(toApiDate(selectedDate) || today)
  const [loading,     setLoading]     = useState(false)
  const [zoneLoading, setZoneLoading] = useState(false)
  const [error,       setError]       = useState(null)
  const [zoneData,    setZoneData]    = useState([])

  const [totalViolations, setTotalViolations] = useState(0)
  const [onlyHelmetMiss,  setOnlyHelmetMiss]  = useState(0)
  const [onlyVestMiss,    setOnlyVestMiss]    = useState(0)
  const [bothMiss,        setBothMiss]        = useState(0)

  useEffect(() => {
    if (selectedDate) {
      const normalised = toApiDate(selectedDate)
      setDate(prev => prev !== normalised ? normalised : prev)
    }
  }, [selectedDate])

  const loadZoneData = useCallback(async (apiDate, violationRows) => {
    setZoneLoading(true)
    try {
      const res = await fetch(`/api/ppe-compliance-by-zone?date=${apiDate}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setZoneData(data)
          setZoneLoading(false)
          return
        }
      }
    } catch (_) { /* fall through */ }

    if (violationRows && violationRows.length > 0) {
      const map = {}
      violationRows.forEach(r => {
        const cam = r.camera || r.zone || 'Unknown'
        if (!map[cam]) map[cam] = {
          camera:             cam,
          wearing_helmet:     0,
          not_wearing_helmet: 0,
          wearing_vest:       0,
          not_wearing_vest:   0,
        }
        const missing = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
        missing.includes('helmet') ? map[cam].not_wearing_helmet++ : map[cam].wearing_helmet++
        missing.includes('vest')   ? map[cam].not_wearing_vest++   : map[cam].wearing_vest++
      })
      setZoneData(Object.values(map).sort((a, b) => a.camera.localeCompare(b.camera)))
    } else {
      setZoneData([])
    }
    setZoneLoading(false)
  }, [])

  const loadStats = useCallback(async (d) => {
    const apiDate = toApiDate(d)
    setLoading(true)
    setError(null)

    try {
      const workerRes = await fetch(`/api/ppe-violations?date=${apiDate}&limit=500`)
      if (!workerRes.ok) throw new Error('Failed to load violations')
      const rawViolations = await workerRes.json()

      if (Array.isArray(rawViolations)) {
        const map = {}
        rawViolations.forEach(r => {
          const id = r.worker_id || 'Unknown'
          if (!map[id] || (r.timestamp || '') > (map[id].timestamp || '')) map[id] = r
        })
        const workers = Object.values(map)

        const total = workers.length
        const hOnly = workers.filter(r => {
          const m = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
          return m.includes('helmet') && !m.includes('vest')
        }).length
        const vOnly = workers.filter(r => {
          const m = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
          return !m.includes('helmet') && m.includes('vest')
        }).length
        const both = workers.filter(r => {
          const m = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
          return m.includes('helmet') && m.includes('vest')
        }).length

        setTotalViolations(total)
        setOnlyHelmetMiss(hOnly)
        setOnlyVestMiss(vOnly)
        setBothMiss(both)

        await loadZoneData(apiDate, rawViolations)
      } else {
        setTotalViolations(0)
        setOnlyHelmetMiss(0)
        setOnlyVestMiss(0)
        setBothMiss(0)
        setZoneData([])
      }
    } catch (err) {
      setError('Failed to load compliance data.')
    }

    setLoading(false)
  }, [loadZoneData])

  useEffect(() => { loadStats(date) }, [date, loadStats])

  const handleDateChange = (e) => {
    const d = e.target.value
    setDate(d)
    onDateChange?.(d)
  }

  const pct = (n) => totalViolations > 0 ? Math.round((n / totalViolations) * 100) : 0

  return (
    <div>

      {/* ── Date picker bar ── */}
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing data for:</span>
        <input
          type="date" className="date-picker"
          value={date} onChange={handleDateChange} max={today}
        />
        <span className="date-bar-hint">← change date to update compliance data</span>
        <button
          onClick={() => loadStats(date)}
          disabled={loading}
          style={{
            marginLeft:   8,
            background:   'var(--bg-base)',
            border:       '1px solid var(--border)',
            borderRadius: 4,
            color:        'var(--text-muted)',
            padding:      '3px 10px',
            fontSize:     11,
            cursor:       loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          background:   'rgba(229,62,62,0.12)',
          border:       '1px solid rgba(229,62,62,0.3)',
          borderRadius: 6,
          padding:      '10px 14px',
          marginBottom: 12,
          color:        'var(--red-alert)',
          fontSize:     12,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── 4 KPI cards ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 16 }}>

        <div className="stat-card red">
          <div className="stat-icon">🚨</div>
          <div className="stat-label">TOTAL VIOLATIONS</div>
          <div className="stat-value red" style={{ fontSize: 26 }}>
            {loading ? '…' : totalViolations}
          </div>
          <div className="stat-delta">workers with any PPE missing</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-icon">⛑️</div>
          <div className="stat-label">ONLY HELMET MISSING</div>
          <div className="stat-value amber" style={{ fontSize: 26 }}>
            {loading ? '…' : `${onlyHelmetMiss} / ${totalViolations}`}
          </div>
          <div className="stat-delta">
            {loading ? '—' : `${pct(onlyHelmetMiss)}% of violations · vest OK`}
          </div>
        </div>

        <div className="stat-card amber">
          <div className="stat-icon">🦺</div>
          <div className="stat-label">ONLY VEST MISSING</div>
          <div className="stat-value amber" style={{ fontSize: 26 }}>
            {loading ? '…' : `${onlyVestMiss} / ${totalViolations}`}
          </div>
          <div className="stat-delta">
            {loading ? '—' : `${pct(onlyVestMiss)}% of violations · helmet OK`}
          </div>
        </div>

        <div className="stat-card red">
          <div className="stat-icon">❌</div>
          <div className="stat-label">BOTH MISSING</div>
          <div className="stat-value red" style={{ fontSize: 26 }}>
            {loading ? '…' : `${bothMiss} / ${totalViolations}`}
          </div>
          <div className="stat-delta">
            {loading ? '—' : `${pct(bothMiss)}% high risk ⚠`}
          </div>
        </div>

      </div>

      {/* ── Zone-wise compliance bar chart ── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">📹 Zone-wise Compliance vs Non-Compliance — Per Camera</div>
          <div className="panel-subtitle">
            {zoneData.length > 0
              ? `${zoneData.length} camera${zoneData.length > 1 ? 's' : ''} · ${date}`
              : date}
          </div>
        </div>
        <div className="panel-body">
          <ZoneLegend />
          <div style={{ height: 260 }}>
            <ZoneComplianceChart zoneData={zoneData} loading={zoneLoading} />
          </div>
        </div>
      </div>

      {/* ── Worker vs Violations Trend chart ── */}
      <WorkerViolationTrendChart />

    </div>
  )
}
