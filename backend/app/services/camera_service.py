from typing import List, Optional
from app.models.schemas import Camera, CameraStatus

CAMERAS_DB: List[Camera] = [
    Camera(
        camera_id="CAM_01",
        name="MG Road - Trinity Junction",
        sector="Central Commercial Hub",
        latitude=12.9756,
        longitude=77.6067,
        road_id="ROAD-A-B",
        road_name="MG Road Arterial",
        status=CameraStatus.ONLINE,
        fps=30.0,
        flow_rate_vph=580,
        avg_speed_kmh=42.5,
        plates_scanned_last_hour=492,
        optical_quality="4K Ultra-HD HDR (Low-Lux)"
    ),
    Camera(
        camera_id="CAM_02",
        name="Indiranagar 100ft Express Corridor",
        sector="East Transit District",
        latitude=12.9784,
        longitude=77.6408,
        road_id="ROAD-B-C",
        road_name="100ft Express Arterial",
        status=CameraStatus.ONLINE,
        fps=30.0,
        flow_rate_vph=710,
        avg_speed_kmh=56.0,
        plates_scanned_last_hour=640,
        optical_quality="4K Dual-Sensor Thermal/RGB"
    ),
    Camera(
        camera_id="CAM_03",
        name="Koramangala Sony World Crossing",
        sector="Financial & Tech Core",
        latitude=12.9352,
        longitude=77.6245,
        road_id="ROAD-C-D",
        road_name="Intermediate Ring Road",
        status=CameraStatus.ONLINE,
        fps=30.0,
        flow_rate_vph=890,
        avg_speed_kmh=24.8,
        plates_scanned_last_hour=785,
        optical_quality="4K Ultra-HD HDR (Anti-Glare)"
    ),
    Camera(
        camera_id="CAM_04",
        name="West River Crossing & Flyover Interchange",
        sector="West Industrial Gateway",
        latitude=12.9550,
        longitude=77.5680,
        road_id="ROAD-D-E",
        road_name="River Bypass Flyover",
        status=CameraStatus.ONLINE,
        fps=30.0,
        flow_rate_vph=460,
        avg_speed_kmh=62.4,
        plates_scanned_last_hour=410,
        optical_quality="4K Optical Zoom 30x"
    ),
    Camera(
        camera_id="CAM_05",
        name="Outer Ring Road - Bellandur Tech Hub",
        sector="South-East Tech Corridor",
        latitude=12.9260,
        longitude=77.6762,
        road_id="ROAD-E-F",
        road_name="Outer Ring Road Expressway",
        status=CameraStatus.ONLINE,
        fps=30.0,
        flow_rate_vph=620,
        avg_speed_kmh=38.0,
        plates_scanned_last_hour=550,
        optical_quality="4K Ultra-HD HDR"
    ),
    Camera(
        camera_id="CAM_06",
        name="Electronic City Tollway Expressway",
        sector="South Tech Corridor",
        latitude=12.8452,
        longitude=77.6602,
        road_id="ROAD-F-A",
        road_name="Hosur Elevated Tollway",
        status=CameraStatus.ONLINE,
        fps=30.0,
        flow_rate_vph=510,
        avg_speed_kmh=48.6,
        plates_scanned_last_hour=465,
        optical_quality="4K High-Speed Capture (150 km/h)"
    )
]

def get_all_cameras() -> List[Camera]:
    return CAMERAS_DB

def get_camera_by_id(camera_id: str) -> Optional[Camera]:
    for cam in CAMERAS_DB:
        if cam.camera_id.upper() == camera_id.upper():
            return cam
    return None
