import { useState, useEffect, useRef } from 'react'

const TAB_TITLES = {
  'safety-dashboard': ['Safety Dashboard',        'Tower A & B · Live AI Monitoring'],
  'zone-map':         ['Zone Map',                'Floor 4 · Tower A · 33 workers'],
  'ppe-compliance':   ['PPE Compliance',          '247 workers tracked · Live'],
  'alerts':           ['Alert Feed',              'Live from MongoDB'],
  'productivity':     ['Crew Activity',           'Site utilization · All zones'],
  'scorecard':        ['Sub-Contractor Scorecard','Week of Feb 10–16'],
  'progress':         ['Project Progress',        'Prestige Tower — Phase 1'],
  'milestones':       ['Milestones',              '5/8 complete · 0 missed'],
  'owner-portal':     ['Owner Portal',            'Executive View — Read Only'],
  'reports':          ['Reports',                 'Automated · Scheduled · On-Demand'],
  'settings':         ['Settings',               'System Configuration'],
}

const TABS = [
  'safety-dashboard','zone-map','ppe-compliance','alerts',
  'productivity','scorecard','progress','milestones',
  'owner-portal','reports','settings'
]

const TAB_LABELS = {
  'safety-dashboard': 'Safety Overview',
  'zone-map':         'Zone Map',
  'ppe-compliance':   'PPE Compliance',
  'alerts':           'Alerts',
  'productivity':     'Crew Productivity',
  'scorecard':        'Scorecard',
  'progress':         'Project Progress',
  'milestones':       'Milestones',
  'owner-portal':     'Owner Portal',
  'reports':          'Reports',
  'settings':         'Settings',
}

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

export default function Topbar({ activeTab, setActiveTab, alerts, kpi }) {
  const [notifOpen, setNotifOpen]     = useState(false)
  const [lightMode, setLightMode]     = useState(false)
  const [readIds,   setReadIds]       = useState(new Set())
  const panelRef = useRef(null)
  const bellRef  = useRef(null)
  const clock    = useClock()

  const [title, sub] = TAB_TITLES[activeTab] || [activeTab, '']
  const unread = alerts.filter(a => !readIds.has(a._id)).length

  function toggleNotif() {
    if (!notifOpen) {
      setReadIds(new Set(alerts.map(a => a._id)))
    }
    setNotifOpen(!notifOpen)
  }

  function toggleTheme() {
    const next = !lightMode
    setLightMode(next)
    document.body.classList.toggle('light-mode', next)
  }

  // Close panel on outside click
  useEffect(() => {
    function handler(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current  && !bellRef.current.contains(e.target)
      ) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  function timeAgo(iso) {
    if (!iso) return ''
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
    if (diff < 60)    return `${diff}s ago`
    if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    return new Date(iso).toLocaleDateString()
  }

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="topbar-title">{title}</div>
          <div className="topbar-sub">Site: Prestige Tower — {sub}</div>
        </div>

        <div className="topbar-spacer" />

        <div id="live-clock">{clock}</div>

        <div className="status-pill">
          <div className="status-dot" />
          {kpi.active_cameras ?? 0} STREAMS LIVE
        </div>

        {/* Notification Bell */}
        <button
          id="notif-bell"
          ref={bellRef}
          onClick={toggleNotif}
          title="Notifications"
        >
          🔔
          {unread > 0 && (
            <div id="notif-badge" style={{ display: 'flex' }}>
              {unread}
            </div>
          )}
        </button>

        <button
          className="topbar-btn"
          id="theme-toggle"
          onClick={toggleTheme}
        >
          {lightMode ? '☀️ Light' : '🌙 Dark'}
        </button>

        <button className="topbar-btn">📋 Handover</button>
        <button className="topbar-btn">⬇ Export</button>
        <button className="topbar-btn primary">+ New Alert Rule</button>
      </div>

      {/* Screen Tabs */}
      <div className="screen-tabs">
        {TABS.map(id => (
          <div
            key={id}
            className={`screen-tab${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {TAB_LABELS[id]}
          </div>
        ))}
      </div>

      {/* Notification Panel */}
      <div
        id="notif-panel"
        ref={panelRef}
        className={notifOpen ? 'open' : ''}
      >
        <div className="notif-header">
          <div className="notif-header-title">🔔 Notifications</div>
          <div
            className="notif-close"
            onClick={() => setNotifOpen(false)}
          >
            ✕
          </div>
        </div>

        <div id="notif-list">
          {alerts.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
              No alerts yet
            </div>
          )}
          {alerts.map(a => {
            const sev = a.severity === 'critical' ? 'critical'
                      : a.severity === 'warning'  ? 'warning' : 'info'
            const isRead = readIds.has(a._id)
            return (
              <div key={a._id} className={`notif-item ${sev}${isRead ? ' read' : ''}`}>
                <div className="notif-dot" />
                <div className="notif-body">
                  <div className="notif-msg">
                    {a.message || a.title || 'Alert'}
                    {a.camera ? ` · ${a.camera}` : ''}
                    {a.zone   ? ` · ${a.zone}`   : ''}
                  </div>
                  <div className="notif-time">
                    {timeAgo(a.timestamp || a.created_at || '')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}