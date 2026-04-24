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
 
    </div>
  )
}
 
 