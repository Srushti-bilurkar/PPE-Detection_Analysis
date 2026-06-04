# config.py
# ─────────────────────────────────────────────────────────────────────────────
# All hardcoded / machine-specific configuration lives here.
# Change these values when deploying to a new machine or environment.
# ─────────────────────────────────────────────────────────────────────────────

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=r"C:\Users\srustib\Desktop\yolo-frontend\.env")

# ── Paths ──────────────────────────────────────────────────────────────────────
COLLAGE_BASE_DIR = Path(r"C:\Users\srustib\Desktop\L-T-project-L-T_Dashboard\collages")

# ── MongoDB ────────────────────────────────────────────────────────────────────
MONGO_URI = "mongodb://localhost:27017"
MONGO_DB  = "construction_monitor"
IMAGES_DB = "yolo_images"

# ── Camera RTSP streams ────────────────────────────────────────────────────────
CAMERAS = {
    "CAM-A01": "rtsp://admin:admin%40123@106.51.96.174:16389/cam/realmonitor?channel=1&subtype=0",
    "CAM-A02": "rtsp://admin:admin%40123@106.51.96.174:16388/cam/realmonitor?channel=1&subtype=0",
    "CAM-A03": "rtsp://admin:admin%40123@106.51.96.174:16387/cam/realmonitor?channel=1&subtype=0",
    "CAM-A07": "rtsp://admin:admin%40123@106.51.96.174:16386/cam/realmonitor?channel=1&subtype=0",
}

# ── Server ─────────────────────────────────────────────────────────────────────
API_HOST     = "0.0.0.0"
API_PORT     = 8000
FRONTEND_URL = "http://localhost:5173"