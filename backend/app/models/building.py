from sqlalchemy import Column, String, DateTime, Integer
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.database import Base

class Building(Base):
    __tablename__ = "buildings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, unique=True, index=True, nullable=False) # e.g. BLDG_A
    name = Column(String, nullable=False) # e.g. Main Headquarters - Building A
    description = Column(String, nullable=True)
    address = Column(String, nullable=True)
    floors_count = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    floors = relationship("Floor", back_populates="building", cascade="all, delete-orphan", order_by="Floor.floor_number")
    cameras = relationship("Camera", back_populates="building")

