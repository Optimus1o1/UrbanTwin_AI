from typing import List, Dict, Any, Union
from fastapi import APIRouter, HTTPException, Request
from app.models.schemas import CrossCameraMatch, VehicleTrajectory, TrajectoryQuery
from app.services.matching_service import (
    get_all_matches, get_vehicle_trajectory, reconstruct_trajectory, get_all_recent_tracked_vehicles
)
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/vehicles", tags=["Vehicle Re-ID & Trajectory Tracking"])

@router.get("", response_model=List[CrossCameraMatch])
@router.get("/matches", response_model=List[CrossCameraMatch])
@limiter.limit("60/minute")
def list_vehicle_matches(request: Request):
    """Retrieve multi-camera vehicle re-identification matching confidence results."""
    return get_all_matches()

@router.get("/tracked", response_model=List[Dict[str, Any]])
@limiter.limit("60/minute")
def list_tracked_vehicles(request: Request):
    """Retrieve catalog of all recently tracked vehicle plates across the city ANPR network."""
    return get_all_recent_tracked_vehicles()

@router.get("/{vehicle_id}/trajectory", response_model=Union[CrossCameraMatch, VehicleTrajectory])
@limiter.limit("60/minute")
def get_trajectory(request: Request, vehicle_id: str):
    """
    Spatial-Temporal Trajectory Reconstruction & Multi-Camera Re-ID:
    Retrieves full camera sequence timeline and multi-factor matching breakdown for a global vehicle ID or plate.
    """
    # Check legacy/global vehicle match first (e.g. V1023, V4089)
    legacy = get_vehicle_trajectory(vehicle_id)
    if legacy:
        return legacy
        
    # Check plate trajectory reconstruction
    traj = reconstruct_trajectory(vehicle_id)
    if traj:
        return traj

    raise HTTPException(status_code=404, detail=f"Vehicle trajectory for '{vehicle_id}' not found. Try 'V1023' or '7XYZ912'")

@router.post("/trajectory/query", response_model=VehicleTrajectory)
@limiter.limit("60/minute")
def query_trajectory(request: Request, query: TrajectoryQuery):
    """Query vehicle trajectory by plate text with optional time and class filters."""
    traj = reconstruct_trajectory(query.plate_query)
    if not traj:
        raise HTTPException(
            status_code=404,
            detail=f"No trajectory matches query '{query.plate_query}'"
        )
    return traj
