from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.camera_connection import CameraConnection
from app.models.camera import Camera
from app.schemas.camera_connection import CameraConnectionCreate, CameraConnectionResponse

router = APIRouter(prefix="/camera-connections", tags=["Camera Connections"])


@router.get("", response_model=List[CameraConnectionResponse])
def list_camera_connections(building_id: str = None, db: Session = Depends(get_db)):
    q = db.query(CameraConnection)
    if building_id:
        # Join to filter by building
        q = q.join(Camera, CameraConnection.source_camera_id == Camera.id).filter(Camera.building_id == building_id)
    return q.all()


@router.post("", response_model=CameraConnectionResponse)
def create_camera_connection(conn_in: CameraConnectionCreate, db: Session = Depends(get_db)):
    source = db.query(Camera).filter(Camera.id == conn_in.source_camera_id).first()
    target = db.query(Camera).filter(Camera.id == conn_in.target_camera_id).first()
    if not source or not target:
        raise HTTPException(status_code=404, detail="Source or target camera not found")
    
    if source.id == target.id:
        raise HTTPException(status_code=400, detail="Cannot connect camera to itself")

    existing = db.query(CameraConnection).filter(
        CameraConnection.source_camera_id == conn_in.source_camera_id,
        CameraConnection.target_camera_id == conn_in.target_camera_id
    ).first()
    if existing:
        return existing

    connection = CameraConnection(**conn_in.model_dump())
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


@router.delete("/{connection_id}")
def delete_camera_connection(connection_id: str, db: Session = Depends(get_db)):
    conn = db.query(CameraConnection).filter(CameraConnection.id == connection_id).first()
    if not conn:
        raise HTTPException(status_code=404, detail="Camera connection not found")
    db.delete(conn)
    db.commit()
    return {"detail": "Camera connection deleted successfully"}
