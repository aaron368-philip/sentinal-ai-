from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class FloorBase(BaseModel):
    floor_number: int
    floor_name: Optional[str] = None


class FloorCreate(FloorBase):
    building_id: str


class FloorUpdate(BaseModel):
    floor_name: Optional[str] = None


class FloorResponse(FloorBase):
    id: str
    building_id: str
    blueprint_path: Optional[str] = None
    blueprint_url: Optional[str] = None
    camera_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
