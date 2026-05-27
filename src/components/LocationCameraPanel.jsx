import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from './UserContext'
import CameraGrid from './CameraGrid'

const TAB_CSS = `
.loc-tab-bar {
  display: flex; gap: 6px; flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}
.loc-tab-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03); color: #64748b;
  font-size: 13px; font-weight: 500; transition: all 0.18s;
  outline: none; position: relative; white-space: nowrap; user-select: none;
}
.loc-tab-btn:hover:not(:disabled) {
  border-color: rgba(59,130,246,0.4); background: rgba(59,130,246,0.07); color: #93c5fd;
}
.loc-tab-btn.active {
  border-color: #3b82f6; background: rgba(59,130,246,0.15); color: #93c5fd; font-weight: 700;
}
.loc-tab-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.loc-tab-pill {
  font-size: 10px; font-weight: 700; padding: 1px 6px;
  border-radius: 99px; font-family: monospace;
  background: rgba(255,255,255,0.06); color: #475569;
  border: 1px solid rgba(255,255,255,0.06); transition: all 0.18s;
}
.loc-tab-btn.active .loc-tab-pill { background: rgba(59,130,246,0.25); color: #bfdbfe; border-color: rgba(59,130,246,0.3); }
.loc-tab-pill.live { background: rgba(34,197,94,0.15); color: #4ade80; border-color: rgba(34,197,94,0.3); }
.loc-live-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #4ade80;
  flex-shrink: 0; animation: loc-pulse 1.4s infinite;
}
.loc-chevron { font-size: 9px; color: #64748b; transition: transform 0.18s; margin-left: 2px; }
.loc-tab-btn.open .loc-chevron { transform: rotate(180deg); color: #93c5fd; }

.loc-popover-portal {
  position: fixed; z-index: 99999;
  background: #1e293b; border: 1px solid rgba(59,130,246,0.35);
  border-radius: 9px; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  min-width: 180px; overflow: hidden; animation: loc-pop-in 0.15s ease;
}
@keyframes loc-pop-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.loc-popover-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; cursor: pointer; font-size: 13px; color: #94a3b8;
  transition: background 0.12s, color 0.12s; border: none;
  background: none; width: 100%; text-align: left; white-space: nowrap;
}
.loc-popover-item:hover { background: rgba(59,130,246,0.1); color: #93c5fd; }
.loc-popover-item.selected { background: rgba(59,130,246,0.15); color: #bfdbfe; font-weight: 700; }
.loc-popover-item + .loc-popover-item { border-top: 1px solid rgba(255,255,255,0.05); }

.loc-breadcrumb {
  display: flex; align-items: center; gap: 4px;
  margin-bottom: 10px; min-height: 18px; flex-wrap: wrap;
}
.loc-crumb {
  font-size: 11px; font-family: 'JetBrains Mono', monospace;
  color: #334155; letter-spacing: 0.04em; transition: color 0.15s;
}
.loc-crumb.active { color: #93c5fd; font-weight: 700; }
.loc-crumb.link { cursor: pointer; color: #475569; }
.loc-crumb.link:hover { color: #93c5fd; }
.loc-crumb-sep { font-size: 10px; color: #1e293b; }
.loc-crumb-home { font-size: 12px; cursor: pointer; color: #334155; transition: color 0.15s; user-select: none; }
.loc-crumb-home:hover { color: #93c5fd; }

@keyframes loc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
`

let locCssInjected = false
function injectLocCSS() {
  if (locCssInjected) return
  const s = document.createElement('style'); s.textContent = TAB_CSS
  document.head.appendChild(s); locCssInjected = true
}

function resolveCams(camRefs = [], allCameras = []) {
  return camRefs.map(lc => allCameras.find(c => c.id === lc.id) || lc)
}

/* ── Portal Popover ── */
function PopoverPortal({ anchorRef, children, onClose }) {
  const [style, setStyle] = useState({})
  const portalRef = useRef(null)

  useEffect(() => {
    function position() {
      if (!anchorRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      const POPOVER_H = 120
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const fitsBelow = spaceBelow >= POPOVER_H
      setStyle(fitsBelow
        ? { top: rect.bottom + 6, left: rect.left }
        : { top: rect.top - POPOVER_H - 6, left: rect.left }
      )
    }
    position()
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    return () => {
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
    }
  }, [anchorRef])

  useEffect(() => {
    function handleOutside(e) {
      const inAnchor = anchorRef.current && anchorRef.current.contains(e.target)
      const inPortal = portalRef.current && portalRef.current.contains(e.target)
      if (!inAnchor && !inPortal) onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [anchorRef, onClose])

  return createPortal(
    <div ref={portalRef} className="loc-popover-portal" style={style}>
      {children}
    </div>,
    document.body
  )
}

/* ── Breadcrumb ── */
function Breadcrumb({ locationLabel, subLabel, camName, onHome, onClickLoc, onClickSub }) {
  return (
    <div className="loc-breadcrumb">
      <span className="loc-crumb-home" onClick={onHome} title="All locations">🏠</span>
      {!locationLabel ? (
        <span className="loc-crumb" style={{ color: '#1e293b' }}>— select a location</span>
      ) : (
        <>
          <span className="loc-crumb-sep">›</span>
          <span className={`loc-crumb ${!subLabel && !camName ? 'active' : 'link'}`}
            onClick={() => { if (subLabel || camName) onClickLoc?.() }}>
            {locationLabel}
          </span>
          {subLabel && <>
            <span className="loc-crumb-sep">›</span>
            <span className={`loc-crumb ${!camName ? 'active' : 'link'}`}
              onClick={() => { if (camName) onClickSub?.() }}>
              {subLabel}
            </span>
          </>}
          {camName && <>
            <span className="loc-crumb-sep">›</span>
            <span className="loc-crumb active">{camName}</span>
          </>}
        </>
      )}
    </div>
  )
}

/* ── Location button ── */
function LocationButton({ loc, cameras, activeId, activeSubId, popoverOpenId, onSelect, onSelectSub, onTogglePopover }) {
  const isActive      = loc.id === activeId
  const isPopoverOpen = popoverOpenId === loc.id
  const hasSubLocs    = !!loc.subLocations
  const btnRef        = useRef(null)

  const allCams   = hasSubLocs
    ? loc.subLocations.flatMap(s => resolveCams(s.cameras, cameras))
    : resolveCams(loc.cameras || [], cameras)
  const liveCount = allCams.filter(c => c.ready).length

  function handleClick(e) {
    e.stopPropagation()
    if (hasSubLocs) {
      const newId = isActive ? null : loc.id
      onSelect(newId)
      // Only open popover when selecting, close when deselecting
      if (!isActive) {
        onTogglePopover(isPopoverOpen ? null : loc.id)
      } else {
        onTogglePopover(null)
      }
    } else {
      onSelect(isActive ? null : loc.id)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        className={`loc-tab-btn ${isActive ? 'active' : ''} ${isPopoverOpen ? 'open' : ''}`}
        onClick={handleClick}
      >
        <span style={{ fontSize: 15 }}>{loc.icon}</span>
        <span>{loc.label}</span>
        <span className={`loc-tab-pill ${liveCount > 0 ? 'live' : ''}`}>
          {allCams.length} cam{allCams.length !== 1 ? 's' : ''}
        </span>
        {liveCount > 0 && <span className="loc-live-dot" />}
        {hasSubLocs && <span className="loc-chevron">▼</span>}
      </button>

      {hasSubLocs && isPopoverOpen && (
        <PopoverPortal anchorRef={btnRef} onClose={() => onTogglePopover(null)}>
          {loc.subLocations.map(sub => {
            const subCams = resolveCams(sub.cameras, cameras)
            const subLive = subCams.filter(c => c.ready).length
            return (
              <button
                key={sub.id}
                className={`loc-popover-item ${sub.id === activeSubId ? 'selected' : ''}`}
                onClick={e => {
                  e.stopPropagation()
                  onSelectSub(sub.id, loc.id)  // ← pass loc.id too
                  onTogglePopover(null)
                }}
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
        </PopoverPortal>
      )}
    </>
  )
}

/* ── Main ── */
export default function LocationCameraPanel({ cameras = [], onCamSelect }) {
  injectLocCSS()

  const userContext = useUser()

  const [activeId,      setActiveId]      = useState(null)
  const [activeSubId,   setActiveSubId]   = useState(null)
  const [popoverOpenId, setPopoverOpenId] = useState(null)
  const [selectedCam,   setSelectedCam]   = useState(null)

  if (!userContext) return null

  const { currentUser, isAdmin, visibleLocations } = userContext

  const activeLoc = activeId ? visibleLocations.find(l => l.id === activeId) : null
  const activeSub = activeLoc?.subLocations?.find(s => s.id === activeSubId)

  let visibleCams = []
  if (activeLoc) {
    if (activeLoc.subLocations) {
      const sub = activeLoc.subLocations.find(s => s.id === activeSubId)
      visibleCams = sub ? resolveCams(sub.cameras, cameras) : []
    } else {
      visibleCams = resolveCams(activeLoc.cameras || [], cameras)
    }
  }

  const showGrid = activeLoc && (!activeLoc.subLocations || activeSubId)

  return (
    <div>

      {/* Breadcrumb */}
      <Breadcrumb
        locationLabel={activeLoc?.label}
        subLabel={activeSub?.label}
        camName={selectedCam ? (selectedCam.name || selectedCam.id) : null}
        onHome={() => {
          setActiveId(null)
          setActiveSubId(null)
          setSelectedCam(null)
          setPopoverOpenId(null)
          onCamSelect?.(null)
        }}
        onClickLoc={() => {
          setSelectedCam(null)
          if (activeLoc && !activeLoc.subLocations) {
            const locCams = resolveCams(activeLoc.cameras || [], cameras)
            onCamSelect?.({ id: locCams.map(c => c.id).join(','), name: activeLoc.label, _isLocation: true })
          } else {
            onCamSelect?.(null)
          }
        }}
        onClickSub={() => {
          setSelectedCam(null)
          if (activeSub) {
            const subCams = resolveCams(activeSub.cameras, cameras)
            onCamSelect?.({ id: subCams.map(c => c.id).join(','), name: activeSub.label, _isLocation: true })
          }
        }}
      />

      {/* Tab buttons */}
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
              popoverOpenId={popoverOpenId}
              onSelect={id => {
                setActiveId(id)
                setActiveSubId(null)
                setSelectedCam(null)
                if (!id) {
                  setPopoverOpenId(null)
                  onCamSelect?.(null)
                } else {
                  const selected = visibleLocations.find(l => l.id === id)
                  if (selected && !selected.subLocations) {
                    const locCams = resolveCams(selected.cameras || [], cameras)
                    onCamSelect?.({
                      id:          locCams.map(c => c.id).join(','),
                      name:        selected.label,
                      _isLocation: true,
                    })
                  } else if (selected && selected.subLocations) {
                    const allSubCams = selected.subLocations.flatMap(s => resolveCams(s.cameras, cameras))
                    onCamSelect?.({
                      id:          allSubCams.map(c => c.id).join(','),
                      name:        selected.label,
                      _isLocation: true,
                    })
                  }
                }
              }}
              onSelectSub={(subId, parentLocId) => {   // ← NOW receives parentLocId too
                setActiveSubId(subId)
                setActiveId(parentLocId)               // ← FIX: ensure activeId is set
                setSelectedCam(null)
                const parentLoc = visibleLocations.find(l => l.id === parentLocId)  // ← use parentLocId
                const sub       = parentLoc?.subLocations?.find(s => s.id === subId)
                if (sub) {
                  const subCams = resolveCams(sub.cameras, cameras)
                  onCamSelect?.({
                    id:          subCams.map(c => c.id).join(','),
                    name:        sub.label,
                    _isLocation: true,
                  })
                }
              }}
              onTogglePopover={setPopoverOpenId}
            />
          ))}
      </div>

      {/* Camera grid */}
      {showGrid && (
        <CameraGrid
          key={`${activeId}-${activeSubId}`}
          cameras={visibleCams}
          onCamSelect={(cam) => {
            setSelectedCam(cam)
            onCamSelect?.(cam)
          }}
        />
      )}
    </div>
  )
}
