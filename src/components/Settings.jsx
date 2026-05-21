
import { useState } from 'react'
import { useUser, USERS, ALL_LOCATION_IDS, CAMERA_LOCATIONS } from './UserContext'

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

.role-block { margin-bottom: 24px; }
.role-block-header {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #64748b;
  margin-bottom: 10px; font-family: monospace;
}
.role-badge {
  padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.05em; font-family: monospace;
}
.role-badge.admin    { background: rgba(59,130,246,0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
.role-badge.user     { background: rgba(100,116,139,0.2); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }
.role-badge.site-mgr { background: rgba(168,85,247,0.2); color: #c4b5fd; border: 1px solid rgba(168,85,247,0.3); }

.site-manager-card {
  border-color: rgba(168,85,247,0.35) !important;
  background: rgba(168,85,247,0.05) !important;
}
.sm-email-tag {
  margin-left: auto; font-size: 10px; font-family: monospace;
  background: rgba(168,85,247,0.15); color: #c4b5fd;
  border: 1px solid rgba(168,85,247,0.3); padding: 2px 8px; border-radius: 10px;
}
.sm-send-btn {
  margin-left: 8px; padding: 4px 10px; border-radius: 5px; border: none;
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s;
  font-family: monospace; letter-spacing: 0.04em;
  background: rgba(168,85,247,0.2); color: #c4b5fd; border: 1px solid rgba(168,85,247,0.3);
}
.sm-send-btn:hover { background: rgba(168,85,247,0.4); }

/* Email modal */
.sm-modal-backdrop {
  position: fixed; inset: 0; z-index: 99999;
  background: rgba(0,0,0,0.65);
  display: flex; align-items: center; justify-content: center;
}
.sm-modal {
  background: #1e293b; border: 1px solid #334155; border-radius: 12px;
  width: 460px; padding: 24px; position: relative;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
}
.sm-modal-title { font-size: 15px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px; }
.sm-modal-sub   { font-size: 11px; color: #64748b; margin-bottom: 18px; }
.sm-field-label { font-size: 10px; color: #64748b; font-family: monospace; letter-spacing: 0.06em; margin-bottom: 4px; text-transform: uppercase; }
.sm-input {
  width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #334155;
  border-radius: 6px; padding: 7px 12px; color: #f1f5f9; font-size: 12px;
  margin-bottom: 12px; outline: none; font-family: inherit;
}
.sm-input:focus { border-color: #a855f7; }
.sm-textarea {
  width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #334155;
  border-radius: 6px; padding: 7px 12px; color: #f1f5f9; font-size: 12px;
  margin-bottom: 12px; outline: none; resize: vertical; min-height: 90px;
  font-family: inherit;
}
.sm-textarea:focus { border-color: #a855f7; }
.sm-check-row {
  display: flex; align-items: flex-start; gap: 8px; padding: 7px 10px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px; margin-bottom: 6px; cursor: pointer;
}
.sm-check-row input { accent-color: #a855f7; margin-top: 2px; cursor: pointer; }
.sm-check-label { font-size: 12px; color: #e2e8f0; }
.sm-check-sub   { font-size: 10px; color: #475569; margin-top: 1px; }
.sm-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; padding-top: 14px; border-top: 1px solid #334155; }
.sm-btn-cancel { background: transparent; border: 1px solid #334155; color: #94a3b8; padding: 7px 18px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.sm-btn-cancel:hover { background: rgba(255,255,255,0.05); }
.sm-btn-send { background: #7c3aed; border: none; color: #fff; padding: 7px 18px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; }
.sm-btn-send:hover { background: #8b5cf6; }
.sm-success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); border-radius: 6px; padding: 10px 14px; color: #4ade80; font-size: 12px; margin-top: 12px; }

.user-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 8px;
  background: var(--bg-base, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.06));
  margin-bottom: 6px; transition: border-color 0.15s;
}
.user-card.is-current { border-color: #22c55e; background: rgba(34,197,94,0.07); }

.user-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; letter-spacing: 0.05em;
  font-family: monospace; flex-shrink: 0;
}
.user-avatar.admin   { background: rgba(59,130,246,0.25); color: #93c5fd; }
.user-avatar.user    { background: rgba(100,116,139,0.25); color: #94a3b8; }
.user-avatar.current { background: rgba(34,197,94,0.25); color: #4ade80; }

.user-name { font-size: 13px; font-weight: 600; color: var(--text-primary, #e2e8f0); }
.user-role { font-size: 11px; color: #64748b; margin-top: 1px; }

.switch-btn {
  margin-left: auto; padding: 4px 12px; border-radius: 5px; border: none;
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.15s;
  font-family: monospace; letter-spacing: 0.04em;
}
.switch-btn.to-admin { background: rgba(59,130,246,0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.3); }
.switch-btn.to-admin:hover { background: rgba(59,130,246,0.4); }
.switch-btn.to-user  { background: rgba(100,116,139,0.2); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }
.switch-btn.to-user:hover  { background: rgba(100,116,139,0.35); }
.switch-btn.current  { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); cursor: default; }

.access-info {
  margin-top: 20px; padding: 12px 16px; border-radius: 8px;
  background: rgba(59,130,246,0.07); border: 1px solid rgba(59,130,246,0.15);
}
.access-info-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.07em;
  color: #64748b; text-transform: uppercase; margin-bottom: 12px;
  font-family: monospace; display: flex; justify-content: space-between; align-items: center;
}

/* access grid */
.access-grid-header {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 0 8px; border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 4px;
}
.access-grid-user-col { width: 100px; font-size: 9px; color: #475569; font-family: monospace; letter-spacing: 0.06em; }
.access-grid-loc-col  { flex: 1; font-size: 9px; color: #64748b; font-family: monospace; text-align: center; letter-spacing: 0.04em; }
.access-grid-row {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
}
.access-grid-row:last-child { border-bottom: none; }

.loc-toggle {
  width: 32px; height: 18px; border-radius: 9px; position: relative;
  transition: background 0.2s; flex-shrink: 0;
}
.loc-toggle-knob {
  position: absolute; top: 2px;
  width: 14px; height: 14px; border-radius: 7px; background: #fff;
  transition: left 0.2s;
}

.settings-toggle-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 0; border-bottom: 1px solid var(--border, rgba(255,255,255,0.05));
}
.settings-toggle-label { font-size: 13px; color: var(--text-primary, #e2e8f0); }
.settings-toggle-sub   { font-size: 11px; color: #64748b; margin-top: 2px; }
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

// flat location list for the grid columns
const FLAT_LOCATIONS = [
  { id: 'bangalore', label: 'Bangalore' },
  { id: 'hyderabad', label: 'Hyderabad' },
  { id: 'chennai_1', label: 'Chennai L1' },
  { id: 'chennai_2', label: 'Chennai L2' },
]

export default function Settings() {
  injectSettingsCSS()

  const { currentUser, setCurrentUser, isAdmin, users, toggleUserLocation } = useUser()
  const [activeNav, setActiveNav] = useState('Users & Access')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSubject, setEmailSubject] = useState('Shift Handover Report — YOLOIntel Construction Site')
  const [emailBody, setEmailBody] = useState('Hi,\n\nPlease find attached the latest Shift Handover Report.\n\nRegards,\nYOLOIntel Admin')
  const [attachPDF, setAttachPDF] = useState(true)
  const [attachKPI, setAttachKPI] = useState(true)
  const [attachViolations, setAttachViolations] = useState(false)

  const SITE_MANAGER = { name: 'Alphaleo Databricks', email: 'alphaleoyolointel@gmail.com', avatar: 'AL' }


  async function handleSendEmail() {

    setEmailSending(true)

    try {

      const res = await fetch('http://localhost:5000/api/send-email', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          to:      'alphaleoyolointel@gmail.com',

          subject: emailSubject,

          message: emailBody,

        })

      })

      const data = await res.json()

      if (data.ok) {

        setEmailSending(false)

        setEmailSent(true)

        setTimeout(() => { setEmailOpen(false); setEmailSent(false) }, 2000)

      } else {

        throw new Error(data.error)

      }

    } catch (err) {

      setEmailSending(false)

      alert('Failed to send email: ' + err.message)

    }

  }
 

  const handleSwitch = (user) => setCurrentUser(user)
  const allUsers = [...(users?.admin || []), ...(users?.users || [])]

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
                <div
                  key={item}
                  className={`settings-nav-item ${activeNav === item ? 'active' : ''}`}
                  onClick={() => setActiveNav(item)}
                >
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
                      <div>
                        <div className="settings-toggle-label">{loc.label}</div>
                      </div>
                      <span className="role-badge admin">ACTIVE</span>
                    </div>
                  ))}
                </>
              )}

              {/* ── USERS & ACCESS ── */}
              {activeNav === 'Users & Access' && (
                <>
                  <div className="settings-section-title">Users & Access Control</div>

                  {/* Admin block */}
                  <div className="role-block">
                    <div className="role-block-header">
                      <span className="role-badge admin">ADMIN</span>
                      <span>Full access · All camera locations</span>
                    </div>
                    {(users?.admin || []).map(user => {
                      const isCurrent = currentUser.id === user.id
                      return (
                        <div key={user.id} className={`user-card ${isCurrent ? 'is-current' : ''}`}>
                          <div className={`user-avatar ${isCurrent ? 'current' : 'admin'}`}>{user.avatar}</div>
                          <div>
                            <div className="user-name">{user.name}</div>
                            <div className="user-role">Administrator · All locations</div>
                          </div>
                          <button
                            className={`switch-btn ${isCurrent ? 'current' : 'to-admin'}`}
                            onClick={() => !isCurrent && handleSwitch(user)}
                          >
                            {isCurrent ? '● Active' : 'Switch to'}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* Site Manager block */}
                  <div className="role-block">
                    <div className="role-block-header">
                      <span className="role-badge site-mgr">SITE MANAGER</span>
                      <span>Report notifications · Handover emails</span>
                    </div>
                    <div className="user-card site-manager-card">
                      <div className="user-avatar" style={{ background: 'rgba(168,85,247,0.25)', color: '#c4b5fd' }}>AL</div>
                      <div>
                        <div className="user-name">Alphaleo Databricks</div>
                        <div className="user-role">alphaleoyolointel@gmail.com · Receives PDF reports</div>
                      </div>
                      <span className="sm-email-tag">📧 Notify on report</span>
                      <button className="sm-send-btn" onClick={() => { setEmailOpen(true); setEmailSent(false) }}>
                        Send Report
                      </button>
                    </div>
                  </div>

                  {/* Users block */}
                  <div className="role-block">
                    <div className="role-block-header">
                      <span className="role-badge user">USER</span>
                      <span>Access controlled per user</span>
                    </div>
                    {(users?.users || []).map(user => {
                      const isCurrent = currentUser.id === user.id
                      const locLabels = FLAT_LOCATIONS
                        .filter(l => user.locations.includes(l.id))
                        .map(l => l.label)
                        .join(', ') || 'No access'
                      return (
                        <div key={user.id} className={`user-card ${isCurrent ? 'is-current' : ''}`}>
                          <div className={`user-avatar ${isCurrent ? 'current' : 'user'}`}>{user.avatar}</div>
                          <div>
                            <div className="user-name">{user.name}</div>
                            <div className="user-role">{locLabels}</div>
                          </div>
                          <button
                            className={`switch-btn ${isCurrent ? 'current' : 'to-user'}`}
                            onClick={() => !isCurrent && handleSwitch(user)}
                          >
                            {isCurrent ? '● Active' : 'Switch to'}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {/* ── Per-user access matrix ── */}
                  <div className="access-info">
                    <div className="access-info-title">
                      <span>Per-User Location Access</span>
                      {!isAdmin && (
                        <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'monospace', background: 'rgba(239,68,68,0.12)', padding: '2px 8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}>
                          🔒 Admin only can edit
                        </span>
                      )}
                    </div>

                    {/* header row */}
                    <div className="access-grid-header">
                      <div className="access-grid-user-col">USER</div>
                      {FLAT_LOCATIONS.map(loc => (
                        <div key={loc.id} className="access-grid-loc-col">{loc.label}</div>
                      ))}
                    </div>

                    {/* one row per user (skip admin — always has full access) */}
                    {allUsers.map(user => {
                      const isAdminUser = user.role === 'admin'
                      return (
                        <div key={user.id} className="access-grid-row">
                          {/* user info */}
                          <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 9, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0,
                              background: isAdminUser ? 'rgba(59,130,246,0.25)' : 'rgba(100,116,139,0.25)',
                              color: isAdminUser ? '#93c5fd' : '#94a3b8',
                            }}>
                              {user.avatar}
                            </div>
                            <span style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600 }}>{user.name}</span>
                          </div>

                          {/* toggles per location */}
                          {FLAT_LOCATIONS.map(loc => {
                            const hasAccess = user.locations.includes(loc.id)
                            const canToggle = isAdmin && !isAdminUser
                            return (
                              <div key={loc.id} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                <div
                                  className="loc-toggle"
                                  onClick={() => canToggle && toggleUserLocation(user.id, loc.id)}
                                  title={canToggle ? `Toggle ${loc.label} for ${user.name}` : isAdminUser ? 'Admin always has full access' : 'Only admin can change access'}
                                  style={{
                                    background: hasAccess ? '#22c55e' : '#334155',
                                    cursor: canToggle ? 'pointer' : 'default',
                                    opacity: isAdminUser ? 0.45 : 1,
                                  }}
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
                      {isAdmin
                        ? 'Toggle each location per user. Changes apply immediately in the Safety Dashboard.'
                        : 'Contact your administrator to change your camera location access.'}
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>

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
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #334155', borderRadius: 6, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(168,85,247,0.25)', color: '#c4b5fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>AL</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>Alphaleo Databricks</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>alphaleoyolointel@gmail.com</div>
              </div>
              <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c4b5fd', fontSize: 10, padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(168,85,247,0.3)', fontFamily: 'monospace' }}>Site Manager</span>
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