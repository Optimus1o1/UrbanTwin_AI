import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "UrbanTwin AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security Configuration
    SECRET_KEY: str = os.getenv("SECRET_KEY", "urbantwin-super-secret-key-change-in-production-2026-secure")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Data Privacy (ANPR Salt for SHA-256 Anonymization)
    ANPR_SALT: str = os.getenv("ANPR_SALT", "urbantwin_anpr_salt_privacy_protection_9921")
    
    # Security: CORS settings
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000"
    ]
    
    # Security: Rate Limits
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_SIMULATION: str = "20/minute"
    RATE_LIMIT_AUTH: str = "10/minute"

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")

settings = Settings()
