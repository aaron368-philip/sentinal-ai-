import os
import json
import cv2
import numpy as np
from typing import List, Dict, Any, Tuple, Optional, Callable
import logging

logger = logging.getLogger(__name__)

# Try importing Ultralytics YOLO
YOLO_AVAILABLE = False
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    logger.warning("Ultralytics YOLO not installed. Falling back to OpenCV AI engine.")


def compute_iou(boxA: Tuple[float, float, float, float], boxB: Tuple[float, float, float, float]) -> float:
    """Compute Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    interArea = inter_w * inter_h

    boxAArea = max(0.0, (boxA[2] - boxA[0])) * max(0.0, (boxA[3] - boxA[1]))
    boxBArea = max(0.0, (boxB[2] - boxB[0])) * max(0.0, (boxB[3] - boxB[1]))

    unionArea = boxAArea + boxBArea - interArea
    if unionArea <= 0:
        return 0.0
    return interArea / unionArea


class FallbackMOTTracker:
    """
    Lightweight IoU + Centroid Multi-Object Tracker (MOT) used when native
    tracker is unavailable or needs fallback association.
    """
    def __init__(self, max_lost_frames: int = 15, iou_threshold: float = 0.25):
        self.next_track_id = 1
        self.tracks = {}  # track_id: {"box": (x1,y1,x2,y2), "cls": str, "lost": int, "history": []}
        self.max_lost_frames = max_lost_frames
        self.iou_threshold = iou_threshold

    def update(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Takes list of dicts: [{"box": (x1, y1, x2, y2), "cls": str, "conf": float, ...}]
        Returns detections enriched with "track_id".
        """
        matched_tracks = set()
        matched_dets = set()
        updated_detections = []

        # Match existing tracks to detections by highest IoU
        for t_id, track in list(self.tracks.items()):
            best_iou = self.iou_threshold
            best_det_idx = -1

            for d_idx, det in enumerate(detections):
                if d_idx in matched_dets:
                    continue
                if det["cls"] != track["cls"]:
                    continue

                iou = compute_iou(track["box"], det["box"])
                if iou > best_iou:
                    best_iou = iou
                    best_det_idx = d_idx

            if best_det_idx != -1:
                det = detections[best_det_idx]
                track["box"] = det["box"]
                track["lost"] = 0
                cx = int((det["box"][0] + det["box"][2]) / 2)
                cy = int((det["box"][1] + det["box"][3]) / 2)
                track["history"].append((cx, cy))
                if len(track["history"]) > 40:
                    track["history"].pop(0)

                matched_tracks.add(t_id)
                matched_dets.add(best_det_idx)

                det_copy = dict(det)
                det_copy["track_id"] = t_id
                updated_detections.append(det_copy)

        # Increment lost count for unmatched tracks
        for t_id, track in list(self.tracks.items()):
            if t_id not in matched_tracks:
                track["lost"] += 1
                if track["lost"] > self.max_lost_frames:
                    del self.tracks[t_id]

        # Create new tracks for unmatched detections
        for d_idx, det in enumerate(detections):
            if d_idx not in matched_dets:
                t_id = self.next_track_id
                self.next_track_id += 1

                cx = int((det["box"][0] + det["box"][2]) / 2)
                cy = int((det["box"][1] + det["box"][3]) / 2)

                self.tracks[t_id] = {
                    "box": det["box"],
                    "cls": det["cls"],
                    "lost": 0,
                    "history": [(cx, cy)]
                }

                det_copy = dict(det)
                det_copy["track_id"] = t_id
                updated_detections.append(det_copy)

        return updated_detections


class AIEngine:
    AVAILABLE_MODELS = {
        "yolo11m.pt": {
            "name": "YOLO11-Medium (High Accuracy)",
            "description": "20.1M params. High detection recall for occluded, distant, and small persons in CCTV.",
            "params": "20.1M",
            "tier": "high_accuracy"
        },
        "yolo11s.pt": {
            "name": "YOLO11-Small (Fast / Recommended)",
            "description": "9.4M params. Ultra-fast inference with strong recall for persons and bags (<1 min runtime).",
            "params": "9.4M",
            "tier": "balanced"
        },
        "yolo11n.pt": {
            "name": "YOLO11-Nano (Ultra Fast)",
            "description": "2.6M params. Lightweight baseline model for quick previews.",
            "params": "2.6M",
            "tier": "fast"
        }
    }

    TARGET_CLASS_PRESETS = {
        "person_and_bags": {
            "name": "Persons & Bags (Recommended)",
            "description": "Optimized tracking for persons, handbags, backpacks, and suitcases.",
            "class_ids": [0, 24, 26, 28]  # person, backpack, handbag, suitcase
        },
        "all": {
            "name": "All Objects",
            "description": "Detect all 80 COCO categories (vehicles, animals, objects, etc.)",
            "class_ids": None
        }
    }

    def __init__(self, default_model: str = "yolo11m.pt", model_name: Optional[str] = None):
        self.loaded_models: Dict[str, Any] = {}
        chosen = model_name or default_model
        self.active_model_name = chosen
        self.face_cascade = None
        
        self.device = "cpu"
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
                logger.info("AIEngine: CUDA GPU acceleration active.")
        except Exception:
            pass

        # Load Face Cascade
        cascade_path = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml') if hasattr(cv2, 'data') else ''
        if os.path.exists(cascade_path):
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
        else:
            local_xml = os.path.join(os.path.dirname(__file__), "haarcascade_frontalface_default.xml")
            if not os.path.exists(local_xml):
                try:
                    import requests
                    resp = requests.get("https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml", timeout=5)
                    if resp.status_code == 200:
                        with open(local_xml, "wb") as f:
                            f.write(resp.content)
                except Exception as e:
                    logger.warning(f"Could not download Haar cascade: {e}")
            if os.path.exists(local_xml):
                self.face_cascade = cv2.CascadeClassifier(local_xml)

        # Preload default YOLO model
        if YOLO_AVAILABLE:
            self.get_yolo_model(default_model)

    def get_yolo_model(self, model_name: Optional[str] = None):
        """
        Retrieves or loads a requested YOLO model from cache or disk.
        Supports seamless switching between yolo11m, yolo11s, yolo11n, etc.
        """
        if not YOLO_AVAILABLE:
            return None

        target = model_name or self.active_model_name or "yolo11m.pt"
        if target in self.loaded_models:
            return self.loaded_models[target]

        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        candidate_paths = [
            os.path.join(backend_dir, target),
            os.path.join(backend_dir, os.path.basename(target)),
            target,
            os.path.basename(target)
        ]

        for p in candidate_paths:
            if os.path.exists(p):
                try:
                    model = YOLO(p)
                    self.loaded_models[target] = model
                    logger.info(f"AIEngine: Successfully loaded YOLO model '{target}' from '{p}'.")
                    return model
                except Exception as e:
                    logger.warning(f"Failed loading weights from '{p}': {e}")

        # Try direct load by name (ultralytics download / cache)
        try:
            model = YOLO(target)
            self.loaded_models[target] = model
            logger.info(f"AIEngine: Successfully initialized YOLO model '{target}'.")
            return model
        except Exception as e:
            logger.warning(f"Could not load '{target}': {e}. Trying fallback models.")
            for fb in ["yolo11m.pt", "yolo11s.pt", "yolo11n.pt", "yolov8n.pt"]:
                fb_path = os.path.join(backend_dir, fb)
                if os.path.exists(fb_path):
                    try:
                        model = YOLO(fb_path)
                        self.loaded_models[target] = model
                        logger.info(f"AIEngine: Loaded fallback model '{fb}'.")
                        return model
                    except Exception:
                        pass
        return None


    def process_video(
        self,
        input_path: str,
        output_path: str,
        face_thumbnails_dir: str,
        tracks_thumbnails_dir: Optional[str] = None,
        sample_fps: int = 3,
        confidence_threshold: float = 0.20,
        person_confidence: float = 0.15,
        bag_confidence: float = 0.18,
        model_name: Optional[str] = None,
        target_classes: Optional[str] = "person_and_bags",
        imgsz: int = 960,
        recover_occluded_persons: bool = True,
        is_cancelled: Optional[Callable[[], bool]] = None
    ) -> Dict[str, Any]:
        """
        Processes video footage with YOLO + ByteTrack Multi-Object Tracking (MOT),
        renders persistent track IDs and motion trajectory lines, and extracts
        best-quality entity crops and aggregated track summaries.
        Supports graceful mid-flight cancellation via `is_cancelled` callback,
        multi-model selection (yolo11m, yolo11s, yolo11n), fast target class filtering
        (persons and bags), class-specific sensitivity, and occluded/seated person recovery.
        """
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise ValueError(f"Unable to open video file: {input_path}")

        orig_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1280
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 720
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        os.makedirs(face_thumbnails_dir, exist_ok=True)
        if not tracks_thumbnails_dir:
            tracks_thumbnails_dir = os.path.join(os.path.dirname(face_thumbnails_dir), "track_crops")
        os.makedirs(tracks_thumbnails_dir, exist_ok=True)

        # Optimize PyTorch CPU threading
        try:
            import torch
            torch.set_num_threads(min(8, os.cpu_count() or 4))
        except Exception:
            pass

        # Retrieve selected or default YOLO model (Medium, Small, or Nano)
        active_yolo = self.get_yolo_model(model_name)
        if active_yolo:
            logger.info(f"AI Engine executing MOT tracking using model: {model_name or self.active_model_name}")
            # Cleanly reset YOLO model predictor and ByteTrack state so each video starts with fresh track IDs starting from 1
            if hasattr(active_yolo, "predictor") and active_yolo.predictor is not None:
                active_yolo.predictor = None
            try:
                from ultralytics.trackers.byte_tracker import STrack
                STrack.reset_id()
            except Exception:
                pass

        # Resolve target class IDs for fast focused inference
        filter_class_ids = None
        if isinstance(target_classes, str):
            if target_classes in self.TARGET_CLASS_PRESETS:
                filter_class_ids = self.TARGET_CLASS_PRESETS[target_classes]["class_ids"]
        elif isinstance(target_classes, (list, tuple)):
            filter_class_ids = list(target_classes)
        elif target_classes is None:
            filter_class_ids = self.TARGET_CLASS_PRESETS["person_and_bags"]["class_ids"]

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out_writer = cv2.VideoWriter(output_path, fourcc, sample_fps, (width, height))

        detections = []
        face_crops = []
        track_aggregates = {}  # track_id: {"class_name": str, "start_frame": f, "end_frame": f, ...}
        track_history = {}     # track_id: [(cx, cy), ...] for drawing motion trail
        best_track_crops = {}  # track_id: {"crop": np.ndarray, "conf": float, "area": int, "path": str}
        track_face_count = {}  # track_id: int
        track_face_last_frame = {} # track_id: int

        # Fallback tracker used only if YOLO tracking is completely unavailable
        fallback_tracker = FallbackMOTTracker(max_lost_frames=max(6, int(sample_fps * 2.0)), iou_threshold=0.35)
        frame_idx = 0
        skip_interval = max(1, int(orig_fps / sample_fps))
        was_cancelled = False

        # Load optimized CCTV ByteTrack tracker configuration
        custom_tracker_yaml = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "core", "cctv_bytetrack.yaml"))
        active_tracker = custom_tracker_yaml if os.path.exists(custom_tracker_yaml) else "bytetrack.yaml"

        # Color palette for classes (BGR)
        colors = {
            "person": (255, 140, 0),      # Cyan/Blue
            "car": (0, 215, 255),          # Gold/Yellow
            "motorcycle": (50, 205, 50),   # Lime Green
            "bus": (238, 130, 238),        # Violet
            "truck": (0, 165, 255),        # Orange
            "backpack": (147, 20, 255),    # Deep Pink
            "handbag": (180, 105, 255),    # Hot Pink
            "suitcase": (205, 90, 106),    # Steel Slate
            "face": (0, 255, 127)          # Spring Green
        }
        default_color = (0, 255, 255)

        # Generate distinct, high-contrast track color using golden-ratio HSV distribution
        def get_track_color(t_id: int) -> Tuple[int, int, int]:
            golden_ratio = 0.618033988749895
            hue = int(((t_id * golden_ratio) % 1.0) * 180)
            hsv = np.uint8([[[hue, 230, 245]]])
            bgr = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)[0][0]
            return (int(bgr[0]), int(bgr[1]), int(bgr[2]))

        while True:
            if is_cancelled and is_cancelled():
                logger.info(f"AI Video Tracking cancelled by request at frame {frame_idx}.")
                was_cancelled = True
                break

            if frame_idx % skip_interval != 0:
                ret = cap.grab()
                if not ret:
                    break
                frame_idx += 1
                continue

            ret, frame = cap.read()
            if not ret:
                break

            current_sampled_frame_idx = frame_idx
            timestamp_offset = round(current_sampled_frame_idx / orig_fps, 2)

            annotated_frame = frame.copy()
            current_frame_dets = []

            if active_yolo is not None:
                # Attempt YOLO with ByteTrack persistent tracker
                use_yolo_tracking = True
                effective_conf = min(confidence_threshold, person_confidence, bag_confidence)
                try:
                    # track() with ByteTrack and high-resolution inference for distant/walking people
                    track_args = {
                        "persist": True,
                        "tracker": active_tracker,
                        "conf": effective_conf,
                        "iou": 0.45,
                        "imgsz": imgsz,
                        "device": self.device,
                        "verbose": False
                    }
                    if filter_class_ids is not None:
                        track_args["classes"] = filter_class_ids

                    results = active_yolo.track(frame, **track_args)
                except Exception as e:
                    logger.warning(f"YOLO track() failed, falling back to detect(): {e}")
                    use_yolo_tracking = False
                    detect_args = {
                        "conf": effective_conf,
                        "imgsz": imgsz,
                        "device": self.device,
                        "verbose": False
                    }
                    if filter_class_ids is not None:
                        detect_args["classes"] = filter_class_ids
                    results = active_yolo(frame, **detect_args)

                for r in results:
                    if not hasattr(r, "boxes") or r.boxes is None:
                        continue
                    for box in r.boxes:
                        cls_id = int(box.cls[0])
                        cls_name = active_yolo.names[cls_id]
                        conf = float(box.conf[0])

                        # Class-specific confidence filtering (allows persons & bags at sensitive conf thresholds)
                        if cls_name == "person":
                            min_conf = person_confidence
                        elif cls_name in ("handbag", "backpack", "suitcase"):
                            min_conf = bag_confidence
                        else:
                            min_conf = confidence_threshold

                        if conf < min_conf:
                            continue

                        x1, y1, x2, y2 = map(int, box.xyxy[0])

                        assigned_track_id = None
                        if use_yolo_tracking and box.id is not None:
                            try:
                                assigned_track_id = int(box.id[0])
                            except Exception:
                                assigned_track_id = None

                        # When using YOLO tracking, only retain confirmed tracked detections
                        if use_yolo_tracking and assigned_track_id is None:
                            continue

                        current_frame_dets.append({
                            "box": (x1, y1, x2, y2),
                            "cls": cls_name,
                            "conf": conf,
                            "track_id": assigned_track_id
                        })

                # If YOLO track() failed and fell back to detect(), apply FallbackMOTTracker
                if not use_yolo_tracking:
                    current_frame_dets = fallback_tracker.update(current_frame_dets)

            else:
                # Fallback OpenCV Haar Cascade Detector + Fallback Tracker
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                if self.face_cascade is not None:
                    faces = self.face_cascade.detectMultiScale(gray, 1.2, 5, minSize=(30, 30))
                    for (fx, fy, fw, fh) in faces:
                        current_frame_dets.append({
                            "box": (fx, fy, fx + fw, fy + fh),
                            "cls": "person",
                            "conf": 0.85,
                            "track_id": None
                        })
                current_frame_dets = fallback_tracker.update(current_frame_dets)

            # Process all tracked detections for current frame
            for det in current_frame_dets:
                x1, y1, x2, y2 = det["box"]
                cls_name = det["cls"]
                conf = det["conf"]
                track_id = det.get("track_id")
                if track_id is None:
                    continue

                norm_x = round(x1 / width, 4)
                norm_y = round(y1 / height, 4)
                norm_w = round((x2 - x1) / width, 4)
                norm_h = round((y2 - y1) / height, 4)

                # Append to frame detection list
                detections.append({
                    "frame_number": frame_idx,
                    "timestamp_offset": timestamp_offset,
                    "class_name": cls_name,
                    "confidence": round(conf, 3),
                    "track_id": track_id,
                    "bbox_x": norm_x,
                    "bbox_y": norm_y,
                    "bbox_w": norm_w,
                    "bbox_h": norm_h
                })

                # Record spatial trajectory point
                cx = int((x1 + x2) / 2)
                cy = int((y1 + y2) / 2)
                if track_id not in track_history:
                    track_history[track_id] = []
                track_history[track_id].append((cx, cy))
                if len(track_history[track_id]) > 35:
                    track_history[track_id].pop(0)

                # Update track aggregate
                traj_point = {
                    "frame": frame_idx,
                    "timestamp": timestamp_offset,
                    "bbox": [norm_x, norm_y, norm_w, norm_h],
                    "confidence": round(conf, 3)
                }

                if track_id not in track_aggregates:
                    track_aggregates[track_id] = {
                        "track_id": track_id,
                        "class_name": cls_name,
                        "class_counts": {cls_name: 1},
                        "start_frame": frame_idx,
                        "end_frame": frame_idx,
                        "start_time_offset": timestamp_offset,
                        "end_time_offset": timestamp_offset,
                        "total_detections": 1,
                        "conf_sum": conf,
                        "trajectory": [traj_point]
                    }
                else:
                    agg = track_aggregates[track_id]
                    agg["end_frame"] = frame_idx
                    agg["end_time_offset"] = timestamp_offset
                    agg["total_detections"] += 1
                    agg["conf_sum"] += conf
                    agg["trajectory"].append(traj_point)
                    if "class_counts" not in agg:
                        agg["class_counts"] = {}
                    agg["class_counts"][cls_name] = agg["class_counts"].get(cls_name, 0) + 1

                # Extract Best Entity Thumbnail Crop
                crop_area = max(0, x2 - x1) * max(0, y2 - y1)
                entity_crop = frame[max(0, y1):min(height, y2), max(0, x1):min(width, x2)]
                if entity_crop.size > 0:
                    prev_crop_info = best_track_crops.get(track_id)
                    # Save if first crop or if higher confidence / larger resolution
                    if prev_crop_info is None or (conf > prev_crop_info["conf"] and crop_area >= prev_crop_info["area"] * 0.8):
                        crop_filename = f"track_{track_id}_{cls_name}.jpg"
                        crop_path = os.path.join(tracks_thumbnails_dir, crop_filename)
                        cv2.imwrite(crop_path, entity_crop)
                        best_track_crops[track_id] = {
                            "conf": conf,
                            "area": crop_area,
                            "path": crop_path
                        }

                # If person, check for frontal face crop (Throttled per track for high performance)
                if cls_name.lower() == "person" and self.face_cascade is not None and entity_crop.size > 0:
                    curr_face_c = track_face_count.get(track_id, 0)
                    last_face_f = track_face_last_frame.get(track_id, -999)
                    if curr_face_c < 2 and (frame_idx - last_face_f >= 20):
                        track_face_last_frame[track_id] = frame_idx
                        ch, cw = entity_crop.shape[:2]
                        if ch >= 40 and cw >= 30:
                            head_crop = entity_crop[:int(ch * 0.45), :]
                            gray_head = cv2.cvtColor(head_crop, cv2.COLOR_BGR2GRAY)
                            faces = self.face_cascade.detectMultiScale(gray_head, scaleFactor=1.15, minNeighbors=3, minSize=(20, 20))
                            for (fx, fy, fw, fh) in faces:
                                face_img = head_crop[fy:fy+fh, fx:fx+fw]
                                face_filename = f"face_t{track_id}_f{frame_idx}_{len(face_crops)}.jpg"
                                face_path = os.path.join(face_thumbnails_dir, face_filename)
                                cv2.imwrite(face_path, face_img)
                                track_face_count[track_id] = curr_face_c + 1
                                face_crops.append({
                                    "frame": frame_idx,
                                    "timestamp": timestamp_offset,
                                    "track_id": track_id,
                                    "path": face_path
                                })
                                break

            # Render Motion Trails
            for t_id, pts in track_history.items():
                if len(pts) > 1:
                    t_color = get_track_color(t_id)
                    n_pts = len(pts)
                    for p_idx in range(1, n_pts):
                        progress = p_idx / float(n_pts)
                        thickness = max(1, int(progress * 2.5))
                        cv2.line(annotated_frame, pts[p_idx - 1], pts[p_idx], t_color, thickness, cv2.LINE_AA)
                    cv2.circle(annotated_frame, pts[-1], 4, t_color, 1, cv2.LINE_AA)
                    cv2.circle(annotated_frame, pts[-1], 2, (0, 255, 255), -1, cv2.LINE_AA)

            # Render detection boxes and ID tags for current frame
            for det in current_frame_dets:
                x1, y1, x2, y2 = det["box"]
                cls_name = det["cls"]
                conf = det["conf"]
                track_id = det.get("track_id")
                if track_id is None:
                    continue

                t_color = get_track_color(track_id)

                # 1. Main Bounding Box (crisp thin border)
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), t_color, 1, cv2.LINE_AA)

                # 2. Modern CCTV Corner Brackets (high-tech forensic look)
                bw_box = x2 - x1
                bh_box = y2 - y1
                c_len = max(6, min(14, int(min(bw_box, bh_box) * 0.2)))
                bracket_thickness = 2

                # Top-Left
                cv2.line(annotated_frame, (x1, y1), (x1 + c_len, y1), t_color, bracket_thickness, cv2.LINE_AA)
                cv2.line(annotated_frame, (x1, y1), (x1, y1 + c_len), t_color, bracket_thickness, cv2.LINE_AA)
                # Top-Right
                cv2.line(annotated_frame, (x2, y1), (x2 - c_len, y1), t_color, bracket_thickness, cv2.LINE_AA)
                cv2.line(annotated_frame, (x2, y1), (x2, y1 + c_len), t_color, bracket_thickness, cv2.LINE_AA)
                # Bottom-Left
                cv2.line(annotated_frame, (x1, y2), (x1 + c_len, y2), t_color, bracket_thickness, cv2.LINE_AA)
                cv2.line(annotated_frame, (x1, y2), (x1, y2 - c_len), t_color, bracket_thickness, cv2.LINE_AA)
                # Bottom-Right
                cv2.line(annotated_frame, (x2, y2), (x2 - c_len, y2), t_color, bracket_thickness, cv2.LINE_AA)
                cv2.line(annotated_frame, (x2, y2), (x2, y2 - c_len), t_color, bracket_thickness, cv2.LINE_AA)

                # 3. High-Contrast Dark Pill Tag Badge
                badge_text = f"ID #{track_id} | {cls_name.upper()} {int(conf * 100)}%"
                font = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.40
                font_thick = 1
                (tw, th), baseline = cv2.getTextSize(badge_text, font, font_scale, font_thick)

                badge_pad_x = 6
                badge_pad_y = 4
                badge_w = tw + (badge_pad_x * 2) + 4
                badge_h = th + (badge_pad_y * 2) + baseline

                # Position badge: above box if space permits, else inside top of box
                if y1 - badge_h - 2 >= 0:
                    bx1 = x1
                    by1 = y1 - badge_h - 2
                    bx2 = min(width - 1, bx1 + badge_w)
                    by2 = y1 - 2
                else:
                    bx1 = x1
                    by1 = y1 + 1
                    bx2 = min(width - 1, bx1 + badge_w)
                    by2 = min(height - 1, y1 + 1 + badge_h)

                # Dark obsidian slate background: (22, 26, 35) in BGR
                cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (22, 26, 35), -1)
                # Subtle border around badge
                cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (55, 65, 81), 1, cv2.LINE_AA)
                # Left track-colored accent bar (3px)
                cv2.rectangle(annotated_frame, (bx1, by1), (bx1 + 3, by2), t_color, -1)
                # Crisp white text with LINE_AA
                text_x = bx1 + 8
                text_y = by1 + badge_pad_y + th
                cv2.putText(annotated_frame, badge_text, (text_x, text_y), font, font_scale, (255, 255, 255), font_thick, cv2.LINE_AA)

            out_writer.write(annotated_frame)
            frame_idx += 1

        cap.release()
        out_writer.release()

        if was_cancelled:
            return {
                "cancelled": True,
                "total_frames": total_frames,
                "processed_frames": frame_idx,
                "detections": [],
                "tracking_events": [],
                "face_crops": [],
                "output_video_path": output_path
            }

        # Finalize Tracking Events List
        final_tracking_events = []
        for t_id, data in track_aggregates.items():
            crop_info = best_track_crops.get(t_id)
            class_counts = data.get("class_counts", {})
            if class_counts:
                # Prioritize 'person' if detected as person in >= 20% of detections
                if class_counts.get("person", 0) / max(1, data["total_detections"]) >= 0.20:
                    consensus_class = "person"
                else:
                    consensus_class = max(class_counts.items(), key=lambda x: x[1])[0]
            else:
                consensus_class = data["class_name"]

            final_tracking_events.append({
                "track_id": t_id,
                "class_name": consensus_class,
                "start_frame": data["start_frame"],
                "end_frame": data["end_frame"],
                "start_time_offset": data["start_time_offset"],
                "end_time_offset": data["end_time_offset"],
                "total_detections": data["total_detections"],
                "avg_confidence": round(data["conf_sum"] / max(1, data["total_detections"]), 3),
                "bbox_trajectory": json.dumps(data["trajectory"]),
                "thumbnail_path": crop_info["path"] if crop_info else None
            })

        logger.info(f"AI Video Tracking finished: {len(detections)} detections, {len(final_tracking_events)} persistent tracks across {frame_idx} frames.")
        return {
            "total_frames": total_frames,
            "processed_frames": frame_idx,
            "detections": detections,
            "tracking_events": final_tracking_events,
            "face_crops": face_crops,
            "output_video_path": output_path
        }

ai_engine_instance = AIEngine()

