from sqlalchemy import Column, String, Float, Integer, ForeignKey, DateTime
import uuid
from datetime import datetime
from app.core.database import Base

class Detection(Base):
    __tablename__ = "detections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(String, ForeignKey("videos.id"), nullable=False)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    track_id = Column(Integer, nullable=True, index=True)  # Persistent MOT track identifier
    frame_number = Column(Integer, nullable=False)
    timestamp_offset = Column(Float, nullable=False)  # seconds into video (video-relative time)
    real_world_timestamp = Column(DateTime, nullable=True)  # Derived real-world timestamp in UTC (Nullable)
    timestamp_source = Column(String, nullable=True)  # USER_PROVIDED, VIDEO_OVERLAY, FILE_METADATA, UNKNOWN
    class_name = Column(String, nullable=False)  # person, car, motorcycle, etc.
    confidence = Column(Float, nullable=False)
    bbox_x = Column(Float, nullable=False)  # Normalized 0.0 - 1.0
    bbox_y = Column(Float, nullable=False)
    bbox_w = Column(Float, nullable=False)
    bbox_h = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


