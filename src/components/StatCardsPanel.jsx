import { useState, useEffect } from 'react'

// ─── Mini sparkline SVG ───────────────────────────────────────────────────────
function Sparkline({ data = [], color = '#22c984', height = 40 }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const w = 200, h = height
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w
    const y = h - (v / max) * (h - 4)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * w
        const y = h - (v / max) * (h - 4)
        return <circle key={i} cx={x} cy={y} r="3" fill={color} />
      })}
    </svg>
  )
}

// ─── Bar row ─────────────────────────────────────────────────────────────────
function BarRow({ label, value, max, color, suffix = '' }) {
  const pct = Math.round((value / Math.max(max, 1)) * 100)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: '#cbd5e1' }}>{label}</span>
        <span style={{ color, fontWeight: 700, fontFamily: 'monospace' }}>{value}{suffix}</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 5 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ─── Detail panel content per card ───────────────────────────────────────────
function DetailContent({ cardId, data }) {
  const {
    todaySafe, todayViols, displayViolated, maxViolations, maxVHour, compliance,
    displaySafe, displayCompliance, safeWorkers7day, shiftSafe, cameraSafe,
    trendData, visibleAlerts, ackAlert, derivedSafe,
  } = data

  const workersSafeValue = derivedSafe ?? todaySafe

  if (cardId === 'workers') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>MAX WORKERS SAFE</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#22c984', lineHeight: 1 }}>{workersSafeValue}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <span style={{ color: '#22c984' }}>{workersSafeValue} safe</span>
            {' · '}
            <span style={{ color: '#ef4444' }}>{todayViols} violated</span>
          </div>
        </div>

        {/* CHANGED: 7-day trend → hourly trend using trendData */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>HOURLY TREND (TODAY)</div>
          <Sparkline data={(trendData || []).map(d => d.workers_active)} color="#22c984" height={50} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {(trendData || []).map((d, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#94a3b8' }}>{d.hour?.slice(0, 5)}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#22c984' }}>{d.workers_active}</div>
              </div>
            ))}
          </div>
          {(!trendData || trendData.length === 0) && (
            <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 8 }}>
              No hourly data available
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>SHIFT BREAKDOWN</div>
          {[
            { label: '🌅 Morning',   val: shiftSafe?.morning   || 0, color: '#f59e0b' },
            { label: '☀️ Afternoon', val: shiftSafe?.afternoon || 0, color: '#f97316' },
            { label: '🌙 Night',     val: shiftSafe?.night     || 0, color: '#6366f1' },
          ].map(s => (
            <BarRow
              key={s.label}
              label={s.label}
              value={s.val}
              max={Math.max(shiftSafe?.morning, shiftSafe?.afternoon, shiftSafe?.night, 1)}
              color={s.color}
            />
          ))}
        </div>

        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>ZONE / CAMERA</div>
          {(cameraSafe || []).map(c => (
            <div key={c.camera_id} style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 11,
              marginBottom: 6, padding: '5px 8px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 5,
            }}>
              <span style={{ color: '#cbd5e1' }}>📷 {c.camera_id}</span>
              <span style={{ color: '#22c984', fontWeight: 700 }}>{c.safe_count} safe</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (cardId === 'violations') {
    const vTrend = (trendData || []).map(d => d.violations)
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>MAX VIOLATIONS</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{maxViolations}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Peak @ {maxVHour}</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>HOURLY VIOLATIONS</div>
          <Sparkline data={vTrend} color="#ef4444" height={50} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {(trendData || []).map((d, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: '#94a3b8' }}>{d.hour?.slice(0, 5)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444' }}>{d.violations}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#22c984' }}>✓ Safe: <strong>{displaySafe}</strong></span>
            <span style={{ color: '#ef4444' }}>✗ Violated: <strong>{displayViolated}</strong></span>
          </div>
        </div>
      </div>
    )
  }

  if (cardId === 'compliance') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>PPE COMPLIANCE</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#f59e0b', lineHeight: 1 }}>
            {displayCompliance !== null ? `${displayCompliance}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Shift avg · All cameras</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>PPE ITEM COMPLIANCE</div>
          <BarRow label="Helmet" value={compliance?.helmet ?? 0} max={100} color="#4ade80" suffix="%" />
          <BarRow label="Vest"   value={compliance?.vest   ?? 0} max={100} color="#4ade80" suffix="%" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>VIOLATION BREAKDOWN</div>
          <BarRow label="No Helmet" value={Math.round(100 - (compliance?.helmet || 0))} max={100} color="#ef4444" suffix="%" />
          <BarRow label="No Vest"   value={Math.round(100 - (compliance?.vest   || 0))} max={100} color="#f59e0b" suffix="%" />
        </div>
      </div>
    )
  }

  if (cardId === 'ppe_violations') {
    const noHelmet = Math.round(100 - (compliance?.helmet || 0))
    const noVest   = Math.round(100 - (compliance?.vest   || 0))
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>PPE VIOLATIONS</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>
            {displayCompliance !== null ? `${100 - displayCompliance}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Workers without full PPE</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>VIOLATION TYPE</div>
          <BarRow label="No Helmet" value={noHelmet} max={100} color="#ef4444" suffix="%" />
          <BarRow label="No Vest"   value={noVest}   max={100} color="#f59e0b" suffix="%" />
        </div>

        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>SEVERITY</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#ef4444' }}>Critical: <strong>{noHelmet}%</strong></span>
            <span style={{ color: '#f59e0b' }}>Warning: <strong>{noVest}%</strong></span>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ─── Alerts panel ─────────────────────────────────────────────────────────────
function AlertsPanel({ visibleAlerts = [], ackAlert, todaySafe, todayViols, displayCompliance, shiftSafe, compliance, selectedDate, trendData }) {
  const hasAlerts = visibleAlerts.length > 0
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const HOURS = trendData && trendData.length
    ? trendData.map(d => {
        const raw = d.hour?.slice(0, 5) ?? ''
        const [hStr] = raw.split(':')
        const h = parseInt(hStr, 10)
        if (isNaN(h)) return raw
        if (h === 0)  return '12a'
        if (h < 12)  return `${h}a`
        if (h === 12) return '12p'
        return `${h - 12}p`
      })
    : []

  const heatCounts = trendData && trendData.length
    ? trendData.map(d => d.violations ?? 0)
    : []

  const maxCount = Math.max(...heatCounts, 1)
  const peakIdx  = heatCounts.indexOf(Math.max(...heatCounts))

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
                animation: hasAlerts ? 'pulse 1.4s infinite' : 'none',
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
              <div
                key={a._id}
                onClick={() => ackAlert(a._id)}
                style={{
                  background:   a.severity === 'critical' ? '#2a0f0f' : '#2a1f0a',
                  borderLeft:   `3px solid ${a.severity === 'critical' ? '#e53e3e' : '#f59e0b'}`,
                  borderRadius: 5, padding: '7px 10px', cursor: 'pointer',
                  transition:   'opacity 0.2s',
                }}
              >
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

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: '10px 12px',
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
                  <div
                    key={i}
                    title={`${HOURS[i]}: ${v} violation${v !== 1 ? 's' : ''}`}
                    style={{
                      height: 26, borderRadius: 4,
                      background: getHeatColor(v),
                      border: i === peakIdx
                        ? '1px solid rgba(239,68,68,0.7)'
                        : '1px solid rgba(255,255,255,0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {v > 0 && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: v / maxCount > 0.5 ? '#fff' : '#ef4444' }}>
                        {v}
                      </span>
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
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mini (collapsed) card ────────────────────────────────────────────────────
function MiniCard({ icon, label, value, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background:   '#151f2e',
        border:       '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        padding:      '10px 12px',
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        gap:          10,
        transition:   'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#1e2d45'}
      onMouseLeave={e => e.currentTarget.style.background = '#151f2e'}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 8, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      </div>
      <span style={{ fontSize: 9, color: '#94a3b8' }}>›</span>
    </div>
  )
}

// ─── Normal stat card ─────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub, onClick, badge }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background:   hover && onClick ? '#1e2d45' : '#151f2e',
        border:       `1px solid ${hover && onClick ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        /* colored top accent strip per card */
        borderTop:    `3px solid ${color || '#5a6a82'}`,
        borderRadius: 12,
        padding:      '13px 15px',
        cursor:       onClick ? 'pointer' : 'default',
        transition:   'background 0.15s, border-color 0.15s, transform 0.12s',
        transform:    hover && onClick ? 'translateY(-1px)' : 'none',
        position:     'relative',
        userSelect:   'none',
      }}
    >
      {onClick && (
        <div style={{ position: 'absolute', top: 8, right: 10, fontSize: 9, color: '#94a3b8', letterSpacing: '0.06em' }}>TAP ›</div>
      )}
      {badge != null && badge > 0 && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          background: '#e53e3e', color: '#fff', borderRadius: '50%',
          width: 18, height: 18, fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</div>
      )}
      <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>
      {/* label: was #5a6a82 (grey), now #cbd5e1 (clearly visible light) */}
      <div style={{ fontSize: 8, letterSpacing: '0.08em', color: '#cbd5e1', marginBottom: 3, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || '#e2e8f0', lineHeight: 1 }}>{value}</div>
      {/* sub: was #5a6a82, now #94a3b8 */}
      {sub && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
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
  isLoading, todaySafe, todayViols, displaySafe, displayViolated, displayTotal,
  displayCompliance, maxViolations, maxVHour, compliance, safeWorkers7day,
  shiftSafe, cameraSafe, trendData, visibleAlerts, ackAlert, selectedDate,
}) {
  const [activeCard, setActiveCard] = useState(null)
  const [derivedSafe, setDerivedSafe] = useState(null)

  useEffect(() => {
    if (!selectedDate) return
    setDerivedSafe(null)
    fetch(`/api/hourly-trend?date=${selectedDate}&shift=both`)
      .then(r => r.ok ? r.json() : [])
      .then(arr => {
        const safe = Array.isArray(arr)
          ? arr.reduce((s, d) => s + (d.workers_active || 0), 0)
          : 0
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

  const detailData = {
    todaySafe, todayViols, displaySafe, displayViolated, displayTotal, displayCompliance,
    maxViolations, maxVHour, compliance, safeWorkers7day, shiftSafe, cameraSafe,
    trendData, visibleAlerts, ackAlert, derivedSafe,
  }

  const handleCardClick = (id) => setActiveCard(prev => prev === id ? null : id)

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .detail-panel-anim { animation: fadeSlideIn 0.22s ease; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12, marginBottom: 16, alignItems: 'stretch' }}>

        {/* LEFT — 4 stat cards */}
        <div>
          {activeCard === null ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: '100%' }}>
              {CARDS.map(c => (
                <StatCard
                  key={c.id}
                  icon={c.icon}
                  label={c.label}
                  value={getCardValue(c.id)}
                  color={c.colorKey}
                  sub={
                    c.id === 'workers'        ? selectedDate :
                    c.id === 'violations'     ? `Peak @ ${maxVHour}` :
                    c.id === 'compliance'     ? 'Shift avg · All cameras' :
                    'Without full PPE'
                  }
                  onClick={() => handleCardClick(c.id)}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
              {CARDS.filter(c => c.id !== activeCard).map(c => (
                <MiniCard
                  key={c.id}
                  icon={c.icon}
                  label={c.label}
                  value={getCardValue(c.id)}
                  color={c.colorKey}
                  onClick={() => handleCardClick(c.id)}
                />
              ))}
              <div
                onClick={() => setActiveCard(null)}
                style={{
                  background:   'rgba(255,255,255,0.04)',
                  border:       `1px solid ${CARDS.find(c => c.id === activeCard)?.colorKey || '#5a6a82'}`,
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                  display:      'flex', alignItems: 'center', gap: 10,
                }}
              >
                <span style={{ fontSize: 16 }}>{CARDS.find(c => c.id === activeCard)?.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 8, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase' }}>
                    {CARDS.find(c => c.id === activeCard)?.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: CARDS.find(c => c.id === activeCard)?.colorKey, lineHeight: 1.1 }}>
                    {getCardValue(activeCard)}
                  </div>
                </div>
                <span style={{ fontSize: 9, color: '#94a3b8' }}>✕ close</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — alerts / detail panel */}
        <div
          style={{
            background:    activeCard ? '#151f2e' : visibleAlerts.length > 0 ? '#1a0f0f' : '#0f1a14',
            border:        `1px solid ${activeCard ? 'rgba(255,255,255,0.08)' : visibleAlerts.length > 0 ? 'rgba(229,62,62,0.3)' : 'rgba(34,201,132,0.2)'}`,
            borderRadius:  14,
            padding:       18,
            height:        320,
            boxSizing:     'border-box',
            display:       'flex',
            flexDirection: 'column',
            overflow:      'hidden',
            position:      'relative',
          }}
        >
          {activeCard ? (
            <div key={activeCard} className="detail-panel-anim" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                  {CARDS.find(c => c.id === activeCard)?.icon}{' '}
                  {CARDS.find(c => c.id === activeCard)?.label} — Details
                </div>
                <button
                  onClick={() => setActiveCard(null)}
                  style={{
                    background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, color: '#94a3b8', cursor: 'pointer',
                    padding: '2px 10px', fontSize: 14, lineHeight: 1.4,
                  }}
                >×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <DetailContent cardId={activeCard} data={detailData} />
              </div>
            </div>
          ) : (
            <AlertsPanel
              visibleAlerts={visibleAlerts}
              ackAlert={ackAlert}
              todaySafe={todaySafe}
              todayViols={todayViols}
              displayCompliance={displayCompliance}
              shiftSafe={shiftSafe}
              compliance={compliance}
              selectedDate={selectedDate}
              trendData={trendData}
            />
          )}
        </div>

      </div>
    </>
  )
}
