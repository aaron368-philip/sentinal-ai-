from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text
import uuid
from datetime import datetime
from app.core.database import Base

class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(String, ForeignKey("videos.id"), nullable=False)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    track_id = Column(Integer, nullable=False, index=True)  # e.g. 12
    class_name = Column(String, nullable=False)  # e.g. person, car
    start_frame = Column(Integer, nullable=False)
    end_frame = Column(Integer, nullable=False)
    start_time_offset = Column(Float, nullable=False, default=0.0)  # Video-relative start in seconds
    end_time_offset = Column(Float, nullable=False, default=0.0)  # Video-relative end in seconds
    real_world_start_time = Column(DateTime, nullable=True)  # UTC real-world start
    real_world_end_time = Column(DateTime, nullable=True)  # UTC real-world end
    total_detections = Column(Integer, default=1)
    avg_confidence = Column(Float, default=0.0)
    bbox_trajectory = Column(Text, nullable=True)  # JSON string of list of [x, y, w, h, frame, time_offset]
    thumbnail_path = Column(String, nullable=True)  # Path to best face/crop thumbnail
    reid_embedding = Column(Text, nullable=True)  # JSON serialized deep appearance embedding vector
    created_at = Column(DateTime, default=datetime.utcnow)

