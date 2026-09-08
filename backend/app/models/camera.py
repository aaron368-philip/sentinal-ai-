from sqlalchemy import Column, String, Float, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.database import Base

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    camera_code = Column(String, unique=True, index=True, nullable=False)  # e.g. CAM 01
    name = Column(String, nullable=False)  # e.g. South Gate Main Entrance
    location_description = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(String, default="ONLINE")  # ONLINE, OFFLINE, PROCESSING
    # Building & Floor association
    building_id = Column(String, ForeignKey("buildings.id", ondelete="SET NULL"), nullable=True)
    floor_id = Column(String, ForeignKey("floors.id", ondelete="SET NULL"), nullable=True)
    # Spatial normalized position on blueprint grid (0–100 relative %)
    position_x = Column(Float, default=50.0)
    position_y = Column(Float, default=50.0)
    # Direction angle (0° to 360°) & orientation string
    direction_angle = Column(Float, default=0.0)
    orientation = Column(String, nullable=True)  # e.g., "N", "NE", "E", "SE", "S", "SW", "W", "NW"
    # Semantic Area / Zone
    area_zone = Column(String, nullable=True)  # e.g., "Main Entrance", "Lobby", "Corridor", "Parking"
    # Camera clock time drift offset in seconds (e.g. -12.0s)
    time_offset_seconds = Column(Float, default=0.0)
    # Manual display order within a building/floor
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    building = relationship("Building", back_populates="cameras")
    floor = relationship("Floor", back_populates="cameras")

