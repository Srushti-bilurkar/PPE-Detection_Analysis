import { useState, useEffect } from 'react'
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
import { UserProvider, useUser } from './components/UserContext'
import LoginPage from './components/LoginPage'
 
/* ─── Inner app — only renders after login ─── */
function AppInner() {
  const { isLoggedIn, visibleLocations, isAdmin } = useUser()
 
  const [activeTab, setActiveTab] = useState(() => {
  // Read on first render — before any useEffect runs
    return sessionStorage.getItem('alertDate') ? 'alerts' : 'safety-dashboard'
  })
 
  // ── Navigate to alerts tab when coming from email link ──
  useEffect(() => {
    if (isLoggedIn && sessionStorage.getItem('alertDate')) {
      setActiveTab('alerts')
    }
  }, [isLoggedIn])
 
  const [globalDate, setGlobalDate] = useState(
    localStorage.getItem('yolo_selected_date') || new Date().toISOString().split('T')[0]
  )
  const { alerts, kpi } = useSSE(globalDate)
 
  const handleDateChange = (date) => {
    localStorage.setItem('yolo_selected_date', date)
    setGlobalDate(date)
  }
 
  if (!isLoggedIn) return <LoginPage />
 
  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} alerts={alerts} />
      <div className="main">
        <Topbar activeTab={activeTab} setActiveTab={setActiveTab} alerts={alerts} kpi={kpi} />
        <div className="content-area">
          {activeTab === 'safety-dashboard' && <SafetyDashboard alerts={alerts} kpi={kpi} selectedDate={globalDate} onDateChange={handleDateChange} />}
          {activeTab === 'zone-map'         && <ZoneMap />}
          {activeTab === 'ppe-compliance' && <PPECompliance selectedDate={globalDate} onDateChange={handleDateChange} visibleLocations={visibleLocations} isAdmin={isAdmin} />}
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
  )
}
/* ─── Root — UserProvider must wrap AppInner so useUser() works ─── */
export default function App() {
  return (
    <UserProvider>
      <AppInner />
    </UserProvider>
  )
}
 