#!/usr/bin/env python3
"""
zone_aggregator.py
──────────────────
Run as a third process alongside index1.js and ppe_analyzer.py.

    python zone_aggregator.py

WHAT CHANGED vs previous version:
  - Removed all combined/final_quality/static_quality averaging logic.
  - Only writes live GPT confidence fields (avg_gpt_conf, avg_conf, etc.).
  - Static proximity config is NO LONGER loaded or used here.
  - Frontend can display Static (from camera_zone_quality) and Live (from zone_confidence) separately.
"""

import os
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════

MONGO_URL     = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME       = os.getenv("DB_NAME",   "construction_monitor")
POLL_INTERVAL = 5       # seconds between polls

FRAME_W = 1920
FRAME_H = 1080

GRID_COLS = 3
GRID_ROWS = 3

HIGH_THRESH   = 0.75
MEDIUM_THRESH = 0.50

# ══════════════════════════════════════════════════════════════════════════════
#  IST HELPERS
# ══════════════════════════════════════════════════════════════════════════════

IST = timezone(timedelta(hours=5, minutes=30))

def now_ist():
    return datetime.now(IST)

def now_ist_str():
    return now_ist().strftime("%Y-%m-%d %H:%M:%S IST")

def get_today_ist():
    return now_ist().strftime("%Y-%m-%d")

# ══════════════════════════════════════════════════════════════════════════════
#  IMPORTS
# ══════════════════════════════════════════════════════════════════════════════

print("="*65, flush=True)
print("  Zone Aggregator — building camera confidence heatmap", flush=True)
print("="*65, flush=True)

try:
    from pymongo import MongoClient, ASCENDING
    print("  OK: pymongo loaded", flush=True)
except ImportError:
    print("  ERROR: pip install pymongo", flush=True)
    import sys
    sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def confidence_tier(avg_conf: float) -> str:
    if avg_conf >= HIGH_THRESH:
        return "high"
    if avg_conf >= MEDIUM_THRESH:
        return "medium"
    return "low"


def bbox_center_to_zone(x1, y1, x2, y2,
                        frame_w=FRAME_W, frame_h=FRAME_H):
    """Convert a bounding box to a zone_id string like 'r1c2'."""
    if None in (x1, y1, x2, y2):
        return None
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    col = int(cx / (frame_w / GRID_COLS))
    row = int(cy / (frame_h / GRID_ROWS))
    col = min(col, GRID_COLS - 1)
    row = min(row, GRID_ROWS - 1)
    return f"r{row}c{col}"


# ══════════════════════════════════════════════════════════════════════════════
#  CORE: process one ppe_results document
# ══════════════════════════════════════════════════════════════════════════════

def process_ppe_result(doc, db, today: str) -> int:
    """
    Map every person in a ppe_results doc to a grid zone.
    Upsert zone_confidence for each (camera, zone_id, date).
    Only writes live GPT confidence fields — no combined/static averaging.
    Returns the number of persons successfully mapped.
    """
    camera   = doc.get("camera")
    ppe_list = doc.get("ppe", [])

    if not camera or not ppe_list:
        db.ppe_results.update_one(
            {"_id": doc["_id"]},
            {"$set": {"zone_processed": True}}
        )
        return 0

    snap_frame_w = FRAME_W
    snap_frame_h = FRAME_H

    # ── 1. Group persons by their zone ────────────────────────────────────────
    zone_persons = defaultdict(list)

    for person in ppe_list:
        zone_id = bbox_center_to_zone(
            person.get("x1"), person.get("y1"),
            person.get("x2"), person.get("y2"),
            frame_w=snap_frame_w, frame_h=snap_frame_h,
        )
        if zone_id is None:
            print(f"    SKIP {person.get('label')} — missing bbox", flush=True)
            continue

        helmet_conf = person.get("helmet_conf")
        vest_conf   = person.get("vest_conf")
        if helmet_conf is None or vest_conf is None:
            print(f"    SKIP {person.get('label')} — missing confidence", flush=True)
            continue

        zone_persons[zone_id].append({
            "label":        person.get("label"),
            "helmet_conf":  float(helmet_conf),
            "vest_conf":    float(vest_conf),
            "is_violation": person.get("violation_type", "none") != "none",
        })

    total_mapped = 0

    # ── 2. For each zone, compute averages and upsert ─────────────────────────
    for zone_id, persons in zone_persons.items():
        n          = len(persons)
        avg_helmet = round(sum(p["helmet_conf"] for p in persons) / n, 2)
        avg_vest   = round(sum(p["vest_conf"]   for p in persons) / n, 2)
        avg_conf   = round((avg_helmet + avg_vest) / 2, 2)
        violations = sum(1 for p in persons if p["is_violation"])

        existing = db.zone_confidence.find_one({
            "camera":  camera,
            "zone_id": zone_id,
            "date":    today,
        })

        if existing:
            # Running weighted average — refines over the day, never resets
            old_count  = existing.get("detection_count", 0)
            new_count  = old_count + n

            new_helmet = round(
                (existing.get("avg_helmet_conf", 0) * old_count + avg_helmet * n) / new_count, 2
            )
            new_vest = round(
                (existing.get("avg_vest_conf", 0) * old_count + avg_vest * n) / new_count, 2
            )
            new_avg  = round((new_helmet + new_vest) / 2, 2)
            new_tier = confidence_tier(new_avg)

            db.zone_confidence.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "avg_conf":         new_avg,
                    "avg_gpt_conf":     new_avg,
                    "avg_helmet_conf":  new_helmet,
                    "avg_vest_conf":    new_vest,
                    "confidence_tier":  new_tier,
                    "detection_count":  new_count,
                    "total_violations": existing.get("total_violations", 0) + violations,
                    "last_updated_ist": now_ist_str(),
                }}
            )
            print(
                f"    UPDATE zone={zone_id} | +{n} persons total={new_count} | "
                f"gpt={new_avg:.2f} tier={new_tier}",
                flush=True
            )
        else:
            # First observation for this zone today
            tier = confidence_tier(avg_conf)
            db.zone_confidence.insert_one({
                "camera":           camera,
                "zone_id":          zone_id,
                "date":             today,
                "avg_conf":         avg_conf,
                "avg_gpt_conf":     avg_conf,
                "avg_helmet_conf":  avg_helmet,
                "avg_vest_conf":    avg_vest,
                "confidence_tier":  tier,
                "detection_count":  n,
                "total_violations": violations,
                "grid_cols":        GRID_COLS,
                "grid_rows":        GRID_ROWS,
                "frame_w":          snap_frame_w,
                "frame_h":          snap_frame_h,
                "created_at_ist":   now_ist_str(),
                "last_updated_ist": now_ist_str(),
            })
            print(
                f"    INSERT zone={zone_id} | n={n} | "
                f"gpt={avg_conf:.2f} tier={tier}",
                flush=True
            )

        total_mapped += n

    # ── 3. Mark as zone-processed ─────────────────────────────────────────────
    db.ppe_results.update_one(
        {"_id": doc["_id"]},
        {"$set": {"zone_processed": True}}
    )

    return total_mapped


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN LOOP
# ══════════════════════════════════════════════════════════════════════════════

def main():
    print(f"\n  Grid      : {GRID_ROWS} rows x {GRID_COLS} cols = {GRID_ROWS*GRID_COLS} zones/camera", flush=True)
    print(f"  Frame     : {FRAME_W}x{FRAME_H}px", flush=True)
    print(f"  Thresholds: high>={HIGH_THRESH}  medium>={MEDIUM_THRESH}  low<{MEDIUM_THRESH}", flush=True)
    print(f"  Poll      : every {POLL_INTERVAL}s", flush=True)
    print("="*65, flush=True)

    mongo = MongoClient(MONGO_URL)
    db    = mongo[DB_NAME]

    # Indexes — safe to run every startup
    db.zone_confidence.create_index(
        [("camera", ASCENDING), ("zone_id", ASCENDING), ("date", ASCENDING)],
        unique=True,
        name="camera_zone_date_unique"
    )
    db.ppe_results.create_index(
        [("zone_processed", ASCENDING)],
        name="zone_processed_idx"
    )
    print("  Indexes ready", flush=True)
    print("="*65, flush=True)

    while True:
        try:
            today   = get_today_ist()
            pending = list(
                db.ppe_results.find({
                    "$or": [
                        {"zone_processed": False},
                        {"zone_processed": {"$exists": False}},
                    ]
                }).sort("analyzed_at_ist", ASCENDING)
            )

            if not pending:
                print(
                    f"  Waiting for ppe_results ...  [{now_ist_str()}]",
                    end="\r", flush=True
                )
                time.sleep(POLL_INTERVAL)
                continue

            print(f"\n  Found {len(pending)} unzoned ppe_result(s)", flush=True)
            grand_total = 0

            for doc in pending:
                snap_id = doc.get("snap_id", "?")
                camera  = doc.get("camera",  "?")
                persons = doc.get("total_persons_count", len(doc.get("ppe", [])))
                print(f"\n  snap_id={snap_id}  camera={camera}  persons={persons}", flush=True)
                mapped = process_ppe_result(doc, db, today)
                grand_total += mapped

            print(f"\n  Done: {grand_total} persons mapped to zones.", flush=True)

        except KeyboardInterrupt:
            print("\n\n  Shutting down zone aggregator...", flush=True)
            mongo.close()
            break
        except Exception as e:
            print(f"\n  ERROR: {e}", flush=True)
            import traceback
            traceback.print_exc()

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()