# 🏙️ UrbanTwin AI

Demo live link-https://urbantwin-ai-2.onrender.com

> **Multi-Camera Traffic Intelligence & Predictive Urban Digital Twin API**

[![Interactive Swagger UI](https://img.shields.io/badge/Swagger%20UI-Interactive%20Docs-009688.svg?logo=swagger)](/docs)
[![ReDoc Reference](https://img.shields.io/badge/ReDoc-API%20Reference-purple.svg?logo=openapi-initiative)](/redoc)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**UrbanTwin AI** is a high-performance urban mobility digital twin and predictive traffic intelligence backend powered by FastAPI, graph analytics, machine learning (XGBoost / Random Forest), and real-time camera telemetry. It enables smart cities to simulate scenario interventions, re-identify vehicles cross-camera while preserving privacy, predict road congestion, detect traffic anomalies, and optimize signal timing.

---

## 🚀 Key Features

* **🛰️ Multi-Camera Network Graph**: Real-time camera telemetry modeling junctions, throughput, and connected road segments using topological graph algorithms.
* **🔒 Privacy-Preserving ANPR**: Irreversible SHA-256 salted hashing for license plates, ensuring GDPR & CCPA compliant cross-camera re-identification.
* **📈 Predictive ML Congestion Engine**: Machine-learning powered predictions for road speeds, congestion index, and travel time.
* **🧪 Digital Twin "What-If" Simulation**: Run real-time simulation experiments (road closures, capacity surges, signal timing adjustments) with instant metric impact diffs.
* **🚨 Real-Time Anomaly & Incident Detection**: Automated detection of sudden congestion spikes, speed drops, and stalled vehicles.
* **🛡️ Security-First Architecture**: JWT authentication, SlowAPI rate-limiting, strict security headers (CSP, HSTS, XSS protection, X-Frame-Options), and non-root Docker execution.
* **💻 Built-in Interactive Web UI**: Embedded dashboard (`/` or `/dashboard`) to monitor network status, live cameras, road analytics, and simulation metrics.
* **⚡ Full VS Code Integration**: Preconfigured launch configs, debug profiles, automated tasks, and workspace settings.

---

## 📂 Project Structure

```text
urbantwin-ai/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI automated testing workflow
├── .vscode/
│   ├── extensions.json          # Recommended VS Code extensions
│   ├── launch.json              # 1-Click debug configurations (FastAPI, Pytest, Live test)
│   ├── settings.json            # VS Code workspace settings & pytest integration
│   └── tasks.json               # Predefined build, test, and docker tasks
├── backend/
│   ├── app/
│   │   ├── api/v1/              # API router endpoints
│   │   │   ├── anomalies.py     # Anomaly and incident detection
│   │   │   ├── auth.py          # JWT authentication
│   │   │   ├── cameras.py       # Camera feed ingestion & health
│   │   │   ├── predictions.py   # ML traffic forecasting
│   │   │   ├── roads.py         # Road segment telemetry & analytics
│   │   │   ├── simulation.py    # Digital Twin simulation engine
│   │   │   ├── traffic.py       # Live traffic snapshots & history
│   │   │   └── vehicles.py      # Vehicle detection & re-identification
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic Settings & environment variables
│   │   │   ├── rate_limiter.py  # SlowAPI rate limiting configuration
│   │   │   └── security.py      # Password hashing & JWT token handling
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic data schemas
│   │   ├── services/            # Core business logic & ML services
│   │   │   ├── anomaly_service.py
│   │   │   ├── anpr_service.py
│   │   │   ├── camera_service.py
│   │   │   ├── detection_service.py
│   │   │   ├── graph_service.py
│   │   │   ├── matching_service.py
│   │   │   ├── prediction_service.py
│   │   │   └── simulation_service.py
│   │   └── main.py              # FastAPI application entrypoint & middleware
│   ├── static/                  # Built-in Web UI & Dashboard
│   │   ├── index.html
│   │   └── js/app.js
│   ├── tests/                   # Pytest test suite & verification scripts
│   │   ├── test_api.py
│   │   └── verify_live.py
│   ├── Dockerfile               # Production hardened non-root containerfile
│   ├── pytest.ini               # Pytest configuration
│   └── requirements.txt         # Python dependencies
├── .env.example                 # Environment variables template
├── .gitignore                   # Git ignore rules
├── docker-compose.yml           # Multi-container orchestration
├── LICENSE                      # MIT License
├── README.md                    # Project documentation
└── run.py                       # One-click startup script
```

---

## 🛠️ Quickstart

### 1. Run with VS Code (Recommended)
1. Open the project root in VS Code:
   ```bash
   code .
   ```
2. Press **`F5`** or go to the **Run & Debug** panel and select **`FastAPI: Run & Debug Server`**.
3. Open your browser at [http://127.0.0.1:8000](http://127.0.0.1:8000).

---

### 2. Run with Python CLI
```bash
# Clone the repository
git clone https://github.com/your-username/urbantwin-ai.git
cd urbantwin-ai

# Optional: Create and activate virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run the application
python run.py
```

---

### 3. Run with Docker Compose
```bash
# Build and run containers in background
docker-compose up -d --build

# View container logs
docker-compose logs -f

# Stop containers
docker-compose down
```

---

## 🧪 Testing & Verification

Run the comprehensive unit test suite:
```bash
pytest backend
```

Run live endpoint latency and telemetry verification (when server is active):
```bash
python backend/tests/verify_live.py
```

---

## 🧠 Train Personalized Model in Google Colab

UrbanTwin AI includes a pre-built Google Colab training studio with a synthetic demo dataset generator:

* **Colab Notebook**: [`UrbanTwin_AI_Personalized_Model_Colab.ipynb`](UrbanTwin_AI_Personalized_Model_Colab.ipynb) (or [`backend/training/UrbanTwin_AI_Personalized_Model_Colab.ipynb`](backend/training/UrbanTwin_AI_Personalized_Model_Colab.ipynb))
* **Guide**: See [COLAB_TRAINING_GUIDE.md](COLAB_TRAINING_GUIDE.md) for full instructions.

### 1-Click Steps:
1. Open [Google Colab](https://colab.research.google.com) and upload `UrbanTwin_AI_Personalized_Model_Colab.ipynb`.
2. Select **Runtime** > **Change runtime type** > **T4 GPU**.
3. Run all cells to train the **STN-CRNN OCR model** and **XGBoost Traffic Predictor**.
4. The notebook automatically downloads `urbantwin_personalized_ocr.pth`.
5. Place the checkpoint in `backend/training/urbantwin_personalized_ocr.pth` and start the backend to enjoy live deep learning inference!

---

## 🌐 API Endpoints & Documentation

Once running, interactive documentation is accessible at:
* **Interactive Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **ReDoc Interactive Reference**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
* **Web Dashboard**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

### Core Endpoint Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System health check & timestamp |
| `POST` | `/api/v1/auth/login` | Authenticate user & issue JWT bearer token |
| `GET` | `/api/v1/cameras` | List all connected traffic cameras & status |
| `POST` | `/api/v1/cameras/{id}/process` | Ingest vehicle detection frame from camera |
| `GET` | `/api/v1/roads` | Retrieve road network segment telemetry |
| `GET` | `/api/v1/roads/{id}/analytics` | Detailed analytics for a road segment |
| `GET` | `/api/v1/vehicles` | Query detected vehicles & trajectory history |
| `GET` | `/api/v1/vehicles/matches` | Cross-camera matched vehicle trajectories |
| `GET` | `/api/v1/predictions` | Predictive traffic & congestion forecasts |
| `GET` | `/api/v1/anomalies` | Detected traffic anomalies & incident alerts |
| `POST` | `/api/v1/simulation` | Run "What-If" digital twin traffic simulation |

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env` and configure your environment:

```ini
# Security & Secret Keys
SECRET_KEY=your-production-secret-key-must-be-long-and-random
ANPR_SALT=your-unique-anpr-salt-for-privacy-hashing

# Network Settings
HOST=0.0.0.0
PORT=8000
RELOAD=false
ENVIRONMENT=production

# Rate Limiting
RATE_LIMIT_DEFAULT=100/minute
RATE_LIMIT_SIMULATION=20/minute
RATE_LIMIT_AUTH=10/minute
```

---

## 🚢 Production Deployment Guide

### Deploying to Cloud (Render / Railway / Fly.io / AWS ECS / GCP Cloud Run)

#### Option A: Docker Container Deployment
Because a security-hardened `Dockerfile` is provided with non-root user execution, you can deploy directly:
```bash
# Build the production image
docker build -t your-registry/urbantwin-ai:latest ./backend

# Run with custom environment variables
docker run -d -p 8000:8000 \
  -e SECRET_KEY="your-production-secret-key" \
  -e ANPR_SALT="your-production-anpr-salt" \
  your-registry/urbantwin-ai:latest
```

#### Option B: PaaS (e.g. Render / Railway / Heroku / Cloud Run)
1. Link your source repository or container image.
2. Set Build Command: `pip install -r backend/requirements.txt`
3. Set Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --app-dir backend`
4. Set Environment Variables (`SECRET_KEY`, `ANPR_SALT`, `ENVIRONMENT=production`).

---

## 📖 Interactive API Documentation (Swagger UI & ReDoc)

UrbanTwin AI provides two interactive, developer-grade API documentation interfaces built directly into the server:

### 1. Swagger UI (`/docs`)
* **URL:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **Features:**
  * Interactive **"Try it out"** live execution enabled for all endpoints.
  * Native **JWT Bearer Authorization**: Click the **Authorize** 🔓 button at the top right, provide your token, and test protected endpoints directly.
  * Real-time request duration telemetry and response payload formatting.
  * Curated domain grouping (`Auth`, `Cameras`, `Traffic`, `Vehicles`, `Roads`, `Predictions`, `Anomalies`, `Simulation`, `Health`).
  * Custom dark cyber theme matching the UrbanTwin 3D operations console.

### 2. ReDoc Specification (`/redoc`)
* **URL:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
* **Features:**
  * Clean, three-column human-readable API architecture view.
  * Complete JSON schema representations for all requests, responses, and validation models.
  * Deep-linking and real-time search across schemas and endpoints.

### 🔐 Authenticating in Swagger UI
1. Navigate to `/docs`.
2. Expand the `POST /api/v1/auth/token` endpoint and execute with credentials (or run the mock auth route).
3. Copy the returned `access_token`.
4. Click the **Authorize** button at the top of Swagger UI.
5. In the `BearerAuth` dialog, enter your token (e.g. `Bearer <your_token>`) and click **Authorize**.
6. All subsequent requests in Swagger UI will automatically include the `Authorization: Bearer <token>` header!

---

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.
