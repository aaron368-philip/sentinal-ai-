from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import os

from app.core.database import get_db
from app.models.tracking import TrackingEvent
from app.models.video import Video
from app.models.camera import Camera

router = APIRouter(prefix="/tracking", tags=["Tracking"])


@router.get("/videos/{video_id}/tracks")
def get_video_tracks(
    video_id: str,
    class_name: Optional[str] = Query(None, description="Filter by class e.g. person, car"),
    db: Session = Depends(get_db)
):
    """
    Retrieve all persistent tracked objects associated with a specific CCTV video feed.
    """
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    query = db.query(TrackingEvent).filter(TrackingEvent.video_id == video_id)
    if class_name:
        query = query.filter(TrackingEvent.class_name.ilike(class_name))

    events = query.order_by(TrackingEvent.start_time_offset.asc()).all()

    results = []
    for ev in events:
        traj = []
        if ev.bbox_trajectory:
            try:
                traj = json.loads(ev.bbox_trajectory)
            except Exception:
                traj = []

        thumbnail_url = None
        if ev.thumbnail_path and os.path.exists(ev.thumbnail_path):
            filename = os.path.basename(ev.thumbnail_path)
            thumbnail_url = f"/api/v1/tracking/thumbnails/{video.id}/{filename}"

        results.append({
            "id": ev.id,
            "video_id": ev.video_id,
            "camera_id": ev.camera_id,
            "track_id": ev.track_id,
            "class_name": ev.class_name,
            "start_frame": ev.start_frame,
            "end_frame": ev.end_frame,
            "start_time_offset": ev.start_time_offset,
            "end_time_offset": ev.end_time_offset,
            "duration_seconds": round(ev.end_time_offset - ev.start_time_offset, 2),
            "real_world_start_time": ev.real_world_start_time.isoformat() if ev.real_world_start_time else None,
            "real_world_end_time": ev.real_world_end_time.isoformat() if ev.real_world_end_time else None,
            "total_detections": ev.total_detections,
            "avg_confidence": ev.avg_confidence,
            "trajectory_points_count": len(traj),
            "trajectory": traj,
            "thumbnail_url": thumbnail_url,
            "created_at": ev.created_at.isoformat() if ev.created_at else None
        })

    return results


@router.get("/videos/{video_id}/tracks/{track_id}")
def get_track_detail(
    video_id: str,
    track_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed trajectory coordinates and telemetry for a specific persistent track ID.
    """
    event = db.query(TrackingEvent).filter(
        TrackingEvent.video_id == video_id,
        TrackingEvent.track_id == track_id
    ).first()

    if not event:
        raise HTTPException(status_code=404, detail="Track ID not found for this video")

    traj = []
    if event.bbox_trajectory:
        try:
            traj = json.loads(event.bbox_trajectory)
        except Exception:
            traj = []

    thumbnail_url = None
    if event.thumbnail_path and os.path.exists(event.thumbnail_path):
        filename = os.path.basename(event.thumbnail_path)
        thumbnail_url = f"/api/v1/tracking/thumbnails/{video_id}/{filename}"

    return {
        "id": event.id,
        "video_id": event.video_id,
        "camera_id": event.camera_id,
        "track_id": event.track_id,
        "class_name": event.class_name,
        "start_frame": event.start_frame,
        "end_frame": event.end_frame,
        "start_time_offset": event.start_time_offset,
        "end_time_offset": event.end_time_offset,
        "duration_seconds": round(event.end_time_offset - event.start_time_offset, 2),
        "real_world_start_time": event.real_world_start_time.isoformat() if event.real_world_start_time else None,
        "real_world_end_time": event.real_world_end_time.isoformat() if event.real_world_end_time else None,
        "total_detections": event.total_detections,
        "avg_confidence": event.avg_confidence,
        "trajectory": traj,
        "thumbnail_url": thumbnail_url
    }


@router.get("/cameras/{camera_id}/recent")
def get_camera_recent_tracks(
    camera_id: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Get recently tracked entities detected by a specific camera node.
    """
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    events = db.query(TrackingEvent).filter(
        TrackingEvent.camera_id == camera.id
    ).order_by(TrackingEvent.created_at.desc()).limit(limit).all()

    results = []
    for ev in events:
        results.append({
            "id": ev.id,
            "track_id": ev.track_id,
            "class_name": ev.class_name,
            "start_time_offset": ev.start_time_offset,
            "end_time_offset": ev.end_time_offset,
            "real_world_start_time": ev.real_world_start_time.isoformat() if ev.real_world_start_time else None,
            "real_world_end_time": ev.real_world_end_time.isoformat() if ev.real_world_end_time else None,
            "total_detections": ev.total_detections,
            "avg_confidence": ev.avg_confidence
        })

    return results


@router.get("/thumbnails/{video_id}/{filename}")
def get_track_thumbnail(video_id: str, filename: str):
    """
    Serve extracted crop thumbnail for a tracked subject.
    """
    from app.core.config import settings
    # Check both track crops and faces
    candidates = [
        os.path.join(settings.STORAGE_DIR, "thumbnails", video_id, "tracks", filename),
        os.path.join(settings.STORAGE_DIR, "thumbnails", video_id, "faces", filename),
        os.path.join(settings.STORAGE_DIR, "thumbnails", video_id, filename)
    ]
    for p in candidates:
        if os.path.exists(p):
            return FileResponse(p)

    raise HTTPException(status_code=404, detail="Thumbnail not found")


@router.post("/videos/{video_id}/consolidate")
def consolidate_video_tracks(video_id: str, db: Session = Depends(get_db)):
    """
    Manually trigger Re-ID post-processing consolidation for already processed tracks in a video.
    """
    from app.services.video_service import consolidate_video_tracks_db
    res = consolidate_video_tracks_db(video_id, db)
    return res

