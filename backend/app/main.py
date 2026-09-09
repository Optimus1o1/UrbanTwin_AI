import os
import time
from pathlib import Path
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.rate_limiter import limiter
from app.api.v1 import auth, cameras, traffic, vehicles, roads, predictions, anomalies, simulation

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Multi-Camera Traffic Intelligence & Predictive Urban Digital Twin API",
    docs_url=None,  # Custom interactive handler below
    redoc_url=None, # Custom interactive handler below
)

# Attach SlowAPI Rate Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security Middleware: CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Security Middleware: Security Headers & Response Time Tracking
@app.middleware("http")
async def add_security_headers_and_timing(request: Request, call_next):
    start_time = time.time()
    try:
        response: Response = await call_next(request)
    except Exception as exc:
        # SECURITY HARDENING: Mask internal stack traces in production error responses
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred. Please contact system administrator."}
        )

    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    
    # Security Headers with permissive CSP for Swagger UI / ReDoc interactivity
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: http: https: blob:; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.tailwindcss.com https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.redoc.ly; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; "
        "worker-src 'self' blob: https://cdn.jsdelivr.net https://cdn.redoc.ly; "
        "child-src 'self' blob:; "
        "connect-src 'self' ws: wss: http: https: https://cdn.jsdelivr.net https://cdn.redoc.ly;"
    )
    
    return response

# Static files directory setup
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
INDEX_HTML = STATIC_DIR / "index.html"
DASHBOARD_HTML = STATIC_DIR / "dashboard.html"

# Custom OpenAPI Schema with JWT Bearer Security & Curated Tags
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=f"{settings.PROJECT_NAME} - Digital Twin API Engine",
        version=settings.VERSION,
        description=(
            "### UrbanTwin AI: Autonomous Traffic Intelligence & Predictive Digital Twin Platform\n\n"
            "Comprehensive REST & Streaming API for real-time traffic telemetrics, vehicle re-identification, "
            "anomaly incident dispatching, AI-driven congestion forecasting, and what-if simulation scenarios.\n\n"
            "**Key Capabilities:**\n"
            "- 🔐 **Security & RBAC:** JWT Bearer authentication with operator and admin roles.\n"
            "- 📹 **Edge Camera Network:** Live feeds, telemetry ingestion, and optical status tracking.\n"
            "- 🚗 **Cross-Camera ReID:** Hash-based and visual feature tracking across city cameras.\n"
            "- 🚦 **Congestion & Signal Opt:** Dynamic signal plan adjustments and bottleneck remediation.\n"
            "- 🔮 **Predictive Forecasting:** Graph neural predictive models for 15-60 min traffic horizons.\n"
            "- ⚡ **Simulation Engine:** Macroscopic grid simulations for closures, weather events, and diversions."
        ),
        routes=app.routes,
    )

    if "components" not in openapi_schema:
        openapi_schema["components"] = {}

    openapi_schema["components"]["securitySchemes"] = {
        "OAuth2PasswordBearer": {
            "type": "oauth2",
            "flows": {
                "password": {
                    "tokenUrl": f"{settings.API_V1_STR}/auth/token",
                    "scopes": {}
                }
            }
        },
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter your JWT Bearer token obtained from `/api/v1/auth/token` or `/api/v1/auth/login`"
        }
    }

    openapi_schema["security"] = [{"BearerAuth": []}, {"OAuth2PasswordBearer": []}]

    openapi_schema["tags"] = [
        {"name": "Auth", "description": "Authentication, user registration, JWT token lifecycle and role queries."},
        {"name": "Cameras", "description": "Edge CCTV node registration, telemetry feeds, and optical status."},
        {"name": "Traffic", "description": "Real-time flow rates, speed analysis, and intersection densities."},
        {"name": "Vehicles", "description": "Multi-camera vehicle re-identification (ReID) and trajectory tracking."},
        {"name": "Roads", "description": "Urban road network topology, segment capacity, and physical conditions."},
        {"name": "Predictions", "description": "AI-powered congestion forecasts and predictive travel-time metrics."},
        {"name": "Anomalies", "description": "Incident detection (accidents, stalled vehicles, lane blockages) and dispatch."},
        {"name": "Simulation", "description": "What-if scenario modeling: road closures, signal timing adjustments, and evacuation routing."},
        {"name": "Health", "description": "Service health probes and cluster uptime telemetry."}
    ]

    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Custom Interactive Swagger UI Endpoint
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    response = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Interactive API Explorer",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
        swagger_ui_parameters={
            "persistAuthorization": True,
            "displayRequestDuration": True,
            "tryItOutEnabled": True,
            "filter": True,
            "docExpansion": "list",
            "syntaxHighlight.theme": "monokai",
            "defaultModelsExpandDepth": 1,
        },
    )
    # Inject custom cyber-dark CSS theme to align with UrbanTwin design
    dark_custom_css = b"""
    <style>
      body { background-color: #0b0f19 !important; color: #f1f5f9 !important; }
      .swagger-ui .topbar { background-color: #0f172a !important; border-bottom: 1px solid #1e293b !important; }
      .swagger-ui .info .title { color: #38bdf8 !important; }
      .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info table { color: #94a3b8 !important; }
      .swagger-ui .scheme-container { background: #0f172a !important; box-shadow: none !important; border-bottom: 1px solid #1e293b !important; }
      .swagger-ui .opblock-tag { color: #f8fafc !important; border-bottom: 1px solid #334155 !important; }
      .swagger-ui .opblock-tag small { color: #94a3b8 !important; }
      .swagger-ui .opblock .opblock-summary-operation-id, .swagger-ui .opblock .opblock-summary-path { color: #e2e8f0 !important; }
      .swagger-ui .opblock .opblock-summary-description { color: #94a3b8 !important; }
      .swagger-ui section.models { border-color: #1e293b !important; }
      .swagger-ui section.models h4 { color: #cbd5e1 !important; }
      .swagger-ui .model-box { background: #0f172a !important; }
      .swagger-ui .btn.authorize { color: #38bdf8 !important; border-color: #38bdf8 !important; }
      .swagger-ui .btn.authorize svg { fill: #38bdf8 !important; }
      .swagger-ui .btn.execute { background-color: #0284c7 !important; border-color: #0284c7 !important; color: #fff !important; }
    </style>
    """
    return HTMLResponse(content=response.body.replace(b"</head>", dark_custom_css + b"</head>"))

# Custom ReDoc Endpoint
@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html():
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - ReDoc Interactive Reference",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@2/bundles/redoc.standalone.js",
        redoc_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
        with_google_fonts=True,
    )

# Root route (Landing Page)
@app.get("/", include_in_schema=False)
def root():
    if INDEX_HTML.exists():
        return FileResponse(str(INDEX_HTML))
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "anonymization_salt_active": bool(settings.ANPR_SALT),
        "docs": "/docs",
        "redoc": "/redoc"
    }

# Health Check
@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")}

# Include API v1 Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(cameras.router, prefix=settings.API_V1_STR)
app.include_router(traffic.router, prefix=settings.API_V1_STR)
app.include_router(vehicles.router, prefix=settings.API_V1_STR)
app.include_router(roads.router, prefix=settings.API_V1_STR)
app.include_router(predictions.router, prefix=settings.API_V1_STR)
app.include_router(anomalies.router, prefix=settings.API_V1_STR)
app.include_router(simulation.router, prefix=settings.API_V1_STR)

# Mount Dashboard Static Web App
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/dashboard", include_in_schema=False)
    @app.get("/ui", include_in_schema=False)
    @app.get("/app", include_in_schema=False)
    def get_dashboard():
        if DASHBOARD_HTML.exists():
            return FileResponse(str(DASHBOARD_HTML))
        return FileResponse(str(INDEX_HTML))
