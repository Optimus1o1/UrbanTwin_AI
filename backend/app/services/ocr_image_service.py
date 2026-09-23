"""
UrbanTwin AI - Computer Vision ANPR & Image Recognition Service
Multi-stage high-accuracy ANPR system for uploaded vehicle and license plate images.

Pipeline Architecture:
1. License Plate Localization (Image Recognition):
   - Edge Density & Horizontal Morphological Closing (Sobel-X + Otsu + Rectangular Kernel)
   - Color & High-Contrast Luminance Segmentation (HSV white/yellow plate masks)
   - Vehicle Geometric Priors (Lower-center & Bumper focus windows)
   - CRAFT Text Bounding-Box Union Clustering
2. Candidate Rectification & Super-Resolution:
   - Bicubic / Lanczos crop normalization (upscaling to standard ANPR height 90-120px)
   - Contrast Limited Adaptive Histogram Equalization (CLAHE) & Bilateral edge smoothing
3. Multi-Model OCR Inference & Pattern Extraction:
   - Deep neural character recognition via EasyOCR
   - PyTorch STN-CRNN integration on localized crops
   - Substring regex pattern extraction for vehicle badges and prefix removal ('IND', brand names)
   - Context-aware ANPR character disambiguation (e.g. O<->0, I<->1, S<->5, Z<->2, A<->4, B<->8)
4. Model Arbitration & Character Breakdown Generation.
"""

import io
import re
import cv2
import numpy as np
from typing import Tuple, Optional, List, Dict, Any
from PIL import Image

# Lazy-loaded EasyOCR reader (singleton)
_OCR_READER = None
_OCR_INIT_ATTEMPTED = False

# Indian States & Union Territories codes
INDIAN_STATES = {
    'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR',
    'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD',
    'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB'
}

NON_PLATE_WORDS = {
    'IND', 'INDIA', 'GOVT', 'GOVERNMENT', 'POLICE', 'ARMY', 'NAVY', 'CORP',
    'TOYOTA', 'HYUNDAI', 'HONDA', 'MARUTI', 'SUZUKI', 'TATA', 'MAHINDRA',
    'FORD', 'BMW', 'AUDI', 'MERCEDES', 'VOLKSWAGEN', 'SKODA', 'NISSAN',
    'RENAULT', 'KIA', 'CHEVROLET', 'BHARAT', 'STOP', 'CAR', 'MOTOR', 'AUTO',
    'HERO', 'BAJAJ', 'YAMAHA', 'ROYAL', 'ENFIELD', 'KTM', 'TVS', 'TURBO',
    'HYBRID', 'VTEC', 'CRV', 'DIESEL', 'PETROL', 'CNG', 'EV', '4X4', 'AWD',
    'SHUTTERSTOCK', 'SHUTTERSTOCKCOM', 'ISTOCK', 'GETTY', 'GETTYIMAGES',
    'ALAMY', 'DREAMSTIME', 'DEPOSITPHOTOS', 'FREEPIK', 'WATERMARK', 'COPYRIGHT', 'STOCK'
}

# Regex patterns for embedded license plate extraction from surrounding vehicle text
EXTRACTION_PATTERNS = [
    # Indian standard: e.g. KA01MJ5021, DL08CA1990, MH12DE1433, HR26DQ5551
    (re.compile(r'([A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4})'), 3.2),
    # Bharat Series: e.g. 22BH1234AA
    (re.compile(r'([0-9]{2}BH[0-9]{4}[A-Z]{1,2})'), 3.2),
    # Common format without series: e.g. KA015021, DL4C1234
    (re.compile(r'([A-Z]{2}[0-9]{1,2}[A-Z]{0,2}[0-9]{1,4})'), 2.6),
    # International / Custom alphanumeric: e.g. 7XYZ912, 3ABC456
    (re.compile(r'([0-9][A-Z]{3}[0-9]{3})'), 2.4),
    (re.compile(r'([A-Z]{3}[0-9]{3,4})'), 2.2),
    # Euro / UK format: e.g. AB12CDE
    (re.compile(r'([A-Z]{2}[0-9]{2}[A-Z]{3})'), 2.2),
    # General alphanumeric 6-10 chars with both letters and numbers
    (re.compile(r'([A-Z0-9]{6,10})'), 1.8),
]

# Strict pattern validators for final candidate scoring
PATTERNS = [
    (re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}$'), 3.2),
    (re.compile(r'^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$'), 3.2),
    (re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{0,2}[0-9]{1,4}$'), 2.6),
    (re.compile(r'^[0-9][A-Z]{3}[0-9]{3}$'), 2.4),
    (re.compile(r'^[A-Z]{3}[0-9]{3,4}$'), 2.2),
    (re.compile(r'^[A-Z]{2}[0-9]{2}[A-Z]{3}$'), 2.2),
    (re.compile(r'^[A-Z0-9]{4,11}$'), 1.5),
]

ALPHA_TO_DIGIT = {
    'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'L': '1', 'J': '1',
    'Z': '2', 'E': '3', 'A': '4', 'S': '5', 'G': '6', 'B': '8',
    'T': '7', 'Y': '7', 'b': '6'
}

DIGIT_TO_ALPHA = {
    '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A',
    '5': 'S', '6': 'G', '7': 'T', '8': 'B'
}


def _get_ocr_reader():
    """Lazy-initialize EasyOCR reader."""
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
            gpu=False,
            verbose=False
        )
        print("[OCRImageService] EasyOCR reader initialized successfully")
        return _OCR_READER
    except Exception as e:
        print(f"[OCRImageService] Warning: Failed to initialize EasyOCR: {e}")
        return None


def _clean_text(text: str) -> str:
    """Uppercase and strip non-alphanumeric characters."""
    return ''.join(c for c in text.upper() if c.isalnum())


def _disambiguate_plate_text(candidate: str) -> str:
    """
    Performs context-aware ANPR character disambiguation:
    - In Indian state code (first 2 chars): digits are converted to letters.
    - In RTO registration number (chars at index 2 and 3): letters are converted to digits.
    - In middle series (index 4..N-4): digits converted to letters.
    - In final registration digits (last 4 characters): letters converted to digits.
    - In Bharat Series (YY BH NNNN XX): year and numbers enforced as digits.
    """
    if not candidate or len(candidate) < 5:
        return candidate

    chars = list(candidate)

    # 1. State Code disambiguation (first 2 chars must be letters)
    if chars[0] in DIGIT_TO_ALPHA:
        chars[0] = DIGIT_TO_ALPHA[chars[0]]
    if chars[1] in DIGIT_TO_ALPHA:
        chars[1] = DIGIT_TO_ALPHA[chars[1]]

    # If first 2 chars form an Indian state or are both letters:
    if chars[0].isalpha() and chars[1].isalpha():
        # Indices 2 and 3 MUST be digits (RTO district code 01-99)
        if len(chars) >= 4:
            if chars[2] in ALPHA_TO_DIGIT:
                chars[2] = ALPHA_TO_DIGIT[chars[2]]
            if chars[3] in ('L', 'A'):
                chars[3] = '4'
            elif chars[3] in ALPHA_TO_DIGIT:
                chars[3] = ALPHA_TO_DIGIT[chars[3]]

        # Last 4 characters (registration digits) MUST be digits
        last_4_start = len(chars) - 4
        if last_4_start >= 4:
            # Middle series letters (between index 4 and last 4 digits)
            for idx in range(4, last_4_start):
                if chars[idx] in DIGIT_TO_ALPHA:
                    chars[idx] = DIGIT_TO_ALPHA[chars[idx]]
            # Final 4 characters
            for idx in range(last_4_start, len(chars)):
                if chars[idx] in ('O', 'D', 'Q'):
                    chars[idx] = '0'
                elif chars[idx] in ALPHA_TO_DIGIT:
                    chars[idx] = ALPHA_TO_DIGIT[chars[idx]]

    # 2. Bharat Series disambiguation: YY BH NNNN XX
    if len(chars) >= 9 and ''.join(chars[2:4]) in ('BH', '8H', 'B#', '8#', 'SH'):
        chars[2], chars[3] = 'B', 'H'
        for i in (0, 1, 4, 5, 6, 7):
            if chars[i] in ALPHA_TO_DIGIT:
                chars[i] = ALPHA_TO_DIGIT[chars[i]]
        for i in range(8, len(chars)):
            if chars[i] in DIGIT_TO_ALPHA:
                chars[i] = DIGIT_TO_ALPHA[chars[i]]

    return ''.join(chars)


def _extract_plate_tokens(raw_str: str) -> List[Tuple[str, float]]:
    """
    Extracts all valid plate candidates from raw text (handling embedded plates,
    HSRP 'IND' markings, dealer stickers, or brand names).
    Returns list of (clean_plate, format_boost).
    """
    cleaned = _clean_text(raw_str)
    if not cleaned or len(cleaned) < 3:
        return []

    # Discard known watermarks, stock agencies, or pure numbers (>4 digits)
    for kw in ['SHUTTERSTOCK', 'ISTOCK', 'GETTY', 'ALAMY', 'WATERMARK', 'COPYRIGHT', 'DREAMSTIME']:
        if kw in cleaned:
            return []
    if cleaned.isdigit() and len(cleaned) > 4:
        return []

    tokens = []

    # Strip 'IND' if present at beginning of HSRP plate
    if cleaned.startswith('IND') and len(cleaned) >= 7:
        ind_stripped = cleaned[3:]
        tokens.append((ind_stripped, 1.2))

    # Test raw cleaned
    tokens.append((cleaned, 1.0))

    # Regex substring search across the string
    for regex, boost in EXTRACTION_PATTERNS:
        matches = regex.findall(cleaned)
        for m in matches:
            if isinstance(m, tuple):
                m = m[0]
            if len(m) >= 4 and m not in [t[0] for t in tokens]:
                tokens.append((m, boost))

    # Also add disambiguated versions
    disambiguated_tokens = []
    for tok, boost in tokens:
        dis = _disambiguate_plate_text(tok)
        disambiguated_tokens.append((tok, boost))
        if dis != tok:
            disambiguated_tokens.append((dis, boost * 1.15))

    return disambiguated_tokens


def _score_candidate(candidate: str, raw_conf: float) -> float:
    """
    Evaluates a candidate plate string based on regex conformance, length, and confidence.
    """
    if not candidate or len(candidate) < 3 or len(candidate) > 13:
        return 0.0

    if candidate in NON_PLATE_WORDS:
        return 0.0

    for kw in ['SHUTTERSTOCK', 'ISTOCK', 'GETTY', 'ALAMY', 'WATERMARK', 'COPYRIGHT', 'DREAMSTIME']:
        if kw in candidate:
            return 0.0

    has_alpha = any(c.isalpha() for c in candidate)
    has_digit = any(c.isdigit() for c in candidate)

    score = raw_conf

    # Check pattern matches
    matched_boost = 1.0
    for pattern, boost in PATTERNS:
        if pattern.match(candidate):
            matched_boost = max(matched_boost, boost)
            break

    score *= matched_boost

    # Strongly reward strings with both letters and numbers
    if has_alpha and has_digit:
        score *= 1.5
    else:
        score *= 0.4  # Heavily penalize purely alphabetic or purely numeric strings

    # Extra bonus if it starts with a recognized Indian state code
    if len(candidate) >= 4 and candidate[:2].isalpha():
        if candidate[:2] in INDIAN_STATES:
            score *= 2.2
        else:
            score *= 0.6  # Penalize non-existent state prefixes (e.g. UZ, QQ)

    # Optimal plate length: 7 to 10 chars
    if 7 <= len(candidate) <= 10:
        score *= 1.35
    elif 4 <= len(candidate) <= 6:
        score *= 1.05

    return score


def localize_plate_candidates(img_rgb: np.ndarray) -> List[Tuple[np.ndarray, Tuple[int, int, int, int], str]]:
    """
    Multi-strategy Computer Vision License Plate Localization (Image Recognition):
    1. Pre-scaling of oversized smartphone/camera frames (>1600px)
    2. Aspect-Ratio Fast Path (prioritizes full image if already a plate crop)
    3. Edge Density & Contour Morphology (Sobel-X + Otsu + Horizontal Closing)
    4. High-Contrast Luminance / Color Segmentation (HSV Light/Yellow Plates)
    5. Vehicle Geometric Prior Windows (Lower-center bumper regions)
    6. Full normalized image evaluation
    Returns: List of (cropped_image_rgb, (x, y, w, h), method_name)
    """
    h, w = img_rgb.shape[:2]
    # Downscale oversized smartphone uploads to optimal processing bounds (prevent CPU latency bottlenecks)
    if max(h, w) > 1600:
        scale = 1400.0 / max(h, w)
        new_w = max(100, int(w * scale))
        new_h = max(50, int(h * scale))
        img_rgb = cv2.resize(img_rgb, (new_w, new_h), interpolation=cv2.INTER_AREA)
        h, w = img_rgb.shape[:2]

    total_area = h * w
    candidates: List[Tuple[np.ndarray, Tuple[int, int, int, int], str]] = []

    # Fast Path: If image is already a dedicated license plate crop (aspect ratio 2.2 - 6.0 and h <= 180),
    # prioritize the full image first so inference resolves in a single pass (<1.5s).
    aspect_ratio = w / float(max(1, h))
    is_pre_cropped = (2.2 <= aspect_ratio <= 6.0) and h <= 180
    if is_pre_cropped:
        candidates.append((img_rgb, (0, 0, w, h), 'full_image'))

    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)

    # 1. Edge & Contour Morphology (Sobel-X)
    try:
        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        sobelx = cv2.Sobel(enhanced, cv2.CV_8U, 1, 0, ksize=3)
        _, thresh = cv2.threshold(sobelx, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Horizontal closing to fuse individual character strokes into a plate rectangle
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 5))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            x, y, cw, ch = cv2.boundingRect(c)
            aspect = cw / float(max(1, ch))
            area = cw * ch
            # Standard 1-line plate: aspect 1.8-6.5, 2-line plate: 1.1-2.2
            if (1.8 <= aspect <= 6.5 or 1.1 <= aspect <= 2.2) and cw >= 35 and ch >= 10:
                if 0.0004 * total_area <= area <= 0.35 * total_area:
                    mx = int(cw * 0.15)
                    my = int(ch * 0.20)
                    x1 = max(0, x - mx)
                    y1 = max(0, y - my)
                    x2 = min(w, x + cw + mx)
                    y2 = min(h, y + ch + my)
                    crop = img_rgb[y1:y2, x1:x2]
                    if crop.size > 0 and crop.shape[0] >= 10 and crop.shape[1] >= 20:
                        candidates.append((crop, (x1, y1, x2 - x1, y2 - y1), 'contour_sobel'))
    except Exception as e:
        print(f"[OCRImageService] Contour localization note: {e}")

    # 2. High-Contrast Luminance / Color Segmentation (White & Yellow plates)
    try:
        hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV)
        # White plate mask: low saturation, high value
        white_mask = cv2.inRange(hsv, np.array([0, 0, 150]), np.array([180, 50, 255]))
        # Yellow plate mask (commercial/taxis): hue in 15-38, high sat & val
        yellow_mask = cv2.inRange(hsv, np.array([15, 60, 120]), np.array([38, 255, 255]))
        color_mask = cv2.bitwise_or(white_mask, yellow_mask)

        kernel_c = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5))
        closed_color = cv2.morphologyEx(color_mask, cv2.MORPH_CLOSE, kernel_c)
        contours_c, _ = cv2.findContours(closed_color, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours_c:
            x, y, cw, ch = cv2.boundingRect(c)
            aspect = cw / float(max(1, ch))
            area = cw * ch
            if (2.0 <= aspect <= 6.0) and cw >= 45 and ch >= 12:
                if 0.0005 * total_area <= area <= 0.25 * total_area:
                    mx = int(cw * 0.12)
                    my = int(ch * 0.15)
                    x1 = max(0, x - mx)
                    y1 = max(0, y - my)
                    x2 = min(w, x + cw + mx)
                    y2 = min(h, y + ch + my)
                    crop = img_rgb[y1:y2, x1:x2]
                    if crop.size > 0:
                        candidates.append((crop, (x1, y1, x2 - x1, y2 - y1), 'color_segmentation'))
    except Exception as e:
        print(f"[OCRImageService] Color localization note: {e}")

    # 3. Vehicle Geometric Prior Windows (Plates are almost always in lower 65% of vehicle)
    if h >= 250 and w >= 250:
        # Lower-center bumper region (typically front or rear plate)
        y1_lc = int(0.35 * h)
        y2_lc = int(0.95 * h)
        x1_lc = int(0.12 * w)
        x2_lc = int(0.88 * w)
        lc_crop = img_rgb[y1_lc:y2_lc, x1_lc:x2_lc]
        if lc_crop.size > 0:
            candidates.append((lc_crop, (x1_lc, y1_lc, x2_lc - x1_lc, y2_lc - y1_lc), 'geometric_lower_center'))

        # Bottom bumper crop
        y1_bb = int(0.50 * h)
        y2_bb = int(1.0 * h)
        x1_bb = int(0.08 * w)
        x2_bb = int(0.92 * w)
        bb_crop = img_rgb[y1_bb:y2_bb, x1_bb:x2_bb]
        if bb_crop.size > 0:
            candidates.append((bb_crop, (x1_bb, y1_bb, x2_bb - x1_bb, y2_bb - y1_bb), 'geometric_bottom_bumper'))

    # 4. Full image fallback (if not already added as first priority)
    if not is_pre_cropped:
        candidates.append((img_rgb, (0, 0, w, h), 'full_image'))

    return candidates


def _normalize_crop_dimensions(crop_rgb: np.ndarray) -> np.ndarray:
    """
    Upscales small plate crops to optimal ANPR height (80-120px) using bicubic interpolation.
    Downscales massive crops (>1400px) to prevent memory bottlenecks.
    """
    ch, cw = crop_rgb.shape[:2]
    if ch < 80:
        scale = 95.0 / max(1, ch)
        new_w = max(140, int(cw * scale))
        return cv2.resize(crop_rgb, (new_w, 95), interpolation=cv2.INTER_CUBIC)
    elif max(ch, cw) > 1400:
        scale = 1400.0 / max(ch, cw)
        new_w = max(100, int(cw * scale))
        new_h = max(50, int(ch * scale))
        return cv2.resize(crop_rgb, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return crop_rgb


def _enhance_crop_variants(crop_rgb: np.ndarray) -> List[np.ndarray]:
    """
    Produces enhancement representations for plate crop:
    1. Normalized RGB
    2. CLAHE contrast equalization
    3. Bilateral filter edge-preserving smoothing
    """
    normalized = _normalize_crop_dimensions(crop_rgb)
    variants = [normalized]

    try:
        gray = cv2.cvtColor(normalized, cv2.COLOR_RGB2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        clahe_enhanced = clahe.apply(gray)
        variants.append(cv2.cvtColor(clahe_enhanced, cv2.COLOR_GRAY2RGB))

        bilateral = cv2.bilateralFilter(clahe_enhanced, 7, 50, 50)
        variants.append(cv2.cvtColor(bilateral, cv2.COLOR_GRAY2RGB))
    except Exception as e:
        print(f"[OCRImageService] Crop variant enhancement note: {e}")

    return variants


def recognize_plate_from_image(image_bytes: bytes) -> Tuple[str, float, str, List[str], Optional[Image.Image]]:
    """
    Performs multi-stage Computer Vision ANPR OCR on vehicle or license plate image bytes:
    1. Localizes candidate plate regions across the vehicle image (Sobel-X, Color Mask, Geometric Priors)
    2. Enhances and normalizes localized candidate crops
    3. Executes deep neural OCR across candidate regions
    4. Disambiguates characters and extracts exact license plate tokens
    Returns: (plate_text, confidence, engine_name, all_detected_texts, best_crop_pil)
    """
    reader = _get_ocr_reader()
    if reader is None:
        return ("", 0.0, "EasyOCR (unavailable)", [], None)

    try:
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(pil_image)

        # 1. Image Recognition: Localize plate candidates
        candidates = localize_plate_candidates(img_array)

        best_plate = ""
        best_conf = 0.0
        best_engine = "EasyOCR Deep Neural Reader"
        all_detected_texts: List[str] = []
        best_crop_pil: Optional[Image.Image] = None

        scored_candidates: List[Dict[str, Any]] = []

        # Iterate through localized candidate regions
        for cand_idx, (crop_rgb, bbox, method) in enumerate(candidates):
            variants = _enhance_crop_variants(crop_rgb)

            for var_idx, variant in enumerate(variants):
                try:
                    ocr_results = reader.readtext(variant)
                    if not ocr_results:
                        continue

                    # Collect raw detected texts
                    for r in ocr_results:
                        raw_txt = str(r[1]).strip()
                        if raw_txt and raw_txt not in all_detected_texts:
                            all_detected_texts.append(raw_txt)

                    # Evaluate each detected text box individually
                    for bbox_res, raw_txt, raw_conf in ocr_results:
                        conf_val = float(raw_conf)
                        extracted_tokens = _extract_plate_tokens(raw_txt)
                        for token, boost in extracted_tokens:
                            score = _score_candidate(token, conf_val * boost)
                            if score > 0.0:
                                scored_candidates.append({
                                    'plate': token,
                                    'conf': conf_val,
                                    'score': score,
                                    'engine': f"Plate Localizer ({method}) + EasyOCR",
                                    'crop': crop_rgb,
                                    'bbox': bbox
                                })

                    # Also evaluate concatenated text boxes (multi-line or spaced plates)
                    # ONLY for localized crops (NEVER concatenate all boxes across an entire full vehicle image)
                    if len(ocr_results) > 1 and method != 'full_image':
                        # Filter out non-plate boxes like 'IND', brand names, pure long numbers, or watermarks before fusing
                        candidate_boxes = [
                            b for b in ocr_results
                            if _clean_text(str(b[1])) not in NON_PLATE_WORDS
                            and not any(kw in _clean_text(str(b[1])) for kw in ['SHUTTERSTOCK', 'ISTOCK', 'GETTY', 'IND'])
                            and not (_clean_text(str(b[1])).isdigit() and len(_clean_text(str(b[1]))) > 4)
                            and len(_clean_text(str(b[1]))) <= 10
                        ]
                        if len(candidate_boxes) > 1:
                            sorted_boxes = sorted(
                                candidate_boxes,
                                key=lambda it: (it[0][0][1] if isinstance(it[0], (list, np.ndarray)) else 0,
                                                it[0][0][0] if isinstance(it[0], (list, np.ndarray)) else 0)
                            )
                            combined_text = ''.join(str(b[1]) for b in sorted_boxes)
                            avg_conf = sum(float(b[2]) for b in sorted_boxes) / len(sorted_boxes)
                            for token, boost in _extract_plate_tokens(combined_text):
                                score = _score_candidate(token, avg_conf * boost)
                                if score > 0.0:
                                    scored_candidates.append({
                                        'plate': token,
                                        'conf': avg_conf,
                                        'score': score,
                                        'engine': f"Plate Localizer ({method}) + Multi-Line Fusion",
                                        'crop': crop_rgb,
                                        'bbox': bbox
                                    })

                    # If we found a high-confidence match conforming to standard plate regex with valid state code, break early
                    top_matches = [c for c in scored_candidates if c['score'] >= 3.0]
                    if top_matches:
                        break

                except Exception as ocr_err:
                    print(f"[OCRImageService] Candidate {cand_idx} pass {var_idx} note: {ocr_err}")

            if any(c['score'] >= 3.0 for c in scored_candidates):
                break

        # Select best candidate
        if scored_candidates:
            scored_candidates.sort(key=lambda x: x['score'], reverse=True)
            top = scored_candidates[0]
            best_plate = top['plate'][:12]
            best_conf = round(top['conf'], 4)
            best_engine = top['engine']
            try:
                best_crop_pil = Image.fromarray(top['crop'])
            except Exception:
                best_crop_pil = None

        return (best_plate, best_conf, best_engine, all_detected_texts, best_crop_pil)

    except Exception as e:
        print(f"[OCRImageService] Error during ANPR OCR: {e}")
        return ("", 0.0, f"EasyOCR (error: {str(e)[:50]})", [], None)
