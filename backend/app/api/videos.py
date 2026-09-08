from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header, BackgroundTasks, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os, tempfile
import cv2
from app.core.database import get_db
from app.models.video import Video
from app.models.detection import Detection
from app.schemas.video import VideoResponse
from app.services.video_service import (
    save_and_process_uploaded_video,
    process_video_ai_background,
    extract_video_metadata,
    cancel_video_processing,
    delete_video_service
)

router = APIRouter(prefix="/videos", tags=["Videos"])


@router.post("/probe-metadata")
async def probe_video_metadata(file: UploadFile = File(...)):
    """
    Probe an uploaded video file for metadata (duration, FPS, frame count,
    and OS file creation time) WITHOUT persisting it.
    Used to pre-populate the upload form before the user confirms recording time.
    """
    allowed_extensions = [".mp4", ".avi", ".mov", ".mkv", ".webm"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file format '{file_ext}'")

    # Write to temp file to extract metadata, then clean up
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=file_ext)
    try:
        contents = await file.read()
        with os.fdopen(tmp_fd, "wb") as tmp:
            tmp.write(contents)
        meta = extract_video_metadata(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {
        "filename": file.filename,
        "duration_seconds": meta["duration_seconds"],
        "fps": meta["fps"],
        "frame_count": meta["frame_count"],
        "width": meta["width"],
        "height": meta["height"],
        "detected_file_creation_time": meta["detected_file_creation_time"].isoformat() if meta.get("detected_file_creation_time") else None
    }


@router.post("/upload", response_model=VideoResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    camera_id: str = Form(...),
    timestamp_source: Optional[str] = Form("UNKNOWN"),
    recording_date: Optional[str] = Form(None),
    recording_start_time: Optional[str] = Form(None),
    recording_timezone: Optional[str] = Form("Asia/Kolkata"),
    use_file_creation_time: Optional[str] = Form("false"),
    # Legacy: keep supporting old start_timestamp for backward compatibility
    start_timestamp: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    use_file_dt = use_file_creation_time in ("true", "True", "1", "yes")

    # Backwards compatibility: if old-style start_timestamp is provided with no new fields,
    # treat as USER_PROVIDED
    if start_timestamp and not recording_date and timestamp_source == "UNKNOWN":
        timestamp_source = "USER_PROVIDED"
        # Extract date/time from ISO string
        try:
            dt = datetime.fromisoformat(start_timestamp.replace('Z', '+00:00'))
            recording_date = dt.strftime("%Y-%m-%d")
            recording_start_time = dt.strftime("%H:%M:%S")
            recording_timezone = "UTC"
        except Exception:
            pass

    video = await save_and_process_uploaded_video(
        file=file,
        camera_id=camera_id,
        timestamp_source=timestamp_source or "UNKNOWN",
        recording_date=recording_date,
        recording_start_time=recording_start_time,
        recording_timezone=recording_timezone or "Asia/Kolkata",
        use_file_creation_time=use_file_dt,
        db=db,
        username="Investigator Admin"
    )

    background_tasks.add_task(process_video_ai_background, video.id, None, "yolo11m.pt", "person_and_bags", 3)
    return video


@router.get("/available-models")
def get_available_models():
    """List available YOLO detection models, accuracy tiers, and target class presets."""
    from app.services.ai_engine import AIEngine
    return {
        "active_default": "yolo11m.pt",
        "models": AIEngine.AVAILABLE_MODELS,
        "target_class_presets": AIEngine.TARGET_CLASS_PRESETS,
        "default_target_preset": "person_and_bags",
        "default_sample_fps": 3,
        "default_imgsz": 960,
        "resolution_presets": {
            960: {"name": "960px (Recommended)", "description": "High detection recall for walking & distant people in CCTV"},
            1280: {"name": "1280px (Ultra-HD)", "description": "Maximum detection accuracy for 1080p/4K surveillance"},
            640: {"name": "640px (Fast Preview)", "description": "Rapid inference baseline"}
        }
    }


@router.post("/{video_id}/process-ai")
def trigger_ai_processing(
    video_id: str,
    background_tasks: BackgroundTasks,
    model_name: Optional[str] = Query(None, description="YOLO model weight name e.g. yolo11m.pt, yolo11s.pt, yolo11n.pt"),
    target_classes: Optional[str] = Query("person_and_bags", description="Detection class filter mode: person_and_bags or all"),
    sample_fps: Optional[int] = Query(3, description="Sampled frames per second"),
    imgsz: Optional[int] = Query(960, description="Inference resolution: 640, 960, or 1280"),
    db: Session = Depends(get_db)
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video record not found")

    video.processing_status = "PENDING"
    db.commit()

    chosen_model = model_name or "yolo11m.pt"
    fps = sample_fps if (sample_fps and 1 <= sample_fps <= 30) else 3
    targets = target_classes or "person_and_bags"
    chosen_imgsz = imgsz if (imgsz and imgsz in (640, 960, 1280)) else 960

    background_tasks.add_task(process_video_ai_background, video.id, None, chosen_model, targets, fps, chosen_imgsz)
    return {
        "message": f"AI Processing queued successfully using {chosen_model} ({chosen_imgsz}px, target: {targets}, {fps} FPS)",
        "video_id": video_id,
        "model_name": chosen_model,
        "target_classes": targets,
        "sample_fps": fps,
        "imgsz": chosen_imgsz,
        "status": "PENDING"
    }


@router.post("/{video_id}/stop-processing")
def stop_video_processing(video_id: str, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video record not found")

    cancel_video_processing(video_id)
    video.processing_status = "STOPPED"
    db.commit()
    return {
        "message": "Video processing stopped successfully",
        "video_id": video_id,
        "processing_status": "STOPPED"
    }


@router.delete("/{video_id}")
def delete_video_endpoint(video_id: str, db: Session = Depends(get_db)):
    success = delete_video_service(video_id, db=db, username="Investigator Admin")
    if not success:
        raise HTTPException(status_code=404, detail="Video record not found")
    return {
        "message": "Video recording and all associated detections/tracks deleted successfully",
        "id": video_id
    }

@router.get("/{video_id}/detections")
def get_video_detections(video_id: str, class_name: Optional[str] = None, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    query = db.query(Detection).filter(Detection.video_id == video_id)
    if class_name:
        query = query.filter(Detection.class_name == class_name)

    detections = query.order_by(Detection.frame_number.asc()).all()

    def fmt_relative(offset_sec: float) -> str:
        """Format seconds offset as HH:MM:SS.mmm"""
        h = int(offset_sec // 3600)
        m = int((offset_sec % 3600) // 60)
        s = offset_sec % 60
        return f"{h:02d}:{m:02d}:{s:06.3f}"

    return {
        "video_id": video_id,
        "timestamp_source": video.timestamp_source if video else "UNKNOWN",
        "timestamp_status": video.timestamp_status if video else "UNAVAILABLE",
        "recording_start_datetime": video.recording_start_datetime.isoformat() if (video and video.recording_start_datetime) else None,
        "recording_timezone": video.recording_timezone if video else "UTC",
        "total_detections": len(detections),
        "detections": [
            {
                "id": d.id,
                "track_id": d.track_id,
                "frame_number": d.frame_number,
                "timestamp_offset": d.timestamp_offset,
                "relative_time": fmt_relative(d.timestamp_offset),
                "real_world_timestamp": d.real_world_timestamp.isoformat() if d.real_world_timestamp else None,
                "timestamp_source": d.timestamp_source,
                "class_name": d.class_name,
                "confidence": d.confidence,
                "bbox": [d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h]
            }
            for d in detections
        ]

    }

@router.get("", response_model=List[VideoResponse])
def list_videos(camera_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Video)
    if camera_id:
        query = query.filter(Video.camera_id == camera_id)
    return query.order_by(Video.created_at.desc()).all()

@router.get("/{video_id}", response_model=VideoResponse)
def get_video(video_id: str, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@router.get("/{video_id}/status")
def get_video_status(video_id: str, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return {
        "id": video.id,
        "filename": video.filename,
        "processing_status": video.processing_status,
        "sha256_hash": video.sha256_hash
    }

@router.get("/{video_id}/stream")
def stream_video(video_id: str, range: Optional[str] = Header(None), db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video record not found")
    
    file_path = video.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found on disk")

    file_size = os.path.getsize(file_path)
    
    if range:
        start, end = range.replace("bytes=", "").split("-")
        start = int(start)
        end = int(end) if end else file_size - 1
        length = end - start + 1
        
        with open(file_path, "rb") as f:
            f.seek(start)
            data = f.read(length)
            
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Type": "video/mp4",
        }
        return StreamingResponse(iter([data]), status_code=206, headers=headers)
    
    return FileResponse(file_path, media_type="video/mp4", filename=video.filename)

