import { useState, useEffect, useRef } from 'react'
import { useUser } from './UserContext'
import CameraGrid from './CameraGrid'

/* ─── CSS ─────────────────────────────────────────────────────────────────── */
const TAB_CSS = `
.loc-tab-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  position: relative;       /* popover anchors to this */
}

/* ── individual location button ── */
.loc-tab-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.18s;
  outline: none;
  position: relative;
  white-space: nowrap;
  user-select: none;
}
.loc-tab-btn:hover:not(:disabled) {
  border-color: rgba(59,130,246,0.4);
  background: rgba(59,130,246,0.07);
  color: #93c5fd;
}
.loc-tab-btn.active {
  border-color: #3b82f6;
  background: rgba(59,130,246,0.15);
  color: #93c5fd;
  font-weight: 700;
}
.loc-tab-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── cam-count pill ── */
.loc-tab-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 99px;
  font-family: monospace;
  background: rgba(255,255,255,0.06);
  color: #475569;
  border: 1px solid rgba(255,255,255,0.06);
  transition: all 0.18s;
}
.loc-tab-btn.active .loc-tab-pill {
  background: rgba(59,130,246,0.25);
  color: #bfdbfe;
  border-color: rgba(59,130,246,0.3);
}
.loc-tab-pill.live {
  background: rgba(34,197,94,0.15);
  color: #4ade80;
  border-color: rgba(34,197,94,0.3);
}

/* ── pulsing live dot ── */
.loc-live-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #4ade80;
  flex-shrink: 0;
  animation: loc-pulse 1.4s infinite;
}

/* ── lock badge for admin-only ── */
.loc-lock-badge {
  font-size: 9px;
  color: #f87171;
  font-family: monospace;
  font-weight: 700;
  background: rgba(239,68,68,0.15);
  padding: 2px 6px;
  border-radius: 8px;
  border: 1px solid rgba(239,68,68,0.3);
}

/* ── chevron on multi-location buttons ── */
.loc-chevron {
  font-size: 9px;
  color: #64748b;
  transition: transform 0.18s;
  margin-left: 2px;
}
.loc-tab-btn.active .loc-chevron { transform: rotate(180deg); color: #93c5fd; }

/* ── popover dropdown (attached to button) ── */
.loc-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 200;
  background: #1e293b;
  border: 1px solid rgba(59,130,246,0.35);
  border-radius: 9px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.45);
  min-width: 180px;
  overflow: hidden;
  animation: loc-pop-in 0.15s ease;
}
@keyframes loc-pop-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

.loc-popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 13px;
  color: #94a3b8;
  transition: background 0.12s, color 0.12s;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  white-space: nowrap;
}
.loc-popover-item:hover {
  background: rgba(59,130,246,0.1);
  color: #93c5fd;
}
.loc-popover-item.selected {
  background: rgba(59,130,246,0.15);
  color: #bfdbfe;
  font-weight: 700;
}
.loc-popover-item + .loc-popover-item {
  border-top: 1px solid rgba(255,255,255,0.05);
}

@keyframes loc-pulse {
  0%,100% { opacity: 1; }
  50%      { opacity: 0.3; }
}
`

let locCssInjected = false
function injectLocCSS() {
  if (locCssInjected) return
  const s = document.createElement('style')
  s.textContent = TAB_CSS
  document.head.appendChild(s)
  locCssInjected = true
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function resolveCams(camRefs, allCameras) {
  return camRefs.map(lc => allCameras.find(c => c.id === lc.id) || lc)
}

/* ─── Single location button (handles simple + multi-sub-location) ─────────── */
function LocationButton({ loc, cameras, activeId, activeSubId, onSelect, onSelectSub }) {
  const hasAccess  = true // parent already filters by role
  const isActive   = loc.id === activeId
  const btnRef     = useRef(null)
  const hasSubLocs = !!loc.subLocations

  const allCams = hasSubLocs
    ? loc.subLocations.flatMap(s => resolveCams(s.cameras, cameras))
    : resolveCams(loc.cameras || [], cameras)
  const liveCount = allCams.filter(c => c.ready).length

  function handleClick(e) {
    e.stopPropagation()
    if (hasSubLocs) {
      // toggle the popover; if opening, pre-select first sub
      if (isActive) {
        onSelect(null)          // close
      } else {
        onSelect(loc.id)
        if (!activeSubId) onSelectSub(loc.subLocations[0].id)
      }
    } else {
      onSelect(isActive ? null : loc.id)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={btnRef}>
      <button
        className={`loc-tab-btn ${isActive ? 'active' : ''}`}
        onClick={handleClick}
        title={loc.label}
      >
        <span style={{ fontSize: 16 }}>{loc.icon}</span>
        <span>{loc.label}</span>
        <span className={`loc-tab-pill ${liveCount > 0 ? 'live' : ''}`}>
          {allCams.length} cam{allCams.length !== 1 ? 's' : ''}
        </span>
        {liveCount > 0 && <span className="loc-live-dot" />}
        {hasSubLocs && <span className="loc-chevron">▼</span>}
      </button>

      {/* Popover — only for multi-sub-location buttons, shown when active */}
      {hasSubLocs && isActive && (
        <div className="loc-popover">
          {loc.subLocations.map(sub => {
            const subCams = resolveCams(sub.cameras, cameras)
            const subLive = subCams.filter(c => c.ready).length
            const isSelSub = sub.id === activeSubId
            return (
              <button
                key={sub.id}
                className={`loc-popover-item ${isSelSub ? 'selected' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSelectSub(sub.id) }}
              >
                <span>📍</span>
                <span style={{ flex: 1 }}>{sub.label}</span>
                <span className={`loc-tab-pill ${subLive > 0 ? 'live' : ''}`} style={{ marginLeft: 'auto' }}>
                  {subCams.length} cam{subCams.length !== 1 ? 's' : ''}
                </span>
                {subLive > 0 && <span className="loc-live-dot" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function LocationCameraPanel({ cameras = [] }) {
  injectLocCSS()
  const { currentUser, isAdmin, visibleLocations } = useUser()

  const [activeId,    setActiveId]    = useState(null)   // which location button is active
  const [activeSubId, setActiveSubId] = useState(null)   // which sub-location is selected
  const wrapRef = useRef(null)

  // Click anywhere outside → close everything
  useEffect(() => {
    if (!activeId) return
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setActiveId(null)
        setActiveSubId(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [activeId])

  // Derive what cameras to show
  const activeLoc = activeId ? visibleLocations.find(l => l.id === activeId) : null

  let visibleCams = []
  if (activeLoc) {
    if (activeLoc.subLocations) {
      const sub = activeLoc.subLocations.find(s => s.id === activeSubId)
      visibleCams = sub ? resolveCams(sub.cameras, cameras) : []
    } else {
      visibleCams = resolveCams(activeLoc.cameras || [], cameras)
    }
  }

  return (
    <div ref={wrapRef}>
      {/* ── Role banner ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        fontSize: 11, color: '#64748b',
      }}>
        <span style={{
          padding: '2px 8px', borderRadius: 10, fontFamily: 'monospace',
          fontWeight: 700, fontSize: 10,
          background: isAdmin ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.15)',
          color:      isAdmin ? '#93c5fd' : '#94a3b8',
          border:     `1px solid ${isAdmin ? 'rgba(59,130,246,0.3)' : 'rgba(100,116,139,0.3)'}`,
        }}>
          {currentUser.name} · {isAdmin ? 'ADMIN' : 'USER'}
        </span>
        <span>
          {isAdmin
            ? 'Showing all 4 locations'
            : 'Showing 2 of 4 locations — switch to Admin in Settings for full access'}
        </span>
      </div>

      {/* ── Location buttons (with inline popover for Chennai) ───────────── */}
      <div className="loc-tab-bar">
        {visibleLocations
          .filter(loc => isAdmin || !loc.adminOnly)
          .map(loc => (
            <LocationButton
              key={loc.id}
              loc={loc}
              cameras={cameras}
              activeId={activeId}
              activeSubId={activeSubId}
              onSelect={(id) => { setActiveId(id); if (!id) setActiveSubId(null) }}
              onSelectSub={setActiveSubId}
            />
          ))}
      </div>

      {/* Camera feed */}
      {activeLoc && (
        <div key={`${activeId}-${activeSubId}`}>
          {(!activeLoc.subLocations || activeSubId) && (
            <CameraGrid cameras={visibleCams} hideToolbar />
          )}
        </div>
      )}
    </div>
  )
}
