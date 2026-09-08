import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "SENTINEL AI - CCTV Investigation Platform"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "sentinel_secret_key_super_secure_jwt_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    DATABASE_URL: str = "sqlite:///./sentinel.db"
    SQLITE_FALLBACK_URL: str = "sqlite:///./sentinel.db"
    
    GEMINI_API_KEY: Optional[str] = None
    STORAGE_DIR: str = "./storage"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

# Ensure storage directories exist
os.makedirs(os.path.join(settings.STORAGE_DIR, "raw_videos"), exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_DIR, "processed_videos"), exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_DIR, "crops"), exist_ok=True)
os.makedirs(os.path.join(settings.STORAGE_DIR, "heatmaps"), exist_ok=True)
