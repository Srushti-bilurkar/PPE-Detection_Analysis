import { useState, useEffect, useRef } from 'react'

const TAB_TITLES = {
  'safety-dashboard': ['Safety Dashboard',        'Tower A & B · Live AI Monitoring'],
  'zone-map':         ['Zone Map',                'Floor 4 · Tower A · 33 workers'],
  'ppe-compliance':   ['PPE Compliance',          '247 workers tracked · Live'],
  'alerts':           ['Alert Feed',              'Live from MongoDB'],
  'productivity':     ['Crew Activity',           'Site utilization · All zones'],
  'scorecard':        ['Sub-Contractor Scorecard','Week of Feb 10-16'],
  'progress':         ['Project Progress',        'Prestige Tower - Phase 1'],
  'milestones':       ['Milestones',              '5/8 complete · 0 missed'],
  'owner-portal':     ['Owner Portal',            'Executive View - Read Only'],
  'reports':          ['Reports',                 'Automated · Scheduled · On-Demand'],
  'settings':         ['Settings',                'System Configuration'],
}

const TABS = [
  'safety-dashboard','zone-map','ppe-compliance','alerts',
  'productivity','scorecard','progress','milestones',
  'owner-portal','reports','settings'
]

const TAB_LABELS = {
  'safety-dashboard': 'Safety Overview',
  'zone-map':         'Zone Map',
  'ppe-compliance':   'PPE Compliance',
  'alerts':           'Alerts',
  'productivity':     'Crew Productivity',
  'scorecard':        'Scorecard',
  'progress':         'Project Progress',
  'milestones':       'Milestones',
  'owner-portal':     'Owner Portal',
  'reports':          'Reports',
  'settings':         'Settings',
}

function useClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Safely parse a timestamp from various formats ──────────────────────────
function parseTimestamp(ts) {
  if (!ts) return null
  // Already a Date object
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts
  // Number (epoch ms or seconds)
  if (typeof ts === 'number') {
    const d = ts > 1e10 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  // String
  const d = new Date(ts)
  if (!isNaN(d.getTime())) return d
  // Try replacing space with T for "2026-04-16 11:30:00" style
  const d2 = new Date(ts.replace(' ', 'T'))
  return isNaN(d2.getTime()) ? null : d2
}

function formatTime(ts) {
  const d = parseTimestamp(ts)
  if (!d) return '—'
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDateTime(ts) {
  const d = parseTimestamp(ts)
  if (!d) return '—'
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Classify alerts into violations / safe / info ──────────────────────────
function classifyAlerts(alerts) {
  const violations = alerts.filter(a =>
    a.severity === 'critical' || a.severity === 'warning'
  )
  const safeWorkers = alerts.filter(a =>
    a.severity === 'info' && /safe|compliant|wearing|ppe ok/i.test(a.message || a.title || '')
  )
  // Deduplicate violations by message text
  const violationMessages = {}
  violations.forEach(a => {
    const key = (a.message || a.title || '').trim()
    if (!violationMessages[key]) violationMessages[key] = 0
    violationMessages[key]++
  })
  return { violations, safeWorkers, violationMessages }
}

// ── HANDOVER HTML builder ──────────────────────────────────────────────────
// NEW — use direct KPI values matching dashboard exactly
// REPLACE WITH:
function buildHandoverHTML({ alerts, violations: allViolations = [], kpi, activeTab, zones, handoverDate, siteName }) {
  const now = new Date()
  const generatedDateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const generatedTimeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

  const forDateObj = handoverDate ? new Date(handoverDate + 'T12:00:00') : now
  const forDateStr = forDateObj.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric', weekday:'long' })

  const site = siteName || 'Construction Site'

  const totalWorkers   = kpi.workers_on_site ?? 0
  const maxSafeWorkers = kpi.max_safe_workers ?? 0
  const violatedWorkers = kpi.violated_workers ?? 0
  const ppeCompliance  = kpi.ppe_compliance   ?? 0
  const critical       = kpi.critical_alerts  ?? 0
  const warnings       = kpi.warning_alerts   ?? 0

  // Use alerts filtered to violations for the table rows
  const { violations: alertViolations, violationMessages } = classifyAlerts(alerts)

  const sc = s => s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : '#3b82f6'

  // All violations rows (no truncation)
  const allViolationRows = alertViolations.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-size:12px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
          background:${sc(a.severity)};margin-right:8px;vertical-align:middle;flex-shrink:0;"></span>
        ${a.message || a.title || 'Alert'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:${sc(a.severity)};
        font-weight:700;text-transform:uppercase;font-size:11px;white-space:nowrap;">${a.severity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:11px;">${a.zone || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:11px;">${a.camera || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#64748b;font-size:11px;white-space:nowrap;">
        ${formatTime(a.timestamp || a.created_at || a.time || a.date)}
      </td>
    </tr>`).join('')

  const zoneRows = zones.length > 0
    ? zones.map(z => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;font-size:12px;">${z.name || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${z.workers ?? '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;">
          <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;
            background:${z.status==='active'?'#052e16':'#1c1917'};
            color:${z.status==='active'?'#4ade80':'#94a3b8'};">
            ${z.status || 'unknown'}
          </span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${z.risk || 'Low'}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="padding:16px;color:#64748b;text-align:center;font-size:12px;">No zone data available</td></tr>'

  // KPI stat cards
  const kpiCards = [
    { label:'Active Cameras',      value: kpi.active_cameras ?? '—', icon:'📹', color:'#3b82f6' },
    { label:'Peak Workers On-Site',value: totalWorkers || '—',        icon:'👷', color:'#10b981' },
    { label:'PPE Compliance',      value: ppeCompliance + '%',        icon:'🦺', color:'#f59e0b' },
    // ✅ use violatedWorkers (camelCase local variable)
    { label:'Violated Workers',    value: violatedWorkers,            icon:'🚫', color:'#ef4444' },
    { label:'Max Safe Workers',    value: maxSafeWorkers,             icon:'✅', color:'#22c55e' },
    { label:'Critical Alerts',     value: critical,                   icon:'🚨', color:'#ef4444' },
    { label:'Warnings',            value: warnings,                   icon:'⚠️', color:'#f97316' },
    { label:'Total Alerts',        value: alerts.length,              icon:'🔔', color:'#8b5cf6' },
  ].map(k => `
    <div style="background:#1e293b;border-radius:10px;padding:16px 12px;border-left:3px solid ${k.color};text-align:center;">
      <div style="font-size:18px;margin-bottom:6px;">${k.icon}</div>
      <div style="font-size:22px;font-weight:700;color:${k.color};">${k.value}</div>
      <div style="font-size:10px;color:#64748b;margin-top:3px;line-height:1.3;">${k.label}</div>
    </div>`).join('')

  // Violation summary by type
  // REPLACE WITH:  (no change needed here — violationMessages is now correctly declared above)
  const violTypeSummary = Object.entries(violationMessages)
    .sort((a, b) => b[1] - a[1])
    .map(([msg, cnt]) => `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 12px;
        background:rgba(239,68,68,0.05);border-radius:7px;border-left:3px solid #ef4444;margin-bottom:5px;">
        <span style="color:#fca5a5;font-size:12px;flex:1;">${msg}</span>
        <span style="color:#ef4444;font-weight:700;font-size:13px;white-space:nowrap;">×${cnt}</span>
      </div>`).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>SHIFT HANDOVER REPORT — ${forDateStr}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',system-ui,sans-serif; background:#0f172a; color:#e2e8f0; font-size:13px; line-height:1.5; }
    table { border-collapse:collapse; width:100%; }
    @media print {
      body { background:#fff !important; color:#0f172a !important; }
      .no-print { display:none !important; }
    }
  </style>
</head>
<body>

  <!-- ── Header ── -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
    padding:28px 40px;border-bottom:2px solid #3b82f6;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:48px;height:48px;background:#3b82f6;border-radius:10px;
          display:flex;align-items:center;justify-content:center;
          font-size:20px;font-weight:900;color:#fff;flex-shrink:0;">YI</div>
        <div>
          <div style="font-size:10px;letter-spacing:3px;color:#64748b;
            text-transform:uppercase;margin-bottom:2px;">YOLOIntel · ${site}</div>
          <div style="font-size:22px;font-weight:700;color:#f1f5f9;">SHIFT HANDOVER REPORT</div>
          <div style="font-size:11px;color:#60a5fa;margin-top:3px;">
            Active View: ${TAB_LABELS[activeTab] || activeTab}
          </div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Report Covers</div>
        <div style="font-size:16px;font-weight:700;color:#f1f5f9;margin-top:2px;">${forDateStr}</div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #334155;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Generated On</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px;">${generatedDateStr}</div>
          <div style="font-size:11px;color:#64748b;">${generatedTimeStr}</div>
        </div>
      </div>
    </div>
  </div>

  <div style="padding:28px 40px;">

    <!-- ── KPIs ── -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        📊 Live KPIs — ${forDateStr}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">${kpiCards}</div>
    </div>

    <!-- ── Safety Summary ── -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        🛡️ Safety Summary
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <!-- Safe -->
        <div style="background:#052e16;border:1px solid #16a34a;border-radius:10px;padding:18px;">
          <div style="font-size:11px;color:#4ade80;font-weight:700;text-transform:uppercase;
            letter-spacing:1px;margin-bottom:8px;">✅ Max Safe Workers</div>
          <div style="font-size:36px;font-weight:700;color:#22c55e;">${maxSafeWorkers}</div>
          <div style="font-size:11px;color:#4ade80;margin-top:4px;">
            of ${totalWorkers} total workers · No PPE violations recorded
          </div>
        </div>
        <!-- Violations -->
        <!-- Alerts -->
        <div style="background:#450a0a;border:1px solid #dc2626;border-radius:10px;padding:18px;">
          <div style="font-size:11px;color:#fca5a5;font-weight:700;text-transform:uppercase;
            letter-spacing:1px;margin-bottom:8px;">🚨 Alerts Summary</div>
          <div style="font-size:36px;font-weight:700;color:#ef4444;">${alerts.length}</div>
          <div style="font-size:11px;color:#fca5a5;margin-top:4px;">
            ${critical} critical &nbsp;·&nbsp; ${warnings} warnings
            &nbsp;·&nbsp; PPE: ${ppeCompliance}%
          </div>
        </div>
      </div>
    </div>

    ${Object.keys(violationMessages).length > 0 ? `
    <!-- ── Violation Types ── -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        ❌ Violation Types (Unique · Sorted by Frequency)
      </div>
      ${violTypeSummary}
    </div>` : ''}

    <!-- ── All Violations Table ── -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        🚨 All Violations — ${forDateStr}
        <span style="color:#ef4444;font-weight:700;margin-left:8px;">(${alertViolations.length} total)</span>
      </div>
      ${alertViolations.length > 0 ? `
      <table style="background:#1e293b;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Violation</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;white-space:nowrap;">Severity</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Zone</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Camera</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Time</th>
          </tr>
        </thead>
        <tbody>${allViolationRows}</tbody>
      </table>` : `
      <div style="background:#1e293b;border-radius:10px;padding:24px;text-align:center;color:#64748b;font-size:12px;">
        ✅ No violations recorded for this date.
      </div>`}
    </div>

    <!-- ── Active Zones ── -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">📍 Active Zones</div>
      <table style="background:#1e293b;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Zone</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Workers</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Status</th>
            <th style="padding:10px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Risk</th>
          </tr>
        </thead>
        <tbody>${zoneRows}</tbody>
      </table>
    </div>

    <!-- ── Handover Notes ── -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">📝 Handover Notes</div>
      <div style="background:#1e293b;border-radius:10px;padding:20px;border:1px dashed #334155;">
        <div style="font-size:12px;color:#94a3b8;line-height:2.2;">
          <div>• Incoming shift supervisor to review all
            <span style="color:#ef4444;font-weight:700;">${critical} critical</span> and
            <span style="color:#f59e0b;font-weight:700;">${warnings} warning</span>
            alerts from <span style="color:#f1f5f9;font-weight:700;">${forDateStr}</span> before sign-off.
          </div>
          <div>• PPE compliance was
            <span style="color:${(kpi.ppe_compliance??0) >= 80 ? '#22c55e' : '#ef4444'};font-weight:700;">
              ${kpi.ppe_compliance ?? '—'}%
            </span> — ${(kpi.ppe_compliance??0) < 50 ? '⚠️ CRITICALLY LOW — immediate corrective action required.' : 'monitor zones with recent violations.'}</div>
          <div>• <span style="color:#f1f5f9;font-weight:700;">${maxSafeWorkers}</span> workers maintained full PPE compliance throughout the shift.</div>
          <div>• <span style="color:#ef4444;font-weight:700;">${alerts.length}</span> total alerts recorded — ensure all incidents are acknowledged and actioned.</div>
          <div>• <span style="color:#f1f5f9;font-weight:700;">${kpi.active_cameras ?? '—'}</span> camera streams active — report any offline feeds immediately.</div>
          <div>• Total workers on-site: <span style="color:#f1f5f9;font-weight:700;">${totalWorkers || '—'}</span>. Verify headcount at all zone entry points.</div>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid #334155;color:#475569;font-size:12px;">
            Outgoing Supervisor: _________________________ &nbsp;&nbsp; Time: ______________
          </div>
          <div style="margin-top:8px;color:#475569;font-size:12px;">
            Incoming Supervisor: _________________________ &nbsp;&nbsp; Time: ______________
          </div>
        </div>
      </div>
    </div>

    <!-- ── Footer ── -->
    <div style="padding-top:18px;border-top:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#475569;font-size:10px;">YOLOIntel · ${site} · Auto-generated Shift Handover Report</div>
      <div style="color:#475569;font-size:10px;">
        Report Date: ${forDateStr} &nbsp;·&nbsp; Generated: ${generatedDateStr} ${generatedTimeStr}
      </div>
    </div>

  </div>
</body>
</html>`
}

function openHandoverPDF(props) {
  const html = buildHandoverHTML(props)
  const blob = new Blob([html], { type: 'text/html' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (win) {
    win.onload = () => setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 600)
  }
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function Topbar({
  activeTab,
  setActiveTab,
  alerts  = [],
  kpi     = {},
  zones   = [],
  siteName = 'Construction Site',   // ← pass your site name as a prop; no hardcoding
}) {
  const [notifOpen,      setNotifOpen]      = useState(false)
  const [lightMode,      setLightMode]      = useState(false)
  const [readIds,        setReadIds]        = useState(new Set())
  const [handovering,    setHandovering]    = useState(false)
  const [handoverOpen,   setHandoverOpen]   = useState(false)
  const [handoverDate,   setHandoverDate]   = useState(todayISO())
  const [handoverEmailOpen, setHandoverEmailOpen] = useState(false)
  const [handoverEmailSent, setHandoverEmailSent] = useState(false)
  const [handoverEmailSending, setHandoverEmailSending] = useState(false)
  const [summaryOpen,    setSummaryOpen]    = useState(false)
  const [summaryDate,    setSummaryDate]    = useState(todayISO())
  const [summaryData,    setSummaryData]    = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError,   setSummaryError]   = useState('')

  const panelRef   = useRef(null)
  const bellRef    = useRef(null)
  const summaryRef = useRef(null)
  const clock      = useClock()

  const [title, sub] = TAB_TITLES[activeTab] || [activeTab, '']
  const unread = alerts.filter(a => !readIds.has(a._id)).length

  function toggleNotif() {
    if (!notifOpen) setReadIds(new Set(alerts.map(a => a._id)))
    setNotifOpen(v => !v)
  }

  function toggleTheme() {
    const next = !lightMode
    setLightMode(next)
    document.body.classList.toggle('light-mode', next)
  }

  function handleHandover() {
    setHandoverOpen(v => !v)
  }

  async function generateHandover() {
  setHandovering(true)
  setHandoverOpen(false)
  try {
    const [alertsRes, kpiRes, dayTrendRes, nightTrendRes] = await Promise.all([
      fetch(`/api/alerts?date=${handoverDate}&limit=9999`).then(r => r.json()),
      fetch(`/api/kpi?date=${handoverDate}`).then(r => r.json()),
      fetch(`/api/hourly-trend?date=${handoverDate}&shift=day`).then(r => r.json()),    // ← day shift
      fetch(`/api/hourly-trend?date=${handoverDate}&shift=night`).then(r => r.json()),  // ← night shift
    ])

    // ── Exact same logic as SafetyDashboard ──────────────────────
    const dayTrend   = Array.isArray(dayTrendRes)   ? dayTrendRes   : []
    const nightTrend = Array.isArray(nightTrendRes) ? nightTrendRes : []
    const trendData  = [...dayTrend, ...nightTrend]  // combine both shifts

    const daySafe     = trendData.reduce((s, d) => s + (d.workers_active || 0), 0)
    const dayViolated = trendData.reduce((s, d) => s + (d.violations     || 0), 0)
    const dayTotal    = daySafe + dayViolated
    const ppePct      = dayTotal > 0 ? Math.round((daySafe / dayTotal) * 100) : 100

    const handoverKpi = {
      workers_on_site:  dayTotal,       // displayTotal in dashboard
      max_safe_workers: daySafe,        // displaySafe
      violated_workers: dayViolated,    // displayViolated
      ppe_compliance:   ppePct,         // displayCompliance
      critical_alerts:  kpiRes.critical_alerts ?? 0,
      warning_alerts:   kpiRes.warning_alerts  ?? 0,
      active_cameras:   kpiRes.active_cameras  ?? 0,
    }

    openHandoverPDF({
      alerts: alertsRes,
      kpi: handoverKpi,
      activeTab,
      zones,
      handoverDate,
      siteName,
    })
  } catch (e) {
    console.error('Handover fetch failed:', e)
    openHandoverPDF({ alerts, kpi, activeTab, zones, handoverDate, siteName })
  }
  setTimeout(() => setHandovering(false), 1500)
}

  async function sendHandoverEmail() {
    setHandoverEmailSending(true)
    try {
      // ── Build the report HTML (same as PDF) ──
      const reportHTML = buildHandoverHTML({
        alerts,
        kpi,
        activeTab,
        zones,
        handoverDate,
        siteName,
      })

      const res = await fetch('http://localhost:5000/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:         'alphaleodatabricks@gmail.com',
          subject:    `Shift Handover Report — ${handoverDate} · YOLOIntel`,
          message:    `Hi Alphaleo,\n\nThe Shift Handover Report for ${handoverDate} is ready. Please find the PDF attached.\n\nRegards,\nYOLOIntel Admin`,
          reportHTML: reportHTML,   // ← send the HTML to backend
        })
      })

      const data = await res.json()
      if (data.ok) {
        setHandoverEmailSending(false)
        setHandoverEmailSent(true)
        setTimeout(() => { setHandoverEmailOpen(false); setHandoverEmailSent(false) }, 2000)
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setHandoverEmailSending(false)
      alert('Failed to send email: ' + err.message)
    }
  }

  async function fetchSummaryForDate(date) {
    setSummaryLoading(true)
    setSummaryError('')
    setSummaryData(null)
    try {
      const res = await fetch(`http://localhost:3001/api/summary/${date}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const json = await res.json()

      const camRows  = Object.entries(json.byCamera || {}).sort((a, b) => b[1] - a[1])
      const zoneRows = Object.entries(json.byZone   || {}).sort((a, b) => b[1] - a[1])
      const byHour   = json.byHour || Array(24).fill(0)
      const peakHour = byHour.indexOf(Math.max(...byHour))

      setSummaryData({
        date,
        total:         json.total,
        critical:      json.critical,
        warnings:      json.warnings,
        info:          json.info,
        camRows,
        zoneRows,
        byHour,
        peakHour,
        snapshotCount: json.snapshotCount,
        ppeCompliance: json.ppeCompliance,
        recentAlerts:  json.recentAlerts || [],
        isToday:       date === todayISO(),
      })
    } catch (err) {
      setSummaryError(`Failed to load summary: ${err.message}`)
    } finally {
      setSummaryLoading(false)
    }
  }

  function handleSummaryClick() {
    if (!summaryOpen) {
      setSummaryOpen(true)
      fetchSummaryForDate(summaryDate)
    } else {
      setSummaryOpen(false)
    }
  }

  function handleDateChange(e) {
    setSummaryDate(e.target.value)
    fetchSummaryForDate(e.target.value)
  }

  useEffect(() => {
    function handler(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current  && !bellRef.current.contains(e.target)
      ) setNotifOpen(false)
      if (
        summaryRef.current && !summaryRef.current.contains(e.target) &&
        !e.target.closest('#summary-btn')
      ) setSummaryOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function timeAgo(ts) {
    const d = parseTimestamp(ts)
    if (!d) return ''
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60)    return `${diff}s ago`
    if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    return d.toLocaleDateString('en-IN')
  }

  const sevColor = s => s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : '#3b82f6'

  const StatCard = ({ icon, label, value, color }) => (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${color}33`,
      borderRadius: '10px',
      padding: '10px 12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '16px', marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{label}</div>
    </div>
  )

  function NarrativeSummary({ data }) {
    const ppeColor  = data.ppeCompliance >= 80 ? '#34d399' : data.ppeCompliance >= 60 ? '#fbbf24' : '#f87171'
    const ppeBorder = data.ppeCompliance >= 80 ? '#10b981' : data.ppeCompliance >= 60 ? '#f59e0b' : '#ef4444'
    const ppeText   = data.ppeCompliance >= 80
      ? 'Workers maintained good safety gear adherence.'
      : data.ppeCompliance >= 60
      ? 'Some workers were found without required PPE — follow-up needed.'
      : 'PPE compliance was critically low — immediate action required.'

    const rows = []

    rows.push(
      <div key="alerts" style={rowStyle('#8b5cf6')}>
        🔔 A total of <B color="#f1f5f9">{data.total} alert{data.total !== 1 ? 's' : ''}</B> were recorded —{' '}
        <B color="#ef4444">{data.critical} critical</B>,{' '}
        <B color="#f59e0b">{data.warnings} warning{data.warnings !== 1 ? 's' : ''}</B>, and{' '}
        <B color="#3b82f6">{data.info} informational</B>.
      </div>
    )

    if (kpi.workers_on_site != null) {
      rows.push(
        <div key="workers" style={rowStyle('#10b981')}>
          👷 <B color="#f1f5f9">{kpi.workers_on_site} workers</B> were active on-site
          {zones.length > 0 && <> across <B color="#34d399">{zones.length} zone{zones.length !== 1 ? 's' : ''}</B></>}.
        </div>
      )
    }

    if (data.ppeCompliance != null) {
      rows.push(
        <div key="ppe" style={rowStyle(ppeBorder)}>
          🦺 PPE compliance for the day was <B color={ppeColor}>{data.ppeCompliance}%</B>. {ppeText}
        </div>
      )
    }

    if (data.camRows.length > 0) {
      rows.push(
        <div key="cam" style={rowStyle('#3b82f6')}>
          📹 Highest alert activity came from camera <B color="#60a5fa">{data.camRows[0][0]}</B> with{' '}
          <B color="#f1f5f9">{data.camRows[0][1]} alert{data.camRows[0][1] !== 1 ? 's' : ''}</B>
          {data.camRows.length > 1 && <>, followed by <B color="#60a5fa">{data.camRows[1][0]}</B> ({data.camRows[1][1]})</>}.
        </div>
      )
    }

    if (data.zoneRows.length > 0) {
      rows.push(
        <div key="zone" style={rowStyle('#10b981')}>
          📍 Zone <B color="#34d399">{data.zoneRows[0][0]}</B> had the most incidents with{' '}
          <B color="#f1f5f9">{data.zoneRows[0][1]} alert{data.zoneRows[0][1] !== 1 ? 's' : ''}</B>
          {data.zoneRows.length > 1 && <>, followed by <B color="#34d399">{data.zoneRows[1][0]}</B> ({data.zoneRows[1][1]})</>}.
        </div>
      )
    }

    if (data.total > 0) {
      rows.push(
        <div key="peak" style={rowStyle('#f59e0b')}>
          🕐 Alert activity peaked at <B color="#fbbf24">{String(data.peakHour).padStart(2,'0')}:00 IST</B> with{' '}
          <B color="#f1f5f9">{data.byHour[data.peakHour]} alert{data.byHour[data.peakHour] !== 1 ? 's' : ''}</B> in that hour.
        </div>
      )
    }

    if (data.snapshotCount > 0) {
      rows.push(
        <div key="snap" style={rowStyle('#14b8a6')}>
          📸 <B color="#2dd4bf">{data.snapshotCount} snapshots</B> were captured across all cameras.
        </div>
      )
    }

    if (data.critical > 0) {
      rows.push(
        <div key="crit" style={{ ...rowStyle('#ef4444'), background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          ⚠️ <B color="#fca5a5">{data.critical} critical alert{data.critical !== 1 ? 's' : ''}</B> require{data.critical === 1 ? 's' : ''} immediate review.
        </div>
      )
    }

    return (
      <div style={{
        background: 'rgba(59,130,246,0.05)',
        border: '1px solid rgba(59,130,246,0.15)',
        borderRadius: '10px',
        padding: '14px 16px',
        marginBottom: '16px',
      }}>
        <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
          📝 Site Narrative — {new Date(data.date + 'T12:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.7' }}>
          {rows}
        </div>
      </div>
    )
  }

  function rowStyle(borderColor) {
    return { padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '7px', borderLeft: `3px solid ${borderColor}` }
  }

  function B({ color, children }) {
    return <span style={{ color, fontWeight: 700 }}>{children}</span>
  }

  return (
    <>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div>
          <div className="topbar-title">{title}</div>
          <div className="topbar-sub">Site: {siteName} — {sub}</div>
        </div>

        <div className="topbar-spacer" />

        <div id="live-clock">{clock}</div>

        <div className="status-pill">
          <div className="status-dot" />
          {kpi.active_cameras ?? 0} STREAMS LIVE
        </div>

        <button id="notif-bell" ref={bellRef} onClick={toggleNotif} title="Notifications">
          🔔
          {unread > 0 && <div id="notif-badge" style={{ display: 'flex' }}>{unread}</div>}
        </button>

        <button className="topbar-btn" id="theme-toggle" onClick={toggleTheme}>
          {lightMode ? '☀️ Light' : '🌙 Dark'}
        </button>

        {/* ── Handover Button + Picker ── */}
        <div style={{ position: 'relative' }}>
          <button
            className="topbar-btn"
            onClick={handleHandover}
            disabled={handovering}
            title="Generate Shift Handover PDF"
            style={{ opacity: handovering ? 0.6 : 1, cursor: handovering ? 'wait' : 'pointer' }}
          >
            {handovering ? '⏳ Generating...' : '📋 Handover'}
          </button>

          {handoverOpen && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 9999,
              background: '#1e293b', border: '1px solid #334155',
              borderRadius: 10, padding: '14px 16px', width: 240,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                📅 Handover report for date:
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 8 }}>
                Selected date will appear as "Report Covers". Generated timestamp is always now.
              </div>
              <input
                type="date"
                value={handoverDate}
                max={todayISO()}
                onChange={e => setHandoverDate(e.target.value)}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.07)',
                  border: '1px solid #334155', borderRadius: 6,
                  padding: '5px 10px', color: '#f1f5f9',
                  fontSize: 12, marginBottom: 10,
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={generateHandover}
                  style={{
                    flex: 1, background: '#3b82f6', border: 'none',
                    borderRadius: 6, padding: '7px 0', color: '#fff',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Generate PDF
                </button>
                <button
                  onClick={() => setHandoverOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid #334155',
                    borderRadius: 6, padding: '7px 10px', color: '#94a3b8',
                    fontSize: 12, cursor: 'pointer',
                  }}
                >✕</button>
              </div>
              <button
                onClick={() => { setHandoverEmailOpen(true); setHandoverEmailSent(false); setHandoverOpen(false) }}
                style={{
                  width: '100%', marginTop: 8, background: 'rgba(168,85,247,0.18)',
                  border: '1px solid rgba(168,85,247,0.35)', borderRadius: 6,
                  padding: '7px 0', color: '#c4b5fd', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                📧 Email to Site Manager
              </button>
            </div>
          )}
        </div>

        <button
          id="summary-btn"
          className={`topbar-btn${summaryOpen ? ' active' : ''}`}
          onClick={handleSummaryClick}
          title="Date-wise site summary"
        >
          📊 Summary
        </button>
      </div>

      {/* ── Screen Tabs ── */}
      <div className="screen-tabs">
        {TABS.map(id => (
          <div
            key={id}
            className={`screen-tab${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {TAB_LABELS[id]}
          </div>
        ))}
      </div>

      {/* ── Notification Panel ── */}
      <div id="notif-panel" ref={panelRef} className={notifOpen ? 'open' : ''}>
        <div className="notif-header">
          <div className="notif-header-title">🔔 Notifications</div>
          <div className="notif-close" onClick={() => setNotifOpen(false)}>✕</div>
        </div>
        <div id="notif-list">
          {alerts.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>No alerts yet</div>
          )}
          {alerts.map(a => {
            const sev    = a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info'
            const isRead = readIds.has(a._id)
            return (
              <div key={a._id} className={`notif-item ${sev}${isRead ? ' read' : ''}`}>
                <div className="notif-dot" />
                <div className="notif-body">
                  <div className="notif-msg">
                    {a.message || a.title || 'Alert'}
                    {a.camera ? ` · ${a.camera}` : ''}
                    {a.zone   ? ` · ${a.zone}`   : ''}
                  </div>
                  <div className="notif-time">
                    {timeAgo(a.timestamp || a.created_at || a.time || '')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Summary Panel ── */}
      {summaryOpen && (
        <div
          ref={summaryRef}
          style={{
            position: 'fixed', top: '70px', right: '16px',
            width: '440px', maxHeight: '640px',
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border, #334155)',
            borderRadius: '14px',
            boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.15)',
            zIndex: 9999,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--border, #334155)',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(16,185,129,0.06) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '34px', height: '34px', borderRadius: '8px',
                background: 'linear-gradient(135deg,#3b82f6,#10b981)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
              }}>📊</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text, #f1f5f9)' }}>Daily Site Summary</div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{siteName} · Alert & Zone Breakdown</div>
              </div>
            </div>
            <button
              onClick={() => setSummaryOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}
            >×</button>
          </div>

          {/* Date Picker */}
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border, #334155)',
            display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.15)',
          }}>
            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>📅 View date:</span>
            <input
              type="date"
              value={summaryDate}
              max={todayISO()}
              onChange={handleDateChange}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid #334155',
                borderRadius: '6px', padding: '5px 10px', color: '#f1f5f9',
                fontSize: '12px', cursor: 'pointer',
              }}
            />
            {summaryData?.isToday && (
              <span style={{
                fontSize: '10px', color: '#10b981', fontWeight: 600,
                padding: '2px 8px', background: 'rgba(16,185,129,0.1)',
                borderRadius: '4px', border: '1px solid rgba(16,185,129,0.25)', whiteSpace: 'nowrap',
              }}>● LIVE</span>
            )}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            {summaryLoading && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b', fontSize: '12px' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                Loading data for {summaryDate}…
              </div>
            )}
            {summaryError && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#ef4444', fontSize: '12px' }}>
                {summaryError}
              </div>
            )}
            {!summaryLoading && !summaryError && summaryData && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '16px' }}>
                  <StatCard icon="🔔" label="Total"    value={summaryData.total}    color="#8b5cf6" />
                  <StatCard icon="🚨" label="Critical" value={summaryData.critical} color="#ef4444" />
                  <StatCard icon="⚠️" label="Warnings" value={summaryData.warnings} color="#f59e0b" />
                  <StatCard icon="ℹ️" label="Info"     value={summaryData.info}     color="#3b82f6" />
                </div>

                {summaryData.total === 0 ? (
                  <div style={{
                    background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: '10px', padding: '20px', marginBottom: '16px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.8' }}>
                      No alerts recorded on <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{summaryDate}</span>.
                    </div>
                  </div>
                ) : (
                  <NarrativeSummary data={summaryData} />
                )}

                {/* Hourly Bar */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                    Hourly Alert Distribution · Peak: {String(summaryData.peakHour).padStart(2,'0')}:00
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'flex-end', gap: '2px',
                    height: '48px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '6px 8px',
                  }}>
                    {summaryData.byHour.map((count, hr) => {
                      const max = Math.max(...summaryData.byHour, 1)
                      return (
                        <div
                          key={hr}
                          title={`${String(hr).padStart(2,'0')}:00 — ${count} alerts`}
                          style={{
                            flex: 1, height: `${Math.max((count/max)*100, 4)}%`, borderRadius: '2px',
                            background: hr === summaryData.peakHour ? '#ef4444' : count > 0 ? '#3b82f6' : '#1e293b',
                            transition: 'height 0.3s',
                          }}
                        />
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#475569', marginTop: '3px', padding: '0 2px' }}>
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </div>

                {summaryData.camRows.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>📹 Alerts by Camera</div>
                    {summaryData.camRows.map(([cam, cnt]) => (
                      <div key={cam} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cam}</div>
                        <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${(cnt/summaryData.camRows[0][1])*100}%`, height: '100%', background: '#3b82f6', borderRadius: '3px' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600, width: '22px', textAlign: 'right' }}>{cnt}</div>
                      </div>
                    ))}
                  </div>
                )}

                {summaryData.zoneRows.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>📍 Alerts by Zone</div>
                    {summaryData.zoneRows.map(([zone, cnt]) => (
                      <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone}</div>
                        <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${(cnt/summaryData.zoneRows[0][1])*100}%`, height: '100%', background: '#10b981', borderRadius: '3px' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 600, width: '22px', textAlign: 'right' }}>{cnt}</div>
                      </div>
                    ))}
                  </div>
                )}

                {summaryData.recentAlerts.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>🕐 Recent Alerts</div>
                    {summaryData.recentAlerts.map((a, i) => (
                      <div key={a._id || i} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 10px',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '7px', marginBottom: '5px',
                      }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: sevColor(a.severity), flexShrink: 0, marginTop: '4px' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '11.5px', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.message || a.title || 'Alert'}
                          </div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                            {a.zone ? `${a.zone} · ` : ''}{a.camera || ''}
                          </div>
                        </div>
                        <div style={{ fontSize: '10px', color: '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {formatTime(a.timestamp || a.created_at || a.time)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '9px 16px', borderTop: '1px solid var(--border, #334155)',
            background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '10px', color: '#475569' }}>YOLOIntel · {siteName}</span>
            <span style={{ fontSize: '10px', color: '#475569' }}>{summaryDate}</span>
          </div>
        </div>
      )}

      {/* ── Handover Email Modal ── */}
      {handoverEmailOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setHandoverEmailOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
            width: 440, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'rgba(168,85,247,0.2)', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📧</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>Send Report to Site Manager</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Shift Handover · {handoverDate}</div>
              </div>
              <button onClick={() => setHandoverEmailOpen(false)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #334155', borderRadius: 6, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(168,85,247,0.25)', color: '#c4b5fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>AL</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600 }}>Alphaleo Databricks</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>alphaleodatabricks@gmail.com</div>
              </div>
              <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c4b5fd', fontSize: 10, padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(168,85,247,0.3)', fontFamily: 'monospace' }}>Site Manager</span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>Subject</div>
            <input
              value={`Shift Handover Report — ${handoverDate} · YOLOIntel`}
              readOnly
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', borderRadius: 6, padding: '7px 12px', color: '#f1f5f9', fontSize: 12, marginBottom: 12, outline: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>Message</div>
            <textarea
              defaultValue={`Hi,\n\nPlease find attached the Shift Handover Report for ${handoverDate}.\n\nRegards,\nYOLOIntel Admin`}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid #334155', borderRadius: 6, padding: '7px 12px', color: '#f1f5f9', fontSize: 12, marginBottom: 12, outline: 'none', resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
            />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor: '#a855f7', marginTop: 2 }} />
              <div><div style={{ fontSize: 12, color: '#e2e8f0' }}>Attach PDF report</div><div style={{ fontSize: 10, color: '#475569' }}>Full shift handover document</div></div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor: '#a855f7', marginTop: 2 }} />
              <div><div style={{ fontSize: 12, color: '#e2e8f0' }}>Include KPI summary</div><div style={{ fontSize: 10, color: '#475569' }}>Cameras, workers, PPE, alerts snapshot</div></div>
            </label>
            {handoverEmailSent && (
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6, padding: '10px 14px', color: '#4ade80', fontSize: 12, marginTop: 8 }}>
                ✅ Report sent to alphaleodatabricks@gmail.com
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid #334155' }}>
              <button onClick={() => setHandoverEmailOpen(false)} style={{ background: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '7px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={sendHandoverEmail} disabled={handoverEmailSending} style={{ background: '#7c3aed', border: 'none', color: '#fff', padding: '7px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {handoverEmailSending ? '⏳ Sending...' : '📤 Send Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
