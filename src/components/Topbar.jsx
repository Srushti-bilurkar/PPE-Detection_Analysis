import { useState, useEffect, useRef } from 'react'
import { useUser } from './UserContext'

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

const MONTH_OPTIONS = [
  ['01','January'],['02','February'],['03','March'],
  ['04','April'],  ['05','May'],     ['06','June'],
  ['07','July'],   ['08','August'],  ['09','September'],
  ['10','October'],['11','November'],['12','December'],
]

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

function parseTimestamp(ts) {
  if (!ts) return null
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts
  if (typeof ts === 'number') {
    const d = ts > 1e10 ? new Date(ts) : new Date(ts * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(ts)
  if (!isNaN(d.getTime())) return d
  const cleaned = ts.replace(' IST', '').replace(' ', 'T')
  const d2 = new Date(cleaned)
  return isNaN(d2.getTime()) ? null : d2
}

function formatTime(ts) {
  const d = parseTimestamp(ts)
  if (!d) return '—'
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatHandoverDateStr(handoverDate) {
  if (!handoverDate) return '—'
  if (handoverDate.length === 4) return `Full Year ${handoverDate}`
  if (handoverDate.length === 7) {
    const [yr, mo] = handoverDate.split('-')
    return new Date(Number(yr), Number(mo) - 1, 1)
      .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  }
  return new Date(handoverDate + 'T12:00:00')
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' })
}

async function fetchDayTrend(date, shift = 'both') {
  try {
    const params = new URLSearchParams({ date, shift })
    const raw = await fetch(`/api/hourly-trend?${params}`).then(r => r.ok ? r.json() : [])
    const arr = Array.isArray(raw) ? raw : []
    return {
      safe:     arr.reduce((s, d) => s + (d.workers_active || 0), 0),
      violated: arr.reduce((s, d) => s + (d.violations     || 0), 0),
    }
  } catch {
    return { safe: 0, violated: 0 }
  }
}

function buildKpiFromTotals(safe, violated, alertsArr) {
  const total      = safe + violated
  const compliance = total > 0 ? Math.round((safe / total) * 100) : 100
  const critical   = alertsArr.filter(a => a.severity === 'critical').length
  const warnings   = alertsArr.filter(a => a.severity === 'warning').length
  return {
    workers_on_site:  total,
    max_safe_workers: safe,
    violated_workers: violated,
    ppe_compliance:   compliance,
    critical_alerts:  critical,
    warning_alerts:   warnings,
  }
}

function buildHandoverHTML({ alerts, kpi, activeTab, handoverDate, siteName }) {
  const now = new Date()
  const generatedDateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const generatedTimeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  const forDateStr = formatHandoverDateStr(handoverDate)
  const site = siteName || 'Construction Site'

  const totalWorkers    = kpi.workers_on_site  ?? 0
  const maxSafeWorkers  = kpi.max_safe_workers ?? 0
  const violatedWorkers = kpi.violated_workers ?? 0
  const ppeCompliance   = kpi.ppe_compliance   ?? 0
  const critical        = kpi.critical_alerts  ?? 0
  const warnings        = kpi.warning_alerts   ?? 0

  const alertViolations = alerts.filter(a =>
    a.severity === 'critical' || a.severity === 'warning'
  )

  const sc = s => s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : '#3b82f6'

  const allViolationRows = alertViolations.map(a => {
    const ackBadge = a.acknowledged
      ? `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;
          background:#052e16;color:#4ade80;border:1px solid #16a34a;">✓ ACK</span>`
      : `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;
          background:#450a0a;color:#f87171;border:1px solid #dc2626;">OPEN</span>`

    const ackTimeStr = a.ack_time
      ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">Ack at: ${a.ack_time}</div>`
      : ''

    const commentRows = (a.comments || []).map(cm =>
      `<div style="margin-top:4px;padding:4px 8px;background:rgba(59,130,246,0.07);
        border-left:2px solid #3b82f6;border-radius:3px;font-size:10px;color:#94a3b8;">
        💬 <strong style="color:#60a5fa;">${cm.worker_id || 'User'}</strong>: ${cm.text || cm.comment || ''}
        <span style="color:#475569;margin-left:6px;">${cm.added_at || ''}</span>
      </div>`
    ).join('')

    return `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;font-size:11px;vertical-align:top;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
          background:${sc(a.severity)};margin-right:8px;vertical-align:middle;flex-shrink:0;"></span>
        ${a.message || a.title || 'Alert'}
        ${commentRows}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:${sc(a.severity)};
        font-weight:700;text-transform:uppercase;font-size:10px;vertical-align:top;">${a.severity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:10px;word-break:break-word;vertical-align:top;">${a.zone || a.camera || '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;vertical-align:top;">
              ${ackBadge}${ackTimeStr}
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#64748b;font-size:10px;word-break:break-word;vertical-align:top;">
              ${a.timestamp || a.created_at || a.time || a.date || JSON.stringify(Object.keys(a))}
      </td>
    </tr>`
  }).join('')

  const kpiCards = [
    {
      label: 'WORKERS SAFE ON-SITE',
      value: String(maxSafeWorkers),
      sub:   `${maxSafeWorkers} safe · ${violatedWorkers} violated`,
      icon:  '👷',
      color: '#22c55e',
      border:'#22c55e',
    },
    {
      label: 'MAX VIOLATIONS',
      value: String(violatedWorkers),
      sub:   'Peak violations detected',
      icon:  '🚨',
      color: '#ef4444',
      border:'#ef4444',
    },
    {
      label: 'PPE COMPLIANCE',
      value: ppeCompliance + '%',
      sub:   'Shift average · All cameras',
      icon:  '🦺',
      color: '#f59e0b',
      border:'#f59e0b',
    },
    {
      label: 'PPE VIOLATIONS',
      value: (100 - ppeCompliance).toFixed(1) + '%',
      sub:   'Workers without full PPE',
      icon:  '⚠️',
      color: '#ef4444',
      border:'#ef4444',
    },
  ].map(k => `
    <div style="background:#1e293b;border-radius:10px;padding:16px 14px;
      border-top:3px solid ${k.border};min-width:0;">
      <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;
        letter-spacing:1px;margin-bottom:10px;">${k.icon} ${k.label}</div>
      <div style="font-size:32px;font-weight:700;color:${k.color};line-height:1;">
        ${k.value}
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:6px;">${k.sub}</div>
    </div>`).join('')

  const ackedCount   = alertViolations.filter(a => a.acknowledged).length
  const openCount    = alertViolations.filter(a => !a.acknowledged).length
  const withComments = alertViolations.filter(a => (a.comments || []).length > 0).length

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
      div[style*="max-height"] { max-height:none !important; overflow:visible !important; }
      table { table-layout:fixed; width:100% !important; }
      td, th { word-break:break-word; overflow-wrap:break-word; }
    }
  </style>
</head>
<body>
  <!-- HEADER -->
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

  <div style="padding:20px 28px;">

    <!-- KPI CARDS -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        📊 KPI Summary — ${forDateStr}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;">${kpiCards}</div>
    </div>

    <!-- SAFETY SUMMARY -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        🛡️ Safety Summary
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        <div style="background:#1e1b4b;border:1px solid #4f46e5;border-radius:10px;padding:18px;">
          <div style="font-size:11px;color:#a5b4fc;font-weight:700;text-transform:uppercase;
            letter-spacing:1px;margin-bottom:8px;">💬 Commented Violations</div>
          <div style="font-size:36px;font-weight:700;color:#818cf8;">${withComments}</div>
          <div style="font-size:11px;color:#a5b4fc;margin-top:4px;">violations with supervisor comments attached</div>
        </div>
        <div style="background:#450a0a;border:1px solid #dc2626;border-radius:10px;padding:18px;">
          <div style="font-size:11px;color:#fca5a5;font-weight:700;text-transform:uppercase;
            letter-spacing:1px;margin-bottom:8px;">🚨 Alerts Summary</div>
          <div style="font-size:36px;font-weight:700;color:#ef4444;">${alerts.length}</div>
          <div style="font-size:11px;color:#fca5a5;margin-top:4px;">
            ${critical} critical · ${warnings} warnings · PPE: ${ppeCompliance}%
          </div>
        </div>
        <div style="background:#1e1b4b;border:1px solid #4f46e5;border-radius:10px;padding:18px;">
          <div style="font-size:11px;color:#a5b4fc;font-weight:700;text-transform:uppercase;
            letter-spacing:1px;margin-bottom:8px;">✔ Acknowledgement</div>
          <div style="font-size:36px;font-weight:700;color:#818cf8;">${ackedCount}</div>
          <div style="font-size:11px;color:#a5b4fc;margin-top:4px;">
            acknowledged · ${openCount} open · ${withComments} with comments
          </div>
        </div>
      </div>
    </div>

    <!-- ALL VIOLATIONS WITH ACK + COMMENTS -->
    <div style="margin-bottom:32px;">
      <div style="font-size:10px;letter-spacing:2px;color:#64748b;text-transform:uppercase;
        margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        🚨 All Violations Detected — ${forDateStr}
        <span style="color:#ef4444;font-weight:700;margin-left:8px;">(${alertViolations.length} total)</span>
        <span style="color:#22c55e;font-weight:700;margin-left:8px;">· ${ackedCount} acknowledged</span>
        <span style="color:#f59e0b;font-weight:700;margin-left:8px;">· ${openCount} open</span>
      </div>
      ${alertViolations.length > 0 ? `
      <div style="max-height:420px;overflow-y:auto;border-radius:10px;">
      <table style="background:#1e293b;border-radius:10px;table-layout:fixed;width:100%;">
      <colgroup>
      <col style="width:42%"/>
      <col style="width:12%"/>
      <col style="width:22%"/>
      <col style="width:12%"/>
      <col style="width:12%"/>
      </colgroup>
      <thead>
      <tr style="background:#0f172a;">
      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">
              Violation &amp; Comments
      </th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Severity</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Zone / Camera</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Status</th>
      <th style="padding:8px 10px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;">Time</th>
      </tr>
      </thead>
        <tbody>${allViolationRows}</tbody>
      </table></div>` : `
      <div style="background:#1e293b;border-radius:10px;padding:24px;text-align:center;color:#64748b;font-size:12px;">
        ✅ No violations recorded for this period.
      </div>`}
    </div>

    <!-- HANDOVER NOTES -->
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
            <span style="color:${ppeCompliance >= 80 ? '#22c55e' : '#ef4444'};font-weight:700;">
              ${ppeCompliance}%
            </span> — ${ppeCompliance < 50 ? '⚠️ CRITICALLY LOW — immediate corrective action required.' : 'monitor zones with recent violations.'}
          </div>
          <div>• <span style="color:#f1f5f9;font-weight:700;">${ackedCount}</span> violations acknowledged · <span style="color:#ef4444;font-weight:700;">${openCount}</span> still open — ensure all open incidents are resolved.</div>
          <div>• <span style="color:#818cf8;font-weight:700;">${withComments}</span> violations have supervisor comments attached — review before handover.</div>
          <div>• <span style="color:#f1f5f9;font-weight:700;">${maxSafeWorkers}</span> workers maintained full PPE compliance during this period.</div>
          <div>• <span style="color:#ef4444;font-weight:700;">${alerts.length}</span> total alerts recorded — ensure all incidents are acknowledged and actioned.</div>
          <div>• Total workers tracked: <span style="color:#f1f5f9;font-weight:700;">${totalWorkers || '—'}</span>.</div>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid #334155;color:#475569;font-size:12px;">
            Outgoing Supervisor: _________________________ &nbsp;&nbsp; Time: ______________
          </div>
          <div style="margin-top:8px;color:#475569;font-size:12px;">
            Incoming Supervisor: _________________________ &nbsp;&nbsp; Time: ______________
          </div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="padding-top:18px;border-top:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#475569;font-size:10px;">YOLOIntel · ${site} · Auto-generated Shift Handover Report</div>
      <div style="color:#475569;font-size:10px;">
        Report Covers: ${forDateStr} · Generated: ${generatedDateStr} ${generatedTimeStr}
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

// ── Mini Calendar ─────────────────────────────────────────────────────────
function MiniCalendar({ selectedDate, onSelect }) {
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const selParts   = selectedDate.split('-').map(Number)
  const [viewYear,  setViewYear]  = useState(selParts[0])
  const [viewMonth, setViewMonth] = useState(selParts[1] - 1)
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayParts  = todayISO().split('-').map(Number)
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y=>y-1) } else setViewMonth(m=>m-1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y=>y+1) } else setViewMonth(m=>m+1) }
  const pickDay   = d => {
    const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    if (iso > todayISO()) return
    onSelect(iso)
  }
  const isFuture = d => {
    const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    return iso > todayISO()
  }
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid #334155', borderRadius:8, padding:'12px 14px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <button onClick={prevMonth} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:18, padding:'0 6px' }}>‹</button>
        <span style={{ fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:18, padding:'0 6px' }}>›</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:10, color:'#64748b', padding:'2px 0', fontWeight:600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((d,i) => {
          if (!d) return <div key={`e${i}`} />
          const isSel   = selParts[0]===viewYear && selParts[1]===viewMonth+1 && selParts[2]===d
          const isToday = todayParts[0]===viewYear && todayParts[1]===viewMonth+1 && todayParts[2]===d
          const fut     = isFuture(d)
          return (
            <div key={d} onClick={() => !fut && pickDay(d)}
              style={{
                textAlign:'center', fontSize:11, padding:'5px 2px', borderRadius:5,
                cursor: fut ? 'not-allowed' : 'pointer',
                background: isSel ? '#7c3aed' : isToday ? 'rgba(124,58,237,0.18)' : 'transparent',
                color: fut ? '#334155' : isSel ? '#fff' : isToday ? '#c4b5fd' : '#e2e8f0',
                fontWeight: isSel||isToday ? 700 : 400,
                border: isToday&&!isSel ? '1px solid rgba(124,58,237,0.5)' : '1px solid transparent',
              }}
              onMouseEnter={e => { if (!isSel&&!fut) e.currentTarget.style.background='rgba(255,255,255,0.08)' }}
              onMouseLeave={e => { if (!isSel&&!fut) e.currentTarget.style.background=isToday?'rgba(124,58,237,0.18)':'transparent' }}
            >{d}</div>
          )
        })}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
export default function Topbar({
  activeTab,
  setActiveTab,
  alerts   = [],
  kpi      = {},
  zones    = [],
  siteName = 'Construction Site',
}) {
  // ✅ FIX: useUser() moved inside the component body (was incorrectly at module level)
  const userCtx    = useUser()
  const currentUser = userCtx?.currentUser
  const isAdmin     = userCtx?.isAdmin

  const [notifOpen,            setNotifOpen]            = useState(false)
  const [lightMode,            setLightMode]            = useState(false)
  const [readIds,              setReadIds]              = useState(new Set())
  const [handovering,          setHandovering]          = useState(false)
  const [handoverOpen,         setHandoverOpen]         = useState(false)
  const [handoverDate,         setHandoverDate]         = useState(todayISO())
  const [handoverEmailOpen,    setHandoverEmailOpen]    = useState(false)
  const [handoverEmailSent,    setHandoverEmailSent]    = useState(false)
  const [handoverEmailSending, setHandoverEmailSending] = useState(false)
  const [reportPeriod,         setReportPeriod]         = useState('day')
  const [calendarVisible,      setCalendarVisible]      = useState(false)
  const [summaryOpen,          setSummaryOpen]          = useState(false)
  const [summaryDate,          setSummaryDate]          = useState(todayISO())
  const [summaryData,          setSummaryData]          = useState(null)
  const [summaryLoading,       setSummaryLoading]       = useState(false)
  const [summaryError,         setSummaryError]         = useState('')

  const panelRef   = useRef(null)
  const bellRef    = useRef(null)
  const summaryRef = useRef(null)
  const clock      = useClock()

  const [title, sub] = TAB_TITLES[activeTab] || [activeTab, '']
  const unread = alerts.filter(a => !readIds.has(a._id)).length

  function switchPeriod(val) { setReportPeriod(val); setCalendarVisible(false) }

  function toggleNotif() {
    if (!notifOpen) setReadIds(new Set(alerts.map(a => a._id)))
    setNotifOpen(v => !v)
  }
  function toggleTheme() {
    const next = !lightMode
    setLightMode(next)
    document.body.classList.toggle('light-mode', next)
  }
  function handleHandover() { setHandoverOpen(v => !v) }

  async function generateHandover() {
    setHandovering(true)
    setHandoverOpen(false)
    try {
      let alertsUrl, periodLabel, datesForTrend

      if (reportPeriod === 'month') {
        const yr          = handoverDate.slice(0, 4)
        const mo          = handoverDate.slice(5, 7)
        const daysInMonth = new Date(Number(yr), Number(mo), 0).getDate()
        const dateFrom    = `${yr}-${mo}-01`
        const dateTo      = `${yr}-${mo}-${String(daysInMonth).padStart(2, '0')}`
        periodLabel       = handoverDate.slice(0, 7)
        alertsUrl         = `/api/alerts-full?date_from=${dateFrom}&date_to=${dateTo}&limit=9999`
        datesForTrend     = Array.from({ length: daysInMonth }, (_, i) =>
          `${yr}-${mo}-${String(i + 1).padStart(2, '0')}`)

      } else if (reportPeriod === 'year') {
        const yr      = handoverDate.slice(0, 4)
        periodLabel   = yr
        alertsUrl     = `/api/alerts-full?date_from=${yr}-01-01&date_to=${yr}-12-31&limit=9999`
        const isLeap  = (Number(yr) % 4 === 0 && Number(yr) % 100 !== 0) || Number(yr) % 400 === 0
        const days    = isLeap ? 366 : 365
        datesForTrend = Array.from({ length: days }, (_, i) => {
          const d = new Date(Number(yr), 0, i + 1)
          return `${yr}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        })

      } else {
        periodLabel   = handoverDate
        alertsUrl     = `/api/alerts-full?date=${handoverDate}&limit=9999`
        datesForTrend = [handoverDate]
      }

      const [alertsRes, ...dayTrends] = await Promise.all([
        fetch(alertsUrl).then(r => r.ok ? r.json() : []),
        ...datesForTrend.map(d => fetchDayTrend(d, 'both')),
      ])

      const allAlerts     = Array.isArray(alertsRes) ? alertsRes : []
      const totalSafe     = dayTrends.reduce((s, d) => s + d.safe,     0)
      const totalViolated = dayTrends.reduce((s, d) => s + d.violated, 0)
      const computedKpi   = buildKpiFromTotals(totalSafe, totalViolated, allAlerts)

      openHandoverPDF({
        alerts:       allAlerts,
        kpi:          computedKpi,
        activeTab,
        zones:        [],
        handoverDate: periodLabel,
        siteName,
      })

    } catch (e) {
      console.error('Handover fetch failed:', e)
      openHandoverPDF({ alerts, kpi, activeTab, zones: [], handoverDate, siteName })
    }

    setTimeout(() => setHandovering(false), 1500)
  }

  async function sendHandoverEmail() {
    setHandoverEmailSending(true)
    try {
      const periodText  = reportPeriod === 'day' ? 'Daily' : reportPeriod === 'month' ? 'Monthly' : 'Yearly'
      const periodLabel = reportPeriod === 'day'
        ? handoverDate
        : reportPeriod === 'month'
        ? handoverDate.slice(0, 7)
        : handoverDate.slice(0, 4)

      let datesForTrend, alertsUrl

      if (reportPeriod === 'month') {
        const yr          = periodLabel.slice(0, 4)
        const mo          = periodLabel.slice(5, 7)
        const daysInMonth = new Date(Number(yr), Number(mo), 0).getDate()
        const dateFrom    = `${yr}-${mo}-01`
        const dateTo      = `${yr}-${mo}-${String(daysInMonth).padStart(2, '0')}`
        alertsUrl         = `/api/alerts-full?date_from=${dateFrom}&date_to=${dateTo}&limit=9999`
        datesForTrend     = Array.from({ length: daysInMonth }, (_, i) =>
          `${yr}-${mo}-${String(i + 1).padStart(2, '0')}`)

      } else if (reportPeriod === 'year') {
        const yr      = periodLabel
        const isLeap  = (Number(yr) % 4 === 0 && Number(yr) % 100 !== 0) || Number(yr) % 400 === 0
        const days    = isLeap ? 366 : 365
        alertsUrl     = `/api/alerts-full?date_from=${yr}-01-01&date_to=${yr}-12-31&limit=9999`
        datesForTrend = Array.from({ length: days }, (_, i) => {
          const d = new Date(Number(yr), 0, i + 1)
          return `${yr}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        })

      } else {
        alertsUrl     = `/api/alerts-full?date=${periodLabel}&limit=9999`
        datesForTrend = [periodLabel]
      }

      console.log(`📅 Fetching ${periodText} data for ${periodLabel} — ${datesForTrend.length} day(s)…`)

      const [alertsRes, ...dayTrends] = await Promise.all([
        fetch(alertsUrl).then(r => r.ok ? r.json() : []),
        ...datesForTrend.map(d => fetchDayTrend(d, 'both')),
      ])

      const allAlerts     = Array.isArray(alertsRes) ? alertsRes : []
      const totalSafe     = dayTrends.reduce((s, d) => s + d.safe,     0)
      const totalViolated = dayTrends.reduce((s, d) => s + d.violated, 0)
      const mergedKpi     = buildKpiFromTotals(totalSafe, totalViolated, allAlerts)

      console.log(`✅ ${allAlerts.length} alerts · safe: ${totalSafe} · violated: ${totalViolated} · compliance: ${mergedKpi.ppe_compliance}%`)

      const reportHTML = buildHandoverHTML({
        alerts:       allAlerts,
        kpi:          mergedKpi,
        activeTab,
        zones,
        handoverDate: periodLabel,
        siteName,
      })

      const res = await fetch('http://localhost:5000/api/send-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      'alphaleoyolointel@gmail.com',
          subject: `Shift Handover Report — ${periodLabel} (${periodText}) · YOLOIntel`,
          message: `Hi Alphaleo,\n\nThe ${periodText} Shift Handover Report for ${periodLabel} is ready.\nTotal violations: ${allAlerts.length} | Acknowledged: ${allAlerts.filter(a => a.acknowledged).length} | Open: ${allAlerts.filter(a => !a.acknowledged).length}\n\nPlease find the PDF attached.\n\nRegards,\nYOLOIntel Admin`,
          reportHTML,
        }),
      })

      const data = await res.json()
      if (data.ok) {
        setHandoverEmailSending(false)
        setHandoverEmailSent(true)
        setTimeout(() => { setHandoverEmailOpen(false); setHandoverEmailSent(false) }, 2000)
      } else {
        throw new Error(data.error || 'Unknown server error')
      }

    } catch (err) {
      setHandoverEmailSending(false)
      alert('Failed to send email: ' + err.message)
    }
  }

  async function fetchSummaryForDate(date) {
    setSummaryLoading(true); setSummaryError(''); setSummaryData(null)
    try {
      const res = await fetch(`http://localhost:3001/api/summary/${date}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const json = await res.json()
      const camRows  = Object.entries(json.byCamera || {}).sort((a,b) => b[1]-a[1])
      const zoneRows = Object.entries(json.byZone   || {}).sort((a,b) => b[1]-a[1])
      const byHour   = json.byHour || Array(24).fill(0)
      const peakHour = byHour.indexOf(Math.max(...byHour))
      setSummaryData({
        date, total:json.total, critical:json.critical, warnings:json.warnings, info:json.info,
        camRows, zoneRows, byHour, peakHour, snapshotCount:json.snapshotCount,
        ppeCompliance:json.ppeCompliance, recentAlerts:json.recentAlerts||[], isToday:date===todayISO(),
      })
    } catch (err) {
      setSummaryError(`Failed to load summary: ${err.message}`)
    } finally {
      setSummaryLoading(false)
    }
  }

  function handleSummaryClick() {
    if (!summaryOpen) { setSummaryOpen(true); fetchSummaryForDate(summaryDate) }
    else setSummaryOpen(false)
  }
  function handleDateChange(e) { setSummaryDate(e.target.value); fetchSummaryForDate(e.target.value) }

  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target) &&
          bellRef.current  && !bellRef.current.contains(e.target)) setNotifOpen(false)
      if (summaryRef.current && !summaryRef.current.contains(e.target) &&
          !e.target.closest('#summary-btn')) setSummaryOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function timeAgo(ts) {
    const d = parseTimestamp(ts)
    if (!d) return ''
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff/60)} min ago`
    if (diff < 86400) return `${Math.floor(diff/3600)} hr ago`
    return d.toLocaleDateString('en-IN')
  }

  const sevColor = s => s==='critical'?'#ef4444':s==='warning'?'#f59e0b':'#3b82f6'

  const StatCard = ({ icon, label, value, color }) => (
    <div style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${color}33`, borderRadius:'10px', padding:'10px 12px', textAlign:'center' }}>
      <div style={{ fontSize:'16px', marginBottom:'4px' }}>{icon}</div>
      <div style={{ fontSize:'20px', fontWeight:700, color }}>{value}</div>
      <div style={{ fontSize:'10px', color:'#64748b', marginTop:'2px' }}>{label}</div>
    </div>
  )

  function NarrativeSummary({ data }) {
    const ppeColor  = data.ppeCompliance >= 80 ? '#34d399' : data.ppeCompliance >= 60 ? '#fbbf24' : '#f87171'
    const ppeBorder = data.ppeCompliance >= 80 ? '#10b981' : data.ppeCompliance >= 60 ? '#f59e0b' : '#ef4444'
    const ppeText   = data.ppeCompliance >= 80 ? 'Workers maintained good safety gear adherence.'
      : data.ppeCompliance >= 60 ? 'Some workers were found without required PPE — follow-up needed.'
      : 'PPE compliance was critically low — immediate action required.'
    const rows = []
    rows.push(<div key="alerts" style={rowStyle('#8b5cf6')}>🔔 A total of <B color="#f1f5f9">{data.total} alert{data.total!==1?'s':''}</B> were recorded — <B color="#ef4444">{data.critical} critical</B>, <B color="#f59e0b">{data.warnings} warning{data.warnings!==1?'s':''}</B>, and <B color="#3b82f6">{data.info} informational</B>.</div>)
    if (kpi.workers_on_site != null) rows.push(<div key="workers" style={rowStyle('#10b981')}>👷 <B color="#f1f5f9">{kpi.workers_on_site} workers</B> were active on-site{zones.length>0&&<> across <B color="#34d399">{zones.length} zone{zones.length!==1?'s':''}</B></>}.</div>)
    if (data.ppeCompliance != null) rows.push(<div key="ppe" style={rowStyle(ppeBorder)}>🦺 PPE compliance was <B color={ppeColor}>{data.ppeCompliance}%</B>. {ppeText}</div>)
    if (data.camRows.length>0) rows.push(<div key="cam" style={rowStyle('#3b82f6')}>📹 Highest alert activity from camera <B color="#60a5fa">{data.camRows[0][0]}</B> with <B color="#f1f5f9">{data.camRows[0][1]} alert{data.camRows[0][1]!==1?'s':''}</B>{data.camRows.length>1&&<>, followed by <B color="#60a5fa">{data.camRows[1][0]}</B> ({data.camRows[1][1]})</>}.</div>)
    if (data.total>0) rows.push(<div key="peak" style={rowStyle('#f59e0b')}>🕐 Peak at <B color="#fbbf24">{String(data.peakHour).padStart(2,'0')}:00 IST</B> with <B color="#f1f5f9">{data.byHour[data.peakHour]} alert{data.byHour[data.peakHour]!==1?'s':''}</B>.</div>)
    if (data.critical>0) rows.push(<div key="crit" style={{...rowStyle('#ef4444'),background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)'}}>⚠️ <B color="#fca5a5">{data.critical} critical alert{data.critical!==1?'s':''}</B> require{data.critical===1?'s':''} immediate review.</div>)
    return (
      <div style={{ background:'rgba(59,130,246,0.05)', border:'1px solid rgba(59,130,246,0.15)', borderRadius:'10px', padding:'14px 16px', marginBottom:'16px' }}>
        <div style={{ fontSize:'10px', color:'#64748b', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'10px' }}>
          📝 Site Narrative — {new Date(data.date+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'7px', fontSize:'13px', color:'#cbd5e1', lineHeight:'1.7' }}>{rows}</div>
      </div>
    )
  }

  function rowStyle(borderColor) { return { padding:'8px 12px', background:'rgba(255,255,255,0.03)', borderRadius:'7px', borderLeft:`3px solid ${borderColor}` } }
  function B({ color, children }) { return <span style={{ color, fontWeight:700 }}>{children}</span> }

  const periodLabel = reportPeriod==='day' ? handoverDate : reportPeriod==='month' ? handoverDate.slice(0,7) : handoverDate.slice(0,4)
  const periodText  = reportPeriod==='day' ? 'Daily' : reportPeriod==='month' ? 'Monthly' : 'Yearly'

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
          {unread > 0 && <div id="notif-badge" style={{ display:'flex' }}>{unread}</div>}
        </button>
        <button className="topbar-btn" id="theme-toggle" onClick={toggleTheme}>
          {lightMode ? '☀️ Light' : '🌙 Dark'}
        </button>

        {/* Handover button */}
        <div style={{ position:'relative' }}>
          <button className="topbar-btn" onClick={handleHandover} disabled={handovering}
            title="Generate Shift Handover PDF"
            style={{ opacity:handovering?0.6:1, cursor:handovering?'wait':'pointer' }}>
            {handovering ? '⏳ Generating...' : '📋 Handover'}
          </button>
          {handoverOpen && (
            <div style={{ position:'absolute', top:'110%', right:0, zIndex:9999, background:'#1e293b',
              border:'1px solid #334155', borderRadius:10, padding:'14px 16px', width:260,
              boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>📅 Handover report for date:</div>
              <div style={{ fontSize:10, color:'#475569', marginBottom:10 }}>Selected date will appear as "Report Covers".</div>
              <input type="date" value={handoverDate} max={todayISO()} onChange={e=>setHandoverDate(e.target.value)}
                style={{ width:'100%', background:'rgba(255,255,255,0.07)', border:'1px solid #334155',
                  borderRadius:6, padding:'5px 10px', color:'#f1f5f9', fontSize:12, marginBottom:10, colorScheme:'dark' }} />
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={generateHandover}
                  style={{ flex:1, background:'#3b82f6', border:'none', borderRadius:6, padding:'7px 0', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  Generate PDF
                </button>
                <button onClick={() => setHandoverOpen(false)}
                  style={{ background:'rgba(255,255,255,0.07)', border:'1px solid #334155', borderRadius:6, padding:'7px 10px', color:'#94a3b8', fontSize:12, cursor:'pointer' }}>✕</button>
              </div>
              <button onClick={() => { setHandoverEmailOpen(true); setHandoverEmailSent(false); setReportPeriod('day'); setCalendarVisible(false); setHandoverOpen(false) }}
                style={{ width:'100%', marginTop:8, background:'rgba(168,85,247,0.18)', border:'1px solid rgba(168,85,247,0.35)',
                  borderRadius:6, padding:'7px 0', color:'#c4b5fd', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                📧 Email to Site Manager
              </button>
            </div>
          )}
        </div>

        <button id="summary-btn" className={`topbar-btn${summaryOpen?' active':''}`} onClick={handleSummaryClick} title="Date-wise site summary">
          📊 Summary
        </button>

        {currentUser && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 10,
            background: isAdmin ? 'rgba(59,130,246,0.1)' : 'rgba(100,116,139,0.1)',
            border: `1px solid ${isAdmin ? 'rgba(59,130,246,0.25)' : 'rgba(100,116,139,0.25)'}`,
            fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
            color: isAdmin ? '#93c5fd' : '#94a3b8',
            whiteSpace: 'nowrap',
          }}>
            {currentUser.name} · {isAdmin ? 'ADMIN' : 'USER'}
          </div>
        )}
      </div>

      {/* Screen tabs */}
      <div className="screen-tabs">
        {TABS.map(id => (
          <div key={id} className={`screen-tab${activeTab===id?' active':''}`} onClick={() => setActiveTab(id)}>
            {TAB_LABELS[id]}
          </div>
        ))}
      </div>

      {/* Notification panel */}
      <div id="notif-panel" ref={panelRef} className={notifOpen?'open':''}>
        <div className="notif-header">
          <div className="notif-header-title">🔔 Notifications</div>
          <div className="notif-close" onClick={() => setNotifOpen(false)}>✕</div>
        </div>
        <div id="notif-list">
          {alerts.length===0 && <div style={{ padding:'16px', color:'var(--text-muted)', fontSize:'12px' }}>No alerts yet</div>}
          {alerts.map(a => {
            const sev    = a.severity==='critical'?'critical':a.severity==='warning'?'warning':'info'
            const isRead = readIds.has(a._id)
            return (
              <div key={a._id} className={`notif-item ${sev}${isRead?' read':''}`}>
                <div className="notif-dot" />
                <div className="notif-body">
                  <div className="notif-msg">{a.message||a.title||'Alert'}{a.camera?` · ${a.camera}`:''}{a.zone?` · ${a.zone}`:''}</div>
                  <div className="notif-time">{timeAgo(a.timestamp||a.created_at||a.time||'')}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary panel */}
      {summaryOpen && (
        <div ref={summaryRef} style={{ position:'fixed', top:'70px', right:'16px', width:'440px', maxHeight:'640px',
          background:'var(--bg-card,#1e293b)', border:'1px solid var(--border,#334155)', borderRadius:'14px',
          boxShadow:'0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.15)', zIndex:9999,
          display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border,#334155)',
            background:'linear-gradient(135deg,rgba(59,130,246,0.1) 0%,rgba(16,185,129,0.06) 100%)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div style={{ width:'34px', height:'34px', borderRadius:'8px', background:'linear-gradient(135deg,#3b82f6,#10b981)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'16px' }}>📊</div>
              <div>
                <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text,#f1f5f9)' }}>Daily Site Summary</div>
                <div style={{ fontSize:'10px', color:'#64748b', marginTop:'1px' }}>{siteName} · Alert & Zone Breakdown</div>
              </div>
            </div>
            <button onClick={() => setSummaryOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'18px', lineHeight:1, padding:'2px 6px' }}>×</button>
          </div>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border,#334155)', display:'flex', alignItems:'center', gap:'10px', background:'rgba(0,0,0,0.15)' }}>
            <span style={{ fontSize:'11px', color:'#64748b', whiteSpace:'nowrap' }}>📅 View date:</span>
            <input type="date" value={summaryDate} max={todayISO()} onChange={handleDateChange}
              style={{ flex:1, background:'rgba(255,255,255,0.07)', border:'1px solid #334155', borderRadius:'6px', padding:'5px 10px', color:'#f1f5f9', fontSize:'12px', cursor:'pointer', colorScheme:'dark' }} />
            {summaryData?.isToday && (
              <span style={{ fontSize:'10px', color:'#10b981', fontWeight:600, padding:'2px 8px', background:'rgba(16,185,129,0.1)', borderRadius:'4px', border:'1px solid rgba(16,185,129,0.25)', whiteSpace:'nowrap' }}>● LIVE</span>
            )}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
            {summaryLoading && <div style={{ textAlign:'center', padding:'32px 0', color:'#64748b', fontSize:'12px' }}><div style={{ fontSize:'24px', marginBottom:'8px' }}>⏳</div>Loading data for {summaryDate}…</div>}
            {summaryError  && <div style={{ textAlign:'center', padding:'24px', color:'#ef4444', fontSize:'12px' }}>{summaryError}</div>}
            {!summaryLoading && !summaryError && summaryData && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'16px' }}>
                  <StatCard icon="🔔" label="Total"    value={summaryData.total}    color="#8b5cf6" />
                  <StatCard icon="🚨" label="Critical" value={summaryData.critical} color="#ef4444" />
                  <StatCard icon="⚠️" label="Warnings" value={summaryData.warnings} color="#f59e0b" />
                  <StatCard icon="ℹ️" label="Info"     value={summaryData.info}     color="#3b82f6" />
                </div>
                {summaryData.total===0 ? (
                  <div style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:'10px', padding:'20px', marginBottom:'16px', textAlign:'center' }}>
                    <div style={{ fontSize:'28px', marginBottom:'8px' }}>✅</div>
                    <div style={{ fontSize:'13px', color:'#94a3b8' }}>No alerts recorded on <span style={{ color:'#f1f5f9', fontWeight:600 }}>{summaryDate}</span>.</div>
                  </div>
                ) : <NarrativeSummary data={summaryData} />}
                <div style={{ marginBottom:'16px' }}>
                  <div style={{ fontSize:'10px', color:'#64748b', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>
                    Hourly Alert Distribution · Peak: {String(summaryData.peakHour).padStart(2,'00')}:00
                  </div>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:'2px', height:'48px', background:'rgba(0,0,0,0.2)', borderRadius:'8px', padding:'6px 8px' }}>
                    {summaryData.byHour.map((count,hr) => {
                      const max = Math.max(...summaryData.byHour,1)
                      return <div key={hr} title={`${String(hr).padStart(2,'0')}:00 — ${count} alerts`}
                        style={{ flex:1, height:`${Math.max((count/max)*100,4)}%`, borderRadius:'2px',
                          background:hr===summaryData.peakHour?'#ef4444':count>0?'#3b82f6':'#1e293b', transition:'height 0.3s' }} />
                    })}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'9px', color:'#475569', marginTop:'3px', padding:'0 2px' }}>
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </div>
                {summaryData.camRows.length>0 && (
                  <div style={{ marginBottom:'14px' }}>
                    <div style={{ fontSize:'10px', color:'#64748b', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>📹 Alerts by Camera</div>
                    {summaryData.camRows.map(([cam,cnt]) => (
                      <div key={cam} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'5px' }}>
                        <div style={{ fontSize:'11px', color:'#94a3b8', width:'140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cam}</div>
                        <div style={{ flex:1, height:'6px', background:'rgba(255,255,255,0.05)', borderRadius:'3px', overflow:'hidden' }}>
                          <div style={{ width:`${(cnt/summaryData.camRows[0][1])*100}%`, height:'100%', background:'#3b82f6', borderRadius:'3px' }} />
                        </div>
                        <div style={{ fontSize:'11px', color:'#60a5fa', fontWeight:600, width:'22px', textAlign:'right' }}>{cnt}</div>
                      </div>
                    ))}
                  </div>
                )}
                {summaryData.recentAlerts.length>0 && (
                  <div>
                    <div style={{ fontSize:'10px', color:'#64748b', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>🕐 Recent Alerts</div>
                    {summaryData.recentAlerts.map((a,i) => (
                      <div key={a._id||i} style={{ display:'flex', alignItems:'flex-start', gap:'8px', padding:'7px 10px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:'7px', marginBottom:'5px' }}>
                        <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:sevColor(a.severity), flexShrink:0, marginTop:'4px' }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:'11.5px', color:'#cbd5e1', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.message||a.title||'Alert'}</div>
                          <div style={{ fontSize:'10px', color:'#64748b', marginTop:'2px' }}>{a.zone?`${a.zone} · `:''}{a.camera||''}</div>
                        </div>
                        <div style={{ fontSize:'10px', color:'#475569', whiteSpace:'nowrap', flexShrink:0 }}>{formatTime(a.timestamp||a.created_at||a.time)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div style={{ padding:'9px 16px', borderTop:'1px solid var(--border,#334155)', background:'rgba(0,0,0,0.2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'10px', color:'#475569' }}>YOLOIntel · {siteName}</span>
            <span style={{ fontSize:'10px', color:'#475569' }}>{summaryDate}</span>
          </div>
        </div>
      )}

      {/* Email modal */}
      {handoverEmailOpen && (
        <div onClick={e => { if (e.target===e.currentTarget) setHandoverEmailOpen(false) }}
          style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:12, width:480, padding:24,
            boxShadow:'0 24px 64px rgba(0,0,0,0.6)', maxHeight:'90vh', overflowY:'auto' }}>

            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <div style={{ background:'rgba(168,85,247,0.2)', width:36, height:36, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📧</div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#f1f5f9' }}>Send Report to Site Manager</div>
                <div style={{ fontSize:11, color:'#64748b' }}>Shift Handover · {periodLabel} · includes ack status &amp; comments</div>
              </div>
              <button onClick={() => setHandoverEmailOpen(false)} style={{ marginLeft:'auto', background:'transparent', border:'none', color:'#64748b', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>

            <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid #334155', borderRadius:6, padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(168,85,247,0.25)', color:'#c4b5fd', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, fontFamily:'monospace', flexShrink:0 }}>AL</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:'#f1f5f9', fontWeight:600 }}>Alphaleo Databricks</div>
                <div style={{ fontSize:11, color:'#64748b' }}>alphaleoyolointel@gmail.com</div>
              </div>
              <span style={{ background:'rgba(168,85,247,0.15)', color:'#c4b5fd', fontSize:10, padding:'2px 8px', borderRadius:10, border:'1px solid rgba(168,85,247,0.3)', fontFamily:'monospace' }}>Site Manager</span>
            </div>

            <div style={{ fontSize:10, color:'#64748b', fontFamily:'monospace', letterSpacing:'0.06em', marginBottom:6, textTransform:'uppercase' }}>Report Period</div>
            <div style={{ display:'flex', gap:6, marginBottom:14 }}>
              {[
                { value:'day',   label:'📅 This Day',   sub:handoverDate },
                { value:'month', label:'📆 Full Month', sub:handoverDate.slice(0,7) },
                { value:'year',  label:'📊 Full Year',  sub:handoverDate.slice(0,4) },
              ].map(opt => (
                <button key={opt.value} onClick={() => switchPeriod(opt.value)}
                  style={{ flex:1, padding:'9px 4px', border:`1px solid ${reportPeriod===opt.value?'#7c3aed':'#334155'}`,
                    borderRadius:6, background:reportPeriod===opt.value?'rgba(124,58,237,0.18)':'rgba(255,255,255,0.03)',
                    color:reportPeriod===opt.value?'#c4b5fd':'#64748b', cursor:'pointer', fontSize:11,
                    fontWeight:reportPeriod===opt.value?700:400, textAlign:'center', transition:'all 0.15s' }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize:9, marginTop:3, color:reportPeriod===opt.value?'#a78bfa':'#475569' }}>{opt.sub}</div>
                </button>
              ))}
            </div>

            {reportPeriod==='day' && (
              <>
                <div onClick={() => setCalendarVisible(v=>!v)}
                  style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.04)', border:'1px solid #334155',
                    borderRadius:8, padding:'10px 14px', marginBottom:8, cursor:'pointer', userSelect:'none', transition:'border-color 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#7c3aed'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='#334155'}>
                  <span style={{ fontSize:16 }}>📅</span>
                  <span style={{ fontSize:12, color:'#94a3b8' }}>Selected:</span>
                  <strong style={{ fontSize:13, color:'#c4b5fd', fontFamily:'monospace', flex:1 }}>{handoverDate}</strong>
                  <span style={{ fontSize:11, color:'#64748b' }}>{calendarVisible?'▲ Hide':'▼ Change'}</span>
                </div>
                {calendarVisible && <MiniCalendar selectedDate={handoverDate} onSelect={date => { setHandoverDate(date); setCalendarVisible(false) }} />}
              </>
            )}

            {reportPeriod==='month' && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:'#64748b', fontFamily:'monospace', letterSpacing:'0.06em', marginBottom:6, textTransform:'uppercase' }}>Select Month &amp; Year</div>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  <select value={handoverDate.slice(5,7)} onChange={e => setHandoverDate(`${handoverDate.slice(0,4)}-${e.target.value}-01`)}
                    style={{ flex:2, background:'#0f172a', border:'1px solid #334155', borderRadius:6, padding:'8px 10px', color:'#f1f5f9', fontSize:12, cursor:'pointer', colorScheme:'dark', outline:'none' }}>
                    {MONTH_OPTIONS.map(([val,label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                  <select value={handoverDate.slice(0,4)} onChange={e => setHandoverDate(`${e.target.value}-${handoverDate.slice(5,7)}-01`)}
                    style={{ flex:1, background:'#0f172a', border:'1px solid #334155', borderRadius:6, padding:'8px 10px', color:'#f1f5f9', fontSize:12, cursor:'pointer', colorScheme:'dark', outline:'none' }}>
                    {Array.from({length:5},(_,i)=>new Date().getFullYear()-i).map(yr=><option key={yr} value={yr}>{yr}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.25)', borderRadius:7, padding:'8px 14px' }}>
                  <span style={{ fontSize:14 }}>📆</span>
                  <span style={{ fontSize:12, color:'#94a3b8' }}>Full Month:</span>
                  <strong style={{ fontSize:13, color:'#c4b5fd', fontFamily:'monospace' }}>{handoverDate.slice(0,7)}</strong>
                  <span style={{ marginLeft:'auto', fontSize:10, color:'#64748b' }}>All days + ack + comments</span>
                </div>
              </div>
            )}

            {reportPeriod==='year' && (
              <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.04)', border:'1px solid #334155', borderRadius:8, padding:'13px 16px', marginBottom:14, color:'#e2e8f0', fontSize:13, fontWeight:500 }}>
                <span style={{ fontSize:20 }}>📊</span>
                Full Year:&nbsp;
                <strong style={{ color:'#c4b5fd', fontFamily:'monospace' }}>{handoverDate.slice(0,4)}</strong>
                <span style={{ marginLeft:'auto', fontSize:10, color:'#64748b' }}>All months + ack + comments</span>
              </div>
            )}

            <div style={{ fontSize:10, color:'#64748b', fontFamily:'monospace', letterSpacing:'0.06em', marginBottom:4, textTransform:'uppercase' }}>Subject</div>
            <input value={`Shift Handover Report — ${periodLabel} (${periodText}) · YOLOIntel`} readOnly
              style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid #334155', borderRadius:6, padding:'7px 12px', color:'#f1f5f9', fontSize:12, marginBottom:12, outline:'none', fontFamily:'inherit' }} />

            <div style={{ fontSize:10, color:'#64748b', fontFamily:'monospace', letterSpacing:'0.06em', marginBottom:4, textTransform:'uppercase' }}>Message</div>
            <textarea key={reportPeriod+handoverDate}
              defaultValue={`Hi,\n\nPlease find attached the ${periodText} Shift Handover Report for ${periodLabel}.\nThis report includes all violations detected, acknowledgement status, and supervisor comments.\n\nRegards,\nYOLOIntel Admin`}
              style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid #334155', borderRadius:6, padding:'7px 12px', color:'#f1f5f9', fontSize:12, marginBottom:12, outline:'none', resize:'vertical', minHeight:90, fontFamily:'inherit' }} />

            <label style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'7px 10px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:6, marginBottom:6, cursor:'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor:'#a855f7', marginTop:2 }} />
              <div><div style={{ fontSize:12, color:'#e2e8f0' }}>Attach PDF report</div><div style={{ fontSize:10, color:'#475569' }}>Full shift handover with violations, ack status &amp; comments</div></div>
            </label>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'7px 10px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:6, marginBottom:6, cursor:'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor:'#a855f7', marginTop:2 }} />
              <div><div style={{ fontSize:12, color:'#e2e8f0' }}>Include KPI summary</div><div style={{ fontSize:10, color:'#475569' }}>Cameras, workers, PPE, alerts snapshot</div></div>
            </label>

            {handoverEmailSending && (
              <div style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.25)', borderRadius:6, padding:'10px 14px', color:'#60a5fa', fontSize:12, marginTop:8 }}>
                ⏳ Fetching {reportPeriod==='month'?'full month':reportPeriod==='year'?'full year':'day'} violations with ack &amp; comments, generating PDF…
              </div>
            )}

            {handoverEmailSent && (
              <div style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:6, padding:'10px 14px', color:'#4ade80', fontSize:12, marginTop:8 }}>
                ✅ Report sent to alphaleoyolointel@gmail.com
              </div>
            )}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16, paddingTop:14, borderTop:'1px solid #334155' }}>
              <button onClick={() => setHandoverEmailOpen(false)}
                style={{ background:'transparent', border:'1px solid #334155', color:'#94a3b8', padding:'7px 18px', borderRadius:6, cursor:'pointer', fontSize:12 }}>Cancel</button>
              <button onClick={sendHandoverEmail} disabled={handoverEmailSending}
                style={{ background:'#7c3aed', border:'none', color:'#fff', padding:'7px 18px', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600, opacity:handoverEmailSending?0.7:1 }}>
                {handoverEmailSending ? '⏳ Sending...' : '📤 Send Report'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}