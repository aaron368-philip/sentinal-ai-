from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.core.database import get_db
from app.models.case import Case, InvestigationEvent
from app.models.evidence import Evidence
from app.models.user import User

router = APIRouter(prefix="/cases", tags=["Cases & Investigations"])

class CaseCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_investigator_id: Optional[str] = None

class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_investigator_id: Optional[str] = None

class InvestigationEventCreate(BaseModel):
    camera_id: str
    subject_id: Optional[str] = None
    event_type: str
    event_timestamp: Optional[str] = None
    description: str
    frame_number: Optional[str] = None
    clip_path: Optional[str] = None

@router.get("")
def list_cases(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Case)
    if status:
        query = query.filter(Case.status == status)
    cases = query.order_by(Case.created_at.desc()).all()

    result = []
    for c in cases:
        evidence_count = db.query(Evidence).filter(Evidence.case_id == c.id).count()
        events_count = db.query(InvestigationEvent).filter(InvestigationEvent.case_id == c.id).count()
        investigator = None
        if c.assigned_investigator_id:
            u = db.query(User).filter(User.id == c.assigned_investigator_id).first()
            investigator = u.username if u else None
        result.append({
            "id": c.id,
            "case_number": c.case_number,
            "title": c.title,
            "description": c.description,
            "status": c.status,
            "assigned_investigator": investigator,
            "evidence_count": evidence_count,
            "events_count": events_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        })
    return result

@router.post("")
def create_case(payload: CaseCreate, db: Session = Depends(get_db)):
    case_count = db.query(Case).count()
    year = datetime.utcnow().year
    case_number = f"CASE-{year}-{str(case_count + 1).zfill(3)}"

    case = Case(
        case_number=case_number,
        title=payload.title,
        description=payload.description,
        assigned_investigator_id=payload.assigned_investigator_id
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return {
        "id": case.id,
        "case_number": case.case_number,
        "title": case.title,
        "description": case.description,
        "status": case.status,
        "created_at": case.created_at.isoformat() if case.created_at else None,
    }

@router.get("/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db)):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    evidence = db.query(Evidence).filter(Evidence.case_id == c.id).all()
    events = db.query(InvestigationEvent).filter(InvestigationEvent.case_id == c.id).all()

    return {
        "id": c.id,
        "case_number": c.case_number,
        "title": c.title,
        "description": c.description,
        "status": c.status,
        "assigned_investigator_id": c.assigned_investigator_id,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        "evidence": [
            {
                "id": e.id,
                "evidence_code": e.evidence_code,
                "file_type": e.file_type,
                "verification_status": e.verification_status,
                "uploaded_at": e.uploaded_at.isoformat() if e.uploaded_at else None,
            }
            for e in evidence
        ],
        "events": [
            {
                "id": ev.id,
                "event_type": ev.event_type,
                "description": ev.description,
                "event_timestamp": ev.event_timestamp.isoformat() if ev.event_timestamp else None,
            }
            for ev in events
        ],
    }

@router.patch("/{case_id}")
def update_case(case_id: str, payload: CaseUpdate, db: Session = Depends(get_db)):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    if payload.title is not None:
        c.title = payload.title
    if payload.description is not None:
        c.description = payload.description
    if payload.status is not None:
        allowed_statuses = ["OPEN", "IN_PROGRESS", "CLOSED"]
        if payload.status not in allowed_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {allowed_statuses}")
        c.status = payload.status
    if payload.assigned_investigator_id is not None:
        c.assigned_investigator_id = payload.assigned_investigator_id
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return {"message": "Case updated", "case_number": c.case_number, "status": c.status}

@router.delete("/{case_id}")
def delete_case(case_id: str, db: Session = Depends(get_db)):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    case_num = c.case_number
    db.delete(c)
    db.commit()
    return {"message": f"Case {case_num} deleted"}

@router.post("/{case_id}/events")
def add_investigation_event(case_id: str, payload: InvestigationEventCreate, db: Session = Depends(get_db)):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")

    event_ts = datetime.utcnow()
    if payload.event_timestamp:
        try:
            event_ts = datetime.fromisoformat(payload.event_timestamp.replace("Z", "+00:00"))
        except Exception:
            pass

    event = InvestigationEvent(
        case_id=case_id,
        camera_id=payload.camera_id,
        subject_id=payload.subject_id,
        event_type=payload.event_type,
        event_timestamp=event_ts,
        description=payload.description,
        frame_number=payload.frame_number,
        clip_path=payload.clip_path
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {
        "id": event.id,
        "event_type": event.event_type,
        "description": event.description,
        "event_timestamp": event.event_timestamp.isoformat() if event.event_timestamp else None,
    }

@router.post("/{case_id}/evidence/{evidence_id}")
def link_evidence_to_case(case_id: str, evidence_id: str, db: Session = Depends(get_db)):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    e = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Evidence not found")
    e.case_id = case_id
    db.commit()
    return {"message": f"Evidence {e.evidence_code} linked to case {c.case_number}"}
