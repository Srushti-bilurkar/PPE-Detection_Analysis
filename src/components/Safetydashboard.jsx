import { useEffect, useRef, useState } from 'react'
import { Chart, registerables } from 'chart.js'
import { useSSE } from '../hooks/useSSE'
import { getHourlyTrend, getPPECompliance, getCameras } from '../api'

Chart.register(...registerables)

function CameraFeed({ cam }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!cam.ready || !videoRef.current) return
    const url = cam.hls_url

    if (typeof window.Hls === 'undefined') {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js'
      script.onload = () => attach(url)
      document.head.appendChild(script)
    } else {
      attach(url)
    }

    function attach(src) {
      const video = videoRef.current
      if (!video) return
      if (window.Hls.isSupported()) {
        const hls = new window.Hls({ lowLatencyMode: true })
        hls.loadSource(src)
        hls.attachMedia(video)
        video._hls = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
      }
    }

    return () => { if (videoRef.current?._hls) videoRef.current._hls.destroy() }
  }, [cam.hls_url, cam.ready])

  return (
    <div className="camera-feed">
      {cam.ready ? (
        <video ref={videoRef} autoPlay muted playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <canvas className="live-cam-canvas" />
      )}
      <div className="cam-overlay">
        <div className="cam-top">
          <div className="cam-id">{cam.id}</div>
          <div className={`cam-status ${cam.ready ? 'live' : 'offline'}`}>
            {cam.ready ? '● REC' : '○ WAIT'}
          </div>
        </div>
        <div className="cam-bottom">
          <div className="cam-zone">HLS STREAM</div>
          <div className="cam-fps">{cam.ready ? 'LIVE' : 'STARTING...'}</div>
        </div>
      </div>
    </div>
  )
}

export default function SafetyDashboard() {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)

  const { kpi, alerts: liveAlerts } = useSSE()

  const [cameras, setCameras]           = useState([])
  const [compliance, setCompliance]     = useState({ helmet: 0, vest: 0, goggles: 0, gloves: 0, boots: 0 })
  const [trendData, setTrendData]       = useState(null)
  const [ackedIds, setAckedIds]         = useState(new Set())
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    getHourlyTrend(selectedDate).then(setTrendData).catch(() => {})
    getPPECompliance(selectedDate).then(setCompliance).catch(() => {})
  }, [selectedDate])

  useEffect(() => {
    const load = () => getCameras().then(setCameras).catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!trendData || !chartRef.current) return
    if (chartInst.current) chartInst.current.destroy()
    chartInst.current = new Chart(chartRef.current.getContext('2d'), {
      type: 'line',
      data: {
        labels: trendData.map(d => d.hour),
        datasets: [
          { label: 'Workers On-Site', data: trendData.map(d => d.workers_active), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', tension: 0.4, fill: true },
          { label: 'Violations', data: trendData.map(d => d.violations), borderColor: '#e53e3e', backgroundColor: 'rgba(229,62,62,0.08)', tension: 0.4, fill: true, yAxisID: 'y2' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#a0aec0', font: { size: 11 } } } },
        scales: {
          x:  { ticks: { color: '#5a6a82' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y:  { ticks: { color: '#5a6a82' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y2: { position: 'right', ticks: { color: '#e53e3e' }, grid: { display: false } },
        },
      },
    })
    return () => chartInst.current?.destroy()
  }, [trendData])

  const ackAlert    = (id) => setAckedIds(prev => new Set([...prev, id]))
  const visibleAlerts = liveAlerts.filter(a => 
  !ackedIds.has(a._id) && a.timestamp?.startsWith(selectedDate)
)
  const unacked       = visibleAlerts.length
  const compColor     = (pct) => pct >= 90 ? 'var(--green-safe)' : pct >= 75 ? 'var(--amber)' : 'var(--red-alert)'

  return (
    <div className="screen active" id="screen-safety-dashboard">
      <div className="date-bar">
        <span className="date-bar-label">📅 Viewing data for:</span>
        <input type="date" className="date-picker" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
        <span className="date-bar-hint">← change date to update all stats</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-icon">👷</div>
          <div className="stat-label">Workers On-Site</div>
          <div className="stat-value green">{kpi.total_persons ?? 0}</div>
          <div className="stat-delta"><span className="up">{kpi.total_safe ?? 0}</span> safe · <span style={{ color: 'var(--red-alert)' }}>{kpi.total_violations ?? 0}</span> violations</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon">🚨</div>
          <div className="stat-label">Active Violations</div>
          <div className="stat-value red">{kpi.total_violations ?? 0}</div>
          <div className="stat-delta"><span className="down">{kpi.critical_alerts ?? 0}</span> critical · {kpi.warning_alerts ?? 0} warnings</div>
        </div>
        <div className="stat-card amber">
          <div className="stat-icon">🦺</div>
          <div className="stat-label">PPE Compliance</div>
          <div className="stat-value amber">{kpi.compliance_pct ?? 100}%</div>
          <div className="stat-delta">Shift average · All cameras</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon">📹</div>
          <div className="stat-label">Camera Streams</div>
          <div className="stat-value blue">{cameras.filter(c => c.ready).length}</div>
          <div className="stat-delta"><span className="up">{cameras.filter(c => c.ready).length} Live</span> · {cameras.filter(c => !c.ready).length} Starting</div>
        </div>
      </div>

      <div className="grid-60-40" style={{ marginBottom: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">📹 Live Camera Grid</div>
            <div className="panel-actions">
              <button className="topbar-btn" style={{ padding: '4px 8px', fontSize: 11 }}>Grid 2×2</button>
              <button className="topbar-btn" style={{ padding: '4px 8px', fontSize: 11 }}>Fullscreen</button>
            </div>
          </div>
          <div className="panel-body">
            <div className="camera-grid">
              {cameras.length === 0
                ? [0,1,2,3].map(i => (
                    <div key={i} className="camera-feed">
                      <canvas className="live-cam-canvas" />
                      <div className="cam-overlay">
                        <div className="cam-top"><div className="cam-id">—</div><div className="cam-status">○ WAIT</div></div>
                        <div className="cam-bottom"><div className="cam-zone">LOADING…</div></div>
                      </div>
                    </div>
                  ))
                : cameras.slice(0, 4).map(cam => <CameraFeed key={cam.id} cam={cam} />)
              }
            </div>
          </div>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div className="panel-title">🔔 Active Alerts</div>
            <div className="panel-subtitle">{unacked} unacknowledged</div>
          </div>
          <div className="panel-body" style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }}>
            {visibleAlerts.length === 0 ? (
              <div className="text-xs text-muted" style={{ padding: '12px 0' }}>No active alerts — waiting for live data…</div>
            ) : (
              <div className="alert-feed">
                {visibleAlerts.map(a => (
                  <div key={a._id} className={`alert-item ${a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info'}`}>
                    <div className="alert-dot" />
                    <div className="alert-content">
                      <div className="alert-type">{a.severity?.toUpperCase()} — {a.type?.replace('_', ' ')}</div>
                      <div className="alert-msg">{a.message}</div>
                      <div className="alert-meta">📹 {a.camera} · Worker {a.worker_id} · {new Date(a.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <button className="alert-ack" style={{ color: 'var(--green-safe)', borderColor: 'rgba(34,197,94,0.3)' }} onClick={() => ackAlert(a._id)}>✓ ACK</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div className="panel-title">📈 Workers / Violations — Hourly Trend</div>
          <div className="panel-subtitle">{trendData ? `${trendData.length} data points · ${selectedDate}` : 'Loading…'}</div>
        </div>
        <div className="panel-body">
          <div style={{ height: 220 }}>
            {trendData && trendData.length > 0
              ? <canvas ref={chartRef} />
              : <div className="text-xs text-muted" style={{ paddingTop: 80, textAlign: 'center' }}>No trend data for {selectedDate} — populates as analyze_ppe.py processes snapshots.</div>
            }
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">🦺 PPE Compliance — Shift Summary</div>
          <div className="panel-subtitle">From ppe_results · {selectedDate}</div>
        </div>
        <div className="panel-body">
          <div className="grid-3">
            <div>
              <div className="text-xs text-muted text-mono mb-8">VIOLATION BREAKDOWN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'No Helmet', pct: 100 - (compliance.helmet || 0), color: 'var(--red-alert)' },
                  { label: 'No Vest',   pct: 100 - (compliance.vest   || 0), color: 'var(--amber)' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 110, fontSize: 12 }}>{item.label}</div>
                    <div style={{ flex: 1, background: 'var(--bg-base)', borderRadius: 3, height: 8 }}>
                      <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 3 }} />
                    </div>
                    <div className="text-mono text-xs" style={{ color: item.color, width: 28 }}>{item.pct}%</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted text-mono mb-8">PPE ITEM COMPLIANCE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12 }}>
                {Object.entries(compliance).map(([key, pct]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ textTransform: 'capitalize' }}>{key}</span>
                    <span style={{ color: compColor(pct), fontFamily: 'var(--font-mono)' }}>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted text-mono mb-8">SHIFT TREND (VIOLATIONS/HOUR)</div>
              <div className="sparkline-container">
                {(trendData || []).slice(-12).map((d, i) => {
                  const max = Math.max(...(trendData || []).map(x => x.violations), 1)
                  const h   = Math.round((d.violations / max) * 100)
                  return (
                    <div key={i} className="spark-bar" style={{
                      height: `${h || 5}%`,
                      background: h > 60 ? 'var(--red-alert)' : h > 30 ? 'var(--amber)' : 'var(--blue-vivid)',
                    }} />
                  )
                })}
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>Hourly violations · {selectedDate}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
