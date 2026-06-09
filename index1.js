// index1.js - ONLY SNAPSHOTS (Port 3001)
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
 
// ── MANUAL .env LOADER (bypasses shell interceptors) ─────────────────────────
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    process.env[key] = val   // overwrite — don't trust injected values
  }
  console.log('✅ .env loaded from:', envPath)
} else {
  console.warn('⚠️  .env file not found at:', envPath)
}
// ── CONFIG ────────────────────────────────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'construction_monitor';
const INTERVAL  = parseInt(process.env.INTERVAL || '10000', 10); // 10 seconds
 
// ── CAMERAS ───────────────────────────────────────────────────────────────────
const CAMERAS = [
  { name: 'Pier_Cap_Cam_16389', url: process.env.CAMERA_CAM_A01 },
  { name: 'Pier_Cap_Cam_16388', url: process.env.CAMERA_CAM_A02 },
  { name: 'Pier_Cap_Cam_16387', url: process.env.CAMERA_CAM_A03 },
  { name: 'Pier_Cap_Cam_16386', url: process.env.CAMERA_CAM_A07 },
]
 
// ── FILE SETUP ────────────────────────────────────────────────────────────────
const FILES_DIR = path.join(__dirname, 'files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR);
 
// ── EXPRESS ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
 
// ── MONGO ─────────────────────────────────────────────────────────────────────
const mongoClient = new MongoClient(MONGO_URL);
let db;
 
async function connectMongo() {
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  console.log('✅ MongoDB connected in index1.js');
}
 
// ── IST HELPERS ───────────────────────────────────────────────────────────────
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
 
function formatIST(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return ist.getUTCFullYear() + '-' +
    String(ist.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(ist.getUTCDate()).padStart(2, '0') + ' ' +
    String(ist.getUTCHours()).padStart(2, '0') + ':' +
    String(ist.getUTCMinutes()).padStart(2, '0') + ':' +
    String(ist.getUTCSeconds()).padStart(2, '0') + ' IST';
}
 
// ── IMAGE DIMENSIONS ──────────────────────────────────────────────────────────
function getImageDimensions(imagePath) {
  return new Promise((resolve) => {
    ffmpegFluent.ffprobe(imagePath, (err, metadata) => {
      if (err) {
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
 
// ── SAVE SNAPSHOT TO MONGODB ─────────────────────────────────────────────────
async function saveToMongo(imagePath, cameraName) {
  try {
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
 
    console.log(`[${cameraName}] Snapshot saved → MongoDB _id=${result.insertedId}`);
    return result.insertedId;
  } catch (err) {
    console.error(`[Snapshot Save Error] ${cameraName}:`, err.message);
  }
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
      console.error(`[${camera.name}] Snapshot Error:`, err.message);
      setTimeout(() => takeSnapshot(camera), INTERVAL);
    })
    .run();
}
 
// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Construction Monitor — Snapshot Capture Only (Port 3001)');
  console.log('=================================================');
 
  await connectMongo();
 
  app.listen(3001, () => {
    console.log('🚀 index1.js running on http://localhost:3001');
    console.log('→ Only taking snapshots every 10 seconds');
  });
 
  // Start snapshot capture only
  CAMERAS.forEach(cam => takeSnapshot(cam));
}
 
// ── SHUTDOWN ──────────────────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\nShutting down index1.js...');
  await mongoClient.close();
  process.exit(0);
});
 
main().catch(console.error);
 