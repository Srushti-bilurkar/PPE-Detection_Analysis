import { useState, useEffect, useRef, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

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

// ─── Bar row ──────────────────────────────────────────────────────────────────
function BarRow({ label, value, max, color, suffix = '', theme = 'dark' }) {
  const pct = Math.round((value / Math.max(max, 1)) * 100)
  const isDark = theme === 'dark'
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: isDark ? '#cbd5e1' : '#475569' }}>{label}</span>
        <span style={{ color, fontWeight: 700, fontFamily: 'monospace' }}>{value}{suffix}</span>
      </div>
      <div style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)', borderRadius: 3, height: 5 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ─── Aggregate multiple camera KPIs ──────────────────────────────────────────
function aggregateKpis(kpiList) {
  const valid = kpiList.filter(Boolean)
  if (!valid.length) return null
  const total_safe       = valid.reduce((s, k) => s + (k.total_safe       ?? 0), 0)
  const total_violations = valid.reduce((s, k) => s + (k.total_violations ?? 0), 0)
  const total_persons    = total_safe + total_violations
  const compliance_pct   = total_persons > 0 ? Math.round((total_safe / total_persons) * 1000) / 10 : null
  return { total_safe, total_violations, total_persons, compliance_pct }
}

// ─── Collect all cameras (including sub-locations) for a location ─────────────
function getAllCamerasForLocation(location) {
  if (!location) return []
  if (location.cameras) return location.cameras
  if (location.subLocations) return location.subLocations.flatMap(sub => sub.cameras || [])
  return []
}

// ─── Get unique db_ids for a location (deduped) ───────────────────────────────
function getUniqueDbIdsForLocation(location) {
  if (!location) return []
  const cameras = getAllCamerasForLocation(location)
  const seen = new Set()
  const unique = []
  for (const cam of cameras) {
    const dbId = cam.db_id || cam.id
    if (dbId && !seen.has(dbId)) {
      seen.add(dbId)
      unique.push(dbId)
    }
  }
  return unique
}

// ─── Chart Modal ──────────────────────────────────────────────────────────────
function CardChartModal({ card, data, onClose }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  const { trendData, displaySafe, displayViolated, displayCompliance, compliance } = data

  useEffect(() => {
    if (!chartRef.current || !trendData || trendData.length === 0) return
    if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }

    const ctx    = chartRef.current.getContext('2d')
    const labels = trendData.map(d => d.hour)

    let datasets = []
    let yLabel   = ''

    if (card.id === 'workers') {
      yLabel   = 'Safe workers'
      datasets = [{
        label:           'Safe Workers',
        data:            trendData.map(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0))),
        borderColor:     '#22c984',
        backgroundColor: 'rgba(34,201,132,0.12)',
        fill: true, tension: 0.4,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#22c984',
        borderWidth: 2.5,
      }]
    } else if (card.id === 'violations') {
      yLabel   = 'Violations'
      datasets = [{
        label:           'Violations',
        data:            trendData.map(d => d.violations || 0),
        borderColor:     '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.10)',
        fill: true, tension: 0.4,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#ef4444',
        borderWidth: 2.5,
        borderDash: [5, 3],
      }]
    } else if (card.id === 'compliance') {
      yLabel   = 'Compliance %'
      datasets = [{
        label:           'PPE Compliance %',
        data:            trendData.map(d => {
          const s = Math.max(0, (d.workers_active || 0) - (d.violations || 0))
          const t = d.workers_active || 0
          return t > 0 ? Math.round((s / t) * 100) : 0
        }),
        borderColor:     '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.10)',
        fill: true, tension: 0.4,
        pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: '#f59e0b',
        borderWidth: 2.5,
      }]
    } else if (card.id === 'ppe_violations') {
      yLabel   = 'PPE Violation %'
      datasets = [{
        label:           'PPE Violations %',
        data:            trendData.map(d => {
          const s = Math.max(0, (d.workers_active || 0) - (d.violations || 0))
          const t = d.workers_active || 0
          return t > 0 ? Math.round(((t - s) / t) * 100) : 0
        }),
        borderColor:     '#ef4444',
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
                const lbl  = items[0].label
                const hour = parseInt(lbl.split(':')[0])
                return `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '00')}:00`
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

  const peakStats = () => {
    if (!trendData || trendData.length === 0) return null
    if (card.id === 'workers') {
      const vals  = trendData.map(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0)))
      const peak  = Math.max(...vals)
      const peakH = trendData[vals.indexOf(peak)]?.hour || '--'
      const total = vals.reduce((a, b) => a + b, 0)
      return [
        { label: '👷 Peak Safe Workers', val: peak,            sub: `@ ${peakH}`, color: '#22c984' },
        { label: 'Total Safe (day)',      val: total,           color: '#22c984' },
        { label: '✗ Total Violated',      val: displayViolated, color: '#ef4444' },
      ]
    }
    if (card.id === 'violations') {
      const vals  = trendData.map(d => d.violations || 0)
      const peak  = Math.max(...vals)
      const peakH = trendData[vals.indexOf(peak)]?.hour || '--'
      const total = vals.reduce((a, b) => a + b, 0)
      return [
        { label: '🚨 Peak Violations', val: peak,        sub: `@ ${peakH}`, color: '#ef4444' },
        { label: 'Total Violations',   val: total,       color: '#ef4444' },
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
        { label: '⚠️ No Helmet', val: `${Math.round(100 - (compliance?.helmet || 0))}%`, color: '#ef4444' },
        { label: '⚠️ No Vest',   val: `${Math.round(100 - (compliance?.vest   || 0))}%`, color: '#f59e0b' },
        { label: 'Overall PPE Violations', val: displayCompliance !== null ? `${100 - displayCompliance}%` : '—', color: '#ef4444' },
      ]
    }
    return []
  }

  const stats = peakStats()

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)', zIndex: 900 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(820px, 92vw)', background: '#0c1220',
        border: `1px solid ${card.colorKey}44`, borderTop: `3px solid ${card.colorKey}`,
        borderRadius: 14, zIndex: 950, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        animation: 'modalPop 0.2s ease', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{card.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{card.label}</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>Hourly trend · Today</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', cursor: 'pointer', padding: '4px 12px', fontSize: 18, lineHeight: 1.2 }}>×</button>
        </div>
        {stats && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {stats.map((s, i) => (
              <div key={i} style={{ flex: 1, padding: '12px 20px', borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</span>
                  {s.sub && <span style={{ fontSize: 11, color: '#64748b' }}>{s.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
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

// ─── Detail panel content per card ───────────────────────────────────────────
function DetailContent({ cardId, data, theme = 'dark' }) { 
  const {
    todaySafe, todayViols, displayViolated, maxViolations, maxVHour, compliance,
    displaySafe, displayCompliance, cameraSafe, trendData, derivedSafe,
    selectedCamera, selectedLocation, locationKpi, camKpi, locationCameraKpis,
  } = data

  const resolvedKpi      = selectedLocation ? locationKpi : selectedCamera ? camKpi : null
  const scopeLabel       = selectedLocation?.label || selectedCamera?.id || null
  const workersSafeValue = resolvedKpi ? (resolvedKpi.total_safe ?? '—') : (derivedSafe ?? todaySafe)
  const violsValue       = resolvedKpi ? (resolvedKpi.total_violations ?? '—') : todayViols
  const isDark = theme === 'dark'
  const T = {
    text:    isDark ? '#e2e8f0' : '#0f172a',
    muted:   isDark ? '#94a3b8' : '#64748b',
    subtext: isDark ? '#cbd5e1' : '#334155',
    rowBg:   isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
  }

  if (cardId === 'workers') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: T.muted, marginBottom: 4 }}>
            {scopeLabel ? `WORKERS SAFE · ${scopeLabel}` : 'WORKERS SAFE ON-SITE'}
          </div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#22c984', lineHeight: 1 }}>{workersSafeValue}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <span style={{ color: '#22c984' }}>{workersSafeValue} safe</span>{' · '}
            <span style={{ color: '#ef4444' }}>{violsValue} violated</span>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>HOURLY TREND</div>
          <Sparkline data={(trendData || []).map(d => d.workers_active)} color="#22c984" height={50} />
          {(!trendData || trendData.length === 0) && (
            <div style={{ fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 8 }}>No hourly data available</div>
          )}
        </div>
        {selectedLocation && locationCameraKpis && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>
              CAMERA BREAKDOWN · {selectedLocation.label}
            </div>
            {locationCameraKpis.map(({ camera, kpi }) => (
              <div key={camera.db_id || camera.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, padding: '5px 8px', background: T.rowBg, borderRadius: 5 }}>
                <span style={{ color: T.subtext }}>📷 {camera.db_id || camera.id}</span>
                <span style={{ color: '#22c984', fontWeight: 700 }}>{kpi ? kpi.total_safe : '—'} safe</span>
              </div>
            ))}
          </div>
        )}
        {!selectedLocation && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>{scopeLabel ? 'CAMERA DETAIL' : 'ZONE / CAMERA'}</div>
            {(cameraSafe || []).filter(c => !scopeLabel || c.camera_id === scopeLabel).map(c => (
              <div key={c.camera_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, padding: '5px 8px', background: T.rowBg, borderRadius: 5 }}>
                <span style={{ color: T.subtext }}>📷 {c.camera_id}</span>
                <span style={{ color: '#22c984', fontWeight: 700 }}>{c.safe_count} safe</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (cardId === 'violations') {
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: T.muted, marginBottom: 4 }}>{scopeLabel ? `MAX VIOLATIONS · ${scopeLabel}` : 'MAX VIOLATIONS'}</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{maxViolations}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Peak @ {maxVHour}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>HOURLY VIOLATIONS</div>
          <Sparkline data={(trendData || []).map(d => d.violations)} color="#ef4444" height={50} />
        </div>
        {selectedLocation && locationCameraKpis && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 8 }}>
              CAMERA BREAKDOWN · {selectedLocation.label}
            </div>
            {locationCameraKpis.map(({ camera, kpi }) => (
              <div key={camera.db_id || camera.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, padding: '5px 8px', background: T.rowBg, borderRadius: 5 }}>
                <span style={{ color: T.subtext }}>📷 {camera.db_id || camera.id}</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>{kpi ? kpi.total_violations : '—'} violations</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ padding: '10px 12px', background: isDark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
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
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: T.muted, marginBottom: 4 }}>{scopeLabel ? `PPE COMPLIANCE · ${scopeLabel}` : 'PPE COMPLIANCE'}</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#f59e0b', lineHeight: 1 }}>
            {resolvedKpi?.compliance_pct != null ? `${resolvedKpi.compliance_pct}%` : displayCompliance !== null ? `${displayCompliance}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>{scopeLabel ? `${scopeLabel} · today` : 'Shift avg · All cameras'}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 10 }}>PPE ITEM COMPLIANCE</div>
          <BarRow label="Helmet" value={compliance?.helmet ?? 0} max={100} color="#4ade80" suffix="%" theme={theme} />
          <BarRow label="Vest"   value={compliance?.vest   ?? 0} max={100} color="#4ade80" suffix="%" theme={theme} />
        </div>
        <div>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 10 }}>VIOLATION BREAKDOWN</div>
          <BarRow label="No Helmet" value={Math.round(100 - (compliance?.helmet || 0))} max={100} color="#ef4444" suffix="%" theme={theme} />
          <BarRow label="No Vest"   value={Math.round(100 - (compliance?.vest   || 0))} max={100} color="#f59e0b" suffix="%" theme={theme} />
        </div>
      </div>
    )
  }

  if (cardId === 'ppe_violations') {
    const noHelmet = Math.round(100 - (compliance?.helmet || 0))
    const noVest   = Math.round(100 - (compliance?.vest   || 0))
    const compPct  = resolvedKpi?.compliance_pct != null ? resolvedKpi.compliance_pct : displayCompliance
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: T.muted, marginBottom: 4 }}>{scopeLabel ? `PPE VIOLATIONS · ${scopeLabel}` : 'PPE VIOLATIONS'}</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{compPct !== null ? `${100 - compPct}%` : '—'}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>Workers without full PPE</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: T.muted, marginBottom: 10 }}>VIOLATION TYPE</div>
          <BarRow label="No Helmet" value={noHelmet} max={100} color="#ef4444" suffix="%" theme={theme} />
          <BarRow label="No Vest"   value={noVest}   max={100} color="#f59e0b" suffix="%" theme={theme} />
        </div>
        <div style={{ padding: '10px 12px', background: isDark ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>SEVERITY</div>
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

// ─── Alerts panel content ─────────────────────────────────────────────────────
function AlertsPanelContent({ visibleAlerts = [], ackAlert, displayCompliance, selectedDate, trendData, selectedCamera, selectedLocation }) {
  const hasAlerts  = visibleAlerts.length > 0
  const now        = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const scopeLabel = selectedLocation?.label || selectedCamera?.id || null
 
  const HOURS = (trendData || []).map(d => {
    const [hStr] = (d.hour?.slice(0, 5) ?? '').split(':')
    const h = parseInt(hStr, 10)
    if (isNaN(h)) return d.hour?.slice(0, 5) ?? ''
    if (h === 0) return '12a'; if (h < 12) return `${h}a`; if (h === 12) return '12p'; return `${h - 12}p`
  })
  const heatCounts   = (trendData || []).map(d => d.violations ?? 0)
  const maxCount     = Math.max(...heatCounts, 1)
  const peakIdx      = heatCounts.indexOf(Math.max(...heatCounts))
  const getHeatColor = v => {
    if (v === 0) return 'rgba(255,255,255,0.04)'
    const r = v / maxCount
    if (r < 0.25) return 'rgba(239,68,68,0.20)'
    if (r < 0.50) return 'rgba(239,68,68,0.42)'
    if (r < 0.75) return 'rgba(239,68,68,0.65)'
    return '#ef4444'
  }
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
          🔔 Active Alerts{scopeLabel ? ` · ${scopeLabel}` : ''}
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>Last checked {now}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 44, fontWeight: 700, color: hasAlerts ? '#ef4444' : '#22c984', lineHeight: 1 }}>{visibleAlerts.length}</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasAlerts ? '#ef4444' : '#22c984', display: 'inline-block', marginRight: 8, animation: hasAlerts ? 'pulse 1.4s infinite' : 'none' }} />
            {hasAlerts ? 'unacknowledged' : 'All clear'}
          </div>
          <div style={{ fontSize: 10, color: hasAlerts ? '#ef4444' : '#22c984', marginTop: 3 }}>
            {hasAlerts ? '⚠ Click any alert to acknowledge' : `✓ No active alerts · ${scopeLabel ? scopeLabel + ' is safe' : 'site is safe'}`}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {hasAlerts ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {visibleAlerts.slice(0, 10).map(a => (
              <div key={a._id} onClick={() => ackAlert(a._id)} style={{ background: a.severity === 'critical' ? '#2a0f0f' : '#2a1f0a', borderLeft: `3px solid ${a.severity === 'critical' ? '#e53e3e' : '#f59e0b'}`, borderRadius: 5, padding: '7px 10px', cursor: 'pointer' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: a.severity === 'critical' ? '#fca5a5' : '#fcd34d', marginBottom: 2 }}>{a.severity?.toUpperCase()} — {a.type?.replace('_', ' ')}</div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>📹 {a.camera} · Worker {a.worker_id} · {new Date(a.timestamp).toLocaleTimeString()}</div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>tap to acknowledge</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'rgba(34,201,132,0.08)', border: '1px solid rgba(34,201,132,0.2)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 20 }}>✅</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#22c984' }}>{scopeLabel ? `${scopeLabel} is safe` : 'Site is fully safe'}</div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>No PPE violations · All workers compliant · {selectedDate}</div>
              </div>
            </div>
            {HOURS.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Hourly violation heatmap</div>
                  <div style={{ fontSize: 9, color: '#ef4444' }}>Peak: {HOURS[peakIdx]} · {heatCounts[peakIdx]} violations</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`, gap: 3, marginBottom: 4 }}>
                  {HOURS.map(h => <div key={h} style={{ fontSize: 8, color: '#94a3b8', textAlign: 'center' }}>{h}</div>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`, gap: 3 }}>
                  {heatCounts.map((v, i) => (
                    <div key={i} style={{ height: 26, borderRadius: 4, background: getHeatColor(v), border: i === peakIdx ? '1px solid rgba(239,68,68,0.7)' : '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {v > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: v / maxCount > 0.5 ? '#fff' : '#ef4444' }}>{v}</span>}
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


// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, subtitle, value, color, sub, cardId, onClick, isActive, compact,
  // scoped (location/camera-aware) values — already resolved by parent
  scopedSafe, scopedRisk, scopedTotal,
  scopedCompliance, scopedHelmet, scopedVest, scopedBothPpe,
  scopedViolations, scopedPeakTime, scopedTopCamera,
  // Card 4 trend values
  safetyImprovementPct, helmetDelta, vestDelta,
  // Card 1 extras
  activeCameras, currentShift,
  // Card 3 extras
  topViolationType,
  // Card 1 live streaming
  isStreaming, onLiveRefresh, liveRefreshing, liveLastUpdated,
  // NEW: auto-refresh countdown for card 1
  autoRefreshCountdown,
  // Theme
  theme = 'dark',
}) {
  const [hover, setHover] = useState(false)
  const isDark = theme === 'dark'

  // ── FIXED: Proper light/dark theme tokens ─────────────────────────────────
  const T = {
    cardBg:       isDark ? '#0d1828'                      : '#ffffff',
    cardBgHover:  isDark ? '#131d2e'                      : '#f8fafc',
    cardBgActive: isDark ? '#0f1f30'                      : '#f0f9ff',
    border:       isDark ? 'rgba(255,255,255,0.06)'       : 'rgba(0,0,0,0.10)',
    borderHover:  isDark ? 'rgba(255,255,255,0.13)'       : 'rgba(0,0,0,0.20)',
    // ── text tokens — dark bg needs light text; light bg needs dark text ──
    text:         isDark ? '#e2e8f0'                      : '#0f172a',
    muted:        isDark ? '#94a3b8'                      : '#475569',
    subtext:      isDark ? '#cbd5e1'                      : '#334155',
    rowDivider:   isDark ? 'rgba(255,255,255,0.05)'       : 'rgba(0,0,0,0.07)',
    liveBg:       isDark ? 'rgba(34,201,132,0.08)'        : 'rgba(34,201,132,0.10)',
    liveBorder:   isDark ? 'rgba(34,201,132,0.2)'         : 'rgba(34,201,132,0.35)',
    hint:         isDark ? '#475569'                      : '#94a3b8',
    labelBg:      isDark ? `${color}22`                   : `${color}18`,
    labelBorder:  isDark ? `${color}44`                   : `${color}55`,
    // Row label text — must be readable on both bg colors
    rowLabel:     isDark ? '#94a3b8'                      : '#374151',
    // Auto-refresh bar bg
    refreshBarBg: isDark ? 'rgba(255,255,255,0.04)'       : 'rgba(0,0,0,0.06)',
    refreshFill:  '#22c984',
  }

  // ── Per-card inline row data ───────────────────────────────────────────────
  const renderRows = () => {
    const rowStyle = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 0', borderBottom: `1px solid ${T.rowDivider}`,
      fontSize: compact ? 10 : 11,
    }
    const lbl = { color: T.rowLabel, fontWeight: 500 }
    const val = (c = color) => ({ color: c, fontWeight: 700, fontFamily: 'monospace', fontSize: compact ? 11 : 12 })

    // ── CARD 1: LIVE STATUS ───────────────────────────────────────────────────
    if (cardId === 'workers') {
      const safe    = scopedSafe  ?? '—'
      const risk    = scopedRisk  ?? '—'
      const total   = scopedTotal ?? '—'
      const cams    = activeCameras ?? '—'
      const shift   = currentShift  ?? '—'
      const safeLabel = total !== '—' ? `${safe} / ${total}` : `${safe}`
      return (
        <>
          {/* ── FIXED: Live streaming indicator with auto-refresh countdown ── */}
          {isStreaming && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8, padding: '5px 8px',
              background: T.liveBg, border: `1px solid ${T.liveBorder}`,
              borderRadius: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', background: '#22c984',
                  display: 'inline-block', flexShrink: 0,
                  animation: 'pulse 1.4s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 9, color: '#22c984', fontWeight: 700, letterSpacing: '0.08em' }}>
                  LIVE
                </span>
                {liveLastUpdated && (
                  <span style={{ fontSize: 9, color: T.muted, marginLeft: 4 }}>
                    {liveLastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
                {/* Auto-refresh countdown badge */}
                {autoRefreshCountdown != null && (
                  <span style={{
                    fontSize: 9, color: '#22c984', marginLeft: 6,
                    background: 'rgba(34,201,132,0.12)', border: '1px solid rgba(34,201,132,0.25)',
                    borderRadius: 4, padding: '1px 5px', fontWeight: 700, fontFamily: 'monospace',
                  }}>
                    {autoRefreshCountdown}s
                  </span>
                )}
              </div>
              <button
                onClick={e => { e.stopPropagation(); onLiveRefresh?.() }}
                disabled={liveRefreshing}
                title="Refresh live data"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: liveRefreshing ? 'rgba(34,201,132,0.05)' : 'rgba(34,201,132,0.12)',
                  border: '1px solid rgba(34,201,132,0.3)',
                  borderRadius: 5, color: '#22c984', cursor: liveRefreshing ? 'not-allowed' : 'pointer',
                  padding: '3px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  transition: 'background 0.15s', opacity: liveRefreshing ? 0.6 : 1,
                }}
              >
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ animation: liveRefreshing ? 'spin 0.8s linear infinite' : 'none' }}
                >
                  <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {liveRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          )}

          {/* ── FIXED: Auto-refresh progress bar (10s cycle) ── */}
          {isStreaming && autoRefreshCountdown != null && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                height: 3, borderRadius: 2,
                background: T.refreshBarBg,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${((10 - autoRefreshCountdown) / 10) * 100}%`,
                  background: 'linear-gradient(90deg, #22c984, #4ade80)',
                  borderRadius: 2,
                  transition: 'width 1s linear',
                }} />
              </div>
              <div style={{ fontSize: 8, color: T.muted, marginTop: 2, textAlign: 'right' }}>
                Auto-refresh in {autoRefreshCountdown}s
              </div>
            </div>
          )}

          <div style={rowStyle}><span style={lbl}>Workers Safe On-Site</span><span style={val('#22c984')}>{safeLabel}</span></div>
          <div style={rowStyle}><span style={lbl}>Workers Currently at Risk</span><span style={val('#ef4444')}>{risk}</span></div>
          {/* ── FIXED: Always show all 4 cameras when streaming ── */}
          <div style={rowStyle}><span style={lbl}>Active Cameras</span><span style={val('#38bdf8')}>{cams}</span></div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}><span style={lbl}>Current Shift</span><span style={val('#f59e0b')}>{shift}</span></div>
        </>
      )
    }

    // ── CARD 2: PPE COMPLIANCE ────────────────────────────────────────────────
    if (cardId === 'compliance') {
      // ── FIXED: Show actual values, never force 0% — fall back gracefully ──
      const overall = scopedCompliance != null ? `${scopedCompliance}%` : '—'
      const helmet  = scopedHelmet     != null ? `${scopedHelmet}%`     : '—'
      const vest    = scopedVest       != null ? `${scopedVest}%`       : '—'
      const full    = scopedBothPpe    != null ? `${scopedBothPpe}%`    : '—'
      return (
        <>
          <div style={rowStyle}><span style={lbl}>Overall PPE Compliance</span><span style={val('#f59e0b')}>{overall}</span></div>
          <div style={rowStyle}><span style={lbl}>Helmet Compliance</span><span style={val('#4ade80')}>{helmet}</span></div>
          <div style={rowStyle}><span style={lbl}>Vest Compliance</span><span style={val('#4ade80')}>{vest}</span></div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}><span style={lbl}>Full PPE Compliance</span><span style={val('#38bdf8')}>{full}</span></div>
        </>
      )
    }

    // ── CARD 3: RISK HOTSPOT ──────────────────────────────────────────────────
    if (cardId === 'violations') {
      // ── FIXED: topCamId now comes from cameraSafe sorted by violation_count desc ──
      const topCamId  = scopedTopCamera   ?? '—'
      const topCamLoc = topCamId !== '—' ? (DB_ID_TO_LOCATION[topCamId] ?? null) : null
      const peakTime  = scopedPeakTime    ?? '—'
      const topType   = topViolationType  ?? '—'
      const totalV    = scopedViolations  ?? '—'
      return (
        <>
          <div style={rowStyle}>
            <span style={lbl}>Highest Violation Camera</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
              <span style={{ ...val('#ef4444'), fontSize: compact ? 10 : 11, fontFamily: 'monospace', fontWeight: 700, color: '#ef4444' }}>{topCamId}</span>
              {topCamLoc && (
                <span style={{ fontSize: 9, color: T.muted, fontFamily: 'inherit', fontWeight: 500 }}>{topCamLoc}</span>
              )}
            </span>
          </div>
          <div style={rowStyle}><span style={lbl}>Peak Violation Time</span><span style={val('#f59e0b')}>{peakTime}</span></div>
          <div style={rowStyle}><span style={lbl}>Top Violation Type</span><span style={val('#fca5a5')}>{topType}</span></div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}><span style={lbl}>Total Violations Today</span><span style={val('#ef4444')}>{totalV}</span></div>
        </>
      )
    }

    // ── CARD 4: SAFETY TREND ─────────────────────────────────────────────────
    if (cardId === 'ppe_violations') {
      const hasImprovement = safetyImprovementPct !== null && safetyImprovementPct !== undefined
      const impColor = hasImprovement
        ? (safetyImprovementPct > 0 ? '#22c984' : safetyImprovementPct < 0 ? '#ef4444' : '#64748b')
        : '#64748b'
      const impArrow = hasImprovement
        ? (safetyImprovementPct > 0 ? '↑' : safetyImprovementPct < 0 ? '↓' : '→')
        : ''
      const impLabel = hasImprovement
        ? `${impArrow} ${Math.abs(safetyImprovementPct)}% vs Yesterday`
        : 'No prev-day data'

      const hasHelmetDelta = helmetDelta !== null && helmetDelta !== undefined
      const hDeltaStr = hasHelmetDelta
        ? `${helmetDelta >= 0 ? '+' : ''}${helmetDelta}%`
        : (scopedHelmet != null ? `${scopedHelmet}% today` : '—')
      const hColor = hasHelmetDelta
        ? (helmetDelta >= 0 ? '#22c984' : '#ef4444')
        : (scopedHelmet != null ? '#4ade80' : '#64748b')

      const hasVestDelta = vestDelta !== null && vestDelta !== undefined
      const vDeltaStr = hasVestDelta
        ? `${vestDelta >= 0 ? '+' : ''}${vestDelta}%`
        : (scopedVest != null ? `${scopedVest}% today` : '—')
      const vColor = hasVestDelta
        ? (vestDelta >= 0 ? '#22c984' : '#ef4444')
        : (scopedVest != null ? '#4ade80' : '#64748b')

      return (
        <>
          <div style={rowStyle}><span style={lbl}>Safety Improvement</span><span style={val(impColor)}>{impLabel}</span></div>
          <div style={rowStyle}><span style={lbl}>Helmet Compliance Change</span><span style={val(hColor)}>{hDeltaStr}</span></div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}><span style={lbl}>Vest Compliance Change</span><span style={val(vColor)}>{vDeltaStr}</span></div>
        </>
      )
    }

    return null
  }

  return (
    <div
      onClick={cardId === 'ppe_violations' ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        // ── FIXED: proper bg/border for light vs dark ──
        background:    isActive ? T.cardBgActive : hover ? T.cardBgHover : T.cardBg,
        border:        `1px solid ${isActive ? color : hover ? T.borderHover : T.border}`,
        borderLeft:    `3px solid ${color || '#5a6a82'}`,
        borderRadius:  10,
        padding:       compact ? '12px 14px' : '14px 16px',
        cursor:        cardId === 'ppe_violations' ? 'default' : 'pointer',
        transition:    'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        boxShadow:     hover && cardId !== 'ppe_violations' ? `0 4px 20px ${color}22` : 'none',
        position:      'relative',
        userSelect:    'none',
        minWidth:      0,
        boxSizing:     'border-box',
        height:        '100%',
        display:       'flex',
        flexDirection: 'column',
      }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          background:    T.labelBg,
          border:        `1px solid ${T.labelBorder}`,
          borderRadius:  6, padding: '3px 7px', fontSize: 10,
          color,         fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          {label}
        </span>
      </div>
      {/* Subtitle — FIXED: use T.text so it's dark on light bg, light on dark bg */}
      <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: T.text, marginBottom: 10, lineHeight: 1.3 }}>
        {subtitle}
      </div>
      {/* Rows */}
      <div style={{ flex: 1 }}>
        {renderRows()}
      </div>
      {/* click-for-chart hint — only for cards that open a modal */}
      {cardId !== 'ppe_violations' && (
        <div style={{ marginTop: 8, fontSize: 9, color: T.hint, textAlign: 'right', letterSpacing: '0.05em' }}>
          click for trend ↗
        </div>
      )}
    </div>
  )
}

// ─── CARDS CONFIG ─────────────────────────────────────────────────────────────
const CARDS = [
  { id: 'workers',        icon: '🟢', label: 'LIVE STATUS',       subtitle: 'Live Workforce Safety',  colorKey: '#22c984' },
  { id: 'compliance',     icon: '🦺', label: 'PPE COMPLIANCE',    subtitle: 'PPE Compliance Summary', colorKey: '#f59e0b' },
  { id: 'violations',     icon: '📍', label: 'RISK HOTSPOT',      subtitle: 'Risk Hotspot',           colorKey: '#ef4444' },
  { id: 'ppe_violations', icon: '📈', label: 'SAFETY TREND',      subtitle: 'Safety Trend & Insights',colorKey: '#22c984' },
]

// ── FIXED: DB_ID_TO_LOCATION maps camera db_id → human location label ─────────
const DB_ID_TO_LOCATION = {
  'Pier_Cap_Cam_16389': 'Bangalore',
  'Pier_Cap_Cam_16388': 'Hyderabad',
  'Pier_Cap_Cam_16387': 'Chennai · Location 1',
  'Pier_Cap_Cam_16386': 'Chennai · Location 2',
}

// All known cameras (used for streaming active camera count)
const ALL_KNOWN_CAMERAS = Object.keys(DB_ID_TO_LOCATION)
const TOTAL_CAMERA_COUNT = ALL_KNOWN_CAMERAS.length // always 4

const getCityLabel = (cameraId) => DB_ID_TO_LOCATION[cameraId] || cameraId

// ─── Main component ───────────────────────────────────────────────────────────
export default function StatCardsPanel({
  isLoading, todaySafe, todayViols, displaySafe, displayViolated, displayTotal,
  displayCompliance, maxViolations, maxVHour, compliance, safeWorkers7day,
  shiftSafe, cameraSafe, trendData, visibleAlerts, ackAlert, selectedDate,
  selectedCamera, onClearCamera,
  selectedLocation, onClearLocation,
  // NEW optional props for card 3 & 4 enrichment
  compliancePrevDay,   // { helmet, vest, overall } — yesterday's compliance values
  repeatViolators,     // number — workers who violated on multiple shifts/days
  isStreaming,         // boolean — true when live stream is active
  onRefreshLive,       // () => void — callback to re-fetch live data for card 1
  theme = 'dark',      // 'dark' | 'light' — controls card color scheme
}) {
  const [activeModal,        setActiveModal]        = useState(null)
  const [alertsOpen,         setAlertsOpen]         = useState(false)
  const [derivedSafe,        setDerivedSafe]        = useState(null)
  const [camKpi,             setCamKpi]             = useState(null)
  const [locationKpi,        setLocationKpi]        = useState(null)
  const [locationKpiLoading, setLocationKpiLoading] = useState(false)
  const [locationCameraKpis, setLocationCameraKpis] = useState([])
  const [globalKpi,          setGlobalKpi]          = useState(null)
  const [liveRefreshing,     setLiveRefreshing]     = useState(false)
  const [liveLastUpdated,    setLiveLastUpdated]    = useState(null)
  const [prevDayKpi,         setPrevDayKpi]         = useState(null)
  // ── NEW: auto-refresh countdown (10 seconds) ──────────────────────────────
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(10)
  const autoRefreshTimerRef = useRef(null)
  const autoRefreshCountRef = useRef(10)

  const cardsRowRef = useRef(null)
  const [cardsHeight, setCardsHeight] = useState(null)

  const alertCount = visibleAlerts?.length ?? 0

  // ── FIXED: Auto-refresh every 10 seconds when streaming is active ──────────
  const handleLiveRefresh = useCallback(async () => {
    if (liveRefreshing) return
    setLiveRefreshing(true)
    // Reset countdown
    autoRefreshCountRef.current = 10
    setAutoRefreshCountdown(10)
    try {
      if (typeof onRefreshLive === 'function') await onRefreshLive()
    } finally {
      setLiveRefreshing(false)
      setLiveLastUpdated(new Date())
    }
  }, [liveRefreshing, onRefreshLive])

  // ── Auto-refresh interval + countdown tick ─────────────────────────────────
  useEffect(() => {
    if (!isStreaming) {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current)
      return
    }
    // Reset on mount/streaming start
    autoRefreshCountRef.current = 10
    setAutoRefreshCountdown(10)

    autoRefreshTimerRef.current = setInterval(() => {
      autoRefreshCountRef.current -= 1
      setAutoRefreshCountdown(autoRefreshCountRef.current)
      if (autoRefreshCountRef.current <= 0) {
        autoRefreshCountRef.current = 10
        setAutoRefreshCountdown(10)
        // Fire refresh (non-blocking)
        if (typeof onRefreshLive === 'function') {
          setLiveRefreshing(true)
          Promise.resolve(onRefreshLive())
            .finally(() => {
              setLiveRefreshing(false)
              setLiveLastUpdated(new Date())
            })
        }
      }
    }, 1000)

    return () => { if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current) }
  }, [isStreaming, onRefreshLive])

  // ── Measure card row height ────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (cardsRowRef.current) setCardsHeight(cardsRowRef.current.offsetHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (cardsRowRef.current) ro.observe(cardsRowRef.current)
    return () => ro.disconnect()
  }, [alertsOpen, isLoading])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setActiveModal(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Fetch per-camera KPI when a single camera is selected ──────────────────
  useEffect(() => {
    if (!selectedDate || selectedLocation) return
    setCamKpi(null)
    const realId = selectedCamera?.db_id || selectedCamera?.id
    if (!realId) return
    fetch(`/api/kpi?date=${selectedDate}&camera=${encodeURIComponent(realId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setCamKpi(data))
      .catch(() => setCamKpi(null))
  }, [selectedDate, selectedCamera, selectedLocation])

  // ── Fetch & aggregate KPIs for a selected location (deduped by db_id) ──────
  useEffect(() => {
    if (!selectedDate || !selectedLocation) {
      setLocationKpi(null)
      setLocationCameraKpis([])
      return
    }
    const allCameras  = getAllCamerasForLocation(selectedLocation)
    const uniqueDbIds = getUniqueDbIdsForLocation(selectedLocation)
    if (!uniqueDbIds.length) {
      setLocationKpi(null)
      setLocationCameraKpis([])
      return
    }
    setLocationKpiLoading(true)
    setLocationKpi(null)
    setLocationCameraKpis([])
    Promise.all(
      uniqueDbIds.map(dbId =>
        fetch(`/api/kpi?date=${selectedDate}&camera=${encodeURIComponent(dbId)}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
          .then(kpi => ({ dbId, kpi }))
      )
    ).then(results => {
      const kpiByDbId = {}
      results.forEach(({ dbId, kpi }) => { kpiByDbId[dbId] = kpi })
      const cameraKpis = uniqueDbIds.map(dbId => ({
        camera: allCameras.find(c => (c.db_id || c.id) === dbId) || { id: dbId, db_id: dbId },
        kpi:    kpiByDbId[dbId] ?? null,
      }))
      setLocationCameraKpis(cameraKpis)
      setLocationKpi(aggregateKpis(cameraKpis.map(r => r.kpi)))
      setLocationKpiLoading(false)
    })
  }, [selectedDate, selectedLocation])

  // ── Fetch global KPI (no filter) ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedDate || selectedCamera || selectedLocation) return
    fetch(`/api/kpi?date=${selectedDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setGlobalKpi(data))
      .catch(() => setGlobalKpi(null))
  }, [selectedDate, selectedCamera, selectedLocation])

  // ── Fetch previous day KPI for Card 4 safety trend ─────────────────────────
  useEffect(() => {
    if (!selectedDate) return
    const prevDate = (() => {
      const d = new Date(selectedDate)
      d.setDate(d.getDate() - 1)
      return d.toISOString().split('T')[0]
    })()
    const camId = selectedCamera?.db_id || selectedCamera?.id
    const url   = camId
      ? `/api/kpi?date=${prevDate}&camera=${encodeURIComponent(camId)}`
      : `/api/kpi?date=${prevDate}`
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => setPrevDayKpi(data))
      .catch(() => setPrevDayKpi(null))
  }, [selectedDate, selectedCamera])

  // ── Derived safe count from hourly trend ───────────────────────────────────
  useEffect(() => {
    if (!selectedDate || selectedLocation) return
    setDerivedSafe(null)
    const realId   = selectedCamera?.db_id || selectedCamera?.id || ''
    const camParam = realId ? `&camera=${realId}` : ''
    fetch(`/api/hourly-trend?date=${selectedDate}&shift=both${camParam}`)
      .then(r => r.ok ? r.json() : [])
      .then(arr => setDerivedSafe(Array.isArray(arr) ? arr.reduce((s, d) => s + (d.workers_active || 0), 0) : 0))
      .catch(() => setDerivedSafe(0))
  }, [selectedDate, selectedCamera, selectedLocation])

  // ── Resolved KPI ──────────────────────────────────────────────────────────
  const resolvedKpi  = selectedLocation ? locationKpi : selectedCamera ? camKpi : null
  const isKpiLoading = selectedLocation ? locationKpiLoading : (!!selectedCamera && !camKpi)

  // ── Card value logic ───────────────────────────────────────────────────────
  const getCardValue = id => {
    if (isLoading || isKpiLoading) return '…'
    if (id === 'workers') {
      if (selectedLocation && locationKpi) return locationKpi.total_safe       ?? '—'
      if (selectedCamera   && camKpi)      return camKpi.total_safe            ?? '—'
      if (globalKpi)                       return globalKpi.total_safe         ?? todaySafe
      return todaySafe
    }
    if (id === 'violations') {
      if (selectedLocation && locationKpi) return locationKpi.total_violations ?? '—'
      if (selectedCamera   && camKpi)      return camKpi.total_violations      ?? '—'
      if (globalKpi)                       return globalKpi.total_violations   ?? displayViolated
      return displayViolated
    }
    if (id === 'compliance') {
      if (selectedLocation && locationKpi) return locationKpi.compliance_pct   != null ? `${locationKpi.compliance_pct}%`              : '—'
      if (selectedCamera   && camKpi)      return camKpi.compliance_pct        != null ? `${camKpi.compliance_pct}%`                   : '—'
      if (globalKpi?.compliance_pct       != null)                             return `${globalKpi.compliance_pct}%`
      return displayCompliance !== null ? `${displayCompliance}%` : '—'
    }
    if (id === 'ppe_violations') {
      if (selectedLocation && locationKpi) return locationKpi.compliance_pct   != null ? `${100 - locationKpi.compliance_pct}%`         : '—'
      if (selectedCamera   && camKpi)      return camKpi.compliance_pct        != null ? `${100 - camKpi.compliance_pct}%`              : '—'
      if (globalKpi?.compliance_pct       != null)                             return `${(100 - globalKpi.compliance_pct).toFixed(1)}%`
      return displayCompliance !== null ? `${100 - displayCompliance}%` : '—'
    }
    return '—'
  }

  // ── Shift helpers ──────────────────────────────────────────────────────────
  const bestShift      = shiftSafe ? Object.entries(shiftSafe).sort((a, b) => b[1] - a[1])[0]?.[0] || '--' : '--'
  const bestShiftCount = shiftSafe ? (shiftSafe[bestShift] ?? 0) : 0
  const shiftIcon      = s => s === 'morning' ? '🌅' : s === 'afternoon' ? '☀️' : '🌙'
  const shiftName      = s => s === 'morning' ? 'Morning' : s === 'afternoon' ? 'Day' : 'Night'

  // ── Peak safe hour ─────────────────────────────────────────────────────────
  const maxSafeVal = trendData ? Math.max(...trendData.map(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0))), 0) : 0
  const maxSHour   = trendData ? (trendData.find(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0)) === maxSafeVal)?.hour || '--') : '--'

  // ── 7-day trend helpers ────────────────────────────────────────────────────
  const yesterday        = safeWorkers7day?.slice(-2)?.[0]
  const today7           = safeWorkers7day?.slice(-1)?.[0]
  const trendVsYesterday = (yesterday && today7) ? today7.safe_count - yesterday.safe_count : null
  const violTrend        = (yesterday && today7) ? today7.violations - yesterday.violations  : null

  // ── Top / worst camera derived from cameraSafe ─────────────────────────────
  const topSafeEntry = cameraSafe?.length ? [...cameraSafe].sort((a, b) => b.safe_count - a.safe_count)[0] : null
  const topViolEntry = cameraSafe?.length ? [...cameraSafe].sort((a, b) => a.safe_count - b.safe_count)[0] : null
  const topSafeCity  = topSafeEntry ?? null
  const topViolCity  = topViolEntry ?? null

  // ── Peak values ───────────────────────────────────────────────────────────
  const peakSafeHourEntry = trendData?.find(d => Math.max(0, (d.workers_active || 0) - (d.violations || 0)) === maxSafeVal)
  const peakSafeCount     = peakSafeHourEntry ? Math.max(0, (peakSafeHourEntry.workers_active || 0) - (peakSafeHourEntry.violations || 0)) : null
  const peakViolHourEntry = trendData?.find(d => d.hour === maxVHour)
  const peakViolCount     = peakViolHourEntry ? (peakViolHourEntry.violations || 0) : null

  // ── vs-prev-day label helpers ──────────────────────────────────────────────
  const fmtDiff = (val, isGoodWhenPositive = true) => {
    if (val === null || val === undefined) return null
    const abs   = Math.abs(val)
    const up    = val > 0
    const arrow = up ? '↑' : val < 0 ? '↓' : '→'
    const color = val === 0 ? '#64748b' : (up === isGoodWhenPositive ? '#22c984' : '#ef4444')
    const label = val === 0 ? 'no data of prev day' : `${arrow} ${abs} vs previous day`
    return { label, color }
  }

  // ── Compliance day-over-day deltas ─────────────────────────────────────────
  const prevDaySource = compliancePrevDay ?? (prevDayKpi ? {
    helmet:  prevDayKpi.helmet_compliance  ?? prevDayKpi.compliance?.helmet  ?? null,
    vest:    prevDayKpi.vest_compliance    ?? prevDayKpi.compliance?.vest    ?? null,
    overall: prevDayKpi.compliance_pct     ?? prevDayKpi.compliance?.overall ?? null,
  } : null)
  const helmetToday  = compliance?.helmet ?? 0
  const vestToday    = compliance?.vest   ?? 0
  const helmetPrev   = prevDaySource?.helmet  ?? null
  const vestPrev     = prevDaySource?.vest    ?? null
  const overallPrev  = prevDaySource?.overall ?? null
  const overallToday = displayCompliance ?? (globalKpi?.compliance_pct ?? null)

  const helmetDelta  = (helmetPrev  !== null) ? Math.round(helmetToday  - helmetPrev)  : null
  const vestDelta    = (vestPrev    !== null) ? Math.round(vestToday    - vestPrev)    : null
  const overallDelta = (overallPrev !== null && overallToday !== null) ? Math.round(overallToday - overallPrev) : null

  // ── Both PPE ───────────────────────────────────────────────────────────────
  const bothPpePct = Math.min(helmetToday, vestToday)

  // ── Safety improvement for card 4 ─────────────────────────────────────────
  const safetyImprovementPct = overallDelta !== null ? overallDelta : null

  // ── Repeat violators ──────────────────────────────────────────────────────
  const repeatViolatorsCount = repeatViolators ?? 0

  // ── Card sub content ───────────────────────────────────────────────────────
  const getCardSub = id => {
    const scope   = selectedLocation?.label || selectedCamera?.name || selectedCamera?.id || null
    const loading = isKpiLoading

    if (scope) {
      if (loading) return 'Loading…'
      if (id === 'workers')        return scope
      if (id === 'violations')     return `${scope} · Peak @ ${maxVHour}`
      if (id === 'compliance')     return `${scope} · today`
      if (id === 'ppe_violations') return `${scope} · without full PPE`
      return ''
    }

    const isDarkSub  = theme === 'dark'
    const s9 = { fontSize: 10, color: isDarkSub ? '#64748b' : '#94a3b8' }
    const textColor  = isDarkSub ? '#e2e8f0' : '#0f172a'
    const mutedColor = isDarkSub ? '#64748b'  : '#94a3b8'

    if (id === 'workers') {
      const diff = fmtDiff(trendVsYesterday, true)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={s9}>
            {shiftIcon(bestShift)} Best shift:{' '}
            <span style={{ color: '#22c984', fontWeight: 600 }}>{shiftName(bestShift)}</span>
            {' · '}
            <span style={{ color: textColor, fontWeight: 700 }}>{bestShiftCount}</span>
            <span style={{ color: mutedColor }}> safe</span>
          </span>
          {diff && (
            <span style={{ ...s9, color: diff.color }}>{diff.label}</span>
          )}
        </div>
      )
    }

    if (id === 'violations') {
      const diff = fmtDiff(violTrend, false)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={s9}>
            ⛑️ No Helmet:{' '}
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{Math.round(100 - (compliance?.helmet || 0))}%</span>
            {'  '}
            🦺 No Vest:{' '}
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{Math.round(100 - (compliance?.vest || 0))}%</span>
          </span>
          {diff && (
            <span style={{ ...s9, color: diff.color }}>{diff.label}</span>
          )}
        </div>
      )
    }

    if (id === 'compliance') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={s9}>
            Overall PPE Compliance:{' '}
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
              {overallToday !== null ? `${overallToday}%` : '—'}
            </span>
          </span>
          <span style={s9}>
            ⛑️ Helmet:{' '}
            <span style={{ color: '#4ade80', fontWeight: 600 }}>{helmetToday}%</span>
          </span>
          <span style={s9}>
            🦺 Vest:{' '}
            <span style={{ color: '#4ade80', fontWeight: 600 }}>{vestToday}%</span>
          </span>
          <span style={s9}>
            🔵 Both PPE:{' '}
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{bothPpePct}%</span>
          </span>
        </div>
      )
    }

    if (id === 'ppe_violations') {
      const safetyColor = safetyImprovementPct === null ? '#64748b'
        : safetyImprovementPct > 0 ? '#22c984'
        : safetyImprovementPct < 0 ? '#ef4444'
        : '#64748b'
      const safetyArrow = safetyImprovementPct === null ? '' : safetyImprovementPct > 0 ? '↑' : safetyImprovementPct < 0 ? '↓' : '→'

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ ...s9, color: safetyColor, fontWeight: 600 }}>
            {safetyImprovementPct !== null
              ? `Safety Improvement: ${safetyArrow} ${Math.abs(safetyImprovementPct)}% vs Yesterday`
              : 'Safety Improvement: — vs Yesterday'
            }
          </span>
          <span style={s9}>
            ⛑️ Helmet Change:{' '}
            {helmetDelta !== null
              ? <span style={{ color: helmetDelta >= 0 ? '#22c984' : '#ef4444', fontWeight: 600 }}>
                  {helmetDelta >= 0 ? '+' : ''}{helmetDelta}%
                </span>
              : <span style={{ color: '#64748b' }}>—</span>
            }
          </span>
          <span style={s9}>
            🦺 Vest Change:{' '}
            {vestDelta !== null
              ? <span style={{ color: vestDelta >= 0 ? '#22c984' : '#ef4444', fontWeight: 600 }}>
                  {vestDelta >= 0 ? '+' : ''}{vestDelta}%
                </span>
              : <span style={{ color: '#64748b' }}>—</span>
            }
          </span>
          <span style={s9}>
            🔁 Repeat Violators:{' '}
            <span style={{ color: repeatViolatorsCount > 0 ? '#f59e0b' : '#22c984', fontWeight: 600 }}>
              {repeatViolatorsCount}
            </span>
          </span>
        </div>
      )
    }

    return ''
  }

  const handleCardClick = id => setActiveModal(id)
  const activeModalCard = CARDS.find(c => c.id === activeModal)
  const modalData       = { trendData, displaySafe, displayViolated, displayCompliance, compliance }

  // ── FIXED: Compute top-violation camera from cameraSafe by violation_count ─
  // Uses violation_count field first, falls back to inverse of safe_count
  const computeTopViolCam = () => {
    if (!cameraSafe?.length) return null
    return [...cameraSafe].sort((a, b) => {
      const aV = a.violation_count ?? a.violations ?? 0
      const bV = b.violation_count ?? b.violations ?? 0
      if (bV !== aV) return bV - aV
      // tie-break: fewest safe = most at risk
      return (a.safe_count ?? 0) - (b.safe_count ?? 0)
    })[0]
  }

  return (
    <>
      <style>{`
        @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes spin        { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes tabPulse    {
          0%,100%{ box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.3), inset -1px 0 0 rgba(0,0,0,0.15), 3px 3px 0 #7f1d1d, 0 0 0 rgba(239,68,68,0) }
          50%{     box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.3), inset -1px 0 0 rgba(0,0,0,0.15), 3px 3px 0 #7f1d1d, 0 0 24px rgba(239,68,68,0.6) }
        }
        @keyframes bounceRight { 0%,100%{transform:translateX(0)} 50%{transform:translateX(4px)} }
        @keyframes modalPop    { from{opacity:0;transform:translate(-50%,-47%) scale(0.96)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
      `}</style>

      {activeModal && activeModalCard && (
        <CardChartModal card={activeModalCard} data={modalData} onClose={() => setActiveModal(null)} />
      )}
      {!selectedLocation && selectedCamera && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10, padding: '7px 14px',
          background: theme === 'dark' ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.10)',
          border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme === 'dark' ? '#93c5fd' : '#1d4ed8' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', display: 'inline-block', flexShrink: 0 }} />
            <span>Showing stats for camera <strong style={{ fontFamily: 'monospace' }}>{selectedCamera.id}</strong></span>
            {selectedCamera.name && <span style={{ color: theme === 'dark' ? '#64748b' : '#94a3b8' }}>— {selectedCamera.name}</span>}
          </div>
          <button onClick={onClearCamera} style={{
            background: 'none',
            border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)'}`,
            borderRadius: 5, color: theme === 'dark' ? '#64748b' : '#475569',
            cursor: 'pointer', padding: '2px 10px', fontSize: 11,
          }}>✕ Show all cameras</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 0, marginBottom: 16, width: '100%' }}>

        <div
          ref={cardsRowRef}
          style={{
            flex:       alertsOpen ? '0 0 calc(50% - 28px)' : '1 1 100%',
            width:      alertsOpen ? 'calc(50% - 28px)' : '100%',
            minWidth:   0,
            overflow:   'hidden',
            transition: 'flex 0.42s cubic-bezier(0.4,0,0.2,1), width 0.42s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div style={{
            display:             'grid',
            gridTemplateColumns: alertsOpen ? '1fr 1fr' : 'repeat(4, 1fr)',
            gap:                 10,
            alignItems:          'stretch',
            transition:          'grid-template-columns 0.42s cubic-bezier(0.4,0,0.2,1)',
          }}>
            {CARDS.map(c => {
              // ── Resolve scoped values (location > camera > global) ───────────
              const scopedSafe = (() => {
                if (selectedLocation && locationKpi) return locationKpi.total_safe ?? '—'
                if (selectedCamera   && camKpi)      return camKpi.total_safe      ?? '—'
                if (globalKpi)                       return globalKpi.total_safe   ?? todaySafe
                return todaySafe
              })()
              const scopedRisk = (() => {
                if (selectedLocation && locationKpi) return locationKpi.total_violations ?? '—'
                if (selectedCamera   && camKpi)      return camKpi.total_violations      ?? '—'
                if (globalKpi)                       return globalKpi.total_violations   ?? displayViolated
                return displayViolated
              })()
              const scopedTotal = (typeof scopedSafe === 'number' && typeof scopedRisk === 'number')
                ? scopedSafe + scopedRisk : '—'

              // ── FIXED: Compliance from resolved KPI, not forced 0% ──────────
              const resolvedCompliancePct = (() => {
                if (selectedLocation && locationKpi?.compliance_pct != null) return locationKpi.compliance_pct
                if (selectedCamera   && camKpi?.compliance_pct      != null) return camKpi.compliance_pct
                if (globalKpi?.compliance_pct                       != null) return globalKpi.compliance_pct
                return displayCompliance
              })()
              const scopedCompliance = resolvedCompliancePct
              // ── FIXED: helmet/vest from compliance prop; never default 0 ────
              const scopedHelmet  = compliance?.helmet ?? null
              const scopedVest    = compliance?.vest   ?? null
              const scopedBothPpe = (scopedHelmet != null && scopedVest != null)
                ? Math.min(scopedHelmet, scopedVest) : null

              // ── FIXED: Card 3 — top violation camera by violation_count ──────
              const topViolCamEntry = computeTopViolCam()
              // Prefer violation_count; if not present sort by lowest safe (most at risk)
              const topViolCamName  = topViolCamEntry?.camera_id ?? topViolCamEntry?.camera ?? null

              // When a specific camera/location is selected, show that camera
              const scopedTopCamera = selectedCamera?.db_id || selectedCamera?.id
                || (selectedLocation ? topViolCamName : topViolCamName)
                || '—'

              const scopedViolations = (() => {
                if (selectedLocation && locationKpi) return locationKpi.total_violations ?? maxViolations
                if (selectedCamera   && camKpi)      return camKpi.total_violations      ?? maxViolations
                if (globalKpi)                       return globalKpi.total_violations   ?? maxViolations
                return maxViolations
              })()

              const scopedPeakTime = (() => {
                if (!trendData?.length || !maxVHour) return '—'
                try {
                  const h = parseInt(maxVHour.split(':')[0])
                  const fmt = n => `${n % 12 === 0 ? 12 : n % 12} ${n < 12 ? 'AM' : 'PM'}`
                  return `${fmt(h)} – ${fmt(h + 2)}`
                } catch { return maxVHour }
              })()

              const topViolationType = (() => {
                const h = compliance?.helmet ?? 100
                const v = compliance?.vest   ?? 100
                if (h === 100 && v === 100) return '—'
                return h <= v ? 'Missing Helmet' : 'Missing Vest'
              })()

              // ── FIXED: Active cameras — always 4 when streaming; else from data ──
              const resolvedActiveCameras = isStreaming
                ? TOTAL_CAMERA_COUNT
                : (cameraSafe?.length
                    ? cameraSafe.length
                    : (trendData
                        ? new Set(trendData.map(d => d.camera_id).filter(Boolean)).size || TOTAL_CAMERA_COUNT
                        : TOTAL_CAMERA_COUNT))

              return (
                <StatCard
                  key={c.id}
                  icon={c.icon}
                  label={c.label}
                  subtitle={c.subtitle}
                  value={getCardValue(c.id)}
                  color={c.colorKey}
                  sub={getCardSub(c.id)}
                  cardId={c.id}
                  isActive={false}
                  compact={alertsOpen}
                  onClick={() => handleCardClick(c.id)}
                  // scoped row data
                  scopedSafe={scopedSafe}
                  scopedRisk={scopedRisk}
                  scopedTotal={scopedTotal}
                  scopedCompliance={scopedCompliance}
                  scopedHelmet={scopedHelmet}
                  scopedVest={scopedVest}
                  scopedBothPpe={scopedBothPpe}
                  scopedViolations={scopedViolations}
                  scopedTopCamera={scopedTopCamera}
                  scopedPeakTime={scopedPeakTime}
                  topViolationType={topViolationType}
                  // Card 4 deltas
                  safetyImprovementPct={safetyImprovementPct}
                  helmetDelta={helmetDelta}
                  vestDelta={vestDelta}
                  // Card 1 extras — FIXED: always 4 cameras when streaming
                  activeCameras={resolvedActiveCameras}
                  currentShift={shiftName(bestShift)}
                  // Card 1 live streaming + auto-refresh
                  isStreaming={isStreaming}
                  onLiveRefresh={handleLiveRefresh}
                  liveRefreshing={liveRefreshing}
                  liveLastUpdated={liveLastUpdated}
                  autoRefreshCountdown={isStreaming ? autoRefreshCountdown : null}
                  theme={theme}
                />
              )
            })}
          </div>
        </div>

        {/* Alerts toggle tab */}
        <div
          onClick={() => setAlertsOpen(p => !p)}
          title={`${alertCount} alert${alertCount !== 1 ? 's' : ''} — click to ${alertsOpen ? 'close' : 'view'}`}
          style={{
            flexShrink:     0,
            width:          48,
            height:         cardsHeight ? `${cardsHeight}px` : 120,
            minHeight:      80,
            marginLeft:     0,
            marginRight:    alertsOpen ? 8 : 0,
            cursor:         'pointer',
            userSelect:     'none',
            position:       'relative',
            zIndex:         10,
            borderRadius:   '0 10px 10px 0',
            background:     alertCount > 0
              ? 'linear-gradient(180deg,#f87171 0%,#ef4444 50%,#dc2626 100%)'
              : 'linear-gradient(180deg,#4ade80 0%,#22c55e 50%,#16a34a 100%)',
            boxShadow:      alertsOpen
              ? `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.35), inset -1px 0 0 rgba(0,0,0,0.2), 1px 1px 0 ${alertCount > 0 ? '#7f1d1d' : '#14532d'}`
              : alertCount > 0
                ? 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.3), inset -1px 0 0 rgba(0,0,0,0.15), 3px 3px 0 #7f1d1d'
                : 'inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.3), inset -1px 0 0 rgba(0,0,0,0.18), 3px 3px 0 #14532d',
            border:         `1px solid ${alertCount > 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.15)'}`,
            borderLeft:     'none',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '18px 0',
            boxSizing:      'border-box',
            transform:      alertsOpen ? 'translate(2px, 2px)' : 'none',
            transition:     'transform 0.12s, box-shadow 0.12s, margin 0.42s',
            animation:      (!alertsOpen && alertCount > 0) ? 'tabPulse 2.2s ease-in-out infinite' : 'none',
          }}
        >
          {alertCount > 0 && !alertsOpen && (
            <div style={{
              position: 'absolute', top: -10, right: -10,
              width: 23, height: 23, borderRadius: '50%',
              background: '#fbbf24', color: '#1a0a00',
              fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2.5px solid #080d18',
              boxShadow: '0 2px 10px rgba(251,191,36,0.6)',
              zIndex: 20,
            }}>
              {alertCount > 9 ? '9+' : alertCount}
            </div>
          )}
          <span style={{
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            fontSize: 15, fontWeight: 900, letterSpacing: '0.28em',
            color: '#fff', textTransform: 'uppercase',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            lineHeight: 1, flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            ALERTS
          </span>
          <svg
            width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform:    alertsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition:   'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
              filter:       'drop-shadow(0 1px 4px rgba(0,0,0,0.5))',
              flexShrink:   0, marginBottom: 2,
              animation:    !alertsOpen ? 'bounceRight 1.6s ease-in-out infinite' : 'none',
            }}
          >
            <polyline points="13 17 8 12 13 7" />
            <polyline points="19 17 14 12 19 7" />
          </svg>
        </div>

        {/* Alerts panel */}
        <div style={{
          flex:          alertsOpen ? '0 0 calc(50% - 28px)' : '0 0 0px',
          width:         alertsOpen ? 'calc(50% - 28px)' : '0px',
          maxWidth:      alertsOpen ? 'calc(50% - 28px)' : '0px',
          overflow:      'hidden',
          transition:    'flex 0.42s cubic-bezier(0.4,0,0.2,1), width 0.42s cubic-bezier(0.4,0,0.2,1), max-width 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease',
          opacity:       alertsOpen ? 1 : 0,
          minWidth:      0,
          alignSelf:     'flex-start',
          pointerEvents: alertsOpen ? 'auto' : 'none',
        }}>
          <div style={{
            background:    theme === 'dark'
              ? (alertCount > 0 ? '#1a0f0f' : '#0d1a12')
              : (alertCount > 0 ? '#fff5f5' : '#f0fdf4'),
            border:        `1px solid ${alertCount > 0 ? 'rgba(229,62,62,0.3)' : 'rgba(34,201,132,0.2)'}`,
            borderRadius:  14, padding: '16px 18px',
            boxSizing:     'border-box',
            display:       'flex', flexDirection: 'column',
            overflow:      'hidden', width: '100%',
            minHeight:     cardsHeight ? `${cardsHeight}px` : 120,
            height:        cardsHeight ? `${cardsHeight}px` : 'auto',
          }}>
            <AlertsPanelContent
              visibleAlerts={visibleAlerts}
              ackAlert={ackAlert}
              displayCompliance={displayCompliance}
              selectedDate={selectedDate}
              trendData={trendData}
              selectedCamera={selectedCamera}
              selectedLocation={selectedLocation}
            />
          </div>
        </div>

      </div>
    </>
  )
}