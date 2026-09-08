from sqlalchemy import Column, String, DateTime, Text, ForeignKey
import uuid
from datetime import datetime
from app.core.database import Base

class Case(Base):
    __tablename__ = "cases"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_number = Column(String, unique=True, index=True, nullable=False) # e.g. CASE-2026-001
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="OPEN") # OPEN, IN_PROGRESS, CLOSED
    assigned_investigator_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class InvestigationEvent(Base):
    __tablename__ = "investigation_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    subject_id = Column(String, ForeignKey("subjects.id"), nullable=True)
    event_type = Column(String, nullable=False) # Appearance, Interaction, Alert
    event_timestamp = Column(DateTime, default=datetime.utcnow)
    description = Column(Text, nullable=False)
    frame_number = Column(String, nullable=True)
    clip_path = Column(String, nullable=True)
