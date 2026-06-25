import { useEffect, useState, useRef } from 'react'

export function useSSE(selectedDate) {
  const [alerts,    setAlerts]    = useState([])
  const [kpi,       setKpi]       = useState({})
  const [streaming, setStreaming] = useState(false)  // ← added

  const alertsRef = useRef([])
  const kpiRef    = useRef({})

  useEffect(() => {
    let source

    const smartSetAlerts = (newAlerts) => {
      if (!Array.isArray(newAlerts)) return
      const prevIds = alertsRef.current.map(a => a._id).join(',')
      const newIds  = newAlerts.map(a => a._id).join(',')
      if (prevIds !== newIds) {
        alertsRef.current = newAlerts
        setAlerts(newAlerts)
      }
    }

    const smartSetKpi = (newKpi) => {
      if (!newKpi || typeof newKpi !== 'object') return
      const prevStr = JSON.stringify(kpiRef.current)
      const newStr  = JSON.stringify(newKpi)
      if (prevStr !== newStr) {
        kpiRef.current = newKpi
        setKpi(newKpi)
      }
    }

    function connect() {
      source = new EventSource('/api/stream')
      source.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          if (payload.kpi)           smartSetKpi(payload.kpi)
          if (payload.latest_alerts) smartSetAlerts(payload.latest_alerts)
          if (typeof payload.streaming === 'boolean') setStreaming(payload.streaming)  // ← added
        } catch (_) {}
      }
      source.onerror = () => {
        source.close()
        setTimeout(connect, 3000)
      }
    }

    connect()

    const dateParam = selectedDate ? `?date=${selectedDate}` : ''
    fetch(`/api/kpi${dateParam}`)
      .then(r => r.json())
      .then(data => smartSetKpi(data))
      .catch(() => {})
    fetch(`/api/alerts${dateParam}`)
      .then(r => r.json())
      .then(data => smartSetAlerts(Array.isArray(data) ? data : []))
      .catch(() => {})

    const pollId = setInterval(() => {
      const dp = selectedDate ? `?date=${selectedDate}` : ''
      fetch(`/api/kpi${dp}`)
        .then(r => r.json())
        .then(data => smartSetKpi(data))
        .catch(() => {})
      fetch(`/api/alerts${dp}`)
        .then(r => r.json())
        .then(data => smartSetAlerts(Array.isArray(data) ? data : []))
        .catch(() => {})
    }, 40000)

    return () => {
      source?.close()
      clearInterval(pollId)
    }
  }, [selectedDate])

  return { alerts, kpi, streaming }  // ← streaming added
}