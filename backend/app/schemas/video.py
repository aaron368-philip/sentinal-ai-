from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class VideoBase(BaseModel):
    camera_id: str
    filename: str
    file_size_bytes: int
    sha256_hash: str
    duration_seconds: float
    fps: float
    width: int
    height: int
    frame_count: Optional[int] = 0
    processing_status: str
    recording_date: Optional[str] = None
    recording_start_time: Optional[str] = None
    recording_timezone: Optional[str] = "Asia/Kolkata"
    timestamp_source: Optional[str] = "UNKNOWN"
    timestamp_status: Optional[str] = "UNAVAILABLE"

class VideoResponse(VideoBase):
    id: str
    file_path: str
    processed_video_path: Optional[str] = None
    recording_start_datetime: Optional[datetime] = None
    detected_file_creation_time: Optional[datetime] = None
    start_timestamp: datetime
    created_at: datetime

    class Config:
        from_attributes = True

