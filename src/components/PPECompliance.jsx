import { useEffect, useRef, useState, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

function timeAgo(ts) {
  if (!ts) return '—'
  const cleaned = typeof ts === 'string' ? ts.replace(' IST', '').trim() : ts
  const diff    = Math.floor((Date.now() - new Date(cleaned).getTime()) / 1000)
  if (isNaN(diff))  return ts
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
   ViolationImageModal
   ============================================================ */
function ViolationImageModal({ worker, onClose }) {
  const [imgSrc,   setImgSrc]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (!worker) return
    setImgSrc(null); setLoading(true); setError(false); setFeedback(null)
    const directUrl = worker.snapshot_url || worker.frame_url || worker.image_url
    if (directUrl) { setImgSrc(directUrl); setLoading(false); return }
    const snapshotUrl = worker._id
      ? `/api/ppe-violations/${worker._id}/snapshot?label=${encodeURIComponent(worker.worker_id || '')}`
      : `/api/snapshots?worker_id=${worker.worker_id}&ts=${encodeURIComponent(worker.timestamp || '')}`
    fetch(snapshotUrl)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.blob() })
      .then(blob => { setImgSrc(URL.createObjectURL(blob)); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [worker])

  if (!worker) return null
  const missing  = Array.isArray(worker.missing) ? worker.missing : (worker.missing_ppe || [])
  const helmetOk = !missing.includes('helmet')
  const vestOk   = !missing.includes('vest')

  const sendFeedback = (verdict) => {
    setFeedback(verdict)
    fetch(`/api/violations/${worker._id}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict, worker_id: worker.worker_id }),
    }).catch(err => console.error('Feedback failed:', err))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, minWidth: 700, maxWidth: 960, width: '95%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              🎥 Violation Frame — {worker.worker_id}
              {worker.collage_num && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 4 }}>Collage #{worker.collage_num}</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>📍 {worker.camera || '—'} &nbsp;·&nbsp; 🕐 {worker.timestamp || '—'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '4px 14px' }}>🪖 Helmet: {helmetOk ? '✓ Detected' : '✗ Missing'}</span>
          <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '4px 14px' }}>🦺 Vest: {vestOk ? '✓ Detected' : '✗ Missing'}</span>
        </div>
        <div style={{ background: '#0a0f1a', borderRadius: 8, width: '100%', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {loading && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}><div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#63b3ed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><span>⏳ Loading frame…</span></div>}
          {error && !loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}><div style={{ fontSize: 48, marginBottom: 10 }}>📷</div><div style={{ fontSize: 14 }}>No snapshot available</div></div>}
          {imgSrc && !loading && <img src={imgSrc} alt="Violation frame" style={{ width: '100%', height: 'auto', maxHeight: '65vh', objectFit: 'contain', display: 'block', borderRadius: 8 }} />}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>{feedback ? (feedback === 'correct' ? '✅ Marked as correct' : '🚫 Marked as false positive') : 'Was this detection correct?'}</span>
          <button className="alert-ack" disabled={!!feedback} style={{ color: feedback === 'correct' ? '#fff' : 'var(--green-safe)', borderColor: 'rgba(34,197,94,0.3)', padding: '6px 14px', background: feedback === 'correct' ? 'rgba(34,197,94,0.2)' : undefined, opacity: feedback && feedback !== 'correct' ? 0.4 : 1, cursor: feedback ? 'not-allowed' : 'pointer' }} onClick={() => sendFeedback('correct')}>✓ Correct</button>
          <button className="alert-ack" disabled={!!feedback} style={{ color: feedback === 'false_positive' ? '#fff' : 'var(--red-alert)', borderColor: 'rgba(229,62,62,0.3)', padding: '6px 14px', background: feedback === 'false_positive' ? 'rgba(229,62,62,0.2)' : undefined, opacity: feedback && feedback !== 'false_positive' ? 0.4 : 1, cursor: feedback ? 'not-allowed' : 'pointer' }} onClick={() => sendFeedback('false_positive')}>✗ False Positive</button>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   WorkerTable
   ============================================================ */
function WorkerTable({ rows, onExport, loading }) {
  const [search,        setSearch]        = useState('')
  const [previewWorker, setPreviewWorker] = useState(null)
  const [comments,      setComments]      = useState({})
  const [savedPopup,    setSavedPopup]    = useState(null)

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    return (r.worker_id || '').toLowerCase().includes(q) || (r.camera || '').toLowerCase().includes(q) || (r.zone || '').toLowerCase().includes(q)
  })

  const submitComment = async (rowId, workerId) => {
    const text = (comments[rowId] || '').trim()
    if (!text) return
    try {
      await fetch(`/api/ppe-violations/${rowId}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: text, worker_id: workerId }) })
      setSavedPopup(`Comment saved for ${workerId}`)
      setTimeout(() => setSavedPopup(null), 3000)
      setComments(prev => ({ ...prev, [rowId]: '' }))
    } catch (e) { console.error('Comment save failed', e) }
  }

  return (
    <>
      {previewWorker && <ViolationImageModal worker={previewWorker} onClose={() => setPreviewWorker(null)} />}
      {savedPopup && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--blue-vivid)', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>💬 {savedPopup}</div>}
      <div className="panel">
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="panel-title">👷 Worker PPE Status — Live</div>
            <div className="panel-subtitle">{rows.length} workers tracked · Showing top violations</div>
          </div>
          <div className="panel-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" className="ppe-search-input" placeholder="🔍 Search worker / zone..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="topbar-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={onExport}>📥 Export CSV</button>
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28, fontSize: 13 }}>
              <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#63b3ed', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
              Loading violations for selected date…
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {!loading && (
            <table className="compliance-table">
              {/* ── CHANGED: WORKER ID → IMAGE, ACTION column removed ── */}
              <thead>
                <tr>
                  <th>IMAGE</th>
                  <th>CAMERA</th>
                  <th>HELMET</th>
                  <th>VEST</th>
                  <th>COMPLIANCE</th>
                  <th>LAST SEEN</th>
                  <th>COMMENT</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>No violations found for this date</td></tr>
                ) : filtered.map((r, i) => {
                  const missing    = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
                  const helmetOk   = !missing.includes('helmet')
                  const vestOk     = !missing.includes('vest')
                  const score      = Math.round(((helmetOk ? 1 : 0) + (vestOk ? 1 : 0)) / 2 * 100)
                  const color      = scoreColor(score)
                  const isHighRisk = score === 0
                  const rowId      = r._id || r.worker_id || i

                  return (
                    <tr key={rowId}>

                      {/* ── IMAGE column header only renamed; cell content unchanged ── */}
                      <td className="text-mono" style={{ color, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setPreviewWorker(r)}>
                        {r.worker_id || 'Unknown'}{isHighRisk && ' ⚠'}
                        {r.collage_num && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '1px 5px', borderRadius: 3, fontWeight: 400 }}>C{r.collage_num}</span>}
                      </td>

                      <td>{r.camera || r.zone || '—'}</td>
                      <td><span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`}>{helmetOk ? '✓ OK' : '✗ MISS'}</span></td>
                      <td><span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`}>{vestOk ? '✓ OK' : '✗ MISS'}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--bg-base)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                          </div>
                          <span className="text-mono text-xs" style={{ color, minWidth: 32 }}>{score}%</span>
                        </div>
                      </td>
                      <td className="text-mono text-xs">{timeAgo(r.timestamp || r.detected_at)}</td>
                      <td style={{ minWidth: 200 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Add comment..."
                            value={comments[rowId] || ''}
                            onChange={e => setComments(prev => ({ ...prev, [rowId]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && submitComment(rowId, r.worker_id)}
                            style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 11, minWidth: 120 }}
                          />
                          <button
                            onClick={() => submitComment(rowId, r.worker_id)}
                            style={{ background: 'var(--blue-vivid)', border: 'none', borderRadius: 4, padding: '3px 8px', color: '#fff', fontSize: 11, cursor: 'pointer' }}
                          >💬</button>
                        </div>
                      </td>

                      {/* ── ACTION column removed ── */}

                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

/* ============================================================
   PPECompliance  (main export)
   ============================================================ */
export default function PPECompliance({ selectedDate, onDateChange }) {
  const today = new Date().toISOString().split('T')[0]

  const [date,           setDate]           = useState(toApiDate(selectedDate) || today)
  const [helmetPct,      setHelmetPct]      = useState(null)
  const [vestPct,        setVestPct]        = useState(null)
  const [workers,        setWorkers]        = useState([])
  const [loading,        setLoading]        = useState(false)
  const [zoneLoading,    setZoneLoading]    = useState(false)
  const [error,          setError]          = useState(null)
  const [complianceData, setComplianceData] = useState(null)
  const [zoneData,       setZoneData]       = useState([])

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

    // Fallback: derive from violations list using correct field names
    if (violationRows && violationRows.length > 0) {
      const map = {}
      violationRows.forEach(r => {
        const cam = r.camera || r.zone || 'Unknown'
        if (!map[cam]) map[cam] = {
          camera:           cam,
          helmet_compliant: 0,
          helmet_violation: 0,
          vest_compliant:   0,
          vest_violation:   0,
        }
        const missing = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
        missing.includes('helmet') ? map[cam].helmet_violation++ : map[cam].helmet_compliant++
        missing.includes('vest')   ? map[cam].vest_violation++   : map[cam].vest_compliant++
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
      const [statsRes, workerRes] = await Promise.allSettled([
        fetch(`/api/ppe-compliance?date=${apiDate}`).then(r => { if (!r.ok) throw new Error(`ppe-compliance ${r.status}`); return r.json() }),
        fetch(`/api/ppe-violations?date=${apiDate}&limit=500`).then(r => { if (!r.ok) throw new Error(`ppe-violations ${r.status}`); return r.json() }),
      ])

      if (statsRes.status === 'fulfilled' && statsRes.value) {
        const v = statsRes.value
        setHelmetPct(v.helmet ?? null)
        setVestPct(v.vest   ?? null)
        setComplianceData(v)
      } else {
        setHelmetPct(null); setVestPct(null); setComplianceData(null)
      }

      let rawViolations = []
      if (workerRes.status === 'fulfilled' && Array.isArray(workerRes.value)) {
        rawViolations = workerRes.value
        const map = {}
        rawViolations.forEach(r => {
          const id = r.worker_id || 'Unknown'
          if (!map[id] || (r.timestamp || '') > (map[id].timestamp || '')) map[id] = { ...r, doc_id: r._id }
        })
        setWorkers(Object.values(map))
      } else {
        setWorkers([])
        setError('Failed to load violations.')
      }

      await loadZoneData(apiDate, rawViolations)
    } catch (err) {
      setError('Unexpected error loading data.')
    }
    setLoading(false)
  }, [loadZoneData])

  useEffect(() => { loadStats(date) }, [date, loadStats])

  const handleDateChange = (e) => { const d = e.target.value; setDate(d); onDateChange?.(d) }

  const handleExport = () => {
    const header = 'Worker ID,Collage,Camera,Helmet,Vest,Compliance %,Last Seen\n'
    const rows   = workers.map(r => {
      const missing  = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
      const helmetOk = !missing.includes('helmet')
      const vestOk   = !missing.includes('vest')
      const score    = Math.round(((helmetOk ? 1 : 0) + (vestOk ? 1 : 0)) / 2 * 100)
      return `${r.worker_id || ''},C${r.collage_num || '?'},${r.camera || ''},${helmetOk ? 'OK' : 'MISS'},${vestOk ? 'OK' : 'MISS'},${score}%,${r.timestamp || ''}`
    }).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `ppe-compliance-${date}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* ── Date picker bar ── */}
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing data for:</span>
        <input type="date" className="date-picker" value={date} onChange={handleDateChange} max={today} />
        <span className="date-bar-hint">← change date to update compliance data</span>
        <button onClick={() => loadStats(date)} disabled={loading} style={{ marginLeft: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', padding: '3px 10px', fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && <div style={{ background: 'rgba(229,62,62,0.12)', border: '1px solid rgba(229,62,62,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 12, color: 'var(--red-alert)', fontSize: 12 }}>⚠️ {error}</div>}

      {/* ── KPI cards ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 16 }}>
        <div className="stat-card green">
          <div className="stat-label">HELMET COMPLIANCE</div>
          <div className="stat-value green" style={{ fontSize: 20 }}>
            {loading ? '…' : helmetPct != null ? `${complianceData?.wearing_helmet ?? '?'} / ${complianceData?.total ?? '?'} wearing` : 'No data'}
          </div>
          <div className="stat-delta">{complianceData?.not_wearing_helmet ?? 0} not wearing · {helmetPct}% compliant</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">VEST COMPLIANCE</div>
          <div className="stat-value green" style={{ fontSize: 20 }}>
            {loading ? '…' : vestPct != null ? `${complianceData?.wearing_vest ?? '?'} / ${complianceData?.total ?? '?'} wearing` : 'No data'}
          </div>
          <div className="stat-delta">{complianceData?.not_wearing_vest ?? 0} not wearing · {vestPct}% compliant</div>
        </div>
      </div>

      {/* ── Zone-wise compliance vs non-compliance bar chart ── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">📹 Zone-wise Compliance vs Non-Compliance — Per Camera</div>
          <div className="panel-subtitle">
            {zoneData.length > 0 ? `${zoneData.length} camera${zoneData.length > 1 ? 's' : ''} · ${date}` : date}
          </div>
        </div>
        <div className="panel-body">
          <ZoneLegend />
          <div style={{ height: 260 }}>
            <ZoneComplianceChart zoneData={zoneData} loading={zoneLoading} />
          </div>
        </div>
      </div>

      {/* ── Worker table ── */}
      <WorkerTable rows={workers} onExport={handleExport} loading={loading} />
    </div>
  )
}
