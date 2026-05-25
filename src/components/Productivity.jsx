export default function Productivity() {
  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-label">Site Utilization</div>
          <div className="stat-value green">67%</div>
          <div className="stat-delta">Active work ratio</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">Idle Workers</div>
          <div className="stat-value amber">38</div>
          <div className="stat-delta">+12 vs 1hr ago</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">In Transit</div>
          <div className="stat-value blue">24</div>
          <div className="stat-delta">Moving between zones</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-label">Idle Clusters</div>
          <div className="stat-value cyan">2</div>
          <div className="stat-delta">Zones: SLAB-F6, STEEL-B</div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">📊 Crew Activity</div>
        </div>
        <div className="panel-body" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          Activity chart — connect to MongoDB productivity data.
        </div>
      </div>
    </div>
  )
}