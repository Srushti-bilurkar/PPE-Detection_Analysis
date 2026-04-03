import { useState, useEffect, useRef } from 'react'

/* ============================================================
   STATIC ZONE + WORKER DATA
   Matches index.html floor-4 layout exactly.
   In production, replace with /api/zones?floor=X
   ============================================================ */
const FLOORS = ['Floor 1', 'Floor 4', 'Floor 8']

const FLOOR_DATA = {
  'Floor 1': {
    zones: [
      { id: 'z1', type: 'safe',       label: 'SAFE',       count: 8,  name: 'GROUND FLOOR',  style: { left:'5%',  top:'10%', width:'30%', height:'38%' }, summary: { title:'Ground Floor',   sub:'8 workers · All compliant',        color: '' } },
      { id: 'z2', type: 'warning',    label: 'WARNING',    count: 3,  name: 'LOADING BAY',   style: { left:'38%', top:'5%',  width:'24%', height:'45%' }, summary: { title:'Loading Bay',    sub:'⚠ 1 PPE violation active',         color: 'var(--amber)' } },
      { id: 'z3', type: 'safe',       label: 'SAFE',       count: 5,  name: 'STAGING AREA',  style: { left:'65%', top:'8%',  width:'20%', height:'40%' }, summary: { title:'Staging Area',   sub:'5 workers · All compliant',        color: '' } },
      { id: 'z4', type: 'safe',       label: 'SAFE',       count: 4,  name: 'MATERIAL STORE',style: { left:'5%',  top:'55%', width:'35%', height:'38%' }, summary: { title:'Material Store', sub:'4 workers · All compliant',        color: '' } },
      { id: 'z5', type: 'restricted', label: 'RESTRICTED', count: 0,  name: 'ELEC ROOM',     style: { left:'43%', top:'55%', width:'38%', height:'38%' }, summary: { title:'Elec Room',      sub:'0 workers · Auth only',            color: 'var(--red-alert)' } },
    ],
    dots: [
      { type:'active',    pos:{ left:'12%', top:'28%' } }, { type:'active',    pos:{ left:'18%', top:'35%' } },
      { type:'idle',      pos:{ left:'22%', top:'22%' } }, { type:'active',    pos:{ left:'14%', top:'40%' } },
      { type:'active',    pos:{ left:'44%', top:'22%' } }, { type:'idle',      pos:{ left:'50%', top:'30%' } },
      { type:'active',    pos:{ left:'55%', top:'62%' } }, { type:'active',    pos:{ left:'62%', top:'68%' } },
    ],
    headcount: { total: 20, active: 15, idle: 4, violation: 1 },
  },
  'Floor 4': {
    zones: [
      { id: 'z1', type: 'safe',       label: 'SAFE',       count: 12, name: 'FRAMING ZONE',  style: { left:'5%',  top:'10%', width:'28%', height:'38%' }, summary: { title:'Framing Zone',   sub:'12 workers · All compliant',       color: '' } },
      { id: 'z2', type: 'hazard',     label: 'HAZARD',     count: 7,  name: 'MEP SHAFT',     style: { left:'36%', top:'5%',  width:'22%', height:'45%' }, summary: { title:'MEP Shaft',      sub:'7 workers · Full PPE required',    color: '' } },
      { id: 'z3', type: 'restricted', label: 'RESTRICTED', count: 0,  name: 'ELEC SUB',      style: { left:'61%', top:'8%',  width:'18%', height:'40%' }, summary: { title:'Electrical Sub', sub:'0 workers · Auth only',            color: 'var(--red-alert)' } },
      { id: 'z4', type: 'warning',    label: 'WARNING',    count: 8,  name: 'WELDING BAY',   style: { left:'5%',  top:'55%', width:'35%', height:'38%' }, summary: { title:'Welding Bay',    sub:'⚠ 2 PPE violations active',        color: 'var(--amber)' } },
      { id: 'z5', type: 'safe',       label: 'SAFE',       count: 6,  name: 'CONCRETE POUR', style: { left:'43%', top:'55%', width:'38%', height:'38%' }, summary: { title:'Concrete Pour',  sub:'6 workers · All compliant',        color: '' } },
    ],
    dots: [
      { type:'active',    pos:{ left:'12%', top:'28%' } }, { type:'active',    pos:{ left:'18%', top:'35%' } },
      { type:'idle',      pos:{ left:'22%', top:'22%' } }, { type:'active',    pos:{ left:'14%', top:'40%' } },
      { type:'active',    pos:{ left:'40%', top:'22%' } }, { type:'active',    pos:{ left:'47%', top:'30%' } },
      { type:'active',    pos:{ left:'44%', top:'38%' } }, { type:'violation', pos:{ left:'15%', top:'65%' } },
      { type:'idle',      pos:{ left:'24%', top:'72%' } }, { type:'active',    pos:{ left:'55%', top:'62%' } },
      { type:'active',    pos:{ left:'62%', top:'68%' } },
    ],
    headcount: { total: 33, active: 24, idle: 7, violation: 2 },
  },
  'Floor 8': {
    zones: [
      { id: 'z1', type: 'safe',       label: 'SAFE',       count: 6,  name: 'STEEL FRAME A', style: { left:'5%',  top:'10%', width:'30%', height:'38%' }, summary: { title:'Steel Frame A',  sub:'6 workers · All compliant',        color: '' } },
      { id: 'z2', type: 'warning',    label: 'WARNING',    count: 4,  name: 'STEEL FRAME B', style: { left:'38%', top:'5%',  width:'24%', height:'45%' }, summary: { title:'Steel Frame B',  sub:'⚠ 1 PPE violation active',         color: 'var(--amber)' } },
      { id: 'z3', type: 'hazard',     label: 'HAZARD',     count: 3,  name: 'CRANE ZONE',    style: { left:'65%', top:'8%',  width:'20%', height:'40%' }, summary: { title:'Crane Zone',     sub:'3 workers · Crane ops in progress', color: '' } },
      { id: 'z4', type: 'restricted', label: 'RESTRICTED', count: 0,  name: 'EDGE ACCESS',   style: { left:'5%',  top:'55%', width:'35%', height:'38%' }, summary: { title:'Edge Access',    sub:'0 workers · Harness required',     color: 'var(--red-alert)' } },
      { id: 'z5', type: 'safe',       label: 'SAFE',       count: 5,  name: 'SLAB POUR',     style: { left:'43%', top:'55%', width:'38%', height:'38%' }, summary: { title:'Slab Pour',      sub:'5 workers · All compliant',        color: '' } },
    ],
    dots: [
      { type:'active',    pos:{ left:'10%', top:'25%' } }, { type:'active',    pos:{ left:'16%', top:'33%' } },
      { type:'idle',      pos:{ left:'20%', top:'20%' } }, { type:'violation', pos:{ left:'44%', top:'22%' } },
      { type:'active',    pos:{ left:'48%', top:'30%' } }, { type:'active',    pos:{ left:'68%', top:'20%' } },
      { type:'active',    pos:{ left:'50%', top:'62%' } }, { type:'idle',      pos:{ left:'58%', top:'70%' } },
    ],
    headcount: { total: 18, active: 13, idle: 4, violation: 1 },
  },
}

/* chip colour map */
const CHIP_CLASS = { safe: 'green', hazard: 'blue', restricted: 'red', warning: 'amber' }

/* ============================================================
   AnimatedDot — wiggles slightly to simulate live movement
   ============================================================ */
function AnimatedDot({ type, pos }) {
  const dotRef = useRef(null)
  const anim   = useRef(null)

  useEffect(() => {
    if (type === 'violation') return  // violation uses CSS pulse, no JS jitter
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
  const [activeFloor,   setActiveFloor]   = useState('Floor 4')
  const [selectedZone,  setSelectedZone]  = useState(null)
  const [editMode,      setEditMode]      = useState(false)

  const floorData = FLOOR_DATA[activeFloor]

  // Simulate live worker count drift every 5s
  const [liveCounts, setLiveCounts] = useState(() =>
    Object.fromEntries(floorData.zones.map(z => [z.id, z.count]))
  )

  useEffect(() => {
    setLiveCounts(Object.fromEntries(floorData.zones.map(z => [z.id, z.count])))
    setSelectedZone(null)
  }, [activeFloor])

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveCounts(prev => {
        const next = { ...prev }
        floorData.zones.forEach(z => {
          const drift = Math.floor(Math.random() * 3) - 1  // -1, 0, +1
          next[z.id] = Math.max(0, (prev[z.id] ?? z.count) + drift)
        })
        return next
      })
    }, 5000)
    return () => clearInterval(timer)
  }, [floorData])

  const totalWorkers  = floorData.headcount.total
  const activeWorkers = floorData.headcount.active
  const idleWorkers   = floorData.headcount.idle
  const violWorkers   = floorData.headcount.violation

  return (
    <div className="grid-70-30">

      {/* ── Left: Map panel ───────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🗺️ Zone Map — Tower A · {activeFloor}</div>
          <div className="panel-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {FLOORS.map(f => (
              <button
                key={f}
                className="topbar-btn"
                onClick={() => setActiveFloor(f)}
                style={{
                  padding: '4px 8px', fontSize: 11,
                  background: activeFloor === f ? 'var(--blue-vivid)' : undefined,
                  color:      activeFloor === f ? '#fff'              : undefined,
                  borderColor:activeFloor === f ? 'var(--blue-vivid)' : undefined,
                }}
              >
                {f}
              </button>
            ))}
            <button
              className={`topbar-btn${editMode ? ' primary' : ''}`}
              onClick={() => setEditMode(e => !e)}
              style={{ padding: '4px 10px', fontSize: 11 }}
            >
              ✏️ {editMode ? 'Done' : 'Edit Zones'}
            </button>
          </div>
        </div>

        <div className="panel-body">
          <div className="zone-map" style={{ position: 'relative' }}>
            <div className="zone-grid-lines" />

            {/* Zones */}
            {floorData.zones.map(zone => (
              <div
                key={zone.id}
                className={`map-zone ${zone.type}`}
                style={{
                  ...zone.style,
                  cursor: 'pointer',
                  outline: selectedZone?.id === zone.id ? '2px solid var(--blue-vivid)' : undefined,
                  outlineOffset: selectedZone?.id === zone.id ? 2 : undefined,
                }}
                onClick={() => setSelectedZone(selectedZone?.id === zone.id ? null : zone)}
              >
                <div className="zone-type-badge">{zone.label}</div>
                <div className="zone-count">{liveCounts[zone.id] ?? zone.count}</div>
                <div className="zone-name">{zone.name}</div>
              </div>
            ))}

            {/* Worker dots */}
            {floorData.dots.map((dot, i) => (
              <AnimatedDot key={`${activeFloor}-${i}`} type={dot.type} pos={dot.pos} />
            ))}

            {/* Legend */}
            <div className="map-legend">
              <div className="map-legend-item">
                <div className="map-legend-dot" style={{ background: 'var(--green-safe)' }} />
                Active
              </div>
              <div className="map-legend-item">
                <div className="map-legend-dot" style={{ background: 'var(--amber)' }} />
                Idle
              </div>
              <div className="map-legend-item">
                <div className="map-legend-dot" style={{ background: 'var(--red-alert)' }} />
                Violation
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Zone Summary + Headcount ───────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Zone Summary panel */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Zone Summary</div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {floorData.zones.map((zone, i) => {
              const s        = zone.summary
              const isLast   = i === floorData.zones.length - 1
              const isActive = selectedZone?.id === zone.id
              return (
                <div
                  key={zone.id}
                  onClick={() => setSelectedZone(isActive ? null : zone)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer',
                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                    borderRadius: isActive ? 6 : 0,
                    paddingLeft: isActive ? 8 : 0,
                    paddingRight: isActive ? 8 : 0,
                    transition: 'background 0.2s',
                  }}
                >
                  <div>
                    <div style={{
                      fontSize: 12, fontWeight: 600,
                      color: s.color || 'var(--text-primary)',
                    }}>
                      {s.title}
                    </div>
                    <div className="text-xs text-muted" style={{
                      color: s.sub.startsWith('⚠') ? 'var(--red-alert)' : undefined,
                    }}>
                      {s.sub}
                    </div>
                  </div>
                  <span className={`chip ${CHIP_CLASS[zone.type]}`}>
                    {zone.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Headcount panel */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Headcount</div>
          </div>
          <div className="panel-body" style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 52,
              fontWeight: 800, color: 'var(--blue-vivid)', lineHeight: 1,
            }}>
              {totalWorkers}
            </div>
            <div className="text-xs text-muted" style={{ margin: '6px 0 14px' }}>
              workers on {activeFloor}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-safe)' }}>{activeWorkers}</div>
                <div className="text-xs text-muted">Active</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--amber)' }}>{idleWorkers}</div>
                <div className="text-xs text-muted">Idle</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red-alert)' }}>{violWorkers}</div>
                <div className="text-xs text-muted">Violation</div>
              </div>
            </div>
          </div>
        </div>

        {/* Zone drill-down — shows when a zone is clicked */}
        {selectedZone && (
          <div className="panel" style={{ border: '1px solid var(--blue-vivid)', borderRadius: 8 }}>
            <div className="panel-header">
              <div className="panel-title" style={{ color: 'var(--blue-vivid)' }}>
                🔍 {selectedZone.summary.title}
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
                <span className="text-xs text-muted">Zone type</span>
                <span className={`chip ${CHIP_CLASS[selectedZone.type]}`}>{selectedZone.label}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Workers</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {liveCounts[selectedZone.id] ?? selectedZone.count}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Status</span>
                <span style={{ fontSize: 12, color: selectedZone.summary.color || 'var(--green-safe)' }}>
                  {selectedZone.summary.sub}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-xs text-muted">Camera</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {selectedZone.type === 'restricted' ? 'CAM-B09' : `CAM-A0${floorData.zones.indexOf(selectedZone) + 1}`}
                </span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
