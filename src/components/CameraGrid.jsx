import { useState, useEffect, useRef } from 'react'
import ZoneOverlay from './ZoneOverlay'

const GAP = 8
const ROW_H_RATIO = 9 / 16
const MAX_COLS = 8
const ROWS_VISIBLE = 2
const MIN_CELL_W = 100   // never shrink below 100px

const GRID_CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

.cam-btn {
  position: relative;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(99,130,200,0.25);
  background: #0a0e1a;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.15s;
  display: inline-flex;
}
.cam-btn:hover {
  border-color: rgba(59,130,246,0.7);
  box-shadow: 0 0 0 2px rgba(59,130,246,0.22), 0 4px 18px rgba(0,0,0,0.45);
  transform: translateY(-2px);
}
.cam-btn:active { transform: scale(0.97); }
.cam-btn video {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  display: block; pointer-events: none;
}

.cam-btn-top {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 5px 6px 14px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%);
  z-index: 3; pointer-events: none;
}
.cam-btn-bottom {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 14px 6px 5px;
  background: linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%);
  z-index: 3; pointer-events: none;
}

.cam-id-badge {
  font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7);
  font-family: 'JetBrains Mono', monospace; line-height: 1.2;
}
.cam-name-label {
  font-size: 10px;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  letter-spacing: 0.03em; display: block;
}

.cam-status-pill {
  font-size: 8px; font-weight: 700; letter-spacing: 0.05em;
  padding: 2px 5px; border-radius: 6px;
  font-family: 'JetBrains Mono', monospace; white-space: nowrap;
}
.cam-status-pill.live    { background: rgba(34,197,94,0.30);   color: #ffffff; border: 1px solid rgba(34,197,94,0.6);  text-shadow: 0 1px 3px rgba(0,0,0,0.7); }
.cam-status-pill.offline { background: rgba(30,30,40,0.55);    color: #cbd5e1; border: 1px solid rgba(148,163,184,0.4); }

.cam-expand-hint {
  position: absolute; bottom: 5px; right: 6px;
  font-size: 9px; color: rgba(255,255,255,0.55);
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  font-family: monospace; z-index: 4; pointer-events: none;
  opacity: 0; transition: opacity 0.18s;
}
.cam-btn:hover .cam-expand-hint { opacity: 1; }

.cam-grid-outer { width: 100%; box-sizing: border-box; }
.cam-grid-scroll {
  overflow-y: auto; overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(59,130,246,0.4) transparent;
}
.cam-grid-scroll::-webkit-scrollbar { width: 5px; }
.cam-grid-scroll::-webkit-scrollbar-thumb { background: rgba(59,130,246,0.4); border-radius: 3px; }
.cam-grid-inner {
  display: flex; flex-wrap: wrap; gap: 8px;
  padding: 2px; box-sizing: border-box;
}
.cam-grid-inner.solo {
  justify-content: center; align-items: center;
}

.cam-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.cam-count-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase; font-family: 'JetBrains Mono', monospace;
}
.cam-count-label.dark  { color: #475569; }
.cam-count-label.light { color: #334155; }

.cam-search-wrap {
  display: flex; align-items: center; gap: 6px;
  border-radius: 7px; padding: 4px 8px;
  transition: all 0.2s; overflow: hidden;
}
.cam-search-wrap.dark  { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10); }
.cam-search-wrap.light { background: rgba(0,0,0,0.04);       border: 1px solid rgba(0,0,0,0.15); }
.cam-search-wrap.open.dark  { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.45); }
.cam-search-wrap.open.light { background: rgba(59,130,246,0.06); border-color: rgba(59,130,246,0.45); }
.cam-search-input {
  background: none; border: none; outline: none;
  font-size: 11px; font-family: 'JetBrains Mono', monospace; width: 160px;
}
.cam-search-input.dark  { color: #e2e8f0; }
.cam-search-input.light { color: #1e293b; }

.cam-scroll-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 8px 2px;
  border-top: 1px solid rgba(59,130,246,0.15);
}
.cam-scroll-dots { display: flex; gap: 4px; align-items: center; }
.cam-scroll-dot {
  height: 3px; border-radius: 2px;
  background: rgba(255,255,255,0.15); transition: all 0.2s;
}
.cam-scroll-dot.active { background: #3b82f6; }
.cam-page-label { font-size: 10px; color: #475569; font-family: monospace; }
.cam-no-results { padding: 16px; font-size: 12px; font-family: monospace; }

.cam-modal-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(2,6,23,0.92); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: camFadeIn 0.18s ease;
}
@keyframes camFadeIn { from { opacity: 0 } to { opacity: 1 } }
.cam-modal-inner {
  position: relative; width: 88vw; height: 80vh; max-width: 1300px;
  border-radius: 10px; overflow: hidden;
  border: 1px solid rgba(59,130,246,0.3);
  animation: camScaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
  background: #000;
}
@keyframes camScaleIn { from { transform: scale(0.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.cam-modal-inner video { width: 100%; height: 100%; object-fit: contain; background: #000; }
.cam-modal-topbar {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%);
  z-index: 2;
}
.cam-modal-close {
  width: 32px; height: 32px; border-radius: 7px; border: none;
  background: rgba(239,68,68,0.25); color: #fca5a5; font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.cam-modal-close:hover { background: rgba(239,68,68,0.55); }
.cam-modal-zoom-btn {
  height: 28px; padding: 0 10px; border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08); color: #e2e8f0;
  font-size: 12px; cursor: pointer; transition: background 0.15s;
}
.cam-modal-zoom-btn:hover { background: rgba(59,130,246,0.35); }
`

let cssInjected = false
function injectCSS() {
  if (cssInjected) return
  const s = document.createElement('style'); s.textContent = GRID_CSS
  document.head.appendChild(s); cssInjected = true
}

function CamVideo({ cam, objFit = 'cover' }) {
  const videoRef = useRef(null), hlsRef = useRef(null)
  const retryTimer = useRef(null), watchdogRef = useRef(null), lastTime = useRef(null)

  useEffect(() => {
    injectCSS()
    if (!cam.hls_url) return
    function startWatchdog() {
      clearInterval(watchdogRef.current); lastTime.current = null
      watchdogRef.current = setInterval(() => {
        const v = videoRef.current; if (!v) return
        const ct = v.currentTime
        if (lastTime.current !== null && ct === lastTime.current) {
          clearInterval(watchdogRef.current); retryTimer.current = setTimeout(attachHls, 1000)
        }
        lastTime.current = ct
      }, 5000)
    }
    function attachHls() {
      const v = videoRef.current; if (!v) return
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      const url = `${cam.hls_url}?t=${Date.now()}`
      if (window.Hls?.isSupported()) {
        const hls = new window.Hls({ lowLatencyMode: true, enableWorker: true, backBufferLength: 0, maxBufferLength: 10 })
        hls.loadSource(url); hls.attachMedia(v); hlsRef.current = hls
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); startWatchdog() })
        hls.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal) { clearInterval(watchdogRef.current); retryTimer.current = setTimeout(attachHls, 4000) } })
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(() => {}); startWatchdog() }
    }
    function attach() {
      if (typeof window.Hls === 'undefined') {
        if (!document.querySelector('script[data-hls]')) {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js'
          s.setAttribute('data-hls', '1'); s.onload = attachHls; document.head.appendChild(s)
        } else retryTimer.current = setTimeout(attach, 500)
      } else attachHls()
    }
    const v = videoRef.current
    const onStall = () => { clearInterval(watchdogRef.current); retryTimer.current = setTimeout(attachHls, 3000) }
    v?.addEventListener('stalled', onStall); v?.addEventListener('error', onStall)
    attach()
    return () => {
      clearInterval(watchdogRef.current); clearTimeout(retryTimer.current)
      v?.removeEventListener('stalled', onStall); v?.removeEventListener('error', onStall)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [cam.hls_url])

  return (
    <video
      ref={videoRef} autoPlay muted playsInline
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: objFit, display: 'block', background: '#000' }}
    />
  )
}

function ZoomModal({ cam, onClose }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false), panStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const adjustZoom = d => setZoom(p => { const n = Math.max(1, Math.min(4, +(p + d).toFixed(2))); if (n === 1) setPan({ x: 0, y: 0 }); return n })
  const onMouseDown = e => { if (zoom <= 1) return; isPanning.current = true; panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y } }
  const onMouseMove = e => { if (!isPanning.current) return; setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }) }
  const onMouseUp = () => { isPanning.current = false }

  return (
    <div className="cam-modal-backdrop" onClick={onClose}>
      <div className="cam-modal-inner" onClick={e => e.stopPropagation()}>
        <div className="cam-modal-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{cam.id}</span>
            {cam.displayName && <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>— {cam.displayName}</span>}
            <span className={`cam-status-pill ${cam.ready ? 'live' : 'offline'}`}>{cam.ready ? '● LIVE' : '○ WAIT'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[1,2,3,4].map(lv => (
              <button key={lv} className="cam-modal-zoom-btn"
                style={{ background: zoom === lv ? 'rgba(59,130,246,0.5)' : undefined, color: zoom === lv ? '#fff' : undefined }}
                onClick={() => { setZoom(lv); setPan({ x: 0, y: 0 }) }}>{lv}×</button>
            ))}
            <button className="cam-modal-zoom-btn" onClick={() => adjustZoom(-0.25)}>－</button>
            <span style={{ fontSize: 12, color: '#93c5fd', fontFamily: 'monospace', minWidth: 36, textAlign: 'center' }}>{zoom.toFixed(1)}×</span>
            <button className="cam-modal-zoom-btn" onClick={() => adjustZoom(+0.25)}>＋</button>
            <button className="cam-modal-close" onClick={onClose} title="Close (Esc)">✕</button>
          </div>
        </div>
        <div
          style={{ width: '100%', height: '100%', overflow: 'hidden', cursor: zoom > 1 ? 'grab' : 'default' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        >
          <div style={{
            position: 'relative',
            width: '100%', height: '100%',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
            transition: isPanning.current ? 'none' : 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <CamVideo cam={cam} objFit="contain" />
            {/* FIX: pass cam.name (MongoDB key) not cam.id (display label) */}
            <ZoneOverlay cameraName={cam.name} mode="contain" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Layout helpers ── */
function computeLayout(n, W) {
  if (n === 1) return { cols: 1, cW: 500, cH: 250 }
  const ideal = Math.floor((W + GAP) / (160 + GAP))
  const cols = Math.min(Math.max(1, ideal), Math.min(n, MAX_COLS))
  const cW = Math.max(MIN_CELL_W, (W - 4 - (cols - 1) * GAP) / cols)
  const cH = Math.round(cW * ROW_H_RATIO)
  return { cols, cW, cH }
}

export default function CameraGrid({ cameras = [], theme = 'dark', onCamSelect }) {
  injectCSS()
  const [zoomedCam, setZoomedCam]   = useState(null)
  const [search, setSearch]         = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [containerW, setContainerW] = useState(0)
  const containerRef   = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    setContainerW(containerRef.current.clientWidth || 0)
    const ro = new ResizeObserver(e => setContainerW(e[0].contentRect.width))
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])

  const t = theme === 'light' ? 'light' : 'dark'

  const slots = cameras.length > 0 ? cameras : [
    { id: 'CAM-A01', name: 'Pier_Cap_Cam_16389', displayName: 'Entry Gate A',    hls_url: '/hls/CAM-A01/stream.m3u8', ready: false },
    { id: 'CAM-A02', name: 'Pier_Cap_Cam_16388', displayName: 'North Perimeter', hls_url: '/hls/CAM-A02/stream.m3u8', ready: false },
    { id: 'CAM-A03', name: 'Pier_Cap_Cam_16387', displayName: 'Lift Shaft B3',   hls_url: '/hls/CAM-A03/stream.m3u8', ready: false },
    { id: 'CAM-A07', name: 'Pier_Cap_Cam_16386', displayName: 'Loading Bay',     hls_url: '/hls/CAM-A07/stream.m3u8', ready: false },
  ]

  const filtered = search.trim()
    ? slots.filter(c =>
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.displayName || '').toLowerCase().includes(search.toLowerCase())
      )
    : slots

  const n = filtered.length
  const W = containerW || 900

  const { cols, cW, cH } = computeLayout(n, W)
  const totalRows  = Math.ceil(n / cols)
  const needsScroll = totalRows > ROWS_VISIBLE
  const visibleH = ROWS_VISIBLE * cH + (ROWS_VISIBLE - 1) * GAP + 4

  return (
    <>
      {/* Header */}
      <div className="cam-header">
        <span className={`cam-count-label ${t}`}>
          {n}/{slots.length} camera{slots.length !== 1 ? 's' : ''}{search && ' · filtered'}
        </span>
        <div
          className={`cam-search-wrap ${t}${searchOpen ? ' open' : ''}`}
          style={{ width: searchOpen ? 200 : 30 }}
        >
          <button
            onClick={() => { setSearchOpen(o => !o); if (searchOpen) setSearch('') }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: searchOpen ? '#93c5fd' : (t === 'dark' ? '#64748b' : '#475569'),
              fontSize: 13, padding: 0, flexShrink: 0, lineHeight: 1,
            }}
            title={searchOpen ? 'Close search' : 'Search cameras'}
          >🔍</button>
          {searchOpen && (
            <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ID or name…" className={`cam-search-input ${t}`} />
          )}
          {searchOpen && search && (
            <button onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', color: t === 'dark' ? '#64748b' : '#475569', cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}>✕</button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="cam-grid-outer" ref={containerRef}>
        {n === 0 ? (
          <div className="cam-no-results" style={{ color: t === 'dark' ? '#475569' : '#64748b' }}>
            No cameras match "{search}"
          </div>
        ) : containerW === 0 ? (
          <div style={{ height: 250, background: 'transparent' }} />
        ) : (
          <>
            <div
              className="cam-grid-scroll"
              style={{ maxHeight: needsScroll ? visibleH : undefined, overflowY: needsScroll ? 'auto' : 'visible' }}
            >
              <div className={`cam-grid-inner${n === 1 ? ' solo' : ''}`}>
                {filtered.map(cam => (
                  <div
                    key={cam.id}
                    className="cam-btn"
                    style={{ width: cW, height: cH }}
                    onClick={() => { setZoomedCam(cam); onCamSelect?.(cam) }}
                    title={`${cam.id}${cam.displayName ? ' — ' + cam.displayName : ''} · click to expand`}
                  >
                    <CamVideo cam={cam} />
                    <div className="cam-btn-top">
                      <span className="cam-id-badge">{cam.id}</span>
                      <span className={`cam-status-pill ${cam.ready ? 'live' : 'offline'}`}>
                        {cam.ready ? '● REC' : '○ WAIT'}
                      </span>
                    </div>
                    {cam.displayName && (
                      <div className="cam-btn-bottom">
                        <span className="cam-name-label">{cam.displayName}</span>
                      </div>
                    )}
                    {/* FIX: pass cam.name (MongoDB key e.g. "Pier_Cap_Cam_16389")
                             NOT cam.id (display label e.g. "CAM-A01")           */}
                    <ZoneOverlay cameraName={cam.name} />
                    <span className="cam-expand-hint">⤢ expand</span>
                  </div>
                ))}
              </div>
            </div>

            {needsScroll && (
              <div className="cam-scroll-bar">
                <span className="cam-page-label">scroll to see all {totalRows} rows</span>
                <div className="cam-scroll-dots">
                  {Array.from({ length: totalRows }).map((_, i) => (
                    <div key={i} className={`cam-scroll-dot${i < ROWS_VISIBLE ? ' active' : ''}`}
                      style={{ width: i < ROWS_VISIBLE ? 14 : 6 }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {zoomedCam && <ZoomModal cam={zoomedCam} onClose={() => setZoomedCam(null)} />}
    </>
  )
}
