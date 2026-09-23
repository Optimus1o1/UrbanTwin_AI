import base64
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from app.models.schemas import (
    Camera, OCRTestRequest, OCRTestResponse, OCRUploadResponse, OCRBase64UploadRequest
)
from app.services import camera_service, detection_service, anpr_service
from app.core.rate_limiter import limiter

router = APIRouter(prefix="/cameras", tags=["Camera Feeds & ANPR Ingestion"])

@router.get("", response_model=List[Camera])
@limiter.limit("60/minute")
def list_cameras(request: Request):
    """Retrieve catalog of all traffic cameras and active stream states across the city network."""
    return camera_service.get_all_cameras()

@router.get("/{camera_id}", response_model=Camera)
@limiter.limit("60/minute")
def get_camera(request: Request, camera_id: str):
    """Retrieve detailed state for a specific camera stream."""
    cam = camera_service.get_camera_by_id(camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found")
    return cam

@router.post("/{camera_id}/process", response_model=Dict[str, Any])
@limiter.limit("30/minute")
def process_camera_frame(request: Request, camera_id: str):
    """
    Triggers live frame processing pipeline for a camera feed:
    1. Deep neural vehicle detection & bounding box calculation
    2. Multi-lane tracking assignment
    3. High-Accuracy ANPR OCR + Salted SHA-256 PII plate anonymization
    """
    cam = camera_service.get_camera_by_id(camera_id)
    if not cam:
        raise HTTPException(status_code=404, detail=f"Camera '{camera_id}' not found")
        
    detections = detection_service.generate_live_detections(camera_id, count=6)
    
    # Process ANPR observation for one detected vehicle safely
    track_id = str(detections[0].track_id) if detections else "1001"
    sample_plate = anpr_service.process_anpr_ocr(camera_id, track_id)
    
    return {
        "camera_id": camera_id,
        "camera_name": cam.name,
        "fps": cam.fps,
        "flow_rate_vph": cam.flow_rate_vph,
        "detections_count": len(detections),
        "detections": [d.model_dump() for d in detections],
        "sample_plate_observation": sample_plate.model_dump()
    }

@router.post("/ocr_test", response_model=OCRTestResponse)
@limiter.limit("60/minute")
def test_ocr_performance(request: Request, req: OCRTestRequest):
    """
    Interactive OCR Degradation Testing Studio:
    Benchmarks deep-learning OCR recognition under simulated real-world conditions
    (Rain, Night Glare, Motion Blur, Oblique Perspective, Dirty Plates).
    Verifies that system maintains >90% precision.
    """
    return anpr_service.test_ocr_degradation_pipeline(req)

@router.post("/ocr_upload", response_model=OCRUploadResponse)
@limiter.limit("60/minute")
def upload_plate_image(request: Request, file: UploadFile = File(...)):
    """
    Deep-Learning ANPR OCR Upload Endpoint:
    Accepts real vehicle or plate images (JPEG/PNG/WEBP/BMP), executes multi-stage
    plate localization, homography/CLAHE enhancement, CRAFT/EasyOCR deep inference,
    and returns full plate character confidences + vector SVG.
    """
    if not file:
        raise HTTPException(status_code=400, detail="No image file provided")

    contents = file.file.read()
    if not contents or len(contents) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty")

    return anpr_service.process_uploaded_plate_image(contents, filename=file.filename or "upload.jpg")

@router.post("/ocr_image_base64", response_model=OCRUploadResponse)
@limiter.limit("60/minute")
def upload_plate_image_base64(request: Request, req: OCRBase64UploadRequest):
    """
    Deep-Learning ANPR OCR Base64 Upload Endpoint:
    Accepts base64 encoded image string for JSON-only API clients.
    """
    b64_str = req.image_base64.strip()
    if not b64_str:
        raise HTTPException(status_code=400, detail="Base64 image content is required")

    if "," in b64_str:
        b64_str = b64_str.split(",", 1)[1]

    try:
        raw_bytes = base64.b64decode(b64_str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {e}")

    return anpr_service.process_uploaded_plate_image(raw_bytes, filename=req.filename or "upload.jpg")
