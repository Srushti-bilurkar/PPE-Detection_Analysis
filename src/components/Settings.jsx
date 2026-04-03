export default function Settings() {
  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">⚙️ Settings</div></div>
      <div className="panel-body">
        <div className="settings-grid">
          <div className="settings-nav">
            {['General','Cameras','Alerts','Users','Integrations'].map(s => (
              <div key={s} className="settings-nav-item">{s}</div>
            ))}
          </div>
          <div>
            <h3 style={{marginBottom:'16px',fontFamily:'var(--font-display)'}}>General Settings</h3>
            <div className="form-group">
              <label className="form-label">Site Name</label>
              <input className="form-input" defaultValue="Prestige Tower" />
            </div>
            <div className="form-group">
              <label className="form-label">Timezone</label>
              <select className="form-select">
                <option>Asia/Kolkata (IST)</option>
                <option>UTC</option>
              </select>
            </div>
            <div className="toggle-row">
              <div className="toggle-info">
                <div className="toggle-name">Email Alerts</div>
                <div className="toggle-desc">Send critical alerts to safety officer email</div>
              </div>
              <div className="toggle"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}