import { useState, useEffect, useRef } from 'react'
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

function getAllCamerasForLocation(location) {
  if (!location) return []
  if (location.cameras) return location.cameras
  if (location.subLocations) return location.subLocations.flatMap(sub => sub.cameras || [])
  return []
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
                return `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00`
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
        { label: '👷 Peak Safe Workers', val: peak,           sub: `@ ${peakH}`, color: '#22c984' },
        { label: 'Total Safe (day)',      val: total,          color: '#22c984' },
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
function DetailContent({ cardId, data }) {
  const {
    todaySafe, todayViols, displayViolated, maxViolations, maxVHour, compliance,
    displaySafe, displayCompliance, cameraSafe, trendData, derivedSafe,
    selectedCamera, selectedLocation, locationKpi, camKpi, locationCameraKpis,
  } = data

  const resolvedKpi      = selectedLocation ? locationKpi : selectedCamera ? camKpi : null
  const scopeLabel       = selectedLocation?.label || selectedCamera?.id || null
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
            <span style={{ color: '#22c984' }}>{workersSafeValue} safe</span>{' · '}
            <span style={{ color: '#ef4444' }}>{violsValue} violated</span>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>HOURLY TREND</div>
          <Sparkline data={(trendData || []).map(d => d.workers_active)} color="#22c984" height={50} />
          {(!trendData || trendData.length === 0) && (
            <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 8 }}>No hourly data available</div>
          )}
        </div>
        {selectedLocation && locationCameraKpis && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>CAMERA BREAKDOWN · {selectedLocation.label}</div>
            {locationCameraKpis.map(({ camera, kpi }) => (
              <div key={camera.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }}>
                <span style={{ color: '#cbd5e1' }}>📷 {camera.id}</span>
                <span style={{ color: '#22c984', fontWeight: 700 }}>{kpi ? kpi.total_safe : '—'} safe</span>
              </div>
            ))}
          </div>
        )}
        {!selectedLocation && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>{scopeLabel ? 'CAMERA DETAIL' : 'ZONE / CAMERA'}</div>
            {(cameraSafe || []).filter(c => !scopeLabel || c.camera_id === scopeLabel).map(c => (
              <div key={c.camera_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }}>
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
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>{scopeLabel ? `MAX VIOLATIONS · ${scopeLabel}` : 'MAX VIOLATIONS'}</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{maxViolations}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Peak @ {maxVHour}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>HOURLY VIOLATIONS</div>
          <Sparkline data={(trendData || []).map(d => d.violations)} color="#ef4444" height={50} />
        </div>
        {selectedLocation && locationCameraKpis && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 8 }}>CAMERA BREAKDOWN · {selectedLocation.label}</div>
            {locationCameraKpis.map(({ camera, kpi }) => (
              <div key={camera.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6, padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 5 }}>
                <span style={{ color: '#cbd5e1' }}>📷 {camera.id}</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>{kpi ? kpi.total_violations : '—'} violations</span>
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
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>{scopeLabel ? `PPE COMPLIANCE · ${scopeLabel}` : 'PPE COMPLIANCE'}</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#f59e0b', lineHeight: 1 }}>
            {resolvedKpi?.compliance_pct != null ? `${resolvedKpi.compliance_pct}%` : displayCompliance !== null ? `${displayCompliance}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{scopeLabel ? `${scopeLabel} · today` : 'Shift avg · All cameras'}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 10 }}>PPE ITEM COMPLIANCE</div>
          <BarRow label="Helmet" value={compliance?.helmet ?? 0} max={100} color="#4ade80" suffix="%" />
          <BarRow label="Vest"   value={compliance?.vest   ?? 0} max={100} color="#4ade80" suffix="%" />
        </div>
        <div>
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
    const compPct  = resolvedKpi?.compliance_pct != null ? resolvedKpi.compliance_pct : displayCompliance
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 4 }}>{scopeLabel ? `PPE VIOLATIONS · ${scopeLabel}` : 'PPE VIOLATIONS'}</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#ef4444', lineHeight: 1 }}>{compPct !== null ? `${100 - compPct}%` : '—'}</div>
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
  const heatCounts = (trendData || []).map(d => d.violations ?? 0)
  const maxCount   = Math.max(...heatCounts, 1)
  const peakIdx    = heatCounts.indexOf(Math.max(...heatCounts))
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
function StatCard({ icon, label, value, color, sub, onClick, isActive, compact }) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background:   isActive ? '#1a2a3a' : hover ? '#1e2d45' : '#151f2e',
        border:       `1px solid ${isActive ? color : hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        borderTop:    `3px solid ${color || '#5a6a82'}`,
        borderRadius: 12,
        padding:      compact ? '14px 16px' : '16px 18px',
        cursor:       'pointer',
        transition:   'background 0.15s, border-color 0.15s, transform 0.12s',
        transform:    hover ? 'translateY(-1px)' : 'none',
        position:     'relative',
        userSelect:   'none',
        flex:         1,
        minWidth:     0,
        boxSizing:    'border-box',
        height:       '100%',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left: Icon + Label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 34, flexShrink: 0 }}>{icon}</div>
          
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.25 }}>
            {label}
          </div>
        </div>

        {/* Right Corner: Big Value */}
        <div style={{ 
          fontSize: 44, 
          fontWeight: 700, 
          color: color || '#e2e8f0', 
          lineHeight: 1,
          marginTop: -6
        }}>
          {value}
        </div>
      </div>

      {/* Sub Info */}
      {sub && (
        <div style={{ marginTop: 12 }}>
          {typeof sub === 'string' 
            ? <div style={{ fontSize: 9.5, color: '#94a3b8', lineHeight: 1.3 }}>{sub}</div>
            : sub
          }
        </div>
      )}
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function StatCardsPanel({
  isLoading, todaySafe, todayViols, displaySafe, displayViolated, displayTotal,
  displayCompliance, maxViolations, maxVHour, compliance, safeWorkers7day,
  shiftSafe, cameraSafe, trendData, visibleAlerts, ackAlert, selectedDate,
  selectedCamera, onClearCamera,
  selectedLocation, onClearLocation,
}) {
  const [activeModal,        setActiveModal]        = useState(null)
  const [alertsOpen,         setAlertsOpen]         = useState(false)
  const [derivedSafe,        setDerivedSafe]        = useState(null)
  const [camKpi,             setCamKpi]             = useState(null)
  const [locationKpi,        setLocationKpi]        = useState(null)
  const [locationKpiLoading, setLocationKpiLoading] = useState(false)
  const [locationCameraKpis, setLocationCameraKpis] = useState([])

  // Ref to measure the cards row height so we can match the alerts button exactly
  const cardsRowRef = useRef(null)
  const [cardsHeight, setCardsHeight] = useState(null)

  const alertCount = visibleAlerts?.length ?? 0

  // Measure card row height after render / on resize
  useEffect(() => {
    const measure = () => {
      if (cardsRowRef.current) {
        setCardsHeight(cardsRowRef.current.offsetHeight)
      }
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

  useEffect(() => {
    if (!selectedDate || selectedLocation) return
    setCamKpi(null)
    const realId = selectedCamera?.db_id || selectedCamera?.id
    if (!realId) return
    fetch(`/api/kpi?date=${selectedDate}&camera=${encodeURIComponent(realId)}`)
      .then(r => r.ok ? r.json() : null).then(setCamKpi).catch(() => setCamKpi(null))
  }, [selectedDate, selectedCamera, selectedLocation])

  useEffect(() => {
    if (!selectedDate || !selectedLocation) { setLocationKpi(null); setLocationCameraKpis([]); return }
    const cameras = getAllCamerasForLocation(selectedLocation)
    if (!cameras.length) { setLocationKpi(null); setLocationCameraKpis([]); return }
    setLocationKpiLoading(true)
    Promise.all(cameras.map(camera => {
      const realId = camera.db_id || camera.id
      return fetch(`/api/kpi?date=${selectedDate}&camera=${encodeURIComponent(realId)}`)
        .then(r => r.ok ? r.json() : null).then(kpi => ({ camera, kpi })).catch(() => ({ camera, kpi: null }))
    })).then(results => {
      setLocationCameraKpis(results)
      setLocationKpi(aggregateKpis(results.map(r => r.kpi)))
      setLocationKpiLoading(false)
    })
  }, [selectedDate, selectedLocation])

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

  const resolvedKpi  = selectedLocation ? locationKpi : selectedCamera ? camKpi : null
  const isKpiLoading = selectedLocation ? locationKpiLoading : (selectedCamera && !camKpi)

  const getCardValue = id => {
    if (isLoading || isKpiLoading) return '…'
    if (id === 'workers')        return resolvedKpi ? (resolvedKpi.total_safe ?? '—') : (derivedSafe ?? todaySafe)
    if (id === 'violations')     return resolvedKpi ? (resolvedKpi.total_violations ?? '—') : displayViolated
    if (id === 'compliance')     return resolvedKpi ? (resolvedKpi.compliance_pct != null ? `${resolvedKpi.compliance_pct}%` : '—') : (displayCompliance !== null ? `${displayCompliance}%` : '—')
    if (id === 'ppe_violations') return resolvedKpi ? (resolvedKpi.compliance_pct != null ? `${100 - resolvedKpi.compliance_pct}%` : '—') : (displayCompliance !== null ? `${100 - displayCompliance}%` : '—')
    return '—'
  }

  const bestShift        = shiftSafe ? Object.entries(shiftSafe).sort((a, b) => b[1] - a[1])[0]?.[0] || '--' : '--'
  const yesterday        = safeWorkers7day?.slice(-2)?.[0]
  const today7           = safeWorkers7day?.slice(-1)?.[0]
  const trendVsYesterday = (yesterday && today7) ? today7.safe_count - yesterday.safe_count : null
  const violTrend        = (yesterday && today7) ? today7.violations - yesterday.violations   : null
  const shiftLabel       = s => s === 'morning' ? '🌅 Morning' : s === 'afternoon' ? '☀️ Day' : '🌙 Night'

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
    const s9 = { fontSize: 10, color: '#64748b' }
    if (id === 'workers') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...s9, color: '#94a3b8' }}>{selectedDate}</span>
        <span style={s9}>Best shift: <span style={{ color: '#22c984', fontWeight: 600 }}>{shiftLabel(bestShift)}</span></span>
        {trendVsYesterday !== null && (
          <span style={{ ...s9, color: trendVsYesterday >= 0 ? '#22c984' : '#ef4444' }}>
            {trendVsYesterday >= 0 ? '↑' : '↓'} {Math.abs(trendVsYesterday)} vs yesterday
          </span>
        )}
      </div>
    )
    if (id === 'violations') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...s9, color: '#94a3b8' }}>Peak @ {maxVHour}</span>
        <span style={s9}>
          ⛑️ No Helmet: <span style={{ color: '#ef4444', fontWeight: 600 }}>{Math.round(100 - (compliance?.helmet || 0))}%</span>
          {'  '}🦺 No Vest: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{Math.round(100 - (compliance?.vest || 0))}%</span>
        </span>
        {violTrend !== null && (
          <span style={{ ...s9, color: violTrend <= 0 ? '#22c984' : '#ef4444' }}>
            {violTrend <= 0 ? '↓' : '↑'} {Math.abs(violTrend)} vs yesterday
          </span>
        )}
      </div>
    )
    if (id === 'compliance') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...s9, color: '#94a3b8' }}>Shift avg · All cameras</span>
        <span style={s9}>
          ⛑️ Helmet: <span style={{ color: '#4ade80', fontWeight: 600 }}>{compliance?.helmet ?? 0}%</span>
          {'  '}🦺 Vest: <span style={{ color: '#4ade80', fontWeight: 600 }}>{compliance?.vest ?? 0}%</span>
        </span>
        <span style={s9}>Best shift: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{shiftLabel(bestShift)}</span></span>
      </div>
    )
    if (id === 'ppe_violations') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ ...s9, color: '#94a3b8' }}>Without full PPE</span>
        <span style={s9}>⛑️ No Helmet: <span style={{ color: '#ef4444', fontWeight: 600 }}>{Math.round(100 - (compliance?.helmet || 0))}%</span></span>
        <span style={s9}>🦺 No Vest: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{Math.round(100 - (compliance?.vest || 0))}%</span></span>
      </div>
    )
    return ''
  }

  const handleCardClick    = id => setActiveModal(id)
  const activeModalCard    = CARDS.find(c => c.id === activeModal)
  const modalData          = { trendData, displaySafe, displayViolated, displayCompliance, compliance }

  const alertBorderColor   = alertCount > 0
    ? (alertsOpen ? '#ef4444' : 'rgba(239,68,68,0.65)')
    : (alertsOpen ? '#22c984' : 'rgba(34,201,132,0.5)')
  const alertBg            = alertCount > 0
    ? (alertsOpen ? '#3d1010' : '#2a0d0d')
    : (alertsOpen ? '#0d3326' : '#091f18')
  const alertShadow        = alertCount > 0
    ? 'inset 0 0 18px rgba(239,68,68,0.18), 0 0 14px rgba(239,68,68,0.25)'
    : 'inset 0 0 18px rgba(34,201,132,0.10), 0 0 10px rgba(34,201,132,0.15)'
  const alertDotColor      = alertCount > 0 ? '#ef4444' : '#22c984'
  const alertTextColor     = alertCount > 0 ? '#fca5a5' : alertsOpen ? '#6ee7b7' : '#94a3b8'
  const alertArrowColor    = alertCount > 0 ? '#fca5a5' : alertsOpen ? '#6ee7b7' : '#94a3b8'

  return (
    <>
      <style>{`
        @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes tabPulse    { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 70%{box-shadow:0 0 0 8px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
        @keyframes modalPop    { from{opacity:0;transform:translate(-50%,-47%) scale(0.96)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
      `}</style>

      {/* ── Chart popup modal ── */}
      {activeModal && activeModalCard && (
        <CardChartModal card={activeModalCard} data={modalData} onClose={() => setActiveModal(null)} />
      )}

      {/* ── Filter banners ── */}
      {selectedLocation && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '7px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a5b4fc' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            <span>{selectedLocation.icon} Showing stats for location <strong>{selectedLocation.label}</strong> <span style={{ color: '#64748b', fontWeight: 400 }}>({getAllCamerasForLocation(selectedLocation).length} cam{getAllCamerasForLocation(selectedLocation).length !== 1 ? 's' : ''})</span></span>
            {locationKpiLoading && <span style={{ color: '#64748b', fontSize: 10 }}>— aggregating…</span>}
          </div>
          <button onClick={onClearLocation} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#64748b', cursor: 'pointer', padding: '2px 10px', fontSize: 11 }}>✕ Show all</button>
        </div>
      )}
      {!selectedLocation && selectedCamera && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '7px 14px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#93c5fd' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
            <span>Showing stats for camera <strong style={{ fontFamily: 'monospace' }}>{selectedCamera.id}</strong></span>
            {selectedCamera.name && <span style={{ color: '#64748b' }}>— {selectedCamera.name}</span>}
          </div>
          <button onClick={onClearCamera} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#64748b', cursor: 'pointer', padding: '2px 10px', fontSize: 11 }}>✕ Show all cameras</button>
        </div>
      )}

      {/* ── Main layout ── */}
      {/*
        KEY FIX: Use alignItems:'flex-start' on the outer row so nothing stretches.
        The alerts button uses an explicit height measured from the cards row via ResizeObserver.
        This is the only reliable way to match heights without ghost space.
      */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 0, marginBottom: 16, width: '100%' }}>

        {/* Cards section */}
        <div
          ref={cardsRowRef}
          style={{ flex: alertsOpen ? '0 0 calc(50% - 22px)' : '1 1 100%', transition: 'flex 0.38s cubic-bezier(0.4,0,0.2,1)', minWidth: 0, overflow: 'hidden' }}
        >
          <div style={{ display: alertsOpen ? 'grid' : 'flex', flexDirection: alertsOpen ? undefined : 'row', alignItems: 'flex-start', gridTemplateColumns: alertsOpen ? '1fr 1fr' : undefined, gap: 10 }}>
            {CARDS.map(c => (
              <StatCard
                key={c.id}
                icon={c.icon}
                label={c.label}
                value={getCardValue(c.id)}
                color={c.colorKey}
                sub={getCardSub(c.id)}
                isActive={false}
                compact={alertsOpen}
                onClick={() => handleCardClick(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Alerts toggle tab */}
        <div
          onClick={() => setAlertsOpen(p => !p)}
          title={`${alertCount} alert${alertCount !== 1 ? 's' : ''} — click to ${alertsOpen ? 'close' : 'view'}`}
          style={{
            flexShrink:     0,
            width:          28,
            height:         cardsHeight ? `${cardsHeight}px` : 120,
            minHeight:      80,
            marginLeft:     8,
            marginRight:    alertsOpen ? 8 : 0,
            cursor:         'pointer',
            userSelect:     'none',
            position:       'relative',
            zIndex:         10,
            borderRadius:   10,
            background:     alertCount > 0 ? '#ef4444' : '#22c984',
            boxShadow:      alertCount > 0
              ? '0 4px 18px rgba(239,68,68,0.45)'
              : '0 4px 18px rgba(34,201,132,0.35)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            animation:      (!alertsOpen && alertCount > 0) ? 'tabPulse 2s ease-out infinite' : 'none',
            transition:     'background 0.2s, box-shadow 0.2s, margin 0.38s',
          }}
        >
          {/* Badge */}
          {alertCount > 0 && !alertsOpen && (
            <div style={{
              position: 'absolute', top: -7, right: -7,
              background: '#b91c1c', color: '#fff', borderRadius: 99,
              fontSize: 9, fontWeight: 700, minWidth: 16, height: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #080d18', padding: '0 2px', zIndex: 20,
            }}>
              {alertCount > 9 ? '9+' : alertCount}
            </div>
          )}

          {/* Single unit: ALERTS text + arrow, fills full height */}
          <div style={{
            display:         'flex',
            flexDirection:   'column',
            alignItems:      'center',
            justifyContent:  'space-evenly',
            width:           '100%',
            height:          '100%',
            writingMode:     'vertical-rl',
            transform:       'rotate(180deg)',
            padding:         '12px 0',
            boxSizing:       'border-box',
          }}>
            <span style={{
              fontSize:      12,
              fontWeight:    900,
              letterSpacing: '0.18em',
              color:         '#fff',
              textTransform: 'uppercase',
              userSelect:    'none',
            }}>
              ALERTS
            </span>

            <svg
              width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
              style={{
                transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
                transform:  alertsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                flexShrink: 0,
              }}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </div>

          {/* Double chevron */}
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
              transform:  alertsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <polyline points="13 17 8 12 13 7" />
            <polyline points="19 17 14 12 19 7" />
          </svg>
          </div>

        {/* Alerts panel */}
        <div style={{
            flex:       alertsOpen ? '0 0 calc(50% - 22px)' : '0 0 0px',
            overflow:   'hidden',
            transition: 'flex 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease',
            opacity:    alertsOpen ? 1 : 0,
            minWidth:   0,
            alignSelf:  'flex-start',
            display:    alertsOpen ? 'block' : 'none',
          }}>
          <div style={{
              background:   alertCount > 0 ? '#1a0f0f' : '#0d1a12',
              border:       `1px solid ${alertCount > 0 ? 'rgba(229,62,62,0.3)' : 'rgba(34,201,132,0.2)'}`,
              borderRadius: 14,
              padding:      '16px 18px',
              boxSizing:    'border-box',
              display:      'flex',
              flexDirection:'column',
              overflow:     'hidden',
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
      {/* No detail panel — modals handle all card detail */}
    </>
  )
}
