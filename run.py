#!/usr/bin/env python3
"""
UrbanTwin AI - Server Startup Script
Run easily using: python run.py
"""
import sys
import os
from pathlib import Path
import uvicorn

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() in ("true", "1", "yes")

    print(f"[*] Starting UrbanTwin AI server at http://{host}:{port}")
    print(f"[*] Dashboard & UI: http://{host}:{port}/")
    print(f"[*] Interactive Swagger Docs: http://{host}:{port}/docs")
    print(f"[*] Redoc Documentation: http://{host}:{port}/redoc")
    print("=" * 60)

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
        app_dir=str(backend_dir)
    )
