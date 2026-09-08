import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.models.floor import Floor
from app.models.building import Building
from app.models.camera import Camera
from app.schemas.floor import FloorCreate, FloorResponse, FloorUpdate

router = APIRouter(prefix="/floors", tags=["Floors"])

BLUEPRINTS_DIR = os.path.join(settings.STORAGE_DIR, "blueprints")
os.makedirs(BLUEPRINTS_DIR, exist_ok=True)


def _enrich_floor(floor: Floor, db: Session) -> dict:
    cam_count = db.query(Camera).filter(Camera.floor_id == floor.id).count()
    blueprint_url = f"{settings.API_V1_STR}/floors/{floor.id}/blueprint-file" if floor.blueprint_path else None
    return {
        "id": floor.id,
        "building_id": floor.building_id,
        "floor_number": floor.floor_number,
        "floor_name": floor.floor_name or f"Floor {floor.floor_number}",
        "blueprint_path": floor.blueprint_path,
        "blueprint_url": blueprint_url,
        "camera_count": cam_count,
        "created_at": floor.created_at,
        "updated_at": floor.updated_at,
    }


@router.get("", response_model=List[FloorResponse])
def list_floors(building_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Floor)
    if building_id:
        q = q.filter(Floor.building_id == building_id)
    floors = q.order_by(Floor.floor_number).all()
    return [_enrich_floor(f, db) for f in floors]


@router.get("/{floor_id}", response_model=FloorResponse)
def get_floor(floor_id: str, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return _enrich_floor(floor, db)


@router.post("", response_model=FloorResponse)
def create_floor(floor_in: FloorCreate, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == floor_in.building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    floor = Floor(**floor_in.model_dump())
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return _enrich_floor(floor, db)


@router.post("/{floor_id}/blueprint", response_model=FloorResponse)
async def upload_blueprint(
    floor_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    # Validate image extension
    allowed_exts = {".png", ".jpg", ".jpeg", ".webp"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{ext}'. Allowed blueprint image formats: PNG, JPG, JPEG, WebP"
        )

    filename = f"blueprint_{floor.id}_{uuid.uuid4().hex[:8]}{ext}"
    saved_path = os.path.join(BLUEPRINTS_DIR, filename)

    contents = await file.read()
    with open(saved_path, "wb") as f:
        f.write(contents)

    floor.blueprint_path = saved_path
    db.commit()
    db.refresh(floor)
    return _enrich_floor(floor, db)


@router.get("/{floor_id}/blueprint-file")
def get_blueprint_file(floor_id: str, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor or not floor.blueprint_path or not os.path.exists(floor.blueprint_path):
        raise HTTPException(status_code=404, detail="Blueprint image file not found")
    
    ext = os.path.splitext(floor.blueprint_path)[1].lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    }
    return FileResponse(floor.blueprint_path, media_type=media_types.get(ext, "image/png"))


@router.patch("/{floor_id}", response_model=FloorResponse)
def update_floor(floor_id: str, update_in: FloorUpdate, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    for field, value in update_in.model_dump(exclude_unset=True).items():
        setattr(floor, field, value)

    db.commit()
    db.refresh(floor)
    return _enrich_floor(floor, db)


@router.delete("/{floor_id}")
def delete_floor(floor_id: str, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    
    # Unassign cameras on this floor
    db.query(Camera).filter(Camera.floor_id == floor_id).update({"floor_id": None})
    
    # Remove file if exists
    if floor.blueprint_path and os.path.exists(floor.blueprint_path):
        try:
            os.remove(floor.blueprint_path)
        except Exception:
            pass

    db.delete(floor)
    db.commit()
    return {"detail": "Floor deleted successfully"}
