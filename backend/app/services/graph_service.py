from typing import List, Optional
from datetime import datetime
from app.models.schemas import RoadSegment, TrafficMetrics

ROAD_SEGMENTS_DB: List[RoadSegment] = [
    RoadSegment(road_id="ROAD-A-B", name="MG Road - Trinity Corridor", start_node="Junction_Trinity", end_node="Junction_Indiranagar", length_km=3.2, speed_limit_kmh=50.0),
    RoadSegment(road_id="ROAD-B-C", name="100ft Road - Domlur Expressway", start_node="Junction_Indiranagar", end_node="Junction_Domlur", length_km=2.8, speed_limit_kmh=60.0),
    RoadSegment(road_id="ROAD-C-D", name="Intermediate Ring Road - Koramangala", start_node="Junction_Domlur", end_node="Junction_Koramangala", length_km=4.1, speed_limit_kmh=55.0),
    RoadSegment(road_id="ROAD-D-E", name="Hosur Main Road - Silk Board Interchange", start_node="Junction_Koramangala", end_node="Junction_SilkBoard", length_km=3.6, speed_limit_kmh=50.0),
    RoadSegment(road_id="ROAD-E-F", name="Outer Ring Road - Bellandur Tech Corridor", start_node="Junction_SilkBoard", end_node="Junction_Bellandur", length_km=5.4, speed_limit_kmh=70.0),
    RoadSegment(road_id="ROAD-F-A", name="Electronic City Elevated Tollway", start_node="Junction_Bellandur", end_node="Junction_Trinity", length_km=9.8, speed_limit_kmh=80.0)
]

# Baseline live metrics
LIVE_METRICS_DB = {
    "ROAD-A-B": {"vehicle_count": 87, "avg_speed_kmh": 19.0, "density": "High", "queue_length_m": 340.0, "travel_time_min": 7.6, "congestion_pct": 78.0},
    "ROAD-B-C": {"vehicle_count": 142, "avg_speed_kmh": 68.0, "density": "Medium", "queue_length_m": 80.0, "travel_time_min": 3.6, "congestion_pct": 32.0},
    "ROAD-C-D": {"vehicle_count": 115, "avg_speed_kmh": 22.0, "density": "High", "queue_length_m": 290.0, "travel_time_min": 4.9, "congestion_pct": 71.0},
    "ROAD-D-E": {"vehicle_count": 64, "avg_speed_kmh": 54.0, "density": "Low", "queue_length_m": 45.0, "travel_time_min": 3.9, "congestion_pct": 24.0},
    "ROAD-E-F": {"vehicle_count": 98, "avg_speed_kmh": 31.0, "density": "Medium", "queue_length_m": 180.0, "travel_time_min": 5.6, "congestion_pct": 55.0},
    "ROAD-F-A": {"vehicle_count": 52, "avg_speed_kmh": 62.0, "density": "Low", "queue_length_m": 30.0, "travel_time_min": 4.8, "congestion_pct": 18.0}
}

def get_all_road_segments() -> List[RoadSegment]:
    return ROAD_SEGMENTS_DB

def get_road_metrics(road_id: str) -> Optional[TrafficMetrics]:
    if road_id not in LIVE_METRICS_DB:
        return None
    data = LIVE_METRICS_DB[road_id]
    return TrafficMetrics(
        road_id=road_id,
        timestamp=datetime.utcnow().isoformat(),
        vehicle_count=data["vehicle_count"],
        avg_speed_kmh=data["avg_speed_kmh"],
        density=data["density"],
        queue_length_m=data["queue_length_m"],
        travel_time_min=data["travel_time_min"],
        congestion_pct=data["congestion_pct"]
    )

def get_all_traffic_current() -> List[TrafficMetrics]:
    result = []
    for road in ROAD_SEGMENTS_DB:
        metrics = get_road_metrics(road.road_id)
        if metrics:
            result.append(metrics)
    return result
