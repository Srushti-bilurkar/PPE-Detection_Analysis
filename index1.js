// index1.js  (ES Module — works with "type":"module" in package.json)
import ffmpegFluent from 'fluent-ffmpeg';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── CONFIG ────────────────────────────────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'construction_monitor';
const INTERVAL  = parseInt(process.env.INTERVAL || '10000', 10);

// ── CAMERAS ───────────────────────────────────────────────────────────────────
const CAMERAS = [
  {
    name: 'Pier_Cap_Cam_16389',
    url:  'rtsp://admin:admin%40123@106.51.96.174:16389/cam/realmonitor?channel=1&subtype=0',
  },
  {
    name: 'Pier_Cap_Cam_16388',
    url:  'rtsp://admin:admin%40123@106.51.96.174:16388/cam/realmonitor?channel=1&subtype=0',
  },
  {
    name: 'Pier_Cap_Cam_16387',
    url:  'rtsp://admin:admin%40123@106.51.96.174:16387/cam/realmonitor?channel=1&subtype=0',
  },
  {
    name: 'Pier_Cap_Cam_16386',
    url:  'rtsp://admin:admin%40123@106.51.96.174:16386/cam/realmonitor?channel=1&subtype=0',
  },
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
  console.log('MongoDB connected');
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

function todayIST() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

// ── API: CAMERAS ──────────────────────────────────────────────────────────────
app.get('/api/cameras', (req, res) => {
  try {
    const cameras = CAMERAS.map(cam => {
      const hlsPath = path.join(__dirname, 'hls', cam.name, 'stream.m3u8');
      return {
        id:      cam.name,
        name:    cam.name,
        hls_url: `/hls/${cam.name}/stream.m3u8`,
        ready:   fs.existsSync(hlsPath),
      };
    });
    res.json({ cameras });
  } catch (err) {
    console.error('cameras API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: ZONE CONFIDENCE ──────────────────────────────────────────────────────
app.get('/api/zone-confidence', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB not ready yet, retry in a moment' });

    const camera = req.query.camera || null;
    const date   = req.query.date   || todayIST();

    const query = { date };
    if (camera) query.camera = camera;

    const zones = await db.collection('zone_confidence').find(query).toArray();

    const byCamera = {};
    for (const z of zones) {
      if (!byCamera[z.camera]) byCamera[z.camera] = {};
      byCamera[z.camera][z.zone_id] = {
        avg_conf:        z.avg_conf,
        avg_helmet_conf: z.avg_helmet_conf,
        avg_vest_conf:   z.avg_vest_conf,
        tier:            z.confidence_tier,
        detections:      z.detection_count,
        violations:      z.total_violations,
        grid_cols:       z.grid_cols || 3,
        grid_rows:       z.grid_rows || 3,
        last_updated:    z.last_updated_ist,
      };
    }

    res.json({ date, cameras: byCamera });
  } catch (err) {
    console.error('zone-confidence API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: ZONE MAP ─────────────────────────────────────────────────────────────
app.get('/api/zone-map', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB not ready yet, retry in a moment' });

    const camera = req.query.camera || null;
    const date   = req.query.date   || todayIST();

    // 1. Static proximity config
    const staticQuery = camera ? { camera } : {};
    const staticDocs  = await db
      .collection('camera_zone_quality')
      .find(staticQuery)
      .toArray();

    const staticMap = {};
    for (const d of staticDocs) {
      if (!staticMap[d.camera]) staticMap[d.camera] = {};
      staticMap[d.camera][d.zone_id] = {
        proximity:      d.proximity,
        static_quality: d.static_quality,
        blur_label:     d.blur_label,
        trust_alerts:   d.trust_alerts,
        tier: d.static_quality >= 0.75 ? 'high'
            : d.static_quality >= 0.50 ? 'medium'
            : 'low',
      };
    }

    // 2. Live zone_confidence
    const liveQuery = { date };
    if (camera) liveQuery.camera = camera;

    const liveDocs = await db
      .collection('zone_confidence')
      .find(liveQuery)
      .toArray();

    const liveMap = {};
    for (const d of liveDocs) {
      if (!liveMap[d.camera]) liveMap[d.camera] = {};
      const gptConf = d.avg_gpt_conf ?? d.avg_conf ?? null;

      liveMap[d.camera][d.zone_id] = {
        live_gpt: gptConf !== null ? {
          quality:         gptConf,
          tier:            gptConf >= 0.75 ? 'high'
                         : gptConf >= 0.50 ? 'medium' : 'low',
          detection_count: d.detection_count || 0,
          helmet_conf:     d.avg_helmet_conf,
          vest_conf:       d.avg_vest_conf,
        } : null,

        combined: {
          quality:          d.final_quality ?? gptConf ?? 0,
          tier:             d.confidence_tier || 'low',
          source:           d.source || 'live_only',
          detection_count:  d.detection_count  || 0,
          total_violations: d.total_violations || 0,
          last_updated:     d.last_updated_ist,
        },
      };
    }

    // 3. All zone IDs
    const allZones = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++)
        allZones.push(`r${r}c${c}`);

    // 4. Merge per camera
    const allCameras = new Set([
      ...Object.keys(staticMap),
      ...Object.keys(liveMap),
      ...(camera ? [camera] : CAMERAS.map(c => c.name)),
    ]);

    const result = {};
    for (const cam of allCameras) {
      result[cam] = {};
      for (const zone_id of allZones) {
        const s = (staticMap[cam] || {})[zone_id] || null;
        const l = (liveMap[cam]   || {})[zone_id] || null;

        result[cam][zone_id] = {
          static: s ? {
            proximity:    s.proximity,
            quality:      s.static_quality,
            blur_label:   s.blur_label,
            trust_alerts: s.trust_alerts,
            tier:         s.tier,
          } : null,
          live_gpt: l?.live_gpt || null,
          combined: l?.combined || (s ? {
            quality:          s.static_quality,
            tier:             s.tier,
            source:           'proximity_only',
            detection_count:  0,
            total_violations: 0,
          } : null),
        };
      }
    }

    res.json({ date, cameras: result });
  } catch (err) {
    console.error('zone-map API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── IMAGE DIMENSIONS ──────────────────────────────────────────────────────────
function getImageDimensions(imagePath) {
  return new Promise((resolve) => {
    ffmpegFluent.ffprobe(imagePath, (err, metadata) => {
      if (err) {
        console.warn(`  WARNING: ffprobe failed for ${imagePath}, defaulting to 1920x1080`);
        resolve({ frame_w: 1920, frame_h: 1080 });
        return;
      }
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (videoStream && videoStream.width && videoStream.height) {
        resolve({ frame_w: videoStream.width, frame_h: videoStream.height });
      } else {
        resolve({ frame_w: 1920, frame_h: 1080 });
      }
    });
  });
}

// ── SAVE SNAPSHOT ─────────────────────────────────────────────────────────────
async function saveToMongo(imagePath, cameraName) {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const now_utc     = new Date();
  const filename    = path.basename(imagePath);
  const istString   = formatIST(now_utc);

  const { frame_w, frame_h } = await getImageDimensions(imagePath);

  const result = await db.collection('snapshots').insertOne({
    camera:            cameraName,
    timestamp:         now_utc,
    timestamp_ist:     istString,
    filename,
    local_path:        imagePath,
    date:              istString.slice(0, 10),
    image:             imageBase64,
    processed:         false,
    collage_processed: false,
    frame_w,
    frame_h,
  });

  console.log(`[${cameraName}] Saved to MongoDB  _id=${result.insertedId}  ${frame_w}x${frame_h}  ${istString}`);
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
      '-hls_time', '2', '-hls_list_size', '3',
      '-hls_flags', 'delete_segments', '-f', 'hls',
    ])
    .output(hlsPath)
    .on('start', () => console.log(`[${camera.name}] HLS started`))
    .on('error', (err) => {
      console.error(`[${camera.name}] HLS error: ${err.message}`);
      setTimeout(() => startHLSStream(camera), 5000);
    })
    .run();
}

// ── SNAPSHOT LOOP ─────────────────────────────────────────────────────────────
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
      console.log(`[${camera.name}] Snapshot captured`);
      await saveToMongo(filename, camera.name);
      setTimeout(() => takeSnapshot(camera), INTERVAL);
    })
    .on('error', (err) => {
      console.error(`[${camera.name}] Error: ${err.message}`);
      setTimeout(() => takeSnapshot(camera), INTERVAL);
    })
    .run();
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Construction Monitor — Camera Capture + Zone API');
  console.log('=================================================');

  await connectMongo();

  app.listen(3001, () => {
    console.log('Server running on http://localhost:3001');
    console.log('  GET /api/cameras');
    console.log('  GET /api/zone-confidence?camera=<name>&date=<YYYY-MM-DD>');
    console.log('  GET /api/zone-map?camera=<name>&date=<YYYY-MM-DD>');
  });

  CAMERAS.forEach(cam => {
    startHLSStream(cam);
    takeSnapshot(cam);
  });
}

// ── SHUTDOWN ──────────────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await mongoClient.close();
  process.exit(0);
});

main().catch(console.error);