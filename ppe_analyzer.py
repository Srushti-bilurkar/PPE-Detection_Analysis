#!/usr/bin/env python3
"""
ppe_analyzer.py
───────────────
Polls MongoDB collages collection every 1s →
sends ENTIRE collage image to GPT-4o in ONE API call →
analyzes PPE → groups results by snap_id →
saves ONE ppe_results document per original snapshot.
 
Collections written:
  ppe_results  — one doc per snapshot
  token_usage  — one doc per collage
"""
 
import os
import sys
import base64
import json
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
 
load_dotenv()
 
# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════
 
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MONGO_URL      = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME        = os.getenv("DB_NAME",   "construction_monitor")
POLL_INTERVAL  = 1
MODEL          = "gpt-4o"
MAX_TOKENS     = 800
JPEG_QUALITY   = 85
RESIZE_WIDTH   = 1200
 
IST = timezone(timedelta(hours=5, minutes=30))
 
def now_ist():
    return datetime.now(IST)
 
def now_ist_str():
    return now_ist().strftime("%Y-%m-%d %H:%M:%S IST")
 
def to_ist(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)
 
def format_ist(dt=None):
    if dt is None:
        return now_ist_str()
    return to_ist(dt).strftime("%Y-%m-%d %H:%M:%S IST")
 
# ══════════════════════════════════════════════════════════════════════════════
#  IMPORTS
# ══════════════════════════════════════════════════════════════════════════════
 
print("="*65, flush=True)
print("  PPE Analyzer — 1s fast poll mode", flush=True)
print("="*65, flush=True)
 
try:
    from openai import OpenAI
    print("  OK: openai loaded", flush=True)
except ImportError:
    print("  ERROR: pip install openai", flush=True)
    sys.exit(1)
 
try:
    import cv2
    import numpy as np
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
 
# ══════════════════════════════════════════════════════════════════════════════
#  PPE PROMPT
# ══════════════════════════════════════════════════════════════════════════════
 
COLLAGE_PROMPT = """This image is a grid of construction worker crops.
Each cell shows ONE worker. The label is at the bottom of each cell.
 
For EVERY visible person apply these rules:
 
HELMET DETECTION — THE ONLY RULE THAT MATTERS:
Look at the TOP OF THE HEAD AREA of each person.
 
  helmet:true  → if you see ANY of these colors on/above the head:
                 YELLOW, LIME GREEN, BLUE, ORANGE, WHITE, RED, PURPLE
                 Even partial, blurry, or rear-view colored shape = true
 
  helmet:false → if the top of the head is:
                 DARK (black/brown hair), BARE SKIN, or NO COLOR visible
                 A dark round head shape with no colored hat = false
 
  THE KEY QUESTION: "Is there a non-dark colored shape on this person's head?"
  YES → helmet:true
  NO  → helmet:false
 
VEST RULES:
- vest:true if ORANGE or GREEN reflective vest is visible ANYWHERE on the body
- This includes front, sides, edges, shoulders, or partial view of vest
- vest:false ONLY if entire visible torso shows plain dark/neutral clothing with NO orange or GREEN anywhere
- vest:false if uncertain
RULE: Base your answer ONLY on visible color at head and torso.
Do not overthink — just check: colored head? colored torso?
 
CONFIDENCE SCORES:
For each person also provide helmet_conf and vest_conf — your confidence from 0.0 to 1.0.
IMPORTANT: Always write confidence with exactly 2 decimal places.
           Write 0.60 not 0.6, write 0.85 not 0.8, write 1.00 not 1.0
 
Use these guidelines for confidence:
  0.90 - 1.00 → clear front view, good lighting, distinct colors
  0.70 - 0.89 → partial view, slightly blurry, or ambiguous color
  0.50 - 0.69 → rear/side view, poor lighting, very small or occluded crop
  below 0.50  → extremely unclear, barely visible
 
Return ONLY a JSON array:
[
  {"label":"Img1-P1","helmet":true,"helmet_conf":0.95,"vest":true,"vest_conf":0.88},
  {"label":"Img1-P2","helmet":false,"helmet_conf":0.60,"vest":true,"vest_conf":0.75},
  ...
]
Skip blank cells. Include ALL visible persons."""
 
# ══════════════════════════════════════════════════════════════════════════════
#  TERMINAL PRINT HELPERS
# ══════════════════════════════════════════════════════════════════════════════
 
LINE_W = 65
 
def box_top():  print(f"\n  ╔{'═'*LINE_W}╗", flush=True)
def box_mid():  print(f"  ╠{'═'*LINE_W}╣", flush=True)
def box_bot():  print(f"  ╚{'═'*LINE_W}╝", flush=True)
 
def box_line(t=""):
    print(f"  ║  {t}{' '*max(0, LINE_W - len(t) - 2)}║", flush=True)
 
def print_collage_header(collage_num, collage_id):
    box_top()
    box_line(f"COLLAGE {collage_num:02d}  _id={collage_id}")
    box_line(f"Mode: 1s fast poll — picked up within 1s of insert")
    box_mid()
 
def print_collage_summary(persons, safe, violations, prompt_tok, output_tok, total_tok):
    box_line(f"Persons : {persons}   Safe : {safe}   Violations : {violations}")
    box_line(f"Tokens  : {prompt_tok} prompt + {output_tok} output = {total_tok} total")
    box_mid()
 
def print_person(label, helmet, vest, status, missing, helmet_conf, vest_conf):
    h  = "✓" if helmet else "✗"
    v  = "✓" if vest   else "✗"
    hc = f"{helmet_conf*100:.0f}%" if helmet_conf is not None else "N/A"
    vc = f"{vest_conf*100:.0f}%"   if vest_conf   is not None else "N/A"
    if status == "safe":
        box_line(f"  {label:<18} helmet:{h}({hc})  vest:{v}({vc})  → SAFE")
    else:
        box_line(f"  *** {label:<15} helmet:{h}({hc})  vest:{v}({vc})  → VIOLATION  missing: {', '.join(missing)}")
 
def print_footer():
    box_bot()
 
 
# ══════════════════════════════════════════════════════════════════════════════
#  BUILD COLLAGE JPEG
# ══════════════════════════════════════════════════════════════════════════════
 
def build_collage_jpeg(collage_doc: dict) -> str:
    if collage_doc.get("image_b64"):
        img_bytes = base64.b64decode(collage_doc["image_b64"])
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        img       = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if img is not None:
            h, w = img.shape[:2]
            if w > RESIZE_WIDTH:
                scale = RESIZE_WIDTH / w
                img   = cv2.resize(img, (RESIZE_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)
            _, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            return base64.b64encode(buf.tobytes()).decode("utf-8")
 
    persons_meta = collage_doc.get("persons_meta", [])
    if not persons_meta:
        raise ValueError("No image_b64 and no persons_meta crops to rebuild from")
 
    CELL_W, CELL_H, COLS, ROWS, LABEL_H = 200, 260, 3, 3, 28
    grid = np.zeros((ROWS * CELL_H, COLS * CELL_W, 3), dtype=np.uint8)
 
    for idx, p in enumerate(persons_meta[:COLS * ROWS]):
        row = idx // COLS
        col = idx %  COLS
        img_bytes = base64.b64decode(p["crop_b64"])
        crop      = cv2.imdecode(np.frombuffer(img_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if crop is None:
            continue
        crop_resized  = cv2.resize(crop, (CELL_W, CELL_H - LABEL_H), interpolation=cv2.INTER_AREA)
        label_strip   = np.ones((LABEL_H, CELL_W, 3), dtype=np.uint8) * 255
        cv2.putText(label_strip, p.get("label", f"Img{idx+1}-P1"),
                    (4, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2, cv2.LINE_AA)
        grid[row * CELL_H:(row + 1) * CELL_H, col * CELL_W:(col + 1) * CELL_W] = np.vstack([crop_resized, label_strip])
 
    h, w = grid.shape[:2]
    if w > RESIZE_WIDTH:
        scale = RESIZE_WIDTH / w
        grid  = cv2.resize(grid, (RESIZE_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)
 
    _, buf = cv2.imencode(".jpg", grid, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    return base64.b64encode(buf.tobytes()).decode("utf-8")
 
 
# ══════════════════════════════════════════════════════════════════════════════
#  FUZZY LABEL MATCHER
# ══════════════════════════════════════════════════════════════════════════════
 
def find_meta(gpt_label: str, meta_by_label: dict) -> dict:
    if gpt_label in meta_by_label:
        return meta_by_label[gpt_label]
    norm_gpt = gpt_label.lower().replace(" ", "").replace("-", "")
    for stored_label, meta in meta_by_label.items():
        if stored_label.lower().replace(" ", "").replace("-", "") == norm_gpt:
            print(f"  ⚠  Fuzzy matched '{gpt_label}' → '{stored_label}'", flush=True)
            return meta
    print(f"  ❌ No match for GPT label: '{gpt_label}'", flush=True)
    print(f"     Available labels: {list(meta_by_label.keys())}", flush=True)
    return {}
 
 
# ══════════════════════════════════════════════════════════════════════════════
#  SAFE CONF PARSER — always returns float rounded to 2 decimal places
# ══════════════════════════════════════════════════════════════════════════════
 
def parse_conf(value) -> float:
    """
    Safely parse a confidence value from GPT-4o response.
    Always returns a float rounded to 2 decimal places.
 
    Examples:
      0.6  → 0.60
      0.8  → 0.80
      0.95 → 0.95
      None → 0.00
    """
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.00
 
 
# ══════════════════════════════════════════════════════════════════════════════
#  SINGLE GPT-4o CALL
# ══════════════════════════════════════════════════════════════════════════════
 
def analyze_collage(client, collage_b64: str):
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        temperature=0,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{collage_b64}", "detail": "high"}},
                {"type": "text",      "text": COLLAGE_PROMPT}
            ]
        }]
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = "\n".join(l for l in raw.split("\n") if not l.strip().startswith("```")).strip()
    return json.loads(raw), response.usage
 
 
# ══════════════════════════════════════════════════════════════════════════════
#  PROCESS ONE COLLAGE
# ══════════════════════════════════════════════════════════════════════════════
 
def process_collage(collage, db, client):
    collage_id    = collage["_id"]
    collage_num   = collage["collage_num"]
    persons_meta  = collage.get("persons_meta", [])
    meta_by_label = {p["label"]: p for p in persons_meta}
 
    print_collage_header(collage_num, collage_id)
    print(f"  Stored labels : {list(meta_by_label.keys())}", flush=True)
    print(f"  Received at   : {now_ist_str()}", flush=True)
 
    # ── Build JPEG ────────────────────────────────────────────────────────────
    try:
        collage_b64 = build_collage_jpeg(collage)
    except Exception as e:
        box_line(f"ERROR building collage image: {e}")
        print_footer()
        return
 
    # ── ONE GPT-4o call ───────────────────────────────────────────────────────
    t0 = time.time()
    try:
        gpt_persons, usage = analyze_collage(client, collage_b64)
    except Exception as e:
        box_line(f"ERROR calling GPT-4o: {e}")
        print_footer()
        return
 
    elapsed_api = time.time() - t0
    print(f"  GPT-4o response in {elapsed_api:.1f}s", flush=True)
    print(f"  GPT labels    : {[p.get('label') for p in gpt_persons]}", flush=True)
 
    prompt_tokens = usage.prompt_tokens
    output_tokens = usage.completion_tokens
    total_tokens  = usage.total_tokens
 
    # ── Merge GPT results with persons_meta ───────────────────────────────────
    analyzed = []
    for gpt in gpt_persons:
        label       = gpt.get("label", "")
        helmet      = gpt.get("helmet", True)
        vest        = gpt.get("vest",   True)
 
        # parse_conf guarantees 2 decimal float e.g. 0.6 → 0.60, None → 0.00
        helmet_conf = parse_conf(gpt.get("helmet_conf"))
        vest_conf   = parse_conf(gpt.get("vest_conf"))
 
        missing     = (["Hat"] if not helmet else []) + (["Vest"] if not vest else [])
        meta        = find_meta(label, meta_by_label)
 
        analyzed.append({
            "label":       label,
            "helmet":      helmet,
            "helmet_conf": helmet_conf,
            "vest":        vest,
            "vest_conf":   vest_conf,
            "missing":     missing,
            "status":      "violation" if missing else "safe",
            "camera":      meta.get("camera"),
            "snap_id":     meta.get("snap_id"),
            "camera_ts":   meta.get("snap_timestamp_ist"),
            "bbox": {
                "x1": meta.get("x1"), "y1": meta.get("y1"),
                "x2": meta.get("x2"), "y2": meta.get("y2"),
            },
        })
 
    total_safe       = sum(1 for p in analyzed if p["status"] == "safe")
    total_violations = sum(1 for p in analyzed if p["status"] == "violation")
 
    print_collage_summary(len(analyzed), total_safe, total_violations,
                          prompt_tokens, output_tokens, total_tokens)
    for p in analyzed:
        print_person(
            p["label"], p["helmet"], p["vest"], p["status"], p["missing"],
            p.get("helmet_conf"), p.get("vest_conf")
        )
    print_footer()
 
    # ── Group by snap_id → one ppe_results doc per snapshot ───────────────────
    groups = defaultdict(list)
    for person in analyzed:
        if person["snap_id"] is not None:
            groups[person["snap_id"]].append(person)
 
    print(f"\n  Saving {len(groups)} ppe_results document(s)...", flush=True)
    saved_result_ids = []
 
    for snap_id, persons_in_snap in groups.items():
        camera    = persons_in_snap[0]["camera"]
        camera_ts = persons_in_snap[0]["camera_ts"]
 
        ppe_entries = []
        for p in persons_in_snap:
            if not p["missing"]:
                continue
            bbox = p.get("bbox", {})
            ppe_entries.append({
                "label":          p["label"],
                "collage_num":    collage_num,
                "violation":      p["missing"],
                "violation_type": (
                    "both_missing" if len(p["missing"]) == 2
                    else "no_helmet" if "Hat" in p["missing"]
                    else "no_vest"
                ),
                # 2 decimal float — frontend can display as % e.g. 0.60 → 60%
                "helmet_conf":    p.get("helmet_conf"),
                "vest_conf":      p.get("vest_conf"),
                "x1": bbox.get("x1"), "y1": bbox.get("y1"),
                "x2": bbox.get("x2"), "y2": bbox.get("y2"),
            })
 
        ppe_result_doc = {
            "camera":                camera,
            "camera_ts":             camera_ts,
            "snap_id":               snap_id,
            "total_persons_count":   len(persons_in_snap),
            "total_violation_count": len(ppe_entries),
            "ppe":                   ppe_entries,
            "analyzed_at_ist":       now_ist_str(),
        }
 
        result = db.ppe_results.insert_one(ppe_result_doc)
        saved_result_ids.append(result.inserted_id)
        print(f"  → Saved  camera={camera}  snap_id={snap_id}  "
              f"persons={len(persons_in_snap)}  violations={len(ppe_entries)}", flush=True)
 
    # ── Token usage ───────────────────────────────────────────────────────────
    db.token_usage.insert_one({
        "collage_id":       collage_id,
        "collage_num":      collage_num,
        "ppe_result_ids":   saved_result_ids,
        "api_calls":        1,
        "persons_analyzed": len(analyzed),
        "prompt_tokens":    prompt_tokens,
        "output_tokens":    output_tokens,
        "total_tokens":     total_tokens,
        "model":            MODEL,
        "recorded_at":      now_ist_str(),
    })
 
    print(f"\n  Token usage → token_usage collection", flush=True)
    print(f"    prompt={prompt_tokens}  output={output_tokens}  total={total_tokens}", flush=True)
 
    # ── Mark collage analyzed ─────────────────────────────────────────────────
    db.collages.update_one(
        {"_id": collage_id},
        {"$set": {
            "analyzed":        True,
            "analyzed_at_ist": now_ist_str(),
        }}
    )
    print(f"  Collage marked analyzed ✓", flush=True)
 
 
# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════
 
def main():
    if not OPENAI_API_KEY:
        print("  ERROR: OPENAI_API_KEY not set in .env", flush=True)
        sys.exit(1)
 
    print("\n  Connecting to MongoDB...", flush=True)
    mongo  = MongoClient(MONGO_URL)
    db     = mongo[DB_NAME]
    print(f"  OK: MongoDB — {DB_NAME}", flush=True)
 
    print("  Connecting to OpenAI...", flush=True)
    client = OpenAI(api_key=OPENAI_API_KEY)
    print(f"  OK: OpenAI — {MODEL}", flush=True)
 
    print(f"\n  Mode          : fast poll every {POLL_INTERVAL}s", flush=True)
    print(f"  Worst case    : {POLL_INTERVAL}s wait + ~2s GPT = ~{POLL_INTERVAL+2}s total", flush=True)
    print(f"  Timezone      : IST (UTC+5:30) — stored as strings", flush=True)
    print("="*65, flush=True)
 
    while True:
        try:
            unanalyzed = list(
                db.collages.find({
                    "$or": [
                        {"analyzed": False},
                        {"analyzed": {"$exists": False}}
                    ]
                }).sort("created_at_ist", 1)
            )
 
            if not unanalyzed:
                print("  Waiting for collages...", end="\r", flush=True)
                time.sleep(POLL_INTERVAL)
                continue
 
            print(f"\n  Found {len(unanalyzed)} unanalyzed collage(s) — processing now", flush=True)
            for collage in unanalyzed:
                process_collage(collage, db, client)
 
        except KeyboardInterrupt:
            print("\n\n  Shutting down PPE analyzer...", flush=True)
            mongo.close()
            break
        except Exception as e:
            print(f"\n  ERROR: {e}", flush=True)
            import traceback
            traceback.print_exc()
 
        time.sleep(POLL_INTERVAL)
 
 
if __name__ == "__main__":
    main()
 