# =============================================================================
#  analyze_ppe.py  — QUEUE MODE (manual_collages only)
# =============================================================================

import groq, json, sys, time, threading, base64, re, queue
from datetime import datetime
from pathlib import Path
from pymongo import MongoClient
from bson import ObjectId

try:
    import cv2
    import numpy as np
except ImportError:
    import os
    os.system(f"{sys.executable} -m pip install opencv-python numpy --quiet")
    import cv2
    import numpy as np

# ── CONFIG ────────────────────────────────────────────────────────────────────

GROQ_API_KEY  = "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"

POLL_INTERVAL = 5
API_DELAY     = 4
MAX_RETRIES   = 3
QUEUE_MAXSIZE = 50

# ── CAMERAS ───────────────────────────────────────────────────────────────────
CAMERAS = [
    "Pier_Cap_Cam_16386",
    "Pier_Cap_Cam_16387",
    "Pier_Cap_Cam_16388",
    "Pier_Cap_Cam_16389",
]

# ── MONGODB ───────────────────────────────────────────────────────────────────
MONGO_URL = "mongodb://localhost:27017"
db = MongoClient(MONGO_URL)["construction_monitor"]

snapshots_col   = db["snapshots"]
ppe_results_col = db["ppe_results"]
violations_col  = db["violations"]
alerts_col      = db["alerts"]

COLLAGE_FILTER = {"type": "batch_collage"}

# ── GLOBAL PAUSE FLAG ─────────────────────────────────────────────────────────
worker_paused      = False
worker_pause_until = 0


# ── RESET STUCK + ERRORED DOCUMENTS ───────────────────────────────────────────
def reset_stuck_docs():
    r_stuck = snapshots_col.update_many(
        {**COLLAGE_FILTER, "ppe_claimed": True, "ppe_processed": {"$ne": True}},
        {"$unset": {"ppe_claimed": "", "ppe_error": ""}}
    )
    r_error = snapshots_col.update_many(
        {**COLLAGE_FILTER, "ppe_processed": True, "ppe_error": {"$exists": True}},
        {
            "$unset": {
                "ppe_processed":  "",
                "ppe_claimed":    "",
                "ppe_error":      "",
                "ppe_persons":    "",
                "ppe_safe":       "",
                "ppe_violations": "",
            }
        }
    )
    print(f"  🔄 Reset stuck (mid-crash)     : {r_stuck.modified_count}")
    print(f"  🔄 Reset errored (429/failed)  : {r_error.modified_count}\n")

    done    = snapshots_col.count_documents({**COLLAGE_FILTER, "ppe_processed": True, "ppe_error": {"$exists": False}})
    pending = snapshots_col.count_documents({**COLLAGE_FILTER, "ppe_processed": {"$ne": True}, "total_persons": {"$gt": 0}})
    skipped = snapshots_col.count_documents({**COLLAGE_FILTER, "ppe_processed": {"$ne": True}, "total_persons": 0})

    print(f"  📊 Done     : {done}")
    print(f"  📊 Pending  : {pending}  ← will be processed")
    print(f"  📊 Skipped  : {skipped}  ← zero persons, won't be queued\n")


# ── GROQ CLIENT ───────────────────────────────────────────────────────────────
client_groq = groq.Groq(api_key=GROQ_API_KEY)

# ── SHARED QUEUE ──────────────────────────────────────────────────────────────
job_queue = queue.Queue(maxsize=QUEUE_MAXSIZE)

# ── PRINT LOCK ────────────────────────────────────────────────────────────────
print_lock = threading.Lock()

def log(tag: str, msg: str):
    with print_lock:
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"  {ts}  [{tag}]  {msg}")


# ── PARSE WAIT TIME FROM GROQ ERROR ───────────────────────────────────────────
def parse_wait_seconds(error_str: str) -> float:
    m = re.search(r"try again in (\d+)m([\d.]+)s", error_str)
    if m:
        return int(m.group(1)) * 60 + float(m.group(2)) + 2.0

    m = re.search(r"try again in ([\d.]+)s", error_str)
    if m:
        return float(m.group(1)) + 1.5

    return API_DELAY


# ── PROMPT ────────────────────────────────────────────────────────────────────
PROMPT = """You are a strict construction site safety inspector.

Look at this image carefully. Count every person you see.
For EACH person check:
- Is a hard helmet/hardhat physically ON their head? (not in hand)
- Is a bright orange or yellow safety vest ON their body?

Rules:
- helmet=true ONLY if hard hat is ON the head
- vest=true ONLY if bright vest is ON the body
- status="safe" if BOTH helmet AND vest are worn
- status="violation" if helmet OR vest is missing
- missing=[] list what is missing e.g. ["helmet"] or ["vest"] or ["helmet","vest"]

Respond ONLY in this exact JSON, no extra text:
{
  "total_persons": 1,
  "total_safe": 0,
  "total_violations": 1,
  "persons": [
    {"id":1,"helmet":false,"vest":true,"status":"violation","missing":["helmet"]}
  ]
}"""


# ══════════════════════════════════════════════════════════════════════════════
# GROQ API CALL
# ══════════════════════════════════════════════════════════════════════════════

def call_groq(image_b64: str, camera: str):
    global worker_paused, worker_pause_until

    for attempt in range(MAX_RETRIES):
        try:
            response = client_groq.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}
                        },
                        {"type": "text", "text": PROMPT}
                    ]
                }],
                max_tokens=1000
            )
            return response

        except groq.RateLimitError as e:
            err_str = str(e)
            wait    = parse_wait_seconds(err_str)

            is_tpd = "tokens per day" in err_str or wait > 60

            if is_tpd:
                log("GROQ", f"🚫 Daily token limit (TPD) hit — pausing {wait:.0f}s ({wait/60:.1f} min)")
                worker_paused      = True
                worker_pause_until = time.time() + wait
                time.sleep(wait)
                worker_paused = False
                log("GROQ", "✅ TPD pause over — resuming")
                continue

            if attempt < MAX_RETRIES - 1:
                log("GROQ", f"⏳ Rate limit — waiting {wait:.1f}s (attempt {attempt+1}/{MAX_RETRIES})")
                time.sleep(wait)
            else:
                log("GROQ", "❌ Max retries reached — releasing job for retry later")
                raise

    raise RuntimeError("Max retries exceeded")


# ══════════════════════════════════════════════════════════════════════════════
# PARSE GROQ RESPONSE
# ══════════════════════════════════════════════════════════════════════════════

def parse_response(response, camera: str, source_id: str) -> dict:
    raw = response.choices[0].message.content.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    result = json.loads(raw)

    result["total_persons"]    = len(result.get("persons", []))
    result["total_safe"]       = sum(1 for p in result["persons"] if p["status"] == "safe")
    result["total_violations"] = sum(1 for p in result["persons"] if p["status"] == "violation")
    result["camera"]           = camera
    result["source_id"]        = source_id
    result["timestamp"]        = datetime.now().isoformat()

    return result


# ══════════════════════════════════════════════════════════════════════════════
# SAVE RESULTS TO MONGODB
# ══════════════════════════════════════════════════════════════════════════════

def save_results(result: dict):
    ppe_doc = result.copy()
    ppe_doc["source_type"] = "batch_collage"
    ppe_results_col.insert_one(ppe_doc)

    for person in result.get("persons", []):
        if person.get("status") == "violation":
            missing = person.get("missing", [])

            violations_col.insert_one({
                "source_id":   result["source_id"],
                "source_type": "batch_collage",
                "camera":      result["camera"],
                "worker_id":   f"W-{person.get('id', '?')}",
                "missing":     missing,
                "timestamp":   result["timestamp"],
                "alert_sent":  False,
            })

            alerts_col.insert_one({
                "type":         "PPE_VIOLATION",
                "severity":     "critical" if len(missing) > 1 else "warning",
                "message":      f"Missing: {', '.join(missing)} — {result['camera']}",
                "camera":       result["camera"],
                "worker_id":    f"W-{person.get('id')}",
                "source_id":    result["source_id"],
                "source_type":  "batch_collage",
                "timestamp":    result["timestamp"],
                "acknowledged": False,
            })


# ══════════════════════════════════════════════════════════════════════════════
# SINGLE WORKER THREAD
# ══════════════════════════════════════════════════════════════════════════════

def groq_worker():
    log("WORKER", f"🟢 Started — {API_DELAY}s delay between calls")

    processed = 0
    errors    = 0

    while True:
        try:
            try:
                job = job_queue.get(timeout=1)
            except queue.Empty:
                continue

            image_b64 = job["image_b64"]
            camera    = job["camera"]
            source_id = job["source_id"]
            doc_id    = job["doc_id"]
            label     = job["label"]

            log("WORKER", f"🔍 Processing: {label}  (queue: {job_queue.qsize()} remaining)")

            try:
                response = call_groq(image_b64, camera)
                result   = parse_response(response, camera, source_id)

                v = result["total_violations"]
                s = result["total_safe"]
                p = result["total_persons"]

                log("WORKER", f"   👷 {p} persons  ✅ {s} safe  🚨 {v} violation(s)")

                for person in result["persons"]:
                    status = "✅ SAFE" if person["status"] == "safe" \
                             else f"🚨 missing={person.get('missing', [])}"
                    log("WORKER",
                        f"      Person {person['id']}: "
                        f"helmet={'✓' if person['helmet'] else '✗'}  "
                        f"vest={'✓' if person['vest'] else '✗'}  {status}")

                save_results(result)

                snapshots_col.update_one(
                    {"_id": doc_id},
                    {"$set": {
                        "ppe_processed":  True,
                        "ppe_persons":    p,
                        "ppe_safe":       s,
                        "ppe_violations": v,
                    }}
                )

                log("WORKER", f"   💾 Saved → ppe_results | {v} violation(s) → violations + alerts\n")
                processed += 1

            except json.JSONDecodeError:
                log("WORKER", "   ❌ Invalid JSON — releasing for retry next run")
                snapshots_col.update_one({"_id": doc_id}, {"$unset": {"ppe_claimed": ""}})
                errors += 1

            except Exception as e:
                log("WORKER", f"   ❌ {e} — releasing for retry next run")
                snapshots_col.update_one({"_id": doc_id}, {"$unset": {"ppe_claimed": ""}})
                errors += 1

            finally:
                job_queue.task_done()

            if processed % 10 == 0 and processed > 0:
                log("WORKER", f"📊 Progress: {processed} done | {errors} errors | {job_queue.qsize()} in queue")

            if not job_queue.empty():
                time.sleep(API_DELAY)

        except Exception as e:
            log("WORKER", f"❌ Worker error: {e}")
            time.sleep(2)


# ══════════════════════════════════════════════════════════════════════════════
# FETCHER — one thread per camera
# ══════════════════════════════════════════════════════════════════════════════

def fetch_collages(camera: str):
    log(camera, "🟡 Collage fetcher started")

    while True:
        try:
            if worker_paused:
                remaining = max(0, worker_pause_until - time.time())
                if remaining > 0:
                    log(camera, f"⏸  TPD pause active — waiting {remaining:.0f}s before fetching more")
                    time.sleep(remaining)
                continue

            doc = snapshots_col.find_one_and_update(
                {
                    **COLLAGE_FILTER,
                    "camera":        camera,
                    "ppe_processed": {"$ne": True},
                    "ppe_claimed":   {"$ne": True},
                    "total_persons": {"$gt": 0},
                },
                {"$set": {"ppe_claimed": True}},
                sort=[("created_at", 1)]
            )

            if doc is None:
                time.sleep(POLL_INTERVAL)
                continue

            filename = doc.get("filename", "unknown")
            total_p  = doc.get("total_persons", 0)
            log(camera, f"📦 Queuing collage: {filename} ({total_p} persons)")

            image_b64    = None
            collage_file = doc.get("collage_file")

            if collage_file:
                try:
                    img_path = Path(collage_file)
                    if img_path.exists():
                        img       = cv2.imread(str(img_path))
                        _, buf    = cv2.imencode(".jpg", img)
                        image_b64 = base64.b64encode(buf).decode("utf-8")
                        log(camera, f"   📁 Loaded from local file: {img_path.name}")
                except Exception as e:
                    log(camera, f"   ⚠️  File load failed: {e}")

            if not image_b64 and doc.get("image"):
                image_b64 = doc["image"]
                log(camera, "   📦 Loaded from embedded image field")

            if not image_b64:
                snap_ids = doc.get("snap_ids", [])
                if snap_ids:
                    try:
                        snap = snapshots_col.find_one({"_id": ObjectId(snap_ids[0])})
                        if snap and snap.get("image"):
                            image_b64 = snap["image"]
                            log(camera, "   📦 Loaded from snap_id reference")
                    except Exception as e:
                        log(camera, f"   ⚠️  snap_id fallback failed: {e}")

            if not image_b64:
                log(camera, "   ⚠️  No image found — releasing claim for retry")
                snapshots_col.update_one({"_id": doc["_id"]}, {"$unset": {"ppe_claimed": ""}})
                time.sleep(POLL_INTERVAL)
                continue

            while job_queue.full():
                time.sleep(2)

            job_queue.put({
                "image_b64": image_b64,
                "camera":    camera,
                "source_id": str(doc["_id"]),
                "doc_id":    doc["_id"],
                "label":     f"{camera} | {filename}",
            })

            log(camera, f"   ✅ Added to queue (queue size: {job_queue.qsize()})")

        except Exception as e:
            log(camera, f"❌ Collage fetcher error: {e}")
            time.sleep(POLL_INTERVAL)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":

    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║   🦺  PPE Analyzer — Collages Only (No Rate Limit)       ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print(f"  DB          : {MONGO_URL}  →  construction_monitor")
    print(f"  Cameras     : {', '.join(CAMERAS)}")
    print(f"  Source      : snapshots  (type=batch_collage)")
    print(f"  Fetchers    : {len(CAMERAS)} threads (one per camera)")
    print(f"  API Worker  : 1 thread ({API_DELAY}s between calls)")
    print(f"  Queue size  : max {QUEUE_MAXSIZE} jobs")
    print(f"  Retry limit : {MAX_RETRIES} retries on rate limit")
    print(f"  Output      : ppe_results / violations / alerts\n")

    try:
        db.client.admin.command("ping")
        print("✅  MongoDB connected\n")
    except Exception as e:
        print(f"❌  Cannot connect to MongoDB: {e}")
        sys.exit(1)

    print("🔄  Checking for stuck / errored collages…")
    reset_stuck_docs()

    threads = []

    worker = threading.Thread(target=groq_worker, daemon=True, name="groq_worker")
    worker.start()
    threads.append(worker)

    for camera in CAMERAS:
        t = threading.Thread(
            target=fetch_collages,
            args=(camera,),
            daemon=True,
            name=f"{camera}_collages"
        )
        t.start()
        threads.append(t)

    print(f"🔄  {len(threads)} threads running:")
    print(f"    1  × Groq API worker")
    print(f"    {len(CAMERAS)}  × Collage fetchers (one per camera)")
    print(f"\n    Ctrl+C to stop\n")

    try:
        while True:
            time.sleep(30)
            done    = snapshots_col.count_documents({**COLLAGE_FILTER, "ppe_processed": True, "ppe_error": {"$exists": False}})
            pending = snapshots_col.count_documents({**COLLAGE_FILTER, "ppe_processed": {"$ne": True}, "total_persons": {"$gt": 0}})
            pause_info = f" | ⏸ TPD pause: {max(0, worker_pause_until - time.time()):.0f}s left" if worker_paused else ""
            log("STATUS",
                f"Queue: {job_queue.qsize()} | "
                f"Done: {done} | "
                f"Pending: {pending} | "
                f"Violations: {violations_col.count_documents({})}"
                f"{pause_info}")
    except KeyboardInterrupt:
        print("\n\n⏹  Stopped by user.")