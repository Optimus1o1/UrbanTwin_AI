from datetime import datetime
from app.models.schemas import SimulationScenario, SimulationResult, SimulationComparisonItem

def run_whatif_simulation(scenario: SimulationScenario) -> SimulationResult:
    """
    Digital Twin What-If Simulation Engine:
    Evaluates traffic network interventions (Road closures, traffic volume surges, signal timing changes)
    and computes estimated BEFORE vs AFTER outcomes for city-wide congestion, speed, and delay.
    """
    # Baseline calculations
    base_congestion = 64.0
    base_speed = 26.0
    base_delay = 8.2
    
    # Calculate simulation deltas
    congestion_delta = 0.0
    speed_delta = 0.0
    delay_delta = 0.0
    
    # Impact of road closures (redirects traffic to adjacent corridors)
    if scenario.closed_roads:
        closure_count = len(scenario.closed_roads)
        congestion_delta += closure_count * 12.5
        speed_delta -= closure_count * 5.2
        delay_delta += closure_count * 2.1
        
    # Impact of traffic volume changes (+/- %)
    vol_impact = scenario.traffic_volume_change_pct * 0.45
    congestion_delta += vol_impact
    speed_delta -= vol_impact * 0.35
    delay_delta += vol_impact * 0.08
    
    # Impact of signal timing optimizations (increasing green light time reduces congestion and delay)
    if scenario.signal_timing_adjustments:
        timing_boost = sum(scenario.signal_timing_adjustments.values()) * 0.25
        congestion_delta -= timing_boost * 1.8
        speed_delta += timing_boost * 0.8
        delay_delta -= timing_boost * 0.35

    # Compute AFTER values
    after_congestion = max(10.0, min(98.0, round(base_congestion + congestion_delta, 1)))
    after_speed = max(8.0, min(90.0, round(base_speed + speed_delta, 1)))
    after_delay = max(1.5, min(30.0, round(base_delay + delay_delta, 1)))
    
    # Comparison metrics
    items = [
        SimulationComparisonItem(
            metric_name="Network Congestion Index",
            before=f"{base_congestion:.1f}%",
            after=f"{after_congestion:.1f}%",
            change_pct=round(((after_congestion - base_congestion) / base_congestion) * 100, 1),
            is_improvement=after_congestion < base_congestion
        ),
        SimulationComparisonItem(
            metric_name="Average Corridor Speed",
            before=f"{base_speed:.1f} km/h",
            after=f"{after_speed:.1f} km/h",
            change_pct=round(((after_speed - base_speed) / base_speed) * 100, 1),
            is_improvement=after_speed > base_speed
        ),
        SimulationComparisonItem(
            metric_name="Commuter Travel Delay",
            before=f"{base_delay:.1f} min",
            after=f"{after_delay:.1f} min",
            change_pct=round(((after_delay - base_delay) / base_delay) * 100, 1),
            is_improvement=after_delay < base_delay
        )
    ]
    
    affected = scenario.closed_roads + ["ROAD-B-C", "ROAD-C-D"]
    
    desc_parts = []
    if scenario.closed_roads:
        desc_parts.append(f"Road Closures: {', '.join(scenario.closed_roads)}")
    if scenario.traffic_volume_change_pct != 0:
        desc_parts.append(f"Volume Change: {scenario.traffic_volume_change_pct:+.1f}%")
    if scenario.signal_timing_adjustments:
        desc_parts.append(f"Signal Optimization: {len(scenario.signal_timing_adjustments)} junctions")
        
    desc = " | ".join(desc_parts) if desc_parts else "Default Baseline Scenario"

    return SimulationResult(
        scenario_id=f"SIM-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}",
        description=desc,
        metrics=items,
        affected_roads=list(set(affected)),
        timestamp=datetime.utcnow().isoformat()
    )
