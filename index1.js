// index1.js
import ffmpegFluent from 'fluent-ffmpeg';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'construction_monitor';
const INTERVAL  = parseInt(process.env.INTERVAL || '10000', 10);

// ── CAMERAS ───────────────────────────────────────────────────────────────────
const CAMERAS = [
  { name: 'Pier_Cap_Cam_16389', url: 'rtsp://admin:admin%40123@106.51.96.174:16389/cam/realmonitor?channel=1&subtype=0' },
  { name: 'Pier_Cap_Cam_16388', url: 'rtsp://admin:admin%40123@106.51.96.174:16388/cam/realmonitor?channel=1&subtype=0' },
  { name: 'Pier_Cap_Cam_16387', url: 'rtsp://admin:admin%40123@106.51.96.174:16387/cam/realmonitor?channel=1&subtype=0' },
  { name: 'Pier_Cap_Cam_16386', url: 'rtsp://admin:admin%40123@106.51.96.174:16386/cam/realmonitor?channel=1&subtype=0' },
];

// ── FILE SETUP ────────────────────────────────────────────────────────────────
const FILES_DIR = path.join(__dirname, 'files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR);

// ── EXPRESS ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use('/hls', express.static(path.join(__dirname, 'hls')));

// ── MONGO ─────────────────────────────────────────────────────────────────────
const mongoClient = new MongoClient(MONGO_URL);
let db;

async function connectMongo() {
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  console.log('✅ MongoDB connected');
}

// ── IST HELPERS ───────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(date) {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

function formatIST(date) {
  const ist = toIST(date);
  return ist.getUTCFullYear() + '-' +
    String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(ist.getUTCDate()).padStart(2, '0') + ' ' +
    String(ist.getUTCHours()).padStart(2, '0') + ':' +
    String(ist.getUTCMinutes()).padStart(2, '0') + ':' +
    String(ist.getUTCSeconds()).padStart(2, '0') + ' IST';
}

// ── SUMMARY API ───────────────────────────────────────────────────────────────
// GET /api/summary/2026-04-15
app.get('/api/summary/:date', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not ready yet' });

    const { date } = req.params;   // "YYYY-MM-DD"

    // Convert IST date boundaries to UTC for MongoDB query
    // e.g. 2026-04-15 IST 00:00 = 2026-04-14T18:30:00Z
    //      2026-04-15 IST 23:59 = 2026-04-15T18:29:59Z
    const startUTC = new Date(`${date}T00:00:00+05:30`);
    const endUTC   = new Date(`${date}T23:59:59+05:30`);

    // ── Alerts ──────────────────────────────────────────────────────────────
    const alertDocs = await db.collection('alerts').find({
      timestamp: { $gte: startUTC, $lte: endUTC }
    }).toArray();

    const critical = alertDocs.filter(a => a.severity === 'critical').length;
    const warnings = alertDocs.filter(a => a.severity === 'warning').length;
    const info     = alertDocs.filter(a => a.severity === 'info' || !a.severity).length;

    // By camera
    const byCamera = {};
    alertDocs.forEach(a => {
      const cam = a.camera || 'Unknown';
      byCamera[cam] = (byCamera[cam] || 0) + 1;
    });

    // By zone
    const byZone = {};
    alertDocs.forEach(a => {
      const z = a.zone || 'Unknown';
      byZone[z] = (byZone[z] || 0) + 1;
    });

    // Hourly distribution (converted to IST hours)
    const byHour = Array(24).fill(0);
    alertDocs.forEach(a => {
      if (a.timestamp) {
        const istHour = Math.floor(((new Date(a.timestamp).getUTCHours() * 60 + new Date(a.timestamp).getUTCMinutes()) + 330) / 60) % 24;
        byHour[istHour]++;
      }
    });

    // ── Snapshots ────────────────────────────────────────────────────────────
    const snapshotCount = await db.collection('snapshots').countDocuments({
      timestamp: { $gte: startUTC, $lte: endUTC }
    });

    // ── PPE compliance (from snapshots that have ppe_stats) ──────────────────
    let ppeCompliance = null;
    const ppeDocs = await db.collection('snapshots').find({
      timestamp:  { $gte: startUTC, $lte: endUTC },
      'ppe_stats': { $exists: true }
    }).toArray();

    if (ppeDocs.length > 0) {
      const total    = ppeDocs.reduce((s, d) => s + (d.ppe_stats?.total    || 0), 0);
      const compliant= ppeDocs.reduce((s, d) => s + (d.ppe_stats?.compliant|| 0), 0);
      ppeCompliance  = total > 0 ? Math.round((compliant / total) * 100) : null;
    }

    // ── Recent alerts (sorted newest first) ──────────────────────────────────
    const recentAlerts = alertDocs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 8)
      .map(a => ({
        _id:       a._id,
        message:   a.message || a.title || 'Alert',
        severity:  a.severity || 'info',
        zone:      a.zone   || null,
        camera:    a.camera || null,
        timestamp: a.timestamp,
      }));

    res.json({
      date,
      total: alertDocs.length,
      critical,
      warnings,
      info,
      byCamera,
      byZone,
      byHour,
      snapshotCount,
      ppeCompliance,
      recentAlerts,
    });

  } catch (err) {
    console.error('❌ Summary API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(3001, () => console.log('📡 HLS + API server running on http://localhost:3001'));

// ── SAVE SNAPSHOT ─────────────────────────────────────────────────────────────
async function saveToMongo(imagePath, cameraName) {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const now_utc     = new Date();
  const filename    = path.basename(imagePath);
  const istString   = formatIST(now_utc);

  const result = await db.collection('snapshots').insertOne({
    camera:            cameraName,
    timestamp:         now_utc,
    timestamp_ist:     istString,
    filename:          filename,
    local_path:        imagePath,
    date:              istString.slice(0, 10),
    image:             imageBase64,
    processed:         false,
    collage_processed: false,
  });

  console.log(`💾 [${cameraName}] Saved to MongoDB`);
  console.log(`   _id      : ${result.insertedId}`);
  console.log(`   filename : ${filename}`);
  console.log(`   time IST : ${istString}`);

  return result.insertedId;
}

// ── HLS STREAM ────────────────────────────────────────────────────────────────
function startHLSStream(camera) {
  const hlsDir = path.join(__dirname, 'hls', camera.name);
  if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });
  const hlsPath = path.join(hlsDir, 'stream.m3u8');

  ffmpegFluent(camera.url)
    .inputOptions(['-rtsp_transport', 'tcp', '-rtsp_flags', 'prefer_tcp'])
    .outputOptions([
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
      '-hls_time', '2', '-hls_list_size', '3', '-hls_flags', 'delete_segments', '-f', 'hls',
    ])
    .output(hlsPath)
    .on('start', () => {
      console.log(`📺 [${camera.name}] HLS stream started`);
      console.log(`📺 [${camera.name}] URL: http://localhost:3001/hls/${camera.name}/stream.m3u8`);
    })
    .on('error', (err) => {
      console.error(`❌ [${camera.name}] HLS error: ${err.message}`);
      setTimeout(() => startHLSStream(camera), 5000);
    })
    .run();
}

// ── SNAPSHOT LOGIC ────────────────────────────────────────────────────────────
function takeSnapshot(camera) {
  const filename = path.join(FILES_DIR, `${camera.name}_${Date.now()}.jpg`);

  ffmpegFluent(camera.url)
    .inputOptions([
      '-rtsp_transport', 'tcp', '-rtsp_flags', 'prefer_tcp',
      '-analyzeduration', '5000000', '-probesize', '5000000',
    ])
    .frames(1)
    .outputOptions(['-q:v 2'])
    .output(filename)
    .on('end', async () => {
      console.log(`\n✅ [${camera.name}] Snapshot captured`);
      await saveToMongo(filename, camera.name);
      console.log(`⏳ [${camera.name}] Next snapshot in ${INTERVAL / 1000}s …\n`);
      setTimeout(() => takeSnapshot(camera), INTERVAL);
    })
    .on('error', (err) => {
      console.error(`❌ [${camera.name}] Error: ${err.message}`);
      console.log(`⏳ [${camera.name}] Retry in ${INTERVAL / 1000}s …\n`);
      setTimeout(() => takeSnapshot(camera), INTERVAL);
    })
    .run();
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🏗️  Construction Monitor — Camera Capture Service');
  console.log('==================================================');
  console.log(`📷 Cameras  : ${CAMERAS.length}`);
  CAMERAS.forEach(c => console.log(`   📡 ${c.name}: ${c.url.replace(/:.+@/, ':****@')}`));
  console.log(`⏱️  Interval : every ${INTERVAL / 1000}s`);
  console.log(`🕐 Timezone : IST (UTC+5:30) — stored as UTC, displayed as IST`);
  console.log(`📁 Files Dir: ${FILES_DIR}`);
  console.log(`\n💡 HLS streams  → http://localhost:3001/hls/<camera>/stream.m3u8`);
  console.log(`💡 Summary API  → http://localhost:3001/api/summary/YYYY-MM-DD\n`);

  await connectMongo();

  CAMERAS.forEach(cam => {
    startHLSStream(cam);
    takeSnapshot(cam);
  });
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down …');
  await mongoClient.close();
  process.exit(0);
});

main().catch(console.error);