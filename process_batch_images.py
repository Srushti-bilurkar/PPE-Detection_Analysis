# =============================================================================
#  process_batch_images.py
#  Reads batch images from yolo_images.images → Groq PPE analysis
#  → saves results to construction_monitor (ppe_results, violations, alerts)
# =============================================================================

import groq, json, sys, time, re
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId

# ── CONFIG ────────────────────────────────────────────────────────────────────
GROQ_API_KEY  = "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"
API_DELAY     = 0.5      # seconds between Groq calls
MAX_RETRIES   = 3
SKIP_EMPTY    = True   # skip batches with 0 persons (saves API calls)

# ── MONGODB ───────────────────────────────────────────────────────────────────
mongo         = MongoClient("mongodb://localhost:27017")

# Source — your batch images
images_col    = mongo["yolo_images"]["images"]

# Destination — construction_monitor (same DB your dashboard reads from)
db            = mongo["construction_monitor"]
ppe_results_col = db["ppe_results"]
violations_col  = db["violations"]
alerts_col      = db["alerts"]

# ── GROQ CLIENT ───────────────────────────────────────────────────────────────
client_groq = groq.Groq(api_key=GROQ_API_KEY)

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


# ── PARSE WAIT TIME ───────────────────────────────────────────────────────────
def parse_wait_seconds(error_str: str) -> float:
    m = re.search(r"try again in (\d+)m([\d.]+)s", error_str)
    if m:
        return int(m.group(1)) * 60 + float(m.group(2)) + 2.0
    m = re.search(r"try again in ([\d.]+)s", error_str)
    if m:
        return float(m.group(1)) + 1.5
    return API_DELAY


# ── CALL GROQ ─────────────────────────────────────────────────────────────────
def call_groq(image_b64: str):
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
            is_tpd  = "tokens per day" in err_str or wait > 60

            if is_tpd:
                print(f"  🚫 Daily limit hit — waiting {wait:.0f}s ({wait/60:.1f} min)...")
                time.sleep(wait)
                print("  ✅ Resuming...")
                continue

            if attempt < MAX_RETRIES - 1:
                print(f"  ⏳ Rate limit — waiting {wait:.1f}s...")
                time.sleep(wait)
            else:
                raise

    raise RuntimeError("Max retries exceeded")


# ── PARSE RESPONSE ────────────────────────────────────────────────────────────
def parse_response(response, image_doc: dict) -> dict:
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
    result["camera"]           = f"Batch_{image_doc['batchNumber']:02d}"
    result["source_id"]        = str(image_doc["_id"])
    result["source_type"]      = "batch_image"
    result["batch_number"]     = image_doc.get("batchNumber")
    result["img_range"]        = image_doc.get("imgRange")
    result["timestamp"]        = f"{image_doc.get('date', datetime.now().strftime('%Y-%m-%d'))}T{datetime.now().strftime('%H:%M:%S')}"

    return result


# ── SAVE TO MONGODB ───────────────────────────────────────────────────────────
def save_results(result: dict):
    # Save to ppe_results
    ppe_results_col.insert_one(result.copy())

    # Save each violation + alert
    for person in result.get("persons", []):
        if person.get("status") == "violation":
            missing = person.get("missing", [])

            violations_col.insert_one({
                "source_id":    result["source_id"],
                "source_type":  "batch_image",
                "camera":       result["camera"],
                "worker_id":    f"W-{person.get('id', '?')}",
                "missing":      missing,
                "timestamp":    result["timestamp"],
                "batch_number": result["batch_number"],
                "img_range":    result["img_range"],
                "alert_sent":   False,
            })

            alerts_col.insert_one({
                "type":         "PPE_VIOLATION",
                "severity":     "critical" if len(missing) > 1 else "warning",
                "message":      f"Missing: {', '.join(missing)} — {result['camera']}",
                "camera":       result["camera"],
                "worker_id":    f"W-{person.get('id')}",
                "source_id":    result["source_id"],
                "source_type":  "batch_image",
                "batch_number": result["batch_number"],
                "img_range":    result["img_range"],
                "timestamp":    result["timestamp"],
                "acknowledged": False,
            })


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":

    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║   🦺  Batch Image PPE Processor                          ║")
    print("╚══════════════════════════════════════════════════════════╝\n")

    # Check MongoDB
    try:
        mongo.admin.command("ping")
        print("✅  MongoDB connected\n")
    except Exception as e:
        print(f"❌  Cannot connect to MongoDB: {e}")
        sys.exit(1)

    # Fetch all unprocessed images
    query = {"ppe_processed": {"$ne": True}}
    if SKIP_EMPTY:
        query["personCount"] = {"$gt": 0}

    images = list(images_col.find(query).sort("batchNumber", 1))
    total  = images_col.count_documents({})
    skip   = images_col.count_documents({"personCount": 0}) if SKIP_EMPTY else 0

    print(f"  📦 Total images in DB   : {total}")
    print(f"  ⏭  Skipping (0 persons) : {skip}")
    print(f"  🔍 Will process         : {len(images)}")
    print(f"  ⏱  Est. time            : ~{len(images) * API_DELAY // 60} min\n")

    if len(images) == 0:
        print("✅  Nothing to process!")
        sys.exit(0)

    processed  = 0
    violations = 0
    errors     = 0

    for i, img_doc in enumerate(images, 1):
        batch_num    = img_doc.get("batchNumber", "?")
        img_range    = img_doc.get("imgRange", "?")
        person_count = img_doc.get("personCount", 0)

        print(f"  [{i:02d}/{len(images)}] Batch #{batch_num}  imgs {img_range}  ({person_count} persons)")

        try:
            response = call_groq(img_doc["data"])
            result   = parse_response(response, img_doc)

            p = result["total_persons"]
            s = result["total_safe"]
            v = result["total_violations"]

            print(f"         👷 {p} persons  ✅ {s} safe  🚨 {v} violation(s)")

            save_results(result)

            # Mark as processed in yolo_images
            images_col.update_one(
                {"_id": img_doc["_id"]},
                {"$set": {
                    "ppe_processed":  True,
                    "ppe_persons":    p,
                    "ppe_safe":       s,
                    "ppe_violations": v,
                }}
            )

            processed  += 1
            violations += v

        except json.JSONDecodeError:
            print(f"         ❌ Invalid JSON response — skipping")
            errors += 1

        except Exception as e:
            print(f"         ❌ Error: {e} — skipping")
            errors += 1

        # Delay between API calls
        if i < len(images):
            time.sleep(API_DELAY)

    print(f"\n╔══════════════════════════════════════════════╗")
    print(f"║  ✅  DONE!                                    ║")
    print(f"║  Processed  : {processed:<28} ║")
    print(f"║  Violations : {violations:<28} ║")
    print(f"║  Errors     : {errors:<28} ║")
    print(f"╚══════════════════════════════════════════════╝\n")
    print("  👉 Open your dashboard — violations & alerts are now live!")