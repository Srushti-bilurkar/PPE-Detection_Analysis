import { useState, useEffect, useRef, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// API BASE — points to Express server (port 3001), not Vite (port 5173)
// Override via VITE_API_URL env variable for production
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : ''     // ← Changed to 8000

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const ZONE_CSS = `
.zone-grid-overlay {
  position: absolute;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  z-index: 5;
  pointer-events: none;
}
.zone-grid-overlay.interactive {
  pointer-events: all;
}
.zone-cell-ov {
  position: relative;
  border: 1px solid rgba(255,255,255,0.10);
  cursor: pointer;
  transition: border-color 0.15s;
}
.zone-cell-ov:hover {
  border-color: rgba(255,255,255,0.45) !important;
}
.zone-cell-ov.ov-selected {
  border: 2px solid #ffffff !important;
}
/* tier backgrounds are applied via inline style bgColor — NOT via CSS class */
/* CSS class only adds a subtle tier-coloured outline for extra clarity */
.zone-cell-ov.tier-high   { outline: 1px solid rgba(34,  197, 94,  0.45); }
.zone-cell-ov.tier-medium { outline: 1px solid rgba(234, 179, 8,   0.45); }
.zone-cell-ov.tier-low    { outline: 1px solid rgba(239, 68,  68,  0.45); }
.zone-cell-ov.tier-nodata { outline: none; }

.ov-zone-id {
  position: absolute;
  top: 4px; left: 5px;
  font-size: 9px;
  color: rgba(255,255,255,0.55);
  font-family: monospace;
  pointer-events: none;
  user-select: none;
}
.ov-conf-badge {
  position: absolute;
  top: 3px; right: 4px;
  font-size: 10px; font-weight: 700;
  padding: 1px 5px; border-radius: 10px;
  pointer-events: none; user-select: none;
}
.tier-high   .ov-conf-badge { background: rgba(34,  197, 94,  0.88); color: #052e16; }
.tier-medium .ov-conf-badge { background: rgba(234, 179, 8,   0.88); color: #1c1400; }
.tier-low    .ov-conf-badge { background: rgba(239, 68,  68,  0.88); color: #1c0000; }
.tier-nodata .ov-conf-badge { background: rgba(100, 116, 139, 0.75); color: #e2e8f0; }

.ov-blur-label {
  position: absolute;
  bottom: 4px; left: 50%; transform: translateX(-50%);
  font-size: 9px; color: rgba(255,255,255,0.62);
  background: rgba(0,0,0,0.42);
  padding: 1px 5px; border-radius: 8px;
  white-space: nowrap;
  pointer-events: none; user-select: none;
}
.ov-controls {
  position: absolute;
  bottom: 6px; left: 6px;
  display: flex; align-items: center; gap: 4px;
  z-index: 8;
  pointer-events: all;
  flex-wrap: wrap;
}
.ov-btn {
  font-size: 10px; padding: 3px 7px; border-radius: 20px;
  border: 0.5px solid rgba(255,255,255,0.18);
  background: rgba(10,14,26,0.82); color: #94a3b8;
  cursor: pointer; backdrop-filter: blur(4px);
  transition: all 0.15s; white-space: nowrap;
}
.ov-btn:hover { background: rgba(30,40,70,0.90); color: #e2e8f0; }
.ov-btn.ov-active { background: rgba(30,64,175,0.82); color: #bfdbfe; border-color: #3b82f6; }
.ov-slider { width: 52px; accent-color: #3b82f6; cursor: pointer; }

.ov-tooltip {
  position: absolute; z-index: 20;
  background: rgba(10,12,20,0.96);
  border: 0.5px solid #334155; border-radius: 8px;
  padding: 10px 12px; min-width: 172px;
  pointer-events: none; color: #e2e8f0;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}
.ov-tt-title { font-size: 12px; font-weight: 600; margin-bottom: 7px; color: #f1f5f9; }
.ov-tt-row { display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 3px; }
.ov-tt-row b { color: #e2e8f0; }
.ov-tt-advice { font-size: 11px; margin-top: 7px; padding: 5px 8px; border-radius: 5px; line-height: 1.5; }
.ov-tt-high   { background: rgba(34,197,94,0.15);   color: #86efac; }
.ov-tt-medium { background: rgba(234,179,8,0.15);   color: #fde047; }
.ov-tt-low    { background: rgba(239,68,68,0.15);   color: #fca5a5; }
.ov-tt-nodata { background: rgba(100,116,139,0.12); color: #94a3b8; }

.ov-error-badge {
  position: absolute;
  top: 6px; left: 50%; transform: translateX(-50%);
  font-size: 9px; color: #fca5a5;
  background: rgba(239,68,68,0.18);
  padding: 2px 7px; border-radius: 8px;
  white-space: nowrap; pointer-events: none; user-select: none;
  z-index: 10;
}
`

let ovCssInjected = false
function injectOvCSS() {
  if (ovCssInjected) return
  const s = document.createElement('style')
  s.textContent = ZONE_CSS
  document.head.appendChild(s)
  ovCssInjected = true
}

const ZONE_IDS = []
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++)
    ZONE_IDS.push(`r${r}c${c}`)

function getTodayIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

function adviceText(tier) {
  if (tier === 'high')   return 'Trust violation alerts from this zone.'
  if (tier === 'medium') return 'Verify violations manually before acting.'
  if (tier === 'low')    return 'Blind spot - do not act on alerts here.'
  return 'No detection data yet for this zone.'
}

// getVideoRect — only used for object-fit:contain (modal) to exclude black bars
function getVideoRect(containerEl, videoNativeW, videoNativeH) {
  const cw = containerEl.offsetWidth
  const ch = containerEl.offsetHeight
  const videoW = videoNativeW || 1920
  const videoH = videoNativeH || 1080
  const containerRatio = cw / ch
  const videoRatio     = videoW / videoH
  let renderW, renderH, offsetX, offsetY
  if (videoRatio > containerRatio) {
    renderW = cw; renderH = cw / videoRatio; offsetX = 0; offsetY = (ch - renderH) / 2
  } else {
    renderH = ch; renderW = ch * videoRatio; offsetX = (cw - renderW) / 2; offsetY = 0
  }
  return { left: offsetX, top: offsetY, width: renderW, height: renderH }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZoneOverlay
//
// Props:
//   cameraName   - MongoDB camera name string  (e.g. "Pier_Cap_Cam_16389")
//                  *** MUST be cam.name, NOT cam.id ***
//   mode         - 'cover'   → thumbnail grid  (overlay fills cell via inset:0)
//                - 'contain' → modal / expanded (overlay matches video pixels)
//                default: 'cover'
//   selectedDate - optional YYYY-MM-DD; defaults to today IST
// ─────────────────────────────────────────────────────────────────────────────
export default function ZoneOverlay({ cameraName, mode = 'cover', selectedDate = null }) {
  injectOvCSS()

  const [zoneData,     setZoneData]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState(null)
  const [visible,      setVisible]      = useState(false)
  const [view,         setView]         = useState('live')
  const [opacity,      setOpacity]      = useState(0.35)
  const [selectedZone, setSelectedZone] = useState(null)
  const [tooltipPos,   setTooltipPos]   = useState({ top: 8, left: 'auto', right: 8 })
  const [videoRect,    setVideoRect]    = useState(null)

  const containerRef = useRef(null)

  // ── Compute video rect (only meaningful in 'contain' mode) ───────────────
  const computeRect = useCallback(() => {
    if (mode !== 'contain') return
    if (!containerRef.current) return
    const camCell = containerRef.current.parentElement
    if (!camCell) return
    const video   = camCell.querySelector('video')
    const nativeW = video?.videoWidth  || 1920
    const nativeH = video?.videoHeight || 1080
    setVideoRect(getVideoRect(camCell, nativeW, nativeH))
  }, [mode])

  useEffect(() => {
    computeRect()
    if (mode !== 'contain') return
    const ro = new ResizeObserver(computeRect)
    if (containerRef.current?.parentElement) {
      ro.observe(containerRef.current.parentElement)
    }
    const camCell = containerRef.current?.parentElement
    const video   = camCell?.querySelector('video')
    if (video) {
      video.addEventListener('loadedmetadata', computeRect)
      video.addEventListener('resize', computeRect)
    }
    return () => {
      ro.disconnect()
      if (video) {
        video.removeEventListener('loadedmetadata', computeRect)
        video.removeEventListener('resize', computeRect)
      }
    }
  }, [computeRect, mode])

  // ── Fetch zone data every 60 s ───────────────────────────────────────────
  useEffect(() => {
    if (!cameraName) return

    const fetchData = async () => {
      try {
        setFetchError(null)
        const date = selectedDate || getTodayIST()

        // FIX: absolute URL → Express on :3001, not Vite on :5173
        const url = `${API_BASE}/api/zone-map?camera=${encodeURIComponent(cameraName)}&date=${date}`
        console.debug('[ZoneOverlay] fetching:', url)

        const res = await fetch(url)
        if (!res.ok) {
          console.warn('[ZoneOverlay] HTTP', res.status, url)
          setFetchError(`API error ${res.status}`)
          setLoading(false)
          return
        }

        const json = await res.json()
        console.debug('[ZoneOverlay] raw response:', json)

        // Try exact match → case-insensitive match → first available camera
        const cameras = json.cameras || {}
        const matchedKey =
          cameras[cameraName] !== undefined
            ? cameraName
            : Object.keys(cameras).find(
                k => k.toLowerCase() === cameraName.toLowerCase()
              ) ?? Object.keys(cameras)[0]

        const data = matchedKey ? cameras[matchedKey] : {}

        if (!matchedKey) {
          console.warn('[ZoneOverlay] camera not found. Available:', Object.keys(cameras))
          setFetchError(`Camera "${cameraName}" not in response`)
        }

        console.debug('[ZoneOverlay] zones for', cameraName, '(key:', matchedKey, '):', data)
        setZoneData(data)
        setLoading(false)
      } catch (err) {
        console.error('[ZoneOverlay] fetch error:', err)
        setFetchError(err.message)
        setLoading(false)
      }
    }

    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [cameraName, selectedDate])  // re-fetch when date picker changes

  // ── Display logic ────────────────────────────────────────────────────────
  const getDisplay = (zoneId) => {
    const z = zoneData[zoneId]
    if (!z) return { pct: null, tier: 'nodata', label: '—', sub: '' }

    const live     = z.live_gpt
    const stat     = z.static
    const combined = z.combined   // total_violations lives on combined

    if (view === 'live' && live) {
      return {
        pct:   Math.round(live.quality * 100),
        tier:  live.tier,
        label: `${live.detection_count} seen`,
        sub:   (combined?.total_violations ?? 0) > 0
                 ? `${combined.total_violations} viol`
                 : 'live gpt',
      }
    }
    if (view === 'static' && stat) {
      return {
        pct:   Math.round(stat.quality * 100),
        tier:  stat.tier,
        label: stat.blur_label,
        sub:   stat.proximity,
      }
    }
    // Fallback: use whichever source exists
    if (live) {
      return {
        pct:   Math.round(live.quality * 100),
        tier:  live.tier,
        label: `${live.detection_count} seen`,
        sub:   (combined?.total_violations ?? 0) > 0
                 ? `${combined.total_violations} viol`
                 : 'live',
      }
    }
    if (stat) {
      return {
        pct:   Math.round(stat.quality * 100),
        tier:  stat.tier,
        label: stat.blur_label,
        sub:   'static',
      }
    }
    return { pct: null, tier: 'nodata', label: '—', sub: 'no data' }
  }

  // ── Zone click handler ───────────────────────────────────────────────────
  const handleZoneClick = (e, zoneId) => {
    e.stopPropagation()
    if (selectedZone === zoneId) { setSelectedZone(null); return }
    const wrap = containerRef.current
    if (wrap) {
      const wRect  = wrap.getBoundingClientRect()
      const clickX = e.clientX - wRect.left
      const clickY = e.clientY - wRect.top
      if (clickX + 192 < wRect.width) {
        setTooltipPos({ top: Math.max(4, clickY - 80), left: clickX + 10, right: 'auto' })
      } else {
        setTooltipPos({ top: Math.max(4, clickY - 80), left: 'auto', right: wRect.width - clickX + 10 })
      }
    }
    setSelectedZone(zoneId)
  }

  // ── Tooltip ──────────────────────────────────────────────────────────────
  const renderTooltip = () => {
    const z = zoneData[selectedZone] || {}
    const d = getDisplay(selectedZone)
    return (
      <div
        className="ov-tooltip"
        style={{ top: tooltipPos.top, left: tooltipPos.left, right: tooltipPos.right }}
        onClick={e => e.stopPropagation()}
      >
        <div className="ov-tt-title">Zone {selectedZone}</div>
        <div className="ov-tt-row"><span>AI confidence</span><b>{d.pct !== null ? d.pct + '%' : '—'}</b></div>
        <div className="ov-tt-row"><span>Image quality</span><b>{z.static?.blur_label || '—'}</b></div>
        <div className="ov-tt-row"><span>Proximity</span><b>{z.static?.proximity || '—'}</b></div>
        <div className="ov-tt-row"><span>Detections today</span><b>{z.live_gpt?.detection_count ?? '—'}</b></div>
        {/* violations live on combined, not live_gpt */}
        <div className="ov-tt-row"><span>Violations flagged</span><b>{z.combined?.total_violations ?? '—'}</b></div>
        <div className={`ov-tt-advice ov-tt-${d.tier}`}>{adviceText(d.tier)}</div>
      </div>
    )
  }

  const viewLabels = { static: 'Static', live: 'Live' }

  // cover mode   → always fill entire cell (inset: 0)
  // contain mode → only cover actual video pixels (excludes black bars)
  const overlayStyle = (mode === 'contain' && videoRect)
    ? {
        position: 'absolute',
        left: videoRect.left,
        top: videoRect.top,
        width: videoRect.width,
        height: videoRect.height,
        zIndex: 5,
      }
    : { position: 'absolute', inset: 0, zIndex: 5 }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}
      onClick={() => setSelectedZone(null)}
    >
      {/* Error badge — only visible when fetch fails */}
      {fetchError && (
        <div className="ov-error-badge">⚠ {fetchError}</div>
      )}

      {visible && (
        <div className="zone-grid-overlay interactive" style={overlayStyle}>
          {ZONE_IDS.map(zoneId => {
            const d   = getDisplay(zoneId)
            const sel = selectedZone === zoneId

            // While loading: show shimmer so grid is visible immediately
            const bgColor = loading
              ? `rgba(100, 116, 139, 0.18)`
              : d.tier === 'high'
                ? `rgba(34,  197, 94,  ${opacity})`
                : d.tier === 'medium'
                  ? `rgba(234, 179, 8,   ${opacity})`
                  : d.tier === 'low'
                    ? `rgba(239, 68,  68,  ${opacity})`
                    : `rgba(100, 116, 139, ${Math.max(opacity * 0.5, 0.12)})`

            return (
              <div
                key={zoneId}
                className={`zone-cell-ov tier-${d.tier}${sel ? ' ov-selected' : ''}`}
                style={{ background: bgColor, pointerEvents: 'all' }}
                onClick={(e) => handleZoneClick(e, zoneId)}
              >
                <span className="ov-zone-id">{zoneId}</span>
                {d.pct !== null && (
                  <span className="ov-conf-badge">{d.pct}%</span>
                )}
                <span className="ov-blur-label">
                  {d.label}{d.sub ? ` · ${d.sub}` : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {visible && selectedZone && renderTooltip()}

      <div
        className="ov-controls"
        style={{ pointerEvents: 'all' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          className={`ov-btn ${visible ? 'ov-active' : ''}`}
          onClick={() => { setVisible(v => !v); setSelectedZone(null) }}
        >
          {visible ? 'Zone ON' : 'Zone OFF'}
        </button>
        {visible && Object.entries(viewLabels).map(([v, label]) => (
          <button
            key={v}
            className={`ov-btn ${view === v ? 'ov-active' : ''}`}
            onClick={() => { setView(v); setSelectedZone(null) }}
          >
            {label}
          </button>
        ))}
        {visible && (
          <input
            type="range" min={5} max={60}
            value={Math.round(opacity * 100)}
            onChange={e => setOpacity(e.target.value / 100)}
            className="ov-slider"
            title="Overlay opacity"
          />
        )}
      </div>
    </div>
  )
}
