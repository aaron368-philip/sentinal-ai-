from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CameraConnectionCreate(BaseModel):
    source_camera_id: str
    target_camera_id: str
    description: Optional[str] = None


class CameraConnectionResponse(BaseModel):
    id: str
    source_camera_id: str
    target_camera_id: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
