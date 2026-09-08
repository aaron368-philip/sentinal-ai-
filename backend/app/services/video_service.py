import os
import hashlib
import cv2
from datetime import datetime, timedelta
import zoneinfo
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException
from app.core.config import settings
from app.models.video import Video
from app.models.camera import Camera
from app.models.evidence import Evidence
from app.models.audit import AuditLog


def calculate_sha256(file_path: str) -> str:
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def extract_video_metadata(file_path: str):
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        file_ctime = datetime.fromtimestamp(os.path.getctime(file_path)) if os.path.exists(file_path) else None
        return {
            "duration_seconds": 0.0,
            "fps": 30.0,
            "width": 1920,
            "height": 1080,
            "frame_count": 0,
            "detected_file_creation_time": file_ctime
        }

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080
    duration = (frame_count / fps) if (fps > 0 and frame_count > 0) else 0.0
    cap.release()

    file_ctime = datetime.fromtimestamp(os.path.getctime(file_path)) if os.path.exists(file_path) else None

    return {
        "duration_seconds": round(duration, 2),
        "fps": round(fps, 2),
        "width": width,
        "height": height,
        "frame_count": frame_count,
        "detected_file_creation_time": file_ctime
    }


def parse_recording_start_datetime(
    recording_date: str = None,
    recording_start_time: str = None,
    recording_timezone: str = "Asia/Kolkata"
) -> datetime:
    """Parse user-provided date, time, and timezone into a UTC datetime object."""
    if not recording_date or not recording_start_time:
        return None

    try:
        dt_str = f"{recording_date.strip()} {recording_start_time.strip()}"
        fmt = "%Y-%m-%d %H:%M:%S" if len(recording_start_time.strip().split(':')) == 3 else "%Y-%m-%d %H:%M"
        local_dt = datetime.strptime(dt_str, fmt)

        # Apply timezone if valid
        try:
            tz = zoneinfo.ZoneInfo(recording_timezone)
            localized = local_dt.replace(tzinfo=tz)
            # Convert to UTC
            utc_dt = localized.astimezone(zoneinfo.ZoneInfo("UTC")).replace(tzinfo=None)
            return utc_dt
        except Exception:
            return local_dt
    except Exception as e:
        print(f"Error parsing recording start datetime: {e}")
        return None


async def save_and_process_uploaded_video(
    file: UploadFile,
    camera_id: str,
    timestamp_source: str = "UNKNOWN",
    recording_date: str = None,
    recording_start_time: str = None,
    recording_timezone: str = "Asia/Kolkata",
    use_file_creation_time: bool = False,
    db: Session = None,
    username: str = "Admin"
) -> Video:
    # 1. Validate Camera
    camera = db.query(Camera).filter(Camera.id == camera_id).first()
    if not camera:
        camera = db.query(Camera).filter(Camera.camera_code == camera_id).first()
        if not camera:
            raise HTTPException(status_code=404, detail="Camera node not found")

    # 2. Validate File Type
    allowed_extensions = [".mp4", ".avi", ".mov", ".mkv", ".webm"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{file_ext}'. Allowed formats: {', '.join(allowed_extensions)}"
        )

    # 3. Save File to Storage
    raw_dir = os.path.join(settings.STORAGE_DIR, "raw_videos")
    os.makedirs(raw_dir, exist_ok=True)

    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{camera.camera_code}_{timestamp_str}_{file.filename.replace(' ', '_')}"
    destination_path = os.path.join(raw_dir, safe_filename)

    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size > 500 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 500 MB")

    with open(destination_path, "wb") as f:
        f.write(file_bytes)

    # 4. Calculate SHA-256 Hash
    sha256_hash = calculate_sha256(destination_path)

    # 5. Extract Video Metadata
    meta = extract_video_metadata(destination_path)

    # 6. Differentiate Temporal Metadata
    recording_start_dt = None
    status = "UNAVAILABLE"

    # Strictly controlled timestamp sources:
    # Never invent a real-world date/time or auto-assign file creation time unless explicitly requested
    if timestamp_source == "USER_PROVIDED" and recording_date and recording_start_time:
        recording_start_dt = parse_recording_start_datetime(recording_date, recording_start_time, recording_timezone)
        status = "CONFIRMED" if recording_start_dt else "UNAVAILABLE"

    elif timestamp_source == "VIDEO_OVERLAY":
        # Video frame contains burned-in timestamp overlay
        if recording_date and recording_start_time:
            recording_start_dt = parse_recording_start_datetime(recording_date, recording_start_time, recording_timezone)
        status = "PROVISIONAL"

    elif timestamp_source == "FILE_METADATA" and use_file_creation_time:
        # Explicit user confirmation to use file creation timestamp
        recording_start_dt = meta["detected_file_creation_time"]
        status = "CONFIRMED"

    else:
        # UNKNOWN or user rejected file creation metadata
        timestamp_source = "UNKNOWN"
        recording_start_dt = None
        status = "UNAVAILABLE"

    # 7. Create Video Record in DB
    video = Video(
        camera_id=camera.id,
        filename=safe_filename,
        file_path=destination_path,
        file_size_bytes=file_size,
        sha256_hash=sha256_hash,
        duration_seconds=meta["duration_seconds"],
        fps=meta["fps"],
        width=meta["width"],
        height=meta["height"],
        frame_count=meta["frame_count"],
        recording_date=recording_date,
        recording_start_time=recording_start_time,
        recording_timezone=recording_timezone,
        recording_start_datetime=recording_start_dt,
        timestamp_source=timestamp_source,
        timestamp_status=status,
        detected_file_creation_time=meta["detected_file_creation_time"],
        start_timestamp=recording_start_dt or datetime.utcnow(),
        processing_status="PROCESSING",
        processed_video_path=destination_path
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    # 8. Create Evidence Record in Vault
    evidence_count = db.query(Evidence).count()
    evidence_code = f"EV-{1000 + evidence_count + 1}"
    evidence = Evidence(
        evidence_code=evidence_code,
        video_id=video.id,
        original_filename=file.filename,
        file_path=destination_path,
        file_type="CCTV_VIDEO",
        sha256_hash=sha256_hash,
        verification_status="VERIFIED"
    )
    db.add(evidence)

    # 9. Create Audit Log Entry
    audit = AuditLog(
        username=username,
        action="VIDEO_UPLOAD",
        resource_type="VIDEO",
        resource_id=video.id,
        details=f"Uploaded CCTV video '{file.filename}' for {camera.camera_code}. Source: {timestamp_source}. SHA-256: {sha256_hash[:16]}..."
    )
    db.add(audit)
    db.commit()

    return video


def merge_fragmented_tracks(res: dict) -> dict:
    """
    Post-processes the output of process_video to merge fragmented tracks of the same class.
    Merges based on:
    1. Stationary/Staying still: If time gap is <= 30.0s and there is spatial overlap (IoU >= 0.15 or centroid distance <= 8%).
    2. Deep appearance similarity: If cosine similarity of appearance embeddings is >= 0.78.
    """
    import json
    import math
    import os
    import logging
    from app.services.reid_service import reid_extractor, ReIDService

    logger = logging.getLogger(__name__)
    detections = res.get("detections", [])
    tracking_events = res.get("tracking_events", [])
    face_crops = res.get("face_crops", [])

    if not tracking_events:
        return res

    # 1. Extract embeddings for all tracking events if they have a thumbnail path
    embeddings = {}
    for trk in tracking_events:
        t_id = trk["track_id"]
        thumb_p = trk.get("thumbnail_path")
        if thumb_p and os.path.exists(thumb_p):
            try:
                emb_vec = reid_extractor.extract_from_file(thumb_p)
                if emb_vec:
                    embeddings[t_id] = emb_vec
                    # Save it in trk so that we don't have to extract it again later during database saving
                    trk["reid_embedding"] = json.dumps(emb_vec)
            except Exception as e:
                logger.warning(f"Failed to extract embedding for track {t_id}: {e}")

    # Sort tracking events by start_time_offset
    sorted_events = sorted(tracking_events, key=lambda x: x["start_time_offset"])
    
    merge_map = {}
    
    def find_parent(t_id):
        curr = t_id
        while curr in merge_map:
            curr = merge_map[curr]
        return curr

    # Helper function to compute IoU
    def get_iou(box1, box2):
        # boxes are [x, y, w, h] (normalized)
        x1_A, y1_A, w_A, h_A = box1
        x2_A, y2_A = x1_A + w_A, y1_A + h_A
        
        x1_B, y1_B, w_B, h_B = box2
        x2_B, y2_B = x1_B + w_B, y1_B + h_B
        
        xA = max(x1_A, x1_B)
        yA = max(y1_A, y1_B)
        xB = min(x2_A, x2_B)
        yB = min(y2_A, y2_B)
        
        inter_w = max(0.0, xB - xA)
        inter_h = max(0.0, yB - yA)
        inter_area = inter_w * inter_h
        
        area_A = w_A * h_A
        area_B = w_B * h_B
        union_area = area_A + area_B - inter_area
        if union_area <= 0:
            return 0.0
        return inter_area / union_area

    # Helper to compute distance between centroids
    def get_centroid_distance(box1, box2):
        cxA = box1[0] + box1[2] / 2
        cyA = box1[1] + box1[3] / 2
        cxB = box2[0] + box2[2] / 2
        cyB = box2[1] + box2[3] / 2
        return math.sqrt((cxA - cxB)**2 + (cyA - cyB)**2)

    # Helper to detect if a bounding box is near the edge of the frame (entering/exiting)
    def is_near_frame_edge(box, margin=0.07):
        x, y, w, h = box
        return (x < margin) or (y < margin) or ((x + w) > (1.0 - margin)) or ((y + h) > (1.0 - margin))

    # 2. Find merges
    for i, trkB in enumerate(sorted_events):
        idB = trkB["track_id"]
        classB = trkB["class_name"]
        startB = trkB["start_time_offset"]
        endB = trkB["end_time_offset"]
        
        best_match_parent = None
        best_match_score = -1.0
        
        # Check all earlier tracks
        for j in range(i):
            trkA = sorted_events[j]
            idA = trkA["track_id"]
            classA = trkA["class_name"]
            startA = trkA["start_time_offset"]
            endA = trkA["end_time_offset"]
            
            # Must be same class
            if classA != classB:
                continue
                
            # Must be a different track
            if idA == idB:
                continue
                
            # Disallow merging if tracks overlapped significantly in time (two distinct entities concurrently on screen)
            time_overlap = endA - startB
            if time_overlap > 1.0:
                continue
                
            # Determine actual root parent for A
            parentA = find_parent(idA)
            
            # If we already decided to merge B into parentA's tree, skip
            if parentA == find_parent(idB):
                continue
            
            # Extract A's and B's trajectories
            try:
                trajA = json.loads(trkA["bbox_trajectory"]) if isinstance(trkA["bbox_trajectory"], str) else trkA["bbox_trajectory"]
                trajB = json.loads(trkB["bbox_trajectory"]) if isinstance(trkB["bbox_trajectory"], str) else trkB["bbox_trajectory"]
            except Exception:
                continue
                
            if not trajA or not trajB:
                continue
                
            last_boxA = trajA[-1]["bbox"]  # [x, y, w, h]
            first_boxB = trajB[0]["bbox"]  # [x, y, w, h]
            
            time_gap = startB - endA
            # Disallow merging if B started long before A ended
            if time_gap < -1.0:
                continue

            dist = get_centroid_distance(last_boxA, first_boxB)
            iou = get_iou(last_boxA, first_boxB)
            is_edgeA = is_near_frame_edge(last_boxA)
            is_edgeB = is_near_frame_edge(first_boxB)

            # Re-ID visual appearance similarity
            has_reid = (idA in embeddings and idB in embeddings)
            sim = ReIDService.cosine_similarity(embeddings[idA], embeddings[idB]) if has_reid else None

            # Hard rejection: if both have appearance embeddings and similarity is low,
            # they are wearing different clothes/colors - NEVER merge them!
            if sim is not None and sim < 0.68:
                continue

            can_merge = False
            score = 0.0

            if classA == "person":
                # PERSON ASSOCIATION RULE:
                # ByteTrack with calibrated 45-frame track_buffer already maintains Kalman-filtered
                # intra-camera continuity through occlusions.
                # To guarantee each individual person has their own unique, persistent ID and never
                # merges multiple people together, we NEVER merge different person track IDs across time.
                can_merge = False
            else:
                # NON-PERSON (Stationary Objects: Parked Vehicles, Luggage, Abandoned Bags)
                # Only merge if resting in the exact same spot with high spatial overlap
                if time_gap <= 30.0 and (dist <= 0.03 or iou >= 0.50):
                    can_merge = True
                    score = 0.85 + (1.0 - min(1.0, dist))

            if can_merge and score > best_match_score:
                best_match_score = score
                best_match_parent = parentA

        if best_match_parent is not None:
            merge_map[idB] = best_match_parent
            logger.info(f"Merging track ID {idB} into parent track ID {best_match_parent} (score: {best_match_score:.3f})")

    # If nothing merged, return original results
    if not merge_map:
        return res

    # 3. Apply merge map to detections
    for det in detections:
        t_id = det.get("track_id")
        if t_id in merge_map:
            det["track_id"] = find_parent(t_id)

    # 4. Apply merge map to face crops
    for fc in face_crops:
        t_id = fc.get("track_id")
        if t_id in merge_map:
            fc["track_id"] = find_parent(t_id)

    # 5. Merge the tracking events list
    merged_events = {}
    for trk in tracking_events:
        t_id = trk["track_id"]
        parent_id = find_parent(t_id)
        
        if parent_id not in merged_events:
            # Shallow copy to modify fields
            merged_events[parent_id] = dict(trk)
        else:
            # Merge with existing parent record
            parent = merged_events[parent_id]
            parent["start_frame"] = min(parent["start_frame"], trk["start_frame"])
            parent["end_frame"] = max(parent["end_frame"], trk["end_frame"])
            parent["start_time_offset"] = min(parent["start_time_offset"], trk["start_time_offset"])
            parent["end_time_offset"] = max(parent["end_time_offset"], trk["end_time_offset"])
            
            # Combine trajectories
            try:
                traj_parent = json.loads(parent["bbox_trajectory"]) if isinstance(parent["bbox_trajectory"], str) else parent["bbox_trajectory"]
                traj_child = json.loads(trk["bbox_trajectory"]) if isinstance(trk["bbox_trajectory"], str) else trk["bbox_trajectory"]
                
                # Combine and sort by frame
                combined_traj = sorted(traj_parent + traj_child, key=lambda x: x["frame"])
                parent["bbox_trajectory"] = combined_traj
            except Exception:
                pass
                
            # Update confidence and count
            new_total = parent["total_detections"] + trk["total_detections"]
            if new_total > 0:
                parent["avg_confidence"] = round(
                    (parent["avg_confidence"] * parent["total_detections"] + trk["avg_confidence"] * trk["total_detections"]) / new_total,
                    3
                )
            parent["total_detections"] = new_total
            
            # Keep the thumbnail with higher confidence (or first existing)
            if trk.get("thumbnail_path") and (not parent.get("thumbnail_path") or trk["avg_confidence"] > parent["avg_confidence"]):
                parent["thumbnail_path"] = trk["thumbnail_path"]
                # Also copy the on-the-fly extracted reid_embedding if child has it
                if trk.get("reid_embedding"):
                    parent["reid_embedding"] = trk["reid_embedding"]

    # Post-process merged events: serialize trajectories back to JSON if needed
    final_events = []
    for parent_id, trk in merged_events.items():
        if not isinstance(trk["bbox_trajectory"], str):
            trk["bbox_trajectory"] = json.dumps(trk["bbox_trajectory"])
        final_events.append(trk)

    res["detections"] = detections
    res["tracking_events"] = final_events
    res["face_crops"] = face_crops
    return res


CANCELLED_PROCESSING_VIDEOS = set()

def cancel_video_processing(video_id: str) -> bool:
    """Flag a video processing background task to stop on its next frame."""
    CANCELLED_PROCESSING_VIDEOS.add(video_id)
    return True


def process_video_ai_background(
    video_id: str,
    db: Session = None,
    model_name: Optional[str] = None,
    target_classes: Optional[str] = "person_and_bags",
    sample_fps: int = 3,
    imgsz: int = 960
):
    """
    Background worker function running AI object detection, persistent MOT tracking,
    and face/crop extraction.
    Calculates exact video-relative timestamp AND real-world timestamp per detection and track.
    Uses an independent DB session to prevent request session lifetime closures.
    Supports mid-flight graceful cancellation, dynamic model selection, targeted class filtering,
    and optimized sample FPS for sub-minute analysis.
    """
    from app.core.database import SessionLocal
    from app.models.detection import Detection
    from app.models.tracking import TrackingEvent
    from app.services.ai_engine import ai_engine_instance
    from app.services.reid_service import reid_extractor
    import json

    db_session = SessionLocal()
    try:
        video = db_session.query(Video).filter(Video.id == video_id).first()
        if not video:
            return

        # Check if cancelled before starting
        if video_id in CANCELLED_PROCESSING_VIDEOS:
            video.processing_status = "STOPPED"
            db_session.commit()
            CANCELLED_PROCESSING_VIDEOS.discard(video_id)
            return

        video.processing_status = "PROCESSING"
        db_session.commit()

        processed_dir = os.path.join(settings.STORAGE_DIR, "processed_videos")
        thumbnails_dir = os.path.join(settings.STORAGE_DIR, "thumbnails", video.id, "faces")
        tracks_dir = os.path.join(settings.STORAGE_DIR, "thumbnails", video.id, "tracks")
        os.makedirs(processed_dir, exist_ok=True)
        os.makedirs(thumbnails_dir, exist_ok=True)
        os.makedirs(tracks_dir, exist_ok=True)

        output_filename = f"annotated_{video.filename}"
        output_path = os.path.join(processed_dir, output_filename)

        # Run AI processing with Multi-Object Tracking, cancellation support, and selected model/target classes
        res = ai_engine_instance.process_video(
            input_path=video.file_path,
            output_path=output_path,
            face_thumbnails_dir=thumbnails_dir,
            tracks_thumbnails_dir=tracks_dir,
            sample_fps=sample_fps,
            model_name=model_name,
            target_classes=target_classes,
            imgsz=imgsz,
            is_cancelled=lambda: video_id in CANCELLED_PROCESSING_VIDEOS
        )

        if res.get("cancelled") or (video_id in CANCELLED_PROCESSING_VIDEOS):
            print(f"[VideoService] Video {video_id} processing was stopped gracefully.")
            video.processing_status = "STOPPED"
            db_session.commit()
            CANCELLED_PROCESSING_VIDEOS.discard(video_id)
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            return

        # Run post-processing track merge
        try:
            res = merge_fragmented_tracks(res)
        except Exception as e:
            print(f"Error merging fragmented tracks: {e}")

        # Get Camera Time Drift Offset (if configured)
        camera = db_session.query(Camera).filter(Camera.id == video.camera_id).first()
        cam_offset_sec = camera.time_offset_seconds if (camera and camera.time_offset_seconds) else 0.0

        # Clear previous detections and tracking events for this video (supports clean re-processing)
        db_session.query(Detection).filter(Detection.video_id == video.id).delete()
        db_session.query(TrackingEvent).filter(TrackingEvent.video_id == video.id).delete()
        db_session.flush()

        # Save Detections with Track IDs & Relative/Real-World Timestamps
        detection_objs = []
        for det in res.get("detections", []):
            rel_offset = det["timestamp_offset"]  # Video-relative time in seconds

            # Calculate real-world timestamp if start datetime is known
            real_dt = None
            if video.recording_start_datetime:
                total_sec = rel_offset + cam_offset_sec
                real_dt = video.recording_start_datetime + timedelta(seconds=total_sec)

            d = Detection(
                video_id=video.id,
                camera_id=video.camera_id,
                track_id=det.get("track_id"),
                frame_number=det["frame_number"],
                timestamp_offset=rel_offset,
                real_world_timestamp=real_dt,
                timestamp_source=video.timestamp_source,
                class_name=det["class_name"],
                confidence=det["confidence"],
                bbox_x=det["bbox_x"],
                bbox_y=det["bbox_y"],
                bbox_w=det["bbox_w"],
                bbox_h=det["bbox_h"]
            )
            detection_objs.append(d)

        if detection_objs:
            db_session.bulk_save_objects(detection_objs)

        # Save Aggregated Tracking Events with Deep Re-ID Embeddings
        tracking_objs = []
        for trk in res.get("tracking_events", []):
            rw_start = None
            rw_end = None
            if video.recording_start_datetime:
                rw_start = video.recording_start_datetime + timedelta(seconds=trk["start_time_offset"] + cam_offset_sec)
                rw_end = video.recording_start_datetime + timedelta(seconds=trk["end_time_offset"] + cam_offset_sec)

            thumb_p = trk.get("thumbnail_path")

            # Extract Re-ID Embedding for crop (reuse pre-extracted embedding if available)
            reid_emb_json = trk.get("reid_embedding")
            if not reid_emb_json:
                if thumb_p and os.path.exists(thumb_p):
                    emb_vec = reid_extractor.extract_from_file(thumb_p)
                    if emb_vec:
                        reid_emb_json = json.dumps(emb_vec)

            t_obj = TrackingEvent(
                video_id=video.id,
                camera_id=video.camera_id,
                track_id=trk["track_id"],
                class_name=trk["class_name"],
                start_frame=trk["start_frame"],
                end_frame=trk["end_frame"],
                start_time_offset=trk["start_time_offset"],
                end_time_offset=trk["end_time_offset"],
                real_world_start_time=rw_start,
                real_world_end_time=rw_end,
                total_detections=trk["total_detections"],
                avg_confidence=trk["avg_confidence"],
                bbox_trajectory=trk["bbox_trajectory"],
                thumbnail_path=thumb_p,
                reid_embedding=reid_emb_json
            )
            tracking_objs.append(t_obj)

        if tracking_objs:
            db_session.bulk_save_objects(tracking_objs)

        video.processing_status = "COMPLETED"
        video.processed_video_path = output_path
        db_session.commit()

    except Exception as e:
        db_session.rollback()
        try:
            video = db_session.query(Video).filter(Video.id == video_id).first()
            if video and video.processing_status != "STOPPED":
                video.processing_status = "FAILED"
                db_session.commit()
        except Exception:
            pass
        print(f"Error processing video {video_id}: {e}")
    finally:
        CANCELLED_PROCESSING_VIDEOS.discard(video_id)
        db_session.close()


def delete_video_service(video_id: str, db: Session, username: str = "Admin") -> bool:
    """
    Stops any active processing, removes all associated database records
    (detections, tracking events, evidence, video record), creates an audit log,
    and removes video and thumbnail files from disk.
    """
    import shutil
    import logging
    from app.models.detection import Detection
    from app.models.tracking import TrackingEvent
    from app.models.evidence import Evidence
    from app.models.video import Video
    from app.models.audit import AuditLog

    logger = logging.getLogger(__name__)

    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return False

    # 1. Signal cancellation in case background processing is running
    cancel_video_processing(video_id)

    video_filename = video.filename
    raw_path = video.file_path
    annotated_path = video.processed_video_path

    # 2. Delete database records
    try:
        db.query(Detection).filter(Detection.video_id == video_id).delete()
        db.query(TrackingEvent).filter(TrackingEvent.video_id == video_id).delete()
        db.query(Evidence).filter(Evidence.video_id == video_id).delete()
        db.delete(video)

        # 3. Create Audit Log
        audit = AuditLog(
            username=username,
            action="VIDEO_DELETE",
            resource_type="VIDEO",
            resource_id=video_id,
            details=f"Deleted CCTV video '{video_filename}' and removed associated detections and tracks."
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Database error deleting video {video_id}: {e}")
        raise e

    # 4. Clean up disk files safely
    try:
        if raw_path and os.path.exists(raw_path):
            os.remove(raw_path)
    except Exception as e:
        logger.warning(f"Failed to remove raw video file {raw_path}: {e}")

    try:
        if annotated_path and os.path.exists(annotated_path):
            os.remove(annotated_path)
    except Exception as e:
        logger.warning(f"Failed to remove annotated video file {annotated_path}: {e}")

    try:
        thumb_dir = os.path.join(settings.STORAGE_DIR, "thumbnails", video_id)
        if os.path.exists(thumb_dir):
            shutil.rmtree(thumb_dir, ignore_errors=True)
    except Exception as e:
        logger.warning(f"Failed to remove thumbnails directory for video {video_id}: {e}")

    return True


def consolidate_video_tracks_db(video_id: str, db: Session) -> dict:
    """
    Run post-processing consolidation on existing TrackingEvent and Detection tables in DB.
    Merges duplicate tracks belonging to the same physical entities.
    """
    import json
    import os
    import math
    import logging
    from app.models.tracking import TrackingEvent
    from app.models.detection import Detection
    from app.services.reid_service import ReIDService

    logger = logging.getLogger(__name__)

    # Query all tracking events for this video
    events = db.query(TrackingEvent).filter(TrackingEvent.video_id == video_id).all()
    if len(events) <= 1:
        return {"status": "success", "message": "Not enough tracks to consolidate", "merged_count": 0}

    # Extract embeddings
    embeddings = {}
    for ev in events:
        if ev.reid_embedding:
            try:
                embeddings[ev.track_id] = json.loads(ev.reid_embedding)
            except Exception:
                pass

    # Sort events by start_time_offset
    sorted_events = sorted(events, key=lambda x: x.start_time_offset)
    
    merge_map = {}
    
    def find_parent(t_id):
        curr = t_id
        while curr in merge_map:
            curr = merge_map[curr]
        return curr

    def get_iou(box1, box2):
        x1_A, y1_A, w_A, h_A = box1
        x2_A, y2_A = x1_A + w_A, y1_A + h_A
        x1_B, y1_B, w_B, h_B = box2
        x2_B, y2_B = x1_B + w_B, y1_B + h_B
        xA = max(x1_A, x1_B)
        yA = max(y1_A, y1_B)
        xB = min(x2_A, x2_B)
        yB = min(y2_A, y2_B)
        inter_w = max(0.0, xB - xA)
        inter_h = max(0.0, yB - yA)
        inter_area = inter_w * inter_h
        area_A = w_A * h_A
        area_B = w_B * h_B
        union_area = area_A + area_B - inter_area
        return inter_area / union_area if union_area > 0 else 0.0

    def get_centroid_distance(box1, box2):
        cxA = box1[0] + box1[2] / 2
        cyA = box1[1] + box1[3] / 2
        cxB = box2[0] + box2[2] / 2
        cyB = box2[1] + box2[3] / 2
        return math.sqrt((cxA - cxB)**2 + (cyA - cyB)**2)

    # 1. Find merges
    for i, evB in enumerate(sorted_events):
        idB = evB.track_id
        classB = evB.class_name
        startB = evB.start_time_offset
        endB = evB.end_time_offset
        
        best_match_parent = None
        best_match_score = -1.0
        
        for j in range(i):
            evA = sorted_events[j]
            idA = evA.track_id
            classA = evA.class_name
            startA = evA.start_time_offset
            endA = evA.end_time_offset
            
            # Must be same class
            if classA != classB:
                continue
            if idA == idB:
                continue

            # PERSON ASSOCIATION RULE:
            # ByteTrack with calibrated track_buffer maintains intra-camera continuity.
            # Never merge different person track IDs across time.
            if classA == "person":
                continue

            time_overlap = endA - startB
            if time_overlap > 5.0:
                continue
                
            parentA = find_parent(idA)
            if parentA == find_parent(idB):
                continue
            
            try:
                trajA = json.loads(evA.bbox_trajectory) if isinstance(evA.bbox_trajectory, str) else evA.bbox_trajectory
                trajB = json.loads(evB.bbox_trajectory) if isinstance(evB.bbox_trajectory, str) else evB.bbox_trajectory
            except Exception:
                continue
                
            if not trajA or not trajB:
                continue
                
            last_boxA = trajA[-1]["bbox"]
            first_boxB = trajB[0]["bbox"]
            time_gap = startB - endA
            
            # Non-person stationary objects: only merge if resting in the exact same location
            dist = get_centroid_distance(last_boxA, first_boxB)
            iou = get_iou(last_boxA, first_boxB)
            
            if time_gap <= 30.0 and (dist <= 0.03 or iou >= 0.50):
                score = 0.85 + (1.0 - min(1.0, dist))
                if score > best_match_score:
                    best_match_score = score
                    best_match_parent = parentA

        if best_match_parent is not None:
            merge_map[idB] = best_match_parent

    if not merge_map:
        return {"status": "success", "message": "No duplicate tracks to merge found", "merged_count": 0}

    # Apply database updates for consolidated tracks
    merged_count = len(merge_map)
    logger.info(f"Consolidating {merged_count} fragmented tracks in DB...")

    # Group all child tracks under their final root parent
    root_groups = {} # parent_track_id: list of TrackingEvent objects (both parents and kids)
    for ev in events:
        parent_id = find_parent(ev.track_id)
        if parent_id not in root_groups:
            root_groups[parent_id] = []
        root_groups[parent_id].append(ev)

    for parent_id, group in root_groups.items():
        if len(group) <= 1:
            continue
        # Find the primary parent record (retained)
        # We pick the one with track_id == parent_id
        primary = next((x for x in group if x.track_id == parent_id), None)
        if not primary:
            primary = group[0] # fallback

        # Gather other child records to delete
        children = [x for x in group if x.id != primary.id]

        # Combine fields in primary
        for child in children:
            primary.start_frame = min(primary.start_frame, child.start_frame)
            primary.end_frame = max(primary.end_frame, child.end_frame)
            primary.start_time_offset = min(primary.start_time_offset, child.start_time_offset)
            primary.end_time_offset = max(primary.end_time_offset, child.end_time_offset)
            
            # Combine trajectories
            try:
                traj_parent = json.loads(primary.bbox_trajectory) if isinstance(primary.bbox_trajectory, str) else primary.bbox_trajectory
                traj_child = json.loads(child.bbox_trajectory) if isinstance(child.bbox_trajectory, str) else child.bbox_trajectory
                combined = sorted((traj_parent or []) + (traj_child or []), key=lambda x: x["frame"])
                primary.bbox_trajectory = json.dumps(combined)
            except Exception:
                pass

            # Combine detections and confidence
            new_total = primary.total_detections + child.total_detections
            if new_total > 0:
                primary.avg_confidence = round(
                    (primary.avg_confidence * primary.total_detections + child.avg_confidence * child.total_detections) / new_total,
                    3
                )
            primary.total_detections = new_total

            # Keep better thumbnail
            if child.thumbnail_path and (not primary.thumbnail_path or child.avg_confidence > primary.avg_confidence):
                primary.thumbnail_path = child.thumbnail_path
                if child.reid_embedding:
                    primary.reid_embedding = child.reid_embedding

            # Update all Detection rows in database pointing to child's track_id to parent's track_id
            db.query(Detection).filter(
                Detection.video_id == video_id,
                Detection.track_id == child.track_id
            ).update({Detection.track_id: primary.track_id})

            # Delete the child TrackingEvent record
            db.delete(child)

    db.commit()
    return {"status": "success", "message": f"Successfully consolidated {merged_count} tracks in DB", "merged_count": merged_count}



