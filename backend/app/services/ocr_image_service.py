"""
UrbanTwin AI - Real Image OCR Service
Uses EasyOCR to perform actual text recognition on uploaded license plate images.
"""

import io
from typing import Tuple, Optional, List
from PIL import Image

# Lazy-loaded EasyOCR reader (singleton)
_OCR_READER = None
_OCR_INIT_ATTEMPTED = False


def _get_ocr_reader():
    """Lazy-initialize EasyOCR reader. First call downloads models (~100MB)."""
    global _OCR_READER, _OCR_INIT_ATTEMPTED
    if _OCR_READER is not None:
        return _OCR_READER
    if _OCR_INIT_ATTEMPTED:
        return None
    _OCR_INIT_ATTEMPTED = True
    try:
        import easyocr
        _OCR_READER = easyocr.Reader(
            ['en'],
            gpu=False,  # Use CPU for compatibility; set True if CUDA available
            verbose=False
        )
        print("[OCRImageService] EasyOCR reader initialized successfully")
        return _OCR_READER
    except Exception as e:
        print(f"[OCRImageService] Warning: Failed to initialize EasyOCR: {e}")
        return None


def _post_process_plate_text(raw_texts: List[Tuple]) -> Tuple[str, float]:
    """
    Post-process EasyOCR results to extract the best license plate candidate.
    
    EasyOCR returns: [(bbox, text, confidence), ...]
    We filter for alphanumeric text blocks that look like plate numbers.
    """
    if not raw_texts:
        return ("", 0.0)

    best_plate = ""
    best_confidence = 0.0

    for detection in raw_texts:
        bbox, text, confidence = detection
        # Clean: uppercase, strip non-alphanumeric
        cleaned = ''.join(c for c in text.upper() if c.isalnum())
        
        if len(cleaned) < 2:
            continue

        # Score candidates: prefer longer alphanumeric strings with higher confidence
        # License plates are typically 4-12 characters
        score = confidence
        if 4 <= len(cleaned) <= 12:
            score *= 1.5  # Boost plate-length candidates
        if any(c.isdigit() for c in cleaned) and any(c.isalpha() for c in cleaned):
            score *= 1.3  # Boost mixed alpha-numeric (typical plate format)
        
        if score > best_confidence or (score == best_confidence and len(cleaned) > len(best_plate)):
            best_plate = cleaned
            best_confidence = confidence

    # If no good candidate, concatenate all detected text
    if not best_plate:
        all_text = ''.join(
            ''.join(c for c in det[1].upper() if c.isalnum())
            for det in raw_texts
        )
        avg_conf = sum(det[2] for det in raw_texts) / len(raw_texts) if raw_texts else 0.0
        return (all_text[:12] if all_text else "", avg_conf)

    return (best_plate[:12], best_confidence)


def recognize_plate_from_image(image_bytes: bytes) -> Tuple[str, float, str]:
    """
    Perform real OCR on an uploaded license plate image.
    
    Args:
        image_bytes: Raw image bytes from the uploaded file
        
    Returns:
        Tuple of (recognized_plate_text, confidence, engine_name)
    """
    reader = _get_ocr_reader()
    
    if reader is None:
        return ("", 0.0, "EasyOCR (unavailable)")

    try:
        # Convert bytes to PIL Image and ensure RGB
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # Run EasyOCR on the image
        import numpy as np
        img_array = np.array(pil_image)
        results = reader.readtext(img_array)
        
        if not results:
            return ("", 0.0, "EasyOCR")

        plate_text, confidence = _post_process_plate_text(results)
        
        return (plate_text, round(confidence, 4), "EasyOCR")
        
    except Exception as e:
        print(f"[OCRImageService] Error during OCR: {e}")
        return ("", 0.0, f"EasyOCR (error: {str(e)[:50]})")
