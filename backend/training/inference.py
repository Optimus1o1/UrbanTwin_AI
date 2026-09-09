"""
UrbanTwin AI - Personalized Model Inference Engine
Loads the trained STN-CRNN ANPR OCR model weights if available,
and provides real-time inference with degradation resilience and character-level confidences.
"""

import os
import sys
from typing import Optional, Tuple, List, Dict, Any
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from training.model_architecture import (
    STN_CRNN_OCR,
    decode_ctc_with_confidences,
    load_model_checkpoint
)
from training.dataset_generator import render_license_plate

# Default model weights lookup paths
DEFAULT_MODEL_PATHS = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "urbantwin_personalized_ocr.pth")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models", "urbantwin_personalized_ocr.pth")),
    os.path.abspath(os.path.join(os.getcwd(), "urbantwin_personalized_ocr.pth"))
]


class PersonalizedANPRPredictor:
    """
    Singleton inference class managing model loading, device routing, and plate prediction.
    """
    _instance: Optional["PersonalizedANPRPredictor"] = None

    def __init__(self, model_path: Optional[str] = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model: Optional[STN_CRNN_OCR] = None
        self.is_loaded = False
        self.model_path = None

        # Resolve weights path
        paths_to_check = [model_path] if model_path else DEFAULT_MODEL_PATHS
        for p in paths_to_check:
            if p and os.path.exists(p):
                self.model_path = p
                break

        if self.model_path and os.path.exists(self.model_path):
            try:
                self.model = load_model_checkpoint(self.model_path, device=str(self.device))
                self.model.eval()
                self.is_loaded = True
                print(f"[PersonalizedANPRPredictor] Successfully loaded personalized model from {self.model_path}")
            except Exception as e:
                print(f"[PersonalizedANPRPredictor] Warning: Could not load checkpoint from {self.model_path}: {e}")
                self.model = None
                self.is_loaded = False

    @classmethod
    def get_instance(cls) -> "PersonalizedANPRPredictor":
        if cls._instance is None:
            cls._instance = PersonalizedANPRPredictor()
        return cls._instance

    def preprocess_image(self, pil_image: Image.Image, target_size: Tuple[int, int] = (128, 32)) -> torch.Tensor:
        """Resize and normalize PIL image to FloatTensor [-1.0, 1.0]."""
        resized = pil_image.resize(target_size, Image.Resampling.BILINEAR)
        arr = np.array(resized).astype(np.float32) / 127.5 - 1.0
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0) # (1, 3, 32, 128)
        return tensor.to(self.device)

    @torch.no_grad()
    def predict(self, pil_image: Image.Image) -> Tuple[str, float, List[Dict[str, Any]], bool]:
        """
        Runs real STN-CRNN forward pass on PIL Image.
        Returns: (predicted_text, overall_confidence, character_breakdown, stn_applied)
        """
        if self.model is None or not self.is_loaded:
            return ("", 0.0, [], False)

        input_tensor = self.preprocess_image(pil_image)
        logits, theta = self.model(input_tensor)
        results = decode_ctc_with_confidences(logits)
        
        if not results:
            return ("", 0.0, [], True)

        pred_text, avg_conf, char_confs = results[0]
        return pred_text, avg_conf, char_confs, True


def is_personalized_model_active() -> bool:
    predictor = PersonalizedANPRPredictor.get_instance()
    return predictor.is_loaded


def run_inference_on_plate(
    plate_text: str,
    degradation: str = "clean"
) -> Optional[Tuple[str, float, List[Dict[str, Any]]]]:
    """
    Synthesizes the plate image with requested degradation and runs inference.
    """
    predictor = PersonalizedANPRPredictor.get_instance()
    if not predictor.is_loaded:
        return None

    img = render_license_plate(plate_text, degradation=degradation)
    pred_text, avg_conf, char_breakdown, _ = predictor.predict(img)
    return pred_text, avg_conf, char_breakdown
