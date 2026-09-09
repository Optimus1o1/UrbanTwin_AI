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

class RoadSimulationMetric(BaseModel):
    road_id: str
    road_name: str
    start_node: str
    end_node: str
    length_km: float
    base_congestion_pct: float
    simulated_congestion_pct: float
    base_speed_kmh: float
    simulated_speed_kmh: float
    status: str = "NORMAL" # "CLOSED", "DETOUR_CONGESTED", "NORMAL", "FREE_FLOW"
    is_closed: bool = False
    is_detour: bool = False
    traffic_flow_vph: int = 600

class SimulationResult(BaseModel):
    scenario_id: str
    description: str
    metrics: List[SimulationComparisonItem]
    affected_roads: List[str]
    timestamp: str
    overall_congestion_before: float = 64.0
    overall_congestion_after: float = 76.5
    avg_speed_before_kmh: float = 26.0
    avg_speed_after_kmh: float = 20.8
    avg_delay_before_min: float = 8.2
    avg_delay_after_min: float = 10.3
    road_impacts: List[RoadSimulationMetric] = []

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

# --- Emergency Vehicle Green Corridor Schemas ---
class EmergencyVehicleType(str, Enum):
    AMBULANCE = "AMBULANCE"
    FIRE_ENGINE = "FIRE_ENGINE"
    POLICE_TACTICAL = "POLICE_TACTICAL"
    ORGAN_TRANSPORT = "ORGAN_TRANSPORT"

class SignalPreemptionState(str, Enum):
    NORMAL_CYCLE = "NORMAL_CYCLE"
    ALL_RED_HOLD = "ALL_RED_HOLD"
    PREEMPTED_GREEN = "PREEMPTED_GREEN"
    QUEUE_FLUSH = "QUEUE_FLUSH"
    TRANSITION_RECOVERY = "TRANSITION_RECOVERY"

SignalControllerState = SignalPreemptionState

class EmergencyVehicle(BaseModel):
    vehicle_id: str
    callsign: str
    plate_number: str
    license_plate: Optional[str] = None
    vehicle_type: EmergencyVehicleType
    priority_level: str = "CODE_RED" # CODE_RED, PRIORITY_1, URGENT
    incident_type: str
    current_location_name: str
    current_lat: float
    current_lng: float
    current_coords: Optional[List[float]] = None # [lat, lng]
    current_speed_kmh: float
    heading_deg: float = 0.0
    destination_name: str
    destination_lat: float
    destination_lng: float
    destination_coords: Optional[List[float]] = None # [lat, lng]
    assigned_hospital_or_station: str
    status: str = "DISPATCHED" # DISPATCHED, EN_ROUTE, ON_SCENE, COMPLETED
    eta_seconds: Optional[int] = None

class JunctionSignalControl(BaseModel):
    junction_id: str
    junction_name: str
    lat: float
    lng: float
    coords: Optional[List[float]] = None # [lat, lng]
    x_3d: float
    z_3d: float
    coords_3d: Optional[List[float]] = None # [x, y, z]
    distance_meters: float
    distance_to_junction_meters: Optional[float] = None
    eta_seconds: int
    estimated_arrival_seconds: Optional[int] = None
    signal_state: SignalPreemptionState
    preemption_active: bool
    cross_streets_held: List[str]
    cross_street_hold: bool = True
    green_lock_countdown_sec: int
    time_to_green_lock: int = 0
    green_window_duration_seconds: Optional[int] = None
    queue_cleared_pct: float
    queue_clearance_percent: float = 0.0
    queue_clearance_pct: Optional[float] = None
    queue_length_meters: float = 45.0
    manual_override: bool = False
    can_override: bool = True

class GreenCorridorRoute(BaseModel):
    corridor_id: str
    incident_id: str
    vehicle: EmergencyVehicle
    origin_name: str
    destination_name: str
    total_distance_km: float
    eta_without_corridor_min: float
    eta_with_corridor_min: float
    eta_normal_minutes: Optional[float] = None
    eta_corridor_minutes: Optional[float] = None
    time_saved_min: float
    time_saved_minutes: Optional[float] = None
    speed_improvement_pct: float
    active: bool = True
    preemption_enabled: bool = False
    preemption_active: bool = False
    junctions: List[JunctionSignalControl]
    route_coordinates: List[List[float]] # [[lat, lng], ...] for Leaflet polyline
    gis_polyline: Optional[List[List[float]]] = None
    route_3d_coordinates: List[List[float]] # [[x, y, z], ...] for Three.js 3D tube
    waypoints_3d: Optional[List[List[float]]] = None
    current_step_index: int = 0
    created_at: str
    updated_at: str

class CorridorDispatchRequest(BaseModel):
    scenario_preset: Optional[str] = None # trauma_cardiac, fire_4alarm, organ_transport
    callsign: Optional[str] = "AMB-911"
    plate_number: Optional[str] = "KA-01-EA-9911"
    license_plate: Optional[str] = None
    vehicle_type: EmergencyVehicleType = EmergencyVehicleType.AMBULANCE
    priority_level: Optional[str] = "CODE_RED"
    incident_type: str = "Severe Cardiac Arrest - STEMI"
    origin_name: str = "Indiranagar 100ft Junction"
    origin_coords: Optional[List[float]] = None
    destination_name: str = "Victoria Emergency Trauma Hospital"
    destination_coords: Optional[List[float]] = None
    speed_kmh: float = 65.0
    auto_activate: Optional[bool] = False

class SignalOverrideRequest(BaseModel):
    junction_id: str
    action: Optional[str] = "FORCE_GREEN" # FORCE_GREEN, EXTEND_30S, CLEAR_NORMAL, ADD_BUFFER_30S, RELEASE_HOLD
    override_action: Optional[str] = None
    override_duration_seconds: Optional[int] = 30
    extend_seconds: Optional[int] = None
    reason: Optional[str] = "First responder manual corridor clearance"

class CorridorTelemetry(BaseModel):
    active_corridors_count: int
    total_interventions_today: int
    total_active_corridors_today: Optional[int] = None
    total_emergency_runs_today: Optional[int] = None
    avg_minutes_saved: float
    average_time_saved_per_run_min: Optional[float] = None
    average_time_saved_minutes: Optional[float] = None
    total_lives_accelerated: int
    preemption_success_rate_pct: float
    signal_preemption_success_rate: Optional[float] = None
    active_preempted_signals: int

# --- Real-Time Behavioral Anomaly & Pattern-of-Life Radar Schemas ---
class BehavioralThreatType(str, Enum):
    PLATE_CLONING = "PLATE_CLONING"
    TACTICAL_CONVOY = "TACTICAL_CONVOY"
    SURVEILLANCE_LOITERING = "SURVEILLANCE_LOITERING"

class BehavioralThreatSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    ELEVATED = "ELEVATED"

class BehavioralEvidence(BaseModel):
    metric_name: str
    observed_value: str
    baseline_threshold: str
    physical_discrepancy: str
    anomaly_z_score: float = 4.2
    model_confidence: float = 0.96
    details: Dict[str, Any] = {}

class PatternOfLifeThreat(BaseModel):
    threat_id: str
    threat_type: BehavioralThreatType
    threat_title: str
    severity: BehavioralThreatSeverity
    primary_plate: str
    primary_vehicle_desc: str
    secondary_plate: Optional[str] = None
    secondary_vehicle_desc: Optional[str] = None
    evidence: BehavioralEvidence
    cameras_involved: List[str]
    camera_names: List[str]
    sector: str = "Central Business & Government Corridor"
    radar_angle_deg: float # Azimuth angle 0-360 for radar scope
    radar_distance_km: float # Distance from radar origin
    route_coordinates: List[List[float]] = [] # [[lat, lng], ...]
    detection_timestamp: str
    intercept_recommended: bool = True
    suggested_action: str
    status: str = "ACTIVE_TRACKING"

class RadarSummaryStats(BaseModel):
    total_active_threats: int
    plate_clones_count: int
    convoys_tracked_count: int
    loitering_surveillance_count: int
    mean_anomaly_score: float
    high_threat_nodes: List[str]
    radar_status: str = "ONLINE_SWEEPING"

class ThreatSimulationRequest(BaseModel):
    threat_type: BehavioralThreatType = BehavioralThreatType.PLATE_CLONING
    primary_plate: Optional[str] = None
    secondary_plate: Optional[str] = None

