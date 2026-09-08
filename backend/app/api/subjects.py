from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
import uuid
from datetime import datetime
from app.core.database import get_db
from app.models.subject import Subject, SubjectCameraMatch
from app.models.camera import Camera

router = APIRouter(prefix="/subjects", tags=["Subjects"])

@router.get("")
def list_subjects(db: Session = Depends(get_db)):
    subjects = db.query(Subject).order_by(Subject.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "subject_code": s.subject_code,
            "notes": s.notes,
            "thumbnail_path": s.thumbnail_path,
            "appearance_metadata": s.appearance_metadata,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in subjects
    ]

@router.post("")
def create_subject(
    notes: Optional[str] = Form(None),
    appearance_metadata: Optional[str] = Form(None),
    thumbnail: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    subject_count = db.query(Subject).count()
    subject_code = f"SUBJ-{100 + subject_count + 1}"

    thumbnail_path = None
    if thumbnail:
        from app.core.config import settings
        thumb_dir = os.path.join(settings.STORAGE_DIR, "subject_thumbnails")
        os.makedirs(thumb_dir, exist_ok=True)
        ext = os.path.splitext(thumbnail.filename)[1] or ".jpg"
        thumb_filename = f"{subject_code}_{uuid.uuid4().hex[:8]}{ext}"
        thumb_path = os.path.join(thumb_dir, thumb_filename)
        with open(thumb_path, "wb") as f:
            shutil.copyfileobj(thumbnail.file, f)
        thumbnail_path = thumb_path

    subject = Subject(
        subject_code=subject_code,
        notes=notes,
        appearance_metadata=appearance_metadata,
        thumbnail_path=thumbnail_path
    )
    db.add(subject)
    db.commit()
    db.refresh(subject)

    return {
        "id": subject.id,
        "subject_code": subject.subject_code,
        "notes": subject.notes,
        "thumbnail_path": subject.thumbnail_path,
        "appearance_metadata": subject.appearance_metadata,
        "created_at": subject.created_at.isoformat() if subject.created_at else None,
    }

@router.get("/{subject_id}")
def get_subject(subject_id: str, db: Session = Depends(get_db)):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    return {
        "id": subject.id,
        "subject_code": subject.subject_code,
        "notes": subject.notes,
        "thumbnail_path": subject.thumbnail_path,
        "appearance_metadata": subject.appearance_metadata,
        "created_at": subject.created_at.isoformat() if subject.created_at else None,
    }

@router.delete("/{subject_id}")
def delete_subject(subject_id: str, db: Session = Depends(get_db)):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    db.delete(subject)
    db.commit()
    return {"message": f"Subject {subject.subject_code} deleted"}

@router.get("/{subject_id}/thumbnail")
def get_subject_thumbnail(subject_id: str, db: Session = Depends(get_db)):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject or not subject.thumbnail_path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    if not os.path.exists(subject.thumbnail_path):
        raise HTTPException(status_code=404, detail="Thumbnail file not found on disk")
    return FileResponse(subject.thumbnail_path, media_type="image/jpeg")

@router.get("/{subject_id}/camera-matches")
def get_subject_camera_matches(subject_id: str, db: Session = Depends(get_db)):
    matches = (
        db.query(SubjectCameraMatch)
        .filter(SubjectCameraMatch.source_subject_id == subject_id)
        .order_by(SubjectCameraMatch.similarity_score.desc())
        .all()
    )
    return [
        {
            "id": m.id,
            "target_camera_id": m.target_camera_id,
            "target_track_id": m.target_track_id,
            "similarity_score": m.similarity_score,
            "matched_at": m.matched_at.isoformat() if m.matched_at else None,
        }
        for m in matches
    ]
