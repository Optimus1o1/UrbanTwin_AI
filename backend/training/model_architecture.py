"""
UrbanTwin AI - Personalized Deep Learning Model Architecture
Spatial Transformer Network + Convolutional Recurrent Neural Network (STN-CRNN)
with Connectionist Temporal Classification (CTC) for Degradation-Resistant ANPR OCR.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, List, Dict, Any
import numpy as np

CHAR_VOCAB = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
CHAR2IDX = {c: i + 1 for i, c in enumerate(CHAR_VOCAB)} # 0 reserved for CTC blank
IDX2CHAR = {i + 1: c for i, c in enumerate(CHAR_VOCAB)}
NUM_CLASSES = len(CHAR_VOCAB) + 1 # 37 classes


class SpatialTransformerNetwork(nn.Module):
    """
    Learns to rectify / deskew distorted license plates via an affine transformation grid.
    """
    def __init__(self, in_channels: int = 3):
        super().__init__()
        # Localization network
        self.loc_net = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(True),
            nn.MaxPool2d(2, 2), # 32 -> 16
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(True),
            nn.MaxPool2d(2, 2), # 16 -> 8
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(True),
            nn.AdaptiveAvgPool2d((4, 8))
        )
        # Regressor for 2x3 affine matrix
        self.fc_loc = nn.Sequential(
            nn.Linear(128 * 4 * 8, 128),
            nn.ReLU(True),
            nn.Linear(128, 6)
        )
        # Initialize with identity transformation
        self.fc_loc[2].weight.data.zero_()
        self.fc_loc[2].bias.data.copy_(torch.tensor([1, 0, 0, 0, 1, 0], dtype=torch.float))

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        xs = self.loc_net(x)
        xs = xs.view(xs.size(0), -1)
        theta = self.fc_loc(xs)
        theta = theta.view(-1, 2, 3)

        grid = F.affine_grid(theta, x.size(), align_corners=False)
        rectified_x = F.grid_sample(x, grid, align_corners=False)
        return rectified_x, theta


class STN_CRNN_OCR(nn.Module):
    """
    End-to-End High-Accuracy ANPR OCR Model:
    1. Spatial Transformer Network (Auto-rectification)
    2. CNN Feature Extractor (VGG-style multi-scale feature maps)
    3. Bidirectional LSTM Sequence Modeling
    4. CTC Linear Projection
    """
    def __init__(self, in_channels: int = 3, num_classes: int = NUM_CLASSES, rnn_hidden: int = 256):
        super().__init__()
        self.stn = SpatialTransformerNetwork(in_channels=in_channels)

        # CNN Backbone
        self.cnn = nn.Sequential(
            # Block 1
            nn.Conv2d(in_channels, 64, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(True),
            nn.MaxPool2d(kernel_size=2, stride=2), # (B, 64, H/2, W/2)

            # Block 2
            nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(True),
            nn.MaxPool2d(kernel_size=2, stride=2), # (B, 128, H/4, W/4)

            # Block 3
            nn.Conv2d(128, 256, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(True),
            nn.Conv2d(256, 256, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(True),
            nn.MaxPool2d(kernel_size=(2, 1), stride=(2, 1)), # (B, 256, H/8, W/4)

            # Block 4
            nn.Conv2d(256, 512, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(True),
            nn.MaxPool2d(kernel_size=(2, 1), stride=(2, 1)), # (B, 512, H/16, W/4)

            # Block 5: Squeeze height to 1
            nn.Conv2d(512, 512, kernel_size=2, stride=1, padding=0),
            nn.BatchNorm2d(512),
            nn.ReLU(True)
        )

        # Sequence modeling with BiLSTM
        self.rnn = nn.LSTM(
            input_size=512,
            hidden_size=rnn_hidden,
            num_layers=2,
            bidirectional=True,
            batch_first=True,
            dropout=0.2
        )

        # Transcription output layer
        self.fc = nn.Linear(rnn_hidden * 2, num_classes)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        x: (Batch, 3, Height, Width) -> e.g. (B, 3, 32, 128)
        returns:
          logits: (Time_steps, Batch, Num_classes) for CTCLoss
          theta: (Batch, 2, 3) STN transformation matrix
        """
        rectified_x, theta = self.stn(x)
        features = self.cnn(rectified_x) # (B, 512, 1, W_seq)

        # Squeeze height dimension: (B, 512, W_seq) -> (B, W_seq, 512)
        b, c, h, w = features.size()
        assert h == 1, f"Expected height=1 after CNN, got {h}"
        seq = features.squeeze(2).permute(0, 2, 1)

        rnn_out, _ = self.rnn(seq) # (B, W_seq, 2 * rnn_hidden)
        logits = self.fc(rnn_out)  # (B, W_seq, num_classes)

        # CTC loss requires (Time, Batch, Num_Classes)
        ctc_logits = logits.permute(1, 0, 2)
        return ctc_logits, theta


def decode_ctc_predictions(logits: torch.Tensor) -> List[str]:
    """
    Greedy Best-Path CTC Decoder.
    logits: (Time, Batch, Num_classes)
    """
    probs = F.log_softmax(logits, dim=2)
    max_indices = torch.argmax(probs, dim=2) # (Time, Batch)
    max_indices = max_indices.permute(1, 0).cpu().numpy() # (Batch, Time)

    decoded_texts = []
    for seq in max_indices:
        chars = []
        prev_idx = 0
        for idx in seq:
            if idx != 0 and idx != prev_idx:
                chars.append(IDX2CHAR.get(idx, ""))
            prev_idx = idx
        decoded_texts.append("".join(chars))
    return decoded_texts


class VehicleReIDEmbeddingNet(nn.Module):
    """
    Deep metric learning network for cross-camera vehicle re-identification.
    Maps vehicle crops to a normalized 128-dimensional embedding space.
    """
    def __init__(self, embedding_dim: int = 128):
        super().__init__()
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(True),
            nn.MaxPool2d(2, 2),

            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(True),
            nn.MaxPool2d(2, 2),

            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(True),
            nn.AdaptiveAvgPool2d((4, 4))
        )
        self.head = nn.Sequential(
            nn.Linear(128 * 4 * 4, 256),
            nn.ReLU(True),
            nn.Linear(256, embedding_dim)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.backbone(x)
        feat = feat.view(feat.size(0), -1)
        emb = self.head(feat)
        # L2 normalize embeddings onto the unit hypersphere
        return F.normalize(emb, p=2, dim=1)


def decode_ctc_with_confidences(logits: torch.Tensor) -> List[Tuple[str, float, List[Dict[str, Any]]]]:
    """
    Decodes predictions with character-level and overall softmax confidence scores.
    logits: (Time, Batch, Num_classes)
    returns: List of (predicted_text, overall_confidence, character_breakdown)
    """
    probs = F.softmax(logits, dim=2)
    max_probs, max_indices = torch.max(probs, dim=2)
    
    max_indices = max_indices.permute(1, 0).detach().cpu().numpy()
    max_probs = max_probs.permute(1, 0).detach().cpu().numpy()
    
    results = []
    for b in range(len(max_indices)):
        seq = max_indices[b]
        conf_seq = max_probs[b]
        
        chars = []
        char_confs = []
        prev_idx = 0
        
        for idx, conf in zip(seq, conf_seq):
            if idx != 0 and idx != prev_idx:
                ch = IDX2CHAR.get(idx, "")
                chars.append(ch)
                char_confs.append({
                    "char": ch,
                    "confidence": round(float(conf), 3),
                    "status": "CONFIRMED" if conf > 0.85 else "RECTIFIED"
                })
            prev_idx = idx
            
        pred_text = "".join(chars)
        avg_conf = round(float(sum(c["confidence"] for c in char_confs) / max(1, len(char_confs))), 3) if char_confs else 0.0
        results.append((pred_text, avg_conf, char_confs))
    return results


def save_model_checkpoint(
    model: nn.Module,
    filepath: str,
    epoch: int = 0,
    optimizer: torch.optim.Optimizer = None,
    val_acc: float = 0.0
):
    """Save model weights along with metadata, vocabulary, and training metrics."""
    checkpoint = {
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "val_acc": val_acc,
        "char_vocab": CHAR_VOCAB,
        "num_classes": NUM_CLASSES,
        "model_architecture": "STN_CRNN_OCR"
    }
    if optimizer is not None:
        checkpoint["optimizer_state_dict"] = optimizer.state_dict()
    torch.save(checkpoint, filepath)
    print(f"[*] Checkpoint saved successfully to {filepath} (Val Acc: {val_acc:.2f}%)")


def load_model_checkpoint(
    filepath: str,
    device: str = "cpu"
) -> STN_CRNN_OCR:
    """Load model from saved checkpoint file."""
    checkpoint = torch.load(filepath, map_location=device)
    model = STN_CRNN_OCR()
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"])
    else:
        model.load_state_dict(checkpoint)
    model.to(device)
    model.eval()
    return model

