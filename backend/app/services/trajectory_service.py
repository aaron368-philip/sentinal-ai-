import os
import json
import logging
import math
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from app.services.reid_service import ReIDService

logger = logging.getLogger(__name__)


def format_duration_human(seconds: float) -> str:
    """Format duration into clean human-readable text."""
    if seconds is None or seconds < 0:
        return "0s"
    sec = int(seconds)
    if sec < 60:
        return f"{sec}s"
    mins = sec // 60
    rem_sec = sec % 60
    if rem_sec == 0:
        return f"{mins}m"
    return f"{mins}m {rem_sec}s"


class TrajectoryService:
    @staticmethod
    def reconstruct_trajectory_for_track(
        track_id: str,
        db: Any,
        min_similarity: float = 0.50
    ) -> Dict[str, Any]:
        """
        Reconstructs the full multi-camera spatial trajectory for a given track event.
        Assembles waypoints in chronological sequence, computes transit velocities and dwell times,
        and generates an automated forensic narrative.
        """
        from app.models.tracking import TrackingEvent
        from app.models.camera import Camera
        from app.models.building import Building
        from app.models.floor import Floor

        source_event = db.query(TrackingEvent).filter(TrackingEvent.id == track_id).first()
        if not source_event:
            return {"error": "Track not found", "waypoints": []}

        # 1. Run Re-ID search across cameras
        match_result = ReIDService.match_track_across_cameras(
            source_track_id=track_id,
            db=db,
            min_similarity=min_similarity,
            limit=50
        )

        all_sightings = []

        # Add source track itself as one of the sightings
        source_camera = db.query(Camera).filter(Camera.id == source_event.camera_id).first()
        source_thumb_url = None
        if source_event.thumbnail_path and os.path.exists(source_event.thumbnail_path):
            filename = os.path.basename(source_event.thumbnail_path)
            source_thumb_url = f"/api/v1/tracking/thumbnails/{source_event.video_id}/{filename}"

        all_sightings.append({
            "track_event_id": source_event.id,
            "video_id": source_event.video_id,
            "camera_id": source_event.camera_id,
            "camera_code": source_camera.camera_code if source_camera else "CAM 01",
            "camera_name": source_camera.name if source_camera else "Camera Node",
            "area_zone": (source_camera.area_zone if source_camera and source_camera.area_zone else source_camera.name) if source_camera else "Surveillance Zone",
            "building_id": source_camera.building_id if source_camera else None,
            "floor_id": source_camera.floor_id if source_camera else None,
            "position_x": source_camera.position_x if source_camera else 50.0,
            "position_y": source_camera.position_y if source_camera else 50.0,
            "track_id": source_event.track_id,
            "class_name": source_event.class_name,
            "similarity_score": 1.0,
            "composite_confidence": 1.0,
            "start_time_offset": source_event.start_time_offset,
            "end_time_offset": source_event.end_time_offset,
            "dwell_seconds": round(source_event.end_time_offset - source_event.start_time_offset, 2),
            "real_world_start_time": source_event.real_world_start_time,
            "real_world_end_time": source_event.real_world_end_time,
            "thumbnail_url": source_thumb_url,
            "is_source": True
        })

        # Add matched sightings
        for m in match_result.get("matches", []):
            if not m.get("is_feasible", True):
                continue
            cand_cam = db.query(Camera).filter(Camera.id == m["camera_id"]).first()
            cand_ev = db.query(TrackingEvent).filter(TrackingEvent.id == m["track_event_id"]).first()

            all_sightings.append({
                "track_event_id": m["track_event_id"],
                "video_id": m["video_id"],
                "camera_id": m["camera_id"],
                "camera_code": m["camera_code"],
                "camera_name": m["camera_name"],
                "area_zone": m["area_zone"],
                "building_id": cand_cam.building_id if cand_cam else None,
                "floor_id": cand_cam.floor_id if cand_cam else None,
                "position_x": m["position_x"],
                "position_y": m["position_y"],
                "track_id": m["track_id"],
                "class_name": m["class_name"],
                "similarity_score": m["similarity_score"],
                "composite_confidence": m["composite_confidence"],
                "start_time_offset": m["start_time_offset"],
                "end_time_offset": m["end_time_offset"],
                "dwell_seconds": round(m["end_time_offset"] - m["start_time_offset"], 2),
                "real_world_start_time": cand_ev.real_world_start_time if cand_ev else None,
                "real_world_end_time": cand_ev.real_world_end_time if cand_ev else None,
                "thumbnail_url": m["thumbnail_url"],
                "is_source": False
            })

        # 2. Sort sightings chronologically
        def get_sort_key(s):
            if s["real_world_start_time"] is not None:
                return s["real_world_start_time"].timestamp()
            return s["start_time_offset"]

        all_sightings.sort(key=get_sort_key)

        # 3. Assemble Waypoints & Transitions
        waypoints = []
        total_transit_seconds = 0.0
        total_dwell_seconds = 0.0

        for idx, s in enumerate(all_sightings):
            transit_from_prev_seconds = 0.0
            distance_from_prev = 0.0
            heading_direction = None

            if idx > 0:
                prev = all_sightings[idx - 1]
                # Calculate time delta between departure of prev and arrival of current
                if s["real_world_start_time"] and prev["real_world_end_time"]:
                    transit_from_prev_seconds = max(0.0, (s["real_world_start_time"] - prev["real_world_end_time"]).total_seconds())
                else:
                    transit_from_prev_seconds = max(0.0, s["start_time_offset"] - prev["end_time_offset"])

                dx = s["position_x"] - prev["position_x"]
                dy = s["position_y"] - prev["position_y"]
                distance_from_prev = round(float((dx*dx + dy*dy)**0.5), 2)

                # Determine heading direction string
                if abs(dx) > 5 or abs(dy) > 5:
                    angle_rad = np.arctan2(-dy, dx)  # Negative dy because screen Y is top-to-bottom
                    angle_deg = (np.degrees(angle_rad) + 360) % 360
                    dirs = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"]
                    dir_idx = int((angle_deg + 22.5) / 45.0) % 8
                    heading_direction = dirs[dir_idx]

                total_transit_seconds += transit_from_prev_seconds

            dwell = max(1.0, s["dwell_seconds"])
            total_dwell_seconds += dwell

            waypoints.append({
                "sequence_index": idx + 1,
                "track_event_id": s["track_event_id"],
                "video_id": s["video_id"],
                "camera_id": s["camera_id"],
                "camera_code": s["camera_code"],
                "camera_name": s["camera_name"],
                "area_zone": s["area_zone"],
                "building_id": s["building_id"],
                "floor_id": s["floor_id"],
                "position_x": s["position_x"],
                "position_y": s["position_y"],
                "track_id": s["track_id"],
                "class_name": s["class_name"],
                "similarity_score": s["similarity_score"],
                "composite_confidence": s["composite_confidence"],
                "dwell_seconds": dwell,
                "dwell_formatted": format_duration_human(dwell),
                "transit_from_prev_seconds": round(transit_from_prev_seconds, 1),
                "transit_formatted": format_duration_human(transit_from_prev_seconds) if idx > 0 else "Origin",
                "distance_from_prev": distance_from_prev,
                "heading_direction": heading_direction,
                "start_time_offset": s["start_time_offset"],
                "end_time_offset": s["end_time_offset"],
                "real_world_start_time": s["real_world_start_time"].isoformat() if s["real_world_start_time"] else None,
                "real_world_end_time": s["real_world_end_time"].isoformat() if s["real_world_end_time"] else None,
                "thumbnail_url": s["thumbnail_url"],
                "is_source": s["is_source"]
            })

        # 4. Building & Floor metadata
        building_info = None
        floor_info = None
        if waypoints and waypoints[0]["building_id"]:
            b_obj = db.query(Building).filter(Building.id == waypoints[0]["building_id"]).first()
            if b_obj:
                building_info = {"id": b_obj.id, "name": b_obj.name, "code": b_obj.code}

        if waypoints and waypoints[0]["floor_id"]:
            f_obj = db.query(Floor).filter(Floor.id == waypoints[0]["floor_id"]).first()
            if f_obj:
                floor_info = {
                    "id": f_obj.id,
                    "floor_name": f_obj.floor_name,
                    "floor_number": f_obj.floor_number,
                    "blueprint_path": f_obj.blueprint_path
                }

        # 5. Generate Automated Forensic Narrative
        narrative = TrajectoryService.generate_narrative(waypoints, total_dwell_seconds, total_transit_seconds)

        total_journey_duration = total_dwell_seconds + total_transit_seconds

        return {
            "track_id": source_event.track_id,
            "class_name": source_event.class_name,
            "total_waypoints": len(waypoints),
            "total_journey_seconds": round(total_journey_duration, 1),
            "total_journey_formatted": format_duration_human(total_journey_duration),
            "total_dwell_seconds": round(total_dwell_seconds, 1),
            "total_dwell_formatted": format_duration_human(total_dwell_seconds),
            "total_transit_seconds": round(total_transit_seconds, 1),
            "total_transit_formatted": format_duration_human(total_transit_seconds),
            "building": building_info,
            "floor": floor_info,
            "waypoints": waypoints,
            "narrative_report": narrative
        }

    @staticmethod
    def generate_narrative(
        waypoints: List[Dict[str, Any]],
        total_dwell_sec: float,
        total_transit_sec: float
    ) -> Dict[str, Any]:
        """
        Creates a structured, court-admissible natural language investigation narrative.
        """
        if not waypoints:
            return {"title": "No Trajectory Recorded", "summary": "No waypoints available.", "steps": []}

        first_wp = waypoints[0]
        last_wp = waypoints[-1]
        wp_count = len(waypoints)

        first_time_str = first_wp.get("real_world_start_time") or f"{first_wp['start_time_offset']:.1f}s relative"
        if "T" in str(first_time_str):
            try:
                first_time_str = datetime.fromisoformat(first_time_str).strftime("%H:%M:%S UTC")
            except Exception:
                pass

        last_time_str = last_wp.get("real_world_end_time") or f"{last_wp['end_time_offset']:.1f}s relative"
        if "T" in str(last_time_str):
            try:
                last_time_str = datetime.fromisoformat(last_time_str).strftime("%H:%M:%S UTC")
            except Exception:
                pass

        title = f"Multi-Camera Movement Trajectory: {first_wp['class_name'].title()} #{first_wp['track_id']}"

        summary = (
            f"Subject was observed across {wp_count} distinct CCTV surveillance zones "
            f"from {first_wp['area_zone']} ({first_wp['camera_code']}) to {last_wp['area_zone']} ({last_wp['camera_code']}). "
            f"Total journey span: {format_duration_human(total_dwell_sec + total_transit_sec)} "
            f"(Dwell Time: {format_duration_human(total_dwell_sec)}, Transit Time: {format_duration_human(total_transit_sec)})."
        )

        steps = []
        for i, wp in enumerate(waypoints):
            t_str = wp.get("real_world_start_time") or f"+{wp['start_time_offset']:.1f}s"
            if "T" in str(t_str):
                try:
                    t_str = datetime.fromisoformat(t_str).strftime("%H:%M:%S")
                except Exception:
                    pass

            if i == 0:
                desc = (
                    f"First detected at {wp['area_zone']} [{wp['camera_code']} - {wp['camera_name']}] "
                    f"at {t_str}. Dwelled in zone for {wp['dwell_formatted']}."
                )
            else:
                dir_text = f" heading {wp['heading_direction']}" if wp.get("heading_direction") else ""
                desc = (
                    f"Traversed to {wp['area_zone']} [{wp['camera_code']} - {wp['camera_name']}]{dir_text} "
                    f"at {t_str} after {wp['transit_formatted']} transit. Dwell duration: {wp['dwell_formatted']} "
                    f"(Re-ID Match Confidence: {int(wp['composite_confidence']*100)}%)."
                )

            steps.append({
                "sequence": wp["sequence_index"],
                "camera_code": wp["camera_code"],
                "area_zone": wp["area_zone"],
                "timestamp_label": t_str,
                "description": desc,
                "thumbnail_url": wp["thumbnail_url"]
            })

        return {
            "title": title,
            "summary": summary,
            "start_time": first_time_str,
            "end_time": last_time_str,
            "zones_traversed": [wp["area_zone"] for wp in waypoints],
            "steps": steps
        }
