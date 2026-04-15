import { useState, useCallback } from 'react'
import axios from 'axios'

/* ─── helpers ─────────────────────────────────────────────── */
function timeAgo(iso) {
  if (!iso) return ''
  // Strip IST suffix so Date can parse it
  const cleaned = typeof iso === 'string' ? iso.replace(' IST', '').trim() : iso
  const diff = Math.floor((Date.now() - new Date(cleaned)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  return new Date(iso).toLocaleDateString()
}

function severityLabel(sev) {
  if (!sev) return 'info'
  const s = sev.toLowerCase()
  if (s.includes('critical') || s.includes('high'))   return 'critical'
  if (s.includes('warn')     || s.includes('medium')) return 'warning'
  return 'info'
}

/* ─── single alert row ────────────────────────────────────── */
function AlertItem({ a, isAcked, onAck }) {
  const mongoId = a._id?.$oid || a._id || ''
  const ts      = a.timestamp || a.created_at || a.detected_at || ''

  const sev   = isAcked
    ? 'acknowledged'
    : severityLabel(a.severity)

  const color = isAcked
    ? '#3b82f6'
    : sev === 'critical' ? 'var(--red-alert)'
    : sev === 'warning'  ? 'var(--amber)'
    : 'var(--text-secondary)'

  const type  = (a.type || 'ALERT').replace(/_/g, ' ').toUpperCase()
  const label = isAcked
    ? `✓ ACKNOWLEDGED — ${type}`
    : `${sev.toUpperCase()} — ${type}`

  const msg    = a.message || a.title || a.violation_type || type
  const cam    = a.camera  || ''
  const zone   = a.zone && a.zone !== 'Unknown' ? `Zone: ${a.zone}` : ''
  const worker = a.worker_id ? `Worker #${a.worker_id}` : ''
  const ago    = timeAgo(ts)
  const meta   = [cam, zone, worker, ago].filter(Boolean).join(' · ')

  return (
    <div
      className={`alert-item ${sev}`}
      data-mongo-id={mongoId}
      {...(isAcked ? { 'data-acked': 'true' } : {})}
    >
      <div className="alert-dot" />

      <div className="alert-content">
        <div className="alert-type" style={{ color }}>{label}</div>
        <div className="alert-msg">{msg}</div>
        {meta && <div className="alert-meta">{meta}</div>}
      </div>

      {isAcked ? (
        <button
          className="alert-ack"
          disabled
          style={{
            color: '#3b82f6',
            borderColor: 'rgba(59,130,246,0.3)',
            background: 'rgba(59,130,246,0.1)',
          }}
        >
          ✓ ACK'd
        </button>
      ) : (
        <button
          className="alert-ack"
          onClick={() => onAck(mongoId)}
        >
          ACK
        </button>
      )}
    </div>
  )
}

/* ─── main component ──────────────────────────────────────── */

/**
 * AlertFeed
 *
 * Props:
 *   alerts   – array of alert objects from the API
 *   compact  – if true, show only camera + time in meta (no zone/worker)
 *   maxItems – optional cap on how many unacked items to render (e.g. 10 for
 *              the dashboard sidebar). Acked items are always shown below.
 */
export default function AlertFeed({ alerts = [], compact = false, maxItems }) {
  // Track IDs ack'd in this session (mirrors _ackedIds Set in plain-JS)
  const [ackedIds, setAckedIds] = useState(() => new Set())

  const handleAck = useCallback(async (mongoId) => {
    if (!mongoId) return
    // Optimistically mark as acked in local state
    setAckedIds(prev => new Set([...prev, mongoId]))
    try {
      await axios.post(`/api/alerts/${mongoId}`)
    } catch (_) {
      // If it fails the local ack stays — consistent with original behaviour
    }
  }, [])

  if (!alerts || alerts.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
        No active alerts ✅
      </div>
    )
  }

  // Mirror renderAlertFeed: separate unacked / acked, unacked on top
  const unacked = alerts.filter(a => {
    const id = a._id?.$oid || a._id || ''
    return !ackedIds.has(id) && !a.acknowledged
  })

  const acked = alerts.filter(a => {
    const id = a._id?.$oid || a._id || ''
    return ackedIds.has(id) || a.acknowledged
  })

  // Apply optional item cap to unacked (e.g. dashboard shows top-10)
  const visibleUnacked = maxItems != null ? unacked.slice(0, maxItems) : unacked

  return (
    <div className="alert-feed">
      {visibleUnacked.map(a => (
        <AlertItem
          key={a._id?.$oid || a._id || Math.random()}
          a={a}
          isAcked={false}
          compact={compact}
          onAck={handleAck}
        />
      ))}

      {acked.map(a => (
        <AlertItem
          key={a._id?.$oid || a._id || Math.random()}
          a={a}
          isAcked={true}
          compact={compact}
          onAck={handleAck}
        />
      ))}
    </div>
  )
}
