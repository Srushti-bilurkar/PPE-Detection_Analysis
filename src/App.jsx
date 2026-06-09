import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import SafetyDashboard from './components/Safetydashboard'
import ZoneMap from './components/ZoneMap'
import AlertFeedPage from './components/AlertFeedPage'
import PPECompliance from './components/PPECompliance'
import Productivity from './components/Productivity'
import Scorecard from './components/Scorecard'
import Progress from './components/Progress'
import Milestones from './components/Milestones'
import OwnerPortal from './components/OwnerPortal'
import Reports from './components/Reports'
import Settings from './components/Settings'
import { useSSE } from './hooks/useSSE'
import ChatBot from './components/ChatBot'
import { UserProvider } from './components/UserContext'

export default function App() {
  const [activeTab,  setActiveTab]  = useState('safety-dashboard')
  const [globalDate, setGlobalDate] = useState(
    localStorage.getItem('yolo_selected_date') || new Date().toISOString().split('T')[0]
  )
  const { alerts, kpi } = useSSE(globalDate)

  // ── Auto-email site manager when new alerts arrive ──────────────────
  const lastAlertCountRef = useRef(null)   // null = not yet initialized
  const emailCooldownRef  = useRef(false)

  useEffect(() => {
    if (!alerts) return

    // seed on first load — don't email for alerts already on screen
    if (lastAlertCountRef.current === null) {
      lastAlertCountRef.current = alerts.length
      return
    }

    // no new alerts
    if (alerts.length <= lastAlertCountRef.current) {
      lastAlertCountRef.current = alerts.length
      return
    }

    // cooldown active — update count but skip email
    if (emailCooldownRef.current) {
      lastAlertCountRef.current = alerts.length
      return
    }

    const prevCount = lastAlertCountRef.current
    const newAlerts = alerts.slice(prevCount)   // only the newly added ones
    lastAlertCountRef.current = alerts.length

    // build alert summary lines
    const alertLines = newAlerts.slice(0, 10).map(a => {
      const cam      = a.camera || a.camera_id || a.camera_name || '—'
      const severity = (a.severity || a.type || 'WARNING').toUpperCase()
      const worker   = a.worker || a.worker_id || '—'
      const loc      = cam.includes('16389') ? 'Bangalore'
                     : cam.includes('16388') ? 'Hyderabad'
                     : cam.includes('16387') ? 'Chennai - Location 1'
                     : cam.includes('16386') ? 'Chennai - Location 2'
                     : cam
      return `• [${severity}] ${loc} — Worker: ${worker} — Camera: ${cam}`
    }).join('\n')

    const subject = `🚨 YOLOIntel Alert: ${newAlerts.length} New PPE Violation${newAlerts.length > 1 ? 's' : ''} Detected`
    const message = `Hi Alphaleo,

${newAlerts.length} new PPE violation${newAlerts.length > 1 ? 's have' : ' has'} been detected on site.

ALERT SUMMARY:
${alertLines}

Please review the Safety Dashboard immediately.

— YOLOIntel Monitoring System
Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`

    fetch('http://localhost:5000/api/send-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        to:      'alphaleoyolointel@gmail.com',
        subject,
        message,
      }),
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        console.log('[AutoAlert] ✅ Email sent:', subject)
      } else {
        console.warn('[AutoAlert] ⚠️ Email failed:', data.error)
      }
    })
    .catch(err => console.error('[AutoAlert] ❌ Email error:', err))

    // 5-minute cooldown to prevent spam
    emailCooldownRef.current = true
    setTimeout(() => { emailCooldownRef.current = false }, 5 * 60 * 1000)

  }, [alerts])
  // ───────────────────────────────────────────────────────────────────

  const handleDateChange = (date) => {
    localStorage.setItem('yolo_selected_date', date)
    setGlobalDate(date)
  }

  return (
    <UserProvider>
      <div className="app-shell">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} alerts={alerts} />
        <div className="main">
          <Topbar activeTab={activeTab} setActiveTab={setActiveTab} alerts={alerts} kpi={kpi} />
          <div className="content-area">
            {activeTab === 'safety-dashboard' && <SafetyDashboard alerts={alerts} kpi={kpi} selectedDate={globalDate} onDateChange={handleDateChange} />}
            {activeTab === 'zone-map'         && <ZoneMap />}
            {activeTab === 'ppe-compliance'   && <PPECompliance selectedDate={globalDate} onDateChange={handleDateChange} />}
            {activeTab === 'alerts'           && <AlertFeedPage alerts={alerts} selectedDate={globalDate} onDateChange={handleDateChange} />}
            {activeTab === 'productivity'     && <Productivity />}
            {activeTab === 'scorecard'        && <Scorecard />}
            {activeTab === 'progress'         && <Progress />}
            {activeTab === 'milestones'       && <Milestones />}
            {activeTab === 'owner-portal'     && <OwnerPortal />}
            {activeTab === 'reports'          && <Reports />}
            {activeTab === 'settings'         && <Settings />}
          </div>
        </div>
        <ChatBot />
      </div>
    </UserProvider>
  )
}