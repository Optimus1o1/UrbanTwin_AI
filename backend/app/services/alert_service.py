from datetime import datetime
from typing import List, Optional, Dict, Any
from app.models.schemas import (
    BlacklistEntry, BlacklistAlert, BlacklistSeverity, RouteAnomalyAlert
)

BLACKLIST_REGISTRY: List[BlacklistEntry] = [
    BlacklistEntry(
        plate_text="3ABC456",
        vehicle_desc="Toyota Fortuner SUV (Black)",
        reason="FIR #402/24: Stolen Luxury Vehicle / Wanted in Highway Cargo Theft",
        severity=BlacklistSeverity.CRITICAL,
        registered_owner="Kunal Verma",
        warrant_id="W-8891-NCRB",
        flagged_date="2024-08-14",
        active=True
    ),
    BlacklistEntry(
        plate_text="MH12PQ8899",
        vehicle_desc="Compact SUV (Graphite Grey)",
        reason="Repeated Red Light & Extreme Speed Violations (14 Unpaid Citations)",
        severity=BlacklistSeverity.HIGH,
        registered_owner="Aditya Patil",
        warrant_id="TRF-5521",
        flagged_date="2024-09-01",
        active=True
    ),
    BlacklistEntry(
        plate_text="KA05X7711",
        vehicle_desc="Commercial Delivery Truck",
        reason="Expired Interstate Transit Permit & Hazardous Cargo Non-Compliance",
        severity=BlacklistSeverity.MEDIUM,
        registered_owner="Karnataka Logistics Cargo",
        warrant_id="RTO-9902",
        flagged_date="2024-09-03",
        active=True
    )
]

ACTIVE_ALERTS_DB: List[BlacklistAlert] = [
    BlacklistAlert(
        alert_id="ALT-HOT-01",
        plate_text="3ABC456",
        plate_masked="3AB-***",
        vehicle_desc="Toyota Fortuner SUV (Black)",
        severity=BlacklistSeverity.CRITICAL,
        reason="FIR #402/24: Stolen Luxury Vehicle / Wanted in Highway Cargo Theft",
        camera_id="CAM_03",
        camera_name="Koramangala Sony World Crossing",
        timestamp=datetime.utcnow().strftime("%H:%M:%S"),
        latitude=12.9352,
        longitude=77.6245,
        x_3d=18.0,
        z_3d=-8.0,
        speed_kmh=64.0,
        direction_heading="Southbound towards Bellandur Tech Hub",
        predicted_intercept_camera_id="CAM_05",
        predicted_intercept_camera_name="Outer Ring Road - Bellandur Tech Hub",
        intercept_eta_seconds=210,
        status="ACTIVE_DISPATCH"
    ),
    BlacklistAlert(
        alert_id="ALT-HOT-02",
        plate_text="MH12PQ8899",
        plate_masked="MH1-***",
        vehicle_desc="Compact SUV (Graphite Grey)",
        severity=BlacklistSeverity.HIGH,
        reason="Extreme Speed Violation & Multiple Tolling Evasions",
        camera_id="CAM_02",
        camera_name="Indiranagar 100ft Express Corridor",
        timestamp=datetime.utcnow().strftime("%H:%M:%S"),
        latitude=12.9784,
        longitude=77.6408,
        x_3d=0.0,
        z_3d=-25.0,
        speed_kmh=78.2,
        direction_heading="Eastbound towards Ring Road Bypass",
        predicted_intercept_camera_id="CAM_05",
        predicted_intercept_camera_name="Outer Ring Road - Bellandur Tech Hub",
        intercept_eta_seconds=340,
        status="ACTIVE_DISPATCH"
    )
]

ROUTE_ANOMALIES_DB: List[RouteAnomalyAlert] = [
    RouteAnomalyAlert(
        alert_id="ANM-GST-001",
        plate_text="DL08CA1990",
        anomaly_type="GHOST_CLONED_PLATE",
        severity="CRITICAL",
        description="Impossible Spatial-Temporal Velocity: Plate sighted at CAM_01 and CAM_06 (22 km apart) within 90 seconds. Physical travel requires min. 24 minutes. High confidence duplicate/cloned plate fraud.",
        detection_timestamp=datetime.utcnow().strftime("%H:%M:%S"),
        cameras_involved=["CAM_01", "CAM_06"],
        confidence=0.98
    ),
    RouteAnomalyAlert(
        alert_id="ANM-LOIT-002",
        plate_text="KA03NB4421",
        anomaly_type="CIRCUITOUS_LOITERING",
        severity="HIGH",
        description="Repetitive Circular Pattern: Vehicle performed 4 full loops around Financial Core & Trinity Corridor within 45 minutes without destination exit. Suspicious surveillance / loitering signature.",
        detection_timestamp=datetime.utcnow().strftime("%H:%M:%S"),
        cameras_involved=["CAM_01", "CAM_03", "CAM_01", "CAM_03"],
        confidence=0.91
    )
]

class AlertService:
    @staticmethod
    def get_blacklist_registry() -> List[BlacklistEntry]:
        return BLACKLIST_REGISTRY

    @staticmethod
    def get_active_blacklist_alerts() -> List[BlacklistAlert]:
        return ACTIVE_ALERTS_DB

    @staticmethod
    def get_route_anomalies() -> List[RouteAnomalyAlert]:
        return ROUTE_ANOMALIES_DB

    @staticmethod
    def add_blacklist_entry(entry: BlacklistEntry) -> BlacklistEntry:
        BLACKLIST_REGISTRY.append(entry)
        return entry
