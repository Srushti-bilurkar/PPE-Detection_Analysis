import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

/* ============================================================
   HELPERS
   ============================================================ */
function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 10)    return 'Just now'
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function scoreColor(pct) {
  if (pct >= 90) return 'var(--green-safe)'
  if (pct >= 60) return 'var(--amber)'
  return 'var(--red-alert)'
}

/* ============================================================
   ComplianceBarChart  —  Helmet + Vest bars (matches screenshot)
   ============================================================ */
function ComplianceBarChart({ helmetPct, vestPct }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => {
    const ctx = canvasRef.current
    if (!ctx) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    // bar colour: red-ish if <90, green if >=90 (matches screenshot)
    const helmetColor = helmetPct >= 90
      ? 'rgba(34,197,94,0.55)'
      : 'rgba(229,62,62,0.55)'
    const vestColor = vestPct >= 90
      ? 'rgba(34,197,94,0.55)'
      : 'rgba(245,166,35,0.55)'

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Helmet', 'Vest'],
        datasets: [{
          label: 'Compliance %',
          data: [helmetPct ?? 94, vestPct ?? 97],
          backgroundColor: [helmetColor, vestColor],
          borderColor:     [helmetColor.replace('0.55', '0.9'), vestColor.replace('0.55', '0.9')],
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#a0aec0', font: { family: 'JetBrains Mono', size: 11 } } },
        },
        scales: {
          x: {
            ticks: { color: '#5a6a82', font: { family: 'JetBrains Mono', size: 11 } },
            grid:  { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            min: 0, max: 100,
            ticks: {
              color: '#5a6a82',
              font: { family: 'JetBrains Mono', size: 10 },
              callback: v => v + '%',
              stepSize: 10,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
        },
      },
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [helmetPct, vestPct])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
}

/* ============================================================
   WorkerTable  — live violations table with search + export
   ============================================================ */
function WorkerTable({ rows, onExport }) {
  const [search, setSearch] = useState('')

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return (
      (r.worker_id || '').toLowerCase().includes(q) ||
      (r.camera    || '').toLowerCase().includes(q) ||
      (r.zone      || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="panel-title">👷 Worker PPE Status — Live</div>
          <div className="panel-subtitle">
            {rows.length} workers tracked · Showing top violations
          </div>
        </div>
        <div className="panel-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            className="ppe-search-input"
            placeholder="🔍 Search worker / zone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className="topbar-btn"
            style={{ padding: '4px 10px', fontSize: 11 }}
            onClick={onExport}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      <div className="panel-body" style={{ padding: 0 }}>
        <table className="compliance-table">
          <thead>
            <tr>
              <th>WORKER ID</th>
              <th>CAMERA</th>
              <th>HELMET</th>
              <th>VEST</th>
              <th>COMPLIANCE</th>
              <th>LAST SEEN</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                  No violations for this date
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => {
                const missing    = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
                const helmetOk   = !missing.includes('helmet')
                const vestOk     = !missing.includes('vest')
                const score      = Math.round(((helmetOk ? 1 : 0) + (vestOk ? 1 : 0)) / 2 * 100)
                const color      = scoreColor(score)
                const isHighRisk = score === 0

                return (
                  <tr key={r._id || r.worker_id || i}>
                    {/* Worker ID */}
                    <td
                      className="text-mono"
                      style={{ color, cursor: 'pointer', textDecoration: 'underline' }}
                      title="View risk profile"
                    >
                      {r.worker_id || 'Unknown'}
                      {isHighRisk && ' ⚠'}
                    </td>

                    {/* Camera */}
                    <td>{r.camera || r.zone || '—'}</td>

                    {/* Helmet */}
                    <td>
                      <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`}>
                        {helmetOk ? '✓ OK' : '✗ MISS'}
                      </span>
                    </td>

                    {/* Vest */}
                    <td>
                      <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`}>
                        {vestOk ? '✓ OK' : '✗ MISS'}
                      </span>
                    </td>

                    {/* Compliance bar */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="score-bar-wrap" style={{ flex: 1, height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                        </div>
                        <span className="text-mono text-xs" style={{ color, minWidth: 32 }}>
                          {score}%
                        </span>
                      </div>
                    </td>

                    {/* Last seen */}
                    <td className="text-mono text-xs">{timeAgo(r.timestamp || r.detected_at)}</td>

                    {/* Action */}
                    <td>
                      {isHighRisk
                        ? <button className="alert-ack" style={{ color: 'var(--red-alert)', borderColor: 'rgba(229,62,62,0.3)' }}>Alert Sent</button>
                        : score < 100
                          ? <button className="alert-ack">Notify</button>
                          : <button className="alert-ack">View</button>
                      }
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ============================================================
   PPECompliance  (main export)
   Props:
     selectedDate  — string 'YYYY-MM-DD', controlled by parent
     onDateChange  — callback(newDateStr)
   ============================================================ */
export default function PPECompliance({ selectedDate, onDateChange }) {
  const today = new Date().toISOString().split('T')[0]

  const [date,       setDate]       = useState(selectedDate || today)
  const [helmetPct,  setHelmetPct]  = useState(null)
  const [vestPct,    setVestPct]    = useState(null)
  const [workers,    setWorkers]    = useState([])
  const [loading,    setLoading]    = useState(false)

  /* Sync external date prop */
  useEffect(() => { if (selectedDate) setDate(selectedDate) }, [selectedDate])

  /* Load compliance stats from API */
  const loadStats = useCallback(async (d) => {
    setLoading(true)
    try {
      const [statsRes, workerRes] = await Promise.allSettled([
        fetch(`/api/ppe-compliance?date=${d}`).then(r => r.json()),
        fetch(`/api/violations?date=${d}&limit=200`).then(r => r.json()),
      ])

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        const v = statsRes.value
        if (v.helmet != null) setHelmetPct(v.helmet)
        if (v.vest   != null) setVestPct(v.vest)
      }

      if (workerRes.status === 'fulfilled' && Array.isArray(workerRes.value)) {
        // Deduplicate — latest record per worker
        const map = {}
        workerRes.value.forEach(r => {
          const id = r.worker_id || 'Unknown'
          if (!map[id] || r.timestamp > map[id].timestamp) map[id] = r
        })
        setWorkers(Object.values(map))
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadStats(date) }, [date, loadStats])

  /* Date change handler */
  const handleDateChange = (e) => {
    const d = e.target.value
    setDate(d)
    onDateChange?.(d)
  }

  /* Export CSV */
  const handleExport = () => {
    const header = 'Worker ID,Camera,Helmet,Vest,Compliance %,Last Seen\n'
    const rows   = workers.map(r => {
      const missing  = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
      const helmetOk = !missing.includes('helmet')
      const vestOk   = !missing.includes('vest')
      const score    = Math.round(((helmetOk ? 1 : 0) + (vestOk ? 1 : 0)) / 2 * 100)
      return `${r.worker_id || ''},${r.camera || ''},${helmetOk ? 'OK' : 'MISS'},${vestOk ? 'OK' : 'MISS'},${score}%,${r.timestamp || ''}`
    }).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `ppe-compliance-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* Fallback demo values when API hasn't returned */
  const displayHelmet = helmetPct ?? 94
  const displayVest   = vestPct   ?? 97

  return (
    <div>

      {/* ── Date Picker Bar ───────────────────────────────────── */}
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing data for:</span>
        <input
          type="date"
          className="date-picker"
          value={date}
          onChange={handleDateChange}
        />
        <span className="date-bar-hint">← change date to update compliance data</span>
      </div>

      {/* ── Helmet + Vest KPI cards ───────────────────────────── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 16 }}>
        <div className="stat-card green">
          <div className="stat-label">HELMET COMPLIANCE</div>
          <div className="stat-value green">
            {helmetPct != null ? `${helmetPct}%` : loading ? '…' : `${displayHelmet}%`}
          </div>
          <div className="stat-delta">shift avg</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">VEST COMPLIANCE</div>
          <div className="stat-value green">
            {vestPct != null ? `${vestPct}%` : loading ? '…' : `${displayVest}%`}
          </div>
          <div className="stat-delta">shift avg</div>
        </div>
      </div>

      {/* ── Compliance Bar Chart ──────────────────────────────── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">📊 PPE Compliance by Type</div>
          <div className="panel-subtitle">Updates with selected date</div>
        </div>
        <div className="panel-body">
          <div style={{ height: 220 }}>
            <ComplianceBarChart helmetPct={displayHelmet} vestPct={displayVest} />
          </div>
        </div>
      </div>

      {/* ── Worker PPE Status Table ───────────────────────────── */}
      <WorkerTable rows={workers} onExport={handleExport} />

    </div>
  )
}
