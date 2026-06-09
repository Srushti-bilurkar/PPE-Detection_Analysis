import { useEffect, useState, useRef } from 'react'

export function useSSE(selectedDate) {
  const [alerts, setAlerts] = useState([])
  const [kpi, setKpi]       = useState({})
  const seenIdsRef           = useRef(new Set())  // track already-seen alert IDs

  useEffect(() => {
    let source

    function mergeAlerts(incoming) {
      if (!incoming?.length) return
      const newOnes = incoming.filter(a => a._id && !seenIdsRef.current.has(a._id))
      if (newOnes.length === 0) return
      newOnes.forEach(a => seenIdsRef.current.add(a._id))
      // prepend new alerts, keep max 200 total
      setAlerts(prev => [...newOnes, ...prev].slice(0, 200))
    }

    function connect() {
      source = new EventSource('/api/stream')
      source.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          if (payload.kpi)                setKpi(payload.kpi)
          if (payload.latest_alerts)      mergeAlerts(payload.latest_alerts)
        } catch (_) {}
      }
      source.onerror = () => {
        source.close()
        setTimeout(connect, 3000)
      }
    }

    connect()

    const pollId = setInterval(() => {
      const dateParam = selectedDate ? `?date=${selectedDate}` : ''
      fetch(`/api/kpi${dateParam}`)
        .then(r => r.json())
        .then(data => setKpi(data))
        .catch(() => {})
      fetch(`/api/alerts${dateParam}`)
        .then(r => r.json())
        .then(data => mergeAlerts(data))
        .catch(() => {})
    }, 40000)

    return () => {
      source?.close()
      clearInterval(pollId)
    }
  }, [selectedDate])

  return { alerts, kpi }
}