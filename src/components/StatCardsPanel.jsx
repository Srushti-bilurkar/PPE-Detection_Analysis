import { useState, useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// ─── Chart Modal ──────────────────────────────────────────────────────────────
function CardChartModal({ card, data, onClose }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)
  const { trendData, displaySafe, displayViolated, displayCompliance, compliance } = data

  useEffect(() => {
    if (!chartRef.current || !trendData || trendData.length === 0) return
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    const ctx = chartRef.current.getContext('2d')
    const labels = trendData.map(d => d.hour)
    let datasets = [], yLabel = ''

    if (card.id === 'workers') {
      yLabel = 'Safe workers'
      datasets = [{ label: 'Safe Workers', data: trendData.map(d => Math.max(0,(d.workers_active||0)-(d.violations||0))), borderColor:'#22c984', backgroundColor:'rgba(34,201,132,0.12)', fill:true, tension:0.4, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#22c984', borderWidth:2.5 }]
    } else if (card.id === 'violations') {
      yLabel = 'Violations'
      datasets = [{ label:'Violations', data:trendData.map(d=>d.violations||0), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.10)', fill:true, tension:0.4, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#ef4444', borderWidth:2.5, borderDash:[5,3] }]
    } else if (card.id === 'compliance') {
      yLabel = 'Compliance %'
      datasets = [{ label:'PPE Compliance %', data:trendData.map(d=>{ const s=Math.max(0,(d.workers_active||0)-(d.violations||0)); const t=d.workers_active||0; return t>0?Math.round((s/t)*100):0 }), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.10)', fill:true, tension:0.4, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#f59e0b', borderWidth:2.5 }]
    } else if (card.id === 'ppe_violations') {
      yLabel = 'PPE Violation %'
      datasets = [{ label:'PPE Violations %', data:trendData.map(d=>{ const s=Math.max(0,(d.workers_active||0)-(d.violations||0)); const t=d.workers_active||0; return t>0?Math.round(((t-s)/t)*100):0 }), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.10)', fill:true, tension:0.4, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#ef4444', borderWidth:2.5 }]
    }

    chartInst.current = new Chart(ctx, {
      type:'line', data:{ labels, datasets },
      options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
        plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ title: items => { if(!items.length) return ''; const h=parseInt(items[0].label.split(':')[0]); return `${String(h).padStart(2,'0')}:00 – ${String(h+1).padStart(2,'0')}:00` } } } },
        scales:{
          x:{ ticks:{ color:'#5a6a82', font:{ size:11 }, callback:(_, i)=>parseInt(labels[i]?.split(':')[0]) }, grid:{ color:'rgba(255,255,255,0.04)' }, title:{ display:true, text:'Hour', color:'#5a6a82', font:{ size:11 } } },
          y:{ beginAtZero:true, ticks:{ color:'#a0aec0', font:{ size:11 }, callback:v=>Number.isInteger(v)?v:null }, grid:{ color:'rgba(255,255,255,0.04)' }, title:{ display:true, text:yLabel, color:'#5a6a82', font:{ size:11 } } }
        }
      }
    })
    return () => { if(chartInst.current){ chartInst.current.destroy(); chartInst.current=null } }
  }, [card, trendData])

  const peakStats = () => {
    if (!trendData || trendData.length === 0) return null
    if (card.id === 'workers') {
      const vals = trendData.map(d=>Math.max(0,(d.workers_active||0)-(d.violations||0)))
      const peak = Math.max(...vals); const peakH = trendData[vals.indexOf(peak)]?.hour||'--'; const total = vals.reduce((a,b)=>a+b,0)
      return [{ label:'👷 Peak Safe Workers', val:peak, sub:`@ ${peakH}`, color:'#22c984' },{ label:'Total Safe (day)', val:total, color:'#22c984' },{ label:'✗ Total Violated', val:displayViolated, color:'#ef4444' }]
    }
    if (card.id === 'violations') {
      const vals = trendData.map(d=>d.violations||0)
      const peak = Math.max(...vals); const peakH = trendData[vals.indexOf(peak)]?.hour||'--'; const total = vals.reduce((a,b)=>a+b,0)
      return [{ label:'🚨 Peak Violations', val:peak, sub:`@ ${peakH}`, color:'#ef4444' },{ label:'Total Violations', val:total, color:'#ef4444' },{ label:'✓ Total Safe', val:displaySafe, color:'#22c984' }]
    }
    if (card.id === 'compliance') return [{ label:'🦺 Helmet Compliance', val:`${compliance?.helmet??0}%`, color:'#4ade80' },{ label:'🦺 Vest Compliance', val:`${compliance?.vest??0}%`, color:'#4ade80' },{ label:'Overall Compliance', val:displayCompliance!==null?`${displayCompliance}%`:'—', color:'#f59e0b' }]
    if (card.id === 'ppe_violations') return [{ label:'⚠️ No Helmet', val:`${Math.round(100-(compliance?.helmet||0))}%`, color:'#ef4444' },{ label:'⚠️ No Vest', val:`${Math.round(100-(compliance?.vest||0))}%`, color:'#f59e0b' },{ label:'Overall PPE Violations', val:displayCompliance!==null?`${100-displayCompliance}%`:'—', color:'#ef4444' }]
    return []
  }
  const stats = peakStats()

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(2px)', zIndex:900 }} />
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(820px,92vw)', background:'#0c1220', border:`1px solid ${card.colorKey}44`, borderTop:`3px solid ${card.colorKey}`, borderRadius:14, zIndex:950, boxShadow:'0 24px 64px rgba(0,0,0,0.6)', animation:'scFadeInUp 0.2s ease', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)', background:'rgba(0,0,0,0.2)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>{card.icon}</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'#e2e8f0' }}>{card.label}</div>
              <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>Hourly trend · Today</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#94a3b8', cursor:'pointer', padding:'4px 12px', fontSize:18, lineHeight:1.2 }}>×</button>
        </div>
        {stats && (
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            {stats.map((s,i) => (
              <div key={i} style={{ flex:1, padding:'12px 20px', borderRight:i<stats.length-1?'1px solid rgba(255,255,255,0.06)':'none' }}>
                <div style={{ fontSize:10, color:'#64748b', marginBottom:4 }}>{s.label}</div>
                <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                  <span style={{ fontSize:26, fontWeight:700, color:s.color, lineHeight:1 }}>{s.val}</span>
                  {s.sub && <span style={{ fontSize:11, color:'#64748b' }}>{s.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding:'16px 20px 20px' }}>
          {trendData && trendData.length > 0
            ? <div style={{ position:'relative', height:240 }}><canvas ref={chartRef} style={{ width:'100%', height:'100%' }} /></div>
            : <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', fontSize:13 }}>No trend data available for this date</div>
          }
        </div>
      </div>
    </>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub, compact=false, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={{ position:'relative', background:hover?'#1e2d45':'#151f2e', border:`1px solid ${hover?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.07)'}`, borderTop:`3px solid ${color||'#5a6a82'}`, borderRadius:12, padding:compact?'12px 14px':'16px', cursor:'pointer', transition:'background 0.15s, border-color 0.15s, transform 0.12s', transform:hover?'translateY(-2px)':'none', minWidth:0 }}>
      <div style={{ position:'absolute', top:8, right:10, fontSize:9, color:hover?color:'#64748b', fontWeight:600, letterSpacing:'0.04em', transition:'color 0.15s' }}>📈 TAP</div>
      <div style={{ fontSize:compact?18:24, marginBottom:compact?6:12 }}>{icon}</div>
      <div style={{ fontSize:8, letterSpacing:'0.08em', color:'#cbd5e1', textTransform:'uppercase', fontWeight:700, marginBottom:compact?4:10 }}>{label}</div>
      <div style={{ fontSize:compact?32:52, fontWeight:700, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ marginTop:compact?6:12, fontSize:compact?10:13, color:'#94a3b8' }}>{typeof sub==='string'?sub:sub}</div>}
    </div>
  )
}

// ─── Alerts panel ─────────────────────────────────────────────────────────────
function AlertsPanel({ visibleAlerts=[], ackAlert, displayCompliance, selectedDate, trendData }) {
  const hasAlerts = visibleAlerts.length > 0
  const now = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  const HOURS = trendData&&trendData.length ? trendData.map(d=>{ const raw=d.hour?.slice(0,5)??''; const [hStr]=raw.split(':'); const h=parseInt(hStr,10); if(isNaN(h)) return raw; if(h===0) return '12a'; if(h<12) return `${h}a`; if(h===12) return '12p'; return `${h-12}p` }) : []
  const heatCounts = trendData&&trendData.length ? trendData.map(d=>d.violations??0) : []
  const maxCount = Math.max(...heatCounts,1)
  const peakIdx = heatCounts.indexOf(Math.max(...heatCounts))
  const getHeatColor = v => { if(v===0) return 'rgba(255,255,255,0.04)'; const r=v/maxCount; if(r<0.25) return 'rgba(239,68,68,0.20)'; if(r<0.50) return 'rgba(239,68,68,0.42)'; if(r<0.75) return 'rgba(239,68,68,0.65)'; return '#ef4444' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div style={{ flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:9, letterSpacing:'0.08em', color:'#94a3b8', textTransform:'uppercase', fontWeight:600 }}>🔔 Active Alerts</div>
          <div style={{ fontSize:9, color:'#94a3b8' }}>Last checked {now}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
          <div style={{ fontSize:44, fontWeight:700, color:hasAlerts?'#ef4444':'#22c984', lineHeight:1 }}>{visibleAlerts.length}</div>
          <div>
            <div style={{ display:'flex', alignItems:'center', fontSize:13, fontWeight:700, color:'#e2e8f0' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:hasAlerts?'#ef4444':'#22c984', display:'inline-block', marginRight:8, animation:hasAlerts?'scPulse 1.4s infinite':'none' }} />
              {hasAlerts?'unacknowledged':'All clear'}
            </div>
            <div style={{ fontSize:10, color:hasAlerts?'#ef4444':'#22c984', marginTop:3 }}>{hasAlerts?'⚠ Click any alert to acknowledge':'✓ No active alerts · site is safe'}</div>
          </div>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
        {hasAlerts && (
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {visibleAlerts.slice(0,10).map(a => (
              <div key={a._id} onClick={()=>ackAlert(a._id)} style={{ background:a.severity==='critical'?'#2a0f0f':'#2a1f0a', borderLeft:`3px solid ${a.severity==='critical'?'#e53e3e':'#f59e0b'}`, borderRadius:5, padding:'7px 10px', cursor:'pointer', transition:'opacity 0.2s' }}>
                <div style={{ fontSize:10, fontWeight:700, color:a.severity==='critical'?'#fca5a5':'#fcd34d', marginBottom:2 }}>{a.severity?.toUpperCase()} — {a.type?.replace('_',' ')}</div>
                <div style={{ fontSize:9, color:'#94a3b8' }}>📹 {a.camera} · Worker {a.worker_id} · {new Date(a.timestamp).toLocaleTimeString()}</div>
                <div style={{ fontSize:9, color:'#94a3b8', marginTop:2, fontStyle:'italic' }}>tap to acknowledge</div>
              </div>
            ))}
          </div>
        )}
        {!hasAlerts && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ background:'rgba(34,201,132,0.08)', border:'1px solid rgba(34,201,132,0.2)', borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ fontSize:20 }}>✅</div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#22c984' }}>Site is fully safe</div>
                <div style={{ fontSize:9, color:'#94a3b8', marginTop:1 }}>No PPE violations · All workers compliant · {selectedDate}</div>
              </div>
            </div>
            {HOURS.length > 0 && (
              <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, padding:'10px 12px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:9, letterSpacing:'0.08em', color:'#94a3b8', textTransform:'uppercase', fontWeight:600 }}>Hourly violation heatmap</div>
                  <div style={{ fontSize:9, color:'#ef4444' }}>Peak: {HOURS[peakIdx]} · {heatCounts[peakIdx]} violations</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:`repeat(${HOURS.length},1fr)`, gap:3, marginBottom:4 }}>
                  {HOURS.map(h=><div key={h} style={{ fontSize:8, color:'#94a3b8', textAlign:'center' }}>{h}</div>)}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:`repeat(${HOURS.length},1fr)`, gap:3 }}>
                  {heatCounts.map((v,i)=>(
                    <div key={i} title={`${HOURS[i]}: ${v} violation${v!==1?'s':''}`} style={{ height:26, borderRadius:4, background:getHeatColor(v), border:i===peakIdx?'1px solid rgba(239,68,68,0.7)':'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {v>0&&<span style={{ fontSize:8, fontWeight:700, color:v/maxCount>0.5?'#fff':'#ef4444' }}>{v}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:7 }}>
                  <span style={{ fontSize:8, color:'#94a3b8' }}>Low</span>
                  {['rgba(239,68,68,0.20)','rgba(239,68,68,0.42)','rgba(239,68,68,0.65)','#ef4444'].map((c,i)=><div key={i} style={{ width:14, height:7, borderRadius:2, background:c }} />)}
                  <span style={{ fontSize:8, color:'#94a3b8' }}>High</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CARDS CONFIG ─────────────────────────────────────────────────────────────
const CARDS = [
  { id:'workers',        icon:'👷', label:'Workers Safe On-Site', colorKey:'#22c984' },
  { id:'violations',     icon:'🚨', label:'Max Violations',       colorKey:'#ef4444' },
  { id:'compliance',     icon:'🦺', label:'PPE Compliance',       colorKey:'#f59e0b' },
  { id:'ppe_violations', icon:'⚠️', label:'PPE Violations',       colorKey:'#ef4444' },
]

// ─── Alerts Toggle Tab — proper sidebar-style arrow button ────────────────────
function AlertsToggleTab({ showAlertsPanel, alertCount, onToggleAlerts }) {
  const [hover, setHover] = useState(false)

  const hasAlerts = alertCount > 0
  const isOpen    = showAlertsPanel

  // Colors
  const accentColor = hasAlerts ? '#ef4444' : '#22c984'

  // Always show tinted background — stronger when open or hovered
  const bgColor = hasAlerts
    ? hover || isOpen
      ? 'rgba(239,68,68,0.28)'   // bright red tint on hover/open
      : 'rgba(239,68,68,0.18)'   // always red tinted (not black)
    : isOpen
      ? 'rgba(34,201,132,0.22)'  // bright green when open & clear
      : hover
        ? 'rgba(34,201,132,0.18)'
        : 'rgba(34,201,132,0.10)' // always subtle green tint

  const borderColor = hasAlerts
    ? isOpen ? 'rgba(239,68,68,0.8)' : hover ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.45)'
    : isOpen ? 'rgba(34,201,132,0.7)' : hover ? 'rgba(34,201,132,0.5)' : 'rgba(34,201,132,0.30)'

  return (
    <div
      onClick={onToggleAlerts}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={isOpen ? 'Close alerts panel' : `${alertCount} alert${alertCount !== 1 ? 's' : ''} — click to view`}
      style={{
        position:       'relative',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            8,
        // ── This is the key: tall pill shape, fixed width ──
        width:          36,
        alignSelf:      'stretch',
        marginLeft:     10,
        flexShrink:     0,
        background:     bgColor,
        border:         `1px solid ${borderColor}`,
        // Rounded only on the RIGHT side — like a tab attached to the left panel
        borderRadius:   '0 10px 10px 0',
        cursor:         'pointer',
        transition:     'background 0.2s, border-color 0.2s',
        animation:      (!isOpen && hasAlerts) ? 'scPulseRing 2s ease-out infinite' : 'none',
        overflow:       'visible',
      }}
    >
      {/* Alert count badge — floats top-right */}
      {hasAlerts && !isOpen && (
        <div style={{
          position:       'absolute',
          top:            -8,
          right:          -8,
          background:     '#ef4444',
          color:          '#fff',
          borderRadius:   99,
          fontSize:       10,
          fontWeight:     700,
          minWidth:       20,
          height:         20,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          border:         '2px solid #0c1220',
          padding:        '0 4px',
          zIndex:         10,
          animation:      'scBadgePop 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
          pointerEvents:  'none',
        }}>
          {alertCount}
        </div>
      )}

      {/* Status dot */}
      <div style={{
        width:        7,
        height:       7,
        borderRadius: '50%',
        background:   accentColor,
        flexShrink:   0,
        animation:    hasAlerts ? 'scPulse 1.4s infinite' : 'none',
        opacity:      isOpen || hover ? 1 : 0.6,
        transition:   'opacity 0.2s',
      }} />

      {/* Vertical label */}
      <span style={{
        fontSize:      10,
        fontWeight:    700,
        color:         isOpen || hover ? accentColor : '#64748b',
        writingMode:   'vertical-rl',
        transform:     'rotate(180deg)',
        letterSpacing: '0.07em',
        userSelect:    'none',
        transition:    'color 0.2s',
        lineHeight:    1.2,
      }}>
        {hasAlerts && !isOpen ? '🔔' : 'Alerts'}
      </span>

      {/* Arrow chevron — the main visual cue, flips on open */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isOpen || hover ? accentColor : '#64748b'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          flexShrink:  0,
          transition:  'transform 0.3s ease, stroke 0.2s',
          // Point RIGHT (open panel) or LEFT (close panel)
          transform:   isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
          animation:   (!isOpen && hasAlerts) ? 'scTabPulse 1.2s ease-in-out infinite' : 'none',
        }}
      >
        {/* Right-pointing chevron: > */}
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </div>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────
export default function StatCardsPanel({
  isLoading,
  onToggleAlerts,
  todaySafe, todayViols,
  displaySafe, displayViolated, displayTotal,
  displayCompliance,
  maxViolations, maxVHour,
  compliance,
  safeWorkers7day,
  shiftSafe, cameraSafe,
  trendData,
  visibleAlerts, ackAlert,
  selectedDate,
  showAlertsPanel,
}) {
  const [derivedSafe, setDerivedSafe] = useState(null)
  const [activeModal, setActiveModal] = useState(null)

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setActiveModal(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setDerivedSafe(null)
    fetch(`/api/hourly-trend?date=${selectedDate}&shift=both`)
      .then(r => r.ok ? r.json() : [])
      .then(arr => { const safe = Array.isArray(arr) ? arr.reduce((s,d) => s+(d.workers_active||0), 0) : 0; setDerivedSafe(safe) })
      .catch(() => setDerivedSafe(0))
  }, [selectedDate])

  const getCardValue = id => {
    if (isLoading) return '…'
    if (id === 'workers')        return derivedSafe ?? todaySafe
    if (id === 'violations')     return displayViolated
    if (id === 'compliance')     return displayCompliance !== null ? `${displayCompliance}%` : '—'
    if (id === 'ppe_violations') return displayCompliance !== null ? `${100-displayCompliance}%` : '—'
    return '—'
  }

  const alertCount    = visibleAlerts?.length ?? 0
  const activeCardObj = CARDS.find(c => c.id === activeModal)
  const modalData     = { trendData, displaySafe, displayViolated, displayCompliance, compliance }

  const bestShift        = shiftSafe ? Object.entries(shiftSafe).sort((a,b)=>b[1]-a[1])[0]?.[0]||'--' : '--'
  const yesterday        = safeWorkers7day?.slice(-2)?.[0]
  const today7           = safeWorkers7day?.slice(-1)?.[0]
  const trendVsYesterday = (yesterday && today7) ? today7.safe_count - yesterday.safe_count : null
  const violTrend        = (yesterday && today7) ? today7.violations - yesterday.violations  : null

  return (
    <>
      <style>{`
        @keyframes scPulse      { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes scFadeInUp   { from{opacity:0;transform:translate(-50%,-48%)} to{opacity:1;transform:translate(-50%,-50%)} }
        @keyframes scPulseRing  { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.6)} 70%{box-shadow:0 0 0 8px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
        @keyframes scBadgePop   { 0%{transform:scale(0.4)} 100%{transform:scale(1)} }
        @keyframes scTabPulse   { 0%,100%{transform:rotate(180deg) translateX(0)} 50%{transform:rotate(180deg) translateX(-3px)} }

        .sc-alerts-panel {
          overflow: hidden; width: 0; max-height: 0; opacity: 0; flex-shrink: 0;
          margin-left: 0;
          transition: width 0.38s cubic-bezier(0.4,0,0.2,1), max-height 0.38s ease, opacity 0.30s ease, margin-left 0.38s ease;
        }
        .sc-alerts-panel.open {
          width: 50%; max-height: 800px; opacity: 1; margin-left: 16px;
        }
      `}</style>

      {activeModal && activeCardObj && (
        <CardChartModal card={activeCardObj} data={modalData} onClose={() => setActiveModal(null)} />
      )}

      <div style={{ display:'flex', alignItems:'flex-start', marginBottom:16, width:'100%' }}>

        {/* LEFT — 4 stat cards */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'grid', gridTemplateColumns:showAlertsPanel?'repeat(2,1fr)':'repeat(4,1fr)', gap:16, transition:'grid-template-columns 0.35s ease' }}>
            {CARDS.map(c => (
              <StatCard
                key={c.id}
                icon={c.icon}
                label={c.label}
                value={getCardValue(c.id)}
                color={c.colorKey}
                compact={showAlertsPanel}
                onClick={() => setActiveModal(c.id)}
                sub={
                  c.id === 'workers' ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:4 }}>
                      <span>{selectedDate}</span>
                      <span style={{ color:'#64748b', fontSize:10 }}>Best shift: <span style={{ color:'#22c984', fontWeight:600 }}>{bestShift==='morning'?'🌅 Morning':bestShift==='afternoon'?'☀️ Day':'🌙 Night'}</span></span>
                      {trendVsYesterday!==null && <span style={{ color:trendVsYesterday>=0?'#22c984':'#ef4444', fontSize:10 }}>{trendVsYesterday>=0?'↑':'↓'} {Math.abs(trendVsYesterday)} vs yesterday</span>}
                    </div>
                  ) : c.id === 'violations' ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:4 }}>
                      <span>Peak @ {maxVHour}</span>
                      <span style={{ color:'#64748b', fontSize:10 }}>⛑️ No Helmet: <span style={{ color:'#ef4444', fontWeight:600 }}>{Math.round(100-(compliance?.helmet||0))}%</span>{'  '}🦺 No Vest: <span style={{ color:'#f59e0b', fontWeight:600 }}>{Math.round(100-(compliance?.vest||0))}%</span></span>
                      {violTrend!==null && <span style={{ color:violTrend<=0?'#22c984':'#ef4444', fontSize:10 }}>{violTrend<=0?'↓':'↑'} {Math.abs(violTrend)} vs yesterday</span>}
                    </div>
                  ) : c.id === 'compliance' ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:4 }}>
                      <span>Shift avg · All cameras</span>
                      <span style={{ color:'#64748b', fontSize:10 }}>⛑️ Helmet: <span style={{ color:'#4ade80', fontWeight:600 }}>{compliance?.helmet??0}%</span>{'  '}🦺 Vest: <span style={{ color:'#4ade80', fontWeight:600 }}>{compliance?.vest??0}%</span></span>
                      <span style={{ color:'#64748b', fontSize:10 }}>Best shift: <span style={{ color:'#f59e0b', fontWeight:600 }}>{bestShift==='morning'?'🌅 Morning':bestShift==='afternoon'?'☀️ Day':'🌙 Night'}</span></span>
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:4 }}>
                      <span>Without full PPE</span>
                      <span style={{ color:'#64748b', fontSize:10 }}>⛑️ No Helmet: <span style={{ color:'#ef4444', fontWeight:600 }}>{Math.round(100-(compliance?.helmet||0))}%</span></span>
                      <span style={{ color:'#64748b', fontSize:10 }}>🦺 No Vest: <span style={{ color:'#f59e0b', fontWeight:600 }}>{Math.round(100-(compliance?.vest||0))}%</span></span>
                    </div>
                  )
                }
              />
            ))}
          </div>
        </div>

        {/* ── Alerts toggle tab ── */}
        <AlertsToggleTab
          showAlertsPanel={showAlertsPanel}
          alertCount={alertCount}
          onToggleAlerts={onToggleAlerts}
        />

        {/* RIGHT — alerts slide-out panel */}
        <div className={`sc-alerts-panel ${showAlertsPanel ? 'open' : ''}`}>
          <div style={{ background:alertCount>0?'#1a0f0f':'#0f1a14', border:`1px solid ${alertCount>0?'rgba(229,62,62,0.3)':'rgba(34,201,132,0.2)'}`, borderRadius:14, padding:18, boxSizing:'border-box', display:'flex', flexDirection:'column', overflow:'hidden', height:'100%' }}>
            <AlertsPanel visibleAlerts={visibleAlerts} ackAlert={ackAlert} displayCompliance={displayCompliance} selectedDate={selectedDate} trendData={trendData} />
          </div>
        </div>

      </div>
    </>
  )
}
