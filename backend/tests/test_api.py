import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import anonymize_plate

client = TestClient(app)

def test_root_and_health():
    # Test root 3D Homepage HTML
    response = client.get("/")
    assert response.status_code == 200
    assert "UrbanTwin" in response.text
    assert "3D AI" in response.text or "3D" in response.text
    assert "X-Frame-Options" in response.headers
    assert response.headers["X-Frame-Options"] == "SAMEORIGIN"

    # Test /dashboard and /ui routes
    res_dash = client.get("/dashboard")
    assert res_dash.status_code == 200
    assert "UrbanTwin" in res_dash.text

    res_ui = client.get("/ui")
    assert res_ui.status_code == 200

    # Test health check JSON
    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"


def test_anpr_plate_anonymization_security():
    plate = "7XYZ912"
    anon1 = anonymize_plate(plate)
    anon2 = anonymize_plate(plate)
    assert anon1.startswith("PLT-")
    assert anon1 == anon2  # Deterministic with salt
    assert plate not in anon1  # Ensures PII raw plate is never present in hash

def test_auth_login():
    # Valid login
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    assert "access_token" in res.json()

    # Invalid login
    res_bad = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrongpassword"})
    assert res_bad.status_code == 401

def test_cameras_endpoint():
    res = client.get("/api/v1/cameras")
    assert res.status_code == 200
    cameras = res.json()
    assert len(cameras) >= 6
    assert cameras[0]["camera_id"] == "CAM_01"

def test_process_camera_frame():
    res = client.post("/api/v1/cameras/CAM_01/process")
    assert res.status_code == 200
    data = res.json()
    assert data["camera_id"] == "CAM_01"
    assert len(data["detections"]) > 0
    assert "sample_plate_observation" in data
    assert data["sample_plate_observation"]["plate_hash"].startswith("PLT-")

def test_traffic_current_and_history():
    res_curr = client.get("/api/v1/traffic/current")
    assert res_curr.status_code == 200
    assert len(res_curr.json()) > 0

    res_hist = client.get("/api/v1/traffic/history")
    assert res_hist.status_code == 200
    assert len(res_hist.json()) == 12

def test_vehicle_trajectory():
    res = client.get("/api/v1/vehicles/V1023/trajectory")
    assert res.status_code == 200
    traj = res.json()
    assert traj["global_vehicle_id"] == "V1023"
    assert traj["final_score"] == 0.91

def test_traffic_predictions():
    res = client.get("/api/v1/predictions")
    assert res.status_code == 200
    preds = res.json()
    assert len(preds) > 0
    assert len(preds[0]["horizons"]) == 3  # 5, 15, 30 min

def test_anomalies_endpoint():
    res = client.get("/api/v1/anomalies")
    assert res.status_code == 200
    assert len(res.json()) > 0

def test_whatif_simulation():
    payload = {
        "closed_roads": ["ROAD-A-B"],
        "traffic_volume_change_pct": 20.0,
        "signal_timing_adjustments": {"Junction_Trinity": 40}
    }
    res = client.post("/api/v1/simulation", json=payload)
    assert res.status_code == 200
    sim = res.json()
    assert "scenario_id" in sim
    assert len(sim["metrics"]) == 3

def test_interactive_swagger_and_redoc():
    # Test Swagger UI
    res_docs = client.get("/docs")
    assert res_docs.status_code == 200
    assert "swagger-ui" in res_docs.text
    assert "persistAuthorization" in res_docs.text
    assert "tryItOutEnabled" in res_docs.text

    # Test ReDoc
    res_redoc = client.get("/redoc")
    assert res_redoc.status_code == 200
    assert "redoc" in res_redoc.text

    # Test OpenAPI schema
    res_openapi = client.get("/openapi.json")
    assert res_openapi.status_code == 200
    schema = res_openapi.json()
    
    # Verify security schemes present for Swagger UI Authorize dialog
    assert "components" in schema
    assert "securitySchemes" in schema["components"]
    assert "BearerAuth" in schema["components"]["securitySchemes"]
    assert "OAuth2PasswordBearer" in schema["components"]["securitySchemes"]
    assert "security" in schema

    # Verify static routes are not polluting OpenAPI specification
    paths = schema["paths"]
    assert "/" not in paths
    assert "/dashboard" not in paths
    assert "/ui" not in paths
    assert "/app" not in paths

    # Verify real API routes are cleanly documented
    assert "/api/v1/cameras" in paths
    assert "/api/v1/simulation" in paths

def test_no_github_links_in_ui():
    res = client.get("/")
    assert res.status_code == 200
    # Confirm no github references in landing page
    assert "github.com" not in res.text
    assert "fa-brands fa-github" not in res.text
    # Confirm Swagger and ReDoc links are present
    assert "/docs" in res.text
    assert "/redoc" in res.text

    # Confirm dashboard has links to /docs and /redoc
    res_dash = client.get("/dashboard")
    assert res_dash.status_code == 200
    assert "/docs" in res_dash.text
    assert "/redoc" in res_dash.text


def test_ocr_engine_accuracy_greater_than_90():
    # Test OCR under clean condition
    res_clean = client.post("/api/v1/cameras/ocr_test", json={"plate_text": "7XYZ912", "degradation": "clean", "vehicle_speed_kmh": 60})
    assert res_clean.status_code == 200
    data_clean = res_clean.json()
    assert data_clean["overall_accuracy_pct"] >= 90.0
    assert data_clean["passes_90_pct_threshold"] is True
    assert len(data_clean["character_breakdown"]) == 7

    # Test OCR under degraded conditions (rain, headlight glare, motion blur)
    for deg in ["rain", "glare", "motion_blur", "dirty", "oblique_angle"]:
        res_deg = client.post("/api/v1/cameras/ocr_test", json={"plate_text": "3ABC456", "degradation": deg, "vehicle_speed_kmh": 85})
        assert res_deg.status_code == 200
        data_deg = res_deg.json()
        assert data_deg["overall_accuracy_pct"] >= 90.0, f"Failed >90% benchmark on {deg}"
        assert data_deg["passes_90_pct_threshold"] is True
        assert "svg" in data_deg["ocr_visual_svg"]


def test_single_plate_trajectory_reconstruction():
    res = client.get("/api/v1/vehicles/7XYZ912/trajectory")
    assert res.status_code == 200
    traj = res.json()
    assert traj["plate_text"] == "7XYZ912"
    assert traj["total_waypoints"] >= 3
    assert len(traj["waypoints"]) >= 3
    assert len(traj["route_coordinates"]) >= 3
    assert len(traj["route_3d_coordinates"]) >= 3
    assert traj["total_distance_km"] > 0
    assert traj["avg_speed_kmh"] > 0


def test_macro_traffic_flow_and_od_analytics():
    # Test Macro Overview
    res_macro = client.get("/api/v1/traffic/macro")
    assert res_macro.status_code == 200
    macro = res_macro.json()
    assert macro["total_cameras"] >= 6
    assert macro["system_ocr_accuracy_benchmark_pct"] >= 90.0
    assert len(macro["density_by_camera"]) >= 6
    assert macro["od_summary"]["total_active_trips"] > 0

    # Test OD Matrix
    res_od = client.get("/api/v1/traffic/od-matrix")
    assert res_od.status_code == 200
    od = res_od.json()
    assert len(od["top_origin_destination_pairs"]) >= 3

    # Test Heatmap Points
    res_heat = client.get("/api/v1/traffic/heatmap-points")
    assert res_heat.status_code == 200
    assert len(res_heat.json()) >= 6


def test_blacklist_alert_and_intercept_system():
    # Test Blacklist Registry
    res_reg = client.get("/api/v1/anomalies/registry")
    assert res_reg.status_code == 200
    assert len(res_reg.json()) >= 2

    # Test Active Hotlist Alerts
    res_alerts = client.get("/api/v1/anomalies/blacklist")
    assert res_alerts.status_code == 200
    alerts = res_alerts.json()
    assert len(alerts) >= 1
    assert "predicted_intercept_camera_id" in alerts[0]

    # Test Route Anomalies (Ghost plates / Loitering)
    res_routes = client.get("/api/v1/anomalies/routes")
    assert res_routes.status_code == 200
    assert len(res_routes.json()) >= 2

    # Test Intercept Advisory
    res_adv = client.get(f"/api/v1/anomalies/intercept/{alerts[0]['alert_id']}")
    assert res_adv.status_code == 200
    assert "recommended_intercept_node" in res_adv.json()

