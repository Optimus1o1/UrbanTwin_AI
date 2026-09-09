from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: str

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4)

# --- Camera & Edge Telemetry Schemas ---
class CameraStatus(str, Enum):
    ONLINE = "ONLINE"
    DEGRADED = "DEGRADED"
    OFFLINE = "OFFLINE"

class Camera(BaseModel):
    camera_id: str
    name: str
    sector: str = "Central District"
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    road_id: str
    road_name: str = "Arterial Corridor"
    video_source: str = "simulated_feed.mp4"
    status: CameraStatus = CameraStatus.ONLINE
    fps: float = 30.0
    flow_rate_vph: int = 450
    avg_speed_kmh: float = 45.0
    plates_scanned_last_hour: int = 380
    optical_quality: str = "4K Ultra-HD HDR"

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

class Detection(BaseModel):
    detection_id: str
    camera_id: str
    timestamp: str
    vehicle_class: str # sedan, suv, truck, motorcycle, bus, police
    vehicle_color: str = "Silver"
    bbox: List[float] # [x1, y1, x2, y2]
    confidence: float = Field(..., ge=0.0, le=1.0)
    track_id: Optional[int] = None
    speed_kmh: Optional[float] = 0.0

# --- High-Accuracy ANPR & OCR Schemas ---
class CharacterConfidence(BaseModel):
    char: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    status: str = "CONFIRMED" # CONFIRMED, RECTIFIED, AMBIGUOUS

class PlateObservation(BaseModel):
    observation_id: str
    vehicle_id: Optional[str] = None
    camera_id: str
    camera_name: str = "Camera Node"
    timestamp: str
    raw_plate_masked: str
    plate_text: str = ""
    plate_hash: str # Cryptographic salted SHA-256 hash for GDPR privacy
    vehicle_class: str = "Sedan"
    vehicle_color: str = "Silver Metallic"
    confidence: float = Field(..., ge=0.0, le=1.0)
    is_degraded: bool = False
    degradation_type: str = "NORMAL" # NORMAL, RAIN, HEADLIGHT_GLARE, MOTION_BLUR, OBLIQUE_ANGLE, DIRTY_PLATE
    character_confidences: List[CharacterConfidence] = []
    stn_rectified: bool = True
    speed_kmh: float = 42.0

class OCRTestRequest(BaseModel):
    plate_text: str = Field(default="7XYZ912", min_length=4, max_length=15)
    degradation: str = Field(default="rain", description="clean, rain, glare, motion_blur, dirty, oblique_angle")
    vehicle_speed_kmh: float = Field(default=65.0, ge=0.0, le=200.0)

class OCRTestResponse(BaseModel):
    input_plate: str
    recognized_plate: str
    overall_accuracy_pct: float
    raw_confidence: float
    rectification_applied: str
    processing_time_ms: float
    degradation_simulated: str
    character_breakdown: List[CharacterConfidence]
    ocr_visual_svg: str
    passes_90_pct_threshold: bool = True

# --- Spatial-Temporal Trajectory Tracking Schemas ---
class TrajectoryWaypoint(BaseModel):
    step: int
    camera_id: str
    camera_name: str
    timestamp: str
    lat: float
    lng: float
    x_3d: float
    z_3d: float
    speed_kmh: float
    speed_limit_kmh: float = 60.0
    is_speeding: bool = False
    direction_heading: str
    transit_time_seconds: int
    distance_from_prev_meters: float

class VehicleTrajectory(BaseModel):
    global_vehicle_id: Optional[str] = None
    plate_text: str
    plate_masked: str
    plate_hash: str
    vehicle_class: str
    vehicle_color: str
    first_seen: str
    last_seen: str
    total_waypoints: int
    total_distance_km: float
    avg_speed_kmh: float
    max_speed_kmh: float
    is_blacklisted: bool = False
    blacklist_reason: Optional[str] = None
    waypoints: List[TrajectoryWaypoint]
    route_coordinates: List[List[float]] # [[lat, lng], ...] for Leaflet polyline
    route_3d_coordinates: List[List[float]] # [[x, y, z], ...] for Three.js trajectory tube
    anomalies_detected: List[str] = []

class TrajectoryQuery(BaseModel):
    plate_query: str = Field(..., min_length=2)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    vehicle_class: Optional[str] = None

# --- Cross-Camera Matching (ReID Legacy Compatible) ---
class MatchBreakdown(BaseModel):
    plate_similarity: float
    vehicle_type: float
    appearance_features: float
    travel_time: float
    route_consistency: float

class CrossCameraMatch(BaseModel):
    global_vehicle_id: str
    cameras_seen: List[str]
    timeline: List[Dict[str, Any]]
    final_score: float
    breakdown: MatchBreakdown

# --- Macro Traffic Analytics & OD Schemas ---
class LevelOfService(str, Enum):
    LOS_A = "LOS A (Free Flow)"
    LOS_B = "LOS B (Reasonably Free)"
    LOS_C = "LOS C (Stable Flow)"
    LOS_D = "LOS D (Approaching Unstable)"
    LOS_E = "LOS E (Unstable / Capacity)"
    LOS_F = "LOS F (Forced / Congested Breakdown)"

class TrafficDensity(BaseModel):
    camera_id: str
    camera_name: str
    road_id: str
    flow_rate_vph: int
    occupancy_pct: float
    avg_speed_kmh: float
    level_of_service: LevelOfService
    congestion_score: float # 0 to 100

class ODPair(BaseModel):
    origin_id: str
    origin_name: str
    destination_id: str
    destination_name: str
    trips_per_hour: int
    avg_transit_minutes: float
    dominant_vehicle_type: str
    congestion_index: float

class ODMatrix(BaseModel):
    timestamp: str
    total_active_trips: int
    top_origin_destination_pairs: List[ODPair]
    dominant_commuter_corridor: str

class TrafficForecast(BaseModel):
    horizon_minutes: int
    projected_flow_vph: int
    projected_avg_speed_kmh: float
    predicted_los: LevelOfService
    congestion_probability: float

class CityMacroOverview(BaseModel):
    total_cameras: int
    online_cameras: int
    total_plates_scanned_today: int
    current_city_avg_speed_kmh: float
    peak_congested_corridor: str
    active_hotlist_alerts: int
    system_ocr_accuracy_benchmark_pct: float
    density_by_camera: List[TrafficDensity]
    od_summary: ODMatrix
    forecast_15m: TrafficForecast
    forecast_30m: TrafficForecast
    forecast_60m: TrafficForecast

# --- Road & Physical Network Schemas ---
class RoadSegment(BaseModel):
    road_id: str
    name: str
    start_node: str
    end_node: str
    length_km: float
    speed_limit_kmh: float

class TrafficMetrics(BaseModel):
    road_id: str
    timestamp: str
    vehicle_count: int
    avg_speed_kmh: float
    density: str
    queue_length_m: float
    travel_time_min: float
    congestion_pct: float

# --- Traffic ML Forecasting Schemas ---
class PredictionHorizon(BaseModel):
    horizon_min: int
    predicted_congestion_pct: float
    predicted_avg_speed_kmh: float
    confidence_interval: List[float]

class TrafficPrediction(BaseModel):
    road_id: str
    road_name: str
    current_congestion: float = 50.0
    current_congestion_pct: Optional[float] = None
    horizons: List[PredictionHorizon]
    model_type: Optional[str] = "XGBoost + LSTM Ensembled"
    mae: Optional[float] = 2.41
    rmse: Optional[float] = 3.15

# --- Digital Twin What-If Simulation Schemas ---
class SimulationScenario(BaseModel):
    name: str = "Custom Scenario"
    closed_roads: List[str] = []
    traffic_volume_change_pct: float = 0.0 # e.g. +20%
    signal_timing_adjustments: Dict[str, float] = {} # e.g. {"Junction_Trinity": 10.0}

class SimulationComparisonItem(BaseModel):
    metric_name: str
    before: str
    after: str
    change_pct: float
    is_improvement: bool

class SimulationResult(BaseModel):
    scenario_id: str
    description: str
    metrics: List[SimulationComparisonItem]
    affected_roads: List[str]
    timestamp: str

# --- Incident Anomaly Schemas ---
class Anomaly(BaseModel):
    anomaly_id: str
    camera_id: str
    road_id: str
    road_name: str
    anomaly_type: str
    severity: str
    expected_speed_kmh: float
    current_speed_kmh: float
    anomaly_score: float
    timestamp: str

# --- Real-Time Alert & Blacklist Schemas ---
class BlacklistSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"

class BlacklistEntry(BaseModel):
    plate_text: str
    vehicle_desc: str
    reason: str
    severity: BlacklistSeverity
    registered_owner: str
    warrant_id: str
    flagged_date: str
    active: bool = True

class BlacklistAlert(BaseModel):
    alert_id: str
    plate_text: str
    plate_masked: str
    vehicle_desc: str
    severity: BlacklistSeverity
    reason: str
    camera_id: str
    camera_name: str
    timestamp: str
    latitude: float
    longitude: float
    x_3d: float
    z_3d: float
    speed_kmh: float
    direction_heading: str
    predicted_intercept_camera_id: str
    predicted_intercept_camera_name: str
    intercept_eta_seconds: int
    status: str = "ACTIVE_DISPATCH"

class RouteAnomalyAlert(BaseModel):
    alert_id: str
    plate_text: str
    anomaly_type: str # GHOST_CLONED_PLATE, CIRCUITOUS_LOITERING, SPEED_ANOMALY
    severity: str
    description: str
    detection_timestamp: str
    cameras_involved: List[str]
    confidence: float
