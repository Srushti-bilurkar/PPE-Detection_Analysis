// src/api.js
// Central API service — all calls go through here.
// In dev mode, Vite proxy forwards /api/* → http://localhost:8000
// In production, React is served by FastAPI itself, so relative URLs work directly.
 
const BASE = '/api'
 
// ─── helpers ─────────────────────────────────────────────────────────────────
async function get(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}
 
async function post(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
  return res.json()
}
 
// ─── cameras ─────────────────────────────────────────────────────────────────
 
// CHANGED: index1.js returns { cameras: [...] } — unwrap the array
// Also now each camera has a `name` field used by ZoneOverlay
/** Returns [{id, name, hls_url, ready}, ...] */
export function getCameras() {
  return get('/cameras').then(data => data.cameras ?? data)
}
 
/** Restart one camera stream. Returns {status, hls_url} */
export function restartCamera(camId) {
  return get(`/cameras/${camId}/restart`)
}
 
// ─── KPI ─────────────────────────────────────────────────────────────────────
 
/**
 * Daily KPI summary.
 * @param {string} [date] - 'YYYY-MM-DD', defaults to today
 * Returns {
 *   total_persons, total_safe, total_violations,
 *   compliance_pct, active_cameras,
 *   critical_alerts, warning_alerts, info_alerts, resolved_alerts, open_alerts
 * }
 */
export function getKPI(date) {
  return get(`/kpi${date ? `?date=${date}` : ''}`)
}
 
// ─── alerts ──────────────────────────────────────────────────────────────────
 
/**
 * Fetch alerts. Unacknowledged first, then acknowledged.
 * @param {{ limit?, date?, show_all? }} [opts]
 * Returns alert[]
 */
export function getAlerts({ limit = 200, date, show_all = false } = {}) {
  const params = new URLSearchParams({ limit })
  if (date) params.set('date', date)
  if (show_all) params.set('show_all', 'true')
  return get(`/alerts?${params}`)
}
 
/**
 * Acknowledge an alert so it moves to the resolved bucket.
 * @param {string} alertId - MongoDB _id string
 */
export function acknowledgeAlert(alertId) {
  return post(`/alerts/${alertId}`)
}
 
// ─── PPE results ──────────────────────────────────────────────────────────────
 
/**
 * Fetch raw PPE detection results.
 * @param {{ limit?, date?, camera? }} [opts]
 * Returns ppe_result[]
 */
export function getPPEResults({ limit = 20, date, camera } = {}) {
  const params = new URLSearchParams({ limit })
  if (date)   params.set('date', date)
  if (camera) params.set('camera', camera)
  return get(`/ppe-results?${params}`)
}
 
// ─── violations ──────────────────────────────────────────────────────────────
 
/**
 * Fetch violation records (one doc per non-compliant person).
 * @param {{ limit?, date? }} [opts]
 * Returns violation[]  — each has { worker_id, camera, missing_ppe, violation_count, detected_at }
 */
export function getViolations({ limit = 100, date } = {}) {
  const params = new URLSearchParams({ limit })
  if (date) params.set('date', date)
  return get(`/violations?${params}`)
}
 
/**
 * Violation count grouped by camera.
 * @param {string} [date]
 * Returns [{camera, count}, ...]
 */
export function getViolationsByCamera(date) {
  return get(`/violations-by-camera${date ? `?date=${date}` : ''}`)
}
 
// ─── compliance ───────────────────────────────────────────────────────────────
 
/**
 * PPE compliance rates per item type.
 * @param {string} [date]
 * Returns { helmet, vest, goggles, gloves, boots }  — values 0–100
 */
export function getPPECompliance(date) {
  return get(`/ppe-compliance${date ? `?date=${date}` : ''}`)
}
 
/**
 * Simplified compliance summary (only helmet + vest from violations collection).
 * @param {string} [date]
 * Returns { helmet, vest }  — % of violations that were compliant for each
 */
export function getPPEComplianceSummary(date) {
  return get(`/ppe-compliance-summary${date ? `?date=${date}` : ''}`)
}
 
// ─── reports ─────────────────────────────────────────────────────────────────
 
/**
 * Full daily safety report.
 * @param {string} [date]
 */
export function getDailyReport(date) {
  return get(`/reports/daily${date ? `?date=${date}` : ''}`)
}
 
/**
 * Hourly trend data for charts.
 * @param {string} [date]
 * Returns [{hour, workers_active, workers_safe, violations}, ...]
 */
export function getHourlyTrend(date, shift = 'day') {
  const params = new URLSearchParams()
  if (date)  params.set('date',  date)
  if (shift) params.set('shift', shift)
  return get(`/hourly-trend?${params}`)
}
 
// ─── SSE live stream ─────────────────────────────────────────────────────────
 
/**
 * Subscribe to the real-time SSE event stream.
 * @param {(payload: object) => void} onMessage
 * @returns {{ source: EventSource, stop: () => void }}
 */
export function subscribeToStream(onMessage) {
  const source = new EventSource(`${BASE}/stream`)
  source.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data)
      onMessage(payload)
    } catch {
      // ignore malformed frames
    }
  }
  source.onerror = () => {
    // EventSource auto-reconnects — no action needed
  }
  const stop = () => source.close()
  return { source, stop }
}
 
// ─── Images (MongoDB) ────────────────────────────────────────────────────────
 
/**
 * Fetch all batch images from MongoDB.
 */
export function getImages() {
  return get('/images')
}
 
/**
 * Fetch images filtered by date.
 * @param {string} date - 'YYYY-MM-DD'
 */
export function getImagesByDate(date) {
  return get(`/images${date ? `?date=${date}` : ''}`)
}
 
/**
 * Delete an image by MongoDB _id.
 * @param {string} id
 */
export function deleteImage(id) {
  return fetch(`${BASE}/images/${id}`, { method: 'DELETE' })
    .then(res => {
      if (!res.ok) throw new Error(`DELETE /images/${id} → ${res.status}`)
      return res.json()
    })
}
 