from sqlalchemy import Column, String, DateTime, Text, ForeignKey
import uuid
from datetime import datetime
from app.core.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    username = Column(String, nullable=False)
    action = Column(String, nullable=False) # e.g. EVIDENCE_UPLOAD, REPORT_GENERATE
    resource_type = Column(String, nullable=False)
    resource_id = Column(String, nullable=True)
    details = Column(Text, nullable=True) # JSON details
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    blockchain_tx_hash = Column(String, nullable=True)
