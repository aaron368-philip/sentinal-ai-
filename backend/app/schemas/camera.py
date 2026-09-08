from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CameraBase(BaseModel):
    camera_code: str
    name: str
    location_description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = "ONLINE"
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    position_x: Optional[float] = 50.0
    position_y: Optional[float] = 50.0
    direction_angle: Optional[float] = 0.0
    orientation: Optional[str] = None
    area_zone: Optional[str] = None
    time_offset_seconds: Optional[float] = 0.0
    display_order: Optional[int] = 0


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    location_description: Optional[str] = None
    status: Optional[str] = None
    building_id: Optional[str] = None
    floor_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    direction_angle: Optional[float] = None
    orientation: Optional[str] = None
    area_zone: Optional[str] = None
    time_offset_seconds: Optional[float] = None
    display_order: Optional[int] = None


class CameraPositionUpdate(BaseModel):
    id: str
    position_x: float
    position_y: float
    display_order: Optional[int] = 0
    direction_angle: Optional[float] = 0.0
    floor_id: Optional[str] = None
    area_zone: Optional[str] = None
    time_offset_seconds: Optional[float] = None



class CameraReorderRequest(BaseModel):
    cameras: List[CameraPositionUpdate]


class CameraResponse(CameraBase):
    id: str
    created_at: datetime
    building_name: Optional[str] = None
    floor_name: Optional[str] = None

    class Config:
        from_attributes = True

