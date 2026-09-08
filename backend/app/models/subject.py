from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Float
import uuid
from datetime import datetime
from app.core.database import Base

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    subject_code = Column(String, unique=True, index=True, nullable=False) # SUBJ-101
    primary_track_id = Column(String, ForeignKey("tracking_events.id"), nullable=True)
    appearance_metadata = Column(Text, nullable=True) # JSON attributes (clothing, colors)
    reid_embedding = Column(Text, nullable=True) # JSON list of floats
    thumbnail_path = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SubjectCameraMatch(Base):
    __tablename__ = "subject_camera_matches"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_subject_id = Column(String, ForeignKey("subjects.id"), nullable=False)
    target_camera_id = Column(String, ForeignKey("cameras.id"), nullable=False)
    target_track_id = Column(String, ForeignKey("tracking_events.id"), nullable=False)
    similarity_score = Column(Float, nullable=False) # e.g. 0.92
    matched_at = Column(DateTime, default=datetime.utcnow)
