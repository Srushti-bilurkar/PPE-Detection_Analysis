from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, RedirectResponse
from pymongo import MongoClient, DESCENDING
from bson import ObjectId
from pathlib import Path
import json, time, asyncio, signal, sys, subprocess, threading, os, base64
from datetime import datetime, timedelta
from dotenv import load_dotenv
load_dotenv(dotenv_path=r"C:\Users\srustib\Desktop\yolo-frontend\.env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client          = MongoClient("mongodb://localhost:27017")
db              = client["construction_monitor"]
snapshots_col   = db["snapshots"]
ppe_results_col = db["ppe_results"]
violations_col  = db["violations"]
alerts_col      = db["alerts"]
images_col      = client["yolo_images"]["images"]

COLLAGE_BASE_DIR = Path(r"C:\Users\srustib\Desktop\L-T-project-L-T_Dashboard\collages")
_shutdown_event  = asyncio.Event()

CAMERAS = {
    "CAM-A01": "rtsp://admin:admin%40123@106.51.96.174:16389/cam/realmonitor?channel=1&subtype=0",
    "CAM-A02": "rtsp://admin:admin%40123@106.51.96.174:16388/cam/realmonitor?channel=1&subtype=0",
    "CAM-A03": "rtsp://admin:admin%40123@106.51.96.174:16387/cam/realmonitor?channel=1&subtype=0",
    "CAM-A07": "rtsp://admin:admin%40123@106.51.96.174:16386/cam/realmonitor?channel=1&subtype=0",
}

HLS_DIR = Path("hls")
HLS_DIR.mkdir(parents=True, exist_ok=True)
_ffmpeg_procs: dict = {}


# ─────────────────────────────────────────────────────────────────────────────
# FFMPEG
# ─────────────────────────────────────────────────────────────────────────────
def start_ffmpeg(cam_id: str, rtsp_url: str):
    cam_dir = HLS_DIR / cam_id
    cam_dir.mkdir(parents=True, exist_ok=True)
    for old_file in cam_dir.glob("*.ts"):
        try: old_file.unlink()
        except Exception: pass
    for old_file in cam_dir.glob("*.m3u8"):
        try: old_file.unlink()
        except Exception: pass

    cmd = [
        "ffmpeg", "-rtsp_transport", "tcp", "-fflags", "+genpts",
        "-i", rtsp_url,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-crf", "38", "-maxrate", "800k", "-bufsize", "1600k",
        "-vf", "scale=1280:-2", "-an", "-avoid_negative_ts", "make_zero",
        "-f", "hls", "-hls_time", "2", "-hls_list_size", "5",
        "-hls_flags", "delete_segments+omit_endlist",
        "-hls_segment_filename", str(cam_dir / "seg%03d.ts"),
        str(cam_dir / "stream.m3u8"), "-y",
    ]

    def run():
        while not _shutdown_event.is_set():
            print(f"[Camera] Starting {cam_id} ...")
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
                _ffmpeg_procs[cam_id] = proc
                proc.wait()
                if _shutdown_event.is_set():
                    break
                print(f"[Camera] {cam_id} exited — restarting in 3s...")
                time.sleep(3)
            except FileNotFoundError:
                print(f"[Camera] ERROR — ffmpeg not found.")
                break

    threading.Thread(target=run, daemon=True).start()


def stop_all_streams():
    for cam_id, proc in _ffmpeg_procs.items():
        proc.terminate()
        try: proc.wait(timeout=3)
        except subprocess.TimeoutExpired: proc.kill()


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def serialize(doc):
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
    for k, v in doc.items():
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, list):
            doc[k] = [str(i) if isinstance(i, ObjectId) else i for i in v]
    return doc


def date_match(date_str: str) -> dict:
    """
    Robustly match any timestamp field that contains the given date.
    Handles formats: YYYY-MM-DD..., DD-MM-YYYY..., YYYY/MM/DD...
    Also matches Python datetime objects stored in Mongo (using $gte/$lt range).
    """
    if not date_str:
        return {}

    # Parse the incoming date string (expects YYYY-MM-DD from frontend)
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return {}

    dt_next = dt + timedelta(days=1)

    # Alternative format: DD-MM-YYYY (in case stored that way)
    alt_date_str = dt.strftime("%d-%m-%Y")

    return {
        "$or": [
            # Standard ISO format: "2025-04-13 ..." or "2025-04-13T..."
            {"camera_ts_ist": {"$regex": f"^{date_str}"}},
            {"camera_ts":     {"$regex": f"^{date_str}"}},
            # DD-MM-YYYY format
            {"camera_ts_ist": {"$regex": f"^{alt_date_str}"}},
            {"camera_ts":     {"$regex": f"^{alt_date_str}"}},
            # analyzed_at fields
            {"analyzed_at_ist": {"$regex": f"^{date_str}"}},
            {"analyzed_at":     {"$regex": f"^{date_str}"}},
            # Native BSON datetime range (if stored as Date objects)
            {"camera_ts_ist": {"$gte": dt, "$lt": dt_next}},
            {"camera_ts":     {"$gte": dt, "$lt": dt_next}},
            {"analyzed_at":   {"$gte": dt, "$lt": dt_next}},
        ]
    }


def date_and(*extra: dict) -> dict:
    """Combine multiple query conditions safely using $and."""
    conditions = [c for c in extra if c]  # filter out empty dicts
    if not conditions:
        return {}
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def get_ts(doc: dict) -> str:
    return doc.get("camera_ts_ist") or doc.get("camera_ts") or doc.get("analyzed_at_ist") or ""


def get_total_persons(doc: dict) -> int:
    return doc.get("summary", {}).get("total_persons", 0) or doc.get("total_persons_count", 0)


def get_total_violations(doc: dict) -> int:
    return doc.get("summary", {}).get("violations", 0) or doc.get("total_violation_count", 0)


def build_alert_list(raw_results):
    alerts = []
    for r in raw_results:
        ts = get_ts(r)
        for idx, p in enumerate(r.get("ppe", [])):
            vtype    = p.get("violation_type", "")
            severity = "critical" if vtype == "both_missing" else "warning"
            label    = p.get("label", "?")

            if vtype == "both_missing":
                message = f"Worker {label} missing both helmet and vest"
            elif vtype == "no_helmet":
                message = f"Worker {label} not wearing helmet"
            elif vtype == "no_vest":
                message = f"Worker {label} not wearing vest"
            else:
                message = f"Worker {label} PPE violation"

            raw_violations = p.get("Violation") or p.get("violation") or []
            missing = []
            for item in raw_violations:
                il = (item or "").lower()
                if il in ("hat", "helmet", "no_helmet"): missing.append("helmet")
                if il in ("vest", "no_vest"):             missing.append("vest")
            if not missing:
                if vtype == "no_helmet":      missing = ["helmet"]
                elif vtype == "no_vest":      missing = ["vest"]
                elif vtype == "both_missing": missing = ["helmet", "vest"]

            alerts.append({
                "_id":            f"{str(r['_id'])}_{idx}",
                "camera":         r.get("camera", ""),
                "timestamp":      ts,
                "worker_id":      label,
                "type":           "ppe violation",
                "message":        message,
                "severity":       severity,
                "missing_ppe":    missing,
                "violation_type": vtype,
                "snap_id":        str(p.get("snap_id", "")),
                "doc_id":         str(r["_id"]),
                "x1": p.get("x1", 0), "y1": p.get("y1", 0),
                "x2": p.get("x2", 0), "y2": p.get("y2", 0),
                "acknowledged":   r.get("acknowledged", False),
            })
    return alerts


def get_grid_dims(n: int):
    import math
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    return rows, cols


def find_person_image(camera: str, timestamp: str, worker_id: str):
    if not COLLAGE_BASE_DIR.exists():
        return None
    try:
        viol_dt = datetime.fromisoformat(timestamp.replace("Z", ""))
    except Exception:
        return None
    date_str = viol_dt.strftime("%Y-%m-%d")
    try:
        person_num = int(worker_id.replace("W-", "").strip())
    except Exception:
        person_num = 1

    cam_dir = COLLAGE_BASE_DIR / camera
    if not cam_dir.exists():
        for sub in COLLAGE_BASE_DIR.iterdir():
            if sub.is_dir() and camera.lower() in sub.name.lower():
                cam_dir = sub
                break
        else:
            return None

    all_collages = sorted(
        list(cam_dir.glob(f"{date_str}_*persons.jpg")) +
        list(cam_dir.glob(f"{date_str}_*persons.png"))
    )
    if not all_collages:
        all_collages = sorted([
            f for f in cam_dir.glob(f"{date_str}_*.jpg")
            if "ORIGINAL" not in f.name
        ])
    if not all_collages:
        return None

    best_file  = None
    best_delta = timedelta(days=9999)
    for f in all_collages:
        try:
            parts    = f.stem.split("_")
            time_str = parts[1].replace("-", ":")
            file_dt  = datetime.fromisoformat(f"{date_str}T{time_str}")
            delta    = abs(viol_dt - file_dt)
            if delta < best_delta:
                best_delta = delta
                best_file  = f
        except Exception:
            if best_file is None:
                best_file = f

    if not best_file:
        return None

    try:
        n_persons = int(best_file.stem.split("_")[-1].replace("persons", ""))
    except Exception:
        n_persons = 1

    if n_persons == 1:
        return best_file.read_bytes()

    try:
        import cv2, numpy as np
        img = cv2.imread(str(best_file))
        if img is None:
            return best_file.read_bytes()
        h, w       = img.shape[:2]
        rows, cols = get_grid_dims(n_persons)
        cell_h     = h // rows
        cell_w     = w // cols
        idx        = (person_num - 1) % n_persons
        row        = idx // cols
        col        = idx % cols
        crop       = img[row*cell_h:(row+1)*cell_h, col*cell_w:(col+1)*cell_w]
        _, buf     = cv2.imencode(".jpg", crop)
        return buf.tobytes()
    except Exception:
        return best_file.read_bytes()


# ─────────────────────────────────────────────────────────────────────────────
# FRONTEND
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/")
def serve_frontend():
    return RedirectResponse(url="http://localhost:5173")


# ─────────────────────────────────────────────────────────────────────────────
# HLS
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/hls/{cam_id}/stream.m3u8")
async def serve_m3u8(cam_id: str):
    path = HLS_DIR / cam_id / "stream.m3u8"
    if not path.exists():
        return Response(status_code=404)
    return Response(
        content=path.read_text(),
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/hls/{cam_id}/{segment}")
async def serve_segment(cam_id: str, segment: str):
    path = HLS_DIR / cam_id / segment
    if not path.exists():
        return Response(status_code=404)
    return Response(
        content=path.read_bytes(),
        media_type="video/mp2t",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache", "Expires": "0",
        },
    )


# ═════════════════════════════════════════════════════════════════════════════
# DEBUG — hit this first to diagnose date filter issues
# GET /api/debug/dates?date=2025-04-13
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/debug/dates")
def debug_dates(date: str = None):
    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str

    # Sample raw document to inspect actual field values
    sample = ppe_results_col.find_one({})
    sample_clean = None
    if sample:
        sample_clean = {
            "_id":            str(sample.get("_id", "")),
            "camera":         sample.get("camera", ""),
            "camera_ts_ist":  sample.get("camera_ts_ist", "<<MISSING>>"),
            "camera_ts":      sample.get("camera_ts",     "<<MISSING>>"),
            "analyzed_at_ist":sample.get("analyzed_at_ist","<<MISSING>>"),
            "analyzed_at":    sample.get("analyzed_at",   "<<MISSING>>"),
            "all_keys":       list(sample.keys()),
        }

    # Count docs matching the date filter
    match_q       = date_match(use_date)
    count_today   = ppe_results_col.count_documents(match_q)
    count_all     = ppe_results_col.count_documents({})

    # Show a few matching docs timestamps only
    matching_samples = []
    for doc in ppe_results_col.find(match_q).limit(5):
        matching_samples.append({
            "_id":            str(doc.get("_id", "")),
            "camera":         doc.get("camera", ""),
            "camera_ts_ist":  doc.get("camera_ts_ist", ""),
            "camera_ts":      doc.get("camera_ts", ""),
            "analyzed_at_ist":doc.get("analyzed_at_ist", ""),
        })

    # Distinct dates found in the collection (from first 200 docs)
    all_ts_values = []
    for doc in ppe_results_col.find({}, {"camera_ts_ist": 1, "camera_ts": 1}).limit(200):
        ts = doc.get("camera_ts_ist") or doc.get("camera_ts") or ""
        if ts:
            # Extract just the date part (first 10 chars)
            all_ts_values.append(str(ts)[:10])
    distinct_dates = sorted(set(all_ts_values))

    return {
        "queried_date":         use_date,
        "count_matching_today": count_today,
        "count_all_docs":       count_all,
        "distinct_dates_found": distinct_dates,
        "sample_doc":           sample_clean,
        "matching_samples":     matching_samples,
        "match_query_used":     str(match_q),
    }


# ═════════════════════════════════════════════════════════════════════════════
# CAMERAS
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/cameras")
def list_cameras():
    result = []
    for cam_id in CAMERAS:
        m3u8  = HLS_DIR / cam_id / "stream.m3u8"
        ready = m3u8.exists() and (time.time() - m3u8.stat().st_mtime) < 10
        result.append({"id": cam_id, "hls_url": f"/hls/{cam_id}/stream.m3u8", "ready": ready})
    return result


@app.get("/api/cameras/{cam_id}/restart")
def restart_camera(cam_id: str):
    if cam_id not in CAMERAS:
        return {"error": "Camera not found"}
    proc = _ffmpeg_procs.get(cam_id)
    if proc and proc.poll() is None:
        proc.terminate()
    start_ffmpeg(cam_id, CAMERAS[cam_id])
    return {"status": "restarting", "hls_url": f"/hls/{cam_id}/stream.m3u8"}


# ═════════════════════════════════════════════════════════════════════════════
# KPI
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/kpi")
def get_kpi(date: str = None):
    from collections import defaultdict

    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str
    match_q   = date_match(use_date)

    # ── Truly live: get the single most recent frame per camera ──────────
    # Don't load all of today — just the last 1 doc per camera sorted by timestamp
    cam_latest = {}
    for cam_id in ppe_results_col.distinct("camera", match_q):
        doc = ppe_results_col.find_one(
            date_and(match_q, {"camera": cam_id}),
            sort=[("camera_ts_ist", DESCENDING), ("camera_ts", DESCENDING)]
        )
        if doc:
            cam_latest[cam_id] = doc

    if not cam_latest:
        return {
            "total_persons": 0, "total_safe": 0, "total_violations": 0,
            "compliance_pct": 100, "active_cameras": 0,
            "critical_alerts": 0, "warning_alerts": 0,
            "info_alerts": 0, "resolved_alerts": 0, "open_alerts": 0,
            "peak_persons": 0, "peak_violations": 0,
        }

    results = list(ppe_results_col.find(match_q))  # still needed for peak + alerts

    live_persons    = 0
    live_violations = 0
    for doc in cam_latest.values():
        persons = doc.get("persons_count") or 0
        if persons == 0:
            persons = (
                doc.get("total_persons_count") or
                doc.get("summary", {}).get("total_persons") or
                len(doc.get("ppe", [])) or 0
            )
        live_persons += persons
        live_violations += sum(
            1 for p in doc.get("ppe", [])
            if p.get("violation_type") in ("no_helmet", "no_vest", "both_missing")
        )

    # ── Peak frame per camera (DAILY MAX — worst seen today) ──
    cam_peak = defaultdict(lambda: {"max_workers": 0, "max_violations": 0})
    for doc in results:
        cam = doc.get("camera", "unknown")
        persons = doc.get("persons_count") or 0
        if persons == 0:
            persons = (
                doc.get("total_persons_count") or
                doc.get("summary", {}).get("total_persons") or
                len(doc.get("ppe", [])) or 0
            )
        viols = sum(
            1 for p in doc.get("ppe", [])
            if p.get("violation_type") in ("no_helmet", "no_vest", "both_missing")
        )
        slot = cam_peak[cam]
        if persons > slot["max_workers"]:    slot["max_workers"]    = persons
        if viols   > slot["max_violations"]: slot["max_violations"] = viols

    peak_persons    = sum(c["max_workers"]    for c in cam_peak.values())
    peak_violations = sum(c["max_violations"] for c in cam_peak.values())

    total_persons    = live_persons
    total_violations = live_violations
    total_safe       = max(0, live_persons - live_violations)
    compliance_pct   = round((total_safe / live_persons * 100), 1) if live_persons else 100.0

    # ── Alerts ──
    open_raw = list(ppe_results_col.find(
        date_and(match_q, {"$or": [
            {"acknowledged": False},
            {"acknowledged": {"$exists": False}},
        ]})
    ))

    critical = warnings = 0
    for doc in open_raw:
        for p in doc.get("ppe", []):
            vt = str(p.get("violation_type") or "").lower()
            if "both"    in vt: critical += 1
            elif "helmet" in vt or "vest" in vt: warnings += 1

    resolved = ppe_results_col.count_documents(date_and(match_q, {"acknowledged": True}))

    return {
        "total_persons":    total_persons,
        "total_safe":       total_safe,
        "total_violations": total_violations,
        "compliance_pct":   compliance_pct,
        "peak_persons":     peak_persons,
        "peak_violations":  peak_violations,
        "active_cameras":   len(ppe_results_col.distinct("camera", match_q)),
        "critical_alerts":  critical,
        "warning_alerts":   warnings,
        "info_alerts":      0,
        "resolved_alerts":  resolved,
        "open_alerts":      len(open_raw),
    }
# ═════════════════════════════════════════════════════════════════════════════
# ALERTS
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/alerts")
def get_alerts(limit: int = 200, date: str = None, show_all: bool = False):
    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str

    results = list(
        ppe_results_col.find(date_match(use_date))
        .sort("analyzed_at_ist", DESCENDING)
        .limit(limit)
    )
    alerts = build_alert_list(results)
    alerts.sort(key=lambda a: a["acknowledged"])
    return alerts


@app.post("/api/alerts/{alert_id}")
def ack_alert(alert_id: str):
    real_id = alert_id.split("_")[0]
    try:
        ppe_results_col.update_one(
            {"_id": ObjectId(real_id)},
            {"$set": {"acknowledged": True, "ack_time": datetime.now().isoformat()}}
        )
    except Exception:
        pass
    return {"status": "acknowledged"}


# ═════════════════════════════════════════════════════════════════════════════
# PPE RESULTS
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/ppe-results")
def get_ppe_results(limit: int = 20, date: str = None, camera: str = None):
    if date and camera:
        query = date_and(date_match(date), {"camera": camera})
    elif date:
        query = date_match(date)
    elif camera:
        query = {"camera": camera}
    else:
        query = {}
    docs = list(ppe_results_col.find(query).sort("analyzed_at_ist", DESCENDING).limit(limit))
    return [serialize(d) for d in docs]


# ═════════════════════════════════════════════════════════════════════════════
# VIOLATIONS (legacy)
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/violations")
def get_violations(limit: int = 100, date: str = None):
    if date:
        try:
            dt = datetime.strptime(date, "%Y-%m-%d")
            alt = dt.strftime("%d-%m-%Y")
        except ValueError:
            alt = date
        query = {
            "$or": [
                {"timestamp": {"$regex": f"^{date}"}},
                {"timestamp": {"$regex": f"^{alt}"}},
            ]
        }
    else:
        query = {}
    docs   = list(violations_col.find(query).sort("timestamp", DESCENDING).limit(limit))
    result = []
    for d in docs:
        s = serialize(d)
        if "missing" in s and "missing_ppe" not in s:
            s["missing_ppe"] = s["missing"]
        s["detected_at"]     = s.get("timestamp", "")
        s["violation_count"] = len(s.get("missing_ppe") or s.get("missing") or [])
        result.append(s)
    return result


# ═════════════════════════════════════════════════════════════════════════════
# PPE VIOLATIONS
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/ppe-violations")
def get_ppe_violations(date: str = None, limit: int = 500):
    query = date_match(date) if date else {}

    # Only get docs that have violations in ppe array
    query = date_and(query, {"ppe": {"$exists": True, "$ne": []}})

    docs  = list(ppe_results_col.find(query).sort("analyzed_at_ist", DESCENDING).limit(limit))
    result = []

    for doc in docs:
        for p in doc.get("ppe", []):
            vt = p.get("violation_type", "")
            if vt not in ("no_helmet", "no_vest", "both_missing"):
                continue

            raw   = p.get("Violation") or p.get("violation") or []
            missing = []
            for item in raw:
                il = (item or "").lower()
                if il in ("hat", "helmet", "no_helmet"): missing.append("helmet")
                if il in ("vest", "no_vest"):             missing.append("vest")
            if not missing:
                if vt == "no_helmet":      missing = ["helmet"]
                elif vt == "no_vest":      missing = ["vest"]
                elif vt == "both_missing": missing = ["helmet", "vest"]

            result.append({
                "_id":            str(doc["_id"]),
                "worker_id":      p.get("label", "Unknown"),
                "camera":         doc.get("camera", ""),
                "timestamp":      doc.get("camera_ts_ist") or doc.get("camera_ts") or "",
                "violation_type": vt,
                "missing":        missing,
                "missing_ppe":    missing,
                "collage_num":    p.get("collage_num") or doc.get("collage_num"),
                "snap_id":        str(p.get("snap_id", "")),
                "x1": p.get("x1", 0), "y1": p.get("y1", 0),
                "x2": p.get("x2", 0), "y2": p.get("y2", 0),
            })

    return result

# ═════════════════════════════════════════════════════════════════════════════
# PPE VIOLATION COMMENTS
# ═════════════════════════════════════════════════════════════════════════════
@app.post("/api/ppe-violations/{doc_id}/comment")
async def add_comment(doc_id: str, request: Request):
    from fastapi import HTTPException
    try:
        body      = await request.json()
        comment   = body.get("comment", "").strip()
        worker_id = body.get("worker_id", "")
        if not comment:
            raise HTTPException(status_code=400, detail="Comment is empty")
        real_id = doc_id.split("_")[0]
        ppe_results_col.update_one(
            {"_id": ObjectId(real_id)},
            {"$push": {
                "comments": {
                    "text":      comment,
                    "worker_id": worker_id,
                    "added_at":  datetime.now().strftime("%Y-%m-%d %H:%M:%S IST"),
                }
            }}
        )
        return {"status": "ok", "comment": comment}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/ppe-violations/{doc_id}/comments")
def get_comments(doc_id: str):
    from fastapi import HTTPException
    try:
        real_id = doc_id.split("_")[0]
        doc     = ppe_results_col.find_one({"_id": ObjectId(real_id)}, {"comments": 1})
        return doc.get("comments", []) if doc else []
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


# ═════════════════════════════════════════════════════════════════════════════
# PPE VIOLATION SNAPSHOT
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/ppe-violations/{doc_id}/snapshot")
def get_ppe_violation_snapshot(doc_id: str, label: str = None):
    from fastapi import HTTPException
    import cv2, numpy as np

    try:
        doc = ppe_results_col.find_one({"_id": ObjectId(doc_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    ppe_list  = doc.get("ppe", [])
    ppe_entry = None
    if label:
        ppe_entry = next((p for p in ppe_list if p.get("label") == label), None)
    if not ppe_entry and ppe_list:
        ppe_entry = ppe_list[0]
    if not ppe_entry:
        raise HTTPException(status_code=404, detail="No PPE entry found")

    collage_id = doc.get("collage_id")
    if collage_id:
        collage = db["collages"].find_one({"_id": collage_id})
        if collage:
            persons_meta  = collage.get("persons_meta", [])
            target_label  = ppe_entry.get("label", "")
            matching_meta = next((p for p in persons_meta if p.get("label") == target_label), None)
            if matching_meta and matching_meta.get("crop_b64"):
                try:
                    img_bytes = base64.b64decode(matching_meta["crop_b64"])
                    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
                    crop_img  = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                    if crop_img is not None:
                        missing     = ppe_entry.get("Violation") or ppe_entry.get("violation") or []
                        missing_str = " + ".join(missing)
                        h, w        = crop_img.shape[:2]
                        cv2.rectangle(crop_img, (0, 0), (w, 30), (0, 0, 200), -1)
                        cv2.putText(crop_img,
                                    f"{target_label} — MISSING: {missing_str}",
                                    (5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                                    (255, 255, 255), 1, cv2.LINE_AA)
                        cv2.rectangle(crop_img, (0, 0), (w-1, h-1), (0, 0, 255), 3)
                        _, buf = cv2.imencode(".jpg", crop_img, [cv2.IMWRITE_JPEG_QUALITY, 92])
                        return Response(content=buf.tobytes(), media_type="image/jpeg",
                                        headers={"Cache-Control": "no-cache"})
                except Exception:
                    pass

    snap_id = doc.get("snap_id") or ppe_entry.get("snap_id")
    if not snap_id:
        raise HTTPException(status_code=404, detail="No snap_id found")
    snap = snapshots_col.find_one({"_id": snap_id}, {"image": 1})
    if not snap or not snap.get("image"):
        raise HTTPException(status_code=404, detail="Snapshot not found")

    try:
        img_bytes = base64.b64decode(snap["image"])
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        img       = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Cannot decode image")
        x1 = int(ppe_entry.get("x1", 0))
        y1 = int(ppe_entry.get("y1", 0))
        x2 = int(ppe_entry.get("x2", img.shape[1]))
        y2 = int(ppe_entry.get("y2", img.shape[0]))
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 3)
        cv2.putText(img, f"{ppe_entry.get('label','?')} — VIOLATION",
                    (x1, max(y1 - 10, 20)), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
        h, w = img.shape[:2]
        if w > 1280:
            scale = 1280 / w
            img   = cv2.resize(img, (1280, int(h * scale)), interpolation=cv2.INTER_AREA)
        _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
        return Response(content=buf.tobytes(), media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing error: {e}")


@app.get("/api/violations-by-camera")
def get_violations_by_camera(date: str = None):
    query = date_match(date) if date else {}
    pipeline = [
        {"$match": query},
        {"$unwind": "$ppe"},
        {"$group": {"_id": "$camera", "count": {"$sum": 1}}},
        {"$sort":  {"count": -1}},
    ]
    results = list(ppe_results_col.aggregate(pipeline))
    return [{"camera": r["_id"], "count": r["count"]} for r in results if r["_id"]]


@app.get("/api/violations/{violation_id}/debug")
def debug_violation(violation_id: str):
    from fastapi import HTTPException
    try:
        viol = violations_col.find_one({"_id": ObjectId(violation_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid violation_id")
    if not viol:
        raise HTTPException(status_code=404, detail="Violation not found")
    cam      = viol.get("camera", "")
    ts       = viol.get("timestamp", "")
    cam_dir  = COLLAGE_BASE_DIR / cam
    date_str = ts[:10] if ts else ""
    collages = sorted(cam_dir.glob(f"{date_str}_*persons.jpg")) if cam_dir.exists() and date_str else []
    return {
        "violation_keys":      list(viol.keys()),
        "violation_camera":    cam,
        "violation_timestamp": ts,
        "violation_worker_id": viol.get("worker_id", ""),
        "collage_base_exists": COLLAGE_BASE_DIR.exists(),
        "cam_dir_exists":      cam_dir.exists(),
        "collages_for_date":   [f.name for f in collages[:10]],
    }


@app.get("/api/violations/{violation_id}/snapshot")
def get_violation_snapshot(violation_id: str):
    from fastapi import HTTPException
    try:
        viol = violations_col.find_one({"_id": ObjectId(violation_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid violation_id")
    if not viol:
        raise HTTPException(status_code=404, detail="Violation not found")
    img_bytes = find_person_image(
        viol.get("camera", ""), viol.get("timestamp", ""), viol.get("worker_id", ""),
    )
    if img_bytes:
        return Response(content=img_bytes, media_type="image/jpeg",
                        headers={"Cache-Control": "no-cache"})
    raise HTTPException(status_code=404, detail="No image found for this violation")


@app.post("/api/violations/{violation_id}/feedback")
async def post_violation_feedback(violation_id: str, request: Request):
    from fastapi import HTTPException
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    verdict = body.get("verdict")
    if verdict not in ("correct", "false_positive"):
        raise HTTPException(status_code=400, detail="verdict must be 'correct' or 'false_positive'")
    try:
        violations_col.update_one(
            {"_id": ObjectId(violation_id)},
            {"$set": {
                "feedback":           verdict,
                "feedback_at":        datetime.now().isoformat(),
                "feedback_worker_id": body.get("worker_id", ""),
            }},
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid violation_id")
    return {"status": "ok", "verdict": verdict}


# ═════════════════════════════════════════════════════════════════════════════
# PPE COMPLIANCE
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/ppe-compliance")
@app.get("/api/ppe-compliance-summary")
def get_ppe_compliance(date: str = None):
    query = date_match(date) if date else {}
    results = list(ppe_results_col.find(query))

    if not results:
        return {
            "helmet": 100,
            "vest": 100,
            "total": 0,
            "wearing_helmet": 0,
            "wearing_vest": 0,
            "not_wearing_helmet": 0,
            "not_wearing_vest": 0,
            "total_persons": 0
        }

    total_persons = 0
    no_helmet = 0
    no_vest = 0

    for doc in results:
        # === Use actual persons_count if available ===
        count = doc.get("persons_count")
        if count is None or count == 0:
            count = len(doc.get("ppe", []))   # fallback

        total_persons += count

        # Count violations
        for p in doc.get("ppe", []):
            vt = p.get("violation_type", "")
            if vt in ("no_helmet", "both_missing"):
                no_helmet += 1
            if vt in ("no_vest", "both_missing"):
                no_vest += 1

    if total_persons == 0:
        return {
            "helmet": 100, "vest": 100, "total": 0,
            "wearing_helmet": 0, "wearing_vest": 0,
            "not_wearing_helmet": 0, "not_wearing_vest": 0,
            "total_persons": 0
        }

    helmet_compliance = round((total_persons - no_helmet) / total_persons * 100, 1)
    vest_compliance   = round((total_persons - no_vest)   / total_persons * 100, 1)

    return {
        "helmet":             helmet_compliance,
        "vest":               vest_compliance,
        "total":              total_persons,           # ← This is the new total
        "total_persons":      total_persons,
        "wearing_helmet":     total_persons - no_helmet,
        "not_wearing_helmet": no_helmet,
        "wearing_vest":       total_persons - no_vest,
        "not_wearing_vest":   no_vest,
    }


# ─────────────────────────────────────────────────────────────────────────────
# PPE COMPLIANCE — ZONE / CAMERA BREAKDOWN
# Returns per-camera counts used by the ZoneComplianceChart in PPECompliance.jsx
# Response shape:
#   [ { camera, wearing_helmet, not_wearing_helmet, wearing_vest, not_wearing_vest, total }, … ]
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/ppe-compliance-by-zone")
def get_ppe_compliance_by_zone(date: str = None):
    query = date_match(date) if date else {}
    results = list(ppe_results_col.find(query))

    from collections import defaultdict

    # Per camera: track the PEAK single frame (max, not sum)
    # Same logic as hourly trend — max workers and max violations
    # seen in any ONE frame for that camera
    cam_peak = defaultdict(lambda: {
        "max_workers":  0,
        "max_helmet_v": 0,
        "max_vest_v":   0,
    })

    for doc in results:
        cam = doc.get("camera", "Unknown")

        persons = doc.get("persons_count") or 0
        if persons == 0:
            persons = (
                doc.get("total_persons_count") or
                doc.get("summary", {}).get("total_persons") or
                len(doc.get("ppe", [])) or 0
            )

        helmet_v = sum(1 for p in doc.get("ppe", [])
                       if p.get("violation_type") in ("no_helmet", "both_missing"))
        vest_v   = sum(1 for p in doc.get("ppe", [])
                       if p.get("violation_type") in ("no_vest", "both_missing"))

        slot = cam_peak[cam]
        if persons   > slot["max_workers"]:  slot["max_workers"]  = persons
        if helmet_v  > slot["max_helmet_v"]: slot["max_helmet_v"] = helmet_v
        if vest_v    > slot["max_vest_v"]:   slot["max_vest_v"]   = vest_v

    result = []
    for cam, s in sorted(cam_peak.items()):
        if cam == "Unknown" and s["max_workers"] == 0:
            continue
        total = s["max_workers"]
        result.append({
            "camera":             cam,
            "total":              total,
            "not_wearing_helmet": s["max_helmet_v"],
            "not_wearing_vest":   s["max_vest_v"],
            "wearing_helmet":     max(0, total - s["max_helmet_v"]),
            "wearing_vest":       max(0, total - s["max_vest_v"]),
        })
    return result
@app.get("/api/daily-peak-compliance")
def get_daily_peak_compliance(date: str = None):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    query = date_match(date)

    # Sort by the correct field: total_persons_count
    pipeline = [
        {"$match": query},
        {"$sort": {"total_persons_count": -1}},   # ← Correct field
        {"$limit": 1}
    ]

    results = list(ppe_results_col.aggregate(pipeline))

    if not results:
        return {"date": date, "max_persons": 0, "message": "No documents found"}

    doc = results[0]

    # Use the correct field
    max_persons = doc.get("total_persons_count") or len(doc.get("ppe", []))

    # Count violations in this peak frame
    no_helmet = 0
    no_vest = 0
    for p in doc.get("ppe", []):
        vt = p.get("violation_type", "")
        if vt in ("no_helmet", "both_missing"):
            no_helmet += 1
        if vt in ("no_vest", "both_missing"):
            no_vest += 1

    return {
        "date": date,
        "max_persons": int(max_persons),
        "not_wearing_helmet": no_helmet,
        "not_wearing_vest": no_vest,
        "helmet_compliance_at_peak": round((max_persons - no_helmet) / max_persons * 100, 1) if max_persons > 0 else 0,
        "vest_compliance_at_peak": round((max_persons - no_vest) / max_persons * 100, 1) if max_persons > 0 else 0,
        "peak_timestamp": doc.get("camera_ts_ist") or doc.get("camera_ts") or doc.get("analyzed_at_ist"),
        "camera": doc.get("camera", "Unknown"),
        "total_persons_count": doc.get("total_persons_count")
    }
# ═════════════════════════════════════════════════════════════════════════════
# REPORTS
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/reports/daily")
def daily_report(date: str = None):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    results    = list(ppe_results_col.find(date_match(date)))
    violations = list(violations_col.find({"timestamp": {"$regex": f"^{date}"}}))
    alerts     = list(alerts_col.find({"timestamp": {"$regex": f"^{date}"}}))

    frame_count    = len(results)
    avg_persons    = round(sum(get_total_persons(r)    for r in results) / frame_count) if frame_count else 0
    avg_violations = round(sum(get_total_violations(r) for r in results) / frame_count) if frame_count else 0
    avg_safe       = max(0, avg_persons - avg_violations)
    compliance     = round((avg_safe / avg_persons * 100) if avg_persons else 100, 1)
    no_helmet      = sum(r.get("violation_breakdown", {}).get("no_helmet", 0) for r in results)
    no_vest        = sum(r.get("violation_breakdown", {}).get("no_vest",   0) for r in results)

    return {
        "date":                     date,
        "avg_workers_onsite":       avg_persons,
        "avg_safe_workers":         avg_safe,
        "avg_violations_per_frame": avg_violations,
        "compliance_pct":           compliance,
        "total_alerts":             len(alerts),
        "critical_alerts":          sum(1 for a in alerts if a.get("severity") == "critical"),
        "warning_alerts":           sum(1 for a in alerts if a.get("severity") == "warning"),
        "total_violations_logged":  len(violations),
        "violation_types":          {"no_helmet": no_helmet, "no_vest": no_vest},
        "frames_analyzed":          frame_count,
    }


# ═════════════════════════════════════════════════════════════════════════════
# HOURLY TREND
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/hourly-trend")
def get_hourly_trend(date: str = None, shift: str = "day"):
    query = date_match(date) if date else {}
    results = list(ppe_results_col.find(query))

    from collections import defaultdict
    import re

    # Each camera slot tracks:
    #   max_workers    — highest persons_count in any single frame this hour
    #   max_violations — highest violation count in any single frame this hour
    # Final value = SUM of per-camera maxima (same method for both fields)
    hour_camera = defaultdict(lambda: defaultdict(lambda: {"max_workers": 0, "max_violations": 0}))

    for doc in results:
        ts = (doc.get("camera_ts_ist") or
              doc.get("camera_ts") or
              doc.get("analyzed_at_ist") or
              doc.get("created_at_ist") or "")

        ts_str = str(ts).replace(" IST", "").strip()

        try:
            match = re.search(r'(\d{2}):', ts_str)
            hour = int(match.group(1)) if match else None
        except:
            continue

        if hour is None or not (0 <= hour <= 23):
            continue

        if shift == "day" and not (6 <= hour < 18):
            continue
        if shift == "night" and not (hour < 6 or hour >= 18):
            continue

        hour_key = f"{hour:02d}:00"
        camera = doc.get("camera", "unknown")

        # Persons count
        persons = doc.get("persons_count") or 0
        if persons == 0:
            persons = (
                doc.get("total_persons_count") or
                doc.get("summary", {}).get("total_persons") or
                len(doc.get("ppe", [])) or 0
            )

        # Violations in this single frame
        violations_in_frame = sum(
            1 for p in doc.get("ppe", [])
            if p.get("violation_type") in ("no_helmet", "no_vest", "both_missing")
        )

        # MAX per camera — same logic for both workers and violations
        if persons > hour_camera[hour_key][camera]["max_workers"]:
            hour_camera[hour_key][camera]["max_workers"] = persons

        if violations_in_frame > hour_camera[hour_key][camera]["max_violations"]:
            hour_camera[hour_key][camera]["max_violations"] = violations_in_frame

    # Final aggregation: sum the per-camera peak values
    result = []
    for hour_key in sorted(hour_camera.keys()):
        data = hour_camera[hour_key]
        peak_workers = sum(c["max_workers"]    for c in data.values())
        total_viol   = sum(c["max_violations"] for c in data.values())

        result.append({
            "hour": hour_key,
            "workers_active": peak_workers,
            "workers_safe": max(0, peak_workers - total_viol),
            "violations": total_viol
        })

    return result

@app.get("/api/debug/hourly-10")
def debug_hour_10(date: str = "2026-04-14"):
    query = date_match(date)
    docs = list(ppe_results_col.find(query).limit(100))  # increased limit

    data = []
    for d in docs:
        ts = str(d.get("camera_ts_ist") or d.get("camera_ts") or d.get("analyzed_at_ist") or "")[:19]
        persons = (
            d.get("persons_count") or
            d.get("total_persons_count") or
            d.get("summary", {}).get("total_persons") or
            d.get("total_count") or
            len(d.get("ppe", [])) or 0
        )
        violations = sum(
            1 for p in d.get("ppe", [])
            if p.get("violation_type") in ("no_helmet", "no_vest", "both_missing")
        )

        data.append({
            "timestamp": ts,
            "camera": d.get("camera", "unknown"),
            "persons_count": persons,
            "violations_in_frame": violations,
            "collage_num": d.get("collage_num")
        })

    # Sort and return only 10:xx entries prominently
    data.sort(key=lambda x: x["timestamp"])
    hour_10_samples = [d for d in data if "10:" in d.get("timestamp", "")]

    return {
        "date": date,
        "total_docs": len(data),
        "samples_in_10_hour": hour_10_samples[:30],   # focus on 10:00 hour
        "all_cameras_in_10": list({d["camera"] for d in hour_10_samples})
    }
# ═════════════════════════════════════════════════════════════════════════════
# SNAPSHOTS
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/snapshots/{snap_id}/image")
def get_snapshot_image(snap_id: str):
    from fastapi import HTTPException
    try:
        doc = snapshots_col.find_one({"_id": ObjectId(snap_id)}, {"image": 1})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid snap_id")
    if not doc or not doc.get("image"):
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return {"image": doc["image"]}


# ═════════════════════════════════════════════════════════════════════════════
# BATCH IMAGES
# ═════════════════════════════════════════════════════════════════════════════
@app.get("/api/images")
def get_images(date: str = None):
    query = {}
    if date: query["date"] = date
    docs = list(images_col.find(query).sort("batchNumber", 1))
    return [serialize(d) for d in docs]


@app.get("/api/images/sample")
def get_sample_image_doc():
    doc = images_col.find_one({})
    if not doc:
        return {"error": "no images found"}
    doc = dict(doc)
    doc["_id"] = str(doc["_id"])
    for field in ("data", "image", "content", "base64"):
        if field in doc and doc[field]:
            doc[field] = f"<base64 present, length={len(str(doc[field]))}>"
    return doc


@app.delete("/api/images/{image_id}")
def delete_image(image_id: str):
    from fastapi import HTTPException
    try:
        images_col.delete_one({"_id": ObjectId(image_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image_id")
    return {"status": "deleted"}

 


# ═════════════════════════════════════════════════════════════════════════════

# CHATBOT — Safety AI Assistant powered by GPT-4o + MongoDB data

# ═════════════════════════════════════════════════════════════════════════════

import re as _re

from openai import OpenAI as _OpenAI
 
 
def get_openai_client():

    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:

        raise ValueError("OPENAI_API_KEY not set in .env")

    return _OpenAI(api_key=api_key)
 
 
# ─────────────────────────────────────────────────────────────────────────────

# DYNAMIC SCHEMA — reads a real document so GPT uses correct field names

# ─────────────────────────────────────────────────────────────────────────────

def get_dynamic_schema() -> str:
    sample = ppe_results_col.find_one({}, {
        "camera": 1, "camera_ts": 1, "ppe": 1,
        "total_persons_count": 1, "total_violation_count": 1
    })
    if not sample:
        return "Collection ppe_results appears to be empty."

    ppe_array = sample.get("ppe", [])
    ppe_keys = list(ppe_array[0].keys()) if ppe_array else []
    ts_value = sample.get("camera_ts_ist") or sample.get("camera_ts") or "NOT FOUND"

    return f"""
=== MongoDB Schema: ppe_results ===
FIELDS: camera, camera_ts, total_persons_count, total_violation_count, ppe[]
TIMESTAMP: "camera_ts" = "{ts_value}" → filter: {{"camera_ts": {{"$regex": "^YYYY-MM-DD"}}}}
PPE ARRAY keys: {ppe_keys}
  violation_type: "no_helmet" | "no_vest" | "both_missing" | (empty = safe)
  label: worker id
RULES:
1. Always $unwind "$ppe" before $match on ppe fields
2. One doc = one frame. Workers are inside ppe[]
"""

    return schema
 
 
# ─────────────────────────────────────────────────────────────────────────────

# AVAILABLE DATES

# ─────────────────────────────────────────────────────────────────────────────

def get_available_dates() -> list:

    all_ts = []

    for doc in ppe_results_col.find({}, {"camera_ts": 1, "camera_ts_ist": 1}).limit(500):

        ts = doc.get("camera_ts_ist") or doc.get("camera_ts") or ""

        if ts:

            all_ts.append(str(ts)[:10])

    return sorted(set(all_ts))
 
 
# ─────────────────────────────────────────────────────────────────────────────

# MONGO QUERY RUNNER

# ─────────────────────────────────────────────────────────────────────────────

def run_mongo_query(query_plan: dict) -> str:

    try:

        collection_name = query_plan.get("collection", "ppe_results")

        operation       = query_plan.get("operation", "find")

        query_filter    = query_plan.get("filter", {})

        projection      = query_plan.get("projection", None)

        sort_field      = query_plan.get("sort", None)

        limit           = min(int(query_plan.get("limit", 50)), 200)

        pipeline        = query_plan.get("pipeline", None)
 
        col_map = {

            "ppe_results": ppe_results_col,

            "snapshots":   snapshots_col,

            "alerts":      alerts_col,

            "violations":  violations_col,

            "collages":    db["collages"],

        }

        col = col_map.get(collection_name, ppe_results_col)
 
        # ── execute ──────────────────────────────────────────────────────

        if operation == "aggregate" and pipeline:

            results = list(col.aggregate(pipeline))
 
        elif operation == "count":

            count = col.count_documents(query_filter)

            return f"Count result: {count}"
 
        elif operation == "distinct":

            field   = query_plan.get("field", "camera")

            results = col.distinct(field, query_filter)

            if not results:

                return f"No distinct values found for '{field}' with the given filter."

            return (

                f"Distinct values for '{field}' ({len(results)} total): {results}"

            )
 
        else:  # find

            cursor = col.find(query_filter, projection)

            if sort_field:

                cursor = cursor.sort(sort_field[0], sort_field[1])

            results = list(cursor.limit(limit))
 
        if not results:

            return "No documents found matching the query."
 
        # ── flatten for GPT ───────────────────────────────────────────────

        lines = []

        for i, doc in enumerate(results[:100]):

            doc["_id"] = str(doc.get("_id", ""))

            for big_field in ("all_persons", "collage_id", "image", "crop_b64"):

                doc.pop(big_field, None)

            if "ppe" in doc and isinstance(doc["ppe"], list):

                doc["ppe"] = [

                    {

                        "label":          p.get("label", "?"),

                        "violation_type": p.get("violation_type", "none"),

                    }

                    for p in doc["ppe"]

                ]

            lines.append(f"[{i+1}] {json.dumps(doc, default=str)}")
 
        return f"Query returned {len(results)} document(s):\n" + "\n".join(lines[:10])
 
    except Exception as e:

        return f"Query execution error: {e}"
 
 
# ─────────────────────────────────────────────────────────────────────────────

# CHAT ENDPOINT

# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/chat")
 
async def chat_endpoint(request: Request):
 
    from fastapi import HTTPException
 
    try:
 
        body = await request.json()
 
    except Exception:
 
        raise HTTPException(status_code=400, detail="Invalid JSON")
 
    user_message = body.get("message", "").strip()
 
    history      = body.get("history", [])
 
    if not user_message:
 
        raise HTTPException(status_code=400, detail="Message is empty")
 
    available_dates = get_available_dates()
 
    latest_date     = available_dates[-1] if available_dates else datetime.now().strftime("%Y-%m-%d")
 
    yesterday_date  = available_dates[-2] if len(available_dates) >= 2 else latest_date
 
    # Greetings — no tokens used
 
    GREETINGS = ["hi","hello","hey","good morning","good afternoon","good evening","howdy","sup","greetings","hii","hiii"]
 
    if user_message.lower().strip("!.,? ") in GREETINGS:
 
        return {
            "reply": "👷 Hello! I'm YOLOIntel Safety Assistant.\n\nAsk me anything about site safety:\n• How many violations today?\n• Which workers are missing helmets?\n• Which camera has most violations?\n• Show compliance summary\n• Worker safety report",
            "tokens_used": 0, "query_used": None, "date": latest_date
        }
 
    # Resolve date
 
    explicit_date = _re.search(r'\d{4}-\d{2}-\d{2}', user_message)
 
    if explicit_date:
 
        resolved_date = explicit_date.group()
 
    elif _re.search(r'\byesterday\b', user_message, _re.IGNORECASE):
 
        resolved_date = yesterday_date
 
    else:
 
        resolved_date = latest_date
 
    is_today = (resolved_date == latest_date)
 
    sanitized_message = _re.sub(
 
        r'\b(today|yesterday|this week|last week)\b',
 
        f'on {resolved_date}',
 
        user_message, flags=_re.IGNORECASE,
 
    )
 
    current_hour = datetime.now().strftime("%H")
 
    prev_hour    = str(int(current_hour) - 1).zfill(2)
 
    try:
 
        openai_client = get_openai_client()
 
    except ValueError as e:
 
        raise HTTPException(status_code=500, detail=str(e))
 
    # ── STEP 1: GPT writes query (short prompt) ───────────────────────────
 
    query_prompt = f"""MongoDB PPE query generator.
DATE: {resolved_date}
COLLECTION: ppe_results
KEY FIELDS: camera_ts (string "2026-04-15 10:30:00 IST"), camera, ppe[{{label, violation_type}}]
violation_type values: "no_helmet" | "no_vest" | "both_missing"
RULE: $unwind "$ppe" before any $match on ppe fields.

QUESTION: "{sanitized_message}"

Reply ONLY with valid JSON query plan. No markdown. Use these templates:
Count violations: {{"collection":"ppe_results","operation":"aggregate","pipeline":[{{"$match":{{"camera_ts":{{"$regex":"^{resolved_date}"}}}}}},{{"$unwind":"$ppe"}},{{"$match":{{"ppe.violation_type":{{"$in":["no_helmet","no_vest","both_missing"]}}}}}},{{"$count":"total"}}]}}
List workers: {{"collection":"ppe_results","operation":"aggregate","pipeline":[{{"$match":{{"camera_ts":{{"$regex":"^{resolved_date}"}}}}}},{{"$unwind":"$ppe"}},{{"$match":{{"ppe.violation_type":{{"$in":["no_helmet","no_vest","both_missing"]}}}}}},{{"$group":{{"_id":"$ppe.label","camera":{{"$first":"$camera"}},"type":{{"$first":"$ppe.violation_type"}}}}}}]}}
By camera: {{"collection":"ppe_results","operation":"aggregate","pipeline":[{{"$match":{{"camera_ts":{{"$regex":"^{resolved_date}"}}}}}},{{"$unwind":"$ppe"}},{{"$group":{{"_id":"$camera","count":{{"$sum":1}}}}}},{{"$sort":{{"count":-1}}}}]}}"""
 
    query_plan = None
 
    query_result_text = ""
 
    query_tokens = 0
 
    try:
 
        q_response   = openai_client.chat.completions.create(
 
            model="gpt-4o",
 
            messages=[{"role": "user", "content": query_prompt}],
 
            max_tokens=250,   # reduced from 1000
 
            temperature=0,
 
        )
 
        raw          = q_response.choices[0].message.content.strip()
 
        query_tokens = q_response.usage.total_tokens
 
        raw          = raw.replace("```json","").replace("```","").strip()
 
        query_plan   = json.loads(raw)
        print(f"[STEP 1] GPT QUERY ({query_tokens} tokens):")
        print(json.dumps(query_plan, indent=2))
 
    except Exception as e:
 
        query_result_text = f"Query error: {e}"
 
        query_plan = None
 
    # ── STEP 2: Run on MongoDB ────────────────────────────────────────────
 
    if query_plan:
 
        query_result_text = run_mongo_query(query_plan)
        print(f"[STEP 2] MONGODB RESULT:")
        print(query_result_text[:500])
 
    # ── STEP 3: GPT explains (short prompt) ──────────────────────────────
 
    date_label = "today" if is_today else ("yesterday" if resolved_date == yesterday_date else f"on {resolved_date}")
 
    explain_messages = [
 
        {
 
            "role": "system",
 
            "content": f"Safety AI. Answer in ONE sentence only. Use numbers from DB result directly. Say '{date_label}'. no_helmet=no helmet, no_vest=no vest, both_missing=missing both. No explanation needed."
        }
 
    ]
 
    # Only last 4 messages history (reduced from 6)
 
    for h in history[-4:]:
 
        if h.get("role") in ("user","assistant") and h.get("content"):
 
            explain_messages.append({"role": h["role"], "content": h["content"]})
 
    explain_messages.append({
 
        "role": "user",
 
        "content": f"Question: {user_message}\nDB result:\n{query_result_text}\nAnswer directly."
 
    })
 
    try:
 
        e_response  = openai_client.chat.completions.create(
 
            model="gpt-4o",
 
            messages=explain_messages,
 
            max_tokens=150,   # reduced from 700
 
            temperature=0.1,
 
        )
 
        reply       = e_response.choices[0].message.content.strip()
 
        tokens_used = query_tokens + e_response.usage.total_tokens
        print(f"[STEP 3] GPT REPLY:")

        print(reply)

        print(f"\n[TOTAL] query:{query_tokens} + explain:{e_response.usage.total_tokens} = {tokens_used} tokens")

        print("=" * 60 + "\n")
 
 
    except Exception as e:
 
        raise HTTPException(status_code=500, detail=f"OpenAI error: {e}")
 
    return {
 
        "reply":       reply,
 
        "tokens_used": tokens_used,
 
        "query_used":  query_plan,
 
        "date":        resolved_date,
 
    }
 

 
# ═════════════════════════════════════════════════════════════════════════════
# SSE LIVE STREAM
# ═════════════════════════════════════════════════════════════════════════════



@app.get("/api/stream")
async def stream_updates(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            if _shutdown_event.is_set():
                break
            try:
                today_str = datetime.now().strftime("%Y-%m-%d")

                # ── reuse get_kpi logic directly ──
                kpi_data = get_kpi(today_str)
                

                match_q    = date_match(today_str)
                raw_alerts = list(
                    ppe_results_col.find(
                        date_and(
                            match_q,
                            {"$or": [
                                {"acknowledged": False},
                                {"acknowledged": {"$exists": False}},
                            ]}
                        )
                    )
                    .sort("analyzed_at_ist", DESCENDING)
                    .limit(10)
                )
                open_alerts = build_alert_list(raw_alerts)

                payload = {
                    "kpi":            kpi_data,
                    "latest_alerts":  open_alerts[:10],
                    "latest_results": [],
                    "timestamp":      datetime.now().isoformat(),
                }
                yield f"data: {json.dumps(payload)}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

            try:
                await asyncio.wait_for(asyncio.shield(_shutdown_event.wait()), timeout=3.0)
                break
            except asyncio.TimeoutError:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ═════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn, webbrowser

    loop = asyncio.new_event_loop()

    def _signal_handler(sig, frame):
        print("\n[YOLOIntel] Shutting down...")
        loop.call_soon_threadsafe(_shutdown_event.set)
        stop_all_streams()
        time.sleep(1.5)
        sys.exit(0)

    signal.signal(signal.SIGINT,  _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    import atexit
    for cam_id, rtsp_url in CAMERAS.items():
        start_ffmpeg(cam_id, rtsp_url)
    atexit.register(stop_all_streams)

    threading.Thread(
        target=lambda: (time.sleep(1.5), webbrowser.open("http://localhost:5173")),
        daemon=True,
    ).start()

    print("\n╔══════════════════════════════════════════════╗")
    print("║   🦺  YOLOIntel Safety Dashboard             ║")
    print("║   Dashboard : http://localhost:5173          ║")
    print("║   API       : http://localhost:8000          ║")
    print("║   Ctrl+C to stop                             ║")
    print("╚══════════════════════════════════════════════╝\n")
    print(f"  Collage dir        : {COLLAGE_BASE_DIR}")
    print(f"  Collage dir exists : {COLLAGE_BASE_DIR.exists()}\n")

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, loop="asyncio")