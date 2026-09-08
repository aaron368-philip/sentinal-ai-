# SENTINEL AI — Complete Implementation & Changes Summary
**Date**: August 12, 2026  
**Project**: SENTINEL AI - CCTV Video Analytics Platform  
**Location**: `c:\Antigravity\Image_Analysis`

---

## 🌟 Executive Summary

SENTINEL AI is an AI-assisted CCTV video analytics and digital forensics platform built for real-time video stream ingestion, automated computer vision object detection (persons, vehicles, backpacks, faces), cross-camera spatial tracking, digital evidence vault management with SHA-256 chain-of-custody verification, and automated executive investigation reporting.

---

## 🏗️ Technology Stack

* **Frontend**: React 19, Vite, TailwindCSS (v4), Lucide Icons, Axios, React Router v7
* **Backend**: FastAPI (Python), SQLAlchemy ORM, SQLite database (`sentinel.db`), Uvicorn ASGI Server
* **AI & Computer Vision**: OpenCV, Ultralytics YOLO / OpenCV Haar Cascade Face Detection, video frame sampling, bounding box rendering, face crop extraction, SHA-256 evidence integrity hashing

---

## 🛠️ Key Implementation Highlights & Features Built

### 1. Building & Facility Management (New)
* **Registered Buildings**: Create, edit, list, and delete physical facilities/buildings (e.g. *Main Headquarters - Building A*, *North Campus Annex*).
* **Building Tabs**: Filter CCTV camera feeds and recordings by specific building zones.
* **Unassigned Node Handling**: Unassigned cameras can be dynamically assigned or re-assigned to any building.

### 2. Interactive Camera Spatial Arrangement & Management (New)
* **Inline Registration**: Add new camera nodes directly while uploading CCTV footage.
* **Camera Removal**: Delete unused or decommissioned camera nodes safely while retaining past video recordings in evidence logs.
* **Interactive Floorplan Grid**: Visual spatial preview mapping cameras onto building floorplan relative coordinates `(X, Y)`.
* **Manual Reordering & Sliders**: Adjust camera display ordering (`Move Up / Down`) and relative spatial positions `(0–100%)` via intuitive UI sliders.

### 3. Video Ingestion & Bounding Box Overlay
* Upload `.mp4`, `.avi`, `.mov`, `.mkv` files attached to camera nodes and timestamp metadata.
* OpenCV/YOLO video processor samples frames, detects target objects, draws color-coded bounding box overlays (`PERSON 85%`, `CAR 92%`), crops face thumbnails, and outputs an annotated MP4 video stream.

### 4. AI Search & Subject Vault
* Filter detections across all cameras by object class, confidence score, and timestamp.
* Face Vault: Register suspect/subject profiles and perform cross-camera facial matching against stored CCTV face crops.

### 5. Evidence Vault & Automated Reports
* Cryptographic SHA-256 hash calculation for video feeds and evidence items to guarantee legal chain-of-custody integrity.
* Auto-generate PDF/HTML executive investigation summary reports for linked cases.

---

## 🔧 Technical Fixes & Enhancements Made

1. **Breached Password Resolution & Security**:
   * Replaced breached default preset password with a high-entropy secure key: `S3nt1n3l#Analytics2026!Key`.
   * Updated database seeding in `backend/app/main.py` and frontend state in `frontend/src/pages/Login.jsx`.

2. **Python 3.14 / Passlib Compatibility Fix**:
   * Replaced outdated `passlib` with direct `bcrypt` hashing in `backend/app/core/security.py` to fix a Python 3.14 bcrypt initialization crash.

3. **Frontend Interceptor Glitch Fix**:
   * Modified Axios response interceptor in `frontend/src/services/api.js` to prevent full page reloads during failed login attempts.

4. **OpenCV Version Pinning**:
   * Pinned `opencv-python==4.10.0.84` in the backend environment to resolve a `CascadeClassifier` missing module error in OpenCV 5.x previews.

---

## 📁 Key File Structure & Architecture

```
Image_Analysis/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── buildings.py      # Building CRUD API
│   │   │   ├── cameras.py        # Camera CRUD & Spatial Reorder API
│   │   │   ├── videos.py         # Video upload, streaming & AI endpoints
│   │   │   ├── auth.py           # JWT Authentication API
│   │   │   ├── ai_search.py      # Attribute search API
│   │   │   ├── cases.py          # Investigation cases API
│   │   │   ├── evidence.py       # Evidence vault API
│   │   │   ├── reports.py        # Automated reports API
│   │   │   └── subjects.py       # Subject vault API
│   │   ├── core/
│   │   │   ├── database.py       # SQLAlchemy engine
│   │   │   └── security.py       # Direct bcrypt password hashing & JWT
│   │   ├── models/
│   │   │   ├── building.py       # Building model
│   │   │   ├── camera.py         # Camera model (with building_id, position_x/y, display_order)
│   │   │   ├── video.py          # Video model
│   │   │   ├── detection.py      # Object detection model
│   │   │   └── ...
│   │   ├── schemas/
│   │   │   ├── building.py       # Building Pydantic schemas
│   │   │   ├── camera.py         # Camera & Position Update schemas
│   │   │   └── ...
│   │   └── services/
│   │       └── ai_engine.py      # OpenCV / YOLO video processing engine
│   └── main.py                   # FastAPI application initialization & DB seeding
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── CCTVMonitoring.jsx # Main CCTV matrix, building tabs, camera arrange & upload modal
    │   │   ├── AISearch.jsx       # Cross-camera attribute search
    │   │   ├── Subjects.jsx       # Suspect vault & face matching
    │   │   ├── EvidenceVault.jsx  # Evidence integrity verification
    │   │   ├── Investigations.jsx # Case management
    │   │   ├── Reports.jsx        # Executive report generator
    │   │   └── Login.jsx          # Login screen
    │   └── services/
    │       └── api.js             # Axios API client (buildingsAPI, camerasAPI, etc.)
    └── vite.config.js             # Vite configuration (port 3000, proxy to 8000)
```

---

## 🔑 Login Credentials

* **Username**: `admin`
* **Password**: `S3nt1n3l#Analytics2026!Key`

---

## 🚀 How to Run the Project

### Terminal 1 (Backend):
```powershell
cd c:\Antigravity\Image_Analysis\backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Terminal 2 (Frontend):
```powershell
cd c:\Antigravity\Image_Analysis\frontend
npm run dev
```

### Web URLs:
* **Frontend Application**: [http://localhost:3000](http://localhost:3000)
* **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
