import random
from datetime import datetime
from typing import List
from app.models.schemas import Detection

VEHICLE_CLASSES = ["car", "car", "car", "bus", "truck", "motorcycle"]

def generate_live_detections(camera_id: str, count: int = 6) -> List[Detection]:
    """
    Simulates YOLO object detection inference output for a given camera feed frame.
    Generates realistic bounding boxes [x1, y1, x2, y2], confidence scores, vehicle classes, and speeds.
    """
    random.seed(hash(camera_id) + int(datetime.utcnow().timestamp()) // 5)
    detections = []
    
    for i in range(count):
        v_class = random.choice(VEHICLE_CLASSES)
        confidence = round(random.uniform(0.85, 0.98), 2)
        
        # Bounding box simulation in 1280x720 video canvas coordinates
        x1 = random.randint(50, 1000)
        y1 = random.randint(100, 500)
        w = random.randint(90, 220) if v_class in ["bus", "truck"] else random.randint(60, 140)
        h = random.randint(80, 180) if v_class in ["bus", "truck"] else random.randint(50, 110)
        
        track_id = 1000 + (i * 37 + hash(camera_id) % 900) % 8000
        speed = round(random.uniform(22.0, 68.0), 1)
        
        det = Detection(
            detection_id=f"DET-{camera_id}-{i+1:03d}",
            camera_id=camera_id,
            timestamp=datetime.utcnow().isoformat(),
            vehicle_class=v_class,
            bbox=[float(x1), float(y1), float(x1 + w), float(y1 + h)],
            confidence=confidence,
            track_id=track_id,
            speed_kmh=speed
        )
        detections.append(det)
        
    return detections
