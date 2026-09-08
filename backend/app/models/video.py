from sqlalchemy import Column, String, Float, Integer, BigInteger, DateTime, ForeignKey
import uuid
from datetime import datetime
from app.core.database import Base

class Video(Base):
    __tablename__ = "videos"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    sha256_hash = Column(String(64), nullable=False)
    duration_seconds = Column(Float, default=0.0)
    fps = Column(Float, default=30.0)
    width = Column(Integer, default=1920)
    height = Column(Integer, default=1080)
    frame_count = Column(Integer, default=0)
    # Temporal metadata
    recording_date = Column(String, nullable=True)  # e.g., "2026-08-12"
    recording_start_time = Column(String, nullable=True)  # e.g., "14:00:00"
    recording_timezone = Column(String, default="Asia/Kolkata")  # e.g., "Asia/Kolkata", "UTC"
    recording_start_datetime = Column(DateTime, nullable=True)  # Nullable UTC start datetime if known/confirmed
    timestamp_source = Column(String, default="UNKNOWN")  # USER_PROVIDED, VIDEO_OVERLAY, FILE_METADATA, UNKNOWN
    timestamp_status = Column(String, default="UNAVAILABLE")  # CONFIRMED, UNAVAILABLE, PROVISIONAL
    detected_file_creation_time = Column(DateTime, nullable=True)  # File metadata creation timestamp reference
    start_timestamp = Column(DateTime, default=datetime.utcnow)  # Legacy compatibility fallback
    processing_status = Column(String, default="PENDING")  # PENDING, PROCESSING, COMPLETED, FAILED
    processed_video_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

