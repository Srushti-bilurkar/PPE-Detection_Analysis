import { useState, useEffect, useCallback } from 'react'
import { getAlerts, acknowledgeAlert } from '../api'

// Derive a display label from the raw MongoDB alert document
function alertTypeLabel(a) {
  if (a.severity === 'critical') return `CRITICAL — ${a.type?.replace('_', ' ')}`
  if (a.severity === 'warning')  return `WARNING — ${a.type?.replace('_', ' ')}`
  return `INFO — ${a.type?.replace('_', ' ')}`
}

// Map severity string → CSS class used in existing styles
function severityClass(a) {
  if (a.severity === 'critical') return 'critical'
  if (a.severity === 'warning')  return 'warning'
  return 'info'
}

export default function AlertFeedPage() {
  const [alerts, setAlerts]           = useState([])
  const [filter, setFilter]           = useState('all')
  const [loading, setLoading]         = useState(true)
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  // ── Fetch alerts (re-runs on date change) ────────────────────────────────
  const fetchAlerts = useCallback(() => {
    setLoading(true)
    getAlerts({ limit: 200, date: selectedDate })
      .then(data => { setAlerts(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedDate])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const id = setInterval(fetchAlerts, 15_000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  // ── Acknowledge ──────────────────────────────────────────────────────────
  const ack = (id) => {
    // Optimistic update
    setAlerts(prev => prev.map(a => a._id === id ? { ...a, acknowledged: true } : a))
    // Persist to backend
    acknowledgeAlert(id).catch(() => {
      // Roll back on failure
      setAlerts(prev => prev.map(a => a._id === id ? { ...a, acknowledged: false } : a))
    })
  }

  // ── Derived counts ───────────────────────────────────────────────────────
  const unacked = alerts.filter(a => !a.acknowledged)
  const counts = {
    critical: unacked.filter(a => a.severity === 'critical').length,
    warning:  unacked.filter(a => a.severity === 'warning').length,
    info:     unacked.filter(a => a.severity !== 'critical' && a.severity !== 'warning').length,
  }

  const visible = filter === 'all'
    ? alerts
    : alerts.filter(a => severityClass(a) === filter)

  return (
    <div className="screen active" id="screen-alerts">
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing alerts for:</span>
        <input
          type="date"
          className="date-picker"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
        />
        <span className="date-bar-hint">← change date to filter alerts</span>
      </div>

      {/* KPI SUMMARY CARDS */}
      <div className="stat-grid">
        <div className="stat-card red">
          <div className="stat-label">CRITICAL OPEN</div>
          <div className="stat-value red">{counts.critical}</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">WARNINGS OPEN</div>
          <div className="stat-value amber">{counts.warning}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">INFO OPEN</div>
          <div className="stat-value blue">{counts.info}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">RESOLVED TODAY</div>
          <div className="stat-value green">{alerts.filter(a => a.acknowledged).length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🔔 All Alerts</div>
          <div className="panel-actions">
            {['critical', 'warning', 'info', 'all'].map(f => (
              <button
                key={f}
                className={`topbar-btn alert-filter-btn${filter === f ? ' primary' : ''}`}
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setFilter(f)}
              >
                {f === 'all'
                  ? `All Types (${alerts.length})`
                  : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f] ?? 0})`
                }
              </button>
            ))}
            <button
              className="topbar-btn"
              style={{ padding: '4px 10px', fontSize: 11 }}
              onClick={fetchAlerts}
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        <div className="panel-body">
          {loading ? (
            <div className="text-xs text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              Loading alerts…
            </div>
          ) : visible.length === 0 ? (
            <div className="text-xs text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              No {filter === 'all' ? '' : filter + ' '}alerts for {selectedDate}
            </div>
          ) : (
            <div className="alert-feed">
              {visible.map(a => (
                <div
                  key={a._id}
                  className={`alert-item ${severityClass(a)}`}
                  style={{ opacity: a.acknowledged ? 0.45 : 1 }}
                >
                  <div className="alert-dot" />
                  <div className="alert-content">
                    <div className="alert-type">{alertTypeLabel(a)}</div>
                    <div className="alert-msg">{a.message}</div>
                    <div className="alert-meta">
                      📹 {a.camera}
                      {a.worker_id ? ` · Worker ${a.worker_id}` : ''}
                      {a.snap_id   ? ` · Snap ${a.snap_id.slice(-6)}` : ''}
                      {' · '}
                      {new Date(a.timestamp).toLocaleTimeString()}
                      {a.acknowledged && a.ack_time
                        ? ` · ACK at ${new Date(a.ack_time).toLocaleTimeString()}`
                        : ''
                      }
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {!a.acknowledged
                      ? (
                        <button
                          className="alert-ack"
                          style={{ color: 'var(--green-safe)', borderColor: 'rgba(34,197,94,0.3)' }}
                          onClick={() => ack(a._id)}
                        >
                          ✓ ACK
                        </button>
                      ) : (
                        <button className="alert-ack" disabled style={{ opacity: 0.5 }}>
                          ✓ Done
                        </button>
                      )
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
