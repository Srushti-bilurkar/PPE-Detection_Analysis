import { useState, useEffect, useCallback } from 'react'
 
// ── Camera ID → Friendly name map ─────────────────────────────────────────────
const CAMERA_NAME_MAP = {
  'Pier_Cap_Cam_16389': 'Bangalore (CAM-A01)',
  'Pier_Cap_Cam_16388': 'Hyderabad (CAM-A02)',
  'Pier_Cap_Cam_16387': 'Chennai L1 (CAM-A03)',
  'Pier_Cap_Cam_16386': 'Chennai L2 (CAM-A07)',
  'CAM-A01': 'Bangalore',
  'CAM-A02': 'Hyderabad',
  'CAM-A03': 'Chennai Location 1',
  'CAM-A07': 'Chennai Location 2',
}
 
function friendlyCamera(raw) {
  if (!raw) return '—'
  return CAMERA_NAME_MAP[raw] || raw
}
 
function alertTypeLabel(a) {
  const missing    = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
  const helmetMiss = missing.includes('helmet')
  const vestMiss   = missing.includes('vest')
  if (helmetMiss && vestMiss) return 'CRITICAL — helmet & vest missing'
  if (helmetMiss)             return 'WARNING — helmet missing'
  if (vestMiss)               return 'WARNING — vest missing'
  return 'INFO — ppe violation'
}
 
function severityClass(a) {
  const missing = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
  if (missing.includes('helmet') && missing.includes('vest')) return 'critical'
  if (missing.includes('helmet') || missing.includes('vest')) return 'warning'
  return 'info'
}
 
function formatTime(ts) {
  if (!ts) return ''
  if (typeof ts === 'string' && ts.includes('IST')) return ts.split(' ').slice(1, 3).join(' ')
  const d = new Date(ts)
  return isNaN(d) ? ts : d.toLocaleTimeString()
}
 
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
 
// ── Extract confidence scores (handles both flat and nested ppe[] structure) ──
function extractConf(obj) {
  const helmetConf = obj.helmet_conf ?? obj.ppe?.[0]?.helmet_conf ?? null
  const vestConf   = obj.vest_conf   ?? obj.ppe?.[0]?.vest_conf   ?? null
  return { helmetConf, vestConf }
}
 
// ── Confidence pill rendering ──
function ConfPill({ conf, ok }) {
  if (conf == null) return null
  const pct = Math.round(conf * 100)
  // Color logic: high conf on a violation = bad (red-ish), high conf on pass = good
  const color = ok
    ? (pct >= 70 ? '#22c55e' : '#f59e0b')   // pass: green if confident, amber if low
    : (pct >= 70 ? '#ef4444' : '#f59e0b')   // fail: red if confident, amber if uncertain
  return (
    <span style={{
      marginLeft:      5,
      fontSize:        10,
      fontWeight:      700,
      color,
      background:      `${color}18`,
      border:          `1px solid ${color}44`,
      borderRadius:    3,
      padding:         '1px 5px',
      letterSpacing:   '0.02em',
      verticalAlign:   'middle',
    }}>
      {pct}%
    </span>
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
  const missing    = Array.isArray(worker.missing) ? worker.missing : (worker.missing_ppe || [])
  const helmetOk   = !missing.includes('helmet')
  const vestOk     = !missing.includes('vest')
  const { helmetConf, vestConf } = extractConf(worker)   // ← NEW
 
  const sendFeedback = (verdict) => {
    setFeedback(verdict)
    fetch(`/api/violations/${worker._id}/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verdict, worker_id: worker.worker_id }),
    }).catch(err => console.error('Feedback failed:', err))
  }
 
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, minWidth: 700, maxWidth: 960, width: '95%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
              🎥 Violation Frame — {worker.worker_id}
              {worker.collage_num && (
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 4 }}>
                  Collage #{worker.collage_num}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              📍 {friendlyCamera(worker.camera)} &nbsp;·&nbsp; 🕐 {worker.timestamp || '—'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
          >
            ✕
          </button>
        </div>
 
        {/* ── PPE badges WITH confidence scores ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '4px 14px', display: 'flex', alignItems: 'center' }}>
            🪖 Helmet: {helmetOk ? '✓ Detected' : '✗ Missing'}
            <ConfPill conf={helmetConf} ok={helmetOk} />
          </span>
          <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '4px 14px', display: 'flex', alignItems: 'center' }}>
            🦺 Vest: {vestOk ? '✓ Detected' : '✗ Missing'}
            <ConfPill conf={vestConf} ok={vestOk} />
          </span>
        </div>
 
        {/* ── Confidence detail bar (modal only) ── */}
        {(helmetConf != null || vestConf != null) && (
          <div style={{
            display:      'flex',
            gap:          12,
            marginBottom: 14,
            padding:      '8px 12px',
            background:   'var(--bg-base)',
            borderRadius: 6,
            border:       '1px solid var(--border)',
            fontSize:     12,
          }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>🎯 AI Confidence:</span>
            {helmetConf != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Helmet</span>
                <ConfidenceBar value={helmetConf} ok={helmetOk} />
                <span style={{ fontWeight: 700, color: helmetOk ? '#22c55e' : '#ef4444' }}>
                  {Math.round(helmetConf * 100)}%
                </span>
              </span>
            )}
            {helmetConf != null && vestConf != null && (
              <span style={{ color: 'var(--border)' }}>|</span>
            )}
            {vestConf != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Vest</span>
                <ConfidenceBar value={vestConf} ok={vestOk} />
                <span style={{ fontWeight: 700, color: vestOk ? '#22c55e' : '#ef4444' }}>
                  {Math.round(vestConf * 100)}%
                </span>
              </span>
            )}
          </div>
        )}
 
        <div style={{ background: '#0a0f1a', borderRadius: 8, width: '100%', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#63b3ed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span>⏳ Loading frame…</span>
            </div>
          )}
          {error && !loading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📷</div>
              <div style={{ fontSize: 14 }}>No snapshot available</div>
            </div>
          )}
          {imgSrc && !loading && (
            <img
              src={imgSrc}
              alt="Violation frame"
              style={{ width: '100%', height: 'auto', maxHeight: '65vh', objectFit: 'contain', display: 'block', borderRadius: 8 }}
            />
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
 
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {feedback
              ? (feedback === 'correct' ? '✅ Marked as correct' : '🚫 Marked as false positive')
              : 'Was this detection correct?'}
          </span>
          <button
            className="alert-ack"
            disabled={!!feedback}
            style={{ color: feedback === 'correct' ? '#fff' : 'var(--green-safe)', borderColor: 'rgba(34,197,94,0.3)', padding: '6px 14px', background: feedback === 'correct' ? 'rgba(34,197,94,0.2)' : undefined, opacity: feedback && feedback !== 'correct' ? 0.4 : 1, cursor: feedback ? 'not-allowed' : 'pointer' }}
            onClick={() => sendFeedback('correct')}
          >
            ✓ Correct
          </button>
          <button
            className="alert-ack"
            disabled={!!feedback}
            style={{ color: feedback === 'false_positive' ? '#fff' : 'var(--red-alert)', borderColor: 'rgba(229,62,62,0.3)', padding: '6px 14px', background: feedback === 'false_positive' ? 'rgba(229,62,62,0.2)' : undefined, opacity: feedback && feedback !== 'false_positive' ? 0.4 : 1, cursor: feedback ? 'not-allowed' : 'pointer' }}
            onClick={() => sendFeedback('false_positive')}
          >
            ✗ False Positive
          </button>
        </div>
      </div>
    </div>
  )
}
 
/* ============================================================
   ConfidenceBar — horizontal progress bar used in modal
   ============================================================ */
function ConfidenceBar({ value, ok }) {
  const pct   = Math.round((value ?? 0) * 100)
  const color = ok
    ? (pct >= 70 ? '#22c55e' : '#f59e0b')
    : (pct >= 70 ? '#ef4444' : '#f59e0b')
  return (
    <span style={{ display: 'inline-block', width: 60, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', verticalAlign: 'middle' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </span>
  )
}
 
/* ============================================================
   AlertComments
   ============================================================ */
function AlertComments({ docId }) {
  const [comments, setComments] = useState([])
 
  useEffect(() => {
    if (!docId) return
    fetch(`/api/ppe-violations/${docId}/comments`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setComments(data) })
      .catch(() => {})
  }, [docId])
 
  if (!docId || comments.length === 0) return null
 
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--bg-base)', borderRadius: 4, borderLeft: '2px solid var(--blue-vivid)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
        💬 COMMENTS ({comments.length})
      </div>
      {comments.map((c, i) => (
        <div key={i} style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--blue-vivid)', fontWeight: 600 }}>{c.worker_id || 'User'}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>{c.added_at}</span>
          <div style={{ color: 'var(--text-primary)', marginTop: 2, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {c.text}
          </div>
        </div>
      ))}
    </div>
  )
}
 
/* ============================================================
   AlertFeedPage
   ============================================================ */
export default function AlertFeedPage({ selectedDate, onDateChange }) {
  const today = new Date().toISOString().split('T')[0]
 
  const [date,          setDate]          = useState(selectedDate || today)
  const [violations,    setViolations]    = useState([])
  const [ackedIds,      setAckedIds]      = useState({})
  const [notifiedIds,   setNotifiedIds]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('ppeNotifiedIds') || '{}') }
    catch { return {} }
  })
  const [filter,        setFilter]        = useState('all')
  const [comments,      setComments]      = useState({})
  const [savedComments, setSavedComments] = useState({})
  const [showComment,   setShowComment]   = useState({})
  const [loading,       setLoading]       = useState(true)
  const [ackPopup,      setAckPopup]      = useState(null)
  const [previewWorker, setPreviewWorker] = useState(null)
 
  const updateNotifiedIds = (updater) => {
    setNotifiedIds(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      localStorage.setItem('ppeNotifiedIds', JSON.stringify(next))
      return next
    })
  }
 
  useEffect(() => {
    if (selectedDate && selectedDate !== date) setDate(selectedDate)
  }, [selectedDate])
 
  const fetchViolations = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true)
    fetch(`/api/ppe-violations?date=${date}&limit=500`)
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json() })
      .then(data => { if (Array.isArray(data)) setViolations(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [date])
 
  useEffect(() => { fetchViolations(true) }, [fetchViolations])
 
  useEffect(() => {
    const id = setInterval(() => fetchViolations(false), 15_000)
    return () => clearInterval(id)
  }, [fetchViolations])
 
  const submitComment = async (docId, workerId) => {
    const text = (comments[docId] || '').trim()
    if (!text) return
    try {
      await fetch(`/api/ppe-violations/${docId}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: text, worker_id: workerId }),
      })
      setSavedComments(prev => ({ ...prev, [docId]: true }))
      setComments(prev => ({ ...prev, [docId]: '' }))
      setShowComment(prev => ({ ...prev, [docId]: false }))
      setTimeout(() => setSavedComments(prev => ({ ...prev, [docId]: false })), 2500)
    } catch (e) {
      console.error('Comment save failed', e)
    }
  }
 
  const notify = (violation) => {
    const id = violation._id
    updateNotifiedIds(prev => ({ ...prev, [id]: 'sent' }))
    fetch('/api/alerts/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id: violation.worker_id,
        camera:    violation.camera || violation.zone,
        severity:  'info',
        message:   `Supervisor notified — Worker ${violation.worker_id} at ${friendlyCamera(violation.camera || violation.zone)}`,
        timestamp: violation.timestamp || violation.detected_at,
      }),
    }).catch(() => {})
  }
 
  const ack = (violation) => {
    const id = violation._id
    setAckedIds(prev => ({ ...prev, [id]: true }))
    updateNotifiedIds(prev => { const n = { ...prev }; delete n[id]; return n })
    setAckPopup({ id, message: `Worker ${violation.worker_id || '?'} — PPE violation` })
    setTimeout(() => setAckPopup(null), 3000)
    fetch(`/api/ppe-violations/${id}/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: violation.worker_id }),
    }).catch(() => {
      setAckedIds(prev => { const n = { ...prev }; delete n[id]; return n })
      setAckPopup(null)
    })
  }
 
  const alerts = violations.map(v => ({
    ...v,
    severity:     severityClass(v),
    acknowledged: v.acknowledged || ackedIds[v._id] || false,
  }))
 
  const sortedAlerts = [
    ...alerts.filter(a => !a.acknowledged),
    ...alerts.filter(a =>  a.acknowledged),
  ]
 
  const unacked       = alerts.filter(a => !a.acknowledged)
  const notifiedCount = unacked.filter(a => notifiedIds[a._id] === 'sent').length
  const counts = {
    critical: unacked.filter(a => a.severity === 'critical').length,
    warning:  unacked.filter(a => a.severity === 'warning').length,
    info:     notifiedCount,
  }
  const visible = filter === 'all'
    ? sortedAlerts
    : sortedAlerts.filter(a => a.severity === filter)
 
  return (
    <div className="screen active" id="screen-alerts">
 
      {previewWorker && (
        <ViolationImageModal worker={previewWorker} onClose={() => setPreviewWorker(null)} />
      )}
 
      {/* Date bar */}
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing alerts for:</span>
        <input
          type="date"
          className="date-picker"
          value={date}
          max={today}
          onChange={e => { setDate(e.target.value); onDateChange?.(e.target.value) }}
        />
        <span className="date-bar-hint">← change date to filter alerts</span>
        <button
          onClick={() => fetchViolations(true)}
          disabled={loading}
          style={{ marginLeft: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', padding: '3px 10px', fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>
 
      {/* KPI cards */}
      <div className="stat-grid">
        <div className="stat-card red">
          <div className="stat-label">CRITICAL OPEN</div>
          <div className="stat-value red">{counts.critical}</div>
          <div className="stat-delta">helmet &amp; vest missing</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">WARNINGS OPEN</div>
          <div className="stat-value amber">{counts.warning}</div>
          <div className="stat-delta">single PPE missing</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">INFO OPEN</div>
          <div className="stat-value blue">{counts.info}</div>
          <div className="stat-delta">notified, awaiting ack</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">RESOLVED TODAY</div>
          <div className="stat-value green">{alerts.filter(a => a.acknowledged).length}</div>
        </div>
      </div>
 
      {/* Feed */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🔔 All Violations — Alert Feed</div>
          <div className="panel-actions">
            {['critical', 'warning', 'info', 'all'].map(f => (
              <button
                key={f}
                className={`topbar-btn alert-filter-btn${filter === f ? ' primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setFilter(f)}
              >
                {f === 'all'
                  ? `All (${alerts.length})`
                  : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f] ?? 0})`}
              </button>
            ))}
            <button
              className="topbar-btn"
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={() => fetchViolations(true)}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
 
        <div className="panel-body">
          {loading ? (
            <div className="text-xs text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              Loading violations…
            </div>
          ) : visible.length === 0 ? (
            <div className="text-xs text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              No {filter === 'all' ? '' : filter + ' '}violations for {date}
            </div>
          ) : (
            <div className="alert-feed">
              {visible.map(a => {
                const missing     = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
                const helmetOk    = !missing.includes('helmet')
                const vestOk      = !missing.includes('vest')
                const { helmetConf, vestConf } = extractConf(a)   // ← NEW
                const nState      = notifiedIds[a._id]
                const isAcked     = a.acknowledged
                const commentOpen = showComment[a._id] || false
                const charCount   = (comments[a._id] || '').length
 
                return (
                  <div
                    key={a._id}
                    className={`alert-item ${a.severity}`}
                    style={{
                      opacity:       isAcked ? 0.45 : 1,
                      flexDirection: 'column',
                      alignItems:    'flex-start',
                      transition:    'opacity 0.3s',
                      pointerEvents: isAcked ? 'none' : 'auto',
                      padding:       '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: 10 }}>
                      <div className="alert-dot" style={{ marginTop: 4 }} />
 
                      {/* ── Left: content ── */}
                      <div className="alert-content" style={{ flex: 1, minWidth: 0 }}>
 
                        <div className="alert-type" style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                          {alertTypeLabel(a)}
                        </div>
 
                        <div className="alert-msg" style={{ fontSize: 14, marginBottom: 4 }}>
                          Worker{' '}
                          <strong
                            style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--blue-vivid)', fontSize: 14 }}
                            onClick={() => setPreviewWorker(a)}
                            title="Click to view violation frame"
                          >
                            {a.worker_id || 'Unknown'}
                          </strong>
                          {a.collage_num && (
                            <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 3 }}>
                              C{a.collage_num}
                            </span>
                          )}
                          {' — '}
                          {/* ── Helmet badge + confidence ── */}
                          <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '3px 10px', display: 'inline-flex', alignItems: 'center' }}>
                            🪖 {helmetOk ? '✓ Helmet OK' : '✗ Helmet Missing'}
                            <ConfPill conf={helmetConf} ok={helmetOk} />
                          </span>
                          {' '}
                          {/* ── Vest badge + confidence ── */}
                          <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '3px 10px', display: 'inline-flex', alignItems: 'center' }}>
                            🦺 {vestOk ? '✓ Vest OK' : '✗ Vest Missing'}
                            <ConfPill conf={vestConf} ok={vestOk} />
                          </span>
                        </div>
 
                        <div className="alert-meta" style={{ fontSize: 13 }}>
                          📹 {friendlyCamera(a.camera || a.zone)}
                          {' · '}{timeAgo(a.timestamp || a.detected_at)}
                          {isAcked && a.ack_time ? ` · ACK at ${formatTime(a.ack_time)}` : ''}
                        </div>
 
                        <AlertComments docId={a._id} />
 
                        {commentOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input
                                type="text"
                                placeholder="Add comment..."
                                value={comments[a._id] || ''}
                                maxLength={500}
                                autoFocus
                                onChange={e => setComments(prev => ({ ...prev, [a._id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') submitComment(a._id, a.worker_id) }}
                                style={{
                                  flex:         1,
                                  background:   'var(--bg-base)',
                                  border:       `1px solid ${charCount >= 180 ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                                  borderRadius: 4,
                                  padding:      '6px 10px',
                                  color:        'var(--text-primary)',
                                  fontSize:     13,
                                }}
                              />
                              <button
                                onClick={() => submitComment(a._id, a.worker_id)}
                                style={{
                                  background:   savedComments[a._id] ? 'rgba(34,197,94,0.15)' : 'var(--bg-base)',
                                  border:       `1px solid ${savedComments[a._id] ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                                  borderRadius: 4,
                                  padding:      '6px 14px',
                                  color:        savedComments[a._id] ? 'var(--green-safe)' : 'var(--text-muted)',
                                  fontSize:     13,
                                  cursor:       'pointer',
                                  flexShrink:   0,
                                  transition:   'all 0.2s',
                                }}
                              >
                                {savedComments[a._id] ? '✓ Saved' : 'Save'}
                              </button>
                              <button
                                onClick={() => setShowComment(prev => ({ ...prev, [a._id]: false }))}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: '0 6px' }}
                              >
                                ✕
                              </button>
                            </div>
                            <div style={{
                              fontSize:    11,
                              fontFamily:  'monospace',
                              textAlign:   'right',
                              paddingRight: 2,
                              color: charCount >= 450 ? '#f87171' : charCount >= 400 ? '#f59e0b' : '#475569',
                            }}>
                              {charCount} / 500
                            </div>
                          </div>
                        )}
 
                      </div>
 
                      {/* ── Right: COMMENT toggle + NOTIFY + ACK ── */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', flexShrink: 0 }}>
 
                        <button
                          className="alert-ack"
                          onClick={() => setShowComment(prev => ({ ...prev, [a._id]: !prev[a._id] }))}
                          style={{
                            color:       commentOpen ? 'var(--blue-vivid)' : 'var(--text-muted)',
                            borderColor: commentOpen ? 'rgba(59,130,246,0.5)' : 'rgba(100,116,139,0.3)',
                            background:  commentOpen ? 'rgba(59,130,246,0.1)' : undefined,
                            fontSize:    13,
                            padding:     '6px 16px',
                          }}
                        >
                          💬 Comment
                        </button>
 
                        {nState === 'sent' ? (
                          <span style={{ fontSize: 13, color: 'var(--blue-vivid)', fontWeight: 600, textAlign: 'center', padding: '6px 8px' }}>
                            🔔 Notified
                          </span>
                        ) : nState === 'pending' ? (
                          <span style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 8px' }}>
                            ⏳…
                          </span>
                        ) : (
                          <button
                            className="alert-ack"
                            style={{ color: 'var(--blue-vivid)', borderColor: 'rgba(24,95,165,0.4)', fontSize: 13, padding: '6px 16px' }}
                            onClick={() => notify(a)}
                          >
                            {nState === 'error' ? '✗ Retry' : '🔔 Notify'}
                          </button>
                        )}
 
                        {!isAcked ? (
                          <button
                            className="alert-ack"
                            style={{ color: 'var(--green-safe)', borderColor: 'rgba(34,197,94,0.3)', fontSize: 13, padding: '6px 16px' }}
                            onClick={() => ack(a)}
                          >
                            ACK
                          </button>
                        ) : (
                          <button
                            className="alert-ack"
                            disabled
                            style={{
                              opacity:     0.5,
                              cursor:      'not-allowed',
                              color:       'var(--text-muted)',
                              borderColor: 'rgba(100,116,139,0.2)',
                              background:  'rgba(100,116,139,0.08)',
                              fontSize:    13,
                              padding:     '6px 16px',
                            }}
                          >
                            ✓ Done
                          </button>
                        )}
 
                      </div>
 
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
 
      {/* Ack toast */}
      {ackPopup && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--green-safe)', color: '#000', padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 400 }}>
          <span>✅ Acknowledged</span>
          <span style={{ fontWeight: 400, fontSize: 12 }}>{ackPopup.message}</span>
          <button
            onClick={() => setAckPopup(null)}
            style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: 16, fontWeight: 700, marginLeft: 8, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}
 
    </div>
  )
}
 
 