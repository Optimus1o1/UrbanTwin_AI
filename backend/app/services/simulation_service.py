from datetime import datetime
from app.models.schemas import SimulationScenario, SimulationResult, SimulationComparisonItem, RoadSimulationMetric
from app.services.graph_service import ROAD_SEGMENTS_DB, LIVE_METRICS_DB

DETOUR_MAPPINGS = {
    "ROAD-A-B": ["ROAD-B-C", "ROAD-C-D"],
    "ROAD-B-C": ["ROAD-A-B", "ROAD-C-D"],
    "ROAD-C-D": ["ROAD-B-C", "ROAD-D-E"],
    "ROAD-D-E": ["ROAD-C-D", "ROAD-E-F"],
    "ROAD-E-F": ["ROAD-D-E", "ROAD-F-A"],
    "ROAD-F-A": ["ROAD-E-F", "ROAD-A-B"]
}

def run_whatif_simulation(scenario: SimulationScenario) -> SimulationResult:
    """
    Digital Twin What-If Simulation Engine:
    Evaluates traffic network interventions (Road closures, traffic volume surges, signal timing changes)
    and computes estimated BEFORE vs AFTER outcomes for city-wide congestion, speed, and delay,
    along with granular per-road segment impact metrics for 3D twin visualization.
    """
    # Baseline calculations
    base_congestion = 64.0
    base_speed = 26.0
    base_delay = 8.2
    
    # Calculate simulation deltas
    congestion_delta = 0.0
    speed_delta = 0.0
    delay_delta = 0.0
    
    closed_set = set(scenario.closed_roads or [])
    detour_set = set()
    for cr in closed_set:
        detour_set.update(DETOUR_MAPPINGS.get(cr, ["ROAD-B-C", "ROAD-C-D"]))
    detour_set.difference_update(closed_set)

    # Impact of road closures (redirects traffic to adjacent corridors)
    if closed_set:
        closure_count = len(closed_set)
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
    
    # Build per-road segment simulation metrics
    road_impacts = []
    for road in ROAD_SEGMENTS_DB:
        base_data = LIVE_METRICS_DB.get(road.road_id, {
            "congestion_pct": 50.0,
            "avg_speed_kmh": 40.0,
            "vehicle_count": 80
        })
        b_cong = float(base_data["congestion_pct"])
        b_spd = float(base_data["avg_speed_kmh"])
        b_count = int(base_data["vehicle_count"])

        if road.road_id in closed_set:
            sim_cong = 100.0
            sim_spd = 0.0
            status = "CLOSED"
            is_closed = True
            is_detour = False
            flow = 0
        elif road.road_id in detour_set:
            # Spillover surge on detour corridor
            detour_spike = 24.0 + (scenario.traffic_volume_change_pct * 0.3)
            sim_cong = max(10.0, min(96.0, round(b_cong + detour_spike, 1)))
            sim_spd = max(10.0, min(road.speed_limit_kmh, round(b_spd * 0.65, 1)))
            status = "DETOUR_CONGESTED"
            is_closed = False
            is_detour = True
            flow = int(b_count * 12 * (1.35 + scenario.traffic_volume_change_pct / 100.0))
        else:
            # General volume impact
            sim_cong = max(10.0, min(95.0, round(b_cong + (scenario.traffic_volume_change_pct * 0.4), 1)))
            sim_spd = max(12.0, min(road.speed_limit_kmh, round(b_spd * (1.0 - scenario.traffic_volume_change_pct * 0.005), 1)))
            status = "FREE_FLOW" if sim_cong < 35.0 else ("HEAVY_FLOW" if sim_cong > 65.0 else "NORMAL")
            is_closed = False
            is_detour = False
            flow = max(100, int(b_count * 10 * (1.0 + scenario.traffic_volume_change_pct / 100.0)))

        road_impacts.append(RoadSimulationMetric(
            road_id=road.road_id,
            road_name=road.name,
            start_node=road.start_node,
            end_node=road.end_node,
            length_km=road.length_km,
            base_congestion_pct=b_cong,
            simulated_congestion_pct=sim_cong,
            base_speed_kmh=b_spd,
            simulated_speed_kmh=sim_spd,
            status=status,
            is_closed=is_closed,
            is_detour=is_detour,
            traffic_flow_vph=flow
        ))

    affected = list(closed_set.union(detour_set))
    if not affected:
        affected = ["ROAD-A-B", "ROAD-B-C", "ROAD-C-D"]

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
        affected_roads=affected,
        timestamp=datetime.utcnow().isoformat(),
        overall_congestion_before=base_congestion,
        overall_congestion_after=after_congestion,
        avg_speed_before_kmh=base_speed,
        avg_speed_after_kmh=after_speed,
        avg_delay_before_min=base_delay,
        avg_delay_after_min=after_delay,
        road_impacts=road_impacts
    )
