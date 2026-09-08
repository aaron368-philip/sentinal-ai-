from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import json
import uuid
import shutil
import cv2
import numpy as np

from app.core.database import get_db
from app.core.config import settings
from app.models.tracking import TrackingEvent
from app.models.subject import Subject, SubjectCameraMatch
from app.models.camera import Camera
from app.services.reid_service import ReIDService, reid_extractor

router = APIRouter(prefix="/reid", tags=["Re-Identification"])


@router.post("/match-track/{track_event_id}")
def match_track(
    track_event_id: str,
    min_similarity: float = Query(0.50, ge=0.0, le=1.0),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Search for person/entity re-identification matches across all camera feeds for a specific track event.
    """
    result = ReIDService.match_track_across_cameras(
        source_track_id=track_event_id,
        db=db,
        min_similarity=min_similarity,
        limit=limit
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/match-subject/{subject_id}")
def match_subject(
    subject_id: str,
    min_similarity: float = Query(0.50, ge=0.0, le=1.0),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Search for all CCTV sightings of a registered Subject profile across all cameras.
    """
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    subj_emb = None
    if subject.reid_embedding:
        try:
            subj_emb = json.loads(subject.reid_embedding)
        except Exception:
            subj_emb = None

    if subj_emb is None and subject.thumbnail_path and os.path.exists(subject.thumbnail_path):
        subj_emb = reid_extractor.extract_from_file(subject.thumbnail_path)
        if subj_emb:
            subject.reid_embedding = json.dumps(subj_emb)
            db.commit()

    if not subj_emb:
        raise HTTPException(status_code=400, detail="No appearance embedding or thumbnail photo available for this subject.")

    # Match against all persistent tracking events
    tracks = db.query(TrackingEvent).filter(TrackingEvent.class_name == "person").all()

    matches = []
    for trk in tracks:
        cand_emb = None
        if trk.reid_embedding:
            try:
                cand_emb = json.loads(trk.reid_embedding)
            except Exception:
                cand_emb = None

        if cand_emb is None and trk.thumbnail_path and os.path.exists(trk.thumbnail_path):
            cand_emb = reid_extractor.extract_from_file(trk.thumbnail_path)
            if cand_emb:
                trk.reid_embedding = json.dumps(cand_emb)
                db.commit()

        if not cand_emb:
            continue

        sim = ReIDService.cosine_similarity(subj_emb, cand_emb)
        if sim >= min_similarity:
            cam = db.query(Camera).filter(Camera.id == trk.camera_id).first()
            thumbnail_url = None
            if trk.thumbnail_path and os.path.exists(trk.thumbnail_path):
                filename = os.path.basename(trk.thumbnail_path)
                thumbnail_url = f"/api/v1/tracking/thumbnails/{trk.video_id}/{filename}"

            matches.append({
                "track_event_id": trk.id,
                "video_id": trk.video_id,
                "camera_id": trk.camera_id,
                "camera_code": cam.camera_code if cam else "UNKNOWN",
                "camera_name": cam.name if cam else "Camera Node",
                "area_zone": cam.area_zone if cam else "Zone",
                "track_id": trk.track_id,
                "similarity_score": round(sim, 4),
                "start_time_offset": trk.start_time_offset,
                "end_time_offset": trk.end_time_offset,
                "real_world_start_time": trk.real_world_start_time.isoformat() if trk.real_world_start_time else None,
                "real_world_end_time": trk.real_world_end_time.isoformat() if trk.real_world_end_time else None,
                "thumbnail_url": thumbnail_url,
                "position_x": cam.position_x if cam else 50.0,
                "position_y": cam.position_y if cam else 50.0
            })

    matches.sort(key=lambda x: x["similarity_score"], reverse=True)

    # Automatically save / sync subject matches into SubjectCameraMatch table
    for m in matches[:10]:
        existing = db.query(SubjectCameraMatch).filter(
            SubjectCameraMatch.source_subject_id == subject.id,
            SubjectCameraMatch.target_camera_id == m["camera_id"],
            SubjectCameraMatch.target_track_id == m["track_event_id"]
        ).first()
        if not existing:
            match_entry = SubjectCameraMatch(
                source_subject_id=subject.id,
                target_camera_id=m["camera_id"],
                target_track_id=m["track_event_id"],
                similarity_score=m["similarity_score"]
            )
            db.add(match_entry)
    db.commit()

    return {
        "subject_id": subject.id,
        "subject_code": subject.subject_code,
        "total_matches": len(matches),
        "matches": matches[:limit]
    }


@router.post("/match-image")
def match_image(
    file: UploadFile = File(...),
    min_similarity: float = Query(0.50, ge=0.0, le=1.0),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Upload an arbitrary query image or crop and find all matching appearances across all CCTV cameras.
    """
    temp_dir = os.path.join(settings.STORAGE_DIR, "reid_queries")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"query_{uuid.uuid4().hex[:8]}.jpg")

    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    query_emb = reid_extractor.extract_from_file(temp_path)
    if not query_emb:
        raise HTTPException(status_code=400, detail="Failed to extract visual appearance features from image.")

    tracks = db.query(TrackingEvent).all()
    matches = []

    for trk in tracks:
        cand_emb = None
        if trk.reid_embedding:
            try:
                cand_emb = json.loads(trk.reid_embedding)
            except Exception:
                cand_emb = None

        if cand_emb is None and trk.thumbnail_path and os.path.exists(trk.thumbnail_path):
            cand_emb = reid_extractor.extract_from_file(trk.thumbnail_path)
            if cand_emb:
                trk.reid_embedding = json.dumps(cand_emb)
                db.commit()

        if not cand_emb:
            continue

        sim = ReIDService.cosine_similarity(query_emb, cand_emb)
        if sim >= min_similarity:
            cam = db.query(Camera).filter(Camera.id == trk.camera_id).first()
            thumbnail_url = None
            if trk.thumbnail_path and os.path.exists(trk.thumbnail_path):
                filename = os.path.basename(trk.thumbnail_path)
                thumbnail_url = f"/api/v1/tracking/thumbnails/{trk.video_id}/{filename}"

            matches.append({
                "track_event_id": trk.id,
                "video_id": trk.video_id,
                "camera_id": trk.camera_id,
                "camera_code": cam.camera_code if cam else "UNKNOWN",
                "camera_name": cam.name if cam else "Camera Node",
                "area_zone": cam.area_zone if cam else "Zone",
                "track_id": trk.track_id,
                "class_name": trk.class_name,
                "similarity_score": round(sim, 4),
                "start_time_offset": trk.start_time_offset,
                "end_time_offset": trk.end_time_offset,
                "real_world_start_time": trk.real_world_start_time.isoformat() if trk.real_world_start_time else None,
                "thumbnail_url": thumbnail_url,
                "position_x": cam.position_x if cam else 50.0,
                "position_y": cam.position_y if cam else 50.0
            })

    matches.sort(key=lambda x: x["similarity_score"], reverse=True)

    return {
        "query_filename": file.filename,
        "total_matches": len(matches),
        "matches": matches[:limit]
    }


@router.get("/identities")
def cluster_identities(
    min_similarity: float = Query(0.70, ge=0.5, le=1.0),
    db: Session = Depends(get_db)
):
    """
    Cluster all persistent tracks across the entire CCTV network into unified global identities.
    """
    tracks = db.query(TrackingEvent).filter(TrackingEvent.class_name == "person").all()
    if not tracks:
        return []

    # Extract all embeddings
    emb_list = []
    track_meta = []
    for trk in tracks:
        emb = None
        if trk.reid_embedding:
            try:
                emb = json.loads(trk.reid_embedding)
            except Exception:
                pass
        if emb is None and trk.thumbnail_path and os.path.exists(trk.thumbnail_path):
            emb = reid_extractor.extract_from_file(trk.thumbnail_path)
            if emb:
                trk.reid_embedding = json.dumps(emb)
                db.commit()

        if emb:
            emb_list.append(emb)
            cam = db.query(Camera).filter(Camera.id == trk.camera_id).first()
            thumbnail_url = None
            if trk.thumbnail_path and os.path.exists(trk.thumbnail_path):
                filename = os.path.basename(trk.thumbnail_path)
                thumbnail_url = f"/api/v1/tracking/thumbnails/{trk.video_id}/{filename}"

            track_meta.append({
                "id": trk.id,
                "track_id": trk.track_id,
                "video_id": trk.video_id,
                "camera_id": trk.camera_id,
                "camera_code": cam.camera_code if cam else "UNKNOWN",
                "camera_name": cam.name if cam else "Node",
                "area_zone": cam.area_zone if cam else "Zone",
                "start_time_offset": trk.start_time_offset,
                "real_world_start_time": trk.real_world_start_time.isoformat() if trk.real_world_start_time else None,
                "thumbnail_url": thumbnail_url
            })

    # Clustering via single-linkage cosine threshold
    clusters = []
    visited = set()

    for i in range(len(track_meta)):
        if i in visited:
            continue
        current_cluster = [track_meta[i]]
        visited.add(i)

        for j in range(i + 1, len(track_meta)):
            if j in visited:
                continue
            sim = ReIDService.cosine_similarity(emb_list[i], emb_list[j])
            if sim >= min_similarity:
                current_cluster.append(track_meta[j])
                visited.add(j)

        clusters.append({
            "identity_id": f"GLOBAL-ID-{len(clusters) + 1:03d}",
            "sightings_count": len(current_cluster),
            "primary_sighting": current_cluster[0],
            "all_sightings": current_cluster
        })

    clusters.sort(key=lambda c: c["sightings_count"], reverse=True)
    return clusters
