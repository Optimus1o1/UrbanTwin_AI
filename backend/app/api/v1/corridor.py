from typing import List
from fastapi import APIRouter, HTTPException, status
from app.models.schemas import (
    GreenCorridorRoute,
    CorridorDispatchRequest,
    SignalOverrideRequest,
    CorridorTelemetry
)
from app.services import corridor_service

router = APIRouter(prefix="/corridors", tags=["Green Corridor"])

@router.get("", response_model=List[GreenCorridorRoute], summary="List all emergency corridors")
def list_corridors():
    """Retrieve all active and recorded emergency vehicle green corridors."""
    return corridor_service.get_all_corridors()

@router.get("/telemetry", response_model=CorridorTelemetry, summary="First responder intervention telemetry")
def get_corridor_telemetry():
    """Get macroscopic metrics on green corridor interventions, minutes saved, and signal preemption."""
    return corridor_service.get_corridor_telemetry()

@router.get("/{corridor_id}", response_model=GreenCorridorRoute, summary="Get corridor details by ID")
def get_corridor(corridor_id: str):
    """Retrieve comprehensive corridor details including vehicle location and downstream signal states."""
    corridor = corridor_service.get_corridor_by_id(corridor_id)
    if not corridor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Corridor '{corridor_id}' not found")
    return corridor

@router.post("/dispatch", response_model=GreenCorridorRoute, status_code=status.HTTP_201_CREATED, summary="Dispatch emergency vehicle corridor")
def dispatch_corridor(req: CorridorDispatchRequest):
    """
    Dispatch an emergency vehicle (Ambulance, Fire Engine, Organ Transport).
    Auto-computes optimal GIS path, downstream signal arrival ETAs, and registers signal controllers.
    """
    return corridor_service.dispatch_emergency_corridor(req)

@router.post("/{corridor_id}/activate", response_model=GreenCorridorRoute, summary="Activate dynamic green wave preemption")
def activate_corridor(corridor_id: str):
    """
    Interfaces with traffic signal controllers along the corridor.
    Switches downstream signals to PREEMPTED_GREEN, clears queues, and locks cross-streets in ALL_RED_HOLD.
    """
    corridor = corridor_service.activate_corridor_preemption(corridor_id)
    if not corridor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Corridor '{corridor_id}' not found")
    return corridor

@router.post("/{corridor_id}/deactivate", response_model=GreenCorridorRoute, summary="Deactivate corridor and restore signal cycles")
def deactivate_corridor(corridor_id: str):
    """Deactivates green corridor and initiates smooth progressive transition recovery for normal traffic."""
    corridor = corridor_service.deactivate_corridor(corridor_id)
    if not corridor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Corridor '{corridor_id}' not found")
    return corridor

@router.post("/{corridor_id}/signal-override", response_model=GreenCorridorRoute, summary="Manual operator signal override")
def signal_override(corridor_id: str, req: SignalOverrideRequest):
    """Manually force green, extend green window (+30s), or restore normal cycle for a specific junction."""
    corridor = corridor_service.override_junction_signal(corridor_id, req)
    if not corridor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Corridor '{corridor_id}' not found")
    return corridor

@router.post("/{corridor_id}/simulate-step", response_model=GreenCorridorRoute, summary="Simulate vehicle progress along corridor")
def simulate_step(corridor_id: str):
    """Advances emergency vehicle position along route, updates ETAs, flushes downstream queues, and releases passed signals."""
    corridor = corridor_service.simulate_step_progress(corridor_id)
    if not corridor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Corridor '{corridor_id}' not found")
    return corridor
