import os
import json
import logging
import cv2
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Try importing PyTorch & TorchVision
TORCH_AVAILABLE = False
try:
    import torch
    import torch.nn as nn
    import torchvision.transforms as T
    from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
    TORCH_AVAILABLE = True
except ImportError:
    logger.warning("PyTorch/TorchVision not available for Re-ID; fallback color-spatial descriptor will be used.")


class ReIDFeatureExtractor:
    """
    Deep Person Re-Identification appearance embedding extractor.
    Combines deep CNN representations (PyTorch MobileNetV3 / ResNet) with
    spatial color-histogram descriptors (HSV + RGB parts) for illumination & pose robustness.
    Produces a 512-dimensional L2-normalized feature vector.
    """
    def __init__(self):
        self.device = "cpu"
        self.model = None
        self.transform = None
        self.dim = 512

        if TORCH_AVAILABLE:
            try:
                # Load lightweight MobileNetV3 Small feature extractor backbone
                try:
                    weights = MobileNet_V3_Small_Weights.DEFAULT
                    base_model = mobilenet_v3_small(weights=weights)
                except Exception:
                    base_model = mobilenet_v3_small(weights=None)

                # Strip classification head, extract 576-d or 1024-d pooled features
                self.model = nn.Sequential(
                    base_model.features,
                    base_model.avgpool,
                    nn.Flatten()
                )
                self.model.eval()

                self.transform = T.Compose([
                    T.ToPILImage(),
                    T.Resize((224, 112)),  # Standard Re-ID aspect ratio 2:1 (height:width)
                    T.ToTensor(),
                    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
                ])
                logger.info("Initialized PyTorch Re-ID Deep Feature Extractor.")
            except Exception as e:
                logger.warning(f"Could not load PyTorch Re-ID model: {e}. Using spatial-color fallback.")
                self.model = None

    def extract_from_crop(self, img_bgr: np.ndarray) -> List[float]:
        """
        Extracts 512-dimensional normalized embedding from a BGR image crop.
        """
        if img_bgr is None or img_bgr.size == 0:
            return [0.0] * self.dim

        h, w = img_bgr.shape[:2]
        if h < 10 or w < 10:
            return [0.0] * self.dim

        features = []

        # 1. Deep CNN feature pass (if PyTorch model active)
        if self.model is not None:
            try:
                img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                tensor = self.transform(img_rgb).unsqueeze(0).to(self.device)
                with torch.no_grad():
                    deep_feat = self.model(tensor).squeeze(0).cpu().numpy()
                # Reduce or project to 256 dimensions
                if len(deep_feat) >= 256:
                    # Spatial averaging or stride sampling to 256
                    step = len(deep_feat) / 256.0
                    sampled_deep = [float(deep_feat[int(i * step)]) for i in range(256)]
                else:
                    sampled_deep = list(map(float, deep_feat)) + [0.0] * (256 - len(deep_feat))
                features.extend(sampled_deep[:256])
            except Exception as e:
                logger.warning(f"Error during deep feature extraction: {e}")
                features.extend([0.0] * 256)
        else:
            features.extend([0.0] * 256)

        # 2. Multi-part Spatial Color Descriptor (Head/Torso/Legs HSV & Lab histograms)
        # Standard Person Re-ID vertical partitioning: Top (Head/Hat), Mid (Torso/Shirt), Bottom (Pants/Legs)
        part_h = h // 3
        parts = [
            img_bgr[0:part_h, :],              # Top
            img_bgr[part_h:2*part_h, :],        # Mid
            img_bgr[2*part_h:, :]               # Bottom
        ]

        color_features = []
        for part in parts:
            if part.size == 0:
                color_features.extend([0.0] * 64)
                continue

            hsv = cv2.cvtColor(part, cv2.COLOR_BGR2HSV)
            # 16 bins for Hue, 8 bins for Saturation, 8 bins for Value
            hist_h = cv2.calcHist([hsv], [0], None, [16], [0, 180])
            hist_s = cv2.calcHist([hsv], [1], None, [8], [0, 256])
            hist_v = cv2.calcHist([hsv], [2], None, [8], [0, 256])

            # Lab color space (L, a, b)
            lab = cv2.cvtColor(part, cv2.COLOR_BGR2Lab)
            hist_a = cv2.calcHist([lab], [1], None, [16], [0, 256])
            hist_b = cv2.calcHist([lab], [2], None, [16], [0, 256])

            part_vector = np.concatenate([
                hist_h.flatten(), hist_s.flatten(), hist_v.flatten(),
                hist_a.flatten(), hist_b.flatten()
            ])
            norm = np.linalg.norm(part_vector)
            if norm > 0:
                part_vector = part_vector / norm
            color_features.extend(part_vector[:64].tolist())

        # Pad or trim color features to 256 elements
        if len(color_features) < 256:
            color_features.extend([0.0] * (256 - len(color_features)))
        features.extend(color_features[:256])

        # Ensure total length is exactly self.dim (512)
        if len(features) < self.dim:
            features.extend([0.0] * (self.dim - len(features)))
        features = np.array(features[:self.dim], dtype=np.float32)

        # L2-normalize overall combined feature vector
        norm = np.linalg.norm(features)
        if norm > 1e-6:
            features = features / norm

        return features.tolist()

    def extract_from_file(self, file_path: str) -> Optional[List[float]]:
        if not file_path or not os.path.exists(file_path):
            return None
        img = cv2.imread(file_path)
        if img is None:
            return None
        return self.extract_from_crop(img)


# Singleton feature extractor instance
reid_extractor = ReIDFeatureExtractor()


class ReIDService:
    @staticmethod
    def cosine_similarity(emb1: List[float], emb2: List[float]) -> float:
        """Calculate cosine similarity between two normalized embedding vectors."""
        if not emb1 or not emb2 or len(emb1) != len(emb2):
            return 0.0
        v1 = np.array(emb1, dtype=np.float32)
        v2 = np.array(emb2, dtype=np.float32)
        dot = float(np.dot(v1, v2))
        norm1 = float(np.linalg.norm(v1))
        norm2 = float(np.linalg.norm(v2))
        if norm1 < 1e-6 or norm2 < 1e-6:
            return 0.0
        cos_sim = dot / (norm1 * norm2)
        # Normalize from [-1, 1] to [0, 1] range
        return max(0.0, min(1.0, (cos_sim + 1.0) / 2.0))

    @staticmethod
    def calculate_spatiotemporal_feasibility(
        cam1_pos: Tuple[float, float],
        cam2_pos: Tuple[float, float],
        cam1_time: Optional[datetime],
        cam2_time: Optional[datetime],
        are_connected: bool = False
    ) -> Dict[str, Any]:
        """
        Evaluates physical feasibility for a person moving from Cam1 to Cam2.
        - Checks chronological order
        - Checks distance / transition duration
        - Returns feasibility multiplier (0.0 to 1.0) and explanation
        """
        # If positions or times are unknown, default to neutral feasibility
        if cam1_time is None or cam2_time is None:
            return {
                "feasible": True,
                "score_multiplier": 1.0,
                "time_delta_seconds": None,
                "distance_units": None,
                "reason": "Temporal timestamp metadata not available"
            }

        delta_sec = (cam2_time - cam1_time).total_seconds()

        # Same camera check
        if cam1_pos == cam2_pos:
            return {
                "feasible": True,
                "score_multiplier": 1.0,
                "time_delta_seconds": delta_sec,
                "distance_units": 0.0,
                "reason": "Same camera node"
            }

        # Calculate relative blueprint distance (0-100 scale)
        dx = cam2_pos[0] - cam1_pos[0]
        dy = cam2_pos[1] - cam1_pos[1]
        dist = np.sqrt(dx * dx + dy * dy)

        # If Cam2 occurs before Cam1, negative time delta
        if delta_sec < -5.0:  # Allow 5s clock tolerance
            return {
                "feasible": False,
                "score_multiplier": 0.3,
                "time_delta_seconds": delta_sec,
                "distance_units": round(dist, 2),
                "reason": f"Temporal contradiction: Sighting 2 occurred {abs(delta_sec):.1f}s before Sighting 1"
            }

        # If instant teleportation across large distance (e.g. 50 units in < 2 seconds)
        if dist > 30.0 and abs(delta_sec) < 3.0:
            return {
                "feasible": False,
                "score_multiplier": 0.4,
                "time_delta_seconds": delta_sec,
                "distance_units": round(dist, 2),
                "reason": f"Physical transit speed infeasible ({dist:.1f} units in {abs(delta_sec):.1f}s)"
            }

        # Connected adjacent cameras get higher confidence boost
        multiplier = 1.0
        if are_connected:
            multiplier = 1.05

        return {
            "feasible": True,
            "score_multiplier": min(1.0, multiplier),
            "time_delta_seconds": round(delta_sec, 2),
            "distance_units": round(dist, 2),
            "reason": f"Consistent spatiotemporal trajectory (transit {delta_sec:.1f}s, distance {dist:.1f}%)"
        }

    @staticmethod
    def match_track_across_cameras(
        source_track_id: str,
        db: Any,
        min_similarity: float = 0.55,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Finds matching appearances of a track across all other camera video feeds.
        """
        from app.models.tracking import TrackingEvent
        from app.models.camera import Camera
        from app.models.camera_connection import CameraConnection

        source_event = db.query(TrackingEvent).filter(TrackingEvent.id == source_track_id).first()
        if not source_event:
            return {"error": "Source track not found", "matches": []}

        source_emb = None
        if source_event.reid_embedding:
            try:
                source_emb = json.loads(source_event.reid_embedding)
            except Exception:
                source_emb = None

        # If embedding not saved yet, extract on the fly from thumbnail
        if source_emb is None and source_event.thumbnail_path and os.path.exists(source_event.thumbnail_path):
            source_emb = reid_extractor.extract_from_file(source_event.thumbnail_path)
            if source_emb:
                source_event.reid_embedding = json.dumps(source_emb)
                db.commit()

        if not source_emb:
            return {"error": "No appearance embedding available for source track", "matches": []}

        # Query other tracking events (different camera or different video)
        candidate_events = db.query(TrackingEvent).filter(
            TrackingEvent.id != source_event.id,
            TrackingEvent.class_name == source_event.class_name
        ).all()

        source_camera = db.query(Camera).filter(Camera.id == source_event.camera_id).first()
        source_cam_pos = (source_camera.position_x or 50.0, source_camera.position_y or 50.0) if source_camera else (50.0, 50.0)

        # Get connected camera IDs
        connections = db.query(CameraConnection).filter(
            (CameraConnection.source_camera_id == source_event.camera_id) |
            (CameraConnection.target_camera_id == source_event.camera_id)
        ).all()
        connected_cam_ids = set()
        for conn in connections:
            connected_cam_ids.add(conn.source_camera_id)
            connected_cam_ids.add(conn.target_camera_id)

        matches = []
        for cand in candidate_events:
            cand_emb = None
            if cand.reid_embedding:
                try:
                    cand_emb = json.loads(cand.reid_embedding)
                except Exception:
                    cand_emb = None

            if cand_emb is None and cand.thumbnail_path and os.path.exists(cand.thumbnail_path):
                cand_emb = reid_extractor.extract_from_file(cand.thumbnail_path)
                if cand_emb:
                    cand.reid_embedding = json.dumps(cand_emb)
                    db.commit()

            if not cand_emb:
                continue

            # Visual Cosine Similarity
            cos_sim = ReIDService.cosine_similarity(source_emb, cand_emb)
            if cos_sim < min_similarity:
                continue

            cand_camera = db.query(Camera).filter(Camera.id == cand.camera_id).first()
            cand_cam_pos = (cand_camera.position_x or 50.0, cand_camera.position_y or 50.0) if cand_camera else (50.0, 50.0)
            are_conn = cand.camera_id in connected_cam_ids

            # Spatiotemporal Feasibility
            st_check = ReIDService.calculate_spatiotemporal_feasibility(
                source_cam_pos,
                cand_cam_pos,
                source_event.real_world_start_time,
                cand.real_world_start_time,
                are_connected=are_conn
            )

            final_score = cos_sim * st_check["score_multiplier"]

            thumbnail_url = None
            if cand.thumbnail_path and os.path.exists(cand.thumbnail_path):
                filename = os.path.basename(cand.thumbnail_path)
                thumbnail_url = f"/api/v1/tracking/thumbnails/{cand.video_id}/{filename}"

            matches.append({
                "track_event_id": cand.id,
                "video_id": cand.video_id,
                "camera_id": cand.camera_id,
                "camera_code": cand_camera.camera_code if cand_camera else "UNKNOWN",
                "camera_name": cand_camera.name if cand_camera else "Unknown Node",
                "area_zone": cand_camera.area_zone if cand_camera else "Surveillance Zone",
                "track_id": cand.track_id,
                "class_name": cand.class_name,
                "similarity_score": round(cos_sim, 4),
                "spatiotemporal_score": round(st_check["score_multiplier"], 3),
                "composite_confidence": round(final_score, 4),
                "is_feasible": st_check["feasible"],
                "feasibility_reason": st_check["reason"],
                "time_delta_seconds": st_check["time_delta_seconds"],
                "start_time_offset": cand.start_time_offset,
                "end_time_offset": cand.end_time_offset,
                "real_world_start_time": cand.real_world_start_time.isoformat() if cand.real_world_start_time else None,
                "real_world_end_time": cand.real_world_end_time.isoformat() if cand.real_world_end_time else None,
                "thumbnail_url": thumbnail_url,
                "position_x": cand_cam_pos[0],
                "position_y": cand_cam_pos[1]
            })

        # Sort matches by composite confidence descending
        matches.sort(key=lambda x: x["composite_confidence"], reverse=True)

        source_thumb_url = None
        if source_event.thumbnail_path and os.path.exists(source_event.thumbnail_path):
            filename = os.path.basename(source_event.thumbnail_path)
            source_thumb_url = f"/api/v1/tracking/thumbnails/{source_event.video_id}/{filename}"

        return {
            "source_track": {
                "id": source_event.id,
                "track_id": source_event.track_id,
                "video_id": source_event.video_id,
                "camera_id": source_event.camera_id,
                "camera_code": source_camera.camera_code if source_camera else "UNKNOWN",
                "camera_name": source_camera.name if source_camera else "Unknown Node",
                "area_zone": source_camera.area_zone if source_camera else "Surveillance Zone",
                "real_world_start_time": source_event.real_world_start_time.isoformat() if source_event.real_world_start_time else None,
                "thumbnail_url": source_thumb_url,
                "position_x": source_cam_pos[0],
                "position_y": source_cam_pos[1]
            },
            "total_matches": len(matches),
            "matches": matches[:limit]
        }
