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

    let datasets = []
    let yLabel = ''

    if (card.id === 'workers') {
      yLabel = 'Safe workers'
      datasets = [{
        label: 'Safe Workers',
        data: trendData.map(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0))),
        borderColor: '#22c984',
        backgroundColor: 'rgba(34,201,132,0.12)',
        fill: true, tension: 0.4,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#22c984',
        borderWidth: 2.5,
      }]
    } else if (card.id === 'violations') {
      yLabel = 'Violations'
      datasets = [{
        label: 'Violations',
        data: trendData.map(d => d.violations || 0),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.10)',
        fill: true, tension: 0.4,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#ef4444',
        borderWidth: 2.5,
        borderDash: [5, 3],
      }]
    } else if (card.id === 'compliance') {
      yLabel = 'Compliance %'
      // per-hour compliance
      datasets = [{
        label: 'PPE Compliance %',
        data: trendData.map(d => {
          const s = Math.max(0, (d.workers_active || 0) - (d.violations || 0))
          const t = d.workers_active || 0
          return t > 0 ? Math.round((s / t) * 100) : 0
        }),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.10)',
        fill: true, tension: 0.4,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#f59e0b',
        borderWidth: 2.5,
      }]
    } else if (card.id === 'ppe_violations') {
      yLabel = 'PPE Violation %'
      datasets = [{
        label: 'PPE Violations %',
        data: trendData.map(d => {
          const s = Math.max(0, (d.workers_active || 0) - (d.violations || 0))
          const t = d.workers_active || 0
          return t > 0 ? Math.round(((t - s) / t) * 100) : 0
        }),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.10)',
        fill: true, tension: 0.4,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#ef4444',
        borderWidth: 2.5,
      }]
    }

    chartInst.current = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => {
                if (!items.length) return ''
                const lbl = items[0].label
                const hour = parseInt(lbl.split(':')[0])
                return `${String(hour).padStart(2,'0')}:00 – ${String(hour+1).padStart(2,'00')}:00`
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#5a6a82', font: { size: 11 }, callback: (_, i) => parseInt(labels[i]?.split(':')[0]) },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: 'Hour', color: '#5a6a82', font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#a0aec0', font: { size: 11 }, callback: v => Number.isInteger(v) ? v : null },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: yLabel, color: '#5a6a82', font: { size: 11 } },
          },
        },
      },
    })

    return () => { if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null } }
  }, [card, trendData])

  // peak stats
  const peakStats = () => {
    if (!trendData || trendData.length === 0) return null
    if (card.id === 'workers') {
      const vals = trendData.map(d => Math.max(0, (d.workers_active||0)-(d.violations||0)))
      const peak = Math.max(...vals)
      const peakH = trendData[vals.indexOf(peak)]?.hour || '--'
      const total = vals.reduce((a,b)=>a+b,0)
      return [
        { label: '👷 Peak Safe Workers', val: peak, sub: `@ ${peakH}`, color: '#22c984' },
        { label: 'Total Safe (day)',      val: total, color: '#22c984' },
        { label: '✗ Total Violated',      val: displayViolated, color: '#ef4444' },
      ]
    }
    if (card.id === 'violations') {
      const vals = trendData.map(d => d.violations||0)
      const peak = Math.max(...vals)
      const peakH = trendData[vals.indexOf(peak)]?.hour || '--'
      const total = vals.reduce((a,b)=>a+b,0)
      return [
        { label: '🚨 Peak Violations', val: peak, sub: `@ ${peakH}`, color: '#ef4444' },
        { label: 'Total Violations',   val: total, color: '#ef4444' },
        { label: '✓ Total Safe',        val: displaySafe, color: '#22c984' },
      ]
    }
    if (card.id === 'compliance') {
      return [
        { label: '🦺 Helmet Compliance', val: `${compliance?.helmet ?? 0}%`, color: '#4ade80' },
        { label: '🦺 Vest Compliance',   val: `${compliance?.vest   ?? 0}%`, color: '#4ade80' },
        { label: 'Overall Compliance',   val: displayCompliance !== null ? `${displayCompliance}%` : '—', color: '#f59e0b' },
      ]
    }
    if (card.id === 'ppe_violations') {
      return [
        { label: '⚠️ No Helmet', val: `${Math.round(100-(compliance?.helmet||0))}%`, color: '#ef4444' },
        { label: '⚠️ No Vest',   val: `${Math.round(100-(compliance?.vest||0))}%`,   color: '#f59e0b' },
        { label: 'Overall PPE Violations', val: displayCompliance !== null ? `${100-displayCompliance}%` : '—', color: '#ef4444' },
      ]
    }
    return []
  }

  const stats = peakStats()

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(2px)',
          zIndex: 900,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(820px, 92vw)',
        background: '#0c1220',
        border: `1px solid ${card.colorKey}44`,
        borderTop: `3px solid ${card.colorKey}`,
        borderRadius: 14,
        zIndex: 950,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        animation: 'scFadeInUp 0.2s ease',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{card.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{card.label}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>Hourly trend · Today</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, color: '#94a3b8', cursor: 'pointer',
              padding: '4px 12px', fontSize: 18, lineHeight: 1.2,
            }}
          >×</button>
        </div>

        {/* Stats row */}
        {stats && (
          <div style={{
            display: 'flex', gap: 0,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            {stats.map((s, i) => (
              <div key={i} style={{
                flex: 1, padding: '12px 20px',
                borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
                  {s.sub && <span style={{ fontSize: 11, color: '#64748b' }}>{s.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        <div style={{ padding: '16px 20px 20px' }}>
          {trendData && trendData.length > 0 ? (
            <div style={{ position: 'relative', height: 240 }}>
              <canvas ref={chartRef} style={{ width: '100%', height: '100%' }} />
            </div>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
              No trend data available for this date
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub, compact = false, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position:     'relative',
        background:   hover ? '#1e2d45' : '#151f2e',
        border:       `1px solid ${hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        borderTop:    `3px solid ${color || '#5a6a82'}`,
        borderRadius: 12,
        padding:      compact ? '12px 14px' : '16px',
        cursor:       'pointer',
        transition:   'background 0.15s, border-color 0.15s, transform 0.12s',
        transform:    hover ? 'translateY(-2px)' : 'none',
        minWidth:     0,
      }}
    >
      {/* TAP hint */}
      <div style={{
        position: 'absolute', top: 8, right: 10,
        fontSize: 9, color: hover ? color : '#64748b',
        fontWeight: 600, letterSpacing: '0.04em',
        transition: 'color 0.15s',
      }}>
        📈 TAP
      </div>

      <div style={{ fontSize: compact ? 18 : 24, marginBottom: compact ? 6 : 12 }}>{icon}</div>
      <div style={{
        fontSize: 8, letterSpacing: '0.08em', color: '#cbd5e1',
        textTransform: 'uppercase', fontWeight: 700,
        marginBottom: compact ? 4 : 10,
      }}>{label}</div>
      <div style={{ fontSize: compact ? 32 : 52, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && (
        <div style={{ marginTop: compact ? 6 : 12, fontSize: compact ? 10 : 13, color: '#94a3b8' }}>{sub}</div>
      )}
    </div>
  )
}

// ─── Alerts panel ─────────────────────────────────────────────────────────────
function AlertsPanel({ visibleAlerts = [], ackAlert, displayCompliance, selectedDate, trendData }) {
  const hasAlerts = visibleAlerts.length > 0
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const HOURS = trendData && trendData.length
    ? trendData.map(d => {
        const raw = d.hour?.slice(0, 5) ?? ''
        const [hStr] = raw.split(':')
        const h = parseInt(hStr, 10)
        if (isNaN(h)) return raw
        if (h === 0)  return '12a'
        if (h < 12)   return `${h}a`
        if (h === 12) return '12p'
        return `${h - 12}p`
      })
    : []

  const heatCounts = trendData && trendData.length ? trendData.map(d => d.violations ?? 0) : []
  const maxCount   = Math.max(...heatCounts, 1)
  const peakIdx    = heatCounts.indexOf(Math.max(...heatCounts))

  const getHeatColor = (v) => {
    if (v === 0) return 'rgba(255,255,255,0.04)'
    const r = v / maxCount
    if (r < 0.25) return 'rgba(239,68,68,0.20)'
    if (r < 0.50) return 'rgba(239,68,68,0.42)'
    if (r < 0.75) return 'rgba(239,68,68,0.65)'
    return '#ef4444'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
            🔔 Active Alerts
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8' }}>Last checked {now}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 44, fontWeight: 700, color: hasAlerts ? '#ef4444' : '#22c984', lineHeight: 1 }}>
            {visibleAlerts.length}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: hasAlerts ? '#ef4444' : '#22c984',
                display: 'inline-block', marginRight: 8,
                animation: hasAlerts ? 'scPulse 1.4s infinite' : 'none',
              }} />
              {hasAlerts ? 'unacknowledged' : 'All clear'}
            </div>
            <div style={{ fontSize: 10, color: hasAlerts ? '#ef4444' : '#22c984', marginTop: 3 }}>
              {hasAlerts ? '⚠ Click any alert to acknowledge' : '✓ No active alerts · site is safe'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {hasAlerts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {visibleAlerts.slice(0, 10).map(a => (
              <div key={a._id} onClick={() => ackAlert(a._id)} style={{
                background:   a.severity === 'critical' ? '#2a0f0f' : '#2a1f0a',
                borderLeft:   `3px solid ${a.severity === 'critical' ? '#e53e3e' : '#f59e0b'}`,
                borderRadius: 5, padding: '7px 10px', cursor: 'pointer', transition: 'opacity 0.2s',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: a.severity === 'critical' ? '#fca5a5' : '#fcd34d', marginBottom: 2 }}>
                  {a.severity?.toUpperCase()} — {a.type?.replace('_', ' ')}
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>
                  📹 {a.camera} · Worker {a.worker_id} · {new Date(a.timestamp).toLocaleTimeString()}
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>tap to acknowledge</div>
              </div>
            ))}
          </div>
        )}

        {!hasAlerts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              background: 'rgba(34,201,132,0.08)', border: '1px solid rgba(34,201,132,0.2)',
              borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 20 }}>✅</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#22c984' }}>Site is fully safe</div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                  No PPE violations · All workers compliant · {selectedDate}
                </div>
              </div>
            </div>

            {HOURS.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    Hourly violation heatmap
                  </div>
                  <div style={{ fontSize: 9, color: '#ef4444' }}>
                    Peak: {HOURS[peakIdx]} · {heatCounts[peakIdx]} violations
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`, gap: 3, marginBottom: 4 }}>
                  {HOURS.map(h => (
                    <div key={h} style={{ fontSize: 8, color: '#94a3b8', textAlign: 'center' }}>{h}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`, gap: 3 }}>
                  {heatCounts.map((v, i) => (
                    <div key={i} title={`${HOURS[i]}: ${v} violation${v !== 1 ? 's' : ''}`} style={{
                      height: 26, borderRadius: 4, background: getHeatColor(v),
                      border: i === peakIdx ? '1px solid rgba(239,68,68,0.7)' : '1px solid rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {v > 0 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: v / maxCount > 0.5 ? '#fff' : '#ef4444' }}>{v}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 7 }}>
                  <span style={{ fontSize: 8, color: '#94a3b8' }}>Low</span>
                  {['rgba(239,68,68,0.20)', 'rgba(239,68,68,0.42)', 'rgba(239,68,68,0.65)', '#ef4444'].map((c, i) => (
                    <div key={i} style={{ width: 14, height: 7, borderRadius: 2, background: c }} />
                  ))}
                  <span style={{ fontSize: 8, color: '#94a3b8' }}>High</span>
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
  { id: 'workers',        icon: '👷', label: 'Workers Safe On-Site', colorKey: '#22c984' },
  { id: 'violations',     icon: '🚨', label: 'Max Violations',       colorKey: '#ef4444' },
  { id: 'compliance',     icon: '🦺', label: 'PPE Compliance',       colorKey: '#f59e0b' },
  { id: 'ppe_violations', icon: '⚠️', label: 'PPE Violations',       colorKey: '#ef4444' },
]

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
  const [panelMounted, setPanelMounted] = useState(false)
  const [derivedSafe,  setDerivedSafe]  = useState(null)
  const [activeModal,  setActiveModal]  = useState(null)   // card id or null

  useEffect(() => {
    if (showAlertsPanel) {
      requestAnimationFrame(() => setPanelMounted(true))
    } else {
      setPanelMounted(false)
    }
  }, [showAlertsPanel])

  // close modal on Escape
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
      .then(arr => {
        const safe = Array.isArray(arr) ? arr.reduce((s, d) => s + (d.workers_active || 0), 0) : 0
        setDerivedSafe(safe)
      })
      .catch(() => setDerivedSafe(0))
  }, [selectedDate])

  const getCardValue = (id) => {
    if (isLoading) return '…'
    if (id === 'workers')        return derivedSafe ?? todaySafe
    if (id === 'violations')     return displayViolated
    if (id === 'compliance')     return displayCompliance !== null ? `${displayCompliance}%` : '—'
    if (id === 'ppe_violations') return displayCompliance !== null ? `${100 - displayCompliance}%` : '—'
    return '—'
  }

  const alertCount   = visibleAlerts?.length ?? 0
  const activeCardObj = CARDS.find(c => c.id === activeModal)

  const modalData = {
    trendData, displaySafe, displayViolated, displayCompliance, compliance,
  }

  return (
    <>
      <style>{`
        @keyframes scPulse    { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes scFadeInUp { from{opacity:0;transform:translate(-50%,-48%)} to{opacity:1;transform:translate(-50%,-50%)} }

        .sc-alerts-panel {
          overflow:    hidden;
          width:       0;
          max-height:  0;
          opacity:     0;
          flex-shrink: 0;
          transition:  width      0.38s cubic-bezier(0.4,0,0.2,1),
                       max-height 0.38s ease,
                       opacity    0.30s ease,
                       margin-left 0.38s ease;
          margin-left: 0;
        }
        .sc-alerts-panel.open {
          width:       50%;
          max-height:  800px;
          opacity:     1;
          margin-left: 16px;
        }
      `}</style>

      {/* ── Chart popup modal ── */}
      {activeModal && activeCardObj && (
        <CardChartModal
          card={activeCardObj}
          data={modalData}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* ── Outer row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16, width: '100%' }}>

        {/* LEFT — 4 stat cards */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display:             'grid',
            gridTemplateColumns: showAlertsPanel ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap:                 16,
            transition:          'grid-template-columns 0.35s ease',
          }}>
            {CARDS.map(c => (
              <StatCard
                key={c.id}
                icon={c.icon}
                label={c.label}
                value={getCardValue(c.id)}
                color={c.colorKey}
                compact={showAlertsPanel}
                sub={
                  c.id === 'workers'        ? selectedDate :
                  c.id === 'violations'     ? `Peak @ ${maxVHour}` :
                  c.id === 'compliance'     ? 'Shift avg · All cameras' :
                  'Without full PPE'
                }
                onClick={() => setActiveModal(c.id)}
              />
            ))}
          </div>
        </div>
        {/* Vertical trigger tab */}
        <div
          onClick={onToggleAlerts}
          style={{
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            6,
            width:          22,
            alignSelf:      'stretch',
            background:     panelMounted
              ? alertCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,201,132,0.1)'
              : 'rgba(255,255,255,0.04)',
            border:         `1px solid ${panelMounted
              ? alertCount > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(34,201,132,0.3)'
              : 'rgba(255,255,255,0.1)'}`,
            borderRadius:   8,
            cursor:         'pointer',
            flexShrink:     0,
            marginLeft:     8,
            transition:     'all 0.2s',
          }}
        >
          <span style={{
            fontSize:      10,
            fontWeight:    600,
            color:         panelMounted
              ? alertCount > 0 ? '#f87171' : '#4ade80'
              : '#64748b',
            writingMode:   'vertical-rl',
            transform:     'rotate(180deg)',
            letterSpacing: '0.06em',
            userSelect:    'none',
          }}>
            {alertCount > 0 ? `🔔 ${alertCount} alerts` : 'Alerts'}
          </span>
          <span style={{
            fontSize:   14,
            color:      panelMounted
              ? alertCount > 0 ? '#f87171' : '#4ade80'
              : '#64748b',
            transition: 'transform 0.2s',
            transform:  panelMounted ? 'rotate(90deg)' : 'rotate(-90deg)',
          }}>›</span>
        </div>

        {/* RIGHT — alerts panel */}
        <div className={`sc-alerts-panel ${panelMounted ? 'open' : ''}`}>
          <div style={{
            background:    alertCount > 0 ? '#1a0f0f' : '#0f1a14',
            border:        `1px solid ${alertCount > 0 ? 'rgba(229,62,62,0.3)' : 'rgba(34,201,132,0.2)'}`,
            borderRadius:  14,
            padding:       18,
            boxSizing:     'border-box',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
            height:        '100%',
          }}>
            <AlertsPanel
              visibleAlerts={visibleAlerts}
              ackAlert={ackAlert}
              displayCompliance={displayCompliance}
              selectedDate={selectedDate}
              trendData={trendData}
            />
          </div>
        </div>

      </div>
    </>
  )
}
