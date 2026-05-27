from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response, RedirectResponse
from pymongo import MongoClient, DESCENDING
from bson import ObjectId
from pathlib import Path
import json, time, asyncio, signal, sys, subprocess, threading, os, base64, io
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse

load_dotenv(dotenv_path=r"C:\Users\srustib\Desktop\yolo-frontend\.env")

CACHE = {}
CACHE_TTL = 15

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
    if not date_str:
        return {}
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return {}

    dt_next      = dt + timedelta(days=1)
    alt_date_str = dt.strftime("%d-%m-%Y")

    return {
        "$or": [
            # camera_ts_ist — April data (e.g. "2026-04-10 10:25:59 IST")
            {"camera_ts_ist": {"$regex": f"^{date_str}"}},
            {"camera_ts_ist": {"$regex": f"^{alt_date_str}"}},
            # camera_ts string — May data (camera_ts_ist is empty for these)
            {"camera_ts":     {"$regex": f"^{date_str}"}},
            {"camera_ts":     {"$regex": f"^{alt_date_str}"}},
            # camera_ts_utc — BSON ISODate field (most reliable)
            {"camera_ts_utc": {"$gte": dt, "$lt": dt_next}},
        ]
    }

def date_and(date_q: dict, extra: dict) -> dict:
    """
    Safely combine a date_match() result (which has $or) with an extra filter
    like {"camera": "..."}.

    MongoDB does NOT allow merging two dicts with $or at the top level —
    you must use $and explicitly.
    """
    if not date_q and not extra:
        return {}
    if not date_q:
        return extra
    if not extra:
        return date_q
    # Always use $and to combine — never merge keys
    return {"$and": [date_q, extra]}


def get_ts(doc: dict) -> str:
    return doc.get("camera_ts_ist") or doc.get("camera_ts") or doc.get("analyzed_at_ist") or ""


def get_total_persons(doc: dict) -> int:
    return doc.get("summary", {}).get("total_persons", 0) or doc.get("total_persons_count", 0)


def get_total_violations(doc: dict) -> int:
    return doc.get("summary", {}).get("violations", 0) or doc.get("total_violation_count", 0)


# ─────────────────────────────────────────────────────────────────────────────
# PPE HELPERS  (defined ONCE here — used everywhere below)
# ─────────────────────────────────────────────────────────────────────────────
VIOLATION_TYPES = {"no_helmet", "no_vest", "both_missing"}


def _persons_count(doc: dict) -> int:
    """
    Return workers seen by this camera in this frame.
    Priority: all_persons[] > persons_count > total_persons_count > summary.total_persons
    """
    all_p = doc.get("all_persons")
    if all_p and isinstance(all_p, list) and len(all_p) > 0:
        return len(all_p)
    v = doc.get("persons_count") or 0
    if v: return int(v)
    v = doc.get("total_persons_count") or 0
    if v: return int(v)
    v = (doc.get("summary") or {}).get("total_persons") or 0
    if v: return int(v)
    return 0


def _violations_count(doc: dict) -> int:
    """Count PPE violations from the ppe[] array."""
    return sum(
        1 for p in (doc.get("ppe") or [])
        if str(p.get("violation_type") or "").strip().lower() in VIOLATION_TYPES
    )


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
                if il in ("vest", "no_vest"):            missing.append("vest")
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


def _calc_max_safe_from_docs(docs: list) -> dict:
    from collections import defaultdict
    cam_best = defaultdict(lambda: {"max_safe": 0, "persons": 0, "violations": 0})
    for doc in docs:
        cam = doc.get("camera", "unknown")
        persons = _persons_count(doc)
        viols   = _violations_count(doc)
        safe_in_frame = max(0, persons - viols)
        if safe_in_frame > cam_best[cam]["max_safe"]:
            cam_best[cam]["max_safe"]   = safe_in_frame
            cam_best[cam]["persons"]    = persons
            cam_best[cam]["violations"] = viols
    return cam_best



def calc_kpi_from_docs(docs):
    import re
    from collections import defaultdict
    hour_cam = defaultdict(lambda: defaultdict(lambda: {"max_p": 0, "max_v": 0}))
    for doc in docs:
        ts     = (doc.get("camera_ts_ist") or doc.get("camera_ts") or "")
        ts_str = str(ts).replace(" IST", "").strip()
        try:
            match = re.search(r'(\d{2}):', ts_str)
            hour  = int(match.group(1)) if match else None
        except:
            hour = None
        if hour is None:
            continue
        cam     = doc.get("camera", "unknown")
        persons = _persons_count(doc)
        viols   = _violations_count(doc)
        slot = hour_cam[hour][cam]
        if persons > slot["max_p"]: slot["max_p"] = persons
        if viols   > slot["max_v"]: slot["max_v"] = viols

    total_violations = 0
    total_persons    = 0
    for hour, cameras in hour_cam.items():
        for cam, slot in cameras.items():
            total_violations += slot["max_v"]
            total_persons    += slot["max_p"]

    total_safe = max(0, total_persons - total_violations)
    compliance = round((total_safe / total_persons * 100), 1) if total_persons > 0 else 100.0
    return {
        "total_persons":    total_persons,
        "total_safe":       total_safe,
        "total_violations": total_violations,
        "compliance_pct":   compliance,
    }


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


# ─────────────────────────────────────────────────────────────────────────────
# DEBUG
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/debug/dates")
def debug_dates(date: str = None):
    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str
    sample    = ppe_results_col.find_one({})
    sample_clean = None
    if sample:
        sample_clean = {
            "_id":             str(sample.get("_id", "")),
            "camera":          sample.get("camera", ""),
            "camera_ts_ist":   sample.get("camera_ts_ist",  "<<MISSING>>"),
            "camera_ts":       sample.get("camera_ts",      "<<MISSING>>"),
            "analyzed_at_ist": sample.get("analyzed_at_ist","<<MISSING>>"),
            "analyzed_at":     sample.get("analyzed_at",    "<<MISSING>>"),
            "all_keys":        list(sample.keys()),
        }
    match_q     = date_match(use_date)
    count_today = ppe_results_col.count_documents(match_q)
    count_all   = ppe_results_col.count_documents({})

    matching_samples = []
    for doc in ppe_results_col.find(match_q).limit(5):
        matching_samples.append({
            "_id":             str(doc.get("_id", "")),
            "camera":          doc.get("camera", ""),
            "camera_ts_ist":   doc.get("camera_ts_ist", ""),
            "camera_ts":       doc.get("camera_ts", ""),
            "analyzed_at_ist": doc.get("analyzed_at_ist", ""),
        })

    all_ts_values = []
    for doc in ppe_results_col.find({}, {"camera_ts_ist": 1, "camera_ts": 1}).limit(200):
        ts = doc.get("camera_ts_ist") or doc.get("camera_ts") or ""
        if ts:
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


@app.get("/api/debug/kpi-camera")
def debug_kpi_camera(date: str = None, camera: str = None):
    """Diagnose camera filter — shows matched doc count with/without camera."""
    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str
    base_q    = date_match(use_date)

    count_all = ppe_results_col.count_documents(base_q)

    cam_q     = date_and(base_q, {"camera": camera}) if camera else None
    count_cam = ppe_results_col.count_documents(cam_q) if cam_q else None

    distinct_cameras = ppe_results_col.distinct("camera", base_q)

    return {
        "date":              use_date,
        "camera_param":      camera,
        "count_all_date":    count_all,
        "count_with_camera": count_cam,
        "distinct_cameras":  distinct_cameras,
        "camera_query":      str(cam_q),
    }


@app.get("/api/debug/hourly-10")
def debug_hour_10(date: str = "2026-04-14"):
    query = date_match(date)
    docs  = list(ppe_results_col.find(query).limit(100))
    data  = []
    for d in docs:
        ts      = str(d.get("camera_ts_ist") or d.get("camera_ts") or d.get("analyzed_at_ist") or "")[:19]
        persons = _persons_count(d)
        viols   = _violations_count(d)
        data.append({
            "timestamp":          ts,
            "camera":             d.get("camera", "unknown"),
            "persons_count":      persons,
            "violations_in_frame":viols,
            "collage_num":        d.get("collage_num"),
        })
    data.sort(key=lambda x: x["timestamp"])
    hour_10_samples = [d for d in data if "10:" in d.get("timestamp", "")]
    return {
        "date":                 date,
        "total_docs":           len(data),
        "samples_in_10_hour":   hour_10_samples[:30],
        "all_cameras_in_10":    list({d["camera"] for d in hour_10_samples}),
    }


# ─────────────────────────────────────────────────────────────────────────────
# CAMERAS
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# KPI  ← FIXED: camera filter now works correctly
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/kpi")
def get_kpi(date: str = None, camera: str = None):
    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str
    match_q   = date_match(use_date)

    if camera:
        cam_list  = [c.strip() for c in camera.split(',')]
        cam_match = date_and(match_q, {"camera": {"$in": cam_list}})
        docs      = list(ppe_results_col.find(cam_match))
    else:
        docs = list(ppe_results_col.find(match_q))

    # ── Peak-per-camera-per-hour, summed across day ──
    stats = calc_kpi_from_docs(docs)

    # ── Alerts ──
    alert_match = cam_match if camera else match_q
    open_raw = list(ppe_results_col.find(
        date_and(alert_match, {"$or": [
            {"acknowledged": False},
            {"acknowledged": {"$exists": False}},
        ]})
    ))
    critical = warnings = 0
    for doc in open_raw:
        for p in doc.get("ppe", []):
            vt = str(p.get("violation_type") or "").lower()
            if "both" in vt:                       critical += 1
            elif "helmet" in vt or "vest" in vt:   warnings += 1
    resolved = ppe_results_col.count_documents(
        date_and(alert_match, {"acknowledged": True})
    )
    active_cameras = (
        len(cam_list) if camera
        else len(ppe_results_col.distinct("camera", match_q))
    )

    return {
        "total_persons":    stats["total_persons"],
        "total_safe":       stats["total_safe"],
        "total_violations": stats["total_violations"],
        "compliance_pct":   stats["compliance_pct"],
        "peak_persons":     stats["total_persons"],
        "peak_violations":  stats["total_violations"],
        "active_cameras":   active_cameras,
        "critical_alerts":  critical,
        "warning_alerts":   warnings,
        "info_alerts":      0,
        "resolved_alerts":  resolved,
        "open_alerts":      len(open_raw),
    }
# ─────────────────────────────────────────────────────────────────────────────
# ALERTS
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/alerts")
def get_alerts(limit: int = 200, date: str = None, show_all: bool = False):
    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str
    results   = list(
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


# ─────────────────────────────────────────────────────────────────────────────
# PPE RESULTS
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# VIOLATIONS (legacy)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/violations")
def get_violations(limit: int = 100, date: str = None):
    if date:
        try:
            dt  = datetime.strptime(date, "%Y-%m-%d")
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


# ─────────────────────────────────────────────────────────────────────────────
# PPE VIOLATIONS
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/ppe-violations")
def get_ppe_violations(date: str = None, limit: int = 500):
    query = date_match(date) if date else {}
    query = date_and(query, {"ppe": {"$exists": True, "$ne": []}})
    docs  = list(ppe_results_col.find(query).sort("analyzed_at_ist", DESCENDING).limit(limit))
    result = []
    for doc in docs:
        for p in doc.get("ppe", []):
            vt = p.get("violation_type", "")
            if vt not in ("no_helmet", "no_vest", "both_missing"):
                continue
            raw     = p.get("Violation") or p.get("violation") or []
            missing = []
            for item in raw:
                il = (item or "").lower()
                if il in ("hat", "helmet", "no_helmet"): missing.append("helmet")
                if il in ("vest", "no_vest"):            missing.append("vest")
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
                "acknowledged":   doc.get("acknowledged", False),
                "ack_time":       doc.get("ack_time", ""),
            })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# PPE VIOLATION COMMENTS
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# PPE VIOLATION ACK  (defined ONCE)
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/api/ppe-violations/{doc_id}/ack")
async def ack_ppe_violation(doc_id: str, request: Request):
    from fastapi import HTTPException
    try:
        real_id = doc_id.split("_")[0]
        result  = ppe_results_col.update_one(
            {"_id": ObjectId(real_id)},
            {"$set": {
                "acknowledged": True,
                "ack_time":     datetime.now().strftime("%Y-%m-%d %H:%M:%S IST"),
            }}
        )
        return {
            "status":   "acknowledged",
            "matched":  result.matched_count,
            "modified": result.modified_count,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# PPE VIOLATION SNAPSHOT
# ─────────────────────────────────────────────────────────────────────────────
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
    query    = date_match(date) if date else {}
    pipeline = [
        {"$match": query},
        {"$unwind": "$ppe"},
        {"$match": {"ppe.violation_type": {"$in": ["no_helmet", "no_vest", "both_missing"]}}},
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


# ─────────────────────────────────────────────────────────────────────────────
# PPE COMPLIANCE
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/ppe-compliance")
@app.get("/api/ppe-compliance-summary")
def get_ppe_compliance(date: str = None):
    query   = date_match(date) if date else {}
    results = list(ppe_results_col.find(query))

    if not results:
        return {
            "helmet": 100, "vest": 100, "total": 0,
            "wearing_helmet": 0, "wearing_vest": 0,
            "not_wearing_helmet": 0, "not_wearing_vest": 0,
            "total_persons": 0,
        }

    total_persons = 0
    no_helmet     = 0
    no_vest       = 0

    for doc in results:
        count = doc.get("persons_count")
        if count is None or count == 0:
            count = len(doc.get("ppe", []))
        total_persons += count
        for p in doc.get("ppe", []):
            vt = p.get("violation_type", "")
            if vt in ("no_helmet", "both_missing"): no_helmet += 1
            if vt in ("no_vest",   "both_missing"): no_vest   += 1

    if total_persons == 0:
        return {
            "helmet": 100, "vest": 100, "total": 0,
            "wearing_helmet": 0, "wearing_vest": 0,
            "not_wearing_helmet": 0, "not_wearing_vest": 0,
            "total_persons": 0,
        }

    helmet_compliance = round((total_persons - no_helmet) / total_persons * 100, 1)
    vest_compliance   = round((total_persons - no_vest)   / total_persons * 100, 1)

    return {
        "helmet":             helmet_compliance,
        "vest":               vest_compliance,
        "total":              total_persons,
        "total_persons":      total_persons,
        "wearing_helmet":     total_persons - no_helmet,
        "not_wearing_helmet": no_helmet,
        "wearing_vest":       total_persons - no_vest,
        "not_wearing_vest":   no_vest,
    }


@app.get("/api/ppe-compliance-by-zone")
def get_ppe_compliance_by_zone(date: str = None):
    from collections import defaultdict
    query   = date_match(date) if date else {}
    results = list(ppe_results_col.find(query))

    cam_peak = defaultdict(lambda: {"max_workers": 0, "max_helmet_v": 0, "max_vest_v": 0})

    for doc in results:
        cam     = doc.get("camera", "Unknown")
        persons = _persons_count(doc)
        helmet_v = sum(1 for p in doc.get("ppe", [])
            if str(p.get("violation_type") or "").strip() in ("no_helmet", "both_missing"))
        vest_v   = sum(1 for p in doc.get("ppe", [])
            if str(p.get("violation_type") or "").strip() in ("no_vest", "both_missing"))
        slot = cam_peak[cam]
        if persons  > slot["max_workers"]:  slot["max_workers"]  = persons
        if helmet_v > slot["max_helmet_v"]: slot["max_helmet_v"] = helmet_v
        if vest_v   > slot["max_vest_v"]:   slot["max_vest_v"]   = vest_v

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
    query    = date_match(date)
    pipeline = [
        {"$match": query},
        {"$sort": {"total_persons_count": -1}},
        {"$limit": 1},
    ]
    results = list(ppe_results_col.aggregate(pipeline))
    if not results:
        return {"date": date, "max_persons": 0, "message": "No documents found"}
    doc         = results[0]
    max_persons = doc.get("total_persons_count") or len(doc.get("ppe", []))
    no_helmet   = 0
    no_vest     = 0
    for p in doc.get("ppe", []):
        vt = p.get("violation_type", "")
        if vt in ("no_helmet", "both_missing"): no_helmet += 1
        if vt in ("no_vest",   "both_missing"): no_vest   += 1
    return {
        "date":                         date,
        "max_persons":                  int(max_persons),
        "not_wearing_helmet":           no_helmet,
        "not_wearing_vest":             no_vest,
        "helmet_compliance_at_peak":    round((max_persons - no_helmet) / max_persons * 100, 1) if max_persons > 0 else 0,
        "vest_compliance_at_peak":      round((max_persons - no_vest)   / max_persons * 100, 1) if max_persons > 0 else 0,
        "peak_timestamp":               doc.get("camera_ts_ist") or doc.get("camera_ts") or doc.get("analyzed_at_ist"),
        "camera":                       doc.get("camera", "Unknown"),
        "total_persons_count":          doc.get("total_persons_count"),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SAFE WORKERS
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/safe-workers-7day")
def get_safe_workers_7day(date: str = None):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    try:
        end_dt = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return []
    result = []
    for i in range(6, -1, -1):
        day_dt  = end_dt - timedelta(days=i)
        day_str = day_dt.strftime("%Y-%m-%d")
        docs    = list(ppe_results_col.find(date_match(day_str)))
        cam_best      = _calc_max_safe_from_docs(docs)
        total_safe    = sum(c["max_safe"]   for c in cam_best.values())
        total_persons = sum(c["persons"]    for c in cam_best.values())
        total_viols   = sum(c["violations"] for c in cam_best.values())
        result.append({
            "date":       day_str,
            "safe_count": total_safe,
            "total":      total_persons,
            "violations": total_viols,
        })
    return result


@app.get("/api/shift-safe-summary")
def get_shift_safe_summary(date: str = None):
    import re
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    docs   = list(ppe_results_col.find(date_match(date)))
    SHIFTS = {
        "morning":   list(range(6,  14)),
        "afternoon": list(range(14, 22)),
        "night":     list(range(22, 24)) + list(range(0, 6)),
    }
    shift_docs = {"morning": [], "afternoon": [], "night": []}
    for doc in docs:
        ts     = (doc.get("camera_ts_ist") or doc.get("camera_ts") or
                  doc.get("analyzed_at_ist") or "")
        ts_str = str(ts).replace(" IST", "").strip()
        try:
            match = re.search(r'(\d{2}):', ts_str)
            hour  = int(match.group(1)) if match else None
        except Exception:
            continue
        if hour is None:
            continue
        for shift, hours in SHIFTS.items():
            if hour in hours:
                shift_docs[shift].append(doc)
                break
    output = {}
    for shift, sdocs in shift_docs.items():
        cam_best      = _calc_max_safe_from_docs(sdocs)
        output[shift] = sum(c["max_safe"] for c in cam_best.values())
    return {
        "morning":   output.get("morning",   0),
        "afternoon": output.get("afternoon", 0),
        "night":     output.get("night",     0),
    }


@app.get("/api/camera-safe-summary")
def get_camera_safe_summary(date: str = None):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    docs     = list(ppe_results_col.find(date_match(date)))
    cam_best = _calc_max_safe_from_docs(docs)
    result   = []
    for cam, s in sorted(cam_best.items()):
        if cam == "unknown" and s["max_safe"] == 0:
            continue
        result.append({
            "camera_id":  cam,
            "safe_count": s["max_safe"],
            "total":      s["persons"],
            "violations": s["violations"],
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# REPORTS
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# HOURLY TREND
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/hourly-trend")
def get_hourly_trend(date: str = None, shift: str = "day", camera: str = None):
    import re
    from collections import defaultdict

    query = date_match(date) if date else {}
    if camera:
        cam_list = [c.strip() for c in camera.split(',')]
        if len(cam_list) == 1:
            query = date_and(query, {"camera": cam_list[0]})
        else:
            query = date_and(query, {"camera": {"$in": cam_list}})

    results      = list(ppe_results_col.find(query))
    hour_camera  = defaultdict(lambda: defaultdict(lambda: {"max_workers": 0, "max_violations": 0}))

    for doc in results:
        ts     = (doc.get("camera_ts_ist") or doc.get("camera_ts") or
                  doc.get("analyzed_at_ist") or doc.get("created_at_ist") or "")
        ts_str = str(ts).replace(" IST", "").strip()
        try:
            match = re.search(r'(\d{2}):', ts_str)
            hour  = int(match.group(1)) if match else None
        except:
            continue
        if hour is None or not (0 <= hour <= 23):
            continue
        if shift == "day"   and not (6 <= hour < 18):        continue
        if shift == "night" and not (hour < 6 or hour >= 18): continue

        hour_key  = f"{hour:02d}:00"
        cam       = doc.get("camera", "unknown")
        persons   = _persons_count(doc)
        viols     = _violations_count(doc)

        if persons > hour_camera[hour_key][cam]["max_workers"]:
            hour_camera[hour_key][cam]["max_workers"] = persons
        if viols > hour_camera[hour_key][cam]["max_violations"]:
            hour_camera[hour_key][cam]["max_violations"] = viols

    result = []
    for hour_key in sorted(hour_camera.keys()):
        data         = hour_camera[hour_key]
        peak_workers = sum(c["max_workers"]    for c in data.values())
        total_viol   = sum(c["max_violations"] for c in data.values())
        result.append({
            "hour":           hour_key,
            "workers_active": peak_workers,
            "workers_safe":   max(0, peak_workers - total_viol),
            "violations":     total_viol,
        })

    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str
    if use_date == today_str:
        now_hour = datetime.now().hour
        result   = [r for r in result if int(r["hour"].split(":")[0]) < now_hour]

    return result


# ─────────────────────────────────────────────────────────────────────────────
# MINUTE TREND
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/minute-trend")
def get_minute_trend(date: str = None, shift: str = "day"):
    import re
    from collections import defaultdict

    query         = date_match(date) if date else {}
    results       = list(ppe_results_col.find(query))
    minute_camera = defaultdict(lambda: defaultdict(lambda: {"max_workers": 0, "max_violations": 0}))

    for doc in results:
        ts     = (doc.get("camera_ts") or doc.get("camera_ts_ist") or
                  doc.get("analyzed_at_ist") or "")
        ts_str = str(ts).replace(" IST", "").strip()
        try:
            match = re.search(r'(\d{2}):(\d{2})', ts_str)
            if not match:
                continue
            hour   = int(match.group(1))
            minute = int(match.group(2))
        except:
            continue
        if shift == "day"   and not (6 <= hour < 18):        continue
        if shift == "night" and not (hour < 6 or hour >= 18): continue

        minute_key = f"{hour:02d}:{minute:02d}"
        cam        = doc.get("camera", "unknown")
        persons    = _persons_count(doc)
        viols      = _violations_count(doc)

        if persons > minute_camera[minute_key][cam]["max_workers"]:
            minute_camera[minute_key][cam]["max_workers"] = persons
        if viols > minute_camera[minute_key][cam]["max_violations"]:
            minute_camera[minute_key][cam]["max_violations"] = viols

    result = []
    for minute_key in sorted(minute_camera.keys()):
        data         = minute_camera[minute_key]
        peak_workers = sum(c["max_workers"]    for c in data.values())
        total_viol   = sum(c["max_violations"] for c in data.values())
        result.append({
            "minute":         minute_key,
            "workers_active": peak_workers,
            "workers_safe":   max(0, peak_workers - total_viol),
            "violations":     total_viol,
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# VIOLATIONS TREND — month / year view
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/violations-trend")
def get_violations_trend(mode: str = "month", shift: str = "day", date: str = None):
    import re
    from collections import defaultdict

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    if mode == "month":
        year_month = date[:7]
        query = {"$or": [
            {"camera_ts_ist": {"$regex": f"^{year_month}"}},
            {"camera_ts":     {"$regex": f"^{year_month}"}},
        ]}
    else:
        year  = date[:4]
        query = {"$or": [
            {"camera_ts_ist": {"$regex": f"^{year}"}},
            {"camera_ts":     {"$regex": f"^{year}"}},
        ]}

    results     = list(ppe_results_col.find(query))
    if not results:
        return {"labels": [], "critical": [], "warning": [], "workers": []}

    bucket_data = defaultdict(lambda: {"max_workers": 0, "critical": 0, "warning": 0})

    for doc in results:
        ts     = (doc.get("camera_ts_ist") or doc.get("camera_ts") or
                  doc.get("analyzed_at_ist") or "")
        ts_str = str(ts).replace(" IST", "").strip()
        try:
            hour_match = re.search(r'(\d{2}):', ts_str)
            hour       = int(hour_match.group(1)) if hour_match else None
        except:
            hour = None
        if hour is not None:
            if shift == "day"   and not (6 <= hour < 18):        continue
            if shift == "night" and not (hour < 6 or hour >= 18): continue

        date_part = ts_str[:10]
        if len(date_part) < 10:
            continue
        bucket_key = date_part if mode == "month" else date_part[:7]

        persons = _persons_count(doc)
        if persons > bucket_data[bucket_key]["max_workers"]:
            bucket_data[bucket_key]["max_workers"] = persons

        for p in doc.get("ppe", []):
            vt = str(p.get("violation_type") or "").strip()
            if vt == "both_missing":             bucket_data[bucket_key]["critical"] += 1
            elif vt in ("no_helmet", "no_vest"): bucket_data[bucket_key]["warning"]  += 1

    if not bucket_data:
        return {"labels": [], "critical": [], "warning": [], "workers": []}

    sorted_keys = sorted(bucket_data.keys())
    return {
        "labels":   sorted_keys,
        "critical": [bucket_data[k]["critical"]    for k in sorted_keys],
        "warning":  [bucket_data[k]["warning"]     for k in sorted_keys],
        "workers":  [bucket_data[k]["max_workers"] for k in sorted_keys],
    }


# ─────────────────────────────────────────────────────────────────────────────
# SNAPSHOTS
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# BATCH IMAGES
# ─────────────────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# CHATBOT
# ─────────────────────────────────────────────────────────────────────────────
import re as _re
import hashlib as _hashlib
from openai import OpenAI as _OpenAI

_QUERY_CACHE: dict = {}
_QUERY_CACHE_TTL   = 300


def _cache_key(query_plan: dict) -> str:
    return _hashlib.md5(json.dumps(query_plan, sort_keys=True, default=str).encode()).hexdigest()

def _cache_get(key: str):
    entry = _QUERY_CACHE.get(key)
    if entry and (time.time() - entry["ts"]) < _QUERY_CACHE_TTL:
        return entry["value"]
    return None

def _cache_set(key: str, value: str):
    _QUERY_CACHE[key] = {"value": value, "ts": time.time()}


def resolve_date_range(message: str):
    now       = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    message   = message.replace("%2F", "/").replace("%2f", "/")

    print(f"  [DATE DEBUG] raw message: '{message}'")
    iso = _re.search(r'\b(\d{4}-\d{2}-\d{2})\b', message)
    print(f"  [DATE DEBUG] iso match: {iso}")
    dmy_test = _re.search(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b', message)
    print(f"  [DATE DEBUG] dmy match: {dmy_test}")
    nat1_test = _re.search(r'\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})?\b', message, _re.IGNORECASE)
    print(f"  [DATE DEBUG] nat1 match: {nat1_test}")
    if iso:
        d = iso.group(1)
        return d, d, f"on {d}", False

    dmy = _re.search(r'\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b', message)
    print(f"  [DATE DEBUG] dmy match: {dmy}")
    if dmy:
        day, month, year = dmy.group(1), dmy.group(2), dmy.group(3)
        try:
            dt = datetime.strptime(f"{day}-{month}-{year}", "%d-%m-%Y")
            d  = dt.strftime("%Y-%m-%d")
            return d, d, f"on {d}", False
        except ValueError:
            pass

    # ADD THIS BLOCK — handles "20th may", "may 20", "20 may", "20th may 2026"
    MONTHS = {
        "january":"01","february":"02","march":"03","april":"04",
        "may":"05","june":"06","july":"07","august":"08",
        "september":"09","october":"10","november":"11","december":"12",
        "jan":"01","feb":"02","mar":"03","apr":"04","jun":"06",
        "jul":"07","aug":"08","sep":"09","oct":"10","nov":"11","dec":"12"
    }

    print(f"  [DATE DEBUG] nat1 match: {nat1}")
    # pattern: "20th may 2026" or "20 may 2026" or "may 20 2026"
    nat1 = _re.search(
        r'\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{4})?\b',
        message, _re.IGNORECASE
    )
    if nat1:
        day   = nat1.group(1).zfill(2)
        mon   = MONTHS[nat1.group(2).lower()[:3]]
        year  = nat1.group(3) if nat1.group(3) else str(now.year)
        try:
            d = datetime.strptime(f"{day}-{mon}-{year}", "%d-%m-%Y").strftime("%Y-%m-%d")
            return d, d, f"on {d}", False
        except ValueError:
            pass

    # pattern: "may 20th" or "may 20"
    nat2 = _re.search(
        r'\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(\d{4})?\b',
        message, _re.IGNORECASE
    )
    if nat2:
        mon   = MONTHS[nat2.group(1).lower()[:3]]
        day   = nat2.group(2).zfill(2)
        year  = nat2.group(3) if nat2.group(3) else str(now.year)
        try:
            d = datetime.strptime(f"{day}-{mon}-{year}", "%d-%m-%Y").strftime("%Y-%m-%d")
            return d, d, f"on {d}", False
        except ValueError:
            pass

    # ADD THIS — handles "last one week", "past one week", "last week"
    if _re.search(r'\b(last|past|previous)\s+(one\s+)?week\b', message, _re.IGNORECASE):
        start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        return start, today_str, "last 7 days", True

    if _re.search(r'\bthis\s+week\b', message, _re.IGNORECASE):
        monday = now - timedelta(days=now.weekday())
        return monday.strftime("%Y-%m-%d"), today_str, "this week", True

    m = _re.search(r'\blast\s+(\d+)\s+days?\b', message, _re.IGNORECASE)
    if m:
        n = int(m.group(1))
        return (now - timedelta(days=n)).strftime("%Y-%m-%d"), today_str, f"last {n} days", True

    if _re.search(r'\byesterday\b', message, _re.IGNORECASE):
        yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        return yesterday, yesterday, "yesterday", False

    return today_str, today_str, "today", False


def _log_banner(title: str):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")

def _log_section(title: str, content: str = ""):
    print(f"\n{'─'*60}\n  {title}\n{'─'*60}")
    if content: print(content)


def run_mongo_query(query_plan: dict, label: str = "GPT-generated") -> tuple:
    ck     = _cache_key(query_plan)
    cached = _cache_get(ck)
    if cached:
        _log_section(f"MONGODB RESULT  [{label}]  [FROM CACHE]")
        print(cached)
        return cached, True
    try:
        collection_name = query_plan.get("collection", "ppe_results")
        operation       = query_plan.get("operation", "find")
        query_filter    = query_plan.get("filter", {})
        projection      = query_plan.get("projection", None)
        sort_field      = query_plan.get("sort", None)
        limit           = int(query_plan.get("limit", 500))
        pipeline        = query_plan.get("pipeline", None)
        col_map = {
            "ppe_results": ppe_results_col,
            "snapshots":   snapshots_col,
            "alerts":      alerts_col,
            "violations":  violations_col,
            "collages":    db["collages"],
        }
        col = col_map.get(collection_name, ppe_results_col)
        if operation == "aggregate" and pipeline:
            results = list(col.aggregate(pipeline))
        elif operation == "count":
            count       = col.count_documents(query_filter)
            result_text = f"Count result: {count}"
            _log_section(f"MONGODB RESULT  [{label}]")
            print(f"  {result_text}")
            _cache_set(ck, result_text)
            return result_text, False
        elif operation == "distinct":
            field   = query_plan.get("field", "camera")
            res_raw = col.distinct(field, query_filter)
            result_text = (
                f"No distinct values for '{field}'."
                if not res_raw
                else f"Distinct '{field}' ({len(res_raw)} values): {res_raw}"
            )
            _log_section(f"MONGODB RESULT  [{label}]")
            print(f"  {result_text}")
            _cache_set(ck, result_text)
            return result_text, False
        else:
            cursor = col.find(query_filter, projection)
            if sort_field:
                cursor = cursor.sort(sort_field[0], sort_field[1])
            results = list(cursor.limit(limit))
        if not results:
            result_text = "No documents found matching the query."
            _log_section(f"MONGODB RESULT  [{label}]")
            print(f"  {result_text}")
            _cache_set(ck, result_text)
            return result_text, False
        _log_section(f"MONGODB RESULT  [{label}]  —  {len(results)} document(s)")
        lines = []
        for i, doc in enumerate(results):
            doc["_id"] = str(doc.get("_id", ""))
            for big_field in ("all_persons", "collage_id", "image", "crop_b64"):
                doc.pop(big_field, None)
            if "ppe" in doc and isinstance(doc["ppe"], list):
                doc["ppe"] = [
                    {"label": p.get("label", "?"), "violation_type": p.get("violation_type", "none")}
                    for p in doc["ppe"]
                ]
            line = f"  [{i+1:>3}] {json.dumps(doc, default=str)}"
            lines.append(line)
            print(line)
        result_text = f"Query returned {len(results)} document(s):\n" + "\n".join(lines)
        _cache_set(ck, result_text)
        return result_text, False
    except Exception as e:
        err = f"Query execution error: {e}"
        _log_section(f"MONGODB ERROR  [{label}]")
        print(f"  {err}")
        return err, False


def _try_fast_path(message: str, date_from: str, date_to: str, is_range: bool):
    msg         = message.lower()
    pipeline    = None
    result_text = None

    if _re.search(r'\bactive\b.*\bviolation|violation.*\bactive\b|open\s+violation', msg):
        pipeline = [
            {"$match": {"camera_ts": {"$regex": f"^{date_from}"}}},
            {"$unwind": "$ppe"},
            {"$match": {"ppe.violation_type": {"$in": ["no_helmet", "no_vest", "both_missing"]}}},
            {"$group": {
                "_id":            "$ppe.label",
                "camera":         {"$last": "$camera"},
                "violation_type": {"$last": "$ppe.violation_type"},
                "last_seen":      {"$last": "$camera_ts"},
            }},
            {"$sort": {"last_seen": -1}},
        ]
        results = list(ppe_results_col.aggregate(pipeline))
        if not results:
            result_text = f"No active violations found on {date_from}."
        else:
            lines = [f"Active violations on {date_from} — {len(results)} unique worker(s):"]
            for r in results:
                lines.append(
                    f"  Worker {r['_id']} | {r['violation_type']} "
                    f"| Camera {r['camera']} | Last seen {r['last_seen']}"
                )
            result_text = "\n".join(lines)
    else:
        range_m = _re.search(
            r'\b(\d{1,2})(am|pm)\s*(?:to|-)\s*(\d{1,2})(am|pm)\b', msg
        )
        per_cam = _re.search(
            r'\beach\s+(camera|cam)\b.*\bpeak\b|\bpeak\b.*\beach\s+(camera|cam)\b'
            r'|\bper.camera\b|\bby.camera\b', msg
        )
        if range_m or per_cam:
            if range_m:
                h_start = int(range_m.group(1))
                s1      = range_m.group(2).lower()
                h_end   = int(range_m.group(3))
                s2      = range_m.group(4).lower()
                if s1 == "pm" and h_start != 12: h_start += 12
                if s1 == "am" and h_start == 12: h_start = 0
                if s2 == "pm" and h_end   != 12: h_end   += 12
                if s2 == "am" and h_end   == 12: h_end   = 0
                hour_patterns = [f"{h:02d}:" for h in range(h_start, h_end)]
                hour_regex    = "|".join(hour_patterns)
                time_label    = f"{h_start:02d}:00 to {h_end:02d}:00"
            else:
                hour_regex = "1[01]:"
                time_label = "that hour"

            pipeline = [
                {"$match": {"camera_ts": {"$regex": f"^{date_from}"}}},
                {"$match": {"camera_ts": {"$regex": hour_regex}}},
                {"$unwind": "$ppe"},
                {"$match": {"ppe.violation_type": {"$in": ["no_helmet", "no_vest", "both_missing"]}}},
                {"$group": {
                    "_id":        {"camera": "$camera", "ts": "$camera_ts"},
                    "violations": {"$sum": 1},
                }},
                {"$group": {
                    "_id":             "$_id.camera",
                    "peak_violations": {"$max": "$violations"},
                    "peak_at":         {"$last": "$_id.ts"},
                }},
                {"$sort": {"_id": 1}},
            ]
            results = list(ppe_results_col.aggregate(pipeline))
            if not results:
                result_text = f"No violations found between {time_label} on {date_from}."
            else:
                lines       = [f"Peak violations per camera ({time_label}) on {date_from}:\n"]
                grand_total = 0
                for r in results:
                    cam  = r["_id"] or "Unknown"
                    peak = r["peak_violations"]
                    at   = r.get("peak_at", "")
                    grand_total += peak
                    lines.append(f"  {cam}: peak = {peak} violation(s)  [worst frame: {at}]")
                lines.append(f"\n  ─────────────────────────────────")
                lines.append(f"  SUM of all camera peaks: {grand_total} violations")
                result_text = "\n".join(lines)

    if result_text is None:
        return None, None
    return result_text, pipeline


def get_openai_client():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set in .env")
    return _OpenAI(api_key=api_key)


def _gpt_explain(openai_client, user_message: str, db_result_text: str,
                 date_label: str, history: list) -> tuple:
    context_for_gpt = db_result_text
    try:
        parsed = json.loads(db_result_text) if isinstance(db_result_text, str) else db_result_text
        if isinstance(parsed, list) and len(parsed) > 5:
            total         = len(parsed)
            type_counts   = {}
            camera_counts = {}
            for item in parsed:
                vtype = item.get("type") or item.get("violation_type") or "unknown"
                type_counts[vtype]   = type_counts.get(vtype, 0) + 1
                cam = item.get("camera", "unknown")
                camera_counts[cam]   = camera_counts.get(cam, 0) + 1
            summary_lines = [f"Total violations: {total}", "By type:"]
            for k, v in sorted(type_counts.items(), key=lambda x: -x[1]):
                summary_lines.append(f"  - {k}: {v}")
            summary_lines.append("By camera:")
            for k, v in sorted(camera_counts.items(), key=lambda x: -x[1]):
                summary_lines.append(f"  - {k}: {v}")
            context_for_gpt = "\n".join(summary_lines)
    except Exception:
        context_for_gpt = db_result_text

    messages = [
        {
            "role": "system",
            "content": (
                f"You are a construction site safety AI assistant. "
                f"Answer the user's question clearly using ONLY the numbers/data from the DB result. "
                f"Time reference: '{date_label}'. "
                f"Translate: no_helmet=no helmet worn, no_vest=no vest worn, both_missing=missing both. "
                f"If the result has multiple rows (trend / breakdown), list ALL of them. "
                f"Do NOT invent numbers. Be direct and factual."
            )
        }
    ]
    for h in history[-6:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({
        "role": "user",
        "content": (
            f"Question: {user_message}\n\n"
            f"DB result:\n{context_for_gpt}\n\n"
            f"Give a clear, complete answer using the data above."
        )
    })
    response = openai_client.chat.completions.create(
        model="gpt-4o", messages=messages, max_tokens=500, temperature=0.1,
    )
    return response.choices[0].message.content.strip(), response.usage.total_tokens


@app.post("/api/chat")
async def chat_endpoint(request: Request):
    from fastapi import HTTPException
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    raw_message  = body.get("message", "").strip()
    history      = body.get("history", [])
    if not raw_message:
        raise HTTPException(status_code=400, detail="Message is empty")

    user_message = raw_message
    _log_banner("NEW CHAT REQUEST")
    print(f"  USER    : {raw_message}")

    GREETINGS = {
        "hi","hello","hey","good morning","good afternoon","good evening",
        "howdy","sup","greetings","hii","hiii","helo","hi there",
    }
    if user_message.lower().strip("!.,? ") in GREETINGS:
        return {
            "reply": (
                "👷 Hello! I'm YOLOIntel Safety Assistant.\n\n"
                "Ask me anything about site safety:\n"
                "• How many violations today?\n"
                "• Which workers are missing helmets?\n"
                "• Which camera has the most violations?\n"
                "• Show compliance summary\n"
                "• Violation trend last week\n"
                "• Max violations at 11am today\n"
                "• Active violations right now"
            ),
            "tokens_used": 0,
            "query_used":  None,
            "date":        datetime.now().strftime("%Y-%m-%d"),
        }

    date_from, date_to, date_label, is_range = resolve_date_range(user_message)
    _log_section("DATE RESOLUTION")
    print(f"  date_from : {date_from}\n  date_to   : {date_to}\n  label     : {date_label}")

    try:
        openai_client = get_openai_client()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    fast_result, fast_pipeline = _try_fast_path(user_message, date_from, date_to, is_range, date_label)

    if fast_result is not None:
        _log_section("PATH", "FAST-PATH")
        try:
            reply, explain_tokens = _gpt_explain(
                openai_client, user_message, fast_result, date_label, history
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenAI error: {e}")
        return {
            "reply":       reply,
            "tokens_used": explain_tokens,
            "query_used":  {"fast_path": True, "pipeline": fast_pipeline},
            "date":        date_from,
        }

    _log_section("PATH", "GPT-PATH")
    sanitized_message = user_message
    sanitized_message = _re.sub(r'\btoday\b',       f'on {date_from}', sanitized_message, flags=_re.IGNORECASE)
    sanitized_message = _re.sub(r'\byesterday\b',   f'on {date_from}', sanitized_message, flags=_re.IGNORECASE)
    sanitized_message = _re.sub(r'\blast\s+week\b', f'from {date_from} to {date_to}', sanitized_message, flags=_re.IGNORECASE)
    sanitized_message = _re.sub(r'\bthis\s+week\b', f'from {date_from} to {date_to}', sanitized_message, flags=_re.IGNORECASE)

    query_prompt = f"""You are a MongoDB expert for a construction PPE monitoring system.

COLLECTION: ppe_results
SCHEMA:
  camera_ts             : string  "2026-04-17 11:23:45 IST"
  camera                : string  "CAM-A01"
  persons_count         : int
  ppe[]                 : array
    label               : string  "W-3"
    violation_type      : string  "no_helmet" | "no_vest" | "both_missing" | ""

DATE: {date_from}  to  {date_to}
QUESTION: "{sanitized_message}"

RULES:
1. Single day  → {{"camera_ts": {{"$regex": "^{date_from}"}}}}
2. Range       → {{"camera_ts": {{"$gte": "{date_from}", "$lt": "{date_to}T99"}}}}
3. ALWAYS $unwind "$ppe" BEFORE any $match on ppe.* fields
4. Violation types → ["no_helmet", "no_vest", "both_missing"]
5. Filter out null/empty violation_type before counting
6. Peak per camera = group by (camera+ts) → count → group by camera → $max

OUTPUT: Return ONLY raw JSON. No markdown, no backticks.
Format: {{"collection":"ppe_results","operation":"aggregate","pipeline":[...]}}
"""

    query_plan        = None
    query_result_text = ""
    query_tokens      = 0

    try:
        q_response  = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": query_prompt}],
            max_tokens=600, temperature=0,
        )
        raw          = q_response.choices[0].message.content.strip()
        query_tokens = q_response.usage.total_tokens
        raw          = raw.replace("```json", "").replace("```", "").strip()
        query_plan   = json.loads(raw)
    except Exception as e:
        query_result_text = f"Query generation error: {e}"
        query_plan        = None

    if query_plan:
        query_result_text, _ = run_mongo_query(query_plan, label="GPT-generated")

    try:
        reply, explain_tokens = _gpt_explain(
            openai_client, user_message, query_result_text, date_label, history
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {e}")

    return {
        "reply":       reply,
        "tokens_used": query_tokens + explain_tokens,
        "query_used":  query_plan,
        "date":        date_from,
    }


# ─────────────────────────────────────────────────────────────────────────────
# REPORTS (PDF)
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/reports/daily-safety")
def report_daily_safety(date: str = None):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rl_canvas
    except ImportError:
        return Response(content="reportlab not installed. Run: pip install reportlab", status_code=500)

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    kpi     = get_kpi(date)
    results = list(ppe_results_col.find(date_match(date)))
    buf     = io.BytesIO()
    c       = rl_canvas.Canvas(buf, pagesize=A4)
    w, h    = A4

    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, h - 60, "Daily Safety Report")
    c.setFont("Helvetica", 12)
    c.drawString(50, h - 85,  f"Date: {date}")
    c.drawString(50, h - 105, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    c.setFont("Helvetica-Bold", 13)
    c.drawString(50, h - 140, "KPI Summary")
    c.setFont("Helvetica", 11)
    y = h - 160
    for label, val in [
        ("Total Persons",     kpi["total_persons"]),
        ("Safe Workers",      kpi["total_safe"]),
        ("Active Violations", kpi["total_violations"]),
        ("PPE Compliance",    f"{kpi['compliance_pct']}%"),
        ("Active Cameras",    kpi["active_cameras"]),
        ("Critical Alerts",   kpi["critical_alerts"]),
        ("Warning Alerts",    kpi["warning_alerts"]),
    ]:
        c.drawString(60, y, f"{label}: {val}")
        y -= 18

    c.setFont("Helvetica-Bold", 13)
    y -= 10
    c.drawString(50, y, "Violation Details")
    c.setFont("Helvetica", 10)
    y -= 20
    count = 0
    for doc in results:
        for p in doc.get("ppe", []):
            vt = str(p.get("violation_type") or "").strip()
            if vt not in ("no_helmet", "no_vest", "both_missing"):
                continue
            ts  = doc.get("camera_ts_ist") or doc.get("camera_ts") or ""
            cam = doc.get("camera", "")
            lbl = p.get("label", "?")
            c.drawString(60, y, f"{ts}  |  {cam}  |  Worker {lbl}  |  {vt}")
            y -= 15
            count += 1
            if y < 60:
                c.showPage()
                y = h - 60
                c.setFont("Helvetica", 10)
    if count == 0:
        c.drawString(60, y, "No violations found for this date.")
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=daily_safety_{date}.pdf"})


@app.get("/api/reports/ppe-summary")
def report_ppe_summary(date: str = None):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rl_canvas
    except ImportError:
        return Response(content="reportlab not installed.", status_code=500)

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    compliance = get_ppe_compliance(date)
    zones      = get_ppe_compliance_by_zone(date)
    buf        = io.BytesIO()
    c          = rl_canvas.Canvas(buf, pagesize=A4)
    w, h       = A4

    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, h - 60, "Weekly PPE Summary")
    c.setFont("Helvetica", 12)
    c.drawString(50, h - 85, f"Date: {date}")
    c.setFont("Helvetica-Bold", 13)
    c.drawString(50, h - 120, "Overall Compliance")
    c.setFont("Helvetica", 11)
    y = h - 140
    for label, val in [
        ("Helmet Compliance",  f"{compliance['helmet']}%"),
        ("Vest Compliance",    f"{compliance['vest']}%"),
        ("Total Persons",      compliance["total_persons"]),
        ("Wearing Helmet",     compliance["wearing_helmet"]),
        ("Not Wearing Helmet", compliance["not_wearing_helmet"]),
        ("Wearing Vest",       compliance["wearing_vest"]),
        ("Not Wearing Vest",   compliance["not_wearing_vest"]),
    ]:
        c.drawString(60, y, f"{label}: {val}")
        y -= 18

    c.setFont("Helvetica-Bold", 13)
    y -= 10
    c.drawString(50, y, "Per Camera Breakdown")
    c.setFont("Helvetica", 10)
    y -= 20
    for z in zones:
        c.drawString(60, y,
            f"{z['camera']}  |  Total: {z['total']}  |  "
            f"No Helmet: {z['not_wearing_helmet']}  |  No Vest: {z['not_wearing_vest']}")
        y -= 15
        if y < 60:
            c.showPage()
            y = h - 60
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ppe_summary_{date}.pdf"})


@app.get("/api/reports/alerts")
def report_alerts(date: str = None):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rl_canvas
    except ImportError:
        return Response(content="reportlab not installed.", status_code=500)

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    results    = list(ppe_results_col.find(date_match(date)).sort("analyzed_at_ist", DESCENDING))
    alert_list = build_alert_list(results)
    buf        = io.BytesIO()
    c          = rl_canvas.Canvas(buf, pagesize=A4)
    w, h       = A4

    c.setFont("Helvetica-Bold", 18)
    c.drawString(50, h - 60, "Incident / Alert Report")
    c.setFont("Helvetica", 12)
    c.drawString(50, h - 85,  f"Date: {date}")
    c.drawString(50, h - 105, f"Total Alerts: {len(alert_list)}")
    c.setFont("Helvetica-Bold", 11)
    y = h - 135
    c.drawString(50,  y, "Time");  c.drawString(160, y, "Camera")
    c.drawString(270, y, "Worker"); c.drawString(350, y, "Type"); c.drawString(470, y, "ACK")
    y -= 5
    c.line(50, y, w - 50, y)
    y -= 15
    c.setFont("Helvetica", 9)
    for a in alert_list:
        ts  = str(a.get("timestamp", ""))[:19]
        cam = a.get("camera", "")[-10:]
        wid = a.get("worker_id", "")
        vt  = a.get("violation_type", "")
        ack = "Yes" if a.get("acknowledged") else "No"
        c.drawString(50, y, ts);  c.drawString(160, y, cam)
        c.drawString(270, y, wid); c.drawString(350, y, vt); c.drawString(470, y, ack)
        y -= 14
        if y < 60:
            c.showPage(); y = h - 60; c.setFont("Helvetica", 9)
    if not alert_list:
        c.drawString(50, y, "No alerts found for this date.")
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=alerts_{date}.pdf"})


@app.get("/api/reports/weekly-safety")
def report_weekly_safety(date: str = None):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rl_canvas
    except ImportError:
        return Response(content="reportlab not installed.", status_code=500)

    if not date:
        date = datetime.now().strftime("%Y-%m-%d")
    try:
        end_dt = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        return Response(content="Invalid date format. Use YYYY-MM-DD", status_code=400)

    start_dt  = end_dt - timedelta(days=6)
    start_str = start_dt.strftime("%Y-%m-%d")
    end_str   = end_dt.strftime("%Y-%m-%d")

    query = {"$or": [
        {"camera_ts_ist": {"$gte": start_str, "$lte": end_str + " 99"}},
        {"camera_ts":     {"$gte": start_str, "$lte": end_str + " 99"}},
    ]}
    results = list(ppe_results_col.find(query))

    from collections import defaultdict
    day_stats = defaultdict(lambda: {
        "persons": 0, "violations": 0,
        "no_helmet": 0, "no_vest": 0, "both_missing": 0, "frames": 0,
    })

    for doc in results:
        ts  = str(doc.get("camera_ts_ist") or doc.get("camera_ts") or "")[:10]
        if not ts or ts < start_str or ts > end_str:
            continue
        persons = _persons_count(doc)
        day_stats[ts]["persons"] += persons
        day_stats[ts]["frames"]  += 1
        for p in doc.get("ppe", []):
            vt = str(p.get("violation_type") or "").strip()
            if vt in ("no_helmet", "no_vest", "both_missing"):
                day_stats[ts]["violations"] += 1
            if vt in ("no_helmet", "both_missing"): day_stats[ts]["no_helmet"]    += 1
            if vt in ("no_vest",   "both_missing"): day_stats[ts]["no_vest"]      += 1
            if vt == "both_missing":                day_stats[ts]["both_missing"] += 1

    all_days         = [(start_dt + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    total_persons    = sum(day_stats[d]["persons"]    for d in all_days)
    total_violations = sum(day_stats[d]["violations"] for d in all_days)
    total_safe       = max(0, total_persons - total_violations)
    compliance_pct   = round((total_safe / total_persons * 100), 1) if total_persons else 100.0
    total_no_helmet  = sum(day_stats[d]["no_helmet"] for d in all_days)
    total_no_vest    = sum(day_stats[d]["no_vest"]   for d in all_days)
    worst_day        = max(all_days, key=lambda d: day_stats[d]["violations"]) if results else end_str

    cam_stats = defaultdict(lambda: {"persons": 0, "no_helmet": 0, "no_vest": 0})
    for doc in results:
        ts = str(doc.get("camera_ts_ist") or doc.get("camera_ts") or "")[:10]
        if not ts or ts < start_str or ts > end_str:
            continue
        cam     = doc.get("camera", "Unknown")
        persons = _persons_count(doc)
        cam_stats[cam]["persons"] += persons
        for p in doc.get("ppe", []):
            vt = str(p.get("violation_type") or "").strip()
            if vt in ("no_helmet", "both_missing"): cam_stats[cam]["no_helmet"] += 1
            if vt in ("no_vest",   "both_missing"): cam_stats[cam]["no_vest"]   += 1

    buf  = io.BytesIO()
    c    = rl_canvas.Canvas(buf, pagesize=A4)
    pw, ph = A4

    def section_header(y, text):
        c.setFillColorRGB(0.13, 0.13, 0.2)
        c.rect(40, y - 4, pw - 80, 20, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(48, y + 2, text)
        c.setFillColorRGB(0, 0, 0)
        return y - 28

    c.setFillColorRGB(0.05, 0.27, 0.53)
    c.rect(0, ph - 80, pw, 80, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(48, ph - 42, "Weekly Safety Report")
    c.setFont("Helvetica", 11)
    c.drawString(48, ph - 62, f"Period: {start_str}  →  {end_str}   |   Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    c.setFillColorRGB(0, 0, 0)
    y = ph - 105

    y = section_header(y, "WEEKLY KPI SUMMARY")
    c.setFont("Helvetica", 10)
    for label, val in [
        ("Total Person-Appearances",   total_persons),
        ("Total Safe (no violation)",  total_safe),
        ("Total Violations",           total_violations),
        ("Overall PPE Compliance",     f"{compliance_pct}%"),
        ("No Helmet Violations",       total_no_helmet),
        ("No Vest Violations",         total_no_vest),
        ("Worst Day (most violations)",worst_day),
        ("Total Frames Analyzed",      sum(day_stats[d]["frames"] for d in all_days)),
    ]:
        c.setFont("Helvetica-Bold", 10); c.drawString(55, y, f"{label}:")
        c.setFont("Helvetica",      10); c.drawString(260, y, str(val))
        y -= 16
    y -= 8

    y = section_header(y, "DAY-BY-DAY BREAKDOWN")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColorRGB(0.9, 0.9, 0.9)
    c.rect(40, y - 2, pw - 80, 16, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    cols    = [55, 155, 245, 320, 395, 460]
    headers = ["Date", "Persons", "Violations", "No Helmet", "No Vest", "Compliance%"]
    for col, hdr in zip(cols, headers):
        c.drawString(col, y + 2, hdr)
    y -= 18

    c.setFont("Helvetica", 9)
    for i, day in enumerate(all_days):
        s       = day_stats[day]
        persons = s["persons"]; violations = s["violations"]
        nh      = s["no_helmet"]; nv = s["no_vest"]
        comp    = f"{round((persons - violations) / persons * 100, 1)}%" if persons else "N/A"
        if i % 2 == 0:
            c.setFillColorRGB(0.96, 0.96, 0.98)
            c.rect(40, y - 3, pw - 80, 14, fill=1, stroke=0)
            c.setFillColorRGB(0, 0, 0)
        if day == worst_day and violations > 0:
            c.setFillColorRGB(0.8, 0.1, 0.1)
        for col, val in zip(cols, [day, persons, violations, nh, nv, comp]):
            c.drawString(col, y, str(val))
        c.setFillColorRGB(0, 0, 0)
        y -= 15
        if y < 80:
            c.showPage(); y = ph - 60; c.setFont("Helvetica", 9)
    y -= 10

    if y < 120:
        c.showPage(); y = ph - 60

    y = section_header(y, "PER-CAMERA WEEKLY BREAKDOWN")
    c.setFont("Helvetica-Bold", 9)
    c.setFillColorRGB(0.9, 0.9, 0.9)
    c.rect(40, y - 2, pw - 80, 16, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    cam_cols    = [55, 165, 265, 345, 425]
    cam_headers = ["Camera", "Total Persons", "No Helmet", "No Vest", "Helmet Compliance%"]
    for col, hdr in zip(cam_cols, cam_headers):
        c.drawString(col, y + 2, hdr)
    y -= 18
    c.setFont("Helvetica", 9)
    for i, (cam, s) in enumerate(sorted(cam_stats.items())):
        persons = s["persons"]; nh = s["no_helmet"]; nv = s["no_vest"]
        comp    = f"{round((persons - nh) / persons * 100, 1)}%" if persons else "N/A"
        if i % 2 == 0:
            c.setFillColorRGB(0.96, 0.96, 0.98)
            c.rect(40, y - 3, pw - 80, 14, fill=1, stroke=0)
            c.setFillColorRGB(0, 0, 0)
        for col, val in zip(cam_cols, [cam, persons, nh, nv, comp]):
            c.drawString(col, y, str(val))
        y -= 15
        if y < 80:
            c.showPage(); y = ph - 60; c.setFont("Helvetica", 9)

    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    c.drawString(48, 30, f"YOLOIntel Safety Dashboard  |  {start_str} to {end_str}  |  {len(results)} frames analyzed")
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=weekly_safety_{start_str}_to_{end_str}.pdf"})


@app.get("/api/reports/monthly-handover")
def report_monthly_handover(month: str = None):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as rl_canvas
    except ImportError:
        return Response(content="reportlab not installed.", status_code=500)

    if not month:
        month = datetime.now().strftime("%Y-%m")
    try:
        month_dt = datetime.strptime(month, "%Y-%m")
    except ValueError:
        return Response(content="Invalid month format. Use YYYY-MM", status_code=400)

    start_dt  = month_dt.replace(day=1)
    if month_dt.month == 12:
        end_dt = month_dt.replace(year=month_dt.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        end_dt = month_dt.replace(month=month_dt.month + 1, day=1) - timedelta(days=1)

    start_str   = start_dt.strftime("%Y-%m-%d")
    end_str     = end_dt.strftime("%Y-%m-%d")
    month_label = month_dt.strftime("%B %Y")

    query = {"$or": [
        {"camera_ts_ist": {"$gte": start_str, "$lte": end_str + " 99"}},
        {"camera_ts":     {"$gte": start_str, "$lte": end_str + " 99"}},
        {"analyzed_at":   {"$gte": start_dt,  "$lt":  end_dt + timedelta(days=1)}},
    ]}
    results = list(ppe_results_col.find(query))

    from collections import defaultdict
    day_cam = defaultdict(lambda: defaultdict(lambda: {"max_workers": 0, "max_violations": 0}))
    for doc in results:
        ts = str(doc.get("camera_ts_ist") or doc.get("camera_ts") or "")[:10]
        if not ts or ts < start_str or ts > end_str:
            continue
        cam     = doc.get("camera", "unknown")
        persons = _persons_count(doc)
        viols   = _violations_count(doc)
        slot    = day_cam[ts][cam]
        if persons > slot["max_workers"]:    slot["max_workers"]    = persons
        if viols   > slot["max_violations"]: slot["max_violations"] = viols

    all_days = []
    d = start_dt
    while d <= end_dt:
        all_days.append(d.strftime("%Y-%m-%d"))
        d += timedelta(days=1)

    days_with_data = [day for day in all_days if day in day_cam]

    def day_total_workers(day):
        return sum(c["max_workers"] for c in day_cam[day].values())

    def day_total_violations(day):
        return sum(c["max_violations"] for c in day_cam[day].values())

    total_workers    = sum(day_total_workers(d)    for d in days_with_data)
    total_violations = sum(day_total_violations(d) for d in days_with_data)
    total_safe       = max(0, total_workers - total_violations)
    compliance_pct   = round((total_safe / total_workers * 100), 1) if total_workers else 100.0

    buf    = io.BytesIO()
    c      = rl_canvas.Canvas(buf, pagesize=A4)
    pw, ph = A4

    BG_DARK = (0.07, 0.09, 0.13); BG_CARD = (0.11, 0.14, 0.20)
    GREEN   = (0.18, 0.80, 0.44); RED     = (0.90, 0.25, 0.25)
    YELLOW  = (0.95, 0.75, 0.10); WHITE   = (1.0,  1.0,  1.0)
    GREY    = (0.55, 0.60, 0.68)

    def set_rgb(rgb): c.setFillColorRGB(*rgb)

    set_rgb(BG_DARK); c.rect(0, 0, pw, ph, fill=1, stroke=0)
    c.setFillColorRGB(0.05, 0.12, 0.25); c.rect(0, ph - 75, pw, 75, fill=1, stroke=0)
    set_rgb(WHITE); c.setFont("Helvetica-Bold", 18)
    c.drawString(40, ph - 38, "YOLOINTEL  ·  CONSTRUCTION SITE")
    c.setFont("Helvetica", 11); set_rgb(GREY)
    c.drawString(40, ph - 58, f"SHIFT HANDOVER REPORT  ·  {month_label.upper()}")
    c.setFont("Helvetica", 8)
    c.drawRightString(pw - 40, ph - 38, f"Generated: {datetime.now().strftime('%d %b %Y  %I:%M %p')}")

    y = ph - 75 - 28
    set_rgb(GREY); c.setFont("Helvetica", 9)
    c.drawString(40, y, f"REPORT COVERS:  {month_label.upper()}   ·   DATA DAYS: {len(days_with_data)}")
    y -= 30

    card_w = (pw - 80 - 18) / 4; card_h = 110; gap = 6
    card_x = [40 + i * (card_w + gap) for i in range(4)]
    cards  = [
        {"icon": "✓", "label": "WORKERS SAFE ON-SITE",  "value": str(total_safe),       "sub": f"{total_safe} safe  ·  {total_violations} violated", "val_color": GREEN,  "border": GREEN},
        {"icon": "!", "label": "MAX VIOLATIONS",         "value": str(total_violations), "sub": "Sum of daily peak violations",                         "val_color": RED,    "border": RED},
        {"icon": "%", "label": "PPE COMPLIANCE",         "value": f"{compliance_pct}%",  "sub": "Monthly avg  ·  All cameras",                          "val_color": YELLOW, "border": YELLOW},
        {"icon": "X", "label": "PPE VIOLATIONS",         "value": str(total_violations), "sub": "Workers without full PPE",                             "val_color": RED,    "border": RED},
    ]
    for i, card in enumerate(cards):
        cx = card_x[i]; cy = y - card_h
        set_rgb(BG_CARD); c.roundRect(cx, cy, card_w, card_h, 6, fill=1, stroke=0)
        c.setStrokeColorRGB(*card["border"]); c.setLineWidth(2.5)
        c.line(cx + 6, cy + card_h, cx + card_w - 6, cy + card_h); c.setLineWidth(1)
        set_rgb(card["val_color"]); c.setFont("Helvetica-Bold", 13)
        c.drawString(cx + 10, cy + card_h - 22, card["icon"])
        set_rgb(GREY); c.setFont("Helvetica", 7)
        c.drawString(cx + 10, cy + card_h - 40, card["label"])
        set_rgb(card["val_color"]); c.setFont("Helvetica-Bold", 26)
        c.drawString(cx + 10, cy + card_h - 72, card["value"])
        set_rgb(GREY); c.setFont("Helvetica", 7)
        c.drawString(cx + 10, cy + 10, card["sub"])
    y -= card_h + 28

    set_rgb((0.13, 0.16, 0.24)); c.rect(40, y - 4, pw - 80, 20, fill=1, stroke=0)
    set_rgb(WHITE); c.setFont("Helvetica-Bold", 10)
    c.drawString(48, y + 2, f"DAY-BY-DAY BREAKDOWN  —  {month_label.upper()}")
    y -= 26

    col_x = [48, 148, 238, 318, 398, 468]
    hdrs  = ["Date", "Peak Workers", "Violations", "Safe Workers", "Compliance %", "Days Active"]
    set_rgb((0.20, 0.24, 0.34)); c.rect(40, y - 3, pw - 80, 16, fill=1, stroke=0)
    set_rgb(GREY); c.setFont("Helvetica-Bold", 8)
    for cx2, hdr in zip(col_x, hdrs):
        c.drawString(cx2, y + 1, hdr)
    y -= 18

    c.setFont("Helvetica", 8)
    for idx, day in enumerate(days_with_data):
        wk = day_total_workers(day); v = day_total_violations(day)
        s  = max(0, wk - v)
        cp = f"{round(s / wk * 100, 1)}%" if wk else "N/A"
        set_rgb((0.11, 0.14, 0.20) if idx % 2 == 0 else (0.09, 0.11, 0.17))
        c.rect(40, y - 3, pw - 80, 14, fill=1, stroke=0)
        c.setStrokeColorRGB(*(RED if v > 0 else GREEN)); c.setLineWidth(1.5)
        c.line(40, y - 3, 40, y + 11); c.setLineWidth(1)
        for cx2, val in zip(col_x, [day, str(wk), str(v), str(s), cp, "✓"]):
            set_rgb(RED if val == str(v) and v > 0 else GREEN if val == str(s) else YELLOW if val == cp else WHITE)
            c.drawString(cx2, y, val)
        y -= 15
        if y < 80:
            c.showPage(); set_rgb(BG_DARK); c.rect(0, 0, pw, ph, fill=1, stroke=0)
            y = ph - 40; c.setFont("Helvetica", 8)

    if y < 140:
        c.showPage(); set_rgb(BG_DARK); c.rect(0, 0, pw, ph, fill=1, stroke=0); y = ph - 40

    y -= 16
    set_rgb((0.13, 0.16, 0.24)); c.rect(40, y - 4, pw - 80, 20, fill=1, stroke=0)
    set_rgb(WHITE); c.setFont("Helvetica-Bold", 10); c.drawString(48, y + 2, "HANDOVER NOTES")
    y -= 22
    notes = [
        f"Incoming shift supervisor to review all {total_violations} violation(s) from {month_label} before sign-off.",
        f"PPE compliance was {compliance_pct}% — monitor zones with recent violations.",
        f"{total_safe} workers maintained full PPE compliance throughout the period.",
        f"Total workers recorded: {total_workers}. Verify headcount at all zone entry points.",
        f"Active data days in period: {len(days_with_data)} of {len(all_days)} calendar days.",
    ]
    set_rgb(GREY); c.setFont("Helvetica", 9)
    for note in notes:
        c.drawString(52, y, f"•  {note}"); y -= 15
    y -= 20
    set_rgb((0.25, 0.30, 0.42)); c.line(48, y, 230, y); c.line(320, y, 510, y)
    set_rgb(GREY); c.setFont("Helvetica", 8)
    c.drawString(48,  y - 12, "Outgoing Supervisor")
    c.drawString(320, y - 12, "Incoming Supervisor")
    c.drawString(200, y - 12, "Time: ___________")
    c.drawString(460, y - 12, "Time: ___________")

    set_rgb((0.05, 0.12, 0.25)); c.rect(0, 0, pw, 28, fill=1, stroke=0)
    set_rgb(GREY); c.setFont("Helvetica", 7.5)
    c.drawString(40, 10, "YOLOIntel  ·  Construction Site  ·  Auto-generated Shift Handover Report")
    c.drawRightString(pw - 40, 10, f"Report Period: {month_label}  ·  Generated: {datetime.now().strftime('%d %b %Y %I:%M %p')}")
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Handover-Report-{month}.pdf"})


# ─────────────────────────────────────────────────────────────────────────────
# ALERTS FULL
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/alerts-full")
def get_alerts_full(
    date_from: str = None, date_to: str = None,
    date: str = None, limit: int = 9999,
):
    today_str = datetime.now().strftime("%Y-%m-%d")
    if date_from and date_to:
        query = {"$or": [
            {"camera_ts_ist":   {"$gte": date_from, "$lte": date_to + " 99:99:99"}},
            {"camera_ts":       {"$gte": date_from, "$lte": date_to + " 99:99:99"}},
            {"analyzed_at_ist": {"$gte": date_from, "$lte": date_to + " 99:99:99"}},
        ]}
    elif date:
        query = date_match(date)
    else:
        query = date_match(today_str)

    results = list(
        ppe_results_col.find(query)
        .sort("camera_ts_ist", DESCENDING)
        .limit(limit)
    )
    alerts = []
    for r in results:
        ts       = get_ts(r)
        ack      = r.get("acknowledged", False)
        ack_time = r.get("ack_time", "")
        comments = r.get("comments", [])
        for idx, p in enumerate(r.get("ppe", [])):
            vtype = p.get("violation_type", "")
            if vtype not in ("no_helmet", "no_vest", "both_missing"):
                continue
            severity = "critical" if vtype == "both_missing" else "warning"
            label    = p.get("label", "?")
            if vtype == "both_missing": message = f"Worker {label} missing both helmet and vest"
            elif vtype == "no_helmet":  message = f"Worker {label} not wearing helmet"
            else:                       message = f"Worker {label} not wearing vest"
            missing = (["helmet"] if vtype == "no_helmet"
                       else ["vest"] if vtype == "no_vest"
                       else ["helmet", "vest"])
            alerts.append({
                "_id":            f"{str(r['_id'])}_{idx}",
                "doc_id":         str(r["_id"]),
                "camera":         r.get("camera", ""),
                "zone":           r.get("zone", ""),
                "timestamp":      ts,
                "worker_id":      label,
                "type":           "ppe violation",
                "message":        message,
                "severity":       severity,
                "missing_ppe":    missing,
                "violation_type": vtype,
                "acknowledged":   ack,
                "ack_time":       ack_time,
                "comments":       comments,
            })
    return alerts


# ─────────────────────────────────────────────────────────────────────────────
# SSE LIVE STREAM
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/stream")
async def stream_updates(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            if _shutdown_event.is_set():
                break
            try:
                today_str  = datetime.now().strftime("%Y-%m-%d")
                kpi_data   = get_kpi(today_str)
                match_q    = date_match(today_str)
                raw_alerts = list(
                    ppe_results_col.find(
                        date_and(match_q, {"$or": [
                            {"acknowledged": False},
                            {"acknowledged": {"$exists": False}},
                        ]})
                    )
                    .sort("analyzed_at_ist", DESCENDING)
                    .limit(10)
                )
                open_alerts = build_alert_list(raw_alerts)
                payload     = {
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


# ─────────────────────────────────────────────────────────────────────────────
# KPI PERIOD
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/api/kpi-period")
def get_kpi_period(date_from: str, date_to: str):
    from collections import defaultdict
    if not date_from or not date_to:
        return {"error": "date_from and date_to are required"}

    query = {"$or": [
        {"camera_ts_ist": {"$gte": date_from, "$lte": date_to + " 99:99:99"}},
        {"camera_ts":     {"$gte": date_from, "$lte": date_to + " 99:99:99"}},
    ]}
    results = list(ppe_results_col.find(query))
    if not results:
        return {
            "total_workers": 0, "total_safe": 0, "total_violations": 0,
            "compliance_pct": 100, "critical_alerts": 0, "warning_alerts": 0,
            "active_cameras": 0, "days_with_data": 0,
        }

    day_cam = defaultdict(lambda: defaultdict(lambda: {"max_workers": 0, "max_violations": 0}))
    for doc in results:
        ts = str(doc.get("camera_ts_ist") or doc.get("camera_ts") or "")[:10]
        if not ts or ts < date_from or ts > date_to:
            continue
        cam     = doc.get("camera", "unknown")
        persons = _persons_count(doc)
        viols   = _violations_count(doc)
        slot    = day_cam[ts][cam]
        if persons > slot["max_workers"]:    slot["max_workers"]    = persons
        if viols   > slot["max_violations"]: slot["max_violations"] = viols

    total_workers = total_violations = 0
    for day, cameras in day_cam.items():
        total_workers    += sum(c["max_workers"]    for c in cameras.values())
        total_violations += sum(c["max_violations"] for c in cameras.values())

    total_safe     = max(0, total_workers - total_violations)
    compliance_pct = round((total_safe / total_workers * 100), 1) if total_workers > 0 else 100.0

    critical_count = warning_count = 0
    for doc in results:
        for p in doc.get("ppe", []):
            vt = str(p.get("violation_type") or "").strip()
            if vt == "both_missing":             critical_count += 1
            elif vt in ("no_helmet", "no_vest"): warning_count  += 1

    active_cameras = len(set(doc.get("camera", "") for doc in results if doc.get("camera")))

    return {
        "total_workers":    total_workers,
        "total_safe":       total_safe,
        "total_violations": total_violations,
        "compliance_pct":   compliance_pct,
        "critical_alerts":  critical_count,
        "warning_alerts":   warning_count,
        "active_cameras":   active_cameras,
        "days_with_data":   len(day_cam),
        "date_from":        date_from,
        "date_to":          date_to,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
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