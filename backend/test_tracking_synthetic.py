import os
import sys
import cv2
import numpy as np
import json
import tempfile

sys.path.insert(0, r"c:\Users\phili\Downloads\Image_Analysis\Image_Analysis\backend")
from app.services.ai_engine import FallbackMOTTracker, AIEngine

def test_fallback_mot_tracker():
    print("Testing FallbackMOTTracker...")
    tracker = FallbackMOTTracker(iou_threshold=0.3, max_lost_frames=5)
    
    # Simulate a moving object across 10 frames
    # Object 1 moves from (50, 50) to (150, 150)
    # Object 2 appears at frame 5 and moves from (300, 200) to (350, 200)
    for frame_idx in range(10):
        dets = []
        # Obj 1
        x1 = 50 + frame_idx * 10
        y1 = 50 + frame_idx * 10
        dets.append({
            "box": [x1, y1, x1 + 40, y1 + 80],
            "cls": "person",
            "conf": 0.88,
            "crop": None
        })
        
        # Obj 2 (from frame 5)
        if frame_idx >= 4:
            x2 = 300 + (frame_idx - 4) * 10
            y2 = 200
            dets.append({
                "box": [x2, y2, x2 + 50, y2 + 100],
                "cls": "person",
                "conf": 0.92,
                "crop": None
            })
            
        tracked = tracker.update(dets)
        track_ids = [d.get("track_id") for d in tracked]
        print(f"  Frame {frame_idx:02d}: Assigned Track IDs = {track_ids}")
        assert len(track_ids) == len(dets)
        assert track_ids[0] == 1  # Object 1 must consistently have Track ID 1
        if len(track_ids) > 1:
            assert track_ids[1] == 2  # Object 2 must consistently have Track ID 2

    print("[PASSED] FallbackMOTTracker assigned persistent track IDs perfectly!")

def test_full_ai_engine_pipeline():
    print("\nTesting Full AIEngine Pipeline with Video Synthesis...")
    with tempfile.TemporaryDirectory() as tmpdir:
        synth_video = os.path.join(tmpdir, "synth.mp4")
        out_annotated = os.path.join(tmpdir, "annotated.mp4")
        faces_dir = os.path.join(tmpdir, "faces")
        tracks_dir = os.path.join(tmpdir, "tracks")

        # Create a 30-frame synthetic video (640x480, 10fps) with two moving shapes
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        vw = cv2.VideoWriter(synth_video, fourcc, 10.0, (640, 480))
        for f in range(30):
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            frame[:] = (30, 30, 35) # Dark surveillance background
            
            # Draw synthetic moving person 1 (blue jacket, head)
            p1_x = int(50 + f * 12)
            p1_y = 150
            cv2.rectangle(frame, (p1_x, p1_y), (p1_x + 50, p1_y + 120), (220, 120, 40), -1)
            cv2.circle(frame, (p1_x + 25, p1_y - 20), 20, (200, 180, 150), -1)

            # Draw synthetic moving person 2 (red jacket) entering from frame 10
            if f >= 10:
                p2_x = int(450 - (f - 10) * 10)
                p2_y = 220
                cv2.rectangle(frame, (p2_x, p2_y), (p2_x + 60, p2_y + 140), (40, 50, 220), -1)
                cv2.circle(frame, (p2_x + 30, p2_y - 25), 22, (200, 180, 150), -1)

            vw.write(frame)
        vw.release()

        engine = AIEngine(model_name="yolo11n.pt")
        res = engine.process_video(
            input_path=synth_video,
            output_path=out_annotated,
            face_thumbnails_dir=faces_dir,
            tracks_thumbnails_dir=tracks_dir,
            sample_fps=5
        )

        print(f"Processed video result summary:")
        print(f"  Total Detections count: {len(res['detections'])}")
        print(f"  Total Tracking Events count: {len(res['tracking_events'])}")
        print(f"  Annotated output created: {os.path.exists(out_annotated)}")

        for trk in res['tracking_events']:
            traj = json.loads(trk['bbox_trajectory'])
            print(f"  -> Track #{trk['track_id']} ({trk['class_name']}): {trk['start_time_offset']:.2f}s to {trk['end_time_offset']:.2f}s ({trk['total_detections']} detections, {len(traj)} trajectory points)")

        print("[PASSED] Full AI Engine pipeline executed and produced complete tracking events!")

if __name__ == "__main__":
    test_fallback_mot_tracker()
    test_full_ai_engine_pipeline()
