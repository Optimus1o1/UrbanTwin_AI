"""
Automated Pytest Suite for Real-Time Vehicle Anomaly & Pattern-of-Life Radar
Tests unsupervised behavioral AI detection for:
1. Plate Swapping / Cloning (Impossible velocity delta)
2. Tactical Convoys / Following Behavior (Headway correlation)
3. Surveillance Loitering Vectors (Repetitive graph circularity)
"""

from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.schemas import BehavioralThreatType, BehavioralThreatSeverity
from app.services.behavioral_radar_service import BehavioralRadarService, haversine_km

client = TestClient(app)

def test_get_radar_threats():
    """Verify retrieval of active behavioral anomaly threats from the radar feed."""
    res = client.get("/api/v1/anomalies/radar/threats")
    assert res.status_code == 200
    threats = res.json()
    assert len(threats) >= 3

    types = {t["threat_type"] for t in threats}
    assert BehavioralThreatType.PLATE_CLONING.value in types
    assert BehavioralThreatType.TACTICAL_CONVOY.value in types
    assert BehavioralThreatType.SURVEILLANCE_LOITERING.value in types

    # Check evidence structure
    first = threats[0]
    assert "threat_id" in first
    assert "evidence" in first
    assert "anomaly_z_score" in first["evidence"]
    assert first["evidence"]["anomaly_z_score"] >= 3.0
    assert "radar_angle_deg" in first
    assert "radar_distance_km" in first

def test_get_radar_stats():
    """Verify aggregate summary metrics of the radar scope."""
    res = client.get("/api/v1/anomalies/radar/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_active_threats"] >= 3
    assert stats["plate_clones_count"] >= 1
    assert stats["convoys_tracked_count"] >= 1
    assert stats["loitering_surveillance_count"] >= 1
    assert stats["mean_anomaly_score"] >= 3.0
    assert stats["radar_status"] == "ONLINE_SWEEPING"
    assert len(stats["high_threat_nodes"]) > 0

def test_plate_cloning_impossible_velocity_algorithm():
    """Verify algorithmic detector for impossible spatial-temporal velocity (teleportation fraud)."""
    now = datetime.now()
    # 22.4 km apart in 60 seconds -> 1344 km/h!
    t1 = now - timedelta(seconds=60)
    t2 = now

    threat = BehavioralRadarService.evaluate_plate_cloning_anomaly(
        plate="KA01TEST99",
        cam1="CAM_01",
        time1=t1,
        cam2="CAM_06",
        time2=t2
    )

    assert threat is not None
    assert threat.threat_type == BehavioralThreatType.PLATE_CLONING
    assert threat.severity == BehavioralThreatSeverity.CRITICAL
    assert threat.evidence.anomaly_z_score >= 5.0
    assert threat.evidence.model_confidence >= 0.95
    assert threat.evidence.details["calculated_velocity_kmh"] > 500.0

def test_simulate_threat_endpoints():
    """Verify operator simulation trigger for all 3 behavioral pattern categories."""
    # 1. Plate cloning simulation
    res_clone = client.post("/api/v1/anomalies/radar/simulate", json={
        "threat_type": "PLATE_CLONING",
        "primary_plate": "DL01SIM99"
    })
    assert res_clone.status_code == 200
    clone_data = res_clone.json()
    assert clone_data["threat_type"] == "PLATE_CLONING"
    assert clone_data["primary_plate"] == "DL01SIM99"
    assert clone_data["evidence"]["anomaly_z_score"] >= 4.5

    # 2. Tactical convoy simulation
    res_cnv = client.post("/api/v1/anomalies/radar/simulate", json={
        "threat_type": "TACTICAL_CONVOY",
        "primary_plate": "KA04CV01",
        "secondary_plate": "KA04CV02"
    })
    assert res_cnv.status_code == 200
    cnv_data = res_cnv.json()
    assert cnv_data["threat_type"] == "TACTICAL_CONVOY"
    assert cnv_data["primary_plate"] == "KA04CV01"
    assert cnv_data["secondary_plate"] == "KA04CV02"

    # 3. Loitering vector simulation
    res_loit = client.post("/api/v1/anomalies/radar/simulate", json={
        "threat_type": "SURVEILLANCE_LOITERING",
        "primary_plate": "KA02LT88"
    })
    assert res_loit.status_code == 200
    loit_data = res_loit.json()
    assert loit_data["threat_type"] == "SURVEILLANCE_LOITERING"
    assert loit_data["primary_plate"] == "KA02LT88"
    assert len(loit_data["cameras_involved"]) >= 3
