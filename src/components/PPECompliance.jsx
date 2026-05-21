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
 
function scoreColor(pct) {
  if (pct >= 90) return 'var(--green-safe)'
  if (pct >= 60) return 'var(--amber)'
  return 'var(--red-alert)'
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
   WorkerViolationTrendChart — date-range / monthly / yearly line chart
   ============================================================ */

const RANGE_MODES = [
  { key: 'range',   label: 'Date Range' },
  { key: 'monthly', label: 'Monthly'    },
  { key: 'yearly',  label: 'Yearly'     },
]

function WorkerViolationTrendChart() {
  const today     = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [mode,      setMode]      = useState('range')
  const [rangeFrom, setRangeFrom] = useState(firstOfMonth)
  const [rangeTo,   setRangeTo]   = useState(today)
  const [month,     setMonth]     = useState(today.slice(0, 7))   // YYYY-MM
  const [year,      setYear]      = useState(today.slice(0, 4))   // YYYY

  const [trendData, setTrendData] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [peakWorkers, setPeakWorkers] = useState(null)
  const [peakViolations, setPeakViolations] = useState(null)
  const [totals, setTotals] = useState({ workers: 0, violations: 0 })

  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  /* ── fetch trend data from real /api/kpi-period endpoint ── */
  const loadTrend = useCallback(async () => {
    setLoading(true)
    try {
      if (mode === 'range' || mode === 'monthly') {
        const from = mode === 'monthly' ? `${month}-01` : rangeFrom
        const to   = mode === 'monthly'
          ? new Date(parseInt(month.slice(0,4)), parseInt(month.slice(5,7)), 0)
              .toISOString().split('T')[0]
          : rangeTo

        // Build list of days and fetch each in parallel
        const days = []
        const cur  = new Date(from)
        const end  = new Date(to)
        while (cur <= end) {
          days.push(cur.toISOString().split('T')[0])
          cur.setDate(cur.getDate() + 1)
        }

        // Cap end date at today — never fetch future dates
        const todayStr = new Date().toISOString().split('T')[0]
        const cappedDays = days.filter(d => d <= todayStr)

        const points = await Promise.all(
          cappedDays.map(async (day) => {
            try {
              const r = await fetch(`/api/kpi-period?date_from=${day}&date_to=${day}`)
              if (!r.ok) return { label: day, total_workers: 0, violations: 0 }
              const d = await r.json()
              return { label: day, total_workers: d.total_workers ?? 0, violations: d.total_violations ?? 0 }
            } catch {
              return { label: day, total_workers: 0, violations: 0 }
            }
          })
        )
        // Only drop days with no data at all (keeps 0-violation days but with workers)
        setTrendData(points.filter(p => p.total_workers > 0 || p.violations > 0))

      } else {
        // Yearly mode — fetch all months up to today (never future months)
        const MONTHS  = ['01','02','03','04','05','06','07','08','09','10','11','12']
        const MLABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const todayStr    = new Date().toISOString().split('T')[0]   // "2026-05-20"
        const currentYear = todayStr.slice(0, 4)                     // "2026"
        const currentMon  = parseInt(todayStr.slice(5, 7))           // 5  (May)

        const points = await Promise.all(
          MONTHS.map(async (mm, idx) => {
            const monthNum = idx + 1   // 1-based

            // Skip future months (only when viewing the current year)
            if (year === currentYear && monthNum > currentMon) return null

            const from = `${year}-${mm}-01`
            // Cap end at today for the current month of the current year
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
        // Keep all non-null points (includes months with 0 — they still show on axis)
        // but drop months where API returned null (future months)
        setTrendData(points.filter(p => p !== null))
      }
    } catch (err) {
      console.error('Trend load error:', err)
      setTrendData([])
    }
    setLoading(false)
  }, [mode, rangeFrom, rangeTo, month, year])

  useEffect(() => { loadTrend() }, [loadTrend])

  /* ── compute peak / totals ── */
  useEffect(() => {
    if (!trendData.length) { setPeakWorkers(null); setPeakViolations(null); return }
    const maxW  = trendData.reduce((m, d) => d.total_workers   > (m?.v ?? 0) ? { v: d.total_workers,   l: d.label } : m, null)
    const maxV  = trendData.reduce((m, d) => d.violations      > (m?.v ?? 0) ? { v: d.violations,      l: d.label } : m, null)
    const sumW  = trendData.reduce((s, d) => s + (d.total_workers ?? 0), 0)
    const sumV  = trendData.reduce((s, d) => s + (d.violations   ?? 0), 0)
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
          {
            label:           'Total Workers',
            data:            workerVals,
            borderColor:     'rgba(29,200,130,1)',
            backgroundColor: 'rgba(29,200,130,0.10)',
            borderWidth:     2.5,
            pointRadius:     3,
            pointHoverRadius: 6,
            tension:         0.4,
            fill:            true,
          },
          {
            label:           'Violations',
            data:            violVals,
            borderColor:     'rgba(229,62,62,0.9)',
            backgroundColor: 'rgba(229,62,62,0.07)',
            borderWidth:     2,
            borderDash:      [5, 3],
            pointRadius:     3,
            pointHoverRadius: 6,
            tension:         0.4,
            fill:            true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
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
              label: c => ` ${c.dataset.label}: ${c.parsed.y}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color:    '#666f82',
              font:     { size: 10 },
              maxTicksLimit: 12,
              autoSkip: true,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#666f82', font: { size: 10 } },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: 'count', color: '#4a5a72', font: { size: 10 } },
          },
        },
      },
    })
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [trendData])

  /* ── year options ── */
  const currentYear = parseInt(today.slice(0, 4))
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      {/* header */}
      <div className="panel-header">
        <div className="panel-title">📈 Total Workers vs Violations — Trend</div>
        <div className="panel-subtitle">
          {trendData.length > 0 ? `${trendData.length} data point${trendData.length > 1 ? 's' : ''}` : ''}
        </div>
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
                  padding:      '4px 12px',
                  borderRadius: 4,
                  border:       'none',
                  cursor:       'pointer',
                  fontSize:     11,
                  fontWeight:   mode === m.key ? 600 : 400,
                  background:   mode === m.key ? 'rgba(29,158,117,0.25)' : 'transparent',
                  color:        mode === m.key ? 'var(--green-safe)' : 'var(--text-muted)',
                  transition:   'all 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* date inputs depending on mode */}
          {mode === 'range' && (
            <>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                📅 From
                <input
                  type="date"
                  className="date-picker"
                  value={rangeFrom}
                  max={rangeTo}
                  onChange={e => setRangeFrom(e.target.value)}
                  style={{ marginLeft: 4 }}
                />
              </label>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                To
                <input
                  type="date"
                  className="date-picker"
                  value={rangeTo}
                  min={rangeFrom}
                  max={today}
                  onChange={e => setRangeTo(e.target.value)}
                  style={{ marginLeft: 4 }}
                />
              </label>
            </>
          )}

          {mode === 'monthly' && (
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              📅 Month
              <input
                type="month"
                className="date-picker"
                value={month}
                max={today.slice(0, 7)}
                onChange={e => setMonth(e.target.value)}
                style={{ marginLeft: 4 }}
              />
            </label>
          )}

          {mode === 'yearly' && (
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              📅 Year
              <select
                className="date-picker"
                value={year}
                onChange={e => setYear(e.target.value)}
                style={{ marginLeft: 4 }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          )}

          <button
            onClick={loadTrend}
            disabled={loading}
            style={{
              marginLeft: 'auto',
              background: 'var(--bg-base)',
              border:     '1px solid var(--border)',
              borderRadius: 4,
              color:      'var(--text-muted)',
              padding:    '3px 10px',
              fontSize:   11,
              cursor:     loading ? 'not-allowed' : 'pointer',
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
            fontSize:     11,
            color:        'var(--text-muted)',
          }}>
            <span>
              👷 <strong style={{ color: 'rgba(29,200,130,0.95)' }}>Peak Workers: {peakWorkers.v}</strong>
              <span style={{ opacity: 0.6 }}> @ {peakWorkers.l}</span>
            </span>
            <span>
              🚨 <strong style={{ color: 'rgba(229,62,62,0.9)' }}>Peak Violations: {peakViolations?.v ?? 0}</strong>
              <span style={{ opacity: 0.6 }}> @ {peakViolations?.l}</span>
            </span>
            <span style={{ opacity: 0.6 }}>Total Workers: {totals.workers}</span>
            <span style={{ opacity: 0.6 }}>Total Violations: {totals.violations}</span>
          </div>
        )}

        {/* ── legend ── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          {[
            { color: 'rgba(29,200,130,1)', label: 'Total Workers', dash: false },
            { color: 'rgba(229,62,62,0.9)', label: 'Violations',  dash: true  },
          ].map(({ color, label, dash }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              <svg width="24" height="10">
                {dash
                  ? <line x1="0" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2" strokeDasharray="5,3" />
                  : <line x1="0" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2.5" />
                }
              </svg>
              {label}
            </span>
          ))}
        </div>

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
 
  // violation breakdown counts (for KPI cards)
  const [totalViolations, setTotalViolations] = useState(0)
  const [onlyHelmetMiss,  setOnlyHelmetMiss]  = useState(0)
  const [onlyVestMiss,    setOnlyVestMiss]    = useState(0)
  const [bothMiss,        setBothMiss]        = useState(0)
 
  // ── Sync date from parent prop ──────────────────────────────
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
    } catch (_) { /* fall through to local aggregation */ }
 
    if (violationRows && violationRows.length > 0) {
      const map = {}
      violationRows.forEach(r => {
        const cam = r.camera || r.zone || 'Unknown'
        if (!map[cam]) map[cam] = {
          camera: cam,
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
        // Deduplicate by worker_id — keep latest
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
        setTotalViolations(0); setOnlyHelmetMiss(0); setOnlyVestMiss(0); setBothMiss(0)
        setZoneData([])
      }
    } catch (err) {
      setError('Failed to load compliance data.')
    }
 
    setLoading(false)
  }, [loadZoneData])
 
  useEffect(() => { loadStats(date) }, [date, loadStats])
 
  const handleDateChange = (e) => { const d = e.target.value; setDate(d); onDateChange?.(d) }
 
  const pct = (n) => totalViolations > 0 ? Math.round((n / totalViolations) * 100) : 0
 
  return (
    <div>
 
      {/* ── Date picker bar ── */}
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing data for:</span>
        <input type="date" className="date-picker" value={date} onChange={handleDateChange} max={today} />
        <span className="date-bar-hint">← change date to update compliance data</span>
        <button
          onClick={() => loadStats(date)}
          disabled={loading}
          style={{
            marginLeft: 8, background: 'var(--bg-base)',
            border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text-muted)', padding: '3px 10px',
            fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>
 
      {/* ── Error banner ── */}
      {error && (
        <div style={{
          background: 'rgba(229,62,62,0.12)', border: '1px solid rgba(229,62,62,0.3)',
          borderRadius: 6, padding: '10px 14px', marginBottom: 12,
          color: 'var(--red-alert)', fontSize: 12,
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
 
 