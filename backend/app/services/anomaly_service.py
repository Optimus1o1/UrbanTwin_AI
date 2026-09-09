from typing import List
from datetime import datetime
from app.models.schemas import Anomaly

ANOMALIES_DB: List[Anomaly] = [
    Anomaly(
        anomaly_id="ANM-001",
        camera_id="CAM_01",
        road_id="ROAD-A-B",
        road_name="MG Road - Trinity Corridor",
        anomaly_type="Sudden Slowdown",
        severity="HIGH",
        expected_speed_kmh=42.0,
        current_speed_kmh=19.0,
        anomaly_score=0.94,
        timestamp=datetime.utcnow().isoformat()
    ),
    Anomaly(
        anomaly_id="ANM-002",
        camera_id="CAM_03",
        road_id="ROAD-C-D",
        road_name="Intermediate Ring Road - Koramangala",
        anomaly_type="Abnormal Queue Length",
        severity="MEDIUM",
        expected_speed_kmh=38.0,
        current_speed_kmh=22.0,
        anomaly_score=0.82,
        timestamp=datetime.utcnow().isoformat()
    ),
    Anomaly(
        anomaly_id="ANM-003",
        camera_id="CAM_05",
        road_id="ROAD-E-F",
        road_name="Outer Ring Road - Bellandur Tech Corridor",
        anomaly_type="Camera Video Frame Rate Drop",
        severity="LOW",
        expected_speed_kmh=45.0,
        current_speed_kmh=31.0,
        anomaly_score=0.68,
        timestamp=datetime.utcnow().isoformat()
    )
]

def get_active_anomalies() -> List[Anomaly]:
    return ANOMALIES_DB
