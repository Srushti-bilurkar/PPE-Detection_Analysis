// ─────────────────────────────────────────────────────────────────────────────
// ADD THIS to index1.js — after your existing app.get('/api/zone-confidence')
//
// GET /api/zone-map?camera=Pier_Cap_Cam_16389&date=2026-05-22
//
// Returns all three scoring methods (static, live_gpt, combined) per zone.
// This is what ZoneOverlay.jsx fetches every 60 seconds.
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/zone-map', async (req, res) => {
  try {
    const camera = req.query.camera || null
    const date   = req.query.date || (() => {
      const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      return ist.toISOString().slice(0, 10)
    })()

    // ── 1. Static proximity (camera_zone_quality) ─────────────────────────
    // Written once by proximity_configurator.py
    // If empty → run proximity_configurator.py first
    const staticQuery = camera ? { camera } : {}
    const staticDocs  = await db.collection('camera_zone_quality').find(staticQuery).toArray()

    const staticMap = {}
    for (const d of staticDocs) {
      if (!staticMap[d.camera]) staticMap[d.camera] = {}
      staticMap[d.camera][d.zone_id] = {
        proximity:      d.proximity,
        static_quality: d.static_quality,
        blur_label:     d.blur_label,
        trust_alerts:   d.trust_alerts,
        tier: d.static_quality >= 0.75 ? 'high'
            : d.static_quality >= 0.50 ? 'medium'
            : 'low',
      }
    }

    // ── 2. Live zone_confidence (updated every ~60s by zone_aggregator.py) ─
    const liveQuery = { date }
    if (camera) liveQuery.camera = camera

    const liveDocs = await db.collection('zone_confidence').find(liveQuery).toArray()

    const liveMap = {}
    for (const d of liveDocs) {
      if (!liveMap[d.camera]) liveMap[d.camera] = {}
      const gptConf = d.avg_gpt_conf ?? d.avg_conf ?? null
      liveMap[d.camera][d.zone_id] = {
        // Method 2 — live GPT-4o only
        live_gpt: gptConf !== null ? {
          quality:         gptConf,
          tier:            gptConf >= 0.75 ? 'high' : gptConf >= 0.50 ? 'medium' : 'low',
          detection_count: d.detection_count || 0,
          helmet_conf:     d.avg_helmet_conf,
          vest_conf:       d.avg_vest_conf,
        } : null,

        // Method 3 — combined (final_quality computed by zone_aggregator.py)
        combined: {
          quality:          d.final_quality ?? gptConf ?? 0,
          tier:             d.confidence_tier || 'low',
          source:           d.source || 'live_only',
          detection_count:  d.detection_count  || 0,
          total_violations: d.total_violations || 0,
          last_updated:     d.last_updated_ist,
        },
      }
    }

    // ── 3. Merge everything per zone ──────────────────────────────────────
    const allZones = []
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        allZones.push(`r${r}c${c}`)

    const allCameras = new Set([
      ...Object.keys(staticMap),
      ...Object.keys(liveMap),
    ])

    const result = {}
    for (const cam of allCameras) {
      result[cam] = {}
      for (const zone_id of allZones) {
        const s = (staticMap[cam] || {})[zone_id] || null
        const l = (liveMap[cam]   || {})[zone_id] || null

        result[cam][zone_id] = {
          // Method 1 — static proximity (from camera_zone_quality)
          static: s ? {
            proximity:      s.proximity,
            quality:        s.static_quality,
            blur_label:     s.blur_label,
            trust_alerts:   s.trust_alerts,
            tier:           s.tier,
          } : null,

          // Method 2 — live GPT-4o (from zone_confidence.avg_gpt_conf)
          live_gpt: l?.live_gpt || null,

          // Method 3 — combined (from zone_confidence.final_quality)
          // If no live data yet, fall back to static quality alone
          combined: l?.combined || (s ? {
            quality:          s.static_quality,
            tier:             s.tier,
            source:           'proximity_only',
            detection_count:  0,
            total_violations: 0,
          } : null),
        }
      }
    }

    res.json({ date, cameras: result })

  } catch (err) {
    console.error('zone-map API error:', err)
    res.status(500).json({ error: err.message })
  }
})
