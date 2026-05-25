import axios from 'axios'
import { useState } from 'react'

async function downloadReport(url, filename) {
  try {
    const res = await axios.get(url, { responseType: 'blob' })

    // Check if backend returned an error (content-type won't be PDF)
    const contentType = res.headers['content-type'] || ''
    if (!contentType.includes('pdf')) {
      // Read the blob as text to show the real error
      const text = await res.data.text()
      throw new Error(text || 'Server returned non-PDF response')
    }

    const href = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
    URL.revokeObjectURL(href)
  } catch (e) {
    // e.response exists when axios itself got a non-2xx status
    if (e.response) {
      try {
        const errText = await e.response.data.text()
        alert(`Report failed: ${errText}`)
      } catch {
        alert(`HTTP ${e.response.status} error`)
      }
    } else {
      alert(`Failed: ${e.message}`)
    }
  }
}

export default function Reports() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [loading, setLoading] = useState(null)

  const reports = [
  {
    name: 'Daily Safety Report',
    meta: 'KPI + violations for selected date',
    url:  () => `/api/reports/daily-safety?date=${date}`,
    file: () => `daily_safety_${date}.pdf`,
  },
  {
    name: 'Weekly Safety Report',          // ← renamed + new endpoint
    meta: '7-day breakdown: day-by-day violations + per-camera summary',
    url:  () => `/api/reports/weekly-safety?date=${date}`,   // ← /weekly-safety
    file: () => `weekly_safety_${date}.pdf`,
  },
  {
    name: 'Incident / Alert Report',
    meta: 'All alerts with ACK status',
    url:  () => `/api/reports/alerts?date=${date}`,
    file: () => `alerts_${date}.pdf`,
  },
]

  async function handleDownload(r) {
    setLoading(r.name)
    await downloadReport(r.url(), r.file())
    setLoading(null)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">📄 Reports</div>
        <div className="panel-subtitle">Live data from MongoDB · PDF download</div>
      </div>

      <div className="panel-body">
        {/* Date picker — pass the date your data actually lives on */}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          📅 Report date:
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #555' }}
          />
        </label>

        <div className="report-list">
          {reports.map(r => (
            <div key={r.name} className="report-item">
              <div className="report-icon">📊</div>
              <div className="report-info">
                <div className="report-name">{r.name}</div>
                <div className="report-meta">{r.meta}</div>
              </div>
              <div className="report-size">PDF</div>
              <button
                className="download-btn"
                disabled={loading === r.name}
                onClick={() => handleDownload(r)}
              >
                {loading === r.name ? '⏳ Generating…' : '⬇ Download'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}