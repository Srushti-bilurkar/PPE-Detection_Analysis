import axios from 'axios'

async function downloadReport(url, filename) {
  try {
    const res = await axios.get(url, { responseType: 'blob' })
    const href = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
    URL.revokeObjectURL(href)
  } catch (e) {
    alert('Failed — make sure backend is running and reportlab is installed.')
  }
}

export default function Reports() {
  const reports = [
    { name: 'Daily Safety Report',    meta: 'KPI + violations from MongoDB',      url: '/api/reports/daily-safety', file: 'daily_safety_report.pdf' },
    { name: 'Weekly PPE Summary',     meta: 'Helmet & vest compliance by camera', url: '/api/reports/ppe-summary',  file: 'ppe_summary.pdf' },
    { name: 'Incident / Alert Report',meta: 'All alerts with ACK status',         url: '/api/reports/alerts',       file: 'alerts_report.pdf' },
  ]
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">📄 Reports</div>
        <div className="panel-subtitle">Live data from MongoDB · PDF download</div>
      </div>
      <div className="panel-body">
        <div className="report-list">
          {reports.map(r => (
            <div key={r.name} className="report-item">
              <div className="report-icon">📊</div>
              <div className="report-info">
                <div className="report-name">{r.name}</div>
                <div className="report-meta">{r.meta}</div>
              </div>
              <div className="report-size">PDF</div>
              <button className="download-btn" onClick={() => downloadReport(r.url, r.file)}>
                ⬇ Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}