from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.database import Base


class Floor(Base):
    __tablename__ = "floors"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    building_id = Column(String, ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False)
    floor_number = Column(Integer, nullable=False, default=1)
    floor_name = Column(String, nullable=True)  # e.g., "Floor 1 - Reception & Lobby"
    blueprint_path = Column(String, nullable=True)  # Path to uploaded floor blueprint image
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    building = relationship("Building", back_populates="floors")
    cameras = relationship("Camera", back_populates="floor")
