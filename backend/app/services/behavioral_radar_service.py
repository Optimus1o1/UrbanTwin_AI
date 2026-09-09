"""
UrbanTwin AI - Real-Time Vehicle Anomaly & Pattern-of-Life Radar Service
Behavioral AI Engine applying unsupervised outlier detection across spatial-temporal trajectories.

Core Capabilities:
1. Plate Swapping / Cloning Detection (Impossible velocity delta / teleportation)
2. Tactical Convoy / Following Detection (Synchronized headway across disjoint nodes)
3. Surveillance Loitering Vector Detection (Graph circularity & lingering in sensitive zones)
"""

import math
import time
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import random

from app.models.schemas import (
    BehavioralThreatType,
    BehavioralThreatSeverity,
    BehavioralEvidence,
    PatternOfLifeThreat,
    RadarSummaryStats,
    ThreatSimulationRequest
)

# Reference Camera Coordinates
CAMERA_COORDINATES: Dict[str, Dict[str, Any]] = {
    "CAM_01": {"name": "MG Road - Trinity Junction", "lat": 12.9725, "lng": 77.6180, "sector": "Commercial Core", "sensitive": True},
    "CAM_02": {"name": "Indiranagar 100ft Express", "lat": 12.9784, "lng": 77.6408, "sector": "East Transit Hub", "sensitive": False},
    "CAM_03": {"name": "Koramangala Sony World Crossing", "lat": 12.9352, "lng": 77.6245, "sector": "Financial & Tech Core", "sensitive": True},
    "CAM_04": {"name": "West River Crossing Flyover", "lat": 12.9510, "lng": 77.5850, "sector": "Government & Embassy Zone", "sensitive": True},
    "CAM_05": {"name": "Outer Ring Road - Bellandur Tech Hub", "lat": 12.9260, "lng": 77.6762, "sector": "South-East Tech Corridor", "sensitive": False},
    "CAM_06": {"name": "Electronic City Tollway Interchange", "lat": 12.8452, "lng": 77.6602, "sector": "South Tech Tollway", "sensitive": False}
}

# Haversine distance helper (km)
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)

class BehavioralRadarService:
    _threats_db: List[PatternOfLifeThreat] = []
    _initialized: bool = False

    @classmethod
    def _ensure_initialized(cls):
        if cls._initialized:
            return
        cls._initialized = True
        cls._seed_initial_threats()

    @classmethod
    def _seed_initial_threats(cls):
        now = datetime.now()
        cls._threats_db = [
            # 1. Plate Cloning / Swapping Threat
            PatternOfLifeThreat(
                threat_id="THREAT-POL-CLONE-01",
                threat_type=BehavioralThreatType.PLATE_CLONING,
                threat_title="Cryptographic Plate Hash Replication / Impossible Teleportation",
                severity=BehavioralThreatSeverity.CRITICAL,
                primary_plate="DL08CA1990",
                primary_vehicle_desc="Audi A6 Luxury Sedan (White)",
                secondary_plate="DL08CA1990 (Duplicate Clone)",
                secondary_vehicle_desc="Toyota Corolla Altis (Grey)",
                evidence=BehavioralEvidence(
                    metric_name="Spatial-Temporal Velocity Anomaly",
                    observed_value="983.5 km/h apparent speed",
                    baseline_threshold="Max Physical Corridor Speed: 120.0 km/h",
                    physical_discrepancy="Sighted at CAM_01 (Trinity) and CAM_06 (Electronic City, 22.4 km apart) within 82 seconds. Physical travel requires min. 24 minutes.",
                    anomaly_z_score=5.4,
                    model_confidence=0.99,
                    details={
                        "distance_km": 22.4,
                        "time_delta_seconds": 82,
                        "calculated_velocity_kmh": 983.5,
                        "origin_cam": "CAM_01",
                        "teleport_cam": "CAM_06"
                    }
                ),
                cameras_involved=["CAM_01", "CAM_06"],
                camera_names=["MG Road - Trinity Junction", "Electronic City Tollway Interchange"],
                sector="South Corridor Cross-Sector",
                radar_angle_deg=135.0,
                radar_distance_km=6.8,
                route_coordinates=[[12.9725, 77.6180], [12.8452, 77.6602]],
                detection_timestamp=(now - timedelta(minutes=4)).strftime("%H:%M:%S"),
                intercept_recommended=True,
                suggested_action="Immediate dual-sector alert. Flag both clone targets for tactical intercept at Electronic City Toll Plaza and Trinity Exit.",
                status="ACTIVE_TRACKING"
            ),
            # 2. Tactical Convoy / Following Behavior Threat
            PatternOfLifeThreat(
                threat_id="THREAT-POL-CNV-02",
                threat_type=BehavioralThreatType.TACTICAL_CONVOY,
                threat_title="Synchronized Tactical Convoy / Unregistered Shadow Following",
                severity=BehavioralThreatSeverity.HIGH,
                primary_plate="KA01MH7701",
                primary_vehicle_desc="Ford Endeavour SUV (Matte Black)",
                secondary_plate="KA01MH7702",
                secondary_vehicle_desc="Toyota Fortuner SUV (Dark Tinted)",
                evidence=BehavioralEvidence(
                    metric_name="Disjoint Node Headway Correlation",
                    observed_value="7.4s constant headway (StdDev: 0.8s)",
                    baseline_threshold="Random Urban Follow Headway StdDev: > 8.5s",
                    physical_discrepancy="Paired vehicles maintained identical vector maneuvers across 3 disjoint junctions (CAM_01 -> CAM_02 -> CAM_05) spanning 11.2 km without separation.",
                    anomaly_z_score=4.6,
                    model_confidence=0.95,
                    details={
                        "tracked_nodes_count": 3,
                        "mean_headway_seconds": 7.4,
                        "headway_stddev": 0.8,
                        "formation_distance_km": 11.2,
                        "node_sequence": ["CAM_01", "CAM_02", "CAM_05"]
                    }
                ),
                cameras_involved=["CAM_01", "CAM_02", "CAM_05"],
                camera_names=["MG Road - Trinity Junction", "Indiranagar 100ft Express", "Outer Ring Road - Bellandur Tech Hub"],
                sector="East Transit & Tech Hub",
                radar_angle_deg=45.0,
                radar_distance_km=4.2,
                route_coordinates=[[12.9725, 77.6180], [12.9784, 77.6408], [12.9260, 77.6762]],
                detection_timestamp=(now - timedelta(minutes=9)).strftime("%H:%M:%S"),
                intercept_recommended=True,
                suggested_action="Alert highway intercept units. Monitor paired convoy at Bellandur tech corridor for coordinated egress or illicit payload transfer.",
                status="ACTIVE_TRACKING"
            ),
            # 3. Surveillance Loitering Vector Threat
            PatternOfLifeThreat(
                threat_id="THREAT-POL-LOIT-03",
                threat_type=BehavioralThreatType.SURVEILLANCE_LOITERING,
                threat_title="Circuitous Surveillance Vector / High-Security Infrastructure Circling",
                severity=BehavioralThreatSeverity.HIGH,
                primary_plate="KA05NB9944",
                primary_vehicle_desc="Panel Cargo Van (Tinted Windows)",
                secondary_plate=None,
                secondary_vehicle_desc=None,
                evidence=BehavioralEvidence(
                    metric_name="Graph Entropy & Loop Recurrence Rate",
                    observed_value="4 Repetitive Closed Loops in 35 min",
                    baseline_threshold="Commuter Loop Expectation: 0 Loops (Entropy > 0.85)",
                    physical_discrepancy="Vehicle repeated 4 closed-circuit loops around West River Crossing Flyover and Koramangala Government Facility with 0 destination progress.",
                    anomaly_z_score=4.1,
                    model_confidence=0.92,
                    details={
                        "loop_count": 4,
                        "dwell_time_minutes": 35.0,
                        "net_displacement_km": 0.8,
                        "sensitive_zone": "Embassy Enclave & Government Corridor"
                    }
                ),
                cameras_involved=["CAM_04", "CAM_03", "CAM_04", "CAM_03"],
                camera_names=["West River Crossing Flyover", "Koramangala Sony World Crossing"],
                sector="Government & Embassy Corridor",
                radar_angle_deg=225.0,
                radar_distance_km=3.1,
                route_coordinates=[[12.9510, 77.5850], [12.9352, 77.6245], [12.9510, 77.5850]],
                detection_timestamp=(now - timedelta(minutes=16)).strftime("%H:%M:%S"),
                intercept_recommended=True,
                suggested_action="Dispatch perimeter patrol unit to West River bridgehead. Execute ID verification for suspicious surveillance reconnaissance.",
                status="ACTIVE_TRACKING"
            )
        ]

    @classmethod
    def get_all_threats(cls) -> List[PatternOfLifeThreat]:
        cls._ensure_initialized()
        return cls._threats_db

    @classmethod
    def get_radar_stats(cls) -> RadarSummaryStats:
        cls._ensure_initialized()
        threats = cls._threats_db
        clones = sum(1 for t in threats if t.threat_type == BehavioralThreatType.PLATE_CLONING)
        convoys = sum(1 for t in threats if t.threat_type == BehavioralThreatType.TACTICAL_CONVOY)
        loiter = sum(1 for t in threats if t.threat_type == BehavioralThreatType.SURVEILLANCE_LOITERING)
        
        scores = [t.evidence.anomaly_z_score for t in threats]
        mean_score = round(sum(scores) / len(scores), 2) if scores else 4.0

        all_nodes = []
        for t in threats:
            all_nodes.extend(t.cameras_involved)
        # Top nodes
        node_counts = {}
        for n in all_nodes:
            node_counts[n] = node_counts.get(n, 0) + 1
        sorted_nodes = sorted(node_counts.keys(), key=lambda k: node_counts[k], reverse=True)

        return RadarSummaryStats(
            total_active_threats=len(threats),
            plate_clones_count=clones,
            convoys_tracked_count=convoys,
            loitering_surveillance_count=loiter,
            mean_anomaly_score=mean_score,
            high_threat_nodes=sorted_nodes[:3],
            radar_status="ONLINE_SWEEPING"
        )

    @classmethod
    def evaluate_plate_cloning_anomaly(cls, plate: str, cam1: str, time1: datetime, cam2: str, time2: datetime) -> Optional[PatternOfLifeThreat]:
        """
        Detector 1: Evaluates whether two sightings of the same plate represent an impossible physical velocity.
        """
        c1 = CAMERA_COORDINATES.get(cam1)
        c2 = CAMERA_COORDINATES.get(cam2)
        if not c1 or not c2 or cam1 == cam2:
            return None

        dist_km = haversine_km(c1["lat"], c1["lng"], c2["lat"], c2["lng"])
        delta_sec = abs((time2 - time1).total_seconds())
        if delta_sec <= 0:
            delta_sec = 1.0

        apparent_speed = (dist_km / (delta_sec / 3600.0))
        # Threshold: normal maximum highway velocity limit is 140 km/h
        if apparent_speed > 180.0 or (dist_km > 10.0 and delta_sec < 120.0):
            z_score = round((apparent_speed - 50.0) / 20.0, 2)
            z_score = max(3.5, min(8.5, z_score))

            threat = PatternOfLifeThreat(
                threat_id=f"THREAT-POL-CLONE-{int(time.time()) % 10000}",
                threat_type=BehavioralThreatType.PLATE_CLONING,
                threat_title="Live Cryptographic Plate Hash Teleportation / Cloned Vehicle",
                severity=BehavioralThreatSeverity.CRITICAL,
                primary_plate=plate,
                primary_vehicle_desc="Flagged Duplicate Vehicle Pair",
                secondary_plate=f"{plate} [Simultaneous Sighting]",
                evidence=BehavioralEvidence(
                    metric_name="Spatial-Temporal Velocity Anomaly",
                    observed_value=f"{apparent_speed:.1f} km/h apparent speed",
                    baseline_threshold="Corridor Physical Limit: 120.0 km/h",
                    physical_discrepancy=f"Recorded at {c1['name']} and {c2['name']} ({dist_km:.1f} km apart) within {int(delta_sec)}s. Mathematically impossible single-vehicle movement.",
                    anomaly_z_score=z_score,
                    model_confidence=0.99,
                    details={
                        "distance_km": dist_km,
                        "time_delta_seconds": delta_sec,
                        "calculated_velocity_kmh": apparent_speed,
                        "origin_cam": cam1,
                        "teleport_cam": cam2
                    }
                ),
                cameras_involved=[cam1, cam2],
                camera_names=[c1["name"], c2["name"]],
                sector=f"{c1['sector']} & {c2['sector']}",
                radar_angle_deg=round(random.uniform(20.0, 340.0), 1),
                radar_distance_km=round(min(8.0, dist_km * 0.4), 1),
                route_coordinates=[[c1["lat"], c1["lng"]], [c2["lat"], c2["lng"]]],
                detection_timestamp=datetime.now().strftime("%H:%M:%S"),
                suggested_action=f"Dispatch patrol units to intercept both sightings at {cam1} and {cam2} simultaneously.",
                status="ACTIVE_TRACKING"
            )
            return threat
        return None

    @classmethod
    def simulate_threat(cls, req: ThreatSimulationRequest) -> PatternOfLifeThreat:
        """
        Interactive simulation generator for operators to inject synthetic anomaly patterns on demand.
        """
        cls._ensure_initialized()
        now = datetime.now()
        ts = now.strftime("%H:%M:%S")

        if req.threat_type == BehavioralThreatType.PLATE_CLONING:
            plate = req.primary_plate or f"KA0{random.randint(1,9)}CL{random.randint(1000,9999)}"
            cam1, cam2 = "CAM_01", "CAM_05"
            c1, c2 = CAMERA_COORDINATES[cam1], CAMERA_COORDINATES[cam2]
            dist = haversine_km(c1["lat"], c1["lng"], c2["lat"], c2["lng"])
            delta_s = 45.0
            spd = round(dist / (delta_s / 3600.0), 1)

            threat = PatternOfLifeThreat(
                threat_id=f"THREAT-SIM-CLONE-{random.randint(100, 999)}",
                threat_type=BehavioralThreatType.PLATE_CLONING,
                threat_title="Simulated Plate Cloning / Dual-Camera Quantum Sightings",
                severity=BehavioralThreatSeverity.CRITICAL,
                primary_plate=plate,
                primary_vehicle_desc="Mercedes-Benz C-Class (Silver Metallic)",
                secondary_plate=f"{plate} (Duplicate Clone)",
                secondary_vehicle_desc="Honda City Sedan (Grey)",
                evidence=BehavioralEvidence(
                    metric_name="Spatial-Temporal Velocity Anomaly",
                    observed_value=f"{spd} km/h apparent speed",
                    baseline_threshold="Corridor Velocity Limit: 120.0 km/h",
                    physical_discrepancy=f"Identical cryptographic plate hash sighted at {c1['name']} and {c2['name']} ({dist} km) in {int(delta_s)}s. Exceeds physical speed of ground vehicles by 7x.",
                    anomaly_z_score=5.8,
                    model_confidence=0.99,
                    details={"distance_km": dist, "delta_s": delta_s, "apparent_speed": spd}
                ),
                cameras_involved=[cam1, cam2],
                camera_names=[c1["name"], c2["name"]],
                sector="South-East Cross Corridor",
                radar_angle_deg=round(random.uniform(110.0, 160.0), 1),
                radar_distance_km=5.4,
                route_coordinates=[[c1["lat"], c1["lng"]], [c2["lat"], c2["lng"]]],
                detection_timestamp=ts,
                suggested_action=f"Lock automated signal barrier at {c2['name']}. Flag for physical roadblock intercept.",
                status="ACTIVE_TRACKING"
            )

        elif req.threat_type == BehavioralThreatType.TACTICAL_CONVOY:
            plate_lead = req.primary_plate or f"KA03CV{random.randint(1000, 9999)}"
            plate_trail = req.secondary_plate or f"KA03CV{random.randint(1000, 9999)}"
            cams = ["CAM_03", "CAM_05", "CAM_06"]
            c_names = [CAMERA_COORDINATES[c]["name"] for c in cams]

            threat = PatternOfLifeThreat(
                threat_id=f"THREAT-SIM-CNV-{random.randint(100, 999)}",
                threat_type=BehavioralThreatType.TACTICAL_CONVOY,
                threat_title="Simulated Coordinated Convoy / Disjoint Node Formation",
                severity=BehavioralThreatSeverity.HIGH,
                primary_plate=plate_lead,
                primary_vehicle_desc="Toyota Innova Crysta (Dark Tinted)",
                secondary_plate=plate_trail,
                secondary_vehicle_desc="Mahindra Scorpio-N (Black)",
                evidence=BehavioralEvidence(
                    metric_name="Headway Vector Correlation",
                    observed_value="5.8s spacing across 3 disjoint nodes",
                    baseline_threshold="Independent Headway Variance: > 12.0s",
                    physical_discrepancy=f"Vehicles maintain strictly synchronized 5.8s formation headway across {', '.join(c_names)} over 14.8 km.",
                    anomaly_z_score=4.7,
                    model_confidence=0.96,
                    details={"nodes": cams, "mean_headway": 5.8, "lead": plate_lead, "trail": plate_trail}
                ),
                cameras_involved=cams,
                camera_names=c_names,
                sector="South Tech Corridor",
                radar_angle_deg=round(random.uniform(40.0, 90.0), 1),
                radar_distance_km=4.6,
                route_coordinates=[[CAMERA_COORDINATES[c]["lat"], CAMERA_COORDINATES[c]["lng"]] for c in cams],
                detection_timestamp=ts,
                suggested_action="Track lead and trailing vehicles. Monitor next toll plaza for split evasion.",
                status="ACTIVE_TRACKING"
            )

        else: # SURVEILLANCE_LOITERING
            plate = req.primary_plate or f"KA04LT{random.randint(1000, 9999)}"
            cams = ["CAM_04", "CAM_01", "CAM_04", "CAM_01"]
            c_names = ["West River Crossing Flyover", "MG Road - Trinity Junction"]

            threat = PatternOfLifeThreat(
                threat_id=f"THREAT-SIM-LOIT-{random.randint(100, 999)}",
                threat_type=BehavioralThreatType.SURVEILLANCE_LOITERING,
                threat_title="Simulated Surveillance Loop / Sensitive Infrastructure Orbiting",
                severity=BehavioralThreatSeverity.HIGH,
                primary_plate=plate,
                primary_vehicle_desc="Commercial Transit Van (Unmarked)",
                evidence=BehavioralEvidence(
                    metric_name="Trajectory Entropy & Recurrence",
                    observed_value="5 Complete Perimeter Loops in 40 min",
                    baseline_threshold="Permitted Dwell Loops in Zone: Max 1 Loop",
                    physical_discrepancy=f"Repeated orbital surveillance passes surrounding West River Crossing and Government Zone with zero commercial dispatch records.",
                    anomaly_z_score=4.3,
                    model_confidence=0.93,
                    details={"loops": 5, "duration_min": 40.0, "zone": "Government & Embassy Zone"}
                ),
                cameras_involved=cams,
                camera_names=c_names,
                sector="West Gateway & Embassy Zone",
                radar_angle_deg=round(random.uniform(200.0, 270.0), 1),
                radar_distance_km=2.8,
                route_coordinates=[[CAMERA_COORDINATES["CAM_04"]["lat"], CAMERA_COORDINATES["CAM_04"]["lng"]],
                                   [CAMERA_COORDINATES["CAM_01"]["lat"], CAMERA_COORDINATES["CAM_01"]["lng"]]],
                detection_timestamp=ts,
                suggested_action="Alert security detail at Government Flyover gate. Dispatch patrol unit for field check.",
                status="ACTIVE_TRACKING"
            )

        # Prepend to DB
        cls._threats_db.insert(0, threat)
        if len(cls._threats_db) > 15:
            cls._threats_db.pop()

        return threat
