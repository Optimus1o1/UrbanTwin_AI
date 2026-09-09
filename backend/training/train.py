"""
UrbanTwin AI - Personalized Model Training Pipeline
Trains the Spatial Transformer Network + CRNN OCR model on multi-condition synthetic demo dataset.
Supports CLI execution locally or inside Google Colab.
"""

import os
import sys
import math
import time
import argparse
import random
from typing import List, Tuple, Dict, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from PIL import Image

# Ensure training module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from training.dataset_generator import (
    render_license_plate,
    generate_random_plate_text,
    CHAR2IDX,
    IDX2CHAR,
    CHAR_VOCAB,
    NUM_CLASSES,
    generate_demo_dataset
)
from training.model_architecture import (
    STN_CRNN_OCR,
    decode_ctc_predictions,
    decode_ctc_with_confidences,
    save_model_checkpoint
)


# ==========================================
# 1. PyTorch Dataset & Preprocessing
# ==========================================
class LicensePlateDataset(Dataset):
    """
    High-performance PyTorch Dataset for ANPR OCR.
    Supports either pre-generated on-disk images or fast in-memory dynamic synthesis.
    """
    def __init__(
        self,
        samples: Optional[List[Tuple[str, str, str]]] = None,
        csv_file: Optional[str] = None,
        img_dir: Optional[str] = None,
        target_size: Tuple[int, int] = (128, 32), # (width, height)
        is_dynamic: bool = False,
        num_dynamic_samples: int = 1000
    ):
        self.target_width, self.target_height = target_size
        self.is_dynamic = is_dynamic
        self.samples = [] # list of (img_path or None, text, degradation)
        self.degradations = ["clean", "rain", "glare", "blur", "grime", "skew", "severe_mixed"]

        if is_dynamic:
            self.num_samples = num_dynamic_samples
        elif csv_file and os.path.exists(csv_file):
            import pandas as pd
            df = pd.read_csv(csv_file)
            for _, row in df.iterrows():
                fpath = os.path.join(img_dir or "", str(row["filename"]))
                self.samples.append((fpath, str(row["label"]), str(row["degradation"])))
            self.num_samples = len(self.samples)
        elif samples:
            self.samples = samples
            self.num_samples = len(self.samples)
        else:
            self.num_samples = 0

    def __len__(self) -> int:
        return self.num_samples

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, str, str]:
        if self.is_dynamic:
            label = generate_random_plate_text()
            deg = random.choice(self.degradations)
            pil_img = render_license_plate(label, degradation=deg)
        else:
            fpath, label, deg = self.samples[idx]
            if os.path.exists(fpath):
                pil_img = Image.open(fpath).convert("RGB")
            else:
                pil_img = render_license_plate(label, degradation=deg)

        # Resize to fixed CNN input resolution (32 height, 128 width)
        pil_img = pil_img.resize((self.target_width, self.target_height), Image.Resampling.BILINEAR)
        
        # Convert PIL to normalized FloatTensor (3, H, W) in range [-1.0, 1.0]
        img_arr = np.array(pil_img).astype(np.float32) / 127.5 - 1.0
        img_tensor = torch.from_numpy(img_arr).permute(2, 0, 1) # (3, H, W)
        return img_tensor, label, deg


def pad_collate_fn(batch):
    """
    Collate function to prepare variable-length targets for PyTorch CTCLoss.
    """
    images, labels, degradations = zip(*batch)
    batch_images = torch.stack(images, dim=0) # (B, 3, 32, 128)

    # Encode labels to integer indices
    target_indices = []
    target_lengths = []
    for label in labels:
        indices = [CHAR2IDX[c] for c in label if c in CHAR2IDX]
        target_indices.extend(indices)
        target_lengths.append(len(indices))

    targets = torch.tensor(target_indices, dtype=torch.long)
    target_lengths = torch.tensor(target_lengths, dtype=torch.long)
    return batch_images, targets, target_lengths, labels, degradations


# ==========================================
# 2. Evaluation Metrics
# ==========================================
def compute_plate_accuracy(predictions: List[str], ground_truths: List[str]) -> Tuple[float, float]:
    """
    Computes Exact Match Accuracy (%) and Character-level Accuracy (%).
    """
    exact_matches = 0
    total_chars = 0
    correct_chars = 0

    for pred, gt in zip(predictions, ground_truths):
        if pred == gt:
            exact_matches += 1
        
        # Character overlap
        total_chars += max(len(pred), len(gt))
        matched = sum(1 for p, g in zip(pred, gt) if p == g)
        correct_chars += matched

    exact_acc = (exact_matches / max(1, len(ground_truths))) * 100.0
    char_acc = (correct_chars / max(1, total_chars)) * 100.0
    return round(exact_acc, 2), round(char_acc, 2)


# ==========================================
# 3. Training & Validation Functions
# ==========================================
def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.CTCLoss,
    device: torch.device
) -> float:
    model.train()
    running_loss = 0.0

    for batch_idx, (images, targets, target_lengths, labels, _) in enumerate(loader):
        images = images.to(device)
        targets = targets.to(device)
        target_lengths = target_lengths.to(device)

        optimizer.zero_grad()
        # Forward pass: logits is (Time, Batch, Num_Classes)
        logits, theta = model(images)

        # In CTCLoss, input_lengths is the time sequence length for each batch element
        seq_len = logits.size(0)
        batch_size = images.size(0)
        input_lengths = torch.full((batch_size,), seq_len, dtype=torch.long, device=device)

        log_probs = F.log_softmax(logits, dim=2)
        loss = criterion(log_probs, targets, input_lengths, target_lengths)

        if torch.isnan(loss) or torch.isinf(loss):
            continue

        loss.backward()
        # Clip gradient norms to stabilize RNN training
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=5.0)
        optimizer.step()

        running_loss += loss.item()

    return running_loss / max(1, len(loader))


@torch.no_grad()
def evaluate_model(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.CTCLoss,
    device: torch.device
) -> Dict[str, any]:
    model.eval()
    running_loss = 0.0
    all_preds = []
    all_gts = []
    deg_stats: Dict[str, Dict[str, int]] = {}

    for images, targets, target_lengths, labels, degradations in loader:
        images = images.to(device)
        targets = targets.to(device)
        target_lengths = target_lengths.to(device)

        logits, _ = model(images)
        seq_len = logits.size(0)
        batch_size = images.size(0)
        input_lengths = torch.full((batch_size,), seq_len, dtype=torch.long, device=device)

        log_probs = F.log_softmax(logits, dim=2)
        loss = criterion(log_probs, targets, input_lengths, target_lengths)
        if not (torch.isnan(loss) or torch.isinf(loss)):
            running_loss += loss.item()

        # Greedy CTC decoding
        preds = decode_ctc_predictions(logits)
        all_preds.extend(preds)
        all_gts.extend(labels)

        # Track per-degradation accuracy
        for pred, gt, deg in zip(preds, labels, degradations):
            if deg not in deg_stats:
                deg_stats[deg] = {"total": 0, "correct": 0}
            deg_stats[deg]["total"] += 1
            if pred == gt:
                deg_stats[deg]["correct"] += 1

    exact_acc, char_acc = compute_plate_accuracy(all_preds, all_gts)
    avg_loss = running_loss / max(1, len(loader))

    per_deg_acc = {
        deg: round((stats["correct"] / max(1, stats["total"])) * 100.0, 1)
        for deg, stats in deg_stats.items()
    }

    return {
        "val_loss": round(avg_loss, 4),
        "exact_match_acc": exact_acc,
        "char_acc": char_acc,
        "per_degradation_acc": per_deg_acc,
        "sample_preds": list(zip(all_gts[:5], all_preds[:5]))
    }


# ==========================================
# 4. Main Training Orchestrator
# ==========================================
def run_training_pipeline(
    epochs: int = 15,
    batch_size: int = 32,
    lr: float = 0.0008,
    num_train: int = 1200,
    num_val: int = 250,
    device_name: str = "auto",
    save_path: str = "urbantwin_personalized_ocr.pth",
    use_dynamic_data: bool = True
):
    print("=" * 70)
    print("  URBANTWIN AI - PERSONALIZED DEEP LEARNING MODEL TRAINING")
    print("=" * 70)

    # Device selection
    if device_name == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(device_name)
    print(f"[*] Training device: {device} (CUDA Available: {torch.cuda.is_available()})")

    # Dataset setup
    if use_dynamic_data:
        print(f"[*] Initializing Dynamic On-the-Fly Datasets (Train: {num_train}, Val: {num_val})...")
        train_dataset = LicensePlateDataset(is_dynamic=True, num_dynamic_samples=num_train)
        val_dataset = LicensePlateDataset(is_dynamic=True, num_dynamic_samples=num_val)
    else:
        data_dir = "demo_dataset"
        if not os.path.exists(f"{data_dir}/train_labels.csv"):
            print("[*] Generating synthetic demo dataset files...")
            generate_demo_dataset(data_dir, num_train=num_train, num_val=num_val, num_test=100)
        train_dataset = LicensePlateDataset(csv_file=f"{data_dir}/train_labels.csv", img_dir=f"{data_dir}/train")
        val_dataset = LicensePlateDataset(csv_file=f"{data_dir}/val_labels.csv", img_dir=f"{data_dir}/val")

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=pad_collate_fn,
        drop_last=True
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=pad_collate_fn
    )

    # Instantiate model
    model = STN_CRNN_OCR(in_channels=3, num_classes=NUM_CLASSES, rnn_hidden=256).to(device)
    num_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[*] STN-CRNN OCR Architecture initialized with {num_params:,} trainable parameters.")

    criterion = nn.CTCLoss(blank=0, zero_infinity=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

    best_val_acc = 0.0
    start_time = time.time()

    print(f"\n[*] Starting training loop for {epochs} epochs...\n")

    for epoch in range(1, epochs + 1):
        t0 = time.time()
        train_loss = train_one_epoch(model, train_loader, optimizer, criterion, device)
        scheduler.step()

        val_metrics = evaluate_model(model, val_loader, criterion, device)
        elapsed = time.time() - t0

        print(
            f"Epoch [{epoch:02d}/{epochs:02d}] "
            f"Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_metrics['val_loss']:.4f} | "
            f"Exact Match Acc: {val_metrics['exact_match_acc']:.2f}% | "
            f"Char Acc: {val_metrics['char_acc']:.2f}% | "
            f"Time: {elapsed:.1f}s"
        )

        # Save best model checkpoint
        if val_metrics["exact_match_acc"] >= best_val_acc:
            best_val_acc = val_metrics["exact_match_acc"]
            save_model_checkpoint(
                model=model,
                filepath=save_path,
                epoch=epoch,
                optimizer=optimizer,
                val_acc=best_val_acc
            )

    total_time = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"[*] Training finished in {total_time:.1f} seconds.")
    print(f"[*] Best Exact Match Accuracy: {best_val_acc:.2f}%")
    print(f"[*] Model weights checkpoint saved at: {save_path}")
    print("=" * 70)
    return model, save_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train UrbanTwin AI Personalized ANPR OCR Model")
    parser.add_argument("--epochs", type=int, default=10, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=32, help="Mini-batch size")
    parser.add_argument("--lr", type=float, default=0.0008, help="Learning rate")
    parser.add_argument("--train_samples", type=int, default=1000, help="Number of training samples")
    parser.add_argument("--val_samples", type=int, default=200, help="Number of validation samples")
    parser.add_argument("--save_path", type=str, default="urbantwin_personalized_ocr.pth", help="Output path for checkpoint")
    args = parser.parse_args()

    run_training_pipeline(
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        num_train=args.train_samples,
        num_val=args.val_samples,
        save_path=args.save_path
    )
