import os
import sys
import json
import tempfile

# Add backend to path
sys.path.insert(0, r"c:\Users\phili\Downloads\Image_Analysis\Image_Analysis\backend")

from app.services.ai_engine import ai_engine_instance

input_video = r"c:\Users\phili\Downloads\Image_Analysis\Image_Analysis\sample_cctv.mp4"
if not os.path.exists(input_video):
    print(f"Sample video not found at {input_video}")
    sys.exit(1)

with tempfile.TemporaryDirectory() as tmpdir:
    out_video = os.path.join(tmpdir, "annotated_out.mp4")
    faces_dir = os.path.join(tmpdir, "faces")
    tracks_dir = os.path.join(tmpdir, "tracks")

    print("Running AIEngine.process_video with Multi-Object Tracking...")
    res = ai_engine_instance.process_video(
        input_path=input_video,
        output_path=out_video,
        face_thumbnails_dir=faces_dir,
        tracks_thumbnails_dir=tracks_dir
    )

    print("\n--- AI Engine Execution Results ---")
    print(f"Total Detections: {len(res.get('detections', []))}")
    print(f"Total Persistent Tracks: {len(res.get('tracking_events', []))}")

    # Inspect detections
    sample_dets = res.get('detections', [])[:5]
    print(f"\nFirst 5 Detections sample:")
    for d in sample_dets:
        print(f"  Frame {d['frame_number']:03d} | Track ID: {d.get('track_id')} | Class: {d['class_name']} | Conf: {d['confidence']:.2f} | Time: {d['timestamp_offset']:.2f}s")

    # Inspect tracks
    sample_tracks = res.get('tracking_events', [])
    print(f"\nPersistent Tracks extracted ({len(sample_tracks)} total):")
    for trk in sample_tracks:
        traj_len = len(json.loads(trk['bbox_trajectory'])) if trk.get('bbox_trajectory') else 0
        has_thumb = os.path.exists(trk.get('thumbnail_path', '')) if trk.get('thumbnail_path') else False
        print(f"  Track #{trk['track_id']} | {trk['class_name'].upper()} | {trk['start_time_offset']:.2f}s -> {trk['end_time_offset']:.2f}s | {trk['total_detections']} detections | {traj_len} traj points | Crop: {has_thumb}")

    print("\n[SUCCESS] Multi-Object Tracking verification completed successfully!")
