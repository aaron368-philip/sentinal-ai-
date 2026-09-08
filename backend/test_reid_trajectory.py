import os
import sys
import json
import numpy as np
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal, engine, Base
from app.models.camera import Camera
from app.models.video import Video
from app.models.tracking import TrackingEvent
from app.models.subject import Subject
from app.models.case import Case
from app.services.reid_service import reid_extractor, ReIDService
from app.services.trajectory_service import TrajectoryService


def run_tests():
    print("========================================")
    print("SENTINEL AI - RE-ID & TRAJECTORY TESTS")
    print("========================================")

    # 1. Test Feature Extraction
    print("\n[TEST 1] Testing Re-ID Feature Extractor...")
    dummy_crop = np.random.randint(0, 255, (120, 60, 3), dtype=np.uint8)
    emb1 = reid_extractor.extract_from_crop(dummy_crop)
    assert len(emb1) == 512, f"Expected 512-dim embedding, got {len(emb1)}"
    norm1 = np.linalg.norm(emb1)
    print(f"-> Extracted embedding 1: {len(emb1)} dims, L2-norm: {norm1:.4f}")
    assert abs(norm1 - 1.0) < 1e-3, "Embedding must be L2 normalized"

    # Perturbed crop should have high similarity
    perturbed_crop = np.clip(dummy_crop.astype(np.int32) + np.random.randint(-15, 15, dummy_crop.shape), 0, 255).astype(np.uint8)
    emb2 = reid_extractor.extract_from_crop(perturbed_crop)
    sim_same = ReIDService.cosine_similarity(emb1, emb2)
    print(f"-> Similarity between similar crops: {sim_same:.4f}")
    assert sim_same > 0.70, f"Expected high similarity for perturbed crop, got {sim_same}"

    # Random different crop
    diff_crop = np.random.randint(0, 255, (120, 60, 3), dtype=np.uint8)
    emb3 = reid_extractor.extract_from_crop(diff_crop)
    sim_diff = ReIDService.cosine_similarity(emb1, emb3)
    print(f"-> Similarity between different crops: {sim_diff:.4f}")
    print("[TEST 1 PASSED] Feature extraction & Cosine Similarity validated.")

    # 2. Test Spatiotemporal Feasibility
    print("\n[TEST 2] Testing Spatiotemporal Feasibility Filter...")
    t0 = datetime(2026, 8, 14, 10, 15, 0)
    t1 = datetime(2026, 8, 14, 10, 15, 45)  # 45s later
    t_backwards = datetime(2026, 8, 14, 10, 14, 0)  # 60s before

    st_ok = ReIDService.calculate_spatiotemporal_feasibility(
        cam1_pos=(20.0, 30.0),
        cam2_pos=(35.0, 45.0),
        cam1_time=t0,
        cam2_time=t1,
        are_connected=True
    )
    print("-> Forward transit check:", st_ok)
    assert st_ok["feasible"] is True

    st_bad = ReIDService.calculate_spatiotemporal_feasibility(
        cam1_pos=(20.0, 30.0),
        cam2_pos=(80.0, 90.0),
        cam1_time=t0,
        cam2_time=t_backwards,
        are_connected=False
    )
    print("-> Backward time transit check:", st_bad)
    assert st_bad["feasible"] is False
    print("[TEST 2 PASSED] Spatiotemporal feasibility checks validated.")

    # 3. Test Database Trajectory Reconstruction & Narrative Storyline
    print("\n[TEST 3] Testing Multi-Camera Trajectory Reconstruction & Narrative...")
    db = SessionLocal()
    try:
        # Create test cameras if needed
        cams = db.query(Camera).limit(3).all()
        if len(cams) < 2:
            print("Creating mock cameras for test...")
            cam1 = Camera(camera_code="CAM-TEST-01", name="West Wing Gate", position_x=20.0, position_y=30.0, area_zone="West Gate")
            cam2 = Camera(camera_code="CAM-TEST-02", name="Lobby Center", position_x=50.0, position_y=50.0, area_zone="Lobby")
            cam3 = Camera(camera_code="CAM-TEST-03", name="Server Vault", position_x=80.0, position_y=75.0, area_zone="Server Room")
            db.add_all([cam1, cam2, cam3])
            db.commit()
            cams = [cam1, cam2, cam3]

        # Create synthetic video
        test_vid1 = Video(
            camera_id=cams[0].id,
            filename="test_feed1.mp4",
            file_path="mock_path1.mp4",
            file_size_bytes=1024,
            sha256_hash="testhash1",
            duration_seconds=120.0,
            recording_start_datetime=t0
        )
        test_vid2 = Video(
            camera_id=cams[1].id,
            filename="test_feed2.mp4",
            file_path="mock_path2.mp4",
            file_size_bytes=1024,
            sha256_hash="testhash2",
            duration_seconds=120.0,
            recording_start_datetime=t0 + timedelta(seconds=60)
        )
        db.add_all([test_vid1, test_vid2])
        db.commit()

        # Create tracking events with embeddings
        trk1 = TrackingEvent(
            video_id=test_vid1.id,
            camera_id=cams[0].id,
            track_id=101,
            class_name="person",
            start_frame=0,
            end_frame=150,
            start_time_offset=5.0,
            end_time_offset=30.0,
            real_world_start_time=t0 + timedelta(seconds=5),
            real_world_end_time=t0 + timedelta(seconds=30),
            reid_embedding=json.dumps(emb1)
        )
        trk2 = TrackingEvent(
            video_id=test_vid2.id,
            camera_id=cams[1].id,
            track_id=202,
            class_name="person",
            start_frame=300,
            end_frame=450,
            start_time_offset=10.0,
            end_time_offset=45.0,
            real_world_start_time=t0 + timedelta(seconds=70),
            real_world_end_time=t0 + timedelta(seconds=105),
            reid_embedding=json.dumps(emb2)  # High similarity to emb1
        )
        db.add_all([trk1, trk2])
        db.commit()

        # Run Trajectory Reconstruction
        recon = TrajectoryService.reconstruct_trajectory_for_track(track_id=trk1.id, db=db, min_similarity=0.60)
        print("-> Reconstructed Trajectory Summary:")
        print(f"   Total Waypoints: {recon['total_waypoints']}")
        print(f"   Journey Duration: {recon['total_journey_formatted']}")
        print(f"   Dwell Time: {recon['total_dwell_formatted']}")
        print(f"   Transit Time: {recon['total_transit_formatted']}")
        print(f"   Narrative Title: {recon['narrative_report']['title']}")
        print(f"   Narrative Summary: {recon['narrative_report']['summary']}")
        for step in recon['narrative_report']['steps']:
            print(f"     Step {step['sequence']}: {step['description']}")

        assert recon['total_waypoints'] >= 2, "Expected at least 2 connected waypoints"
        assert len(recon['narrative_report']['steps']) >= 2, "Expected structured narrative steps"
        print("[TEST 3 PASSED] Trajectory reconstruction & automated narrative validated.")

    finally:
        # Clean up test artifacts from database
        try:
            db.query(TrackingEvent).filter(TrackingEvent.track_id.in_([101, 202])).delete()
            db.query(Video).filter(Video.filename.in_(["test_feed1.mp4", "test_feed2.mp4"])).delete()
            db.commit()
        except Exception:
            pass
        db.close()

    print("\n========================================")
    print("ALL RE-ID & TRAJECTORY TESTS PASSED 100%!")
    print("========================================")


if __name__ == "__main__":
    run_tests()
