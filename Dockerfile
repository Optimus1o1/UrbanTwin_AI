# ==============================================================================
# UrbanTwin AI - Production Dockerfile for Cloud Deployments (Render, Railway, etc.)
# Multi-stage Dockerfile with Non-Root Security Hardening
# ==============================================================================
FROM python:3.10-slim as base

# Set working directory
WORKDIR /app

# Prevent Python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install system dependencies (gcc for compiled extensions, curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only wheel first to keep image lightweight (~180MB vs 2.5GB+ CUDA)
# and avoid timeouts or memory limits during deployment
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install backend dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY backend/ .

# Copy environment example for fallback configuration
COPY .env.example ./.env.example

# SECURITY HARDENING: Create non-root user and group
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/sh appuser && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose default port (Render will override dynamically with $PORT)
EXPOSE 8000

# Health check targeting dynamic $PORT or fallback 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Start Uvicorn dynamically binding to $PORT (assigned by Render) or 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
