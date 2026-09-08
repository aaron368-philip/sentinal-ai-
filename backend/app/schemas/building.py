from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.floor import FloorResponse


class BuildingBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    address: Optional[str] = None
    floors_count: Optional[int] = 1


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    floors_count: Optional[int] = None


class BuildingResponse(BuildingBase):
    id: str
    created_at: datetime
    camera_count: Optional[int] = 0
    floors: Optional[List[FloorResponse]] = []

    class Config:
        from_attributes = True

