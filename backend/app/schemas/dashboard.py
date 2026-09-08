from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ActivityItem(BaseModel):
    id: str
    timestamp: str
    user: str
    action: str
    details: str
    type: str # info, alert, evidence, case

class AlertItem(BaseModel):
    id: str
    camera_code: str
    timestamp: str
    title: str
    severity: str # HIGH, MEDIUM, LOW
    status: str

class CameraStatusItem(BaseModel):
    id: str
    camera_code: str
    name: str
    status: str # ONLINE, OFFLINE, PROCESSING
    fps: int
    active_tracks: int

class DashboardMetrics(BaseModel):
    active_cameras: int
    total_cameras: int
    active_alerts: int
    open_investigations: int
    subjects_detected: int
    evidence_items: int
    processing_status: str
    recent_activity: List[ActivityItem]
    recent_alerts: List[AlertItem]
    camera_statuses: List[CameraStatusItem]
