from typing import List, Dict, Any
from fastapi import APIRouter, Request, HTTPException
from app.models.schemas import Anomaly, BlacklistAlert, BlacklistEntry, RouteAnomalyAlert
from app.services.anomaly_service import get_active_anomalies
from app.services.alert_service import AlertService
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/anomalies", tags=["Alert System & Hotlist Enforcement"])

@router.get("", response_model=List[Anomaly])
@limiter.limit("60/minute")
def list_active_anomalies(request: Request):
    """Retrieve all real-time traffic anomalies (sudden slowdowns, abnormal queues, optical drops)."""
    return get_active_anomalies()

@router.get("/blacklist", response_model=List[BlacklistAlert])
@limiter.limit("60/minute")
def get_active_blacklist_alerts(request: Request):
    """
    Real-Time Hotlist Alert System:
    Flags blacklisted vehicles (stolen, felony warrants, unpaid citations) sighted on the camera grid,
    with downstream intercept prediction and estimated time of arrival (ETA).
    """
    return AlertService.get_active_blacklist_alerts()

@router.get("/routes", response_model=List[RouteAnomalyAlert])
@limiter.limit("60/minute")
def get_route_anomalies(request: Request):
    """
    Suspicious Route Anomaly Detection:
    Flags cloned/ghost plates (impossible spatial-temporal velocity) and circuitous loitering loops.
    """
    return AlertService.get_route_anomalies()

@router.get("/registry", response_model=List[BlacklistEntry])
@limiter.limit("60/minute")
def get_blacklist_registry(request: Request):
    """Retrieve database of all active blacklisted plates and warrant information."""
    return AlertService.get_blacklist_registry()

@router.post("/registry", response_model=BlacklistEntry)
@limiter.limit("30/minute")
def add_to_blacklist(request: Request, entry: BlacklistEntry):
    """Register a new vehicle plate onto the real-time hotlist surveillance network."""
    return AlertService.add_blacklist_entry(entry)

@router.get("/intercept/{alert_id}", response_model=Dict[str, Any])
@limiter.limit("60/minute")
def get_intercept_advisory(request: Request, alert_id: str):
    """
    Real-Time Downstream Intercept Advisory:
    Recommends optimal patrol unit interception points based on vehicle heading, speed, and downstream node topology.
    """
    alerts = AlertService.get_active_blacklist_alerts()
    for a in alerts:
        if a.alert_id == alert_id:
            return {
                "alert_id": a.alert_id,
                "plate_text": a.plate_text,
                "vehicle": a.vehicle_desc,
                "current_camera": a.camera_name,
                "speed_kmh": a.speed_kmh,
                "heading": a.direction_heading,
                "recommended_intercept_node": a.predicted_intercept_camera_name,
                "intercept_camera_id": a.predicted_intercept_camera_id,
                "eta_seconds": a.intercept_eta_seconds,
                "recommended_action": "Deploy patrol unit to Bellandur Tollway off-ramp. Set traffic signal to RED on approach."
            }
    raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found")
