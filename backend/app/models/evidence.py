from sqlalchemy import Column, String, DateTime, ForeignKey
import uuid
from datetime import datetime
from app.core.database import Base

class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    evidence_code = Column(String, unique=True, index=True, nullable=False) # e.g. EV-001
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    video_id = Column(String, ForeignKey("videos.id"), nullable=True)
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False) # CCTV_VIDEO, SNAPSHOT, REPORT
    sha256_hash = Column(String(64), nullable=False)
    verification_status = Column(String, default="VERIFIED") # VERIFIED, TAMPERED, UNVERIFIED
    uploaded_at = Column(DateTime, default=datetime.utcnow)
