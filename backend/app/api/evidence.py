from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.models.evidence import Evidence
from app.models.video import Video

router = APIRouter(prefix="/evidence", tags=["Evidence Vault"])

@router.get("")
def list_evidence(
    verification_status: Optional[str] = None,
    file_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Evidence)
    if verification_status:
        query = query.filter(Evidence.verification_status == verification_status)
    if file_type:
        query = query.filter(Evidence.file_type == file_type)

    items = query.order_by(Evidence.uploaded_at.desc()).all()

    result = []
    for e in items:
        video = None
        if e.video_id:
            video = db.query(Video).filter(Video.id == e.video_id).first()
        result.append({
            "id": e.id,
            "evidence_code": e.evidence_code,
            "case_id": e.case_id,
            "video_id": e.video_id,
            "original_filename": e.original_filename,
            "file_type": e.file_type,
            "sha256_hash": e.sha256_hash,
            "verification_status": e.verification_status,
            "uploaded_at": e.uploaded_at.isoformat() if e.uploaded_at else None,
            "video_duration": video.duration_seconds if video else None,
            "camera_id": video.camera_id if video else None,
        })
    return result

@router.get("/{evidence_id}")
def get_evidence_item(evidence_id: str, db: Session = Depends(get_db)):
    e = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evidence item not found")
    return {
        "id": e.id,
        "evidence_code": e.evidence_code,
        "case_id": e.case_id,
        "video_id": e.video_id,
        "original_filename": e.original_filename,
        "file_path": e.file_path,
        "file_type": e.file_type,
        "sha256_hash": e.sha256_hash,
        "verification_status": e.verification_status,
        "uploaded_at": e.uploaded_at.isoformat() if e.uploaded_at else None,
    }

@router.post("/{evidence_id}/verify")
def verify_evidence(evidence_id: str, db: Session = Depends(get_db)):
    """Re-verify SHA-256 hash integrity of an evidence file."""
    import hashlib
    e = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evidence item not found")

    import os
    if not os.path.exists(e.file_path):
        e.verification_status = "FILE_MISSING"
        db.commit()
        return {"status": "FILE_MISSING", "message": "File not found on disk"}

    sha256 = hashlib.sha256()
    with open(e.file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    computed_hash = sha256.hexdigest()

    if computed_hash == e.sha256_hash:
        e.verification_status = "VERIFIED"
        status = "VERIFIED"
        message = "File integrity confirmed. SHA-256 hash matches."
    else:
        e.verification_status = "TAMPERED"
        status = "TAMPERED"
        message = "Hash mismatch! File may have been tampered with."

    db.commit()
    return {
        "evidence_code": e.evidence_code,
        "status": status,
        "stored_hash": e.sha256_hash,
        "computed_hash": computed_hash,
        "message": message
    }

@router.get("/{evidence_id}/preview")
def preview_evidence(evidence_id: str, db: Session = Depends(get_db)):
    """Return the text content of a DOCUMENT evidence file for in-browser preview."""
    import os
    e = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evidence item not found")
    if not e.file_path or not os.path.exists(e.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Only allow text-based file preview
    text_extensions = {".txt", ".log", ".csv", ".json", ".xml", ".md"}
    _, ext = os.path.splitext(e.file_path)
    if ext.lower() not in text_extensions:
        raise HTTPException(status_code=415, detail="Preview only available for text-based files")

    try:
        with open(e.file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Could not read file: {ex}")

    return {
        "evidence_code": e.evidence_code,
        "original_filename": e.original_filename,
        "file_type": e.file_type,
        "content": content,
    }


@router.get("/{evidence_id}/download")
def download_evidence(evidence_id: str, db: Session = Depends(get_db)):
    """Stream/download the raw evidence file."""
    import os
    from fastapi.responses import FileResponse
    e = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evidence item not found")
    if not e.file_path or not os.path.exists(e.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=e.file_path,
        filename=e.original_filename,
        media_type="application/octet-stream"
    )


@router.delete("/{evidence_id}")
def delete_evidence(evidence_id: str, db: Session = Depends(get_db)):
    e = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evidence item not found")
    code = e.evidence_code
    db.delete(e)
    db.commit()
    return {"message": f"Evidence {code} deleted from vault"}
