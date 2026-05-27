import { useState, useEffect, useRef, useCallback } from 'react'

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
.zone-cell-ov.tier-high   { background: rgba(34,  197, 94,  0.20); }
.zone-cell-ov.tier-medium { background: rgba(234, 179, 8,   0.20); }
.zone-cell-ov.tier-low    { background: rgba(239, 68,  68,  0.20); }
.zone-cell-ov.tier-nodata { background: rgba(100, 116, 139, 0.06); }

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

// getVideoRect - only used for object-fit:contain (modal) to exclude black bars
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

// ZoneOverlay
//
// Props:
//   cameraName  - MongoDB camera name string
//   mode        - 'cover'   -> thumbnail grid cells (object-fit:cover, no black
//                              bars, overlay fills the full cell via inset:0)
//               - 'contain' -> modal / expanded view (object-fit:contain, may
//                              have black bars, overlay is calculated to match
//                              only the actual video pixels)
//               default: 'cover'
export default function ZoneOverlay({ cameraName, mode = 'cover' }) {
  injectOvCSS()

  const [zoneData,     setZoneData]     = useState({})
  const [visible,      setVisible]      = useState(true)
  const [view,         setView]         = useState('live')
  const [opacity,      setOpacity]      = useState(0.20)
  const [selectedZone, setSelectedZone] = useState(null)
  const [tooltipPos,   setTooltipPos]   = useState({ top: 8, left: 'auto', right: 8 })
  const [videoRect,    setVideoRect]    = useState(null)

  const containerRef = useRef(null)

  // Compute video rect (only meaningful in 'contain' mode)
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

  // Fetch zone data every 60 seconds
  useEffect(() => {
    if (!cameraName) return
    const fetchData = async () => {
      try {
        const date = getTodayIST()
        const res  = await fetch(`/api/zone-map?camera=${encodeURIComponent(cameraName)}&date=${date}`)
        if (!res.ok) return
        const json = await res.json()
        setZoneData(json.cameras?.[cameraName] || {})
      } catch (err) {
        console.error('[ZoneOverlay] fetch error:', err)
      }
    }
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [cameraName])

  const getDisplay = (zoneId) => {
    const z = zoneData[zoneId]
    if (!z) return { pct: null, tier: 'nodata', label: '—', sub: '' }
    if (view === 'static') {
      const s = z.static
      if (s) return { pct: Math.round(s.quality * 100), tier: s.tier, label: s.blur_label, sub: s.proximity }
    }
    if (view === 'live') {
      const l = z.live_gpt
      if (l) return {
        pct:   Math.round(l.quality * 100),
        tier:  l.tier,
        label: `${l.detection_count} seen`,
        sub:   l.total_violations > 0 ? `${l.total_violations} viol` : 'live gpt',
      }
    }
    const s = z.static
    if (s) return { pct: Math.round(s.quality * 100), tier: s.tier, label: s.blur_label, sub: 'static' }
    return { pct: null, tier: 'nodata', label: '—', sub: 'no data' }
  }

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
        <div className="ov-tt-row"><span>Violations flagged</span><b>{z.live_gpt?.total_violations ?? '—'}</b></div>
        <div className={`ov-tt-advice ov-tt-${d.tier}`}>{adviceText(d.tier)}</div>
      </div>
    )
  }

  const viewLabels = { static: 'Static', live: 'Live' }

  // cover mode  -> always fill entire cell (inset: 0)
  // contain mode -> only cover actual video pixels (excludes black bars)
  const overlayStyle = (mode === 'contain' && videoRect)
    ? { position: 'absolute', left: videoRect.left, top: videoRect.top, width: videoRect.width, height: videoRect.height, zIndex: 5 }
    : { position: 'absolute', inset: 0, zIndex: 5 }

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}
      onClick={() => setSelectedZone(null)}
    >
      {visible && (
        <div className="zone-grid-overlay interactive" style={overlayStyle}>
          {ZONE_IDS.map(zoneId => {
            const d      = getDisplay(zoneId)
            const sel    = selectedZone === zoneId
            const bgColor =
              d.tier === 'high'   ? `rgba(34,197,94,${opacity})`   :
              d.tier === 'medium' ? `rgba(234,179,8,${opacity})`   :
              d.tier === 'low'    ? `rgba(239,68,68,${opacity})`   :
                                    `rgba(100,116,139,0.06)`
            return (
              <div
                key={zoneId}
                className={`zone-cell-ov tier-${d.tier}${sel ? ' ov-selected' : ''}`}
                style={{ background: bgColor, pointerEvents: 'all' }}
                onClick={(e) => handleZoneClick(e, zoneId)}
              >
                <span className="ov-zone-id">{zoneId}</span>
                {d.pct !== null && <span className="ov-conf-badge">{d.pct}%</span>}
                <span className="ov-blur-label">
                  {d.label}{d.sub ? ` · ${d.sub}` : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {visible && selectedZone && renderTooltip()}

      <div className="ov-controls" style={{ pointerEvents: 'all' }} onClick={e => e.stopPropagation()}>
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
