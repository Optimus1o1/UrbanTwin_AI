import random
from datetime import datetime
from typing import List, Dict, Any
from app.models.schemas import (
    CityMacroOverview, TrafficDensity, LevelOfService, ODMatrix, ODPair, TrafficForecast
)
from app.services.camera_service import CAMERAS_DB

class MacroTrafficService:
    @staticmethod
    def get_traffic_density_all() -> List[TrafficDensity]:
        densities: List[TrafficDensity] = []
        for cam in CAMERAS_DB:
            # Determine Level of Service based on speed & flow
            if cam.avg_speed_kmh >= 55.0:
                los = LevelOfService.LOS_A
                occ = 18.5
                score = 15.0
            elif cam.avg_speed_kmh >= 45.0:
                los = LevelOfService.LOS_B
                occ = 32.0
                score = 30.0
            elif cam.avg_speed_kmh >= 35.0:
                los = LevelOfService.LOS_C
                occ = 48.0
                score = 52.0
            elif cam.avg_speed_kmh >= 25.0:
                los = LevelOfService.LOS_D
                occ = 68.0
                score = 74.0
            elif cam.avg_speed_kmh >= 15.0:
                los = LevelOfService.LOS_E
                occ = 85.0
                score = 88.0
            else:
                los = LevelOfService.LOS_F
                occ = 96.0
                score = 98.0

            densities.append(TrafficDensity(
                camera_id=cam.camera_id,
                camera_name=cam.name,
                road_id=cam.road_id,
                flow_rate_vph=cam.flow_rate_vph,
                occupancy_pct=occ,
                avg_speed_kmh=cam.avg_speed_kmh,
                level_of_service=los,
                congestion_score=score
            ))
        return densities

    @staticmethod
    def get_od_matrix() -> ODMatrix:
        pairs = [
            ODPair(
                origin_id="CAM_01",
                origin_name="MG Road - Trinity Junction",
                destination_id="CAM_03",
                destination_name="Koramangala Financial Core",
                trips_per_hour=340,
                avg_transit_minutes=12.5,
                dominant_vehicle_type="Sedans & Hatchbacks",
                congestion_index=68.5
            ),
            ODPair(
                origin_id="CAM_02",
                origin_name="Indiranagar 100ft Express",
                destination_id="CAM_05",
                destination_name="Outer Ring Road Tech Hub",
                trips_per_hour=480,
                avg_transit_minutes=18.2,
                dominant_vehicle_type="Corporate Cabs & Tech Vans",
                congestion_index=79.0
            ),
            ODPair(
                origin_id="CAM_04",
                origin_name="West River Crossing Flyover",
                destination_id="CAM_01",
                destination_name="MG Road Arterial",
                trips_per_hour=290,
                avg_transit_minutes=9.8,
                dominant_vehicle_type="Mixed Freight & Commuters",
                congestion_index=42.0
            ),
            ODPair(
                origin_id="CAM_05",
                origin_name="Bellandur Tech Hub",
                destination_id="CAM_06",
                destination_name="Electronic City Tollway",
                trips_per_hour=415,
                avg_transit_minutes=14.0,
                dominant_vehicle_type="Buses & 2-Wheelers",
                congestion_index=61.2
            )
        ]
        return ODMatrix(
            timestamp=datetime.utcnow().isoformat(),
            total_active_trips=sum(p.trips_per_hour for p in pairs),
            top_origin_destination_pairs=pairs,
            dominant_commuter_corridor="Indiranagar -> Outer Ring Road Tech Hub (480 trips/hr)"
        )

    @staticmethod
    def get_macro_overview() -> CityMacroOverview:
        densities = MacroTrafficService.get_traffic_density_all()
        od = MacroTrafficService.get_od_matrix()
        
        avg_speed = round(sum(c.avg_speed_kmh for c in CAMERAS_DB) / len(CAMERAS_DB), 1)

        f15 = TrafficForecast(
            horizon_minutes=15,
            projected_flow_vph=3980,
            projected_avg_speed_kmh=41.2,
            predicted_los=LevelOfService.LOS_C,
            congestion_probability=0.38
        )
        f30 = TrafficForecast(
            horizon_minutes=30,
            projected_flow_vph=4450,
            projected_avg_speed_kmh=36.5,
            predicted_los=LevelOfService.LOS_D,
            congestion_probability=0.64
        )
        f60 = TrafficForecast(
            horizon_minutes=60,
            projected_flow_vph=4820,
            projected_avg_speed_kmh=31.8,
            predicted_los=LevelOfService.LOS_D,
            congestion_probability=0.78
        )

        return CityMacroOverview(
            total_cameras=len(CAMERAS_DB),
            online_cameras=sum(1 for c in CAMERAS_DB if c.status == "ONLINE"),
            total_plates_scanned_today=18450,
            current_city_avg_speed_kmh=avg_speed,
            peak_congested_corridor="Koramangala Sony World Crossing (LOS D / 24.8 km/h)",
            active_hotlist_alerts=2,
            system_ocr_accuracy_benchmark_pct=94.6,
            density_by_camera=densities,
            od_summary=od,
            forecast_15m=f15,
            forecast_30m=f30,
            forecast_60m=f60
        )
