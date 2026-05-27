import { useState } from 'react'
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
  const { alerts, kpi } = useSSE(globalDate)  // ← add globalDate

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