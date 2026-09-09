from fastapi import APIRouter, Request
from app.models.schemas import SimulationScenario, SimulationResult
from app.services.simulation_service import run_whatif_simulation
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/simulation", tags=["Digital Twin What-If Simulation"])

@router.post("", response_model=SimulationResult)
@limiter.limit("20/minute")
def simulate_scenario(request: Request, scenario: SimulationScenario):
    """
    Executes a Digital Twin What-If Simulation:
    Evaluates scenario changes (Road closures, traffic surge +X%, traffic signal adjustments)
    and computes estimated BEFORE vs AFTER outcomes for congestion %, average speed, and delay.
    """
    return run_whatif_simulation(scenario)
