import { useEffect, useState } from 'react'

export function useSSE() {
  const [alerts, setAlerts] = useState([])
  const [kpi, setKpi]       = useState({})

  useEffect(() => {
    let source

    function connect() {
      source = new EventSource('/api/stream')

      source.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          if (payload.kpi)                       setKpi(payload.kpi)
          if (payload.latest_alerts?.length > 0) setAlerts(payload.latest_alerts)
        } catch (_) {}
      }

      source.onerror = () => {
        source.close()
        setTimeout(connect, 3000)
      }
    }

    connect()

    // Backup poll every 40 seconds
    const pollId = setInterval(() => {
      fetch('/api/kpi')
        .then(r => r.json())
        .then(data => setKpi(data))
        .catch(() => {})

      fetch('/api/alerts')
        .then(r => r.json())
        .then(data => { if (data.length > 0) setAlerts(data) })
        .catch(() => {})
    }, 40000)

    return () => {
      source?.close()
      clearInterval(pollId)
    }
  }, [])

  return { alerts, kpi }
}