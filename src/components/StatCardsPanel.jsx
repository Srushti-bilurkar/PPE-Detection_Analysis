import { useState, useEffect, useRef } from 'react'

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

// ─── Aggregate multiple camera KPIs into one ──────────────────────────────────
function aggregateKpis(kpiList) {
  const valid = kpiList.filter(Boolean)
  if (!valid.length) return null
  const total_safe       = valid.reduce((s, k) => s + (k.total_safe       ?? 0), 0)
  const total_violations = valid.reduce((s, k) => s + (k.total_violations ?? 0), 0)
  const total_persons    = total_safe + total_violations
  const compliance_pct   = total_persons > 0
    ? Math.round((total_safe / total_persons) * 1000) / 10
    : null
  return { total_safe, total_violations, total_persons, compliance_pct }
}

// ─── Detail panel content per card ───────────────────────────────────────────
function DetailContent({ cardId, data }) {
  const {
    todaySafe, todayViols, displayViolated, maxViolations, maxVHour, compliance,
    displaySafe, displayCompliance, safeWorkers7day, shiftSafe, cameraSafe,
    trendData, visibleAlerts, ackAlert, derivedSafe,
    selectedCamera, selectedLocation, locationKpi, camKpi,
  } = data

  // Resolved KPI: location > camera > global
  const resolvedKpi = selectedLocation ? locationKpi : selectedCamera ? camKpi : null
  const scopeLabel  = selectedLocation
    ? selectedLocation.label
    : selectedCamera
      ? (selectedCamera.id)
      : null

  const workersSafeValue = resolvedKpi ? (resolvedKpi.total_safe ?? '—') : (derivedSafe ?? todaySafe)
  const violsValue       = resolvedKpi ? (resolvedKpi.total_violations ?? '—') : todayViols

  if (cardId === 'workers') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>
            {scopeLabel ? `WORKERS SAFE · ${scopeLabel}` : 'WORKERS SAFE ON-SITE'}
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#22c984', lineHeight: 1 }}>{workersSafeValue}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <span style={{ color: '#22c984' }}>{workersSafeValue} safe</span>
            {' · '}
            <span style={{ color: '#ef4444' }}>{violsValue} violated</span>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>HOURLY TREND</div>
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

        {/* Per-camera breakdown when location is selected */}
        {selectedLocation && data.locationCameraKpis && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>
              CAMERA BREAKDOWN · {selectedLocation.label}
            </div>
            {data.locationCameraKpis.map(({ camera, kpi }) => (
              <div key={camera.id} style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 11,
                marginBottom: 6, padding: '5px 8px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 5,
              }}>
                <span style={{ color: '#cbd5e1' }}>📷 {camera.id}</span>
                <span style={{ color: '#22c984', fontWeight: 700 }}>
                  {kpi ? kpi.total_safe : '—'} safe
                </span>
              </div>
            ))}
          </div>
        )}

        {!selectedLocation && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>
              {scopeLabel ? 'CAMERA DETAIL' : 'ZONE / CAMERA'}
            </div>
            {(cameraSafe || [])
              .filter(c => !scopeLabel || c.camera_id === scopeLabel)
              .map(c => (
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
        )}
      </div>
    )
  }

  if (cardId === 'violations') {
    const vTrend = (trendData || []).map(d => d.violations)
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>
            {scopeLabel ? `MAX VIOLATIONS · ${scopeLabel}` : 'MAX VIOLATIONS'}
          </div>
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

        {/* Per-camera violations when location selected */}
        {selectedLocation && data.locationCameraKpis && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>
              CAMERA BREAKDOWN · {selectedLocation.label}
            </div>
            {data.locationCameraKpis.map(({ camera, kpi }) => (
              <div key={camera.id} style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 11,
                marginBottom: 6, padding: '5px 8px',
                background: 'rgba(255,255,255,0.03)', borderRadius: 5,
              }}>
                <span style={{ color: '#cbd5e1' }}>📷 {camera.id}</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>
                  {kpi ? kpi.total_violations : '—'} violations
                </span>
              </div>
            ))}
          </div>
        )}

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
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>
            {scopeLabel ? `PPE COMPLIANCE · ${scopeLabel}` : 'PPE COMPLIANCE'}
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#f59e0b', lineHeight: 1 }}>
            {resolvedKpi?.compliance_pct != null
              ? `${resolvedKpi.compliance_pct}%`
              : displayCompliance !== null ? `${displayCompliance}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
            {scopeLabel ? `${scopeLabel} · today` : 'Shift avg · All cameras'}
          </div>
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
    const compPct  = resolvedKpi?.compliance_pct != null
      ? resolvedKpi.compliance_pct
      : displayCompliance

    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>
            {scopeLabel ? `PPE VIOLATIONS · ${scopeLabel}` : 'PPE VIOLATIONS'}
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>
            {compPct !== null ? `${100 - compPct}%` : '—'}
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
function AlertsPanel({ visibleAlerts = [], ackAlert, todaySafe, todayViols, displayCompliance, shiftSafe, compliance, selectedDate, trendData, selectedCamera, selectedLocation }) {
  const hasAlerts = visibleAlerts.length > 0
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const scopeLabel = selectedLocation?.label || selectedCamera?.id || null

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
            🔔 Active Alerts{scopeLabel ? ` · ${scopeLabel}` : ''}
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
              {hasAlerts ? '⚠ Click any alert to acknowledge' : `✓ No active alerts · ${scopeLabel ? scopeLabel + ' is safe' : 'site is safe'}`}
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#22c984' }}>
                  {scopeLabel ? `${scopeLabel} is safe` : 'Site is fully safe'}
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                  No PPE violations · All workers compliant · {selectedDate}
                </div>
              </div>
            </div>

            {HOURS.length > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
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
            )}
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
        background: '#151f2e', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.15s',
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
        borderTop:    `3px solid ${color || '#5a6a82'}`,
        borderRight:  `1px solid ${hover && onClick ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        borderBottom: `1px solid ${hover && onClick ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        borderLeft:   `1px solid ${hover && onClick ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 12, padding: '13px 15px',
        cursor:       onClick ? 'pointer' : 'default',
        transition:   'background 0.15s, border-color 0.15s, transform 0.12s',
        transform:    hover && onClick ? 'translateY(-1px)' : 'none',
        position:     'relative', userSelect: 'none',
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
      <div style={{ fontSize: 8, letterSpacing: '0.08em', color: '#cbd5e1', marginBottom: 3, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || '#e2e8f0', lineHeight: 1 }}>{value}</div>
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

// ─── Collect all cameras (including sub-locations) for a location ─────────────
function getAllCamerasForLocation(location) {
  if (!location) return []
  if (location.cameras) return location.cameras
  if (location.subLocations) {
    return location.subLocations.flatMap(sub => sub.cameras || [])
  }
  return []
}

// ─── Main exported component ──────────────────────────────────────────────────
export default function StatCardsPanel({
  isLoading, todaySafe, todayViols, displaySafe, displayViolated, displayTotal,
  displayCompliance, maxViolations, maxVHour, compliance, safeWorkers7day,
  shiftSafe, cameraSafe, trendData, visibleAlerts, ackAlert, selectedDate,
  selectedCamera, onClearCamera,
  // ── NEW PROPS ──
  selectedLocation,   // { id, label, icon, cameras?, subLocations? } | null
  onClearLocation,    // () => void
}) {
  const [activeCard,         setActiveCard]         = useState(null)
  const [derivedSafe,        setDerivedSafe]        = useState(null)
  const [camKpi,             setCamKpi]             = useState(null)
  // Location-level aggregated KPI
  const [locationKpi,        setLocationKpi]        = useState(null)
  const [locationKpiLoading, setLocationKpiLoading] = useState(false)
  // Per-camera KPIs for the selected location (for breakdown in detail panel)
  const [locationCameraKpis, setLocationCameraKpis] = useState([])

  // ── Fetch per-camera KPI when a single camera is selected ──
  useEffect(() => {
    if (!selectedDate || selectedLocation) return   // location mode handled separately
    setCamKpi(null)
    const realId = selectedCamera?.db_id || selectedCamera?.id
    if (!realId) return
    const camParam = `&camera=${encodeURIComponent(realId)}`
    fetch(`/api/kpi?date=${selectedDate}${camParam}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setCamKpi(data))
      .catch(() => setCamKpi(null))
  }, [selectedDate, selectedCamera, selectedLocation])

  // ── Fetch & aggregate KPIs for all cameras in the selected location ──
  useEffect(() => {
    if (!selectedDate || !selectedLocation) {
      setLocationKpi(null)
      setLocationCameraKpis([])
      return
    }

    const cameras = getAllCamerasForLocation(selectedLocation)
    if (!cameras.length) {
      setLocationKpi(null)
      setLocationCameraKpis([])
      return
    }

    setLocationKpiLoading(true)
    setLocationKpi(null)
    setLocationCameraKpis([])

    // Fetch KPI for every camera in the location in parallel
    Promise.all(
      cameras.map(camera => {
        const realId = camera.db_id || camera.id
        return fetch(`/api/kpi?date=${selectedDate}&camera=${encodeURIComponent(realId)}`)
          .then(r => r.ok ? r.json() : null)
          .then(kpi => ({ camera, kpi }))
          .catch(() => ({ camera, kpi: null }))
      })
    ).then(results => {
      setLocationCameraKpis(results)
      const aggregated = aggregateKpis(results.map(r => r.kpi))
      setLocationKpi(aggregated)
      setLocationKpiLoading(false)
    })
  }, [selectedDate, selectedLocation])

  // ── Derived safe count for hourly trend (no location override needed) ──
  useEffect(() => {
    if (!selectedDate || selectedLocation) return
    setDerivedSafe(null)
    const realId   = selectedCamera?.db_id || selectedCamera?.id || ''
    const camParam = realId ? `&camera=${realId}` : ''
    fetch(`/api/hourly-trend?date=${selectedDate}&shift=both${camParam}`)
      .then(r => r.ok ? r.json() : [])
      .then(arr => {
        const safe = Array.isArray(arr)
          ? arr.reduce((s, d) => s + (d.workers_active || 0), 0)
          : 0
        setDerivedSafe(safe)
      })
      .catch(() => setDerivedSafe(0))
  }, [selectedDate, selectedCamera, selectedLocation])

  // ── Resolved KPI: location > single camera > global ──
  const resolvedKpi = selectedLocation
    ? locationKpi
    : selectedCamera ? camKpi : null

  const isKpiLoading = selectedLocation
    ? locationKpiLoading
    : (selectedCamera && !camKpi)

  const getCardValue = (id) => {
    if (isLoading) return '…'
    if (isKpiLoading) return '…'

    if (id === 'workers') {
      if (resolvedKpi) return resolvedKpi.total_safe ?? '—'
      return derivedSafe ?? todaySafe
    }
    if (id === 'violations') {
      if (resolvedKpi) return resolvedKpi.total_violations ?? '—'
      return displayViolated
    }
    if (id === 'compliance') {
      if (resolvedKpi) return resolvedKpi.compliance_pct != null ? `${resolvedKpi.compliance_pct}%` : '—'
      return displayCompliance !== null ? `${displayCompliance}%` : '—'
    }
    if (id === 'ppe_violations') {
      if (resolvedKpi) return resolvedKpi.compliance_pct != null ? `${100 - resolvedKpi.compliance_pct}%` : '—'
      return displayCompliance !== null ? `${100 - displayCompliance}%` : '—'
    }
    return '—'
  }

  const getCardSub = (id) => {
    const scopeLabel = selectedLocation?.label || selectedCamera?.name || selectedCamera?.id || null
    const loading    = isKpiLoading

    if (id === 'workers')
      return scopeLabel ? (loading ? 'Loading…' : scopeLabel) : selectedDate
    if (id === 'violations')
      return scopeLabel
        ? (loading ? 'Loading…' : `${scopeLabel} · Peak @ ${maxVHour}`)
        : `Peak @ ${maxVHour}`
    if (id === 'compliance')
      return scopeLabel
        ? (loading ? 'Loading…' : `${scopeLabel} · today`)
        : 'Shift avg · All cameras'
    if (id === 'ppe_violations')
      return scopeLabel
        ? (loading ? 'Loading…' : `${scopeLabel} · without full PPE`)
        : 'Without full PPE'
    return ''
  }

  const detailData = {
    todaySafe, todayViols, displaySafe, displayViolated, displayTotal, displayCompliance,
    maxViolations, maxVHour, compliance, safeWorkers7day, shiftSafe, cameraSafe,
    trendData, visibleAlerts, ackAlert, derivedSafe,
    selectedCamera, camKpi,
    selectedLocation, locationKpi, locationCameraKpis,
  }

  const handleCardClick = (id) => setActiveCard(prev => prev === id ? null : id)

  // Scope banner: show location OR camera banner, not both
  const showLocationBanner = !!selectedLocation
  const showCameraBanner   = !selectedLocation && !!selectedCamera

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

      {/* ── Location filter banner ── */}
      {showLocationBanner && (
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   10,
          padding:        '7px 14px',
          background:     'rgba(99,102,241,0.08)',
          border:         '1px solid rgba(99,102,241,0.25)',
          borderRadius:   8,
          fontSize:       12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a5b4fc' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', display: 'inline-block', flexShrink: 0 }} />
            <span>
              {selectedLocation.icon} Showing stats for location{' '}
              <strong>{selectedLocation.label}</strong>
              {' '}
              <span style={{ color: '#64748b', fontWeight: 400 }}>
                ({getAllCamerasForLocation(selectedLocation).length} camera{getAllCamerasForLocation(selectedLocation).length !== 1 ? 's' : ''})
              </span>
            </span>
            {locationKpiLoading && (
              <span style={{ color: '#64748b', fontSize: 10 }}>— aggregating…</span>
            )}
          </div>
          <button
            onClick={onClearLocation}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5, color: '#64748b', cursor: 'pointer',
              padding: '2px 10px', fontSize: 11,
            }}
          >
            ✕ Show all locations
          </button>
        </div>
      )}

      {/* ── Camera filter banner ── */}
      {showCameraBanner && (
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          marginBottom:   10,
          padding:        '7px 14px',
          background:     'rgba(59,130,246,0.08)',
          border:         '1px solid rgba(59,130,246,0.25)',
          borderRadius:   8,
          fontSize:       12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#93c5fd' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', display: 'inline-block', flexShrink: 0 }} />
            <span>Showing stats for camera <strong style={{ fontFamily: 'monospace' }}>{selectedCamera.id}</strong></span>
            {selectedCamera.name && (
              <span style={{ color: '#64748b' }}>— {selectedCamera.name}</span>
            )}
          </div>
          <button
            onClick={onClearCamera}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5, color: '#64748b', cursor: 'pointer',
              padding: '2px 10px', fontSize: 11,
            }}
          >
            ✕ Show all cameras
          </button>
        </div>
      )}

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
                  sub={getCardSub(c.id)}
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
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${CARDS.find(c => c.id === activeCard)?.colorKey || '#5a6a82'}`,
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
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
            background:   activeCard ? '#151f2e' : visibleAlerts.length > 0 ? '#1a0f0f' : '#0f1a14',
            border:       `1px solid ${activeCard ? 'rgba(255,255,255,0.08)' : visibleAlerts.length > 0 ? 'rgba(229,62,62,0.3)' : 'rgba(34,201,132,0.2)'}`,
            borderRadius: 14, padding: 18, height: 320, boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
          }}
        >
          {activeCard ? (
            <div key={activeCard} className="detail-panel-anim" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                  {CARDS.find(c => c.id === activeCard)?.icon}{' '}
                  {CARDS.find(c => c.id === activeCard)?.label}
                  {selectedLocation && (
                    <span style={{ color: '#a5b4fc', marginLeft: 6, fontSize: 10, fontWeight: 400 }}>· {selectedLocation.label}</span>
                  )}
                  {!selectedLocation && selectedCamera && (
                    <span style={{ color: '#93c5fd', marginLeft: 6, fontSize: 10, fontWeight: 400 }}>· {selectedCamera.id}</span>
                  )}
                  {' — Details'}
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
              selectedCamera={selectedCamera}
              selectedLocation={selectedLocation}
            />
          )}
        </div>

      </div>
    </>
  )
}
