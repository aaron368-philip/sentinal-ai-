from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import os
import re
import json as _json
from collections import defaultdict

from app.core.database import get_db
from app.models.camera import Camera
from app.models.detection import Detection
from app.models.subject import Subject
from app.models.tracking import TrackingEvent
from app.models.video import Video

router = APIRouter(prefix="/ai-search", tags=["AI Search"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AttributeSearchRequest(BaseModel):
    description: Optional[str] = None
    clothing_color: Optional[str] = None
    object_class: Optional[str] = None
    camera_id: Optional[str] = None
    camera_ids: Optional[List[str]] = None
    time_from: Optional[str] = None
    time_to: Optional[str] = None
    min_confidence: Optional[float] = 0.4


class DescribeSearchRequest(BaseModel):
    description: str = ""
    camera_id: Optional[str] = None
    camera_ids: Optional[List[str]] = None
    time_from: Optional[str] = None
    time_to: Optional[str] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_description(description: str) -> dict:
    """
    Extract structured search parameters from a natural language description.
    Returns target_classes, keywords_found, age_group, gender, is_group, group_size_hint,
    accessories, color_hints, upper_colors, lower_colors, general_colors.
    """
    desc = description.lower().strip()

    # Word lists
    child_words  = ["kid", "kids", "child", "children", "boy", "boys", "girl", "girls",
                    "toddler", "toddlers", "baby", "babies", "infant", "infants",
                    "teen", "teenager", "juvenile", "young", "youth", "minor"]
    adult_words  = ["man", "woman", "male", "female", "adult", "person", "people",
                    "human", "individual", "lady", "gentleman", "sir", "madam", "women", "men"]
    elderly_words = ["old", "elderly", "senior", "aged", "grandfather", "grandmother"]
    vehicle_words = ["car", "vehicle", "motorcycle", "bike", "bus", "truck", "van",
                     "motorbike", "scooter", "bicycle"]
    color_words  = ["red", "blue", "black", "white", "green", "yellow", "orange",
                    "purple", "pink", "grey", "gray", "brown", "dark", "light",
                    "bright", "navy", "maroon", "beige", "cream"]
    upper_garments = ["shirt", "t-shirt", "tshirt", "tee", "top", "jacket", "hoodie",
                      "coat", "sweater", "sweatshirt", "blazer", "suit", "polo", "vest", "dress"]
    lower_garments = ["pants", "trousers", "jeans", "shorts", "skirt", "slacks"]
    accessory_map = {
        "backpack": ["backpack", "rucksack", "bag on back", "school bag"],
        "handbag":  ["handbag", "purse", "clutch", "tote"],
        "umbrella": ["umbrella"],
        "bicycle":  ["bicycle", "cycling", "cyclist"],
        "motorcycle": ["motorcycle", "motorbike", "scooter"],
    }
    count_map = {
        "alone": 1, "one": 1, "single": 1,
        "two": 2, "couple": 2, "pair": 2, "both": 2,
        "three": 3, "four": 4, "five": 5,
        "group": 0, "crowd": 0, "multiple": 0, "several": 0,
        "together": 0, "bunch": 0,
    }

    # Spatial keywords (e.g., 'on the right', 'on the left', 'in center')
    spatial_req = None
    if re.search(r"\b(?:on\s+the\s+right|to\s+the\s+right|right\s+side|at\s+the\s+right|on\s+right)\b", desc) or re.search(r"\bright\b(?!\s+(?:now|here|away|there))", desc):
        spatial_req = "right"
    elif re.search(r"\b(?:on\s+the\s+left|to\s+the\s+left|left\s+side|at\s+the\s+left|on\s+left)\b", desc) or re.search(r"\bleft\b(?!\s+(?:behind|over|out))", desc):
        spatial_req = "left"
    elif re.search(r"\b(?:in\s+the\s+center|in\s+the\s+middle|center\s+stage|middle\s+of|center|middle)\b", desc):
        spatial_req = "center"

    # Gender extraction using boundary-safe regex
    woman_words = ["woman", "women", "female", "lady", "girl", "madam", "grandmother"]
    man_words = ["man", "men", "male", "gentleman", "guy", "sir", "boy", "grandfather"]
    
    gender_req = None
    if any(re.search(rf"\b{w}\b", desc) for w in woman_words):
        gender_req = "woman"
    elif any(re.search(rf"\b{w}\b", desc) for w in man_words):
        gender_req = "man"

    has_child   = any(re.search(rf"\b{w}\b", desc) for w in child_words)
    has_adult   = any(re.search(rf"\b{w}\b", desc) for w in adult_words) or (gender_req is not None)
    has_elderly = any(re.search(rf"\b{w}\b", desc) for w in elderly_words)
    has_vehicle = any(re.search(rf"\b{w}\b", desc) for w in vehicle_words)

    target_classes = []
    keywords_found = []
    age_group = None

    if spatial_req:
        keywords_found.append(f"on {spatial_req}" if spatial_req in ("left", "right") else "center")

    if has_child:
        target_classes.append("person")
        age_group = "child"
        keywords_found += [w for w in child_words if re.search(rf"\b{w}\b", desc)]
    if has_elderly:
        target_classes.append("person")
        age_group = "elderly"
        keywords_found += [w for w in elderly_words if re.search(rf"\b{w}\b", desc)]
    if has_adult and not has_child and not has_elderly:
        target_classes.append("person")
        keywords_found += [w for w in adult_words if re.search(rf"\b{w}\b", desc)]
        age_group = "adult"
    if has_vehicle and not has_child and not has_adult and not has_elderly:
        for vw in vehicle_words:
            if re.search(rf"\b{vw}\b", desc):
                target_classes.append(vw)
                keywords_found.append(vw)

    # Default to person if nothing matched
    if not target_classes:
        target_classes = ["person"]

    # Accessories
    accessories = []
    for acc_cls, acc_words in accessory_map.items():
        if any(w in desc for w in acc_words):
            accessories.append(acc_cls)
            keywords_found.append(acc_cls)

    # Garment & Color slot extraction
    upper_colors = []
    lower_colors = []
    general_colors = []
    all_colors = []

    for c in color_words:
        c_norm = "grey" if c == "gray" else c
        c_found = False

        # Upper garment association (e.g., 'red shirt', 'blue puffer jacket', 'shirt in red')
        for ug in upper_garments:
            if re.search(rf"\b{c}\s+(?:puffer\s+|leather\s+|denim\s+|wool\s+|knit\s+)?{ug}\b", desc) or re.search(rf"\b{ug}\s+(?:in\s+)?{c}\b", desc):
                if c_norm not in upper_colors:
                    upper_colors.append(c_norm)
                c_found = True

        # Lower garment association (e.g., 'black pants', 'blue jeans')
        for lg in lower_garments:
            if re.search(rf"\b{c}\s+{lg}\b", desc) or re.search(rf"\b{lg}\s+(?:in\s+)?{c}\b", desc):
                if c_norm not in lower_colors:
                    lower_colors.append(c_norm)
                c_found = True

        # Suit modifies both upper & lower
        if re.search(rf"\b{c}\s+suit\b", desc):
            if c_norm not in upper_colors:
                upper_colors.append(c_norm)
            if c_norm not in lower_colors:
                lower_colors.append(c_norm)
            c_found = True

        if re.search(rf"\b{c}\b", desc):
            if c_norm not in all_colors:
                all_colors.append(c_norm)
            keywords_found.append(c_norm)
            if not c_found and c_norm not in general_colors:
                general_colors.append(c_norm)

    # Group / count
    is_group = False
    group_size_hint = 1
    for word, count in count_map.items():
        if word in desc:
            group_size_hint = count
            is_group = (count != 1)
            keywords_found.append(word)
            break

    return {
        "target_classes": list(set(target_classes)),
        "keywords_found": list(set(keywords_found)),
        "age_group": age_group,
        "gender": gender_req,
        "spatial_req": spatial_req,
        "is_group": is_group,
        "group_size_hint": group_size_hint,
        "accessories": accessories,
        "color_hints": all_colors,
        "upper_colors": upper_colors,
        "lower_colors": lower_colors,
        "general_colors": general_colors,
    }



def _movement_from_trajectory(trajectory_json: Optional[str]) -> tuple:
    """Return (movement_type, trajectory_span) from serialised trajectory."""
    if not trajectory_json:
        return "Unknown", 0.0
    try:
        traj = _json.loads(trajectory_json)
        if len(traj) < 2:
            return "Stationary", 0.0
        first = traj[0]["bbox"]
        last  = traj[-1]["bbox"]
        dx = abs(last[0] - first[0])
        dy = abs(last[1] - first[1])
        span = (dx ** 2 + dy ** 2) ** 0.5
        if span < 0.02:
            return "Stationary", round(span, 4)
        if span < 0.10:
            return "Slow Movement", round(span, 4)
        return "Moving", round(span, 4)
    except Exception:
        return "Unknown", 0.0


# In-memory cache for track attributes to avoid redundant image reading
TRACK_ATTRS_CACHE = {}

def get_track_attributes(track: TrackingEvent) -> dict:
    if track.id in TRACK_ATTRS_CACHE:
        return TRACK_ATTRS_CACHE[track.id]
        
    # 0. Trajectory metrics for spatial positioning and perspective-aware height
    avg_x = 0.5
    avg_y = 0.5
    avg_w = 0.0
    avg_h = 0.0
    has_trajectory = False
    if track.bbox_trajectory:
        try:
            traj = _json.loads(track.bbox_trajectory) if isinstance(track.bbox_trajectory, str) else track.bbox_trajectory
            if traj and len(traj) > 0:
                xs = [pt['bbox'][0] for pt in traj]
                ys = [pt['bbox'][1] for pt in traj]
                ws = [pt['bbox'][2] for pt in traj]
                hs = [pt['bbox'][3] for pt in traj]
                avg_x = sum(xs) / len(xs)
                avg_y = sum(ys) / len(ys)
                avg_w = sum(ws) / len(ws)
                avg_h = sum(hs) / len(hs)
                has_trajectory = True
        except Exception:
            pass

    # 1. Perspective-aware Age group
    age = "adult"
    height_ratio = 1.0
    if has_trajectory and (track.total_detections or 0) >= 4:
        expected_adult_h = max(0.18, 0.22 + 0.55 * avg_y)
        height_ratio = avg_h / expected_adult_h if expected_adult_h > 0 else 1.0
        ar_traj = avg_h / avg_w if avg_w > 0 else 2.5
        # Standing child is significantly shorter than expected adult height at scene depth y
        if 0.35 <= height_ratio <= 0.72 and avg_h <= 0.28 and ar_traj >= 2.0:
            age = "child"
        else:
            age = "adult"

    attrs = {
        "gender": "unknown",
        "gender_confidence": 0.0,
        "age_group": age,
        "height_ratio": round(height_ratio, 2),
        "avg_x": round(avg_x, 3),
        "avg_y": round(avg_y, 3),
        "avg_h": round(avg_h, 3),
        "upper_colors": [],
        "lower_colors": [],
        "colors": [],
        "torso_scores": {},
        "legs_scores": {},
    }
    
    if track.thumbnail_path and os.path.exists(track.thumbnail_path):
        try:
            import cv2
            import numpy as np
            img = cv2.imread(track.thumbnail_path)
            if img is not None:
                h, w, c = img.shape
                aspect_ratio = h / w if w > 0 else 2.5
                
                # Fallback age if no trajectory was available
                if not has_trajectory:
                    if aspect_ratio < 1.9 and h < 250:
                        age = "child"
                    else:
                        age = "adult"
                
                # 2. Torso (upper garment) & Legs (lower garment)
                # Sample center 25%-75% width to reject side background clutter & counter signs
                torso = img[int(h*0.22):int(h*0.52), int(w*0.25):int(w*0.75)]
                legs  = img[int(h*0.55):int(h*0.88), int(w*0.25):int(w*0.75)]
                
                def calculate_color_distribution(region):
                    if region.size == 0:
                        return {}
                    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
                    h_ch, s_ch, v_ch = cv2.split(hsv)
                    tot = region.shape[0] * region.shape[1]
                    if tot == 0:
                        return {}
                    
                    # Achromatic
                    black = (v_ch < 55)
                    white = (s_ch < 35) & (v_ch > 165)
                    grey  = (s_ch < 35) & (v_ch >= 55) & (v_ch <= 165)
                    
                    # Chromatic
                    red    = ((h_ch < 10) | (h_ch > 165)) & (s_ch >= 65) & (v_ch >= 45)
                    pink   = (((h_ch >= 145) & (h_ch <= 170) & (s_ch >= 25) & (v_ch >= 80)) |
                              (((h_ch < 15) | (h_ch > 165)) & (s_ch >= 25) & (s_ch < 65) & (v_ch >= 80)))
                    orange = (h_ch >= 10) & (h_ch < 22) & (s_ch >= 60) & (v_ch >= 60)
                    yellow = (h_ch >= 22) & (h_ch < 35) & (s_ch >= 50) & (v_ch >= 70)
                    green  = (h_ch >= 35) & (h_ch < 85) & (s_ch >= 35) & (v_ch >= 40)
                    blue   = (h_ch >= 85) & (h_ch < 130) & (s_ch >= 35) & (v_ch >= 40)
                    purple = (h_ch >= 130) & (h_ch < 145) & (s_ch >= 40) & (v_ch >= 40)
                    brown  = ((h_ch < 25) | (h_ch > 165)) & (s_ch >= 40) & (v_ch >= 30) & (v_ch < 90) & ~black
                    
                    raw_scores = {
                        "red": float(np.sum(red) / tot),
                        "pink": float(np.sum(pink) / tot),
                        "orange": float(np.sum(orange) / tot),
                        "yellow": float(np.sum(yellow) / tot),
                        "green": float(np.sum(green) / tot),
                        "blue": float(np.sum(blue) / tot),
                        "purple": float(np.sum(purple) / tot),
                        "brown": float(np.sum(brown) / tot),
                        "black": float(np.sum(black) / tot),
                        "white": float(np.sum(white) / tot),
                        "grey": float(np.sum(grey) / tot),
                    }
                    return raw_scores

                torso_scores = calculate_color_distribution(torso)
                legs_scores  = calculate_color_distribution(legs)
                
                upper_colors = [k for k, v in sorted(torso_scores.items(), key=lambda x: -x[1]) if v >= 0.18]
                lower_colors = [k for k, v in sorted(legs_scores.items(), key=lambda x: -x[1]) if v >= 0.20]
                all_colors = list(dict.fromkeys(upper_colors + lower_colors))
                
                # 3. Gender estimation (silhouette, hair & clothing style)
                gender = "unknown"
                gender_confidence = 0.0
                
                # Long hair extending past neck/shoulders
                lateral_neck = img[int(h*0.18):int(h*0.35), :]
                if lateral_neck.size > 0:
                    gray_lat = cv2.cvtColor(lateral_neck, cv2.COLOR_BGR2GRAY)
                    hair_density = float(np.sum(gray_lat < 50) / gray_lat.size)
                    if hair_density > 0.35:
                        gender = "woman"
                        gender_confidence = 0.70
                        
                # Style and clothing cues
                if "pink" in upper_colors and gender != "woman":
                    gender = "woman"
                    gender_confidence = 0.65
                elif "black" in upper_colors and "black" in lower_colors and aspect_ratio > 2.3:
                    gender = "man"
                    gender_confidence = 0.60
                    
                if gender == "unknown":
                    if aspect_ratio >= 2.35 and h > 200:
                        gender = "man"
                        gender_confidence = 0.50
                    else:
                        gender = "unknown"
                        gender_confidence = 0.20
                        
                attrs.update({
                    "gender": gender,
                    "gender_confidence": gender_confidence,
                    "age_group": age,
                    "upper_colors": upper_colors,
                    "lower_colors": lower_colors,
                    "colors": all_colors,
                    "torso_scores": torso_scores,
                    "legs_scores": legs_scores,
                })
        except Exception:
            pass
            
    TRACK_ATTRS_CACHE[track.id] = attrs
    return attrs


def _build_sighting(track: TrackingEvent, camera: Optional[Camera],
                    matched_keywords: List[str], relevance_score: float,
                    db: Session) -> dict:
    """Build a sighting log dict from a TrackingEvent row with matched keywords and score."""
    # Thumbnail
    thumbnail_url = None
    if track.thumbnail_path and os.path.exists(track.thumbnail_path):
        fname = os.path.basename(track.thumbnail_path)
        thumbnail_url = f"/api/v1/tracking/thumbnails/{track.video_id}/{fname}"

    movement_type, traj_span = _movement_from_trajectory(track.bbox_trajectory)

    duration = round(track.end_time_offset - track.start_time_offset, 1)

    return {
        "track_event_id":     track.id,
        "video_id":           track.video_id,
        "camera_id":          track.camera_id,
        "camera_name":        camera.name if camera else "Unknown Camera",
        "camera_code":        camera.camera_code if camera else "N/A",
        "area_zone":          (camera.area_zone if camera else "") or "",
        "location_description": (camera.location_description if camera else "") or "",
        "track_id":           track.track_id,
        "class_name":         track.class_name,
        "start_time_offset":  track.start_time_offset,
        "end_time_offset":    track.end_time_offset,
        "duration_seconds":   duration,
        "real_world_start_time": track.real_world_start_time.isoformat() if track.real_world_start_time else None,
        "real_world_end_time":   track.real_world_end_time.isoformat()   if track.real_world_end_time   else None,
        "has_real_time":      track.real_world_start_time is not None,
        "total_detections":   track.total_detections,
        "avg_confidence":     round(track.avg_confidence or 0, 2),
        "movement_type":      movement_type,
        "trajectory_span":    traj_span,
        "thumbnail_url":      thumbnail_url,
        "matched_keywords":   matched_keywords,
        "relevance_score":    round(relevance_score, 3),
        "is_group_sighting":  False,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/describe")
def forensic_describe_search(payload: DescribeSearchRequest, db: Session = Depends(get_db)):
    """
    Natural-language forensic search across all processed CCTV footage.
    Returns individual sightings plus group sightings when description implies multiple subjects.
    """
    parsed = parse_description(payload.description or "person")
    target_classes  = parsed["target_classes"]
    is_group        = parsed["is_group"]
    group_size_hint = parsed["group_size_hint"]
    accessories     = parsed["accessories"]
    keywords_found  = parsed["keywords_found"]
    req_gender      = parsed["gender"]
    req_age_group   = parsed["age_group"]
    spatial_req     = parsed.get("spatial_req")
    color_hints     = parsed["color_hints"]
    upper_colors    = parsed.get("upper_colors", [])
    lower_colors    = parsed.get("lower_colors", [])
    general_colors  = parsed.get("general_colors", [])

    # Base query on TrackingEvents
    q = db.query(TrackingEvent).filter(
        TrackingEvent.class_name.in_(target_classes)
    )
    # Camera filter (support both multiple camera_ids and single camera_id)
    target_cams = [cid for cid in (payload.camera_ids or []) if cid]
    if not target_cams and payload.camera_id:
        target_cams = [payload.camera_id]
    if target_cams:
        q = q.filter(TrackingEvent.camera_id.in_(target_cams))
    if payload.time_from:
        try:
            t_from = datetime.fromisoformat(payload.time_from.replace("Z", "+00:00"))
            q = q.filter(
                (TrackingEvent.real_world_start_time >= t_from) |
                (TrackingEvent.real_world_start_time == None)
            )
        except Exception:
            pass
    if payload.time_to:
        try:
            t_to = datetime.fromisoformat(payload.time_to.replace("Z", "+00:00"))
            q = q.filter(
                (TrackingEvent.real_world_end_time <= t_to) |
                (TrackingEvent.real_world_end_time == None)
            )
        except Exception:
            pass

    tracks = q.order_by(TrackingEvent.avg_confidence.desc()).limit(1000).all()

    # Cache cameras
    cam_cache = {}
    def get_camera(cid):
        if cid not in cam_cache:
            cam_cache[cid] = db.query(Camera).filter(Camera.id == cid).first()
        return cam_cache[cid]

    # Build individual sightings and filter/score by dynamic attributes
    sighting_logs = []
    for track in tracks:
        # Get actual attributes from image
        attrs = get_track_attributes(track)
        
        # 1. Filter by gender:
        # Only strictly reject if confirmed opposite gender with high confidence (>= 0.70)
        if req_gender:
            if attrs["gender"] != req_gender and attrs["gender"] != "unknown" and attrs.get("gender_confidence", 0.0) >= 0.70:
                continue
            
        # 2. Filter by age group
        if req_age_group and req_age_group == "child" and attrs["age_group"] != "child":
            continue
        if req_age_group and req_age_group == "adult" and attrs["age_group"] != "adult":
            continue
            
        # 3. Filter by Upper clothing colors (e.g. 'red shirt', 'pink dress', 'blue jacket')
        if upper_colors:
            has_upper = any(c in attrs["upper_colors"] or attrs.get("torso_scores", {}).get(c, 0.0) >= 0.18 for c in upper_colors)
            if not has_upper:
                continue
                
        # 4. Filter by Lower clothing colors (e.g. 'black pants', 'blue jeans')
        if lower_colors:
            has_lower = any(c in attrs["lower_colors"] or attrs.get("legs_scores", {}).get(c, 0.0) >= 0.20 for c in lower_colors)
            if not has_lower:
                continue
                
        # 5. Filter by General colors (if no specific garment was linked to color)
        if general_colors:
            has_gen = any(c in attrs["colors"] for c in general_colors)
            if not has_gen:
                continue

        # Matched successfully! Build matched keywords list and calibrated relevance score
        matched_kw = [track.class_name]
        criteria_scores = []
        
        # 1. Gender scoring
        if req_gender:
            if attrs["gender"] == req_gender:
                matched_kw.append(req_gender)
                criteria_scores.append(1.0)
            elif attrs["gender"] == "unknown":
                criteria_scores.append(0.55)
            else:
                criteria_scores.append(0.15)
        elif attrs["gender"] and attrs["gender"] != "unknown":
            matched_kw.append(attrs["gender"])
            
        # 2. Age group scoring
        if req_age_group:
            if attrs["age_group"] == req_age_group:
                matched_kw.append(req_age_group)
                criteria_scores.append(1.0)
            else:
                criteria_scores.append(0.20)
        elif attrs["age_group"] == "child":
            matched_kw.append("child")
            
        # 3. Spatial positioning scoring
        if spatial_req == "right":
            avg_x = attrs.get("avg_x", 0.5)
            if avg_x >= 0.52:
                matched_kw.append("on the right")
                s_score = min(1.0, 0.85 + (avg_x - 0.52) * 1.15)
                criteria_scores.append(s_score)
            else:
                criteria_scores.append(max(0.10, 0.50 - (0.52 - avg_x)))
        elif spatial_req == "left":
            avg_x = attrs.get("avg_x", 0.5)
            if avg_x <= 0.45:
                matched_kw.append("on the left")
                s_score = min(1.0, 0.85 + (0.45 - avg_x) * 1.15)
                criteria_scores.append(s_score)
            else:
                criteria_scores.append(max(0.10, 0.50 - (avg_x - 0.45)))
        elif spatial_req == "center":
            avg_x = attrs.get("avg_x", 0.5)
            if 0.35 <= avg_x <= 0.65:
                matched_kw.append("in the center")
                criteria_scores.append(1.0)
            else:
                criteria_scores.append(max(0.10, 1.0 - abs(avg_x - 0.5) * 2))

        # 4. Upper clothing color tags & score
        for col in upper_colors:
            cov = attrs.get("torso_scores", {}).get(col, 0.0)
            matched_kw.append(f"{col} shirt")
            criteria_scores.append(min(1.0, cov / 0.35))
            
        # 5. Lower clothing color tags & score
        for col in lower_colors:
            cov = attrs.get("legs_scores", {}).get(col, 0.0)
            matched_kw.append(f"{col} pants")
            criteria_scores.append(min(1.0, cov / 0.35))
            
        # 6. General colors
        for col in general_colors:
            if col in attrs["colors"]:
                matched_kw.append(col)
                criteria_scores.append(1.0)
            else:
                criteria_scores.append(0.30)

        # 7. Accessories
        for acc_cls in accessories:
            hit = db.query(TrackingEvent).filter(
                TrackingEvent.camera_id == track.camera_id,
                TrackingEvent.video_id  == track.video_id,
                TrackingEvent.class_name == acc_cls,
                TrackingEvent.start_time_offset <= track.end_time_offset,
                TrackingEvent.end_time_offset   >= track.start_time_offset,
            ).first()
            if hit:
                matched_kw.append(acc_cls)
                criteria_scores.append(1.0)
            else:
                criteria_scores.append(0.25)

        # Compute normalized composite score bounded strictly in [0.10, 0.99]
        det_conf = min(0.98, max(0.40, float(track.avg_confidence or 0.75)))
        if criteria_scores:
            attr_match = sum(criteria_scores) / len(criteria_scores)
            relevance = 0.25 * det_conf + 0.75 * attr_match
            if len(criteria_scores) >= 2 and all(s >= 0.75 for s in criteria_scores):
                relevance = min(0.98, relevance * 1.06)
        else:
            relevance = det_conf

        relevance = round(max(0.10, min(0.99, relevance)), 3)

        cam = get_camera(track.camera_id)
        sighting_logs.append(_build_sighting(track, cam, list(dict.fromkeys(matched_kw)), relevance, db))


    # ── Deduplicate / Cluster individual sightings to represent Unique Persons ──
    from app.services.reid_service import ReIDService
    
    # Load embeddings for the remaining filtered sightings
    embeddings = {}
    filtered_track_ids = [s["track_event_id"] for s in sighting_logs]
    filtered_tracks = [t for t in tracks if t.id in filtered_track_ids]
    for track in filtered_tracks:
        emb = None
        if track.reid_embedding:
            try:
                emb = _json.loads(track.reid_embedding)
            except Exception:
                pass
        embeddings[track.id] = emb

    person_clusters = []  # list of lists of sighting_logs
    for s in sighting_logs:
        matched_cluster_idx = -1
        s_emb = embeddings.get(s["track_event_id"])
        
        for idx, cluster in enumerate(person_clusters):
            for member in cluster:
                # Same track_id in same video/camera -> same person
                if s["video_id"] == member["video_id"] and s["camera_id"] == member["camera_id"] and s["track_id"] == member["track_id"]:
                    matched_cluster_idx = idx
                    break
                # Cosine similarity >= 0.88 -> same person
                m_emb = embeddings.get(member["track_event_id"])
                if s_emb and m_emb:
                    sim = ReIDService.cosine_similarity(s_emb, m_emb)
                    if sim >= 0.88:
                        matched_cluster_idx = idx
                        break
            if matched_cluster_idx != -1:
                break
                
        if matched_cluster_idx != -1:
            person_clusters[matched_cluster_idx].append(s)
        else:
            person_clusters.append([s])

    # For each cluster, build a consolidated unique person log
    deduplicated_sightings = []
    for cluster in person_clusters:
        # Sort cluster by relevance_score descending to pick the best representative
        sorted_cluster = sorted(cluster, key=lambda x: -x["relevance_score"])
        primary = dict(sorted_cluster[0])
        
        # Calculate totals
        total_dur = round(sum(m["duration_seconds"] for m in cluster), 1)
        total_dets = sum(m["total_detections"] for m in cluster)
        
        # Chronological list of all sightings in this cluster
        timeline = sorted(cluster, key=lambda x: x["start_time_offset"])
        
        primary.update({
            "is_deduplicated": True,
            "reentry_count": len(cluster),
            "total_duration_seconds": total_dur,
            "total_detections": total_dets,
            "timeline": timeline,
            # Store all member IDs
            "member_track_event_ids": [m["track_event_id"] for m in timeline]
        })
        deduplicated_sightings.append(primary)

    # ── Group detection ───────────────────────────────────────────────────────
    group_sightings = []
    if is_group:
        target_n = max(2, group_size_hint) if group_size_hint > 0 else 2
        # Cluster by camera+video
        clusters = defaultdict(list)
        for s in sighting_logs:
            clusters[(s["camera_id"], s["video_id"])].append(s)

        seen_group_anchors = set()
        for (cam_id, vid_id), cam_tracks in clusters.items():
            for i, anchor in enumerate(cam_tracks):
                if anchor["track_event_id"] in seen_group_anchors:
                    continue
                overlapping = [anchor]
                for j, other in enumerate(cam_tracks):
                    if i == j:
                        continue
                    if (other["start_time_offset"] <= anchor["end_time_offset"] and
                            other["end_time_offset"] >= anchor["start_time_offset"]):
                        overlapping.append(other)

                if len(overlapping) >= target_n:
                    for m in overlapping:
                        seen_group_anchors.add(m["track_event_id"])
                    g_start = min(t["start_time_offset"] for t in overlapping)
                    g_end   = max(t["end_time_offset"]   for t in overlapping)
                    group_sightings.append({
                        "track_event_id":      f"group_{overlapping[0]['track_event_id']}",
                        "video_id":            vid_id,
                        "camera_id":           cam_id,
                        "camera_name":         overlapping[0]["camera_name"],
                        "camera_code":         overlapping[0]["camera_code"],
                        "area_zone":           overlapping[0]["area_zone"],
                        "location_description": overlapping[0]["location_description"],
                        "track_id":            None,
                        "class_name":          "person",
                        "start_time_offset":   g_start,
                        "end_time_offset":     g_end,
                        "duration_seconds":    round(g_end - g_start, 1),
                        "real_world_start_time": overlapping[0]["real_world_start_time"],
                        "real_world_end_time":   overlapping[-1]["real_world_end_time"],
                        "has_real_time":       overlapping[0]["has_real_time"],
                        "total_detections":    sum(t["total_detections"] for t in overlapping),
                        "avg_confidence":      round(sum(t["avg_confidence"] for t in overlapping) / len(overlapping), 2),
                        "movement_type":       "Group",
                        "trajectory_span":     0.0,
                        "thumbnail_url":       overlapping[0]["thumbnail_url"],
                        "matched_keywords":    list(set(kw for t in overlapping for kw in t["matched_keywords"])),
                        "relevance_score":     round(min(0.98, (sum(t["relevance_score"] for t in overlapping) / len(overlapping)) * 1.04), 3),
                        "is_group_sighting":   True,
                        "group_member_count":  len(overlapping),
                        "group_member_ids":    [t["track_event_id"] for t in overlapping],
                        # Use primary member for video jump
                        "primary_track_event_id": overlapping[0]["track_event_id"],
                    })

    # Combine: group first, then deduplicated unique persons
    all_results = (
        sorted(group_sightings, key=lambda x: -x["relevance_score"]) +
        sorted(deduplicated_sightings, key=lambda x: -x["relevance_score"])
    )

    return {
        "query": {"description": payload.description, "parsed": parsed},
        "total_results":       len(all_results),
        "group_sightings":     len(group_sightings),
        "individual_sightings": len(deduplicated_sightings),
        "raw_sightings_count": len(sighting_logs),
        "sighting_logs":       all_results[:100],
        "raw_sighting_logs":   sighting_logs[:100]  # optional fallback for raw list
    }


@router.get("/sighting/{track_event_id}/clip-info")
def get_sighting_clip_info(track_event_id: str, db: Session = Depends(get_db)):
    """Return video stream URL and seek offset for a specific tracking sighting."""
    track = db.query(TrackingEvent).filter(TrackingEvent.id == track_event_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Tracking event not found")

    camera = db.query(Camera).filter(Camera.id == track.camera_id).first()

    if track.real_world_start_time:
        display_ts = track.real_world_start_time.strftime("%Y-%m-%d %H:%M:%S UTC")
    else:
        off = track.start_time_offset
        h, rem = divmod(off, 3600)
        m, s   = divmod(rem, 60)
        display_ts = f"At {int(h):02d}:{int(m):02d}:{s:05.2f} into footage"

    traj_data = []
    if track.bbox_trajectory:
        try:
            traj_data = _json.loads(track.bbox_trajectory) if isinstance(track.bbox_trajectory, str) else track.bbox_trajectory
        except Exception:
            traj_data = []

    return {
        "track_event_id":    track_event_id,
        "video_id":          track.video_id,
        "stream_url":        f"/api/v1/videos/{track.video_id}/stream",
        "start_time_offset": track.start_time_offset,
        "end_time_offset":   track.end_time_offset,
        "camera_name":       camera.name if camera else "Unknown",
        "camera_code":       camera.camera_code if camera else "N/A",
        "display_timestamp": display_ts,
        "has_real_time":     track.real_world_start_time is not None,
        "track_id":          track.track_id,
        "class_name":        track.class_name,
        "bbox_trajectory":   traj_data
    }


# ─── Existing endpoints (kept as-is) ─────────────────────────────────────────

@router.post("/attribute")
def search_by_attributes(payload: AttributeSearchRequest, db: Session = Depends(get_db)):
    """Search video detections by object class / camera filter / confidence threshold."""
    q = db.query(Detection)
    if payload.object_class:
        q = q.filter(Detection.class_name.ilike(f"%{payload.object_class}%"))
    # Camera filter (support both multiple camera_ids and single camera_id)
    target_cams = [cid for cid in (payload.camera_ids or []) if cid]
    if not target_cams and payload.camera_id:
        target_cams = [payload.camera_id]
    if target_cams:
        q = q.filter(Detection.camera_id.in_(target_cams))
    if payload.min_confidence:
        q = q.filter(Detection.confidence >= payload.min_confidence)
    if payload.time_from:
        try:
            t_from = datetime.fromisoformat(payload.time_from.replace("Z", "+00:00"))
            q = q.filter(Detection.created_at >= t_from)
        except Exception:
            pass
    if payload.time_to:
        try:
            t_to = datetime.fromisoformat(payload.time_to.replace("Z", "+00:00"))
            q = q.filter(Detection.created_at <= t_to)
        except Exception:
            pass

    detections = q.order_by(Detection.confidence.desc()).limit(200).all()

    result = []
    for d in detections:
        camera = db.query(Camera).filter(Camera.id == d.camera_id).first()
        result.append({
            "detection_id":     d.id,
            "video_id":         d.video_id,
            "camera_id":        d.camera_id,
            "camera_name":      camera.name if camera else "Unknown",
            "camera_code":      camera.camera_code if camera else "N/A",
            "frame_number":     d.frame_number,
            "timestamp_offset": d.timestamp_offset,
            "class_name":       d.class_name,
            "confidence":       d.confidence,
            "bbox":             [d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h],
            "detected_at":      d.created_at.isoformat() if d.created_at else None,
        })

    return {
        "query": {"object_class": payload.object_class, "camera_id": payload.camera_id, "min_confidence": payload.min_confidence},
        "total_results": len(result),
        "results": result,
    }


@router.get("/detections/summary")
def get_detection_summary(db: Session = Depends(get_db)):
    """Return aggregate detection counts grouped by class name."""
    from sqlalchemy import func
    rows = (
        db.query(Detection.class_name, func.count(Detection.id).label("count"))
        .group_by(Detection.class_name)
        .order_by(func.count(Detection.id).desc())
        .all()
    )
    return {
        "summary": [{"class_name": r.class_name, "count": r.count} for r in rows],
        "total_detections": sum(r.count for r in rows),
    }


@router.get("/cameras/activity")
def get_camera_activity(db: Session = Depends(get_db)):
    """Return detection count per camera for heatmap visualization."""
    from sqlalchemy import func
    rows = (
        db.query(Detection.camera_id, func.count(Detection.id).label("count"))
        .group_by(Detection.camera_id)
        .all()
    )
    result = []
    for r in rows:
        camera = db.query(Camera).filter(Camera.id == r.camera_id).first()
        result.append({
            "camera_id":       r.camera_id,
            "camera_name":     camera.name if camera else "Unknown",
            "camera_code":     camera.camera_code if camera else "N/A",
            "detection_count": r.count,
        })
    return sorted(result, key=lambda x: x["detection_count"], reverse=True)


class GeminiClassifyRequest(BaseModel):
    image_path: str
    base_class: Optional[str] = "person"


@router.get("/gemini/status")
def get_gemini_status():
    """Check if Google Gemini Multimodal Vision is configured and active."""
    from app.services.gemini_service import gemini_classifier
    return {
        "available": gemini_classifier.is_available(),
        "model": "gemini-2.0-flash",
        "description": "Google Gemini Multimodal Vision for fine-grained forensic classification (man, woman, bag types, clothing)"
    }


@router.post("/gemini/classify-crop")
def classify_crop_with_gemini(payload: GeminiClassifyRequest):
    """Run Google Gemini Multimodal Vision on an extracted person or bag crop."""
    from app.services.gemini_service import gemini_classifier
    return gemini_classifier.classify_crop(payload.image_path, payload.base_class)

