from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.building import Building
from app.models.floor import Floor
from app.models.camera import Camera
from app.schemas.building import BuildingCreate, BuildingResponse, BuildingUpdate
from app.api.floors import _enrich_floor

router = APIRouter(prefix="/buildings", tags=["Buildings"])


def _enrich_building(b: Building, db: Session) -> dict:
    cam_count = db.query(Camera).filter(Camera.building_id == b.id).count()
    floors = db.query(Floor).filter(Floor.building_id == b.id).order_by(Floor.floor_number).all()
    enriched_floors = [_enrich_floor(f, db) for f in floors]
    return {
        "id": b.id,
        "code": b.code,
        "name": b.name,
        "description": b.description,
        "address": b.address,
        "floors_count": b.floors_count or len(floors) or 1,
        "created_at": b.created_at,
        "camera_count": cam_count,
        "floors": enriched_floors,
    }


@router.get("", response_model=List[BuildingResponse])
def list_buildings(db: Session = Depends(get_db)):
    buildings = db.query(Building).order_by(Building.name).all()
    return [_enrich_building(b, db) for b in buildings]


@router.get("/{building_id}", response_model=BuildingResponse)
def get_building(building_id: str, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return _enrich_building(building, db)


@router.post("", response_model=BuildingResponse)
def create_building(building_in: BuildingCreate, db: Session = Depends(get_db)):
    existing = db.query(Building).filter(Building.code == building_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Building code already exists")

    num_floors = building_in.floors_count if building_in.floors_count and building_in.floors_count > 0 else 1
    building = Building(**building_in.model_dump())
    building.floors_count = num_floors
    db.add(building)
    db.commit()
    db.refresh(building)

    # Automatically seed empty Floor slots (Floor 1, Floor 2, Floor 3...)
    for f_num in range(1, num_floors + 1):
        floor = Floor(
            building_id=building.id,
            floor_number=f_num,
            floor_name=f"Floor {f_num}"
        )
        db.add(floor)
    db.commit()
    db.refresh(building)

    return _enrich_building(building, db)


@router.patch("/{building_id}", response_model=BuildingResponse)
def update_building(building_id: str, update_in: BuildingUpdate, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    
    for field, value in update_in.model_dump(exclude_unset=True).items():
        setattr(building, field, value)
    
    db.commit()
    db.refresh(building)
    return _enrich_building(building, db)


@router.delete("/{building_id}")
def delete_building(building_id: str, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    
    # Unassign cameras instead of cascade-deleting them
    db.query(Camera).filter(Camera.building_id == building_id).update({"building_id": None, "floor_id": None})
    db.delete(building)
    db.commit()
    return {"detail": "Building deleted successfully"}

