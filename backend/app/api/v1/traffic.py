from typing import List, Dict, Any
from fastapi import APIRouter, Request
from app.models.schemas import CityMacroOverview, TrafficDensity, ODMatrix, TrafficMetrics
from app.services.macro_traffic_service import MacroTrafficService
from app.services.camera_service import CAMERAS_DB
from app.core.rate_limiter import limiter

from app.services.graph_service import get_all_traffic_current

router = APIRouter(prefix="/traffic", tags=["Macro Traffic Flow & OD Analytics"])

@router.get("/current", response_model=List[TrafficMetrics])
@limiter.limit("60/minute")
def get_current_traffic(request: Request):
    """Retrieve real-time traffic metrics for all road segments."""
    return get_all_traffic_current()

@router.get("/macro", response_model=CityMacroOverview)
@limiter.limit("60/minute")
def get_city_macro_overview(request: Request):
    """
    Macro Traffic Flow and Movement Analytics:
    Aggregated city-wide traffic dynamics including total throughput, average speed,
    dominant commuter corridors, Level of Service classification, and 15-60 min predictive volume forecasts.
    """
    return MacroTrafficService.get_macro_overview()

@router.get("/density", response_model=List[TrafficDensity])
@limiter.limit("60/minute")
def get_traffic_densities(request: Request):
    """Retrieve multi-camera traffic density, occupancy, and Level of Service (LOS A-F) metrics."""
    return MacroTrafficService.get_traffic_density_all()

@router.get("/od-matrix", response_model=ODMatrix)
@limiter.limit("60/minute")
def get_origin_destination_matrix(request: Request):
    """Retrieve Origin-Destination (OD) traffic movement patterns and dominant commuter corridors."""
    return MacroTrafficService.get_od_matrix()

@router.get("/heatmap-points", response_model=List[Dict[str, Any]])
@limiter.limit("60/minute")
def get_traffic_heatmap_points(request: Request):
    """
    Returns GIS coordinates with congestion intensity weights (0.0 to 1.0)
    for rendering dynamic traffic density heatmaps on Leaflet.
    """
    points = []
    for cam in CAMERAS_DB:
        # Intensity scaled inversely with speed (lower speed = higher congestion)
        intensity = round(max(0.2, min(0.98, (70.0 - cam.avg_speed_kmh) / 55.0)), 2)
        points.append({
            "camera_id": cam.camera_id,
            "name": cam.name,
            "lat": cam.latitude,
            "lng": cam.longitude,
            "flow_rate_vph": cam.flow_rate_vph,
            "avg_speed_kmh": cam.avg_speed_kmh,
            "intensity": intensity
        })
    return points

@router.get("/history", response_model=List[Dict[str, Any]])
@limiter.limit("60/minute")
def get_traffic_history(request: Request):
    """Retrieve historical 24-hour traffic volume and speed trend analytics."""
    hours = ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"]
    volumes = [120, 80, 45, 310, 890, 720, 680, 740, 950, 860, 510, 240]
    avg_speeds = [68, 72, 75, 52, 28, 38, 42, 36, 22, 31, 48, 62]
    
    history = []
    for h, v, s in zip(hours, volumes, avg_speeds):
        history.append({
            "hour": h,
            "vehicle_volume": v,
            "avg_speed_kmh": s,
            "congestion_pct": round(max(10, min(95, 100 - (s / 75 * 100))), 1)
        })
    return history
