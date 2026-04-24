import { useEffect, useRef } from 'react'

const GRID_CSS = `
.cam-cell {
  position: relative; overflow: hidden; border-radius: 6px;
  background: #0a0e1a; cursor: pointer;
  transition: box-shadow 0.2s;
}
.cam-cell:hover { box-shadow: 0 0 0 2px rgba(59,130,246,0.55); }
.cam-cell video { width: 100%; height: 100%; object-fit: contain; display: block; pointer-events: none; background: #000; }

.cam-overlay-top {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 8px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 100%);
  pointer-events: none; z-index: 3;
}
.cam-id-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; }
.cam-status-pill { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 10px; font-family: 'JetBrains Mono', monospace; }
.cam-status-pill.live    { background: rgba(34,197,94,0.25); color: #4ade80; border: 1px solid rgba(34,197,94,0.35); }
.cam-status-pill.offline { background: rgba(100,116,139,0.25); color: #94a3b8; border: 1px solid rgba(100,116,139,0.3); }

.cam-modal-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(2,6,23,0.92); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: camFadeIn 0.18s ease;
}
@keyframes camFadeIn { from { opacity: 0 } to { opacity: 1 } }
.cam-modal-inner {
  position: relative; width: 90vw; height: 82vh; max-width: 1400px;
  border-radius: 10px; overflow: hidden;
  border: 1px solid rgba(59,130,246,0.3);
  box-shadow: 0 0 60px rgba(59,130,246,0.15);
  animation: camScaleIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
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
.cam-modal-zoom-btn {
  height: 28px; padding: 0 10px; border-radius: 5px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08); color: #e2e8f0;
  font-size: 12px; cursor: pointer; transition: background 0.15s;
}
.cam-modal-zoom-btn:hover { background: rgba(59,130,246,0.35); }
.cam-modal-close:hover { background: rgba(239,68,68,0.55); }
`

let cssInjected = false
function injectCSS() {
  if (cssInjected) return
  const s = document.createElement('style')
  s.textContent = GRID_CSS
  document.head.appendChild(s)
  cssInjected = true
}

// ── HLS video ─────────────────────────────────────────────────────────────────
function CamVideo({ cam }) {
  const videoRef    = useRef(null)
  const hlsRef      = useRef(null)
  const retryTimer  = useRef(null)
  const watchdogRef = useRef(null)
  const lastTime    = useRef(null)

  useEffect(() => {
    injectCSS()
    if (!cam.hls_url) return

    function startWatchdog() {
      clearInterval(watchdogRef.current); lastTime.current = null
      watchdogRef.current = setInterval(() => {
        const video = videoRef.current; if (!video) return
        const ct = video.currentTime
        if (lastTime.current !== null && ct === lastTime.current) {
          clearInterval(watchdogRef.current)
          retryTimer.current = setTimeout(attachHls, 1000)
        }
        lastTime.current = ct
      }, 5000)
    }

    function attachHls() {
      const video = videoRef.current; if (!video) return
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      const bustUrl = `${cam.hls_url}?t=${Date.now()}`
      if (window.Hls?.isSupported()) {
        const hls = new window.Hls({ lowLatencyMode: true, enableWorker: true, backBufferLength: 0, maxBufferLength: 10 })
        hls.loadSource(bustUrl); hls.attachMedia(video); hlsRef.current = hls
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); startWatchdog() })
        hls.on(window.Hls.Events.ERROR, (_, d) => {
          if (d.fatal) { clearInterval(watchdogRef.current); retryTimer.current = setTimeout(attachHls, 4000) }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = bustUrl; video.play().catch(() => {}); startWatchdog()
      }
    }

    function attach() {
      if (typeof window.Hls === 'undefined') {
        if (!document.querySelector('script[data-hls]')) {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js'
          s.setAttribute('data-hls', '1'); s.onload = attachHls
          document.head.appendChild(s)
        } else retryTimer.current = setTimeout(attach, 500)
      } else attachHls()
    }

    const video = videoRef.current
    const onStall = () => { clearInterval(watchdogRef.current); retryTimer.current = setTimeout(attachHls, 3000) }
    video?.addEventListener('stalled', onStall); video?.addEventListener('error', onStall)
    attach()

    return () => {
      clearInterval(watchdogRef.current); clearTimeout(retryTimer.current)
      video?.removeEventListener('stalled', onStall); video?.removeEventListener('error', onStall)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [cam.hls_url])

  return <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}>

  </video>
}

// ── Zoom modal (click camera to open) ────────────────────────────────────────
function ZoomModal({ cam, onClose }) {
  const [zoom, setZoom]       = useState(1)
  const [pan, setPan]         = useState({ x: 0, y: 0 })
  const isPanning             = useRef(false)
  const panStart              = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const adjustZoom = (delta) => setZoom(p => {
    const n = Math.max(1, Math.min(4, +(p + delta).toFixed(2)))
    if (n === 1) setPan({ x: 0, y: 0 })
    return n
  })

  const onMouseDown = e => {
    if (zoom <= 1) return
    isPanning.current = true
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }
  const onMouseMove = e => {
    if (!isPanning.current) return
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y })
  }
  const onMouseUp = () => { isPanning.current = false }

  return (
    <div className="cam-modal-backdrop" onClick={onClose}>
      <div className="cam-modal-inner" onClick={e => e.stopPropagation()}>

        {/* topbar */}
        <div className="cam-modal-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace', letterSpacing: '0.07em' }}>{cam.id}</span>
            <span className={`cam-status-pill ${cam.ready ? 'live' : 'offline'}`}>{cam.ready ? '● LIVE' : '○ WAIT'}</span>
          </div>

          {/* zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[1, 2, 3, 4].map(level => (
              <button key={level} className="cam-modal-zoom-btn"
                style={{ background: zoom === level ? 'rgba(59,130,246,0.5)' : undefined, color: zoom === level ? '#fff' : undefined }}
                onClick={() => { setZoom(level); setPan({ x: 0, y: 0 }) }}>
                {level}×
              </button>
            ))}
            <button className="cam-modal-zoom-btn" onClick={() => adjustZoom(-0.25)}>－</button>
            <span style={{ fontSize: 12, color: '#93c5fd', fontFamily: 'monospace', minWidth: 36, textAlign: 'center' }}>{zoom.toFixed(1)}×</span>
            <button className="cam-modal-zoom-btn" onClick={() => adjustZoom(+0.25)}>＋</button>
            <button className="cam-modal-close" onClick={onClose} title="Close (Esc)">✕</button>
          </div>
        </div>

        {/* video with zoom + pan */}
        <div
          style={{ width: '100%', height: '100%', overflow: 'hidden', cursor: zoom > 1 ? 'grab' : 'default' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        >
          <div style={{
            width: '100%', height: '100%',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: 'center center',
            transition: isPanning.current ? 'none' : 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            <CamVideo cam={cam} />
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
import { useState } from 'react'

export default function CameraGrid({ cameras = [] }) {
  injectCSS()
  const [zoomedCam, setZoomedCam] = useState(null)

  const slots = cameras.length > 0
    ? cameras.slice(0, 4)
    : [
        { id: 'CAM-A01', hls_url: '/hls/CAM-A01/stream.m3u8', ready: false },
        { id: 'CAM-A02', hls_url: '/hls/CAM-A02/stream.m3u8', ready: false },
        { id: 'CAM-A03', hls_url: '/hls/CAM-A03/stream.m3u8', ready: false },
        { id: 'CAM-A07', hls_url: '/hls/CAM-A07/stream.m3u8', ready: false },
      ]

  return (
    <>
      <div style={{ display: 'flex', gap: 6, width: '100%', height: 200 }}>
        {slots.map(cam => (
          <div
            key={cam.id}
            className="cam-cell"
            style={{ flex: '1 1 0%' }}
            onClick={() => setZoomedCam(cam)}
          >
            <CamVideo cam={cam} />
            <div className="cam-overlay-top">
              <span className="cam-id-badge">{cam.id}</span>
              <span className={`cam-status-pill ${cam.ready ? 'live' : 'offline'}`}>
                {cam.ready ? '● REC' : '○ WAIT'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {zoomedCam && <ZoomModal cam={zoomedCam} onClose={() => setZoomedCam(null)} />}
    </>
  )
}
