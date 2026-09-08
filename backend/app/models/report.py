from sqlalchemy import Column, String, DateTime, Text, ForeignKey
import uuid
from datetime import datetime
from app.core.database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(String, ForeignKey("cases.id"), nullable=False)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    ai_findings = Column(Text, nullable=False)
    report_metadata = Column(Text, nullable=True) # JSON summary of findings, limitations, timeline
    generated_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
