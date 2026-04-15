import { useState, useEffect, useRef } from 'react'

/* ============================================================
   4 real cameras mapped as zones
   ============================================================ */
const CAMERA_ZONES = [
  {
    id:      'CAM-A01',
    port:    16389,
    name:    'PIER CAP 16389',
    label:   'CAM-A01',
    type:    'safe',
    style:   { left: '5%',  top: '8%',  width: '28%', height: '40%' },
    dots: [
      { type: 'active',    pos: { left: '10%', top: '22%' } },
      { type: 'active',    pos: { left: '16%', top: '30%' } },
      { type: 'idle',      pos: { left: '22%', top: '18%' } },
      { type: 'active',    pos: { left: '13%', top: '38%' } },
    ],
  },
  {
    id:      'CAM-A02',
    port:    16388,
    name:    'PIER CAP 16388',
    label:   'CAM-A02',
    type:    'hazard',
    style:   { left: '36%', top: '5%',  width: '28%', height: '44%' },
    dots: [
      { type: 'active',    pos: { left: '40%', top: '20%' } },
      { type: 'active',    pos: { left: '47%', top: '28%' } },
      { type: 'violation', pos: { left: '54%', top: '22%' } },
    ],
  },
  {
    id:      'CAM-A03',
    port:    16387,
    name:    'PIER CAP 16387',
    label:   'CAM-A03',
    type:    'warning',
    style:   { left: '5%',  top: '55%', width: '38%', height: '38%' },
    dots: [
      { type: 'active',    pos: { left: '10%', top: '65%' } },
      { type: 'violation', pos: { left: '18%', top: '72%' } },
      { type: 'idle',      pos: { left: '26%', top: '68%' } },
      { type: 'active',    pos: { left: '14%', top: '80%' } },
    ],
  },
  {
    id:      'CAM-A07',
    port:    16386,
    name:    'PIER CAP 16386',
    label:   'CAM-A07',
    type:    'safe',
    style:   { left: '46%', top: '55%', width: '36%', height: '38%' },
    dots: [
      { type: 'active',    pos: { left: '52%', top: '62%' } },
      { type: 'active',    pos: { left: '60%', top: '70%' } },
      { type: 'idle',      pos: { left: '68%', top: '65%' } },
    ],
  },
]

const TYPE_COLOR = {
  safe:       'var(--green-safe)',
  hazard:     'var(--blue-vivid)',
  warning:    'var(--amber)',
  restricted: 'var(--red-alert)',
}
const TYPE_LABEL = {
  safe: 'SAFE', hazard: 'HAZARD', warning: 'WARNING', restricted: 'RESTRICTED',
}
const CHIP_CLASS = {
  safe: 'green', hazard: 'blue', warning: 'amber', restricted: 'red',
}

/* ============================================================
   AnimatedDot
   ============================================================ */
function AnimatedDot({ type, pos }) {
  const dotRef = useRef(null)
  const anim   = useRef(null)

  useEffect(() => {
    if (type === 'violation') return
    const el = dotRef.current
    if (!el) return
    const jitter = () => {
      const dx = (Math.random() - 0.5) * 0.8
      const dy = (Math.random() - 0.5) * 0.8
      el.style.transform = `translate(${dx}px, ${dy}px)`
      anim.current = setTimeout(jitter, 1800 + Math.random() * 1200)
    }
    anim.current = setTimeout(jitter, Math.random() * 2000)
    return () => clearTimeout(anim.current)
  }, [type])

  return (
    <div
      ref={dotRef}
      className={`map-worker-dot ${type}`}
      style={{ ...pos, transition: 'transform 1.5s ease' }}
    />
  )
}

/* ============================================================
   ZoneMap
   ============================================================ */
export default function ZoneMap() {
  const [selectedZone,  setSelectedZone]  = useState(null)
  const [cameras,       setCameras]       = useState([])
  const [violations,    setViolations]    = useState([])
  const [selectedDate,  setSelectedDate]  = useState(new Date().toISOString().split('T')[0])

  // poll cameras every 5s for live/offline status
  useEffect(() => {
    const load = () =>
      fetch('/api/cameras').then(r => r.json()).then(setCameras).catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  // violations by camera for selected date
  useEffect(() => {
    fetch(`/api/violations-by-camera?date=${selectedDate}`)
      .then(r => r.json())
      .then(setViolations)
      .catch(() => setViolations([]))
  }, [selectedDate])

  const violByCamera = Object.fromEntries(
    violations.map(v => [v.camera, v.count])
  )

  // live counts from camera status
  const camStatus = Object.fromEntries(
    cameras.map(c => [c.id, c.ready])
  )

  const liveCount  = cameras.filter(c => c.ready).length
  const totalViol  = violations.reduce((s, v) => s + v.count, 0)

  return (
    <div className="grid-70-30">

      {/* ── Left: Zone Map ────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🗺️ Zone Map — Prestige Tower · Pier Cap Cameras</div>
          <div className="panel-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-mono)',
              color: liveCount > 0 ? 'var(--green-safe)' : 'var(--amber)',
            }}>
              {liveCount > 0 ? '●' : '○'} {liveCount}/4 LIVE
            </span>
            <input
              type="date"
              className="date-picker"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ fontSize: 11, padding: '3px 6px' }}
            />
          </div>
        </div>

        <div className="panel-body">
          <div className="zone-map" style={{ position: 'relative' }}>
            <div className="zone-grid-lines" />

            {/* Zones */}
            {CAMERA_ZONES.map(zone => {
              const isLive   = camStatus[zone.id]
              const vCount   = violByCamera[zone.id]
                            || violByCamera[`Pier_Cap_Cam_${zone.port}`]
                            || 0
              const isSelected = selectedZone?.id === zone.id

              // override type based on live violations
              const effectiveType = vCount > 0 ? 'warning' : zone.type

              return (
                <div
                  key={zone.id}
                  className={`map-zone ${effectiveType}`}
                  style={{
                    ...zone.style,
                    cursor: 'pointer',
                    outline: isSelected ? '2px solid var(--blue-vivid)' : undefined,
                    outlineOffset: isSelected ? 2 : undefined,
                  }}
                  onClick={() => setSelectedZone(isSelected ? null : { ...zone, vCount, isLive })}
                >
                  {/* live indicator dot top-right */}
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 7, height: 7, borderRadius: '50%',
                    background: isLive ? 'var(--green-safe)' : 'var(--amber)',
                    boxShadow: isLive ? '0 0 6px var(--green-safe)' : 'none',
                  }} />

                  <div className="zone-type-badge">
                    {vCount > 0 ? `⚠ ${vCount} VIOLATION${vCount > 1 ? 'S' : ''}` : TYPE_LABEL[effectiveType]}
                  </div>
                  <div className="zone-count">{zone.label}</div>
                  <div className="zone-name">{zone.name}</div>
                </div>
              )
            })}

            {/* Worker dots */}
            {CAMERA_ZONES.flatMap((zone, zi) =>
              zone.dots.map((dot, i) => (
                <AnimatedDot key={`${zone.id}-${i}`} type={dot.type} pos={dot.pos} />
              ))
            )}

            {/* Legend */}
            <div className="map-legend">
              <div className="map-legend-item">
                <div className="map-legend-dot" style={{ background: 'var(--green-safe)' }} /> Live
              </div>
              <div className="map-legend-item">
                <div className="map-legend-dot" style={{ background: 'var(--amber)' }} /> Starting
              </div>
              <div className="map-legend-item">
                <div className="map-legend-dot" style={{ background: 'var(--red-alert)' }} /> Violation
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Zone Summary + Stats ───────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Zone Summary */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Zone Summary</div>
            <div className="panel-subtitle">{selectedDate}</div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {CAMERA_ZONES.map((zone, i) => {
              const isLive    = camStatus[zone.id]
              const vCount    = violByCamera[zone.id]
                             || violByCamera[`Pier_Cap_Cam_${zone.port}`]
                             || 0
              const isLast    = i === CAMERA_ZONES.length - 1
              const isActive  = selectedZone?.id === zone.id

              const subText = vCount > 0
                ? `⚠ ${vCount} violation${vCount > 1 ? 's' : ''} · ${selectedDate}`
                : isLive
                  ? 'Live · No violations'
                  : 'Stream starting…'
              const subColor = vCount > 0
                ? 'var(--red-alert)'
                : isLive
                  ? 'var(--green-safe)'
                  : 'var(--amber)'

              return (
                <div
                  key={zone.id}
                  onClick={() => setSelectedZone(isActive ? null : { ...zone, vCount, isLive })}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer',
                    background:   isActive ? 'var(--bg-hover)' : 'transparent',
                    borderRadius: isActive ? 6 : 0,
                    paddingLeft:  isActive ? 8 : 0,
                    paddingRight: isActive ? 8 : 0,
                    transition: 'background 0.2s',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {zone.id} · {zone.name}
                    </div>
                    <div className="text-xs" style={{ color: subColor }}>{subText}</div>
                  </div>
                  <span className={`chip ${vCount > 0 ? 'amber' : CHIP_CLASS[zone.type]}`}>
                    {vCount > 0 ? 'WARNING' : TYPE_LABEL[zone.type]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Headcount / Stats */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Camera Status</div>
          </div>
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 52,
              fontWeight: 800, color: 'var(--blue-vivid)', lineHeight: 1,
            }}>
              {liveCount}
            </div>
            <div className="text-xs text-muted" style={{ margin: '6px 0 14px' }}>
              cameras live of 4
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-safe)' }}>{liveCount}</div>
                <div className="text-xs text-muted">Live</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber)' }}>{4 - liveCount}</div>
                <div className="text-xs text-muted">Starting</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red-alert)' }}>{totalViol}</div>
                <div className="text-xs text-muted">Violations</div>
              </div>
            </div>
          </div>
        </div>

        {/* Zone drill-down on click */}
        {selectedZone && (
          <div className="panel" style={{ border: '1px solid var(--blue-vivid)', borderRadius: 8 }}>
            <div className="panel-header">
              <div className="panel-title" style={{ color: 'var(--blue-vivid)' }}>
                🔍 {selectedZone.id}
              </div>
              <button
                className="topbar-btn"
                onClick={() => setSelectedZone(null)}
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                ✕
              </button>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Camera</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {selectedZone.id}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Zone</span>
                <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{selectedZone.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Type</span>
                <span className={`chip ${CHIP_CLASS[selectedZone.type]}`}>
                  {TYPE_LABEL[selectedZone.type]}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Stream</span>
                <span style={{ fontSize: 12, color: selectedZone.isLive ? 'var(--green-safe)' : 'var(--amber)' }}>
                  {selectedZone.isLive ? '● LIVE' : '○ Starting'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Violations ({selectedDate})</span>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: selectedZone.vCount > 0 ? 'var(--red-alert)' : 'var(--green-safe)',
                }}>
                  {selectedZone.vCount}
                </span>
              </div>
              <button
                className="topbar-btn"
                style={{ marginTop: 4, fontSize: 11, width: '100%' }}
                onClick={() => fetch(`/api/cameras/${selectedZone.id}/restart`).catch(() => {})}
              >
                ↺ Restart Stream
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
