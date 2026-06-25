import { useState } from 'react'
import { useUser, ALL_LOCATION_IDS } from './UserContext'

const SETTINGS_CSS = `
.settings-root { display: flex; gap: 0; min-height: 500px; }

.settings-sidebar {
  width: 200px; flex-shrink: 0;
  border-right: 1px solid var(--border, rgba(255,255,255,0.08));
  padding: 8px 0;
}
.settings-nav-item {
  padding: 9px 16px; font-size: 13px; cursor: pointer;
  color: var(--text-muted, #94a3b8); border-radius: 0;
  transition: all 0.15s; border-left: 3px solid transparent;
}
.settings-nav-item:hover  { background: rgba(255,255,255,0.04); color: var(--text-primary, #e2e8f0); }
.settings-nav-item.active { border-left-color: #3b82f6; color: #93c5fd; background: rgba(59,130,246,0.08); }

.settings-content { flex: 1; padding: 0 24px 24px; }
.settings-section-title { font-size: 17px; font-weight: 700; color: var(--text-primary, #e2e8f0); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border, rgba(255,255,255,0.08)); }

.role-badge {
  padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.05em; font-family: monospace;
}
.role-badge.admin    { background: rgba(59,130,246,0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
.role-badge.user     { background: rgba(100,116,139,0.2); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }
.role-badge.site-mgr { background: rgba(168,85,247,0.2); color: #c4b5fd; border: 1px solid rgba(168,85,247,0.3); }

.role-section {
  margin-bottom: 10px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 10px; overflow: hidden;
}
.role-section-header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; cursor: pointer;
  background: var(--bg-base, rgba(255,255,255,0.03));
  transition: background 0.15s;
  user-select: none;
}
.role-section-header:hover { background: rgba(255,255,255,0.06); }
.role-section-chevron {
  margin-left: auto; font-size: 11px; color: #64748b;
  transition: transform 0.2s;
}
.role-section-chevron.open { transform: rotate(180deg); }
.role-section-count {
  font-size: 11px; color: #64748b; font-family: monospace;
}
.role-section-body {
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
  padding: 10px 12px;
}

.user-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 8px;
  background: var(--bg-base, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  margin-bottom: 6px; transition: border-color 0.15s;
}
.user-card:last-child { margin-bottom: 0; }
.user-card.is-current { border-color: #22c55e; background: rgba(34,197,94,0.07); }
.user-card.site-manager-card { border-color: rgba(168,85,247,0.35) !important; background: rgba(168,85,247,0.05) !important; }

.user-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; letter-spacing: 0.05em;
  font-family: monospace; flex-shrink: 0;
}
.user-avatar.admin   { background: rgba(59,130,246,0.25); color: #93c5fd; }
.user-avatar.user    { background: rgba(100,116,139,0.25); color: #94a3b8; }
.user-avatar.current { background: rgba(34,197,94,0.25); color: #4ade80; }
.user-avatar.sitemgr { background: rgba(168,85,247,0.25); color: #c4b5fd; }

.user-name { font-size: 13px; font-weight: 600; color: var(--text-primary, #e2e8f0); }
.user-role { font-size: 11px; color: #64748b; margin-top: 1px; }

.sm-email-tag {
  margin-left: auto; font-size: 10px; font-family: monospace;
  background: rgba(168,85,247,0.15); color: #c4b5fd;
  border: 1px solid rgba(168,85,247,0.3); padding: 2px 8px; border-radius: 10px;
}
.sm-send-btn {
  margin-left: 8px; padding: 4px 10px; border-radius: 5px;
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s;
  font-family: monospace; letter-spacing: 0.04em;
  background: rgba(168,85,247,0.2); color: #c4b5fd; border: 1px solid rgba(168,85,247,0.3);
}
.sm-send-btn:hover { background: rgba(168,85,247,0.4); }

.del-btn {
  padding: 4px 10px; border-radius: 5px;
  background: rgba(239,68,68,0.08); color: #f87171;
  border: 1px solid rgba(239,68,68,0.25); font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: monospace; letter-spacing: 0.04em; transition: all 0.15s;
}
.del-btn:hover { background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.45); }

.access-info {
  margin-top: 20px; padding: 12px 16px; border-radius: 8px;
  background: rgba(59,130,246,0.07); border: 1px solid rgba(59,130,246,0.15);
}
.access-info-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.07em;
  color: #64748b; text-transform: uppercase; margin-bottom: 12px;
  font-family: monospace; display: flex; justify-content: space-between; align-items: center;
}
.access-grid-header {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 0 8px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 4px;
}
.access-grid-user-col { width: 100px; font-size: 9px; color: #475569; font-family: monospace; letter-spacing: 0.06em; }
.access-grid-loc-col  { flex: 1; font-size: 9px; color: #64748b; font-family: monospace; text-align: center; letter-spacing: 0.04em; }
.access-grid-row {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.access-grid-row:last-child { border-bottom: none; }
.loc-toggle { width: 32px; height: 18px; border-radius: 9px; position: relative; transition: background 0.2s; flex-shrink: 0; }
.loc-toggle-knob { position: absolute; top: 2px; width: 14px; height: 14px; border-radius: 7px; background: #fff; transition: left 0.2s; }

.settings-toggle-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
}
.settings-toggle-label { font-size: 13px; color: var(--text-primary, #e2e8f0); }

/* modals */
.sm-modal-backdrop { position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; }
.sm-modal { background: #1e293b; border: 1px solid #334155; border-radius: 12px; width: 460px; padding: 24px; position: relative; box-shadow: 0 24px 64px rgba(0,0,0,0.6); }
.sm-modal-title { font-size: 15px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px; }
.sm-modal-sub   { font-size: 11px; color: #64748b; margin-bottom: 18px; }
.sm-field-label { font-size: 10px; color: #64748b; font-family: monospace; letter-spacing: 0.06em; margin-bottom: 4px; text-transform: uppercase; }
.sm-input { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #334155; border-radius: 6px; padding: 7px 12px; color: #f1f5f9; font-size: 12px; margin-bottom: 12px; outline: none; font-family: inherit; box-sizing: border-box; }
.sm-input:focus { border-color: #a855f7; }
.sm-textarea { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #334155; border-radius: 6px; padding: 7px 12px; color: #f1f5f9; font-size: 12px; margin-bottom: 12px; outline: none; resize: vertical; min-height: 90px; font-family: inherit; }
.sm-textarea:focus { border-color: #a855f7; }
.sm-check-row { display: flex; align-items: flex-start; gap: 8px; padding: 7px 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; margin-bottom: 6px; cursor: pointer; }
.sm-check-row input { accent-color: #a855f7; margin-top: 2px; cursor: pointer; }
.sm-check-label { font-size: 12px; color: #e2e8f0; }
.sm-check-sub   { font-size: 10px; color: #475569; margin-top: 1px; }
.sm-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid #334155; }
.sm-btn-cancel { background: transparent; border: 1px solid #334155; color: #94a3b8; padding: 7px 18px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.sm-btn-cancel:hover { background: rgba(255,255,255,0.05); }
.sm-btn-send { background: #7c3aed; border: none; color: #fff; padding: 7px 18px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
.sm-btn-send:hover { background: #8b5cf6; }
.sm-success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); border-radius: 6px; padding: 10px 14px; color: #4ade80; font-size: 12px; margin-top: 12px; }

.confirm-backdrop { position: fixed; inset: 0; z-index: 999999; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; }
.confirm-modal { background: #1e293b; border: 1px solid #334155; border-radius: 12px; width: 360px; padding: 24px; box-shadow: 0 24px 64px rgba(0,0,0,0.6); }
.confirm-title { font-size: 15px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; }
.confirm-body  { font-size: 12px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px; }
.confirm-body strong { color: #f1f5f9; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.confirm-cancel { background: transparent; border: 1px solid #334155; color: #94a3b8; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.confirm-cancel:hover { background: rgba(255,255,255,0.05); }
.confirm-delete { background: #dc2626; border: none; color: #fff; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700; }
.confirm-delete:hover { background: #ef4444; }
`

let cssInjected2 = false
function injectSettingsCSS() {
  if (cssInjected2) return
  const s = document.createElement('style')
  s.textContent = SETTINGS_CSS
  document.head.appendChild(s)
  cssInjected2 = true
}

const NAV_ITEMS = ['Cameras', 'Users & Access']

const FLAT_LOCATIONS = [
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'hyderabad', label: 'Hyderabad' },
  { id: 'chennai_1', label: 'Chennai L1' },
  { id: 'chennai_2', label: 'Chennai L2' },
]

export default function Settings() {
  injectSettingsCSS()

  const { currentUser, isAdmin, users, toggleUserLocation, deleteUser, addUser } = useUser()

  const [activeNav, setActiveNav] = useState('Users & Access')

  // which role sections are expanded
  const [openSections, setOpenSections] = useState({ admin: false, sitemanager: false, user: false })
  const toggleSection = (key) => setOpenSections(p => ({ ...p, [key]: !p[key] }))

  // Delete modal
  const [confirmUser, setConfirmUser] = useState(null)

  // Email modal
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSubject, setEmailSubject] = useState('Shift Handover Report — YOLOIntel Construction Site')
  const [emailBody, setEmailBody] = useState('Hi,\n\nPlease find attached the latest Shift Handover Report.\n\nRegards,\nYOLOIntel Admin')
  const [attachPDF, setAttachPDF] = useState(true)
  const [attachKPI, setAttachKPI] = useState(true)
  const [attachViolations, setAttachViolations] = useState(false)

  // Add User modal
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newLocations, setNewLocations] = useState([])
  const [newRole, setNewRole] = useState('user')
  const [addError, setAddError] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)

  function resetAddForm() {
    setNewName(''); setNewUsername(''); setNewPassword('')
    setNewLocations([]); setNewRole('user'); setAddError(''); setShowNewPw(false)
  }

  function handleAddUser() {
    setAddError('')
    if (!newName.trim())     { setAddError('Full name is required.');  return }
    if (!newUsername.trim()) { setAddError('Username is required.');   return }
    if (!newPassword.trim()) { setAddError('Password is required.');   return }
    const uname = newUsername.trim().toLowerCase()
    const allExisting = [...(users?.admin || []), ...(users?.users || [])]
    if (allExisting.find(u => u.id === uname)) { setAddError('Username already exists.'); return }
    const newUser = {
      id:        uname,
      name:      newName.trim(),
      role:      newRole,
      avatar:    newName.trim().slice(0, 2).toUpperCase(),
      locations: newRole === 'admin' ? ALL_LOCATION_IDS : newLocations,
    }
    addUser(newUser, newPassword)
    resetAddForm()
    setAddUserOpen(false)
  }

  async function handleSendEmail() {
    setEmailSending(true)
    try {
      const res = await fetch('http://localhost:5000/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'alphaleoyolointel@gmail.com', subject: emailSubject, message: emailBody })
      })
      const data = await res.json()
      if (data.ok) {
        setEmailSending(false); setEmailSent(true)
        setTimeout(() => { setEmailOpen(false); setEmailSent(false) }, 2000)
      } else throw new Error(data.error)
    } catch (err) {
      setEmailSending(false)
      alert('Failed to send email: ' + err.message)
    }
  }

  const allUsers = [...(users?.admin || []), ...(users?.users || [])]
  const adminCount = (users?.admin || []).length
  const userCount  = (users?.users || []).length

  // ── What the current user can see ────────────────────────────────────────
  // Non-admin: only sees their own card inside the relevant section
  // Admin: sees everyone

  return (
    <div className="screen active">
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">⚙️ Settings</div>
          <div className="panel-subtitle">
            Logged in as: <strong style={{ color: isAdmin ? '#93c5fd' : '#94a3b8' }}>{currentUser.name}</strong>
            <span className={`role-badge ${currentUser.role}`} style={{ marginLeft: 8 }}>{currentUser.role.toUpperCase()}</span>
          </div>
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          <div className="settings-root">

            {/* sidebar */}
            <div className="settings-sidebar">
              {NAV_ITEMS.map(item => (
                <div key={item} className={`settings-nav-item ${activeNav === item ? 'active' : ''}`} onClick={() => setActiveNav(item)}>
                  {item}
                </div>
              ))}
            </div>

            {/* content */}
            <div className="settings-content" style={{ paddingTop: 20 }}>

              {/* ── CAMERAS ── */}
              {activeNav === 'Cameras' && (
                <>
                  <div className="settings-section-title">Camera Configuration</div>
                  {FLAT_LOCATIONS.map(loc => (
                    <div key={loc.id} className="settings-toggle-row">
                      <div className="settings-toggle-label">{loc.label}</div>
                      <span className="role-badge admin">ACTIVE</span>
                    </div>
                  ))}
                </>
              )}

              {/* ── USERS & ACCESS ── */}
               {activeNav === 'Users & Access' && (
                <>
                  <div className="settings-section-title">Users & Access Control</div>

                  {/* ── NON-ADMIN: just show their own profile ── */}
                  {!isAdmin ? (
                    <div>
                      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.2)', fontSize: 12, color: '#94a3b8' }}>
                        You are logged in as a <strong style={{ color: '#e2e8f0' }}>User</strong>. Contact your administrator to change access settings.
                      </div>

                      <div className="user-card is-current" style={{ marginBottom: 0 }}>
                        <div className="user-avatar current">{currentUser.avatar}</div>
                        <div>
                          <div className="user-name">{currentUser.name}</div>
                          <div className="user-role">
                            {FLAT_LOCATIONS.filter(l => currentUser.locations?.includes(l.id)).map(l => l.label).join(', ') || 'No locations assigned'}
                          </div>
                        </div>
                        <span style={{
                          marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                          background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                          border: '1px solid rgba(34,197,94,0.3)', padding: '2px 10px', borderRadius: 8,
                        }}>● You</span>
                      </div>
                    </div>

                  ) : (
                    /* ── ADMIN: full collapsible sections ── */
                    <>
                      {/* ADMIN SECTION */}
                      <div className="role-section">
                        <div className="role-section-header" onClick={() => toggleSection('admin')}>
                          <span className="role-badge admin">ADMIN</span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>Full access · All camera locations</span>
                          <span className="role-section-count">{adminCount} user{adminCount !== 1 ? 's' : ''}</span>
                          <span className={`role-section-chevron ${openSections.admin ? 'open' : ''}`}>▼</span>
                        </div>
                        {openSections.admin && (
                          <div className="role-section-body">
                            {(users?.admin || []).map(user => {
                              const isCurrent = currentUser.id === user.id
                              return (
                                <div key={user.id} className={`user-card ${isCurrent ? 'is-current' : ''}`}>
                                  <div className={`user-avatar ${isCurrent ? 'current' : 'admin'}`}>{user.avatar}</div>
                                  <div>
                                    <div className="user-name">{user.name}</div>
                                    <div className="user-role">Administrator · All locations</div>
                                  </div>
                                  {isCurrent && (
                                    <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', padding: '2px 10px', borderRadius: 8 }}>● You</span>
                                  )}
                                  {!isCurrent && (
                                    <button className="del-btn" style={{ marginLeft: 'auto' }} onClick={() => setConfirmUser(user)}>Delete</button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* SITE MANAGER SECTION */}
                      <div className="role-section">
                        <div className="role-section-header" onClick={() => toggleSection('sitemanager')}>
                          <span className="role-badge site-mgr">SITE MANAGER</span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>Report notifications · Handover emails</span>
                          <span className="role-section-count">1 user</span>
                          <span className={`role-section-chevron ${openSections.sitemanager ? 'open' : ''}`}>▼</span>
                        </div>
                        {openSections.sitemanager && (
                          <div className="role-section-body">
                            <div className="user-card site-manager-card">
                              <div className="user-avatar sitemgr">AL</div>
                              <div>
                                <div className="user-name">Alphaleo Databricks</div>
                                <div className="user-role">alphaleoyolointel@gmail.com · Receives PDF reports</div>
                              </div>
                              <span className="sm-email-tag">📧 Notify on report</span>
                              <button className="sm-send-btn" onClick={() => { setEmailOpen(true); setEmailSent(false) }}>Send Report</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* USER SECTION */}
                      <div className="role-section">
                        <div className="role-section-header" onClick={() => toggleSection('user')}>
                          <span className="role-badge user">USER</span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>Access controlled per user</span>
                          <span className="role-section-count">{userCount} user{userCount !== 1 ? 's' : ''}</span>
                          <button
                            onClick={e => { e.stopPropagation(); resetAddForm(); setAddUserOpen(true) }}
                            style={{ marginLeft: 4, padding: '2px 8px', borderRadius: 5, background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace' }}
                          >+ Add</button>
                          <span className={`role-section-chevron ${openSections.user ? 'open' : ''}`}>▼</span>
                        </div>
                        {openSections.user && (
                          <div className="role-section-body">
                            {(users?.users || []).map(user => {
                              const isCurrent = currentUser.id === user.id
                              const locLabels = FLAT_LOCATIONS.filter(l => user.locations.includes(l.id)).map(l => l.label).join(', ') || 'No access'
                              return (
                                <div key={user.id} className={`user-card ${isCurrent ? 'is-current' : ''}`}>
                                  <div className={`user-avatar ${isCurrent ? 'current' : 'user'}`}>{user.avatar}</div>
                                  <div>
                                    <div className="user-name">{user.name}</div>
                                    <div className="user-role">{locLabels}</div>
                                  </div>
                                  {isCurrent && (
                                    <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', padding: '2px 10px', borderRadius: 8 }}>● You</span>
                                  )}
                                  {!isCurrent && (
                                    <button className="del-btn" style={{ marginLeft: 'auto' }} onClick={() => setConfirmUser(user)}>Delete</button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* ACCESS MATRIX */}
                      <div className="access-info" style={{ marginTop: 16 }}>
                        <div className="access-info-title">
                          <span>Per-User Location Access</span>
                        </div>
                        <div className="access-grid-header">
                          <div className="access-grid-user-col">USER</div>
                          {FLAT_LOCATIONS.map(loc => (
                            <div key={loc.id} className="access-grid-loc-col">{loc.label}</div>
                          ))}
                        </div>
                        {allUsers.map(user => {
                          const isAdminUser = user.role === 'admin'
                          return (
                            <div key={user.id} className="access-grid-row">
                              <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, background: isAdminUser ? 'rgba(59,130,246,0.25)' : 'rgba(100,116,139,0.25)', color: isAdminUser ? '#93c5fd' : '#94a3b8' }}>
                                  {user.avatar}
                                </div>
                                <span style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{user.name}</span>
                              </div>
                              {FLAT_LOCATIONS.map(loc => {
                                const hasAccess = user.locations.includes(loc.id)
                                const canToggle = !isAdminUser
                                return (
                                  <div key={loc.id} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                    <div
                                      className="loc-toggle"
                                      onClick={() => canToggle && toggleUserLocation(user.id, loc.id)}
                                      title={isAdminUser ? 'Admin always has full access' : `Toggle ${loc.label} for ${user.name}`}
                                      style={{ background: hasAccess ? '#22c55e' : '#334155', cursor: canToggle ? 'pointer' : 'default', opacity: isAdminUser ? 0.45 : 1 }}
                                    >
                                      <div className="loc-toggle-knob" style={{ left: hasAccess ? 16 : 2 }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                        <div style={{ marginTop: 10, fontSize: 11, color: '#475569' }}>
                          Toggle each location per user. Changes apply immediately.
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {confirmUser && (
        <div className="confirm-backdrop" onClick={e => { if (e.target === e.currentTarget) setConfirmUser(null) }}>
          <div className="confirm-modal">
            <div className="confirm-title">Delete {confirmUser.name}?</div>
            <div className="confirm-body">
              This will permanently remove <strong>{confirmUser.name}</strong> and revoke all their access. This action cannot be undone.
            </div>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setConfirmUser(null)}>Cancel</button>
              <button className="confirm-delete" onClick={() => { deleteUser(confirmUser.id); setConfirmUser(null) }}>Delete user</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add User Modal ── */}
      {addUserOpen && (
        <div className="confirm-backdrop" onClick={e => { if (e.target === e.currentTarget) { resetAddForm(); setAddUserOpen(false) } }}>
          <div className="confirm-modal" style={{ width: 420 }}>
            <div className="confirm-title">Add New User</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['user', 'admin'].map(r => (
                <button key={r} onClick={() => setNewRole(r)} style={{ flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'monospace', background: newRole === r ? (r === 'admin' ? 'rgba(59,130,246,0.3)' : 'rgba(100,116,139,0.3)') : 'transparent', color: newRole === r ? (r === 'admin' ? '#93c5fd' : '#94a3b8') : '#475569', border: newRole === r ? (r === 'admin' ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(100,116,139,0.5)') : '1px solid #334155', transition: 'all 0.15s' }}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Full Name</div>
            <input className="sm-input" placeholder="e.g. Kavya Reddy" value={newName} onChange={e => { setNewName(e.target.value); setAddError('') }} />
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Username</div>
            <input className="sm-input" placeholder="e.g. kavya" value={newUsername} onChange={e => { setNewUsername(e.target.value.toLowerCase().replace(/\s/g, '')); setAddError('') }} />
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>Password</div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input className="sm-input" type={showNewPw ? 'text' : 'password'} placeholder="Set a password" value={newPassword} style={{ marginBottom: 0, paddingRight: 36 }} onChange={e => { setNewPassword(e.target.value); setAddError('') }} />
              <button onClick={() => setShowNewPw(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13, padding: 0 }}>{showNewPw ? '🙈' : '👁️'}</button>
            </div>
            {newRole === 'user' && (
              <>
                <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Location Access</div>
                {FLAT_LOCATIONS.map(loc => (
                  <label key={loc.id} className="sm-check-row">
                    <input type="checkbox" checked={newLocations.includes(loc.id)} onChange={() => setNewLocations(prev => prev.includes(loc.id) ? prev.filter(l => l !== loc.id) : [...prev, loc.id])} />
                    <div><div className="sm-check-label">{loc.label}</div></div>
                  </label>
                ))}
              </>
            )}
            {newRole === 'admin' && (
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, padding: '8px 12px', background: 'rgba(59,130,246,0.07)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.15)' }}>
                🛡️ Admin gets full access to all locations automatically.
              </div>
            )}
            {addError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '7px 12px', color: '#f87171', fontSize: 12, marginBottom: 8 }}>⚠️ {addError}</div>
            )}
            <div className="confirm-actions" style={{ marginTop: 12 }}>
              <button className="confirm-cancel" onClick={() => { resetAddForm(); setAddUserOpen(false) }}>Cancel</button>
              <button onClick={handleAddUser} style={{ background: '#16a34a', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Create User</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Modal ── */}
      {emailOpen && (
        <div className="sm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEmailOpen(false) }}>
          <div className="sm-modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'rgba(168,85,247,0.2)', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📧</div>
              <div>
                <div className="sm-modal-title">Send Report to Site Manager</div>
                <div className="sm-modal-sub">Alphaleo Databricks · alphaleoyolointel@gmail.com</div>
              </div>
              <button onClick={() => setEmailOpen(false)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div className="sm-field-label">Subject</div>
            <input className="sm-input" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
            <div className="sm-field-label">Message</div>
            <textarea className="sm-textarea" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
            <div className="sm-field-label">Include in email</div>
            <label className="sm-check-row">
              <input type="checkbox" checked={attachPDF} onChange={e => setAttachPDF(e.target.checked)} />
              <div><div className="sm-check-label">Attach PDF report</div><div className="sm-check-sub">Full shift handover document</div></div>
            </label>
            <label className="sm-check-row">
              <input type="checkbox" checked={attachKPI} onChange={e => setAttachKPI(e.target.checked)} />
              <div><div className="sm-check-label">Include KPI summary</div><div className="sm-check-sub">Cameras, workers, PPE, alerts snapshot</div></div>
            </label>
            <label className="sm-check-row">
              <input type="checkbox" checked={attachViolations} onChange={e => setAttachViolations(e.target.checked)} />
              <div><div className="sm-check-label">Include violation log</div><div className="sm-check-sub">Full list of PPE violations</div></div>
            </label>
            {emailSent && <div className="sm-success">✅ Report sent to alphaleoyolointel@gmail.com</div>}
            <div className="sm-modal-actions">
              <button className="sm-btn-cancel" onClick={() => setEmailOpen(false)}>Cancel</button>
              <button className="sm-btn-send" onClick={handleSendEmail} disabled={emailSending}>
                {emailSending ? '⏳ Sending...' : '📤 Send Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}