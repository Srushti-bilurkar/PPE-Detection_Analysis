import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

// ── date format helper ────────────────────────────────────────────────────
function toApiDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split('-')
    return `${yyyy}-${mm}-${dd}`
  }
  return dateStr
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONE COMPLIANCE CHART
// ═══════════════════════════════════════════════════════════════════════════
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
          { label:'Helmet — Compliance',     data:zoneData.map(z=>z.wearing_helmet??0),     backgroundColor:'rgba(29,158,117,0.70)', borderColor:'rgba(29,158,117,0.95)', borderWidth:1, borderRadius:3 },
          { label:'Helmet — Non-Compliance', data:zoneData.map(z=>z.not_wearing_helmet??0), backgroundColor:'rgba(192,57,43,0.65)',  borderColor:'rgba(192,57,43,0.90)',  borderWidth:1, borderRadius:3 },
          { label:'Vest — Compliance',       data:zoneData.map(z=>z.wearing_vest??0),       backgroundColor:'rgba(24,95,165,0.65)',  borderColor:'rgba(24,95,165,0.90)',  borderWidth:1, borderRadius:3 },
          { label:'Vest — Non-Compliance',   data:zoneData.map(z=>z.not_wearing_vest??0),   backgroundColor:'rgba(186,117,23,0.65)', borderColor:'rgba(186,117,23,0.90)', borderWidth:1, borderRadius:3 },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ display:false },
          tooltip:{
            backgroundColor:'rgba(16,24,36,0.92)', titleColor:'#c8d4e8', bodyColor:'#8a9ab8',
            borderColor:'rgba(255,255,255,0.08)', borderWidth:1, padding:10,
            callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` }
          }
        },
        scales:{
          x:{ ticks:{ color:'#888780', font:{ size:11 }, autoSkip:false }, grid:{ color:'rgba(255,255,255,0.04)' } },
          y:{ beginAtZero:true, ticks:{ color:'#888780', font:{ size:11 }, stepSize:5 }, grid:{ color:'rgba(255,255,255,0.04)' }, title:{ display:true, text:'count', color:'#5a6a82', font:{ size:11 } } },
        },
      },
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [zoneData])

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text-muted)',fontSize:13 }}>Loading zone data…</div>
  if (!zoneData || zoneData.length === 0) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text-muted)',fontSize:13 }}>No zone data for this date</div>
  return <canvas ref={canvasRef} style={{ width:'100%', height:'100%' }} />
}

const ZONE_LEGEND = [
  { label:'Helmet — Compliance',     color:'rgba(29,158,117,0.85)' },
  { label:'Helmet — Non-Compliance', color:'rgba(192,57,43,0.85)'  },
  { label:'Vest — Compliance',       color:'rgba(24,95,165,0.85)'  },
  { label:'Vest — Non-Compliance',   color:'rgba(186,117,23,0.85)' },
]

function ZoneLegend() {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 18px', marginBottom:10 }}>
      {ZONE_LEGEND.map(({ label, color }) => (
        <span key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--text-muted)' }}>
          <span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:color, flexShrink:0 }} />
          {label}
        </span>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE MODES
// ═══════════════════════════════════════════════════════════════════════════
const RANGE_MODES = [
  { key:'date',    label:'Date'       },
  { key:'range',   label:'Date Range' },
  { key:'monthly', label:'Monthly'    },
  { key:'yearly',  label:'Yearly'     },
]

// ═══════════════════════════════════════════════════════════════════════════
// WORKER VIOLATION TREND CHART
// ═══════════════════════════════════════════════════════════════════════════
function WorkerViolationTrendChart({
  selectedLocation = '',
  trendMode, singleDate, rangeFrom, rangeTo, month, year,
}) {
  const [showTotalWorkers, setShowTotalWorkers] = useState(true)
  const [showWorkers,      setShowWorkers]      = useState(true)
  const [showNewViols,     setShowNewViols]     = useState(true)
  const [showRepViols,     setShowRepViols]     = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const [trendData,      setTrendData]      = useState([])
  const [loading,        setLoading]        = useState(false)
  const [peakWorkers,    setPeakWorkers]    = useState(null)
  const [peakViolations, setPeakViolations] = useState(null)
  const [totals,         setTotals]         = useState({ workers:0, newViols:0, repViols:0 })
  const [dataNote,       setDataNote]       = useState('')

  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  // ── fetch ─────────────────────────────────────────────────────────────
  const loadTrend = useCallback(async () => {
    setLoading(true)
    setDataNote('')
    const cp = selectedLocation ? `&camera=${encodeURIComponent(selectedLocation)}` : ''

    try {
      if (trendMode === 'date') {
        const apiDate = toApiDate(singleDate)
        const r = await fetch(`/api/live-trend?date=${apiDate}&shift=both${cp}`)
        if (!r.ok) { setTrendData([]); setLoading(false); return }
        const raw = await r.json()
        setTrendData((Array.isArray(raw) ? raw : []).map(d => ({
          label:        d.minute,
          workers:      Math.max(0, (d.total_workers ?? d.max_workers ?? 0) - (d.new_violations ?? 0) - (d.repeated_violations ?? 0)),
          totalWorkers: d.total_workers       ?? d.max_workers ?? 0,
          newViols:     d.new_violations      ?? 0,
          repViols:     d.repeated_violations ?? 0,
        })))
        setLoading(false)
        return
      }

      let url = `/api/trend-summary?mode=${trendMode}${cp}`
      if (trendMode === 'range')   url += `&date_from=${rangeFrom}&date_to=${rangeTo}`
      if (trendMode === 'monthly') url += `&month=${month}`
      if (trendMode === 'yearly')  url += `&year=${year}`

      const r = await fetch(url)
      if (!r.ok) { setTrendData([]); setLoading(false); return }
      const raw = await r.json()

      const points = (Array.isArray(raw) ? raw : []).map(d => ({
        label:        d.label,
        workers:      d.avg_workers              ?? 0,
        totalWorkers: d.avg_total_workers         ?? d.peak_workers ?? 0,
        newViols:     d.avg_new_violations        ?? 0,
        repViols:     d.avg_repeated_violations   ?? 0,
        _peakWorkers: d.peak_workers              ?? 0,
        _totalNew:    d.total_new_violations      ?? 0,
        _totalRep:    d.total_repeated_violations ?? 0,
        _dataPoints:  d.data_points               ?? 0,
      }))

      setTrendData(points)

      if (points.length > 0) {
        if (trendMode === 'range') {
          const totalDays = Math.round((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1
          if (points.length < totalDays)
            setDataNote(`Data on ${points.length} of ${totalDays} days in range`)
        } else if (trendMode === 'monthly') {
          const [y2, m2] = month.split('-').map(Number)
          const daysInMonth = new Date(y2, m2, 0).getDate()
          if (points.length < daysInMonth)
            setDataNote(`Data on ${points.length} of ${daysInMonth} days this month`)
        } else if (trendMode === 'yearly') {
          if (points.length < 12)
            setDataNote(`Data in ${points.length} of 12 months this year`)
        }
      }

    } catch (err) {
      console.error('Trend load error:', err)
      setTrendData([])
    }
    setLoading(false)
  }, [trendMode, singleDate, rangeFrom, rangeTo, month, year, selectedLocation])

  useEffect(() => { loadTrend() }, [loadTrend])

  // ── peak / totals ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!trendData.length) {
      setPeakWorkers(null); setPeakViolations(null)
      setTotals({ workers:0, newViols:0, repViols:0 }); return
    }
    if (trendMode === 'date') {
      setPeakWorkers(trendData.reduce((m,d) => d.workers > (m?.v??0) ? {v:d.workers, l:d.label} : m, null))
      setPeakViolations(trendData.reduce((m,d) => d.newViols > (m?.v??0) ? {v:d.newViols, l:d.label} : m, null))
      setTotals({
        workers:  trendData.reduce((s,d) => s+(d.workers??0), 0),
        newViols: trendData.reduce((s,d) => s+(d.newViols??0), 0),
        repViols: trendData.reduce((s,d) => s+(d.repViols??0), 0),
      })
    } else {
      const maxW = trendData.reduce((m,d) => (d._peakWorkers??0)>(m?.v??0) ? {v:d._peakWorkers,l:d.label} : m, null)
      const maxV = trendData.reduce((m,d) => (d._totalNew??0)>(m?.v??0)    ? {v:d._totalNew,   l:d.label} : m, null)
      setPeakWorkers(maxW); setPeakViolations(maxV)
      setTotals({
        workers:  maxW?.v ?? 0,
        newViols: trendData.reduce((s,d) => s+(d._totalNew??0), 0),
        repViols: trendData.reduce((s,d) => s+(d._totalRep??0), 0),
      })
    }
  }, [trendData, trendMode])

  // ── draw chart ────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = canvasRef.current
    if (!ctx) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    if (!trendData.length) return

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trendData.map(d => d.label),
        datasets: [
          showTotalWorkers && {
            label:'Total Workers',
            data: trendData.map(d => d.totalWorkers ?? 0),
            borderColor:'rgba(59,130,246,1)',
            backgroundColor:'rgba(59,130,246,0.07)',
            borderWidth:2, pointRadius:trendMode==='date'?0:3, pointHoverRadius:trendMode==='date'?4:6, tension:0.5, cubicInterpolationMode:'default', fill:true,
          },
          showWorkers && {
            label:'Safe Workers',
            data: trendData.map(d => d.workers ?? 0),
            borderColor:'rgba(29,200,130,1)',
            backgroundColor:'rgba(29,200,130,0.10)',
            borderWidth:2.5, pointRadius:trendMode==='date'?0:3, pointHoverRadius:trendMode==='date'?4:6, tension:0.5, cubicInterpolationMode:'default', fill:true,
          },
          showNewViols && {
            label:'New Violations',
            data: trendData.map(d => d.newViols ?? 0),
            borderColor:'rgba(229,62,62,0.9)',
            backgroundColor:'rgba(229,62,62,0.07)',
            borderWidth:2, borderDash:[5,3], pointRadius:trendMode==='date'?0:3, pointHoverRadius:trendMode==='date'?4:6, tension:0.5, cubicInterpolationMode:'default', fill:true,
          },
          showRepViols && {
            label:'Repeated Violations',
            data: trendData.map(d => d.repViols ?? 0),
            borderColor:'rgba(251,146,60,0.9)',
            backgroundColor:'rgba(251,146,60,0.07)',
            borderWidth:1.8, borderDash:[3,3], pointRadius:trendMode==='date'?0:3, pointHoverRadius:trendMode==='date'?4:6, tension:0.5, cubicInterpolationMode:'default', fill:true,
          },
        ].filter(Boolean),
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ display:false },
          tooltip:{
            backgroundColor:'rgba(16,24,36,0.92)', titleColor:'#c8d4e8', bodyColor:'#8a9ab8',
            borderColor:'rgba(255,255,255,0.08)', borderWidth:1, padding:10,
            mode:'index', intersect:false,
            callbacks:{
              title: items => items[0]?.label ?? '',
              label: c => ` ${c.dataset.label}: ${trendMode==='date' ? c.parsed.y : c.parsed.y.toFixed(2)+' avg'}`,
            },
          },
        },
        scales:{
          x: {
            ticks: {
              color: '#666f82', font: { size: 10 }, autoSkip: false, maxRotation: 0,
              callback: function(val, index) {
                const label = trendData[index]?.label ?? ''
                if (trendMode !== 'date') return label
                if (!label) return ''
                const [hh] = label.split(':')
                const hour = parseInt(hh, 10)
                const prevLabel = trendData[index - 1]?.label ?? ''
                const prevHour = prevLabel ? parseInt(prevLabel.split(':')[0], 10) : -1
                return hour !== prevHour ? String(hour) : ''
              },
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
            title: {
              display: true,
              text: trendMode === 'date' ? 'Hour' : trendMode === 'yearly' ? 'Month' : 'Date',
              color: '#5a6a82', font: { size: 10 },
            },
          },
          y:{
            beginAtZero:true,
            ticks:{
              color:'#666f82', font:{ size:10 },
              callback: v => trendMode==='date' ? (Number.isInteger(v) ? v : null) : v.toFixed(1),
            },
            grid:{ color:'rgba(255,255,255,0.04)' },
            title:{ display:true, text:trendMode==='date'?'count (per minute)':'avg per active minute', color:'#4a5a72', font:{ size:10 } },
          },
        },
      },
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [trendData, showWorkers, showNewViols, showRepViols, showTotalWorkers, trendMode])

  const subtitle = (() => {
    const pts = trendData.length > 0 ? ` · ${trendData.length} pt${trendData.length>1?'s':''}` : ''
    if (trendMode==='date')    return `Per-minute data · ${singleDate}${pts}`
    if (trendMode==='range')   return `Daily average · ${rangeFrom} → ${rangeTo}${pts}`
    if (trendMode==='monthly') return `Daily average · ${month}${pts}`
    if (trendMode==='yearly')  return `Monthly average · ${year}${pts}`
    return ''
  })()

  return (
    <div className="panel" style={{ marginTop:16 }}>
      <div className="panel-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div className="panel-title">📈 Worker Safety Trend — <span style={{ fontWeight:400, fontSize:12, color:'var(--text-muted)' }}>{subtitle}</span></div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 10px',
                        border:'1px solid var(--border)', borderRadius:4, background:'var(--bg-panel)' }}>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(59,130,246,1)', cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={showTotalWorkers} onChange={e => setShowTotalWorkers(e.target.checked)} style={{ accentColor:'rgba(59,130,246,1)', width:13, height:13 }} />
              Total Workers
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(29,200,130,1)', cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={showWorkers} onChange={e => setShowWorkers(e.target.checked)} style={{ accentColor:'rgba(29,200,130,1)', width:13, height:13 }} />
              Safe Workers
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(229,62,62,0.9)', cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={showNewViols} onChange={e => setShowNewViols(e.target.checked)} style={{ accentColor:'rgba(229,62,62,0.9)', width:13, height:13 }} />
              New Violations
            </label>
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(251,146,60,0.9)', cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={showRepViols} onChange={e => setShowRepViols(e.target.checked)} style={{ accentColor:'rgba(251,146,60,0.9)', width:13, height:13 }} />
              Repeated
            </label>
          </div>
          <button onClick={loadTrend} disabled={loading} style={{
            background:'var(--bg-base)', border:'1px solid var(--border)',
            borderRadius:4, color:'var(--text-muted)', padding:'3px 10px', fontSize:11,
            cursor:loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      <div className="panel-body">
        {!loading && dataNote && (
          <div style={{ fontSize:10, color:'rgba(251,146,60,0.8)', marginBottom:6, padding:'4px 10px', background:'rgba(251,146,60,0.07)', borderRadius:4, border:'1px solid rgba(251,146,60,0.15)', display:'inline-block' }}>
            📊 {dataNote} — averages from days with data only
          </div>
        )}
        {trendMode!=='date' && !loading && trendData.length>0 && (
          <div style={{ fontSize:10, color:'var(--text-muted)', opacity:0.5, marginBottom:6, fontStyle:'italic' }}>
            ℹ️ Y-axis: average per active minute within each {trendMode==='yearly'?'month':'day'}
          </div>
        )}
        <div style={{ height:280, position:'relative' }}>
          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-muted)', fontSize:13 }}>Loading trend data…</div>
          ) : trendData.length===0 ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:6 }}>
              <div style={{ color:'var(--text-muted)', fontSize:13 }}>No data for selected period</div>
              {trendMode!=='date' && <div style={{ color:'var(--text-muted)', fontSize:11, opacity:0.5 }}>Try a different range or check if data exists</div>}
            </div>
          ) : (
            <canvas ref={canvasRef} style={{ width:'100%', height:'100%' }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PPECompliance — main export
// ═══════════════════════════════════════════════════════════════════════════
export default function PPECompliance({ selectedDate, onDateChange, visibleLocations = [], isAdmin = false }) {

  const LOCATIONS = [
    { label: 'All Locations', value: '' },
    ...visibleLocations.flatMap(loc => {
      if (loc.subLocations) {
        return loc.subLocations.map(sub => ({
          label: `${loc.label} — ${sub.label}`,
          value: sub.cameras[0]?.name ?? '',
        }))
      }
      return [{ label: loc.label, value: loc.cameras[0]?.name ?? '' }]
    }),
  ]

  const [selectedLocation, setSelectedLocation] = useState(() =>
    isAdmin ? '' : (
      visibleLocations.flatMap(loc =>
        loc.subLocations
          ? loc.subLocations.flatMap(s => s.cameras)
          : loc.cameras
      )[0]?.name ?? ''
    )
  )

  const today        = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'
  const currentYear  = today.slice(0, 4)

  const [date,        setDate]        = useState(toApiDate(selectedDate) || today)
  const [loading,     setLoading]     = useState(false)
  const [zoneLoading, setZoneLoading] = useState(false)
  const [error,       setError]       = useState(null)
  const [zoneData,    setZoneData]    = useState([])

  const [totalViolations, setTotalViolations] = useState(0)
  const [onlyHelmetMiss,  setOnlyHelmetMiss]  = useState(0)
  const [onlyVestMiss,    setOnlyVestMiss]    = useState(0)
  const [bothMiss,        setBothMiss]        = useState(0)

  // ✅ NEW — max workers states
  const [maxWorkers,     setMaxWorkers]     = useState(0)
  const [maxSafeWorkers, setMaxSafeWorkers] = useState(0)

  const [trendMode,  setTrendMode]  = useState('date')
  const [rangeFrom,  setRangeFrom]  = useState(firstOfMonth)
  const [rangeTo,    setRangeTo]    = useState(today)
  const [trendMonth, setTrendMonth] = useState(today.slice(0, 7))
  const [trendYear,  setTrendYear]  = useState(currentYear)

  const yearOptions = Array.from({ length:5 }, (_,i) => parseInt(currentYear) - i)

  const singleDate = trendMode === 'date' ? date : date

  useEffect(() => {
    if (selectedDate) {
      const n = toApiDate(selectedDate)
      setDate(prev => prev !== n ? n : prev)
    }
  }, [selectedDate])

  const loadZoneData = useCallback(async (apiDate, violationRows, camParam) => {
    setZoneLoading(true)
    try {
      const res = await fetch(`/api/ppe-compliance-by-zone?date=${apiDate}${camParam}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) { setZoneData(data); setZoneLoading(false); return }
      }
    } catch (_) {}

    if (violationRows && violationRows.length > 0) {
      const map = {}
      violationRows.forEach(r => {
        const cam = r.camera || r.zone || 'Unknown'
        if (!map[cam]) map[cam] = { camera:cam, wearing_helmet:0, not_wearing_helmet:0, wearing_vest:0, not_wearing_vest:0 }
        const missing = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
        missing.includes('helmet') ? map[cam].not_wearing_helmet++ : map[cam].wearing_helmet++
        missing.includes('vest')   ? map[cam].not_wearing_vest++   : map[cam].wearing_vest++
      })
      setZoneData(Object.values(map).sort((a,b) => a.camera.localeCompare(b.camera)))
    } else { setZoneData([]) }

    setZoneLoading(false)
  }, [])

  // ── loadStats ─────────────────────────────────────────────────────────
  const loadStats = useCallback(async (d) => {
    const camParam = selectedLocation ? `&camera=${encodeURIComponent(selectedLocation)}` : ''
    setLoading(true); setError(null)

    const fetchRange = async (fromDate, toDate) => {
      const from = new Date(fromDate)
      const to   = new Date(toDate)
      const days = []
      for (let dt = new Date(from); dt <= to; dt.setDate(dt.getDate() + 1))
        days.push(dt.toISOString().split('T')[0])

      const batchSize = 31
      const flat = []
      for (let i = 0; i < days.length; i += batchSize) {
        const batch = days.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(day =>
            fetch(`/api/ppe-violations?date=${day}&limit=5000${camParam}`)
              .then(r => r.ok ? r.json() : [])
              .catch(() => [])
          )
        )
        results.forEach(arr => Array.isArray(arr) && flat.push(...arr))
      }
      return flat
    }

    const applyFlat = async (flat, zoneRefDate) => {
      setTotalViolations(flat.length)
      setOnlyHelmetMiss(flat.filter(r => r.violation_type === 'no_helmet').length)
      setOnlyVestMiss(flat.filter(r => r.violation_type === 'no_vest').length)
      setBothMiss(flat.filter(r => r.violation_type === 'both_missing').length)
      await loadZoneData(toApiDate(zoneRefDate), flat, camParam)
    }

    try {
      if (trendMode === 'range') {
        const flat = await fetchRange(rangeFrom, rangeTo)
        await applyFlat(flat, rangeTo)
        // Reset max workers for range mode
        setMaxWorkers(0); setMaxSafeWorkers(0)

      } else if (trendMode === 'monthly') {
        const [y, m]  = trendMonth.split('-').map(Number)
        const start   = `${trendMonth}-01`
        const lastDay = new Date(y, m, 0).toISOString().split('T')[0]
        const end     = lastDay > today ? today : lastDay
        const flat    = await fetchRange(start, end)
        await applyFlat(flat, end)
        // Reset max workers for monthly mode
        setMaxWorkers(0); setMaxSafeWorkers(0)

      } else if (trendMode === 'yearly') {
        const start = `${trendYear}-01-01`
        const end   = `${trendYear}-12-31` > today ? today : `${trendYear}-12-31`
        const flat  = await fetchRange(start, end)
        await applyFlat(flat, end)
        // Reset max workers for yearly mode
        setMaxWorkers(0); setMaxSafeWorkers(0)

      } else {
        // ── Single date ──────────────────────────────────────────────
        const apiDate = toApiDate(d)
        const res = await fetch(`/api/ppe-violations?date=${apiDate}&limit=5000${camParam}`)
        if (!res.ok) throw new Error('Failed')
        const raw = await res.json()
        if (Array.isArray(raw)) {
          await applyFlat(raw, apiDate)
        } else {
          setTotalViolations(0); setOnlyHelmetMiss(0); setOnlyVestMiss(0); setBothMiss(0); setZoneData([])
        }

        // ✅ Fetch hourly trend for max workers — from SAME peak hour frame
        try {
          const trendRes = await fetch(`/api/hourly-trend?date=${apiDate}&shift=both${camParam}`)
          if (trendRes.ok) {
            const trendRows = await trendRes.json()
            if (Array.isArray(trendRows) && trendRows.length > 0) {
              // Step 1: Find the hour with MAX workers_active
              const peakRow = trendRows.reduce((best, row) =>
                (Number(row.workers_active || row.max_workers || 0)) >
                (Number(best.workers_active || best.max_workers || 0))
                  ? row : best
              , trendRows[0])
              // Step 2: Take violations from THAT SAME hour only
              const maxW     = Number(peakRow.workers_active || peakRow.max_workers || 0)
              const maxViols = Number(peakRow.violations || peakRow.new_violations || 0)
              setMaxWorkers(maxW)
              setMaxSafeWorkers(Math.max(0, maxW - maxViols))
            } else {
              setMaxWorkers(0); setMaxSafeWorkers(0)
            }
          } else {
            setMaxWorkers(0); setMaxSafeWorkers(0)
          }
        } catch {
          setMaxWorkers(0); setMaxSafeWorkers(0)
        }
      }

    } catch { setError('Failed to load compliance data.') }

    setLoading(false)
  }, [selectedLocation, loadZoneData, trendMode, rangeFrom, rangeTo, trendMonth, trendYear, today])

  useEffect(() => { loadStats(date) }, [date, selectedLocation, loadStats, trendMode, rangeFrom, rangeTo, trendMonth, trendYear])

  const handleDateChange = e => { const d = e.target.value; setDate(d); onDateChange?.(d) }

  const pct = n => totalViolations > 0 ? Math.round((n / totalViolations) * 100) : 0
  const locationLabel = LOCATIONS.find(l => l.value === selectedLocation)?.label || 'All Locations'

  // Derived values for new card
  const maxAtRisk = Math.max(0, maxWorkers - maxSafeWorkers)

  return (
    <div>

      {/* ── FROZEN FILTER BAR ── */}
      <div style={{
        position:'sticky', top:0, zIndex:50,
        background:'var(--bg-base)',
        borderBottom:'1px solid var(--border)',
        padding:'8px 16px',
        display:'flex', flexWrap:'wrap', alignItems:'center', gap:10,
        backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)',
      }}>

        {/* Location */}
        <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>📍 Location:</span>
        <div style={{ position:'relative', display:'inline-block' }}>
          <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} style={{
            background:'var(--bg-panel)',
            border:`1px solid ${selectedLocation ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
            borderRadius:6, color:selectedLocation ? '#a5b4fc' : 'var(--text-primary)',
            padding:'4px 36px 4px 12px', fontSize:12, cursor:'pointer',
            fontWeight:selectedLocation ? 600 : 400, appearance:'none', outline:'none', transition:'border-color 0.15s',
          }}>
            {LOCATIONS.map(loc => (
              <option key={loc.value} value={loc.value} style={{ background:'#1e293b', color:'#e2e8f0' }}>{loc.label}</option>
            ))}
          </select>
          <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color:'var(--text-muted)', fontSize:20 }}>▾</span>
        </div>

        {selectedLocation && isAdmin && (
          <button onClick={() => setSelectedLocation('')} style={{
            background:'none', border:'1px solid rgba(255,255,255,0.08)', borderRadius:5,
            color:'#64748b', cursor:'pointer', fontSize:11, padding:'2px 8px', lineHeight:1.6,
          }}>✕ All</button>
        )}

        {selectedLocation && (
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:'rgba(99,102,241,0.15)', color:'#a5b4fc', border:'1px solid rgba(99,102,241,0.3)' }}>
            {locationLabel}
          </span>
        )}

        {/* Trend mode tabs */}
        <span style={{ fontSize:12, color:'var(--text-muted)', whiteSpace:'nowrap' }}>📈 Trend:</span>
        <div style={{ display:'flex', gap:2, background:'rgba(255,255,255,0.04)', borderRadius:6, padding:3 }}>
          {RANGE_MODES.map(m => (
            <button key={m.key} onClick={() => setTrendMode(m.key)} style={{
              padding:'4px 12px', borderRadius:4, border:'none', cursor:'pointer',
              fontSize:11, fontWeight:trendMode === m.key ? 600 : 400,
              background:trendMode === m.key ? 'rgba(29,158,117,0.25)' : 'transparent',
              color:trendMode === m.key ? 'var(--green-safe)' : 'var(--text-muted)',
              transition:'all 0.15s',
            }}>{m.label}</button>
          ))}
        </div>

        {/* Date inputs per mode */}
        {trendMode === 'date' && (
          <label style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5 }}>
            📅
            <input type="date" className="date-picker" value={date} max={today} onChange={handleDateChange} style={{ marginLeft:4, fontSize:11 }} />
            {date === today && <span style={{ fontSize:10, color:'rgba(29,200,130,1)', marginLeft:4 }}>LIVE</span>}
          </label>
        )}

        {trendMode === 'range' && <>
          <label style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5 }}>
            📅 From <input type="date" className="date-picker" value={rangeFrom} max={rangeTo} onChange={e => setRangeFrom(e.target.value)} style={{ marginLeft:4, fontSize:11 }} />
          </label>
          <label style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5 }}>
            To <input type="date" className="date-picker" value={rangeTo} min={rangeFrom} max={today} onChange={e => setRangeTo(e.target.value)} style={{ marginLeft:4, fontSize:11 }} />
          </label>
        </>}

        {trendMode === 'monthly' && (
          <label style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5 }}>
            📅 <input type="month" className="date-picker" value={trendMonth} max={today.slice(0,7)} onChange={e => setTrendMonth(e.target.value)} style={{ marginLeft:4, fontSize:11 }} />
          </label>
        )}

        {trendMode === 'yearly' && (
          <label style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5 }}>
            📅 <select className="date-picker" value={trendYear} onChange={e => setTrendYear(e.target.value)} style={{ marginLeft:4, fontSize:11 }}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}

        <span style={{ color:'var(--border)', fontSize:16, userSelect:'none', margin:'0 2px' }}>|</span>
      </div>
      {/* end frozen bar */}

      <div style={{ padding:'16px 0 0 0' }}>

        {error && (
          <div style={{ background:'rgba(229,62,62,0.12)', border:'1px solid rgba(229,62,62,0.3)', borderRadius:6, padding:'10px 14px', marginBottom:12, color:'var(--red-alert)', fontSize:12 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── 5 KPI cards ── */}
        <div className="stat-grid" style={{ gridTemplateColumns:'repeat(5,1fr)', marginBottom:16 }}>

          {/* Card 1 — Total Violations */}
          <div className="stat-card red">
            <div className="stat-icon">🚨</div>
            <div className="stat-label">TOTAL VIOLATIONS</div>
            <div className="stat-value red" style={{ fontSize:26 }}>{loading ? '…' : totalViolations}</div>
            <div className="stat-delta">
              {selectedLocation ? `${locationLabel} only` : 'workers with any PPE missing'}
              {trendMode === 'range' && !loading && ` · ${rangeFrom} → ${rangeTo}`}
            </div>
          </div>

          {/* Card 2 — Only Helmet Missing */}
          <div className="stat-card amber">
            <div className="stat-icon">⛑️</div>
            <div className="stat-label">ONLY HELMET MISSING</div>
            <div className="stat-value amber" style={{ fontSize:26 }}>{loading ? '…' : `${onlyHelmetMiss} / ${totalViolations}`}</div>
            <div className="stat-delta">{loading ? '—' : `${pct(onlyHelmetMiss)}% of violations · vest OK`}</div>
          </div>

          {/* Card 3 — Only Vest Missing */}
          <div className="stat-card amber">
            <div className="stat-icon">🦺</div>
            <div className="stat-label">ONLY VEST MISSING</div>
            <div className="stat-value amber" style={{ fontSize:26 }}>{loading ? '…' : `${onlyVestMiss} / ${totalViolations}`}</div>
            <div className="stat-delta">{loading ? '—' : `${pct(onlyVestMiss)}% of violations · helmet OK`}</div>
          </div>

          {/* Card 4 — Both Missing */}
          <div className="stat-card red">
            <div className="stat-icon">❌</div>
            <div className="stat-label">BOTH MISSING</div>
            <div className="stat-value red" style={{ fontSize:26 }}>{loading ? '…' : `${bothMiss} / ${totalViolations}`}</div>
            <div className="stat-delta">{loading ? '—' : `${pct(bothMiss)}% high risk ⚠`}</div>
          </div>

          {/* ✅ Card 5 — Max Workers (NEW) */}
          <div className="stat-card" style={{
            border:'1px solid rgba(34,201,132,0.3)',
            borderTop:'3px solid #22c984',
          }}>
            <div className="stat-icon">👷</div>
            <div className="stat-label" style={{ color:'#22c984' }}>PEAK HOUR WORKERS</div>
            <div className="stat-value" style={{ fontSize:26, color:'#22c984' }}>
              {loading ? '…' : trendMode !== 'date' ? '—' : maxWorkers}
            </div>
            <div className="stat-delta" style={{ display:'flex', flexDirection:'column', gap:4, marginTop:4 }}>
              <span style={{ color:'#22c984', fontSize:11 }}>
                ✓ Max Safe: <strong>{loading ? '…' : trendMode !== 'date' ? '—' : maxSafeWorkers}</strong>
              </span>
              <span style={{ color:'#ef4444', fontSize:11 }}>
                ✗ At Risk: <strong>{loading ? '…' : trendMode !== 'date' ? '—' : maxAtRisk}</strong>
              </span>
              {trendMode !== 'date' && (
                <span style={{ color:'#64748b', fontSize:10, marginTop:2 }}>
                  Available in Date mode only
                </span>
              )}
            </div>
          </div>

        </div>

        {/* ── Zone chart ── */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">📹 Zone-wise Compliance vs Non-Compliance — Per Camera</div>
            <div className="panel-subtitle">
              {zoneData.length > 0
                ? `${zoneData.length} camera${zoneData.length > 1 ? 's' : ''} · ${trendMode === 'range' ? `${rangeFrom} → ${rangeTo}` : date}${selectedLocation ? ` · ${locationLabel}` : ''}`
                : `${trendMode === 'range' ? `${rangeFrom} → ${rangeTo}` : date}${selectedLocation ? ` · ${locationLabel}` : ''}`}
            </div>
          </div>
          <div className="panel-body">
            <ZoneLegend />
            <div style={{ height:260 }}>
              <ZoneComplianceChart zoneData={zoneData} loading={zoneLoading} />
            </div>
          </div>
        </div>

        {/* ── Trend chart ── */}
        <WorkerViolationTrendChart
          selectedLocation={selectedLocation}
          trendMode={trendMode}
          singleDate={date}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          month={trendMonth}
          year={trendYear}
        />

      </div>
    </div>
  )
}