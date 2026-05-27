import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  { id: 'safety-dashboard', icon: '🛡️', label: 'Safety Dashboard', badge: true },
  { id: 'zone-map',         icon: '🗺️', label: 'Zone Map' },
  { id: 'ppe-compliance',   icon: '🦺', label: 'PPE Compliance' },
  { id: 'alerts',           icon: '🔔', label: 'Alert Feed', badge: true },
]

const PRODUCTIVITY = [
  { id: 'productivity', icon: '📊', label: 'Crew Activity' },
  { id: 'scorecard',    icon: '🏆', label: 'Sub-Contractor Score' },
]

const PROGRESS = [
  { id: 'progress',     icon: '📈', label: 'Project Progress' },
  { id: 'milestones',   icon: '🚩', label: 'Milestones' },
  { id: 'owner-portal', icon: '👁️', label: 'Owner Portal' },
]

const MANAGEMENT = [
  { id: 'reports',  icon: '📄', label: 'Reports' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
]

export default function Sidebar({ activeTab, setActiveTab, alerts }) {
  const [collapsed,     setCollapsed]     = useState(false)
  const [lastSeenCount, setLastSeenCount] = useState(0)
  const [viewedTabs,    setViewedTabs]    = useState(new Set(['safety-dashboard']))

  const today = new Date().toISOString().slice(0, 10)

  const unackCount = alerts.filter(a => {
    if (!a._id || !a.timestamp) return false
    if (a.acknowledged) return false
    const ts = new Date(a.timestamp)
    if (isNaN(ts.getTime())) return false
    return ts.toISOString().slice(0, 10) === today
  }).length

  // New alerts since last time user visited alerts/dashboard tab
  const newCount = Math.max(0, unackCount - lastSeenCount)

  // When user clicks a badge tab, mark as seen
  const handleTabClick = (id) => {
    setActiveTab(id)
    if (id === 'alerts' || id === 'safety-dashboard') {
      setLastSeenCount(unackCount)
      setViewedTabs(prev => new Set([...prev, id]))
    }
  }

  // When unackCount increases (new alert arrives), show badge again
  useEffect(() => {
    // Do nothing — badge auto-shows when newCount > 0
  }, [unackCount])

  function NavItem({ item }) {
    const isActive  = activeTab === item.id
    const showBadge = item.badge && newCount > 0

    return (
      <div
        className={`nav-item${isActive ? ' active' : ''}`}
        onClick={() => handleTabClick(item.id)}
      >
        <span className="nav-icon">{item.icon}</span>
        {!collapsed && <span>{item.label}</span>}
        {showBadge && (
          <span className="nav-badge">{newCount}</span>
        )}
      </div>
    )
  }

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}
         style={{ display: 'contents' }}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">YI</div>
          {!collapsed && (
            <div className="logo-text">YOLO<span>Intel</span></div>
          )}
        </div>

        <div className="sidebar-section">
          {!collapsed && <div className="sidebar-label">Safety Module</div>}
          {NAV_ITEMS.map(item => <NavItem key={item.id} item={item} />)}
        </div>

        <div className="sidebar-section">
          {!collapsed && <div className="sidebar-label">Productivity Module</div>}
          {PRODUCTIVITY.map(item => <NavItem key={item.id} item={item} />)}
        </div>

        <div className="sidebar-section">
          {!collapsed && <div className="sidebar-label">Progress Module</div>}
          {PROGRESS.map(item => <NavItem key={item.id} item={item} />)}
        </div>

        <div className="sidebar-section">
          {!collapsed && <div className="sidebar-label">Management</div>}
          {MANAGEMENT.map(item => <NavItem key={item.id} item={item} />)}
        </div>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">RS</div>
            {!collapsed && (
              <div className="user-info">
                <div className="name">Alphaleo</div>
                <div className="role">Safety Officer</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <button
        id="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title="Collapse sidebar"
      >
        {collapsed ? '→' : '☰'}
      </button>
    </div>
  )
}