# 🎓 Google Colab Personalized Model Training Guide

This guide walks you through training and exporting your **personalized AI models** using the provided Google Colab notebook and demo dataset pipeline for **UrbanTwin AI**.

---

## 📁 What's Included

* **Google Colab Notebook**: [`UrbanTwin_AI_Personalized_Model_Colab.ipynb`](file:///c:/Users/ANIKET/Downloads/urbantwin-ai-main/urbantwin-ai-main/UrbanTwin_AI_Personalized_Model_Colab.ipynb)
* **Synthetic Demo Dataset Generator**: [`backend/training/dataset_generator.py`](file:///c:/Users/ANIKET/Downloads/urbantwin-ai-main/urbantwin-ai-main/backend/training/dataset_generator.py)
* **Personalized Deep Learning Architecture**: [`backend/training/model_architecture.py`](file:///c:/Users/ANIKET/Downloads/urbantwin-ai-main/urbantwin-ai-main/backend/training/model_architecture.py)
* **CLI Training Script**: [`backend/training/train.py`](file:///c:/Users/ANIKET/Downloads/urbantwin-ai-main/urbantwin-ai-main/backend/training/train.py)
* **Inference Engine**: [`backend/training/inference.py`](file:///c:/Users/ANIKET/Downloads/urbantwin-ai-main/urbantwin-ai-main/backend/training/inference.py)

---

## 🚀 Quickstart: Running in Google Colab

### Step 1: Open the Notebook in Google Colab
1. Navigate to [Google Colab](https://colab.research.google.com).
2. Click **File** > **Upload Notebook**.
3. Select `UrbanTwin_AI_Personalized_Model_Colab.ipynb` from your computer (located in your project root or `backend/training/`).

### Step 2: Enable Free GPU Acceleration
1. In Google Colab, go to **Runtime** > **Change runtime type**.
2. Under **Hardware accelerator**, select **T4 GPU**.
3. Click **Save**.

### Step 3: Run the Training Pipeline
1. Click **Runtime** > **Run all** (or execute cell-by-cell with `Shift + Enter`).
2. The notebook will automatically:
   - Detect and report CUDA GPU specifications.
   - Install required dependencies.
   - Procedurally synthesize multi-condition license plates under **6 harsh degradation categories** (night headlight glare, heavy monsoon rain, high-speed motion blur, mud grime, and perspective skew).
   - Display visual preview of degraded synthetic plates.
   - Initialize the **Spatial Transformer Network (STN)** + **CRNN** (VGG CNN + BiLSTM + CTC Loss).
   - Train the personalized model for 15 epochs with real-time loss tracking and learning rate decay.
   - Plot convergence curves and per-degradation accuracy benchmarks (>90% accuracy target).
   - Run the **Interactive Inference Studio** where you can test custom license plates.
   - Train an **XGBoost Multi-Horizon Traffic Congestion Predictor** for 5, 15, and 30-minute horizons.

### Step 4: Download Your Trained Model
1. The last cell automatically prompts a browser download for:
   - `urbantwin_personalized_ocr.pth` (PyTorch model weights & vocabulary)
   - `urbantwin_traffic_predictor.json` (XGBoost traffic forecasting model)

---

## 🔌 Integrating the Trained Model into UrbanTwin AI

Once you download `urbantwin_personalized_ocr.pth`, place it into your project:

```bash
# Copy into the training or models directory:
cp urbantwin_personalized_ocr.pth backend/training/urbantwin_personalized_ocr.pth
```

When you start the UrbanTwin AI backend:
```bash
python run.py
```

The system automatically detects the personalized weights:
* The OCR Degradation Testing Studio (`/api/v1/ocr/test-degradation`) will use the live STN-CRNN model.
* Edge camera observations will run through real deep learning inference.
* If weights are absent, the system seamlessly falls back to calibrated simulation.

---

## 💻 Optional: Local CLI Training

If you have a local machine with Python and PyTorch installed:

```bash
# Run 10 epochs on GPU/CPU with 1,000 dynamic training samples:
python backend/training/train.py --epochs 10 --batch_size 32 --train_samples 1000 --val_samples 200 --save_path urbantwin_personalized_ocr.pth
```

---

## 📊 Model Architecture Highlights

```
Raw Degraded Frame (32 x 128)
             │
             ▼
┌───────────────────────────────┐
│ Spatial Transformer Net (STN) │ ──> Auto-rectifies skew & perspective warp
└───────────────────────────────┘
             │
             ▼
┌───────────────────────────────┐
│  5-Layer CNN Feature Extractor │ ──> Extracts spatial feature maps (B, 512, 1, W_seq)
└───────────────────────────────┘
             │
             ▼
┌───────────────────────────────┐
│  Bidirectional 2-Layer LSTM   │ ──> Models temporal character context
└───────────────────────────────┘
             │
             ▼
┌───────────────────────────────┐
│ CTC Alignment-Free Projection │ ──> Greedy best-path decoding & confidences
└───────────────────────────────┘
```
