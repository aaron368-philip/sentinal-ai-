import requests

cams = requests.get('http://127.0.0.1:8000/api/v1/cameras').json()
print(f"Total cameras registered: {len(cams)}")
for c in cams:
    print(f" - {c['camera_code']}: {c['name']} (id={c['id']})")

cam1 = cams[0]['id']
cam2 = cams[1]['id']

# 1. Single Camera 1
r1 = requests.post('http://127.0.0.1:8000/api/v1/ai-search/describe', json={'description': 'person', 'camera_ids': [cam1]}).json()
sightings1 = r1.get('sighting_logs', [])
cam_ids1 = set(x['camera_id'] for x in sightings1)
print(f"\nSingle Cam 1 Search: {len(sightings1)} sightings, unique camera IDs: {cam_ids1}")
assert all(cid == cam1 for cid in cam_ids1), "Error: found sightings outside cam1!"

# 2. Multiple Cameras (Cam 1 + Cam 2)
r2 = requests.post('http://127.0.0.1:8000/api/v1/ai-search/describe', json={'description': 'person', 'camera_ids': [cam1, cam2]}).json()
sightings2 = r2.get('sighting_logs', [])
cam_ids2 = set(x['camera_id'] for x in sightings2)
print(f"Multi-Cam (Cam 1 + Cam 2) Search: {len(sightings2)} sightings, unique camera IDs: {cam_ids2}")
assert all(cid in [cam1, cam2] for cid in cam_ids2), "Error: found sightings outside selected cams!"

# 3. Object Class Search with single / multi cam
r3 = requests.post('http://127.0.0.1:8000/api/v1/ai-search/attribute', json={'object_class': 'person', 'camera_ids': [cam1]}).json()
dets1 = r3.get('results', [])
det_cams1 = set(x['camera_id'] for x in dets1)
print(f"Attribute Search Single Cam 1: {len(dets1)} detections, unique camera IDs: {det_cams1}")
assert all(cid == cam1 for cid in det_cams1), "Error: found detections outside cam1!"

print("\nALL MULTI-CAMERA FILTER TESTS PASSED SUCCESSFULLY!")
