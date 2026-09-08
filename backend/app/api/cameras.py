from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.camera import Camera
from app.models.building import Building
from app.models.floor import Floor
from app.schemas.camera import CameraResponse, CameraCreate, CameraUpdate, CameraReorderRequest

router = APIRouter(prefix="/cameras", tags=["Cameras"])


def _enrich(camera: Camera) -> dict:
    """Attach building_name and floor_name to camera dict for response."""
    d = {c.name: getattr(camera, c.name) for c in camera.__table__.columns}
    d["building_name"] = camera.building.name if camera.building else None
    d["floor_name"] = camera.floor.floor_name if camera.floor else (f"Floor {camera.floor.floor_number}" if camera.floor else None)
    return d


@router.get("", response_model=List[CameraResponse])
def list_cameras(
    building_id: Optional[str] = None,
    floor_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Camera)
    if building_id:
        q = q.filter(Camera.building_id == building_id)
    if floor_id:
        q = q.filter(Camera.floor_id == floor_id)
    cameras = q.order_by(Camera.display_order, Camera.camera_code).all()
    return [_enrich(c) for c in cameras]


@router.get("/{camera_id}", response_model=CameraResponse)
def get_camera(camera_id: str, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return _enrich(camera)


@router.post("", response_model=CameraResponse)
def create_camera(camera_in: CameraCreate, db: Session = Depends(get_db)):
    existing = db.query(Camera).filter(Camera.camera_code == camera_in.camera_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Camera code already exists")

    if camera_in.building_id:
        building = db.query(Building).filter(Building.id == camera_in.building_id).first()
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")

    if camera_in.floor_id:
        floor = db.query(Floor).filter(Floor.id == camera_in.floor_id).first()
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")

    existing_count = db.query(Camera).filter(
        Camera.building_id == camera_in.building_id
    ).count()

    camera = Camera(**camera_in.model_dump())
    if camera.display_order == 0:
        camera.display_order = existing_count
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return _enrich(camera)


@router.patch("/{camera_id}", response_model=CameraResponse)
def update_camera(camera_id: str, update_in: CameraUpdate, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if update_in.building_id:
        building = db.query(Building).filter(Building.id == update_in.building_id).first()
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")

    if update_in.floor_id:
        floor = db.query(Floor).filter(Floor.id == update_in.floor_id).first()
        if not floor:
            raise HTTPException(status_code=404, detail="Floor not found")

    for field, value in update_in.model_dump(exclude_unset=True).items():
        setattr(camera, field, value)

    db.commit()
    db.refresh(camera)
    return _enrich(camera)


@router.post("/reorder")
def reorder_cameras(request: CameraReorderRequest, db: Session = Depends(get_db)):
    """Batch update camera positions, angles, floor assignments, and display order."""
    for cam_update in request.cameras:
        camera = db.query(Camera).filter(Camera.id == cam_update.id).first()
        if camera:
            camera.position_x = cam_update.position_x
            camera.position_y = cam_update.position_y
            if cam_update.display_order is not None:
                camera.display_order = cam_update.display_order
            if cam_update.direction_angle is not None:
                camera.direction_angle = cam_update.direction_angle
            if cam_update.floor_id is not None:
                camera.floor_id = cam_update.floor_id
            if cam_update.area_zone is not None:
                camera.area_zone = cam_update.area_zone
    db.commit()
    return {"detail": f"Updated positions for {len(request.cameras)} cameras"}


@router.delete("/{camera_id}")
def delete_camera(camera_id: str, db: Session = Depends(get_db)):
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    cam_name = camera.name
    db.delete(camera)
    db.commit()
    return {"detail": f"Camera '{cam_name}' deleted successfully"}
