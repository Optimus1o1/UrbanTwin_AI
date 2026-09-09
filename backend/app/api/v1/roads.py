from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Request
from app.models.schemas import RoadSegment, TrafficMetrics
from app.services.graph_service import get_all_road_segments, get_road_metrics
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/roads", tags=["Road Network Graph"])

@router.get("", response_model=List[RoadSegment])
@limiter.limit("60/minute")
def list_roads(request: Request):
    """Retrieve road network topology segments."""
    return get_all_road_segments()

@router.get("/{road_id}/analytics", response_model=TrafficMetrics)
@limiter.limit("60/minute")
def get_road_analytics(request: Request, road_id: str):
    """Retrieve live metrics and congestion score for a specific road segment."""
    metrics = get_road_metrics(road_id)
    if not metrics:
        raise HTTPException(status_code=404, detail=f"Road segment '{road_id}' not found")
    return metrics
