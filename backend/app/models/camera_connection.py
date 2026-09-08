from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.database import Base


class CameraConnection(Base):
    __tablename__ = "camera_connections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_camera_id = Column(String, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    target_camera_id = Column(String, ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    description = Column(String, nullable=True)  # e.g., "Corridor to Stairwell B"
    created_at = Column(DateTime, default=datetime.utcnow)

    source_camera = relationship("Camera", foreign_keys=[source_camera_id])
    target_camera = relationship("Camera", foreign_keys=[target_camera_id])
