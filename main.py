# ─────────────────────────────────────────────────────────────────────────────
# INSTALL:  pip install fastapi uvicorn pymongo
# RUN:      python main.py
# STOP:     Ctrl+C
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, Response
from pymongo import MongoClient, DESCENDING
from bson import ObjectId
from pathlib import Path
import json, time, asyncio, signal, sys, subprocess, threading, os
from datetime import datetime

app = FastAPI()

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── MONGODB ───────────────────────────────────────────────────────────────────
client          = MongoClient("mongodb://localhost:27017")
db              = client["construction_monitor"]
snapshots_col   = db["snapshots"]
ppe_results_col = db["ppe_results"]
violations_col  = db["violations"]
alerts_col      = db["alerts"]

# ── BATCH IMAGES (separate yolo_images DB) ────────────────────────────────────
images_col = client["yolo_images"]["images"]

# ── SHUTDOWN EVENT ────────────────────────────────────────────────────────────
_shutdown_event = asyncio.Event()

# ─────────────────────────────────────────────────────────────────────────────
# CAMERA CONFIG
# ─────────────────────────────────────────────────────────────────────────────
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

    cmd = [
        "ffmpeg",
        "-rtsp_transport", "tcp",
        "-i", rtsp_url,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-crf", "28",
        "-maxrate", "1500k",
        "-bufsize", "3000k",
        "-vf", "scale=1280:-2",
        "-c:a", "aac",
        "-f", "hls",
        "-hls_time", "1",
        "-hls_list_size", "3",
        "-hls_flags", "delete_segments+append_list+omit_endlist",
        "-hls_segment_filename", str(cam_dir / "seg%03d.ts"),
        str(cam_dir / "stream.m3u8"),
        "-y",
    ]

    def run():
        print(f"[Camera] Starting {cam_id} ...")
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            _ffmpeg_procs[cam_id] = proc
            _, err = proc.communicate()
            if proc.returncode != 0 and err:
                print(f"[Camera] {cam_id} error: {err.decode()[-200:]}")
        except FileNotFoundError:
            print(f"[Camera] ERROR — ffmpeg not found. Install it: winget install ffmpeg")

    threading.Thread(target=run, daemon=True).start()


def stop_all_streams():
    for cam_id, proc in _ffmpeg_procs.items():
        print(f"[Camera] Stopping {cam_id}")
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


# ─────────────────────────────────────────────────────────────────────────────
# SERIALIZE HELPER
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


# ─────────────────────────────────────────────────────────────────────────────
# HLS SERVE
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/hls/{cam_id}/stream.m3u8")
async def serve_m3u8(cam_id: str):
    path = HLS_DIR / cam_id / "stream.m3u8"
    if not path.exists():
        return Response(status_code=404)
    return Response(
        content=path.read_text(),
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
    )

@app.get("/hls/{cam_id}/{segment}")
async def serve_segment(cam_id: str, segment: str):
    path = HLS_DIR / cam_id / segment
    if not path.exists():
        return Response(status_code=404)
    return Response(
        content=path.read_bytes(),
        media_type="video/mp2t",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
    )

# app.mount("/hls", StaticFiles(directory="hls"), name="hls")
# app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
def serve_frontend():
    return FileResponse("frontend/index.html")


# ═════════════════════════════════════════════════════════════════════════════
# CAMERAS
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/cameras")
def list_cameras():
    result = []
    for cam_id in CAMERAS:
        m3u8 = HLS_DIR / cam_id / "stream.m3u8"
        result.append({
            "id":      cam_id,
            "hls_url": f"/hls/{cam_id}/stream.m3u8",
            "ready":   m3u8.exists() and (time.time() - m3u8.stat().st_mtime) < 10 if m3u8.exists() else False,
        })
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
    now       = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    use_date  = date if date else today_str

    pipeline = [
        {"$match": {"timestamp": {"$regex": f"^{use_date}"}}},
        {"$sort":  {"timestamp": 1}},
        {"$group": {
            "_id":        "$timestamp",
            "persons":    {"$sum": "$total_persons"},
            "safe":       {"$sum": "$total_safe"},
            "violations": {"$sum": "$total_violations"},
        }},
        {"$project": {
            "persons": 1, "safe": 1, "violations": 1,
            "compliance": {
                "$cond": {
                    "if":   {"$gt": ["$persons", 0]},
                    "then": {"$multiply": [{"$divide": ["$safe", "$persons"]}, 100]},
                    "else": 100
                }
            }
        }},
        {"$group": {
            "_id":            None,
            "avg_safe":       {"$avg": "$safe"},
            "avg_persons":    {"$avg": "$persons"},
            "avg_violations": {"$avg": "$violations"},
            "avg_compliance": {"$avg": "$compliance"},
        }}
    ]

    result = list(ppe_results_col.aggregate(pipeline))

    if not result:
        return {
            "total_persons": 0, "total_safe": 0, "total_violations": 0,
            "compliance_pct": 100, "active_cameras": 0,
            "critical_alerts": 0, "warning_alerts": 0,
            "info_alerts": 0, "resolved_alerts": 0, "open_alerts": 0,
        }

    r                = result[0]
    total_persons    = round(r["avg_persons"])
    total_safe       = round(r["avg_safe"])
    total_violations = round(r["avg_violations"])
    compliance_pct   = max(0, min(100, round(r["avg_compliance"], 1)))

    active_cameras = len(snapshots_col.distinct("camera"))
    open_alerts    = list(alerts_col.find(
        {"$or": [{"acknowledged": False}, {"acknowledged": {"$exists": False}}]}
    ).sort("timestamp", DESCENDING).limit(50))
    critical = sum(1 for a in open_alerts if a.get("severity") == "critical")
    warnings = sum(1 for a in open_alerts if a.get("severity") == "warning")
    info     = sum(1 for a in open_alerts if a.get("severity") not in ("critical", "warning"))
    resolved = alerts_col.count_documents({"acknowledged": True})

    return {
        "total_persons":    total_persons,
        "total_safe":       total_safe,
        "total_violations": total_violations,
        "compliance_pct":   compliance_pct,
        "active_cameras":   active_cameras,
        "critical_alerts":  critical,
        "warning_alerts":   warnings,
        "info_alerts":      info,
        "resolved_alerts":  resolved,
        "open_alerts":      len(open_alerts),
    }


# ═════════════════════════════════════════════════════════════════════════════
# ALERTS
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/alerts")
def get_alerts(limit: int = 200, date: str = None, show_all: bool = False):
    today_str = datetime.now().strftime("%Y-%m-%d")
    use_date  = date if date else today_str

    unacked = list(alerts_col.find({
        "$or": [{"acknowledged": False}, {"acknowledged": {"$exists": False}}],
        "timestamp": {"$regex": f"^{use_date}"}
    }).sort("timestamp", DESCENDING).limit(limit))

    acked = list(alerts_col.find({
        "acknowledged": True,
        "timestamp": {"$regex": f"^{use_date}"}
    }).sort("timestamp", DESCENDING).limit(50))

    return [serialize(d) for d in unacked] + [serialize(d) for d in acked]


@app.post("/api/alerts/{alert_id}")
def ack_alert(alert_id: str):
    try:
        alerts_col.update_one(
            {"_id": ObjectId(alert_id)},
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
    query = {}
    if date:   query["timestamp"] = {"$regex": f"^{date}"}
    if camera: query["camera"]    = camera
    docs = list(ppe_results_col.find(query).sort("timestamp", DESCENDING).limit(limit))
    return [serialize(d) for d in docs]


# ═════════════════════════════════════════════════════════════════════════════
# VIOLATIONS
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/violations")
def get_violations(limit: int = 100, date: str = None):
    query = {}
    if date: query["timestamp"] = {"$regex": f"^{date}"}
    docs = list(violations_col.find(query).sort("timestamp", DESCENDING).limit(limit))
    result = []
    for d in docs:
        s = serialize(d)
        if "missing" in s and "missing_ppe" not in s:
            s["missing_ppe"] = s["missing"]
        s["detected_at"]     = s.get("timestamp", "")
        s["violation_count"] = len(s.get("missing_ppe") or s.get("missing") or [])
        result.append(s)
    return result


@app.get("/api/violations-by-camera")
def get_violations_by_camera(date: str = None):
    query = {}
    if date: query["timestamp"] = {"$regex": f"^{date}"}
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$camera", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    results = list(violations_col.aggregate(pipeline))
    return [{"camera": r["_id"], "count": r["count"]} for r in results if r["_id"]]


# ═════════════════════════════════════════════════════════════════════════════
# PPE COMPLIANCE
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/ppe-compliance")
def get_ppe_compliance(date: str = None):
    query = {}
    if date: query["timestamp"] = {"$regex": f"^{date}"}
    results = list(ppe_results_col.find(query))
    if not results:
        return {"helmet": 94, "vest": 97, "goggles": 78, "gloves": 82, "boots": 99}
    total   = len(results)
    helmet  = round(sum(1 for r in results if "helmet" in str(r.get("ppe_status", "")).lower() or r.get("helmet_compliant", True)) / total * 100)
    vest    = round(sum(1 for r in results if r.get("vest_compliant",    True)) / total * 100)
    goggles = round(sum(1 for r in results if r.get("goggles_compliant", True)) / total * 100)
    gloves  = round(sum(1 for r in results if r.get("gloves_compliant",  True)) / total * 100)
    boots   = round(sum(1 for r in results if r.get("boots_compliant",   True)) / total * 100)
    return {"helmet": helmet, "vest": vest, "goggles": goggles, "gloves": gloves, "boots": boots}


@app.get("/api/ppe-compliance-summary")
def get_ppe_compliance_summary(date: str = None):
    query = {}
    if date: query["timestamp"] = {"$regex": f"^{date}"}
    results = list(violations_col.find(query))
    total   = len(results)
    if total == 0:
        return {"helmet": 0, "vest": 0}

    def pct(field):
        compliant = sum(1 for r in results if field not in r.get("missing", []))
        return round(compliant / total * 100, 1)

    return {"helmet": pct("helmet"), "vest": pct("vest")}


# ═════════════════════════════════════════════════════════════════════════════
# REPORTS
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/reports/daily")
def daily_report(date: str = None):
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    query      = {"timestamp": {"$regex": f"^{date}"}}
    results    = list(ppe_results_col.find(query))
    violations = list(violations_col.find(query))
    alerts     = list(alerts_col.find(query))

    frame_count    = len(results)
    avg_persons    = round(sum(r.get("total_persons",    0) for r in results) / frame_count) if frame_count > 0 else 0
    avg_safe       = round(sum(r.get("total_safe",       0) for r in results) / frame_count) if frame_count > 0 else 0
    avg_violations = round(sum(r.get("total_violations", 0) for r in results) / frame_count) if frame_count > 0 else 0
    compliance     = round((avg_safe / avg_persons * 100) if avg_persons > 0 else 100, 1)

    violation_types = {}
    for v in violations:
        for item in v.get("missing", []):
            violation_types[item] = violation_types.get(item, 0) + 1

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
        "violation_types":          violation_types,
        "frames_analyzed":          frame_count,
    }


@app.get("/api/hourly-trend")
def get_hourly_trend(date: str = None):
    query = {}
    if date: query["timestamp"] = {"$regex": f"^{date}"}
    pipeline = [
        {"$match": query},
        {"$project": {
            "hour":             {"$substr": ["$timestamp", 11, 2]},
            "total_persons":    1,
            "total_safe":       1,
            "total_violations": 1,
        }},
        {"$group": {
            "_id":            "$hour",
            "workers_active": {"$sum": "$total_persons"},
            "workers_safe":   {"$sum": "$total_safe"},
            "violations":     {"$sum": "$total_violations"},
        }},
        {"$sort": {"_id": 1}}
    ]
    results = list(ppe_results_col.aggregate(pipeline))
    return [
        {
            "hour":           f"{r['_id']}:00",
            "workers_active": r["workers_active"],
            "workers_safe":   r["workers_safe"],
            "violations":     r["violations"],
        }
        for r in results
    ]


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
                now       = datetime.now()
                today_str = now.strftime("%Y-%m-%d")

                pipeline = [
                    {"$match": {"timestamp": {"$regex": f"^{today_str}"}}},
                    {"$sort":  {"timestamp": 1}},
                    {"$group": {
                        "_id":        "$timestamp",
                        "persons":    {"$sum": "$total_persons"},
                        "safe":       {"$sum": "$total_safe"},
                        "violations": {"$sum": "$total_violations"},
                    }},
                    {"$project": {
                        "persons": 1, "safe": 1, "violations": 1,
                        "compliance": {
                            "$cond": {
                                "if":   {"$gt": ["$persons", 0]},
                                "then": {"$multiply": [{"$divide": ["$safe", "$persons"]}, 100]},
                                "else": 100
                            }
                        }
                    }},
                    {"$group": {
                        "_id":            None,
                        "avg_safe":       {"$avg": "$safe"},
                        "avg_persons":    {"$avg": "$persons"},
                        "avg_violations": {"$avg": "$violations"},
                        "avg_compliance": {"$avg": "$compliance"},
                    }}
                ]

                sse_result = list(ppe_results_col.aggregate(pipeline))

                if sse_result:
                    r          = sse_result[0]
                    total_p    = round(r["avg_persons"])
                    total_s    = round(r["avg_safe"])
                    total_v    = round(r["avg_violations"])
                    compliance = max(0, min(100, round(r["avg_compliance"], 1)))
                else:
                    total_p = total_s = total_v = 0
                    compliance = 100

                open_alerts = list(alerts_col.find(
                    {"acknowledged": False}
                ).sort("timestamp", DESCENDING).limit(50))

                critical = sum(1 for a in open_alerts if a.get("severity") == "critical")
                warnings = sum(1 for a in open_alerts if a.get("severity") == "warning")

                payload = {
                    "kpi": {
                        "total_persons":    total_p,
                        "total_safe":       total_s,
                        "total_violations": total_v,
                        "compliance_pct":   compliance,
                        "active_cameras":   len(snapshots_col.distinct("camera")),
                        "open_alerts":      len(open_alerts),
                        "critical_alerts":  critical,
                        "warning_alerts":   warnings,
                    },
                    "latest_alerts":  [serialize(a) for a in open_alerts[:10]],
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
# BATCH IMAGES  ← NEW: reads from yolo_images DB
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/api/images")
def get_images(date: str = None):
    """
    Returns all batch images stored in MongoDB (yolo_images → images collection).
    Each doc: { _id, name, data (base64), contentType,
                batchNumber, imgRange, personCount, date, uploadedAt }
    """
    query = {}
    if date:
        query["date"] = date
    docs = list(images_col.find(query).sort("batchNumber", 1))
    return [serialize(d) for d in docs]


@app.delete("/api/images/{image_id}")
def delete_image(image_id: str):
    from fastapi import HTTPException
    try:
        images_col.delete_one({"_id": ObjectId(image_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image_id")
    return {"status": "deleted"}


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

    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://localhost:8000")

    threading.Thread(target=open_browser, daemon=True).start()

    print("\n╔══════════════════════════════════════════════╗")
    print("║   🦺  YOLOIntel Safety Dashboard             ║")
    print("║   http://localhost:8000                      ║")
    print("║   Ctrl+C to stop                             ║")
    print("╚══════════════════════════════════════════════╝\n")

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, loop="asyncio")
