from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.core.database import get_db
from app.models.case import Case, InvestigationEvent
from app.models.tracking import TrackingEvent
from app.models.subject import Subject
from app.services.trajectory_service import TrajectoryService

router = APIRouter(prefix="/trajectories", tags=["Spatial Trajectories"])


class CaseSyncPayload(BaseModel):
    track_event_id: Optional[str] = None
    subject_id: Optional[str] = None
    min_similarity: float = 0.50


@router.get("/track/{track_event_id}")
def get_track_trajectory(
    track_event_id: str,
    min_similarity: float = Query(0.50, ge=0.0, le=1.0),
    db: Session = Depends(get_db)
):
    """
    Reconstruct multi-camera spatial journey across building floorplans for a specific track event.
    """
    res = TrajectoryService.reconstruct_trajectory_for_track(
        track_id=track_event_id,
        db=db,
        min_similarity=min_similarity
    )
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.get("/subject/{subject_id}")
def get_subject_trajectory(
    subject_id: str,
    min_similarity: float = Query(0.50, ge=0.0, le=1.0),
    db: Session = Depends(get_db)
):
    """
    Reconstruct multi-camera spatial journey across building floorplans for a registered subject profile.
    """
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Find primary track or highest confidence track matching this subject
    from app.services.reid_service import reid_extractor, ReIDService
    import json
    import os

    subj_emb = None
    if subject.reid_embedding:
        try:
            subj_emb = json.loads(subject.reid_embedding)
        except Exception:
            pass

    if subj_emb is None and subject.thumbnail_path and os.path.exists(subject.thumbnail_path):
        subj_emb = reid_extractor.extract_from_file(subject.thumbnail_path)
        if subj_emb:
            subject.reid_embedding = json.dumps(subj_emb)
            db.commit()

    if not subj_emb:
        raise HTTPException(status_code=400, detail="No appearance embedding available for this subject profile.")

    tracks = db.query(TrackingEvent).filter(TrackingEvent.class_name == "person").all()
    best_track = None
    best_sim = -1.0

    for trk in tracks:
        cand_emb = None
        if trk.reid_embedding:
            try:
                cand_emb = json.loads(trk.reid_embedding)
            except Exception:
                pass
        if cand_emb is None and trk.thumbnail_path and os.path.exists(trk.thumbnail_path):
            cand_emb = reid_extractor.extract_from_file(trk.thumbnail_path)

        if cand_emb:
            sim = ReIDService.cosine_similarity(subj_emb, cand_emb)
            if sim > best_sim:
                best_sim = sim
                best_track = trk

    if not best_track:
        raise HTTPException(status_code=404, detail="No matching CCTV tracks detected for this subject profile.")

    res = TrajectoryService.reconstruct_trajectory_for_track(
        track_id=best_track.id,
        db=db,
        min_similarity=min_similarity
    )
    res["subject_code"] = subject.subject_code
    res["subject_id"] = subject.id
    return res


@router.post("/sync-case/{case_id}")
def sync_trajectory_to_case(
    case_id: str,
    payload: CaseSyncPayload,
    db: Session = Depends(get_db)
):
    """
    Automatically converts a reconstructed multi-camera trajectory into structured InvestigationEvent entries on a Case.
    """
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    target_track_id = payload.track_event_id

    # If subject_id provided, find best track
    if not target_track_id and payload.subject_id:
        subject = db.query(Subject).filter(Subject.id == payload.subject_id).first()
        if subject:
            # Reconstruct via subject
            res = get_subject_trajectory(payload.subject_id, min_similarity=payload.min_similarity, db=db)
            waypoints = res.get("waypoints", [])
        else:
            raise HTTPException(status_code=404, detail="Subject not found")
    elif target_track_id:
        res = TrajectoryService.reconstruct_trajectory_for_track(
            track_id=target_track_id,
            db=db,
            min_similarity=payload.min_similarity
        )
        waypoints = res.get("waypoints", [])
    else:
        raise HTTPException(status_code=400, detail="Must provide either track_event_id or subject_id")

    if not waypoints:
        raise HTTPException(status_code=400, detail="No waypoints in reconstructed trajectory to sync.")

    created_events = []
    for wp in waypoints:
        event_ts = datetime.utcnow()
        if wp.get("real_world_start_time"):
            try:
                event_ts = datetime.fromisoformat(wp["real_world_start_time"].replace("Z", "+00:00"))
            except Exception:
                pass

        desc = (
            f"Waypoint #{wp['sequence_index']}: Subject observed at {wp['area_zone']} ({wp['camera_code']}). "
            f"Dwell time: {wp['dwell_formatted']}. Transit: {wp['transit_formatted']}."
        )

        ev = InvestigationEvent(
            case_id=case.id,
            camera_id=wp["camera_id"],
            subject_id=payload.subject_id,
            event_type="TRAJECTORY_WAYPOINT",
            event_timestamp=event_ts,
            description=desc,
            clip_path=wp.get("thumbnail_url")
        )
        db.add(ev)
        created_events.append(ev)

    db.commit()

    return {
        "message": f"Successfully synced {len(created_events)} trajectory waypoints to Case {case.case_number}",
        "case_id": case.id,
        "case_number": case.case_number,
        "events_created": len(created_events)
    }
