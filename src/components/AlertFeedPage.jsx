import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useUser } from './UserContext'

// ─── Camera helpers ────────────────────────────────────────────────────────────
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

function getLocationKey(camera) {
  if (!camera) return 'Unknown'
  const c = String(camera).trim()
  if (c === 'Pier_Cap_Cam_16389' || c === 'CAM-A01') return 'Bangalore'
  if (c === 'Pier_Cap_Cam_16388' || c === 'CAM-A02') return 'Hyderabad'
  if (c === 'Pier_Cap_Cam_16387' || c === 'CAM-A03') return 'Chennai L1'
  if (c === 'Pier_Cap_Cam_16386' || c === 'CAM-A07') return 'Chennai L2'
  if (c.includes('16389')) return 'Bangalore'
  if (c.includes('16388')) return 'Hyderabad'
  if (c.includes('16387')) return 'Chennai L1'
  if (c.includes('16386')) return 'Chennai L2'
  const friendly = (CAMERA_NAME_MAP[c] || c).toLowerCase()
  if (friendly.includes('bangalore')) return 'Bangalore'
  if (friendly.includes('hyderabad')) return 'Hyderabad'
  if (friendly.includes('chennai l1') || friendly.includes('chennai location 1')) return 'Chennai L1'
  if (friendly.includes('chennai l2') || friendly.includes('chennai location 2')) return 'Chennai L2'
  if (friendly.includes('chennai')) return 'Chennai'
  return CAMERA_NAME_MAP[c] || c
}

// ─── Alert helpers ─────────────────────────────────────────────────────────────
function alertTypeLabel(a) {
  const missing = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
  if (missing.includes('helmet') && missing.includes('vest')) return 'CRITICAL — helmet & vest missing'
  if (missing.includes('helmet')) return 'WARNING — helmet missing'
  if (missing.includes('vest'))   return 'WARNING — vest missing'
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

function extractConf(obj) {
  const ppeItem = 
    obj.ppe_item ||
    obj.ppeEntry ||
    obj.ppe?.find(p => p.label === obj.worker_id || p.person_key === obj.person_key) ||
    obj.ppe?.[0] ||
    obj  // fallback to root if ppe array is missing

  const helmetConf = obj.helmet_conf ?? ppeItem?.helmet_conf ?? null
  const vestConf   = obj.vest_conf   ?? ppeItem?.vest_conf   ?? null

  return { helmetConf, vestConf }
}

// ─── Verdict badge (reviewed tab) ─────────────────────────────────────────────
function VerdictBadge({ verdict }) {
  if (!verdict) return null
  const cfg = {
    correct:        { label: '✓ Correct',       bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.4)',  color: '#22c55e' },
    false_positive: { label: '✗ False Positive', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)',  color: '#ef4444' },
    duplicate:      { label: '⚠ Duplicate',      bg: 'rgba(245,158,11,0.12)',border: 'rgba(245,158,11,0.4)', color: '#f59e0b' },
    unresolved:     { label: '⏰ Unresolved',     bg: 'rgba(148,163,184,0.12)',border: 'rgba(148,163,184,0.4)',color: '#94a3b8' },
  }[verdict] || { label: verdict, bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.4)', color: '#94a3b8' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
      letterSpacing: '0.03em',
    }}>
      {cfg.label}
    </span>
  )
}

// ─── Confidence pill ───────────────────────────────────────────────────────────
function ConfPill({ conf, ok }) {
  if (conf == null) return null

  const n = Number(conf)
  if (Number.isNaN(n)) return null

  const pct = Math.round(n <= 1 ? n * 100 : n)
  const color = ok
    ? (pct >= 70 ? '#22c55e' : '#f59e0b')
    : (pct >= 70 ? '#ef4444' : '#f59e0b')

  return (
    <span style={{
      marginLeft: 5, fontSize: 10, fontWeight: 700, color,
      background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: 3, padding: '1px 5px', letterSpacing: '0.02em', verticalAlign: 'middle',
    }}>
      {pct}%
    </span>
  )
}

function ConfidenceBar({ value, ok }) {
  const pct   = Math.round((value ?? 0) * 100)
  const color = ok ? (pct >= 70 ? '#22c55e' : '#f59e0b') : (pct >= 70 ? '#ef4444' : '#f59e0b')
  return (
    <span style={{ display: 'inline-block', width: 60, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', verticalAlign: 'middle' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </span>
  )
}

// ─── Worker image modal (used by Edit button in reviewed tab AND ACK gate) ─────
function WorkerImageModal({ worker, onClose, onReviewSuccess, isPastDay, currentUser }) {
  const [imgSrc,         setImgSrc]         = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(false)
  const [verdict,        setVerdict]        = useState(null)
  const [confirmVerdict, setConfirmVerdict] = useState(null)
  const [submitting,     setSubmitting]     = useState(false)
  const [submitted,      setSubmitted]      = useState(false)
  
  // ── NEW: show a "review required to ACK" banner when opened via ACK button ──
  const pendingAck = worker?._pendingAck === true

  useEffect(() => {
    if (!worker) return
    setImgSrc(null); setLoading(true); setError(false)
    setVerdict(null); setSubmitted(false); setSubmitting(false); setConfirmVerdict(null)
    const directUrl = worker.snapshot_url || worker.frame_url || worker.image_url
    if (directUrl) { setImgSrc(directUrl); setLoading(false); return }
    const id = worker.original_id || worker._id
    fetch(`/api/ppe-violations/${id}/snapshot?label=${encodeURIComponent(worker.worker_id || '')}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.blob() })
      .then(blob => { setImgSrc(URL.createObjectURL(blob)); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [worker])

  if (!worker) return null

  const missing  = Array.isArray(worker.missing) ? worker.missing : (worker.missing_ppe || [])
  const helmetOk = !missing.includes('helmet')
  const vestOk   = !missing.includes('vest')
  const { helmetConf, vestConf } = extractConf(worker)

  const verdictOptions = [
    { key: 'correct',        label: '✓ Correct',        color: '#22c55e', border: 'rgba(34,197,94,0.5)',  bg: 'rgba(34,197,94,0.15)'  },
    { key: 'false_positive', label: '✗ False Positive', color: '#ef4444', border: 'rgba(239,68,68,0.5)',  bg: 'rgba(239,68,68,0.15)'  },
    { key: 'duplicate',      label: '⚠ Duplicate',      color: '#f59e0b', border: 'rgba(245,158,11,0.5)', bg: 'rgba(245,158,11,0.15)' },
  ]

  const confirmCopyMap = {
    correct:        { icon: '✅', title: 'Correct Detection',   sub: 'This confirms the AI correctly identified a real PPE violation.' },
    false_positive: { icon: '⚠️', title: 'False Positive',      sub: 'This means the AI was wrong — no actual violation occurred here.' },
    duplicate:      { icon: '🔁', title: 'Duplicate Detection', sub: 'This violation was already detected and logged earlier.' },
  }
const submitVerdict = async () => {
  if (!confirmVerdict) return
  setVerdict(confirmVerdict)
  setSubmitting(true)
  try {
    const id = worker.original_id || worker._id
    console.log('Submitting:', { id, confirmVerdict, worker_id: worker.worker_id })
    
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000) // 8s timeout
    
    const username = currentUser?.name || 'Unknown';

    const res = await fetch(`/api/ppe-violations/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verdict: confirmVerdict,
        worker_id: worker.worker_id,
        reviewed_by: username
      }),
      signal: controller.signal,
    })
    
    console.log('Response status:', res.status)
    const resBody = await res.json().catch(() => ({}))
    console.log('Response body:', resBody)
    
    if (!res.ok) throw new Error(`Failed: ${res.status}`)
    setSubmitted(true)
    setConfirmVerdict(null)
    setTimeout(() => { onReviewSuccess?.() }, 1800)
  } catch (err) {
    console.error('Submit error:', err)
    alert(`Submit failed: ${err.message}`) // ← shows exact error instead of silent fail
    setSubmitting(false)
    setVerdict(null)
    setConfirmVerdict(null)
  }
}

  const pendingOpt  = confirmVerdict ? verdictOptions.find(v => v.key === confirmVerdict) : null
  const pendingCopy = confirmVerdict ? confirmCopyMap[confirmVerdict] : null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, minWidth: 680, maxWidth: 960, width: '95%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                🎥 Violation Frame — {worker.worker_id}
              </span>
              {worker.verdict && <VerdictBadge verdict={worker.verdict} />}
              {worker.collage_num && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 4 }}>
                  Collage #{worker.collage_num}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              📍 {friendlyCamera(worker.camera)} &nbsp;·&nbsp; 🕐 {worker.timestamp || '—'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        {/* ── ACK gate banner — shown only when opened via ACK button ── */}
        {pendingAck && !submitted && (
          <div style={{
            marginBottom: 14, padding: '10px 14px', borderRadius: 6,
            background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.4)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>Review required before ACK</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Review the violation frame below and submit a verdict. The ACK will be applied automatically once you confirm.
              </div>
            </div>
          </div>
        )}

        {/* PPE badges */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            Helmet: {helmetOk ? '✓ Detected' : '✗ Missing'}
            <ConfPill conf={helmetConf} ok={helmetOk} />
          </span>
          <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            Vest: {vestOk ? '✓ Detected' : '✗ Missing'}
            <ConfPill conf={vestConf} ok={vestOk} />
          </span>
        </div>

        {/* Confidence bars */}
        {(helmetConf != null || vestConf != null) && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, padding: '8px 12px', background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>🎯 AI Confidence:</span>
            {helmetConf != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Helmet</span>
                <ConfidenceBar value={helmetConf} ok={helmetOk} />
                <span style={{ fontWeight: 700, color: helmetOk ? '#22c55e' : '#ef4444' }}>{Math.round(helmetConf * 100)}%</span>
              </span>
            )}
            {helmetConf != null && vestConf != null && <span style={{ color: 'var(--border)' }}>|</span>}
            {vestConf != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-muted)' }}>Vest</span>
                <ConfidenceBar value={vestConf} ok={vestOk} />
                <span style={{ fontWeight: 700, color: vestOk ? '#22c55e' : '#ef4444' }}>{Math.round(vestConf * 100)}%</span>
              </span>
            )}
          </div>
        )}

        {/* Image */}
        <div style={{ background: '#0a0f1a', borderRadius: 8, width: '100%', minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 16 }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#63b3ed', borderRadius: '50%', animation: 'imgSpin 0.8s linear infinite' }} />
              <span>⏳ Loading frame…</span>
            </div>
          )}
          {error && !loading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>📷</div>
              <div style={{ fontSize: 14 }}>No snapshot available for this violation</div>
            </div>
          )}
          {imgSrc && !loading && (
            <img src={imgSrc} alt="Violation frame" style={{ width: '100%', height: 'auto', maxHeight: '55vh', objectFit: 'contain', display: 'block', borderRadius: 8 }} />
          )}
        </div>

        {/* ── Review Section ── */}

        {isPastDay ? (
          <div style={{

                      padding: '12px 16px', borderRadius: 8,

                      background: 'rgba(245,158,11,0.08)',

                      border: '1px solid rgba(245,158,11,0.3)',

                      fontSize: 13, color: 'var(--text-muted)', textAlign: 'center'

                    }}>

                      🔒 Past date — review actions disabled. You can only add comments.
          </div>

                  ) : submitted ? (
          
          /* ── Step 3: Success ── */
          <div style={{ textAlign: 'center', padding: '18px 0', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.25)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>
              Review Submitted{pendingAck ? ' — ACK Applied' : ' Successfully'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
              Marked as{' '}
              <strong style={{ color: verdictOptions.find(v => v.key === verdict)?.color }}>
                {verdictOptions.find(v => v.key === verdict)?.label}
              </strong>
              {pendingAck && (
                <span style={{ display: 'block', marginTop: 4, color: 'var(--green-safe)' }}>
                  ✓ Violation acknowledged
                </span>
              )}
            </div>
          </div>

        ) : confirmVerdict ? (
          /* ── Step 2: Confirmation panel ── */
          <div style={{
            background: pendingOpt.bg, border: `1px solid ${pendingOpt.border}`,
            borderRadius: 8, padding: '16px 18px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>{pendingCopy.icon}</span>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 3 }}>
                  You are marking this as a{' '}
                  <strong style={{ color: pendingOpt.color, fontSize: 14 }}>{pendingCopy.title}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.85, marginBottom: 8 }}>
                  {pendingCopy.sub}
                  {pendingAck && (
                    <span style={{ display: 'block', marginTop: 4, color: '#f59e0b', fontWeight: 600 }}>
                      The violation will also be ACK'd once you confirm.
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
                  Worker <strong style={{ color: 'var(--text-primary)', opacity: 1 }}>{worker.worker_id}</strong>
                  {' · '}{friendlyCamera(worker.camera)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmVerdict(null)}
                disabled={submitting}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  border: '1px solid rgba(100,116,139,0.35)', background: 'var(--bg-base)',
                  color: 'var(--text-muted)', cursor: submitting ? 'not-allowed' : 'pointer',
                }}>
                ✕ Cancel
              </button>
              <button
                onClick={submitVerdict}
                disabled={submitting}
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: `1px solid ${pendingOpt.border}`,
                  background: pendingOpt.bg,
                  color: pendingOpt.color,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}>
                {submitting ? '⏳ Submitting…' : `Confirm — ${pendingOpt.label}${pendingAck ? ' & ACK' : ''}`}
              </button>
            </div>
          </div>

        ) : (
          /* ── Step 1: Initial verdict buttons ── */
          <div style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '14px 16px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>
              {pendingAck
                ? '📋 Select a verdict to review and ACK this violation:'
                : '📋 Was this detection correct?'}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {verdictOptions.map(v => (
                <button
                  key={v.key}
                  onClick={() => setConfirmVerdict(v.key)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 13, fontWeight: 700,
                    border: `1px solid ${v.border}`,
                    background: v.bg,
                    color: v.color,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <style>{`
        @keyframes pulseHighlight {
          0%   { box-shadow: 0 0 0 2px #f59e0b, 0 0 20px rgba(245,158,11,0.3); }
          50%  { box-shadow: 0 0 0 4px #f59e0b, 0 0 30px rgba(245,158,11,0.5); }
          100% { box-shadow: 0 0 0 2px #f59e0b, 0 0 20px rgba(245,158,11,0.3); }
        }
      `}</style>
      </div>
    </div>
  )
}
// ─── Inline comment row ────────────────────────────────────────────────────────
function AlertComments({ docId, refreshKey }) {
  const [comments, setComments] = useState([])
  useEffect(() => {
    if (!docId) return
    fetch(`/api/ppe-violations/${docId}/comments`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setComments(data) })
      .catch(() => {})
  }, [docId, refreshKey])
  if (!docId || comments.length === 0) return null
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--bg-base)', borderRadius: 4, borderLeft: '2px solid var(--blue-vivid)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>💬 COMMENTS ({comments.length})</div>
      {comments.map((c, i) => (
        <div key={i} style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--blue-vivid)', fontWeight: 600 }}>{c.worker_id || 'User'}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>{c.added_at}</span>
          <div style={{ color: 'var(--text-primary)', marginTop: 2, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{c.text}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Shared comment input box ─────────────────────────────────────────────────
function CommentInput({ docId, workerId, comments, setComments, savedComments, setSavedComments, setCommentCount, onClose }) {
  const charCount = (comments[docId] || '').length

  const submit = async () => {
    const text = (comments[docId] || '').trim()
    if (!text) return
    try {
      await fetch(`/api/ppe-violations/${docId}/comment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: text, worker_id: workerId }),
      })
      setSavedComments(prev => ({ ...prev, [docId]: true }))
      setCommentCount(prev => prev + 1)
      setComments(prev => ({ ...prev, [docId]: '' }))
      onClose()
      setTimeout(() => setSavedComments(prev => ({ ...prev, [docId]: false })), 2500)
    } catch (e) { console.error('Comment save failed', e) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text" placeholder="Add comment..." value={comments[docId] || ''} maxLength={500} autoFocus
          onChange={e => setComments(prev => ({ ...prev, [docId]: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          style={{ flex: 1, background: 'var(--bg-base)', border: `1px solid ${charCount >= 480 ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`, borderRadius: 4, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13 }}
        />
        <button onClick={submit}
          style={{ background: savedComments[docId] ? 'rgba(34,197,94,0.15)' : 'var(--bg-base)', border: `1px solid ${savedComments[docId] ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`, borderRadius: 4, padding: '6px 14px', color: savedComments[docId] ? 'var(--green-safe)' : 'var(--text-muted)', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
          {savedComments[docId] ? '✓ Saved' : 'Save'}
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: '0 6px' }}>✕</button>
      </div>
      <div style={{ fontSize: 11, fontFamily: 'monospace', textAlign: 'right', paddingRight: 2, color: charCount >= 450 ? '#f87171' : charCount >= 400 ? '#f59e0b' : '#475569' }}>
        {charCount} / 500
      </div>
    </div>
  )
}

// ─── Review Modal ──────────────────────────────────────────────────────────────
function ReviewModal({ violation, onClose, onSuccess }) {
  const [verdict,     setVerdict]     = useState(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)

  if (!violation) return null

  const verdictOptions = [
    { key: 'correct',        label: '✓ Correct',        color: '#22c55e', border: 'rgba(34,197,94,0.4)',   bg: 'rgba(34,197,94,0.12)'  },
    { key: 'false_positive', label: '✗ False Positive', color: '#ef4444', border: 'rgba(239,68,68,0.4)',   bg: 'rgba(239,68,68,0.12)'  },
    { key: 'duplicate',      label: '⚠ Duplicate',      color: '#f59e0b', border: 'rgba(245,158,11,0.4)',  bg: 'rgba(245,158,11,0.12)' },
  ]

  const submit = async () => {
    if (!verdict) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/violations/${violation._id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, worker_id: violation.worker_id }),
      })
      if (!res.ok) throw new Error('Failed')
      setSubmitted(true)
      setTimeout(() => { onSuccess(); onClose() }, 1500)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, minWidth: 400, maxWidth: 500, width: '95%', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-safe)' }}>Submitted Successfully</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              Marked as <strong style={{ color: verdictOptions.find(v => v.key === verdict)?.color }}>{verdictOptions.find(v => v.key === verdict)?.label}</strong>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>📋 Review Violation</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  Worker {violation.worker_id} · {violation.camera}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>Select verdict:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {verdictOptions.map(v => (
                <button key={v.key}
                  onClick={() => setVerdict(v.key)}
                  style={{
                    padding: '10px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    border: `1px solid ${verdict === v.key ? v.border : 'var(--border)'}`,
                    background: verdict === v.key ? v.bg : 'var(--bg-base)',
                    color: verdict === v.key ? v.color : 'var(--text-muted)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}>
                  {v.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={submit} disabled={!verdict || submitting}
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 6, fontSize: 13, fontWeight: 700,
                  border: `1px solid ${verdict ? 'rgba(99,179,237,0.5)' : 'rgba(100,116,139,0.2)'}`,
                  background: verdict ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: verdict ? 'var(--blue-vivid)' : 'rgba(100,116,139,0.35)',
                  cursor: verdict && !submitting ? 'pointer' : 'not-allowed',
                }}>
                {submitting ? '⏳ Submitting…' : '✓ Submit Review'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AlertFeedPage({ selectedDate, onDateChange }) {
  const { currentUser } = useUser()   // ← here, first line of component body
  const today = new Date().toISOString().split('T')[0]

  const [date,               setDate]               = useState(selectedDate || today)
  const [violations,         setViolations]         = useState([])
  const [reviewedViolations, setReviewedViolations] = useState([])
  const [ackedIds,           setAckedIds]           = useState({})
  const [notifiedIds,        setNotifiedIds]        = useState(() => {
    try { return JSON.parse(localStorage.getItem('ppeNotifiedIds') || '{}') } catch { return {} }
  })
  const [filter,             setFilter]             = useState('all')
  const [reviewedFilter,     setReviewedFilter]     = useState('all')
  const [locationFilter,     setLocationFilter]     = useState('Bangalore')
  const [comments,           setComments]           = useState({})
  const [savedComments,      setSavedComments]      = useState({})
  const [showComment,        setShowComment]        = useState({})
  const [loading,            setLoading]            = useState(true)
  const [reviewedLoading,    setReviewedLoading]    = useState(false)
  const [ackPopup,           setAckPopup]           = useState(null)
  const [previewWorker,      setPreviewWorker]      = useState(null)
  const [commentCount,       setCommentCount]       = useState(0)
  const [allViolations,      setAllViolations]      = useState([])
  const [activeTab,          setActiveTab]          = useState('active')
  const [reviewModal,        setReviewModal]        = useState(null)
  const [highlightWorker, setHighlightWorker] = useState(null)
  const highlightRef = useRef(null)

  useEffect(() => {
  const params    = new URLSearchParams(window.location.search)
  const urlDate   = params.get('date')     || sessionStorage.getItem('alertDate')
  const urlLoc    = params.get('location') || sessionStorage.getItem('alertLocation')
  const urlWorker = params.get('worker')   || sessionStorage.getItem('alertWorker')

  if (urlDate)   { setDate(urlDate); onDateChange?.(urlDate) }
  if (urlLoc)    { setLocationFilter(urlLoc) }
  if (urlWorker) {
    setHighlightWorker(urlWorker)
    setTimeout(() => setHighlightWorker(null), 10000)
  }

  if (urlDate || urlLoc || urlWorker) {
    sessionStorage.removeItem('alertDate')
    sessionStorage.removeItem('alertLocation')
    sessionStorage.removeItem('alertWorker')
    // strip the query string so a refresh doesn't re-trigger / re-lock the filter
    window.history.replaceState({}, '', window.location.pathname)
  }
}, [])

useEffect(() => {
  if (highlightWorker && highlightRef.current) {
    setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 500)
  }
}, [highlightWorker, violations])

  const isToday   = date === today
  const isPastDay = date < today

  const LOCATION_TO_CAMERA = {
    'Bangalore':  'Pier_Cap_Cam_16389',
    'Hyderabad':  'Pier_Cap_Cam_16388',
    'Chennai L1': 'Pier_Cap_Cam_16387',
    'Chennai L2': 'Pier_Cap_Cam_16386',
  }

  const visibleNonDuplicateViolations = (data) => {
    const seen = new Set()
    return data.filter(v => {
      const flag = v.violation_flag ?? v.ppe?.[0]?.violation_flag
      if (flag === 'duplicate') return false
      const uniqueKey = [
        v.person_key, v.worker_id, v.camera || v.zone,
        v.violation_type, v.timestamp || v.detected_at,
      ].filter(Boolean).join('|')
      if (seen.has(uniqueKey)) return false
      seen.add(uniqueKey)
      return true
    })
  }

  const updateNotifiedIds = (updater) => {
    setNotifiedIds(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      localStorage.setItem('ppeNotifiedIds', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    if (selectedDate && selectedDate !== date) {
      setDate(selectedDate)
      setActiveTab('active')
    }
  }, [selectedDate])

  useEffect(() => {
    if (!isToday) setActiveTab('active')
  }, [isToday])

  // ── Fetch active violations ────────────────────────────────────────────────
  const fetchViolations = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true)
    const cameraParam = (locationFilter && locationFilter !== 'All' && LOCATION_TO_CAMERA[locationFilter])
      ? `&camera=${encodeURIComponent(LOCATION_TO_CAMERA[locationFilter])}`
      : ''
    fetch(`/api/ppe-violations?date=${date}&limit=500${cameraParam}`)
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json() })
      .then(data => {
        if (Array.isArray(data)) setViolations(visibleNonDuplicateViolations(data))
        setLoading(false)
      })
      .catch(() => setLoading(false))

    fetch(`/api/ppe-violations?date=${date}&limit=500`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAllViolations(data) })
      .catch(() => {})
  }, [date, locationFilter])

  // ── Fetch reviewed violations ──────────────────────────────────────────────
  const fetchReviewed = useCallback((showSpinner = false) => {
    if (showSpinner) setReviewedLoading(true)
    const cameraParam = (locationFilter && locationFilter !== 'All' && LOCATION_TO_CAMERA[locationFilter])
      ? `&camera=${encodeURIComponent(LOCATION_TO_CAMERA[locationFilter])}`
      : ''
    fetch(`/api/reviewed-violations?date=${date}&limit=500${cameraParam}`)
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json() })
      .then(data => { if (Array.isArray(data)) setReviewedViolations(data); setReviewedLoading(false) })
      .catch(() => setReviewedLoading(false))
  }, [date, locationFilter])

  useEffect(() => { fetchViolations(true)  }, [fetchViolations])
  useEffect(() => { fetchReviewed(false)   }, [fetchReviewed])

  useEffect(() => {
    if (!isToday) return
    const id = setInterval(() => { fetchViolations(false); fetchReviewed(false) }, 15_000)
    return () => clearInterval(id)
  }, [isToday, fetchViolations, fetchReviewed])

  // ── Location options ───────────────────────────────────────────────────────
  const availableLocations = useMemo(() => {
    const locSet = new Set()
    allViolations.forEach(v => locSet.add(getLocationKey(v.camera || v.zone)))
    const locs = Array.from(locSet).sort()
    const preferred = ['Bangalore', 'Hyderabad', 'Chennai L1', 'Chennai L2']
    return preferred.filter(l => locs.includes(l)).concat(locs.filter(l => !preferred.includes(l)))
  }, [allViolations])

  useEffect(() => {
    if (availableLocations.length > 0 && !availableLocations.includes(locationFilter) && locationFilter !== 'All') {
      setLocationFilter(availableLocations[0])
    }
  }, [availableLocations, locationFilter])

  // ── Derived alert list ─────────────────────────────────────────────────────
  const alerts = violations.map(v => ({
    ...v,
    severity:     severityClass(v),
    acknowledged: v.acknowledged || ackedIds[v._id] || false,
    locationKey:  getLocationKey(v.camera || v.zone || ''),
  }))

  const sortedAlerts = [
    ...alerts.filter(a => !a.acknowledged),
    ...alerts.filter(a =>  a.acknowledged),
  ]

  const filteredAlerts = sortedAlerts.filter(a => {
    const severityMatch = filter === 'all' || a.severity === filter
    const locationMatch = locationFilter === 'All' || a.locationKey === locationFilter
    return severityMatch && locationMatch
  })

  const unacked       = useMemo(() => alerts.filter(a => !a.acknowledged), [alerts])
  const notifiedCount = useMemo(() => unacked.filter(a => notifiedIds[a._id] === 'sent').length, [unacked, notifiedIds])

  const counts = useMemo(() => ({
    critical: filteredAlerts.filter(a => !a.acknowledged && a.severity === 'critical').length,
    warning:  filteredAlerts.filter(a => !a.acknowledged && a.severity === 'warning').length,
    info:     notifiedCount,
  }), [filteredAlerts, notifiedCount])

  const filteredReviewed = useMemo(() => {
    if (reviewedFilter === 'all') return reviewedViolations
    return reviewedViolations.filter(r => r.verdict === reviewedFilter)
  }, [reviewedViolations, reviewedFilter])

  const reviewedCounts = useMemo(() => ({
    all:            reviewedViolations.length,
    correct:        reviewedViolations.filter(r => r.verdict === 'correct').length,
    false_positive: reviewedViolations.filter(r => r.verdict === 'false_positive').length,
    duplicate:      reviewedViolations.filter(r => r.verdict === 'duplicate').length,
    unresolved:     reviewedViolations.filter(r => r.verdict === 'unresolved' || !r.verdict).length,
  }), [reviewedViolations])

  const showSecondTab = isToday || isPastDay || reviewedCounts.all > 0
  const secondTabLabel = 'Reviewed Violations'
  const secondTabIcon  = '📋'

  // ── Actions ────────────────────────────────────────────────────────────────
  const notify = (violation) => {
    const id = violation._id
    updateNotifiedIds(prev => ({ ...prev, [id]: 'sent' }))
    fetch('/api/alerts/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    setAckPopup({ id, message: `Worker ${violation.worker_id || '?'} — PPE violation acknowledged` })
    setTimeout(() => setAckPopup(null), 3000)
    fetch(`/api/ppe-violations/${id}/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id: violation.worker_id }),
    }).catch(() => {
      setAckedIds(prev => { const n = { ...prev }; delete n[id]; return n })
      setAckPopup(null)
    })
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const tabBtnStyle = (active, accent = 'var(--blue-vivid)') => ({
    padding: '7px 20px', fontSize: 13, fontWeight: 700,
    borderRadius: '6px 6px 0 0',
    border: active ? '1px solid var(--border)' : '1px solid transparent',
    borderBottom: active ? '1px solid var(--bg-panel)' : '1px solid var(--border)',
    background: active ? 'var(--bg-panel)' : 'var(--bg-base)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer', transition: 'all 0.15s',
    marginBottom: -1, position: 'relative', zIndex: active ? 2 : 1,
  })

  const reviewFilterBtnStyle = (active, variant) => {
    const colorMap = { all: 'var(--blue-vivid)', correct: 'var(--green-safe)', false_positive: 'var(--red-alert)', duplicate: 'var(--amber)', unresolved: '#94a3b8' }
    const bgMap    = { all: 'rgba(59,130,246,0.15)', correct: 'rgba(34,197,94,0.15)', false_positive: 'rgba(239,68,68,0.15)', duplicate: 'rgba(245,158,11,0.15)', unresolved: 'rgba(148,163,184,0.15)' }
    return {
      padding: '5px 13px', fontSize: 12, fontWeight: 600, borderRadius: 5,
      border: `1px solid ${active ? colorMap[variant] : 'rgba(100,116,139,0.25)'}`,
      background: active ? bgMap[variant] : 'var(--bg-base)',
      color: active ? colorMap[variant] : 'var(--text-muted)',
      cursor: 'pointer', transition: 'all 0.15s',
    }
  }

  const actionBtnStyle = (color, borderColor) => ({
    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 4,
    border: `1px solid ${borderColor}`, background: 'transparent',
    color, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
  })

  const disabledBtnStyle = {
    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 4,
    border: '1px solid rgba(100,116,139,0.2)', background: 'transparent',
    color: 'rgba(100,116,139,0.35)', cursor: 'not-allowed', whiteSpace: 'nowrap',
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="screen active" id="screen-alerts">

      {/* Worker image modal — shared by worker name click, Edit btn, AND ACK gate */}
      {previewWorker && (
      <WorkerImageModal
          worker={previewWorker}
          onClose={() => setPreviewWorker(null)}
          isPastDay={isPastDay} 
          currentUser={currentUser}
          onReviewSuccess={() => {
            if (previewWorker._pendingAck) ack(previewWorker)
            fetchViolations(true)
            fetchReviewed(true)
            setPreviewWorker(null)
          }}
        />
      )}
      {/* Review modal */}
      {reviewModal && (
        <ReviewModal
          violation={reviewModal}
          onClose={() => setReviewModal(null)}
          onSuccess={() => { fetchViolations(true); fetchReviewed(true) }}
        />
      )}

      {/* ── Date / location bar ── */}
      <div className="date-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="date-bar-label">📅 Viewing alerts for:</span>
        <input type="date" className="date-picker" value={date} max={today}
          onChange={e => { setDate(e.target.value); onDateChange?.(e.target.value) }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📍 Location:</span>
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}>
            <option value="All">All Locations</option>
            {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
        </div>

        {isPastDay && (
          <div style={{ marginLeft: 4, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 5, fontSize: 12, color: 'var(--amber)' }}>
            🔒 Past date — only comments allowed. Notify & ACK are disabled.
          </div>
        )}

        <button onClick={() => { fetchViolations(true); fetchReviewed(false) }} disabled={loading}
          style={{ marginLeft: 'auto', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-muted)', padding: '3px 10px', fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      {/* ── KPI cards ── */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: '3px solid var(--red-alert)', borderRadius: 10, padding: '16px 20px' }}>
          <div className="stat-label" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>ALERT SUMMARY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Alerts</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{filteredAlerts.length}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)', opacity: 0.4 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔴 Critical</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--red-alert)', fontFamily: 'var(--font-mono)' }}>{counts.critical}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🟡 Warning</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>{counts.warning}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: '3px solid var(--blue-vivid)', borderRadius: 10, padding: '16px 20px' }}>
          <div className="stat-label" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>ACTIVITY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔵 Info / Notified</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--blue-vivid)', fontFamily: 'var(--font-mono)' }}>{counts.info}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)', opacity: 0.4 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>💬 Comments</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>{commentCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>✅ Resolved</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-safe)', fontFamily: 'var(--font-mono)' }}>{alerts.filter(a => a.acknowledged).length}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: '3px solid #a78bfa', borderRadius: 10, padding: '16px 20px' }}>
          <div className="stat-label" style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>DETECTION QUALITY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>✓ Correct Positives</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green-safe)', fontFamily: 'var(--font-mono)' }}>{reviewedCounts.correct}</span>
            </div>
            <div style={{ height: 1, background: 'var(--border)', opacity: 0.4 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>✗ False Positives</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--red-alert)', fontFamily: 'var(--font-mono)' }}>{reviewedCounts.false_positive}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>⚠️ Duplicates</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>{reviewedCounts.duplicate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab container ── */}
      <div className="panel" style={{ overflow: 'visible' }}>

        {/* Tab header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingLeft: 16, paddingRight: 16, paddingTop: 12, gap: 4 }}>

          <button style={tabBtnStyle(activeTab === 'active')} onClick={() => setActiveTab('active')}>
            {isToday ? '🔔 New Violations' : '⏰ Unreviewed Violations'}
            <span style={{
              marginLeft: 7, fontSize: 11, fontWeight: 700,
              background: activeTab === 'active' ? 'var(--blue-vivid)' : 'rgba(100,116,139,0.2)',
              color: activeTab === 'active' ? '#fff' : 'var(--text-muted)',
              padding: '1px 7px', borderRadius: 10,
            }}>
              {isToday ? filteredAlerts.length : filteredAlerts.filter(a => !a.acknowledged).length}
            </span>
          </button>

          {showSecondTab && (
            <button
              style={tabBtnStyle(activeTab === 'reviewed', '#a78bfa')}
              onClick={() => { setActiveTab('reviewed'); fetchReviewed(true) }}
            >
              {secondTabIcon} {secondTabLabel}
              <span style={{
                marginLeft: 7, fontSize: 11, fontWeight: 700,
                background: activeTab === 'reviewed' ? '#a78bfa' : 'rgba(100,116,139,0.2)',
                color: activeTab === 'reviewed' ? '#fff' : 'var(--text-muted)',
                padding: '1px 7px', borderRadius: 10,
              }}>
                {reviewedCounts.all}
              </span>
            </button>
          )}

          {activeTab === 'active' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 6 }}>
              {['all', 'critical', 'warning', 'info'].map(f => (
                <button key={f}
                  className={`topbar-btn alert-filter-btn${filter === f ? ' primary' : ''}`}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setFilter(f)}>
                  {f === 'all'
                    ? `All (${filteredAlerts.length})`
                    : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f] ?? 0})`}
                </button>
              ))}
              <button className="topbar-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => fetchViolations(true)}>
                🔄 Refresh
              </button>
            </div>
          )}

          {activeTab === 'reviewed' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 6 }}>
              {isToday
                ? [
                    { key: 'all',            label: `All (${reviewedCounts.all})` },
                    { key: 'correct',        label: `✓ Correct (${reviewedCounts.correct})` },
                    { key: 'false_positive', label: `✗ False Positive (${reviewedCounts.false_positive})` },
                    { key: 'duplicate',      label: `⚠ Duplicate (${reviewedCounts.duplicate})` },
                  ].map(({ key, label }) => (
                    <button key={key} style={reviewFilterBtnStyle(reviewedFilter === key, key)} onClick={() => setReviewedFilter(key)}>
                      {label}
                    </button>
                  ))
                : [
                    { key: 'all',        label: `All (${reviewedCounts.all})` },
                    { key: 'unresolved', label: `⏰ Unresolved (${reviewedCounts.unresolved})` },
                    { key: 'correct',    label: `✓ Correct (${reviewedCounts.correct})` },
                  ].map(({ key, label }) => (
                    <button key={key} style={reviewFilterBtnStyle(reviewedFilter === key, key)} onClick={() => setReviewedFilter(key)}>
                      {label}
                    </button>
                  ))
              }
              <button className="topbar-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => fetchReviewed(true)}>
                🔄 Refresh
              </button>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: ALL / UNREVIEWED VIOLATIONS
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'active' && (
          <div className="panel-body">
            {loading ? (
              <div className="text-xs text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>Loading violations…</div>
            ) : filteredAlerts.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No active violations</div>
                <div style={{ fontSize: 13 }}>
                  {reviewedCounts.all > 0
                    ? `${reviewedCounts.all} violation(s) have been reviewed. Check the ${secondTabLabel} tab.`
                    : `No violations detected for ${date}${locationFilter !== 'All' ? ` at ${locationFilter}` : ''}.`}
                </div>
              </div>
            ) : (
              <div className="alert-feed">
                {(isToday ? filteredAlerts : filteredAlerts.filter(a => !a.acknowledged)).map(a => {
                  const missing     = Array.isArray(a.missing) ? a.missing : (a.missing_ppe || [])
                  const helmetOk    = !missing.includes('helmet')
                  const vestOk      = !missing.includes('vest')
                  const { helmetConf, vestConf } = extractConf(a)
                  const nState      = notifiedIds[a._id]
                  const isAcked     = a.acknowledged
                  const commentOpen = showComment[a._id] || false

                  return (
                    <div
                      key={a._id}
                      ref={highlightWorker && a.worker_id === highlightWorker ? highlightRef : null}
                      className={`alert-item ${a.severity}`}
                      style={{
                        opacity: isAcked ? 0.45 : 1, flexDirection: 'column', alignItems: 'flex-start',
                        transition: 'opacity 0.3s, box-shadow 0.3s', padding: '14px 16px',
                        ...(highlightWorker && a.worker_id === highlightWorker ? {
                          boxShadow: '0 0 0 3px #f59e0b, 0 0 30px rgba(245,158,11,0.4)',
                          borderRadius: 8,
                          background: 'rgba(245,158,11,0.08)',
                          animation: 'pulseHighlight 1.5s ease-in-out 4',
                        } : {}),
                      }}>
                      {highlightWorker && a.worker_id === highlightWorker && (
                      <div style={{
                        width: '100%', marginBottom: 8, padding: '6px 10px',
                        background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                        borderRadius: 5, fontSize: 12, color: '#f59e0b', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        📧 This violation was flagged in your email alert
                      </div>
                    )}
                    <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: 10 }}>
                      <div className="alert-dot" style={{ marginTop: 4 }} />
                        <div className="alert-content" style={{ flex: 1, minWidth: 0 }}>
                          <div className="alert-type" style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{alertTypeLabel(a)}</span>
                            {!helmetOk && <span>Helmet <ConfPill conf={helmetConf} ok={helmetOk} /></span>}
                            {!vestOk && <span>Vest <ConfPill conf={vestConf} ok={vestOk} /></span>}
                          </div>
                          <div className="alert-msg" style={{ fontSize: 14, marginBottom: 4 }}>
                            Worker{' '}
                            <strong style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--blue-vivid)' }}
                              onClick={() => setPreviewWorker(a)} title="Click to view violation frame">
                              {a.worker_id || 'Unknown'}
                            </strong>
                            {a.collage_num && (
                              <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 3 }}>C{a.collage_num}</span>
                            )}
                            {' — '}
                            <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '3px 10px', display: 'inline-flex', alignItems: 'center' }}>
                              🪖 {helmetOk ? '✓ Helmet OK' : '✗ Helmet Missing'}<ConfPill conf={helmetConf} ok={helmetOk} />
                            </span>
                            {' '}
                            <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`} style={{ fontSize: 13, padding: '3px 10px', display: 'inline-flex', alignItems: 'center' }}>
                              🦺 {vestOk ? '✓ Vest OK' : '✗ Vest Missing'}<ConfPill conf={vestConf} ok={vestOk} />
                            </span>
                          </div>
                          <div className="alert-meta" style={{ fontSize: 13 }}>
                            📹 {friendlyCamera(a.camera || a.zone)}
                            {' · '}{isToday ? timeAgo(a.timestamp || a.detected_at) : (a.timestamp || a.detected_at || '—')}
                            {isAcked && a.ack_time ? ` · ACK at ${formatTime(a.ack_time)}` : ''}
                          </div>
                          <AlertComments docId={a._id} />
                          {commentOpen && (
                            <CommentInput
                              docId={a._id} workerId={a.worker_id}
                              comments={comments} setComments={setComments}
                              savedComments={savedComments} setSavedComments={setSavedComments}
                              setCommentCount={setCommentCount}
                              onClose={() => setShowComment(prev => ({ ...prev, [a._id]: false }))}
                            />
                          )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', flexShrink: 0, minWidth: 100 }}>

                          <button
                            style={actionBtnStyle(commentOpen ? 'var(--blue-vivid)' : 'var(--text-muted)', commentOpen ? 'rgba(59,130,246,0.5)' : 'rgba(100,116,139,0.3)')}
                            onClick={() => setShowComment(prev => ({ ...prev, [a._id]: !prev[a._id] }))}>
                            💬 Comment
                          </button>

                          {!isPastDay ? (
                            nState === 'sent' ? (
                              <span style={{ fontSize: 12, color: 'var(--blue-vivid)', fontWeight: 600, textAlign: 'center', padding: '5px 8px' }}>🔔 Notified</span>
                            ) : (
                              <button style={actionBtnStyle('var(--blue-vivid)', 'rgba(24,95,165,0.4)')} onClick={() => notify(a)}>
                                🔔 Notify
                              </button>
                            )
                          ) : (
                            <button style={disabledBtnStyle} disabled title="Disabled for past dates">🔔 Notify</button>
                          )}

                          {/* ── ACK: now opens image modal for review first ── */}
                          {!isPastDay ? (
                            !isAcked ? (
                              <button
                                style={actionBtnStyle('var(--green-safe)', 'rgba(34,197,94,0.3)')}
                                onClick={() => setPreviewWorker({ ...a, _pendingAck: true })}
                                title="Review violation frame before acknowledging">
                                ✓ ACK
                              </button>
                            ) : (
                              <button style={disabledBtnStyle} disabled>✓ Done</button>
                            )
                          ) : (
                            <button style={disabledBtnStyle} disabled title="Disabled for past dates">ACK</button>
                          )}

                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: REVIEWED / UNREVIEWED VIOLATIONS
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'reviewed' && (
          <div className="panel-body">
            {reviewedLoading ? (
              <div className="text-xs text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
                Loading {secondTabLabel.toLowerCase()}…
              </div>
            ) : filteredReviewed.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>{isToday ? '📋' : '⏰'}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                  No {secondTabLabel.toLowerCase()}
                </div>
                <div style={{ fontSize: 13 }}>
                  {isToday
                    ? reviewedCounts.all > 0
                      ? `${reviewedCounts.all} violation(s) have been reviewed. Check the Reviewed Violations tab.`
                      : `No violations detected for ${date}${locationFilter !== 'All' ? ` at ${locationFilter}` : ''}.`
                    : `All violations for ${date} were resolved on the day. Nothing left unreviewed.`}
                </div>
              </div>
            ) : (
              <div className="alert-feed">
                {filteredReviewed.map(r => {
                  const missing  = Array.isArray(r.missing) ? r.missing : (r.missing_ppe || [])
                  const helmetOk = !missing.includes('helmet')
                  const vestOk   = !missing.includes('vest')
                  const severity = severityClass(r)
                  const { helmetConf, vestConf } = extractConf(r)
                  const commentOpen = showComment[r._id] || false

                  const reviewedAt = r.reviewed_at
                    ? (typeof r.reviewed_at === 'string'
                        ? r.reviewed_at.replace('T', ' ').slice(0, 19)
                        : new Date(r.reviewed_at).toLocaleString())
                    : '—'
                  const detectedTime = String(r.timestamp || '—').slice(11, 19)
                  const detectedDate = String(r.timestamp || '—').slice(0, 10)

                  const borderColor =
                    r.verdict === 'correct'        ? 'var(--green-safe)'  :
                    r.verdict === 'false_positive' ? 'var(--red-alert)'   :
                    r.verdict === 'duplicate'      ? 'var(--amber)'       :
                    '#94a3b8'

                  const reviewedNState = notifiedIds[r._id]

                  return (
                    <div key={r._id || r.original_id} className={`alert-item ${severity}`}
                      style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '14px 16px', borderLeft: `3px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: 10 }}>
                        <div className="alert-dot" style={{ marginTop: 4, opacity: 0.6 }} />
                        <div className="alert-content" style={{ flex: 1, minWidth: 0 }}>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <VerdictBadge verdict={r.verdict || 'unresolved'} />
                            <span className="alert-type" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span>{alertTypeLabel(r)}</span>
                              {!helmetOk && <span>Helmet <ConfPill conf={helmetConf} ok={helmetOk} /></span>}
                              {!vestOk && <span>Vest <ConfPill conf={vestConf} ok={vestOk} /></span>}
                            </span>
                          </div>

                          <div className="alert-msg" style={{ fontSize: 14, marginBottom: 4 }}>
                            Worker{' '}
                            <strong style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--blue-vivid)' }}
                              onClick={() => setPreviewWorker({ ...r, _id: r.original_id || r._id })}
                              title="Click to view violation frame">
                              {r.worker_id || 'Unknown'}
                            </strong>
                            {r.collage_num && (
                              <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-base)', padding: '2px 6px', borderRadius: 3 }}>C{r.collage_num}</span>
                            )}
                            {' — '}
                            <span className={`ppe-badge ${helmetOk ? 'pass' : 'fail'}`} style={{ fontSize: 12, padding: '2px 8px', display: 'inline-flex', alignItems: 'center' }}>
                              🪖 {helmetOk ? '✓ Helmet OK' : '✗ Helmet Missing'}<ConfPill conf={helmetConf} ok={helmetOk} />
                            </span>
                            {' '}
                            <span className={`ppe-badge ${vestOk ? 'pass' : 'fail'}`} style={{ fontSize: 12, padding: '2px 8px', display: 'inline-flex', alignItems: 'center' }}>
                              🦺 {vestOk ? '✓ Vest OK' : '✗ Vest Missing'}<ConfPill conf={vestConf} ok={vestOk} />
                            </span>
                          </div>

                          <div className="alert-meta" style={{ fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <span>📹 {friendlyCamera(r.camera || r.zone)}</span>
                            <span style={{ color: 'var(--border)' }}>·</span>
                            <span>🚨 Detected: <strong style={{ color: 'var(--text-primary)' }}>{detectedDate}</strong> at {detectedTime}</span>
                            {r.reviewed_at && (
                              <>
                                <span style={{ color: 'var(--border)' }}>·</span>
                                <span>
                                  📋 Reviewed:{' '}
                                  <strong style={{ color: borderColor }}>{reviewedAt}</strong>
                                  {r.reviewed_by && r.reviewed_by !== 'system' && (
                                    <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>by {r.reviewed_by}</span>
                                  )}
                                </span>
                              </>
                            )}
                            {!r.reviewed_at && (
                              <>
                                <span style={{ color: 'var(--border)' }}>·</span>
                                <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not resolved on detection day</span>
                              </>
                            )}
                          </div>

                          <AlertComments key={r.original_id || r._id} docId={r.original_id || r._id} />

                          {commentOpen && (
                            <CommentInput
                              docId={r.original_id || r._id}
                              workerId={r.worker_id}
                              comments={comments} setComments={setComments}
                              savedComments={savedComments} setSavedComments={setSavedComments}
                              setCommentCount={setCommentCount}
                              onClose={() => setShowComment(prev => ({ ...prev, [r._id]: false }))}
                            />
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', flexShrink: 0, minWidth: 100 }}>

                          <button
                            style={actionBtnStyle(commentOpen ? 'var(--blue-vivid)' : 'var(--text-muted)', commentOpen ? 'rgba(59,130,246,0.5)' : 'rgba(100,116,139,0.3)')}
                            onClick={() => setShowComment(prev => ({ ...prev, [r._id]: !prev[r._id] }))}>
                            💬 Comment
                          </button>

                          {!isPastDay ? (
                            reviewedNState === 'sent' ? (
                              <span style={{ fontSize: 12, color: 'var(--blue-vivid)', fontWeight: 600, textAlign: 'center', padding: '5px 8px' }}>🔔 Notified</span>
                            ) : (
                              <button style={actionBtnStyle('var(--blue-vivid)', 'rgba(24,95,165,0.4)')} onClick={() => notify(r)}>
                                🔔 Notify
                              </button>
                            )
                          ) : (
                            <button style={disabledBtnStyle} disabled title="Disabled for past dates">🔔 Notify</button>
                          )}

                          {!isPastDay ? (
                            <button
                              style={actionBtnStyle('#a78bfa', 'rgba(167,139,250,0.4)')}
                              onClick={() => setPreviewWorker({ ...r, _id: r.original_id || r._id })}
                              title="View violation frame">
                              ✏️ Edit
                            </button>
                          ) : (
                            <button
                              style={actionBtnStyle('var(--text-muted)', 'rgba(100,116,139,0.3)')}
                              onClick={() => setPreviewWorker({ ...r, _id: r.original_id || r._id })}
                              title="View violation frame (read-only)">
                              👁 View
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
        )}
      </div>

      {/* ── ACK toast ── */}
      {ackPopup && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--green-safe)', color: '#000', padding: '12px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 420 }}>
          <span>✅ Acknowledged</span>
          <span style={{ fontWeight: 400, fontSize: 12 }}>{ackPopup.message}</span>
          <button onClick={() => setAckPopup(null)} style={{ background: 'none', border: 'none', color: '#000', cursor: 'pointer', fontSize: 16, fontWeight: 700, marginLeft: 8, lineHeight: 1 }}>✕</button>
        </div>
      )}
      {/* ── Highlight animation ── */}
      <style>{`
        @keyframes pulseHighlight {
          0%   { box-shadow: 0 0 0 3px #f59e0b, 0 0 20px rgba(245,158,11,0.3); }
          50%  { box-shadow: 0 0 0 5px #f59e0b, 0 0 35px rgba(245,158,11,0.6); }
          100% { box-shadow: 0 0 0 3px #f59e0b, 0 0 20px rgba(245,158,11,0.3); }
        }
      `}</style>
    </div>
  )
}
