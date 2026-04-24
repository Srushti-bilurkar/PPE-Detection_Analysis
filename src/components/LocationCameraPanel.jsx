import { useState, useEffect, useRef } from 'react'
import { useUser } from './UserContext'
import CameraGrid from './CameraGrid'

const LOC_CSS = `
.loc-panel-wrap { display: flex; flex-direction: column; gap: 6px; }

.loc-link {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  background: var(--bg-base, rgba(255,255,255,0.03));
  transition: all 0.18s; user-select: none;
}
.loc-link:hover { border-color: rgba(59,130,246,0.45); background: rgba(59,130,246,0.06); }
.loc-link.is-open { border-color: #3b82f6; background: rgba(59,130,246,0.1); }

.loc-icon  { font-size: 16px; flex-shrink: 0; }
.loc-label { font-size: 13px; font-weight: 600; color: var(--text-primary, #e2e8f0); flex: 1; }
.loc-meta  { font-size: 11px; color: #64748b; font-family: monospace; }
.loc-cam-count {
  font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px;
  background: rgba(59,130,246,0.15); color: #93c5fd;
  border: 1px solid rgba(59,130,246,0.25); font-family: monospace;
}
.loc-cam-count.live { background: rgba(34,197,94,0.15); color: #4ade80; border-color: rgba(34,197,94,0.3); }
.loc-chevron {
  font-size: 11px; color: #64748b; transition: transform 0.2s;
  flex-shrink: 0;
}
.loc-chevron.open { transform: rotate(180deg); color: #93c5fd; }

.loc-expand {
  overflow: hidden;
  transition: max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s;
  max-height: 0; opacity: 0;
}
.loc-expand.is-open { max-height: 800px; opacity: 1; }

.loc-expand-inner {
  padding: 10px 0 4px;
}

.no-access-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 7px;
  background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2);
  font-size: 12px; color: #f87171;
}
`

let locCssInjected = false
function injectLocCSS() {
  if (locCssInjected) return
  const s = document.createElement('style'); s.textContent = LOC_CSS
  document.head.appendChild(s); locCssInjected = true
}

function LocationRow({ location, cameras, isAdmin }) {
  const [open, setOpen]         = useState(false)
  const [subOpen, setSubOpen]   = useState({})   // tracks which sub-location is open
  const hasAccess = isAdmin || !location.adminOnly

  // if location has subLocations, count cams across all of them
  const allCams = location.subLocations
    ? location.subLocations.flatMap(s => s.cameras).map(lc => cameras.find(c => c.id === lc.id) || lc)
    : location.cameras.map(lc => cameras.find(c => c.id === lc.id) || lc)

  const liveCount = allCams.filter(c => c.ready).length

  const toggleSub = (id) => setSubOpen(p => ({ ...p, [id]: !p[id] }))

  return (
    <div>
      {/* main row */}
      <div
        className={`loc-link ${open ? 'is-open' : ''}`}
        onClick={() => hasAccess && setOpen(p => !p)}
        style={!hasAccess ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
      >
        <span className="loc-icon">{location.icon}</span>
        <span className="loc-label">{location.label}</span>
        {!hasAccess && (
          <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'monospace', fontWeight: 700, background: 'rgba(239,68,68,0.15)', padding: '2px 6px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)' }}>
            🔒 ADMIN ONLY
          </span>
        )}
        {hasAccess && (
          <>
            <span className="loc-meta">{allCams.length} cam{allCams.length !== 1 ? 's' : ''}</span>
            <span className={`loc-cam-count ${liveCount > 0 ? 'live' : ''}`}>
              {liveCount > 0 ? `● ${liveCount} LIVE` : '○ STARTING'}
            </span>
            <span className={`loc-chevron ${open ? 'open' : ''}`}>▼</span>
          </>
        )}
      </div>

      {/* expanded content */}
      <div className={`loc-expand ${open && hasAccess ? 'is-open' : ''}`}>
        <div className="loc-expand-inner">

          {/* if has subLocations — show sub-dropdowns */}
          {location.subLocations ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 16 }}>
              {location.subLocations.map(sub => {
                const subCams = sub.cameras.map(lc => cameras.find(c => c.id === lc.id) || lc)
                const subLive = subCams.filter(c => c.ready).length
                return (
                  <div key={sub.id}>
                    {/* sub-location row */}
                    <div
                      className={`loc-link ${subOpen[sub.id] ? 'is-open' : ''}`}
                      onClick={() => toggleSub(sub.id)}
                      style={{ padding: '7px 12px' }}
                    >
                      <span className="loc-icon" style={{ fontSize: 13 }}>📍</span>
                      <span className="loc-label" style={{ fontSize: 12 }}>{sub.label}</span>
                      <span className="loc-meta">{subCams.length} cam</span>
                      <span className={`loc-cam-count ${subLive > 0 ? 'live' : ''}`}>
                        {subLive > 0 ? `● ${subLive} LIVE` : '○ STARTING'}
                      </span>
                      <span className={`loc-chevron ${subOpen[sub.id] ? 'open' : ''}`}>▼</span>
                    </div>
                    {/* sub camera feed */}
                    <div className={`loc-expand ${subOpen[sub.id] ? 'is-open' : ''}`}>
                      <div className="loc-expand-inner">
                        <CameraGrid cameras={subCams} hideToolbar />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* normal single-level cameras */
            <CameraGrid cameras={allCams} hideToolbar />
          )}

        </div>
      </div>
    </div>
  )
}
export default function LocationCameraPanel({ cameras = [] }) {
  injectLocCSS()
  const { currentUser, isAdmin, visibleLocations } = useUser()

  return (
    <div>
      {/* role banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
        fontSize: 11, color: '#64748b',
      }}>
        <span style={{
          padding: '2px 8px', borderRadius: 10, fontFamily: 'monospace', fontWeight: 700, fontSize: 10,
          background: isAdmin ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.15)',
          color: isAdmin ? '#93c5fd' : '#94a3b8',
          border: `1px solid ${isAdmin ? 'rgba(59,130,246,0.3)' : 'rgba(100,116,139,0.3)'}`,
        }}>
          {currentUser.name} · {isAdmin ? 'ADMIN' : 'USER'}
        </span>
        <span>
          {isAdmin
            ? 'Showing all 4 locations'
            : 'Showing 2 of 4 locations — switch to Admin in Settings for full access'}
        </span>
      </div>

      <div className="loc-panel-wrap">
        {/* visible locations for this role */}
        {visibleLocations.map(loc => (
          <LocationRow key={loc.id} location={loc} cameras={cameras} isAdmin={isAdmin} />
        ))}
      </div>
    </div>
  )
}
