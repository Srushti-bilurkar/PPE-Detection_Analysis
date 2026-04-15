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

// ── HANDOVER PDF ──────────────────────────────────────────────────────────────
function buildHandoverHTML({ alerts, kpi, activeTab, zones }) {
  const now      = new Date()
  const dateStr  = now.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
  const timeStr  = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  const critical = alerts.filter(a => a.severity === 'critical').length
  const warnings = alerts.filter(a => a.severity === 'warning').length
  const info     = alerts.filter(a => a.severity === 'info' || !a.severity).length
  const AC       = '#3b82f6'
  const sc       = s => s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : '#3b82f6'

  const alertRows = alerts.slice(0, 20).map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sc(a.severity)};margin-right:6px;vertical-align:middle;"></span>
        ${a.message || a.title || 'Alert'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:${sc(a.severity)};font-weight:600;text-transform:uppercase;font-size:11px;">${a.severity || 'info'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;">${a.zone || '-'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:11px;">${a.camera || '-'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#64748b;font-size:11px;">${a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : '-'}</td>
    </tr>`).join('')

  const zoneRows = zones.length > 0
    ? zones.map(z => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;">${z.name || '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;">${z.workers != null ? z.workers : '-'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;">
          <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${z.status === 'active' ? '#052e16' : '#1c1917'};color:${z.status === 'active' ? '#4ade80' : '#94a3b8'};">
            ${z.status || 'unknown'}
          </span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;">${z.risk || 'Low'}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="padding:16px;color:#64748b;text-align:center;">No zone data available</td></tr>'

  const kpiCards = [
    { label:'Active Cameras',  value: kpi.active_cameras  != null ? kpi.active_cameras  : '-',       icon:'📹', color:'#3b82f6' },
    { label:'Workers On-Site', value: kpi.workers_on_site != null ? kpi.workers_on_site : '-',       icon:'👷', color:'#10b981' },
    { label:'PPE Compliance',  value: kpi.ppe_compliance  != null ? kpi.ppe_compliance + '%' : '-',  icon:'🦺', color:'#f59e0b' },
    { label:'Critical Alerts', value: critical,      icon:'🚨', color:'#ef4444' },
    { label:'Warnings',        value: warnings,      icon:'⚠️', color:'#f97316' },
    { label:'Info Alerts',     value: info,          icon:'ℹ️', color:'#6366f1' },
    { label:'Total Alerts',    value: alerts.length, icon:'🔔', color:'#8b5cf6' },
    { label:'Zones Monitored', value: (kpi.zones_count != null ? kpi.zones_count : zones.length) || '-', icon:'📍', color:'#14b8a6' },
  ].map(k => `
    <div style="background:#1e293b;border-radius:10px;padding:16px;border-left:3px solid ${k.color};">
      <div style="font-size:20px;margin-bottom:6px;">${k.icon}</div>
      <div style="font-size:22px;font-weight:700;color:${k.color};">${k.value}</div>
      <div style="font-size:11px;color:#64748b;margin-top:2px;">${k.label}</div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>SHIFT HANDOVER REPORT - Prestige Tower</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',system-ui,sans-serif; background:#0f172a; color:#e2e8f0; font-size:13px; line-height:1.5; }
    @media print { body { background:#fff; color:#0f172a; } }
  </style>
</head>
<body>
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px;border-bottom:2px solid ${AC};">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:48px;height:48px;background:${AC};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;">YI</div>
        <div>
          <div style="font-size:11px;letter-spacing:3px;color:#64748b;text-transform:uppercase;margin-bottom:2px;">YOLOIntel · Prestige Tower</div>
          <div style="font-size:22px;font-weight:700;color:#f1f5f9;">SHIFT HANDOVER REPORT</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Generated</div>
        <div style="font-size:15px;font-weight:600;color:#94a3b8;">${dateStr}</div>
        <div style="font-size:13px;color:#64748b;">${timeStr}</div>
      </div>
    </div>
    <div style="margin-top:20px;padding:12px 16px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;display:inline-block;">
      <span style="color:#60a5fa;font-size:11px;font-weight:600;letter-spacing:1px;">SHIFT HANDOVER - Active Tab: ${TAB_LABELS[activeTab] || activeTab}</span>
    </div>
  </div>
  <div style="padding:32px 40px;">
    <div style="margin-bottom:32px;">
      <div style="font-size:11px;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b;">📊 Live KPIs</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">${kpiCards}</div>
    </div>
    <div style="margin-bottom:32px;">
      <div style="font-size:11px;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b;">
        🚨 Recent Alerts (${alerts.length > 20 ? 'showing 20 of ' + alerts.length : alerts.length + ' total'})
      </div>
      <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Message</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Severity</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Zone</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Camera</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Time</th>
          </tr>
        </thead>
        <tbody>${alertRows || '<tr><td colspan="5" style="padding:16px;color:#64748b;text-align:center;">No alerts recorded</td></tr>'}</tbody>
      </table>
    </div>
    <div style="margin-bottom:32px;">
      <div style="font-size:11px;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b;">📍 Active Zones</div>
      <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Zone Name</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Workers</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Status</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;">Risk Level</th>
          </tr>
        </thead>
        <tbody>${zoneRows}</tbody>
      </table>
    </div>
    <div style="margin-bottom:32px;">
      <div style="font-size:11px;letter-spacing:2px;color:#64748b;text-transform:uppercase;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #1e293b;">📝 Handover Notes</div>
      <div style="background:#1e293b;border-radius:10px;padding:20px;border:1px dashed #334155;">
        <div style="color:#64748b;font-size:12px;line-height:2;">
          <div>• Incoming shift supervisor to review all <span style="color:#ef4444;font-weight:600;">${critical} critical</span> and <span style="color:#f59e0b;font-weight:600;">${warnings} warning</span> alerts before sign-off.</div>
          <div>• PPE compliance standing at <span style="color:#f1f5f9;font-weight:600;">${kpi.ppe_compliance != null ? kpi.ppe_compliance + '%' : 'N/A'}</span> - monitor zones with recent violations.</div>
          <div>• <span style="color:#f1f5f9;font-weight:600;">${kpi.active_cameras != null ? kpi.active_cameras : 'N/A'}</span> camera streams active - report any offline feeds immediately.</div>
          <div>• Total workers on-site: <span style="color:#f1f5f9;font-weight:600;">${kpi.workers_on_site != null ? kpi.workers_on_site : 'N/A'}</span>. Verify headcount at zone entry points.</div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #334155;color:#475569;">Outgoing Supervisor: __________________ &nbsp;&nbsp; Time: __________</div>
          <div style="margin-top:8px;color:#475569;">Incoming Supervisor: __________________ &nbsp;&nbsp; Time: __________</div>
        </div>
      </div>
    </div>
    <div style="padding-top:20px;border-top:1px solid #1e293b;display:flex;justify-content:space-between;">
      <div style="color:#475569;font-size:11px;">YOLOIntel · Prestige Tower · Auto-generated Handover Report</div>
      <div style="color:#475569;font-size:11px;">${dateStr} · ${timeStr}</div>
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

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function Topbar({ activeTab, setActiveTab, alerts = [], kpi = {}, zones = [] }) {
  const [notifOpen,      setNotifOpen]      = useState(false)
  const [lightMode,      setLightMode]      = useState(false)
  const [readIds,        setReadIds]        = useState(new Set())
  const [handovering,    setHandovering]    = useState(false)
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
    setHandovering(true)
    openHandoverPDF({ alerts, kpi, activeTab, zones })
    setTimeout(() => setHandovering(false), 1500)
  }

  // ── Fetch summary from backend API ─────────────────────────────────────────
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

  function timeAgo(iso) {
    if (!iso) return ''
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
    if (diff < 60)    return `${diff}s ago`
    if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    return new Date(iso).toLocaleDateString()
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

  // ── Narrative sentence builder ─────────────────────────────────────────────
  function NarrativeSummary({ data }) {
    const ppeColor = data.ppeCompliance >= 80 ? '#34d399' : data.ppeCompliance >= 60 ? '#fbbf24' : '#f87171'
    const ppeBorder = data.ppeCompliance >= 80 ? '#10b981' : data.ppeCompliance >= 60 ? '#f59e0b' : '#ef4444'
    const ppeText = data.ppeCompliance >= 80
      ? 'Workers maintained good safety gear adherence.'
      : data.ppeCompliance >= 60
      ? 'Some workers were found without required PPE — follow-up needed.'
      : 'PPE compliance was critically low — immediate action required.'

    const rows = []

    // Alert overview
    rows.push(
      <div key="alerts" style={rowStyle('#8b5cf6')}>
        🔔 A total of <B color="#f1f5f9">{data.total} alert{data.total !== 1 ? 's' : ''}</B> were recorded —{' '}
        <B color="#ef4444">{data.critical} critical</B>,{' '}
        <B color="#f59e0b">{data.warnings} warning{data.warnings !== 1 ? 's' : ''}</B>, and{' '}
        <B color="#3b82f6">{data.info} informational</B>.
      </div>
    )

    // Workers
    if (kpi.workers_on_site != null) {
      rows.push(
        <div key="workers" style={rowStyle('#10b981')}>
          👷 <B color="#f1f5f9">{kpi.workers_on_site} workers</B> were active on-site
          {zones.length > 0 && <> across <B color="#34d399">{zones.length} zone{zones.length !== 1 ? 's' : ''}</B></>}.
        </div>
      )
    }

    // PPE
    if (data.ppeCompliance != null) {
      rows.push(
        <div key="ppe" style={rowStyle(ppeBorder)}>
          🦺 PPE compliance for the day was <B color={ppeColor}>{data.ppeCompliance}%</B>. {ppeText}
        </div>
      )
    } else {
      rows.push(
        <div key="ppe" style={rowStyle('#475569')}>
          🦺 PPE compliance data was not available for this date.
        </div>
      )
    }

    // Top camera
    if (data.camRows.length > 0) {
      rows.push(
        <div key="cam" style={rowStyle('#3b82f6')}>
          📹 Highest alert activity came from camera <B color="#60a5fa">{data.camRows[0][0]}</B> with{' '}
          <B color="#f1f5f9">{data.camRows[0][1]} alert{data.camRows[0][1] !== 1 ? 's' : ''}</B>
          {data.camRows.length > 1 && <>, followed by <B color="#60a5fa">{data.camRows[1][0]}</B> ({data.camRows[1][1]})</>}.
        </div>
      )
    }

    // Top zone
    if (data.zoneRows.length > 0) {
      rows.push(
        <div key="zone" style={rowStyle('#10b981')}>
          📍 Zone <B color="#34d399">{data.zoneRows[0][0]}</B> had the most incidents with{' '}
          <B color="#f1f5f9">{data.zoneRows[0][1]} alert{data.zoneRows[0][1] !== 1 ? 's' : ''}</B>
          {data.zoneRows.length > 1 && <>, followed by <B color="#34d399">{data.zoneRows[1][0]}</B> ({data.zoneRows[1][1]})</>}.
        </div>
      )
    }

    // Peak hour
    if (data.total > 0) {
      rows.push(
        <div key="peak" style={rowStyle('#f59e0b')}>
          🕐 Alert activity peaked at <B color="#fbbf24">{String(data.peakHour).padStart(2,'0')}:00 IST</B> with{' '}
          <B color="#f1f5f9">{data.byHour[data.peakHour]} alert{data.byHour[data.peakHour] !== 1 ? 's' : ''}</B> in that hour.
        </div>
      )
    }

    // Snapshots
    if (data.snapshotCount > 0) {
      rows.push(
        <div key="snap" style={rowStyle('#14b8a6')}>
          📸 <B color="#2dd4bf">{data.snapshotCount} snapshots</B> were captured across all cameras during this period.
        </div>
      )
    }

    // Critical callout
    if (data.critical > 0) {
      rows.push(
        <div key="crit" style={{ ...rowStyle('#ef4444'), background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          ⚠️ <B color="#fca5a5">{data.critical} critical alert{data.critical !== 1 ? 's' : ''}</B> require{data.critical === 1 ? 's' : ''} immediate review — ensure all incidents have been acknowledged and resolved.
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
    return {
      padding: '8px 12px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '7px',
      borderLeft: `3px solid ${borderColor}`,
    }
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
          <div className="topbar-sub">Site: Prestige Tower — {sub}</div>
        </div>

        <div className="topbar-spacer" />

        <div id="live-clock">{clock}</div>

        <div className="status-pill">
          <div className="status-dot" />
          {kpi.active_cameras != null ? kpi.active_cameras : 0} STREAMS LIVE
        </div>

        <button id="notif-bell" ref={bellRef} onClick={toggleNotif} title="Notifications">
          🔔
          {unread > 0 && <div id="notif-badge" style={{ display: 'flex' }}>{unread}</div>}
        </button>

        <button className="topbar-btn" id="theme-toggle" onClick={toggleTheme}>
          {lightMode ? '☀️ Light' : '🌙 Dark'}
        </button>

        <button
          className="topbar-btn"
          onClick={handleHandover}
          disabled={handovering}
          title="Generate Shift Handover PDF"
          style={{ opacity: handovering ? 0.6 : 1, cursor: handovering ? 'wait' : 'pointer' }}
        >
          {handovering ? '⏳ Generating...' : '📋 Handover'}
        </button>

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
                  <div className="notif-time">{timeAgo(a.timestamp || a.created_at || '')}</div>
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
            position: 'fixed',
            top: '70px',
            right: '16px',
            width: '440px',
            maxHeight: '640px',
            background: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border, #334155)',
            borderRadius: '14px',
            boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.15)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border, #334155)',
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
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>Prestige Tower · Alert & Zone Breakdown</div>
              </div>
            </div>
            <button
              onClick={() => setSummaryOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '18px', lineHeight: 1, padding: '2px 6px' }}
            >×</button>
          </div>

          {/* Date Picker */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border, #334155)',
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(0,0,0,0.15)',
          }}>
            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>📅 View date:</span>
            <input
              type="date"
              value={summaryDate}
              max={todayISO()}
              onChange={handleDateChange}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '5px 10px',
                color: '#f1f5f9',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            />
            {summaryData?.isToday && (
              <span style={{
                fontSize: '10px', color: '#10b981', fontWeight: 600,
                padding: '2px 8px', background: 'rgba(16,185,129,0.1)',
                borderRadius: '4px', border: '1px solid rgba(16,185,129,0.25)',
                whiteSpace: 'nowrap',
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
                {/* Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', marginBottom: '16px' }}>
                  <StatCard icon="🔔" label="Total"    value={summaryData.total}         color="#8b5cf6" />
                  <StatCard icon="🚨" label="Critical" value={summaryData.critical}      color="#ef4444" />
                  <StatCard icon="⚠️" label="Warnings" value={summaryData.warnings}      color="#f59e0b" />
                  <StatCard icon="ℹ️" label="Info"     value={summaryData.info}          color="#3b82f6" />
                </div>

                {/* ── Written Narrative ── */}
                {summaryData.total === 0 ? (
                  <div style={{
                    background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
                    borderRadius: '10px', padding: '20px', marginBottom: '16px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.8' }}>
                      No alerts were recorded on <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{summaryDate}</span>.
                      The site operated without any flagged incidents.
                      {summaryData.snapshotCount > 0 && (
                        <> <span style={{ color: '#2dd4bf', fontWeight: 600 }}>{summaryData.snapshotCount} snapshots</span> were captured across all cameras.</>
                      )}
                    </div>
                  </div>
                ) : (
                  <NarrativeSummary data={summaryData} />
                )}

                {/* Hourly Bar Chart */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                    Hourly Alert Distribution · Peak: {String(summaryData.peakHour).padStart(2,'0')}:00
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'flex-end', gap: '2px',
                    height: '48px', background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px', padding: '6px 8px',
                  }}>
                    {summaryData.byHour.map((count, hr) => {
                      const max = Math.max(...summaryData.byHour, 1)
                      const pct = (count / max) * 100
                      return (
                        <div
                          key={hr}
                          title={`${String(hr).padStart(2,'0')}:00 — ${count} alerts`}
                          style={{
                            flex: 1,
                            height: `${Math.max(pct, 4)}%`,
                            borderRadius: '2px',
                            background: hr === summaryData.peakHour ? '#ef4444' : count > 0 ? '#3b82f6' : '#1e293b',
                            transition: 'height 0.3s',
                            cursor: 'default',
                          }}
                        />
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#475569', marginTop: '3px', padding: '0 2px' }}>
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </div>

                {/* By Camera */}
                {summaryData.camRows.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>📹 Alerts by Camera</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {summaryData.camRows.map(([cam, cnt]) => {
                        const max = summaryData.camRows[0][1]
                        return (
                          <div key={cam} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cam}</div>
                            <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${(cnt/max)*100}%`, height: '100%', background: '#3b82f6', borderRadius: '3px' }} />
                            </div>
                            <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600, width: '22px', textAlign: 'right' }}>{cnt}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* By Zone */}
                {summaryData.zoneRows.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>📍 Alerts by Zone</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {summaryData.zoneRows.map(([zone, cnt]) => {
                        const max = summaryData.zoneRows[0][1]
                        return (
                          <div key={zone} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontSize: '11px', color: '#94a3b8', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zone}</div>
                            <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${(cnt/max)*100}%`, height: '100%', background: '#10b981', borderRadius: '3px' }} />
                            </div>
                            <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 600, width: '22px', textAlign: 'right' }}>{cnt}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Recent Alerts */}
                {summaryData.recentAlerts.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>🕐 Recent Alerts</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {summaryData.recentAlerts.map((a, i) => (
                        <div key={a._id || i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '8px',
                          padding: '7px 10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: '7px',
                        }}>
                          <span style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: sevColor(a.severity), flexShrink: 0, marginTop: '4px',
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '11.5px', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.message || a.title || 'Alert'}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                              {a.zone ? `${a.zone} · ` : ''}{a.camera || ''}
                            </div>
                          </div>
                          <div style={{ fontSize: '10px', color: '#475569', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {a.timestamp ? new Date(a.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '9px 16px',
            borderTop: '1px solid var(--border, #334155)',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '10px', color: '#475569' }}>YOLOIntel · Prestige Tower</span>
            <span style={{ fontSize: '10px', color: '#475569' }}>{summaryDate}</span>
          </div>
        </div>
      )}
    </>
  )
}