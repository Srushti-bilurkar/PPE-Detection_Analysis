#!/usr/bin/env python3
 
import os
 
import sys
 
import base64
 
import math
 
import time
 
from datetime import datetime, timezone, timedelta
 
from dotenv import load_dotenv
 
load_dotenv()
 
MONGO_URL           = os.getenv("MONGO_URL", "mongodb://localhost:27017")
 
DB_NAME             = os.getenv("DB_NAME",   "construction_monitor")
 
POLL_INTERVAL       = 10
 
COLLAGE_INTERVAL    = 57
 
PERSONS_PER_ROW     = 3
 
MAX_PERSONS_COLLAGE = 9
 
CROP_W              = 200
 
CROP_H              = 300
 
GAP                 = 6
 
HEADER_H            = 80
 
BG_COLOR            = (25, 25, 25)
 
HEADER_COLOR        = (40, 40, 40)
 
JPEG_QUALITY        = 92
 
CONF_THRESH         = 0.25
 
IOU_THRESH          = 0.30
 
PADDING_TOP         = 30
 
PADDING_SIDE        = 15
 
PADDING_BOTTOM      = 15
 
MIN_PERSON_H        = 60
 
MIN_PERSON_W        = 25
 
BADGE_BAR_H       = 22
 
BADGE_FONT        = None
 
BADGE_LABEL_SCALE = 0.42
 
BADGE_CONF_SCALE  = 0.38
 
BADGE_THICKNESS   = 1
 
BADGE_CONF_H      = 18
 
COLLAGE_SAVE_DIR = r"c:\Users\varshas\Desktop\yolo-frontend\collages_output"
 
# ── YOLO Model Selection ───────────────────────────────────────────────────────
 
# Options (auto-downloaded on first run from ultralytics):
 
#   "yolov8n.pt"  — nano,   fastest,  least accurate  (~3 MB)
 
#   "yolov8s.pt"  — small,  fast,     good balance    (~22 MB)
 
#   "yolov8m.pt"  — medium, moderate, more accurate   (~52 MB)
 
#   "yolov8l.pt"  — large,  slower,   very accurate   (~87 MB)
 
#   "yolov8x.pt"  — xlarge, slowest,  best accuracy   (~136 MB)
 
YOLO_MODEL_NAME = "yolov8n.pt"
 
print("="*65, flush=True)
 
print("  Collage Maker — YOLO + MongoDB  [57s timer mode]", flush=True)
 
print("="*65, flush=True)
 
try:
 
    import cv2
 
    import numpy as np
 
    BADGE_FONT = cv2.FONT_HERSHEY_SIMPLEX
 
    print("  OK: opencv loaded", flush=True)
 
except ImportError:
 
    print("  ERROR: pip install opencv-python numpy", flush=True)
 
    sys.exit(1)
 
try:
 
    from pymongo import MongoClient
 
    print("  OK: pymongo loaded", flush=True)
 
except ImportError:
 
    print("  ERROR: pip install pymongo", flush=True)
 
    sys.exit(1)
 
try:
 
    from ultralytics import YOLO
 
    print("  OK: ultralytics loaded", flush=True)
 
except ImportError:
 
    print("  ERROR: pip install ultralytics", flush=True)
 
    sys.exit(1)
 
 
# ── IST Helpers ───────────────────────────────────────────────────────────────
 
IST = timezone(timedelta(hours=5, minutes=30))
 
def now_ist():
 
    return datetime.now(IST)
 
def now_ist_str():
 
    return now_ist().strftime("%Y-%m-%d %H:%M:%S IST")
 
def to_ist_str(dt):
 
    if dt is None:
 
        return None
 
    if dt.tzinfo is None:
 
        dt = dt.replace(tzinfo=timezone.utc)
 
    return dt.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S IST")
 
def get_today_ist():
 
    return now_ist().strftime("%Y-%m-%d")
 
 
# ── Daily Collage Counter ─────────────────────────────────────────────────────
 
def get_daily_collage_num(db):
 
    today = get_today_ist()
 
    last_collage = db.collages.find_one(
 
        {"date": today},
 
        sort=[("collage_num", -1)]
 
    )
 
    if last_collage:
 
        return last_collage["collage_num"] + 1, today
 
    return 1, today
 
 
# ── Image Helpers ─────────────────────────────────────────────────────────────
 
def decode_image(image_b64: str):
 
    img_bytes = base64.b64decode(image_b64)
 
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
 
    return cv2.imdecode(img_array, cv2.IMREAD_COLOR)
 
def encode_image(img) -> str:
 
    _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
 
    return base64.b64encode(buf.tobytes()).decode("utf-8")
 
 
# ── Detection ─────────────────────────────────────────────────────────────────
 
def detect_and_crop(yolo_model, img, img_num: int, camera: str, snap_timestamp) -> list:
 
    h, w = img.shape[:2]
 
    # classes=[0] → "person" in standard COCO-trained YOLOv8 models
 
    results = yolo_model(img, classes=[0], conf=CONF_THRESH, iou=IOU_THRESH, verbose=False)
 
    crops = []
 
    person_count = 0
 
    for r in results:
 
        if r.boxes is None or len(r.boxes) == 0:
 
            continue
 
        sorted_boxes = sorted(
 
            r.boxes,
 
            key=lambda b: (int(b.xyxy[0][1].item()) // 50, int(b.xyxy[0][0].item()))
 
        )
 
        for box in sorted_boxes:
 
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
 
            conf = float(box.conf[0].item())
 
            if conf < 0.35:
 
                continue
 
            x1p = max(0, x1 - PADDING_SIDE)
 
            y1p = max(0, y1 - PADDING_TOP)
 
            x2p = min(w, x2 + PADDING_SIDE)
 
            y2p = min(h, y2 + PADDING_BOTTOM)
 
            if (y2p - y1p) < MIN_PERSON_H or (x2p - x1p) < MIN_PERSON_W:
 
                continue
 
            crop = img[y1p:y2p, x1p:x2p].copy()
 
            if crop.size == 0:
 
                continue
 
            person_count += 1
 
            crops.append({
 
                "crop":               crop,
 
                "label":              f"Img{img_num}-P{person_count}",
 
                "conf":               round(conf, 2),
 
                "camera":             camera,
 
                "img_num":            img_num,
 
                "person_num":         person_count,
 
                "x1": x1p, "y1": y1p, "x2": x2p, "y2": y2p,
 
                "snap_timestamp_ist": to_ist_str(snap_timestamp),
 
            })
 
    return crops
 
 
def detect_and_crop_tiled(yolo_model, img, img_num: int, camera: str, snap_timestamp) -> list:
 
    h, w = img.shape[:2]
 
    all_crops = []
 
    person_count = 0
 
    tiles = [
 
        (0,    0,    w//2, h//2),
 
        (w//2, 0,    w,    h//2),
 
        (0,    h//2, w//2, h),
 
        (w//2, h//2, w,    h),
 
    ]
 
    for tx1, ty1, tx2, ty2 in tiles:
 
        for crop in detect_and_crop(yolo_model, img[ty1:ty2, tx1:tx2], img_num, camera, snap_timestamp):
 
            person_count += 1
 
            crop["label"] = f"Img{img_num}-P{person_count}"
 
            crop["x1"] += tx1; crop["x2"] += tx1
 
            crop["y1"] += ty1; crop["y2"] += ty1
 
            all_crops.append(crop)
 
    print(f"    Tiled detection: {person_count} total persons", flush=True)
 
    return all_crops
 
 
# ── Badge ─────────────────────────────────────────────────────────────────────
 
def stamp_badge(img, label: str, conf: float):
 
    """
 
    Stamp a fixed-size label bar at the bottom and a fixed-size confidence
 
    badge at the top-right onto an already-resized (CROP_W x CROP_H) image.
 
    Call this AFTER cv2.resize(), never before.
 
    """
 
    img = img.copy()
 
    h, w = img.shape[:2]
 
    # Bottom label bar — fixed 22px height
 
    cv2.rectangle(img, (0, h - BADGE_BAR_H), (w, h), (0, 0, 0), -1)
 
    cv2.putText(
 
        img, label,
 
        (3, h - 6),
 
        BADGE_FONT, BADGE_LABEL_SCALE,
 
        (60, 255, 60), BADGE_THICKNESS, cv2.LINE_AA
 
    )
 
    # Top-right confidence badge — fixed 18px height
 
    conf_str = f"{conf:.0%}"
 
    (tw, _), _ = cv2.getTextSize(conf_str, BADGE_FONT, BADGE_CONF_SCALE, 1)
 
    badge_w = tw + 8
 
    cv2.rectangle(img, (w - badge_w, 0), (w, BADGE_CONF_H), (0, 0, 0), -1)
 
    cv2.putText(
 
        img, conf_str,
 
        (w - tw - 4, 13),
 
        BADGE_FONT, BADGE_CONF_SCALE,
 
        (200, 200, 60), 1, cv2.LINE_AA
 
    )
 
    return img
 
 
# ── Collage Builder ───────────────────────────────────────────────────────────
 
def build_collage(batch, collage_num):
 
    n    = len(batch)
 
    cols = min(n, PERSONS_PER_ROW)
 
    rows = math.ceil(n / PERSONS_PER_ROW)
 
    canvas_w = cols * CROP_W + (cols + 1) * GAP
 
    canvas_h = HEADER_H + rows * CROP_H + (rows + 1) * GAP
 
    canvas   = np.full((canvas_h, canvas_w, 3), BG_COLOR, dtype=np.uint8)
 
    cv2.rectangle(canvas, (0, 0), (canvas_w, HEADER_H), HEADER_COLOR, -1)
 
    cv2.line(canvas, (0, HEADER_H), (canvas_w, HEADER_H), (70, 70, 70), 2)
 
    sources = list(dict.fromkeys(p["camera"] for p in batch))
 
    src_str = "  |  ".join(s[:25] for s in sources)[:80]
 
    cv2.putText(canvas, f"Collage {collage_num:02d}   Persons {n} in batch",
 
                (GAP, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (220, 220, 220), 1, cv2.LINE_AA)
 
    cv2.putText(canvas, f"Generated: {now_ist_str()}",
 
                (GAP, 44), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (140, 200, 255), 1, cv2.LINE_AA)
 
    cv2.putText(canvas, f"Sources: {src_str}",
 
                (GAP, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (120, 120, 120), 1, cv2.LINE_AA)
 
    for idx, person in enumerate(batch):
 
        row = idx // PERSONS_PER_ROW
 
        col = idx %  PERSONS_PER_ROW
 
        x = GAP + col * (CROP_W + GAP)
 
        y = HEADER_H + GAP + row * (CROP_H + GAP)
 
        # Step 1: Resize raw crop to fixed tile size
 
        resized = cv2.resize(person["crop"], (CROP_W, CROP_H),
 
                             interpolation=cv2.INTER_AREA)
 
        # Step 2: Stamp badge AFTER resize — always identical pixel size
 
        stamped = stamp_badge(resized, person["label"], person["conf"])
 
        canvas[y:y + CROP_H, x:x + CROP_W] = stamped
 
        cv2.rectangle(canvas, (x - 1, y - 1), (x + CROP_W, y + CROP_H), (80, 80, 80), 1)
 
    return canvas
 
 
# ── Snapshot Processor ────────────────────────────────────────────────────────
 
def process_snapshot(snapshot, db, yolo_model, img_num: int):
 
    snap_id        = snapshot["_id"]
 
    camera         = snapshot["camera"]
 
    snap_timestamp = snapshot.get("timestamp")
 
    print(f"\n  Snapshot : {snap_id}", flush=True)
 
    print(f"  Camera   : {camera}", flush=True)
 
    print(f"  Time IST : {to_ist_str(snap_timestamp)}", flush=True)
 
    img = decode_image(snapshot["image"])
 
    if img is None:
 
        print(f"  ERROR: Cannot decode image", flush=True)
 
        db.snapshots.update_one(
 
            {"_id": snap_id},
 
            {"$set": {"collage_processed": True, "error": "decode failed"}}
 
        )
 
        return []
 
    print(f"  Size     : {img.shape[1]}x{img.shape[0]}px", flush=True)
 
    crops = detect_and_crop_tiled(yolo_model, img, img_num, camera, snap_timestamp)
 
    print(f"  Persons  : {len(crops)} detected", flush=True)
 
    stamped = []
 
    for p in crops:
 
        stamped.append({**p, "snap_id": snap_id})
 
    db.snapshots.update_one({"_id": snap_id}, {"$set": {"collage_processed": True}})
 
    return stamped
 
 
# ── Build & Save Collage ──────────────────────────────────────────────────────
 
def build_and_save_collage(batch, db):
 
    collage_num, today = get_daily_collage_num(db)
 
    print(f"\n  ⏱  Building collage {collage_num} ({len(batch)} persons)...", flush=True)
 
    collage_img = build_collage(batch, collage_num)
 
    collage_b64 = encode_image(collage_img)
 
    persons_meta = [{
 
        "label":              p["label"],
 
        "camera":             p["camera"],
 
        "conf":               p["conf"],
 
        "snap_id":            p["snap_id"],
 
        "snap_timestamp_ist": p.get("snap_timestamp_ist"),
 
        "crop_b64":           encode_image(p["crop"]),
 
        "x1": p.get("x1", 0),
 
        "y1": p.get("y1", 0),
 
        "x2": p.get("x2", 0),
 
        "y2": p.get("y2", 0),
 
    } for p in batch]
 
    collage_doc = {
 
        "collage_num":    collage_num,
 
        "date":           today,
 
        "created_at_ist": now_ist_str(),
 
        "persons_count":  len(batch),
 
        "persons_meta":   persons_meta,
 
        "image_b64":      collage_b64,
 
        "analyzed":       False,
 
    }
 
    result     = db.collages.insert_one(collage_doc)
 
    collage_id = result.inserted_id
 
    print(f"  SAVED → MongoDB collages  _id={collage_id}", flush=True)
 
    filename = f"collage_{today.replace('-', '')}_{collage_num:02d}.jpg"
 
    cv2.imwrite(os.path.join(COLLAGE_SAVE_DIR, filename), collage_img)
 
    print(f"  SAVED → Local: {filename}", flush=True)
 
    return collage_id, collage_num, collage_b64, persons_meta
 
 
# ── Main Loop ─────────────────────────────────────────────────────────────────
 
def main():
 
    os.makedirs(COLLAGE_SAVE_DIR, exist_ok=True)
 
    print("\n  Connecting to MongoDB...", flush=True)
 
    mongo = MongoClient(MONGO_URL)
 
    db    = mongo[DB_NAME]
 
    print(f"  OK: MongoDB — {DB_NAME}", flush=True)
 
    # Standard YOLO model — auto-downloads on first run, cached locally after
 
    print(f"  Loading YOLO model ({YOLO_MODEL_NAME})...", flush=True)
 
    yolo_model = YOLO(YOLO_MODEL_NAME)
 
    print(f"  OK: YOLO ready ({YOLO_MODEL_NAME})", flush=True)
 
    result = db.snapshots.update_many(
 
        {"collage_processed": {"$ne": True}},
 
        {"$set": {"collage_processed": True}}
 
    )
 
    print(f"  Marked {result.modified_count} old snapshots — starting fresh", flush=True)
 
    print(f"\n  Mode         : time-based — collage every {COLLAGE_INTERVAL}s", flush=True)
 
    print(f"  Model        : {YOLO_MODEL_NAME} (COCO — class 0 = person)", flush=True)
 
    print(f"  Max per grid : {MAX_PERSONS_COLLAGE} persons", flush=True)
 
    print(f"  Poll interval: every {POLL_INTERVAL}s", flush=True)
 
    print("="*65, flush=True)
 
    img_counter       = 1
 
    pending_crops     = []
 
    last_collage_time = time.time()
 
    while True:
 
        try:
 
            unprocessed = list(
 
                db.snapshots.find(
 
                    {"collage_processed": {"$ne": True}}
 
                ).sort("timestamp", 1)
 
            )
 
            if unprocessed:
 
                print(f"\n  Found {len(unprocessed)} new snapshot(s)", flush=True)
 
                for snapshot in unprocessed:
 
                    crops = process_snapshot(snapshot, db, yolo_model, img_counter)
 
                    pending_crops.extend(crops)
 
                    img_counter += 1
 
            elapsed   = time.time() - last_collage_time
 
            secs_left = max(0, COLLAGE_INTERVAL - elapsed)
 
            if elapsed < COLLAGE_INTERVAL:
 
                print(
 
                    f"  Buffer: {len(pending_crops)} persons — "
 
                    f"next collage in {secs_left:.0f}s ...",
 
                    flush=True
 
                )
 
                time.sleep(POLL_INTERVAL)
 
                continue
 
            # ── Timer elapsed ─────────────────────────────────────────────
 
            last_collage_time = time.time()
 
            if not pending_crops:
 
                print(
 
                    f"\n  ⏱  {COLLAGE_INTERVAL}s elapsed — buffer empty, no collage built.",
 
                    flush=True
 
                )
 
                continue
 
            total_persons   = len(pending_crops)
 
            collage_results = []
 
            while pending_crops:
 
                batch         = pending_crops[:MAX_PERSONS_COLLAGE]
 
                pending_crops = pending_crops[MAX_PERSONS_COLLAGE:]
 
                collage_results.append(build_and_save_collage(batch, db))
 
            print(
 
                f"\n  ✅ Built {len(collage_results)} collage(s) "
 
                f"for {total_persons} persons.",
 
                flush=True
 
            )
 
        except KeyboardInterrupt:
 
            print("\n\n  Shutting down...", flush=True)
 
            mongo.close()
 
            break
 
        except Exception as e:
 
            print(f"\n  ERROR: {e}", flush=True)
 
            import traceback
 
            traceback.print_exc()
 
        time.sleep(POLL_INTERVAL)
 
 
if __name__ == "__main__":
 
    main()
 
 