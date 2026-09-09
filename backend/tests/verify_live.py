import urllib.request
import json
import time

base = "http://127.0.0.1:8000"

endpoints = [
    ("/", "GET"),
    ("/health", "GET"),
    ("/docs", "GET"),
    ("/api/v1/cameras", "GET"),
    ("/api/v1/cameras/CAM_01", "GET"),
    ("/api/v1/cameras/CAM_01/process", "POST"),
    ("/api/v1/traffic/current", "GET"),
    ("/api/v1/traffic/history", "GET"),
    ("/api/v1/roads", "GET"),
    ("/api/v1/roads/ROAD-A-B/analytics", "GET"),
    ("/api/v1/vehicles", "GET"),
    ("/api/v1/vehicles/matches", "GET"),
    ("/api/v1/vehicles/V1023/trajectory", "GET"),
    ("/api/v1/predictions", "GET"),
    ("/api/v1/anomalies", "GET"),
]

print("=== TESTING LIVE HTTP ENDPOINTS ===")
for ep, method in endpoints:
    req = urllib.request.Request(f"{base}{ep}", method=method)
    if method == "POST":
        req.add_header("Content-Type", "application/json")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req) as resp:
            elapsed = (time.time() - t0) * 1000
            x_time = resp.headers.get("X-Process-Time", "N/A")
            print(f"[{resp.status}] {method:4} {ep:35} -> {elapsed:.1f}ms (server: {x_time})")
    except Exception as e:
        print(f"[FAIL] {method:4} {ep:35} -> {e}")

# Test simulation POST
sim_payload = json.dumps({
    "closed_roads": ["ROAD-A-B"],
    "traffic_volume_change_pct": 15.0,
    "signal_timing_adjustments": {"Junction_Trinity": 45}
}).encode("utf-8")
sim_req = urllib.request.Request(
    f"{base}/api/v1/simulation",
    data=sim_payload,
    headers={"Content-Type": "application/json"},
    method="POST"
)
with urllib.request.urlopen(sim_req) as resp:
    res = json.loads(resp.read().decode("utf-8"))
    print(f"[200] POST /api/v1/simulation                 -> Scenario ID: {res['scenario_id']}, Metrics: {len(res['metrics'])}")

# Test Auth POST
auth_payload = json.dumps({
    "username": "admin",
    "password": "admin123"
}).encode("utf-8")
auth_req = urllib.request.Request(
    f"{base}/api/v1/auth/login",
    data=auth_payload,
    headers={"Content-Type": "application/json"},
    method="POST"
)
with urllib.request.urlopen(auth_req) as resp:
    auth_res = json.loads(resp.read().decode("utf-8"))
    print(f"[200] POST /api/v1/auth/login                 -> JWT Token: {auth_res['access_token'][:25]}...")
