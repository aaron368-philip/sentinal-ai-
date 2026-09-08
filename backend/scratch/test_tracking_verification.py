import os
import sys
import cv2

# Set path to backend
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)

from app.services.ai_engine import AIEngine
from app.services.video_service import merge_fragmented_tracks

video_path = os.path.join(backend_dir, "storage", "raw_videos", "Shopcam_20260907_064903_Video_Project_1.mp4")
out_test_dir = os.path.join(backend_dir, "scratch", "test_output")
os.makedirs(out_test_dir, exist_ok=True)

test_annotated_mp4 = os.path.join(out_test_dir, "test_annotated.mp4")
test_faces_dir = os.path.join(out_test_dir, "faces")
test_crops_dir = os.path.join(out_test_dir, "crops")

print(f"Testing video: {video_path}")
print(f"File exists: {os.path.exists(video_path)}")

engine = AIEngine()

# Run a test with sample_fps=3 on the video
print("\n--- RUN 1: Processing Video ---")
res1 = engine.process_video(
    input_path=video_path,
    output_path=test_annotated_mp4,
    face_thumbnails_dir=test_faces_dir,
    tracks_thumbnails_dir=test_crops_dir,
    sample_fps=3,
    confidence_threshold=0.20,
    person_confidence=0.15,
    model_name="yolo11n.pt"  # fast test
)

tracks1 = res1.get("tracking_events", [])
print(f"Total tracking events in Run 1: {len(tracks1)}")
track_ids_run1 = [t["track_id"] for t in tracks1]
print(f"Track IDs in Run 1: {sorted(track_ids_run1)}")

# Test post-processing merge
res1_merged = merge_fragmented_tracks(res1)
tracks1_merged = res1_merged.get("tracking_events", [])
print(f"Total tracking events after merge_fragmented_tracks: {len(tracks1_merged)}")
merged_ids = [t["track_id"] for t in tracks1_merged]
print(f"Track IDs after merge: {sorted(merged_ids)}")

# Person tracks should NEVER be merged away
person_tracks = [t for t in tracks1 if t.get("class_name") == "person"]
person_tracks_merged = [t for t in tracks1_merged if t.get("class_name") == "person"]
print(f"Person tracks before merge: {len(person_tracks)}, after merge: {len(person_tracks_merged)}")
assert len(person_tracks) == len(person_tracks_merged), "Error: Person tracks were collapsed by merge_fragmented_tracks!"

# Verify that no detection has track_id = None
all_dets = res1.get("detections", [])
none_track_dets = [d for d in all_dets if d.get("track_id") is None]
print(f"Total detections: {len(all_dets)}, Detections with track_id=None: {len(none_track_dets)}")
assert len(none_track_dets) == 0, "Error: Found detections with track_id=None!"

# Verify min track ID is 1
if track_ids_run1:
    print(f"Min track ID in Run 1: {min(track_ids_run1)}")
    assert min(track_ids_run1) == 1, f"Expected min track ID to start at 1, got {min(track_ids_run1)}"

print("\n--- RUN 2: Verifying Tracker Reset ---")
out_test_mp4_2 = os.path.join(out_test_dir, "test_annotated_2.mp4")
res2 = engine.process_video(
    input_path=video_path,
    output_path=out_test_mp4_2,
    face_thumbnails_dir=test_faces_dir,
    tracks_thumbnails_dir=test_crops_dir,
    sample_fps=3,
    confidence_threshold=0.20,
    person_confidence=0.15,
    model_name="yolo11n.pt"
)
tracks2 = res2.get("tracking_events", [])
track_ids_run2 = [t["track_id"] for t in tracks2]
print(f"Track IDs in Run 2: {sorted(track_ids_run2)}")
if track_ids_run2:
    print(f"Min track ID in Run 2: {min(track_ids_run2)}")
    assert min(track_ids_run2) == 1, f"Tracker reset failed! Run 2 started at ID {min(track_ids_run2)}"

print("\nALL TRACKING & MERGING VERIFICATION TESTS PASSED SUCCESSFULLY!")
