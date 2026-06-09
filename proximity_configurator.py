#!/usr/bin/env python3
"""
proximity_configurator.py  — AUTO mode (fixed for high-res cameras)
────────────────────────────────────────────────────────────────────
Run ONCE. No manual clicking needed.

    python proximity_configurator.py

FIXES vs previous version:
  1. Sharpness thresholds now relative to image resolution — not hardcoded.
     High-res cameras (2560x1440) have naturally higher sharpness scores,
     so fixed thresholds of 300/100 were wrong — everything was "close".
     Now uses percentile-based approach: sharpest zones = close, least sharp = far.
  2. Fixed OpenCV crash when window is closed before destroyWindow is called.
  3. Better zone decisions — uses relative sharpness within the image,
     not absolute values. Bottom zones are usually sharpest (close),
     top zones are usually blurriest (far).

HOW IT WORKS:
  1. Fetches the latest snapshot for each camera from MongoDB
  2. Runs YOLO to detect persons — uses person pixel height to decide proximity
  3. For zones with no persons → uses RELATIVE image sharpness:
     - Ranks all 9 zones by sharpness score
     - Top 3 sharpest zones → close
     - Middle 3 zones → medium
     - Bottom 3 zones (least sharp) → far
  4. Shows result visually and saves to MongoDB camera_zone_quality
"""

import os
import sys
import base64
import numpy as np
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

MONGO_URL  = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME    = os.getenv("DB_NAME",   "construction_monitor")

YOLO_MODEL = r"C:\Users\varshas\Desktop\Yolo_intel\PPE-Detection_Analysis\runs\runs\detect\ppe_model_final\weights\best.pt"

CAMERAS = [
    "Pier_Cap_Cam_16389",
    "Pier_Cap_Cam_16388",
    "Pier_Cap_Cam_16387",
    "Pier_Cap_Cam_16386",
]

GRID_ROWS = 3
GRID_COLS = 3
ZONE_IDS  = [f"r{r}c{c}" for r in range(GRID_ROWS) for c in range(GRID_COLS)]

# Person pixel height thresholds (as fraction of zone height)
CLOSE_THRESH = 0.35   # > 35% of zone height → close
MED_THRESH   = 0.15   # > 15% → medium, < 15% → far

PROXIMITY_VALUES = {
    "close":  {"static_quality": 0.90, "blur_label": "sharp",    "trust_alerts": True},
    "medium": {"static_quality": 0.60, "blur_label": "moderate", "trust_alerts": "verify"},
    "far":    {"static_quality": 0.35, "blur_label": "blurry",   "trust_alerts": False},
}

IST = timezone(timedelta(hours=5, minutes=30))
def now_ist_str():
    return datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")

# ─────────────────────────────────────────────────────────────────────────────
print("="*65, flush=True)
print("  Proximity Configurator — AUTO mode", flush=True)
print("="*65, flush=True)

try:
    import cv2
    print("  OK: opencv loaded", flush=True)
except ImportError:
    print("  ERROR: pip install opencv-python"); sys.exit(1)

try:
    from pymongo import MongoClient
    print("  OK: pymongo loaded", flush=True)
except ImportError:
    print("  ERROR: pip install pymongo"); sys.exit(1)

try:
    from ultralytics import YOLO
    print("  OK: ultralytics loaded", flush=True)
except ImportError:
    print("  ERROR: pip install ultralytics"); sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
#  FETCH LATEST SNAPSHOT
# ─────────────────────────────────────────────────────────────────────────────

def fetch_snapshot(db, camera_name):
    doc = db.snapshots.find_one(
        {"camera": camera_name},
        sort=[("timestamp", -1)]
    )
    if not doc:
        print(f"  WARNING: No snapshot found for {camera_name}", flush=True)
        return None
    img_bytes = base64.b64decode(doc["image"])
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    img       = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        print(f"  WARNING: Could not decode image for {camera_name}", flush=True)
        return None
    print(f"  Loaded: {camera_name} — {img.shape[1]}x{img.shape[0]}px", flush=True)
    return img

# ─────────────────────────────────────────────────────────────────────────────
#  ZONE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_zone(cx, cy, img_w, img_h):
    col = min(int(cx / (img_w / GRID_COLS)), GRID_COLS - 1)
    row = min(int(cy / (img_h / GRID_ROWS)), GRID_ROWS - 1)
    return f"r{row}c{col}", row, col

def zone_rect(row, col, img_w, img_h):
    cell_w = img_w // GRID_COLS
    cell_h = img_h // GRID_ROWS
    x1 = col * cell_w
    y1 = row * cell_h
    return x1, y1, x1 + cell_w, y1 + cell_h

# ─────────────────────────────────────────────────────────────────────────────
#  RELATIVE SHARPNESS — fixes the high-res camera problem
#
#  Instead of using fixed thresholds (which fail on high-res cameras),
#  we compute sharpness for all 9 zones, then RANK them.
#  The 3 sharpest zones → close, middle 3 → medium, least sharp 3 → far.
#
#  This works correctly regardless of camera resolution or lighting.
# ─────────────────────────────────────────────────────────────────────────────

def compute_all_sharpness(img):
    """Returns dict: zone_id -> sharpness_score (Laplacian variance)"""
    h, w = img.shape[:2]
    scores = {}
    for zone_id in ZONE_IDS:
        row = int(zone_id[1])
        col = int(zone_id[3])
        x1, y1, x2, y2 = zone_rect(row, col, w, h)
        crop  = img[y1:y2, x1:x2]
        gray  = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        score = cv2.Laplacian(gray, cv2.CV_64F).var()
        scores[zone_id] = score
    return scores

def sharpness_to_proximity_relative(scores):
    """
    Rank zones by sharpness and assign proximity relatively.
    Top 3 (sharpest)  → close
    Middle 3          → medium
    Bottom 3 (least)  → far
    """
    sorted_zones = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    proximity = {}
    for i, (zone_id, score) in enumerate(sorted_zones):
        if i < 3:
            proximity[zone_id] = "close"
        elif i < 6:
            proximity[zone_id] = "medium"
        else:
            proximity[zone_id] = "far"
    return proximity

# ─────────────────────────────────────────────────────────────────────────────
#  CORE: auto-decide proximity for all 9 zones
# ─────────────────────────────────────────────────────────────────────────────

def auto_decide_proximity(img, yolo_model, camera_name):
    h, w = img.shape[:2]

    # Run YOLO
    results = yolo_model(img, classes=[0], conf=0.25, iou=0.30, verbose=False)

    zone_heights = {z: [] for z in ZONE_IDS}
    for r in results:
        if r.boxes is None: continue
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            person_h = y2 - y1
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            zone_id, row, col = get_zone(cx, cy, w, h)
            zone_h = h // GRID_ROWS
            zone_heights[zone_id].append(person_h / zone_h)

    total_persons = sum(len(v) for v in zone_heights.values())
    print(f"  YOLO detected {total_persons} persons", flush=True)

    # Compute sharpness for ALL zones (used as fallback)
    sharpness_scores   = compute_all_sharpness(img)
    relative_proximity = sharpness_to_proximity_relative(sharpness_scores)

    print(f"  Sharpness scores (relative ranking):", flush=True)
    sorted_s = sorted(sharpness_scores.items(), key=lambda x: x[1], reverse=True)
    for zone_id, score in sorted_s:
        print(f"    {zone_id}  sharpness={score:.0f}  → {relative_proximity[zone_id]}", flush=True)

    decisions = {}
    for zone_id in ZONE_IDS:
        heights = zone_heights[zone_id]

        if heights:
            # Person detected — use pixel height method
            max_h_pct = max(heights)
            avg_h_pct = sum(heights) / len(heights)

            if max_h_pct >= CLOSE_THRESH:
                proximity = "close"
                reason    = f"{len(heights)} person(s) — max height {max_h_pct:.0%} zone → close"
            elif max_h_pct >= MED_THRESH:
                proximity = "medium"
                reason    = f"{len(heights)} person(s) — max height {max_h_pct:.0%} zone → medium"
            else:
                proximity = "far"
                reason    = f"{len(heights)} person(s) — max height {max_h_pct:.0%} zone → far"

            decisions[zone_id] = {
                "proximity":      proximity,
                "reason":         reason,
                "person_count":   len(heights),
                "avg_height_pct": round(avg_h_pct, 3),
                "max_height_pct": round(max_h_pct, 3),
                "method":         "yolo_person_size",
            }
        else:
            # No persons — use RELATIVE sharpness ranking
            proximity = relative_proximity[zone_id]
            score     = sharpness_scores[zone_id]
            decisions[zone_id] = {
                "proximity":      proximity,
                "reason":         f"no persons — sharpness={score:.0f} relative → {proximity}",
                "person_count":   0,
                "avg_height_pct": 0,
                "max_height_pct": 0,
                "method":         "relative_sharpness",
            }

    return decisions

# ─────────────────────────────────────────────────────────────────────────────
#  VISUALIZE — fixed OpenCV crash
# ─────────────────────────────────────────────────────────────────────────────

def visualize_result(img, decisions, camera_name):
    h, w = img.shape[:2]

    max_display_w = 1280
    if w > max_display_w:
        scale   = max_display_w / w
        display = cv2.resize(img, (max_display_w, int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        display = img.copy()

    dh, dw = display.shape[:2]
    overlay = display.copy()

    COLOR_MAP = {
        "close":  (50, 200, 50),
        "medium": (50, 200, 230),
        "far":    (50, 50,  220),
    }

    for zone_id in ZONE_IDS:
        row  = int(zone_id[1])
        col  = int(zone_id[3])
        d    = decisions[zone_id]
        prox = d["proximity"]
        color = COLOR_MAP[prox]

        x1 = col * (dw // GRID_COLS)
        y1 = row * (dh // GRID_ROWS)
        x2 = x1 + (dw // GRID_COLS)
        y2 = y1 + (dh // GRID_ROWS)

        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)

        cv2.putText(display, zone_id,
                    (x1 + 8, y1 + 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255,255,255), 2, cv2.LINE_AA)

        lbl = prox.upper()
        (tw, _), __ = cv2.getTextSize(lbl, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.putText(display, lbl,
                    (x1 + (dw//GRID_COLS - tw)//2, y1 + dh//GRID_ROWS//2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255,255,255), 2, cv2.LINE_AA)

        q_lbl = f"q={PROXIMITY_VALUES[prox]['static_quality']}"
        cv2.putText(display, q_lbl,
                    (x1 + 8, y2 - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (220,220,220), 1, cv2.LINE_AA)

    cv2.addWeighted(overlay, 0.30, display, 0.70, 0, display)

    for r in range(1, GRID_ROWS):
        cv2.line(display, (0, r * dh//GRID_ROWS), (dw, r * dh//GRID_ROWS), (255,255,255), 2)
    for c in range(1, GRID_COLS):
        cv2.line(display, (c * dw//GRID_COLS, 0), (c * dw//GRID_COLS, dh), (255,255,255), 2)

    bar_h  = 50
    canvas = np.zeros((dh + bar_h, dw, 3), dtype=np.uint8)
    canvas[:dh] = display
    canvas[dh:] = (20, 20, 20)
    cv2.putText(canvas, f"AUTO RESULT: {camera_name}  — GREEN=close  CYAN=medium  RED=far",
                (10, dh + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (180,180,180), 1, cv2.LINE_AA)
    cv2.putText(canvas, "Press any key to continue to next camera",
                (10, dh + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (140,200,255), 1, cv2.LINE_AA)

    win = f"Result — {camera_name}"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.imshow(win, canvas)

    # FIX: waitKey in loop so window close button also works
    while True:
        key = cv2.waitKey(100) & 0xFF
        # any key pressed OR window was closed
        if key != 255:
            break
        # check if window still exists
        try:
            if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                break
        except Exception:
            break

    # FIX: safe destroy — ignore error if window already closed
    try:
        cv2.destroyWindow(win)
    except Exception:
        pass
    cv2.waitKey(1)  # flush events

# ─────────────────────────────────────────────────────────────────────────────
#  SAVE TO MONGODB
# ─────────────────────────────────────────────────────────────────────────────

def save_to_mongo(db, camera_name, decisions):
    inserted = 0
    updated  = 0

    for zone_id, d in decisions.items():
        prox = d["proximity"]
        vals = PROXIMITY_VALUES[prox]
        doc  = {
            "camera":         camera_name,
            "zone_id":        zone_id,
            "proximity":      prox,
            "static_quality": vals["static_quality"],
            "blur_label":     vals["blur_label"],
            "trust_alerts":   vals["trust_alerts"],
            "auto_reason":    d["reason"],
            "auto_method":    d["method"],
            "person_count":   d["person_count"],
            "avg_height_pct": d["avg_height_pct"],
            "configured_at":  now_ist_str(),
        }
        existing = db.camera_zone_quality.find_one({
            "camera":  camera_name,
            "zone_id": zone_id,
        })
        if existing:
            db.camera_zone_quality.update_one({"_id": existing["_id"]}, {"$set": doc})
            updated += 1
        else:
            db.camera_zone_quality.insert_one(doc)
            inserted += 1

    print(f"  Saved: {inserted} inserted, {updated} updated", flush=True)

# ─────────────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print(f"\n  Mode: relative sharpness ranking (no fixed thresholds)", flush=True)
    print(f"  Works correctly for any camera resolution", flush=True)
    print("="*65, flush=True)

    mongo = MongoClient(MONGO_URL)
    db    = mongo[DB_NAME]

    print("\n  Loading YOLO model...", flush=True)
    yolo = YOLO(YOLO_MODEL)
    print("  OK: YOLO ready", flush=True)

    db.camera_zone_quality.create_index(
        [("camera", 1), ("zone_id", 1)],
        unique=True, name="camera_zone_unique"
    )

    for camera_name in CAMERAS:
        print(f"\n{'─'*65}", flush=True)
        print(f"  Camera: {camera_name}", flush=True)

        img = fetch_snapshot(db, camera_name)
        if img is None:
            print(f"  SKIP: no image — defaulting all zones to medium", flush=True)
            decisions = {
                z: {"proximity":"medium","reason":"no image","person_count":0,
                    "avg_height_pct":0,"max_height_pct":0,"method":"default"}
                for z in ZONE_IDS
            }
            save_to_mongo(db, camera_name, decisions)
            continue

        print(f"  Running YOLO detection...", flush=True)
        decisions = auto_decide_proximity(img, yolo, camera_name)

        print(f"\n  Final zone decisions:", flush=True)
        for zone_id in ZONE_IDS:
            d = decisions[zone_id]
            q = PROXIMITY_VALUES[d['proximity']]['static_quality']
            print(f"    {zone_id}  {d['proximity']:<8}  quality={q}  {d['reason']}", flush=True)

        save_to_mongo(db, camera_name, decisions)

    print(f"\n{'='*65}", flush=True)
    print(f"  Done — camera_zone_quality updated for all {len(CAMERAS)} cameras", flush=True)
    print(f"  Restart zone_aggregator.py to use the new config.", flush=True)
    print("="*65, flush=True)

    mongo.close()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()