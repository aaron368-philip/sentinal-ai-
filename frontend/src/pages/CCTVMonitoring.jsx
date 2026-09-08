import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Video, Upload, Shield, Play, Loader2, RefreshCw, AlertCircle, Sparkles,
  CheckCircle2, Eye, X, Film, Camera, Building2, Trash2, GripVertical,
  ChevronUp, ChevronDown, Plus, MapPin, Settings, Edit3, Layers, Compass, Image as ImageIcon, Clock, Calendar,
  Activity, Target, UserCheck, FastForward, PlayCircle, Filter, Navigation, Route, Square, StopCircle
} from 'lucide-react';
import { camerasAPI, videosAPI, buildingsAPI, floorsAPI, trackingAPI } from '../services/api';
import BuildingRegistrationWizard from '../components/building/BuildingRegistrationWizard';
import FloorPlanEditor from '../components/building/FloorPlanEditor';
import SpatialTrajectoryViewer from '../components/SpatialTrajectoryViewer';


// Angle helper to get compass direction string
function getCompassDirection(angle) {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized >= 337.5 || normalized < 22.5) return 'N';
  if (normalized >= 22.5 && normalized < 67.5) return 'NE';
  if (normalized >= 67.5 && normalized < 112.5) return 'E';
  if (normalized >= 112.5 && normalized < 157.5) return 'SE';
  if (normalized >= 157.5 && normalized < 202.5) return 'S';
  if (normalized >= 202.5 && normalized < 247.5) return 'SW';
  if (normalized >= 247.5 && normalized < 292.5) return 'W';
  return 'NW';
}

const COMMON_TIMEZONES = [
  'Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Dubai'
];

// Helper to format seconds as HH:MM:SS
function formatRelativeTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Upload Video Modal ────────────────────────────────────────────────────────
function UploadVideoModal({ cameras, buildings, onClose, onUploaded }) {
  const [selectedCamera, setSelectedCamera] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState(null);

  // Controlled Temporal Metadata State
  const [timestampSource, setTimestampSource] = useState('USER_PROVIDED'); // USER_PROVIDED, VIDEO_OVERLAY, UNKNOWN, FILE_METADATA
  const [recordingDate, setRecordingDate] = useState(new Date().toISOString().slice(0, 10));
  const [recordingStartTime, setRecordingStartTime] = useState('14:00:00');
  const [recordingTimezone, setRecordingTimezone] = useState('Asia/Kolkata');
  const [useFileCreationTime, setUseFileCreationTime] = useState(false);

  // Detected File Creation Metadata Probe Result
  const [probedMetadata, setProbedMetadata] = useState(null);
  const [showMetadataBanner, setShowMetadataBanner] = useState(false);

  // Camera Registration Inline
  const [isCreatingCam, setIsCreatingCam] = useState(false);
  const [newCamCode, setNewCamCode] = useState('');
  const [newCamName, setNewCamName] = useState('');
  const [newCamDesc, setNewCamDesc] = useState('');
  const [newCamBuildingId, setNewCamBuildingId] = useState('');

  // Handle File Probe on Selection
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setProbedMetadata(null);
    setShowMetadataBanner(false);

    // Probe file metadata from backend
    setProbing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await videosAPI.probeMetadata(formData);
      if (res.data) {
        setProbedMetadata(res.data);
        if (res.data.detected_file_creation_time) {
          setShowMetadataBanner(true);
        }
      }
    } catch (err) {
      console.warn('Metadata probe error:', err);
    } finally {
      setProbing(false);
    }
  };

  // User accepts detected file creation time
  const handleUseFileCreationTime = () => {
    if (!probedMetadata?.detected_file_creation_time) return;
    const dt = new Date(probedMetadata.detected_file_creation_time);
    setRecordingDate(dt.toISOString().slice(0, 10));
    setRecordingStartTime(dt.toTimeString().slice(0, 8));
    setTimestampSource('FILE_METADATA');
    setUseFileCreationTime(true);
    setShowMetadataBanner(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isCreatingCam && !selectedCamera) { setError('Please select a camera.'); return; }
    if (isCreatingCam && (!newCamCode || !newCamName)) { setError('Please fill in camera code and name.'); return; }
    if (!file) { setError('Please choose a video file.'); return; }
    setLoading(true);
    setError(null);

    try {
      let targetCamId = selectedCamera;
      if (isCreatingCam) {
        const camRes = await camerasAPI.create({
          camera_code: newCamCode,
          name: newCamName,
          location_description: newCamDesc || newCamName,
          building_id: newCamBuildingId || null,
        });
        targetCamId = camRes.data.id;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('camera_id', targetCamId);
      formData.append('timestamp_source', timestampSource);
      formData.append('recording_timezone', recordingTimezone);

      if (timestampSource === 'USER_PROVIDED' || timestampSource === 'VIDEO_OVERLAY' || timestampSource === 'FILE_METADATA') {
        formData.append('recording_date', recordingDate);
        formData.append('recording_start_time', recordingStartTime);
      }

      formData.append('use_file_creation_time', useFileCreationTime ? 'true' : 'false');

      const res = await videosAPI.upload(formData);
      onUploaded(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to upload video file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel rounded-2xl border-slate-700 w-full max-w-xl p-6 space-y-5 mx-4 font-mono text-xs max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-cyan-400" /> UPLOAD CCTV FOOTAGE
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Camera Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-slate-400 uppercase block">Camera Node *</label>
              <button type="button" onClick={() => setIsCreatingCam(!isCreatingCam)}
                className="text-[11px] text-cyan-400 hover:underline">
                {isCreatingCam ? '← Choose Existing' : '+ Register New Camera'}
              </button>
            </div>
            {!isCreatingCam ? (
              <select value={selectedCamera} onChange={e => setSelectedCamera(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 font-mono">
                <option value="">Choose camera node...</option>
                {cameras.map(c => (
                  <option key={c.id} value={c.id}>{c.camera_code} — {c.name} ({c.building_name || 'Unassigned'})</option>
                ))}
              </select>
            ) : (
              <div className="space-y-2 p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Camera Code</label>
                    <input type="text" placeholder="CAM 05" value={newCamCode}
                      onChange={e => setNewCamCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Camera Name</label>
                    <input type="text" placeholder="Building B Lobby" value={newCamName}
                      onChange={e => setNewCamName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-cyan-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Zone Description</label>
                    <input type="text" placeholder="East Gate Corridor" value={newCamDesc}
                      onChange={e => setNewCamDesc(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Assign to Building</label>
                    <select value={newCamBuildingId} onChange={e => setNewCamBuildingId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-cyan-500">
                      <option value="">None</option>
                      {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Video File Select */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase mb-1.5 block flex items-center justify-between">
              <span>CCTV Video File (.mp4, .avi, .mov, .mkv) *</span>
              {probing && <span className="text-cyan-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Probing metadata...</span>}
            </label>
            <input type="file" accept="video/*" onChange={handleFileChange}
              className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-mono file:font-bold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 file:cursor-pointer border border-slate-800 rounded-lg bg-slate-900/50 p-2" />
          </div>

          {/* Detected File Metadata Confirmation Banner */}
          {showMetadataBanner && probedMetadata?.detected_file_creation_time && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-amber-300">
              <div className="flex items-center gap-2 font-bold text-[11px]">
                <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Detected File Creation Time: {new Date(probedMetadata.detected_file_creation_time).toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-slate-300">
                Would you like to use this file creation timestamp as the official recording start time?
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleUseFileCreationTime}
                  className="px-3 py-1 bg-amber-500 text-slate-950 rounded text-[10px] font-bold shadow hover:bg-amber-400"
                >
                  Use File Creation Time
                </button>
                <button
                  type="button"
                  onClick={() => setShowMetadataBanner(false)}
                  className="px-3 py-1 bg-slate-800 text-slate-400 rounded text-[10px] hover:text-white"
                >
                  Ignore
                </button>
              </div>
            </div>
          )}

          {/* Controlled Timestamp Source Selection */}
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
            <label className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> CCTV TEMPORAL METADATA SOURCE *
            </label>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                <input
                  type="radio"
                  name="timestamp_source"
                  value="USER_PROVIDED"
                  checked={timestampSource === 'USER_PROVIDED'}
                  onChange={() => { setTimestampSource('USER_PROVIDED'); setUseFileCreationTime(false); }}
                  className="accent-cyan-400"
                />
                <span className="font-bold">Known / User-Provided Recording Time</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                <input
                  type="radio"
                  name="timestamp_source"
                  value="VIDEO_OVERLAY"
                  checked={timestampSource === 'VIDEO_OVERLAY'}
                  onChange={() => { setTimestampSource('VIDEO_OVERLAY'); setUseFileCreationTime(false); }}
                  className="accent-cyan-400"
                />
                <span>Video Contains Visible CCTV Timestamp Overlay</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                <input
                  type="radio"
                  name="timestamp_source"
                  value="UNKNOWN"
                  checked={timestampSource === 'UNKNOWN'}
                  onChange={() => { setTimestampSource('UNKNOWN'); setUseFileCreationTime(false); }}
                  className="accent-cyan-400"
                />
                <span className="text-amber-400 font-bold">Unknown / Real-World Timestamp Unavailable</span>
              </label>
            </div>

            {/* Inputs for Date, Time, Timezone */}
            {timestampSource !== 'UNKNOWN' && (
              <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Recording Date *</label>
                  <input
                    type="date"
                    required
                    value={recordingDate}
                    onChange={e => setRecordingDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Start Time (HH:MM:SS) *</label>
                  <input
                    type="text"
                    required
                    placeholder="14:00:00"
                    value={recordingStartTime}
                    onChange={e => setRecordingStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Timezone *</label>
                  <select
                    value={recordingTimezone}
                    onChange={e => setRecordingTimezone(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono"
                  >
                    {COMMON_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
            )}

            {timestampSource === 'UNKNOWN' && (
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-400 space-y-1">
                <span className="text-amber-400 font-bold block">⚠️ Forensic Notice:</span>
                <span>System will use <strong>Video-Relative Time (00:00:00)</strong> only. Real-world timestamp will be NULL. No dates will be invented.</span>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-mono text-slate-400 hover:text-white bg-slate-800 border border-slate-700 transition-colors">
              Cancel
            </button>
            <button id="cctv-upload-submit-btn" type="submit" disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg text-xs font-bold font-mono shadow-md disabled:opacity-50 transition-all">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {loading ? 'Uploading...' : 'Ingest CCTV Footage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main CCTV Monitoring Page ─────────────────────────────────────────────────
export default function CCTVMonitoring() {
  const [cameras, setCameras] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [detections, setDetections] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetections, setLoadingDetections] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState('tracks'); // 'tracks' | 'detections'
  const [selectedTrackFilter, setSelectedTrackFilter] = useState(null);
  const [processingAI, setProcessingAI] = useState(false);
  const [error, setError] = useState(null);
  const videoPlayerRef = useRef(null);

  // Forensic Track Player States
  const [focusTrack, setFocusTrack] = useState(null);
  const [isLoopingClip, setIsLoopingClip] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isFocusZoom, setIsFocusZoom] = useState(false);
  const [videoTime, setVideoTime] = useState(0);
  const [videoDims, setVideoDims] = useState({ left: 0, top: 0, width: 0, height: 0 });

  // Modals & Wizards
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [showFloorEditor, setShowFloorEditor] = useState(false);
  const [deletingCamId, setDeletingCamId] = useState(null);
  const [stoppingAI, setStoppingAI] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState(null);
  const [selectedModel, setSelectedModel] = useState('yolo11s.pt');
  const [trajectoryTrackId, setTrajectoryTrackId] = useState(null);

  // Helper functions for Forensic Player
  const updateVideoDimensions = useCallback(() => {
    const video = videoPlayerRef.current;
    if (!video) return;
    
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    const elementWidth = video.clientWidth;
    const elementHeight = video.clientHeight;
    
    if (!videoWidth || !videoHeight || !elementWidth || !elementHeight) return;
    
    const videoRatio = videoWidth / videoHeight;
    const elementRatio = elementWidth / elementHeight;
    
    let renderedWidth = elementWidth;
    let renderedHeight = elementHeight;
    let left = 0;
    let top = 0;
    
    if (elementRatio > videoRatio) {
      renderedWidth = elementHeight * videoRatio;
      left = (elementWidth - renderedWidth) / 2;
    } else {
      renderedHeight = elementWidth / videoRatio;
      top = (elementHeight - renderedHeight) / 2;
    }
    
    setVideoDims({
      left,
      top,
      width: renderedWidth,
      height: renderedHeight
    });
  }, []);

  const handleLoadedMetadata = () => {
    updateVideoDimensions();
  };

  const handleTimeUpdate = () => {
    if (videoPlayerRef.current) {
      const currentTime = videoPlayerRef.current.currentTime;
      setVideoTime(currentTime);
      
      if (focusTrack) {
        if (currentTime < focusTrack.start_time_offset) {
          videoPlayerRef.current.currentTime = focusTrack.start_time_offset;
        } else if (currentTime >= focusTrack.end_time_offset) {
          if (isLoopingClip) {
            videoPlayerRef.current.currentTime = focusTrack.start_time_offset;
          } else {
            videoPlayerRef.current.pause();
            videoPlayerRef.current.currentTime = focusTrack.end_time_offset;
          }
        }
      }
    }
    updateVideoDimensions();
  };

  const handleStartFocusTrack = (trk) => {
    setFocusTrack(trk);
    setIsFocusZoom(false);
    setPlaybackSpeed(1.0);
    
    const video = videoPlayerRef.current;
    if (video) {
      video.playbackRate = 1.0;
      
      const handleSeekedPlay = () => {
        video.play().catch(err => console.warn("Play on seeked failed:", err));
        video.removeEventListener('seeked', handleSeekedPlay);
      };
      
      if (Math.abs(video.currentTime - trk.start_time_offset) < 0.1) {
        video.play().catch(err => console.warn("Immediate play failed:", err));
      } else {
        video.addEventListener('seeked', handleSeekedPlay);
        video.currentTime = trk.start_time_offset;
        
        setTimeout(() => {
          video.removeEventListener('seeked', handleSeekedPlay);
          if (video.paused) {
            video.play().catch(err => console.warn("Backup play failed:", err));
          }
        }, 500);
      }
    }
    setActiveRightTab('tracks');
  };

  const handleExitFocusTrack = () => {
    setFocusTrack(null);
    setIsFocusZoom(false);
    setPlaybackSpeed(1.0);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.playbackRate = 1.0;
    }
  };

  const handlePlaybackSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.playbackRate = speed;
    }
  };

  const getActiveBBox = () => {
    if (!focusTrack || !focusTrack.trajectory) return null;
    const time = videoTime;
    
    let closestPoint = null;
    let minDiff = Infinity;
    
    for (const pt of focusTrack.trajectory) {
      const diff = Math.abs(pt.timestamp - time);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = pt;
      }
    }
    
    if (closestPoint && minDiff < 1.0) {
      return closestPoint.bbox; // [x, y, w, h] normalized
    }
    
    return null;
  };

  const getZoomTransform = () => {
    if (!isFocusZoom || !focusTrack || videoDims.width === 0) {
      return {
        transform: 'scale(1) translate(0, 0)',
        transition: 'transform 0.15s ease-out',
      };
    }
    
    const bbox = getActiveBBox();
    if (!bbox) {
      return {
        transform: 'scale(1) translate(0, 0)',
        transition: 'transform 0.15s ease-out',
      };
    }
    
    const [bx, by, bw, bh] = bbox;
    const px = (bx + bw / 2) * videoDims.width + videoDims.left;
    const py = (by + bh / 2) * videoDims.height + videoDims.top;
    
    const elementWidth = videoPlayerRef.current?.clientWidth || videoDims.width;
    const elementHeight = videoPlayerRef.current?.clientHeight || videoDims.height;
    
    if (!elementWidth || !elementHeight) {
      return {
        transform: 'scale(1) translate(0, 0)',
        transition: 'transform 0.15s ease-out',
      };
    }
    
    const cx_norm = px / elementWidth;
    const cy_norm = py / elementHeight;
    
    const scale = 2.5;
    const tx = (0.5 - cx_norm) * 100;
    const ty = (0.5 - cy_norm) * 100;
    
    return {
      transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
      transition: 'transform 0.1s ease-out',
    };
  };

  const renderMotionTrail = () => {
    if (!focusTrack || !focusTrack.trajectory || videoDims.width === 0) return null;
    
    const points = focusTrack.trajectory
      .filter(pt => pt.timestamp <= videoTime)
      .map(pt => {
        const [bx, by, bw, bh] = pt.bbox;
        const cx = (bx + bw / 2) * videoDims.width;
        const cy = (by + bh / 2) * videoDims.height;
        return `${cx},${cy}`;
      });
      
    if (points.length < 2) return null;
    
    return (
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#22d3ee"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="4,4"
        opacity="0.75"
      />
    );
  };

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cRes, vRes, bRes] = await Promise.all([
        camerasAPI.list(), videosAPI.list(), buildingsAPI.list()
      ]);
      setCameras(cRes.data || []);
      setVideos(vRes.data || []);
      const bldgs = bRes.data || [];
      setBuildings(bldgs);

      if (bldgs.length > 0 && !selectedBuilding) {
        setSelectedBuilding(bldgs[0]);
        if (bldgs[0].floors?.length > 0) {
          setSelectedFloor(bldgs[0].floors[0]);
        }
      }
      if (vRes.data?.length > 0 && !selectedVideo) {
        setSelectedVideo(vRes.data[0]);
      }
    } catch {
      setError('Failed to load camera feeds or building information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // When selectedBuilding changes, update selectedFloor
  useEffect(() => {
    if (selectedBuilding && selectedBuilding.floors?.length > 0) {
      const currentFloorInBldg = selectedBuilding.floors.find(f => f.id === selectedFloor?.id);
      if (!currentFloorInBldg) {
        setSelectedFloor(selectedBuilding.floors[0]);
      }
    }
  }, [selectedBuilding]);

  const loadDetections = async (videoId) => {
    if (!videoId) return;
    setLoadingDetections(true);
    try {
      const res = await videosAPI.getDetections(videoId);
      setDetections(res.data.detections || []);
    } catch { setDetections([]); }
    finally { setLoadingDetections(false); }
  };

  const loadTracks = async (videoId) => {
    if (!videoId) return;
    setLoadingTracks(true);
    try {
      const res = await trackingAPI.getVideoTracks(videoId);
      setTracks(res.data || []);
    } catch { setTracks([]); }
    finally { setLoadingTracks(false); }
  };

  useEffect(() => {
    if (selectedVideo) {
      loadDetections(selectedVideo.id);
      loadTracks(selectedVideo.id);
      setSelectedTrackFilter(null);
      setFocusTrack(null);
      setIsFocusZoom(false);
      setPlaybackSpeed(1.0);
    }
  }, [selectedVideo]);

  // Polling for processing status
  useEffect(() => {
    if (!selectedVideo) return;
    
    let timerId = null;
    const isProcessing = selectedVideo.processing_status === 'PROCESSING' || selectedVideo.processing_status === 'PENDING';
    
    if (isProcessing) {
      timerId = setInterval(async () => {
        try {
          const res = await videosAPI.get(selectedVideo.id);
          const updatedVid = res.data;
          
          if (updatedVid.processing_status !== selectedVideo.processing_status) {
            setSelectedVideo(updatedVid);
            setVideos(prev => prev.map(v => v.id === updatedVid.id ? updatedVid : v));
            
            if (updatedVid.processing_status === 'COMPLETED') {
              loadDetections(updatedVid.id);
              loadTracks(updatedVid.id);
            }
          }
        } catch (err) {
          console.error("Error polling video status:", err);
        }
      }, 2000);
    }
    
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [selectedVideo]);

  // Window resize handler to update dimensions
  useEffect(() => {
    window.addEventListener('resize', updateVideoDimensions);
    return () => window.removeEventListener('resize', updateVideoDimensions);
  }, [updateVideoDimensions]);

  const handleTriggerAI = async (modelToUse = selectedModel) => {
    if (!selectedVideo) return;
    setProcessingAI(true);
    try {
      await videosAPI.processAI(selectedVideo.id, modelToUse, 'person_and_bags', 3);
      const updated = { ...selectedVideo, processing_status: 'PENDING' };
      setSelectedVideo(updated);
      setVideos(prev => prev.map(v => v.id === updated.id ? updated : v));
      await loadData();
    } catch { alert('Failed to queue AI processing.'); }
    finally { setProcessingAI(false); }
  };

  const handleStopProcessing = async () => {
    if (!selectedVideo) return;
    setStoppingAI(true);
    try {
      await videosAPI.stopProcessing(selectedVideo.id);
      const updated = { ...selectedVideo, processing_status: 'STOPPED' };
      setSelectedVideo(updated);
      setVideos(prev => prev.map(v => v.id === updated.id ? updated : v));
    } catch (err) {
      console.error("Failed to stop processing:", err);
      alert('Failed to stop video processing.');
    } finally {
      setStoppingAI(false);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    const vidToDelete = videos.find(v => v.id === videoId) || selectedVideo;
    const name = vidToDelete?.filename || 'this recording';
    if (!window.confirm(`Are you sure you want to delete "${name}"?\n\nThis will permanently delete the video file, all detections, and tracking history so you can re-upload cleanly.`)) {
      return;
    }

    setDeletingVideoId(videoId);
    try {
      await videosAPI.delete(videoId);
      
      const remaining = videos.filter(v => v.id !== videoId);
      setVideos(remaining);
      if (selectedVideo?.id === videoId) {
        setSelectedVideo(remaining.length > 0 ? remaining[0] : null);
        setDetections([]);
        setTracks([]);
        setFocusTrack(null);
      }
      await loadData();
    } catch (err) {
      console.error("Failed to delete video:", err);
      alert('Failed to delete video recording.');
    } finally {
      setDeletingVideoId(null);
    }
  };

  const handleSeekVideo = (seconds) => {
    const video = videoPlayerRef.current;
    if (video && seconds !== undefined) {
      const handleSeekedPlay = () => {
        video.play().catch(err => console.warn("Seeked play failed:", err));
        video.removeEventListener('seeked', handleSeekedPlay);
      };
      
      if (Math.abs(video.currentTime - seconds) < 0.1) {
        video.play().catch(err => console.warn("Immediate play failed:", err));
      } else {
        video.addEventListener('seeked', handleSeekedPlay);
        video.currentTime = seconds;
        
        setTimeout(() => {
          video.removeEventListener('seeked', handleSeekedPlay);
          if (video.paused) {
            video.play().catch(err => console.warn("Backup seeked play failed:", err));
          }
        }, 500);
      }
    }
  };


  const handleDeleteCamera = async (camId) => {
    if (!window.confirm('Delete this camera node? Existing video recordings will remain in system.')) return;
    setDeletingCamId(camId);
    try {
      await camerasAPI.delete(camId);
      await loadData();
    } catch {
      alert('Failed to delete camera.');
    } finally {
      setDeletingCamId(null);
    }
  };

  // Filter cameras belonging to the selected floor or unassigned
  const floorCameras = selectedFloor
    ? cameras.filter(c => c.floor_id === selectedFloor.id)
    : [];

  const unassignedCameras = cameras.filter(c => !c.floor_id);

  const statusBadgeCls = (status) => {
    switch (status) {
      case 'COMPLETED': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'PROCESSING': return 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse';
      case 'STOPPED': return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
      case 'FAILED': return 'bg-red-500/10 border-red-500/30 text-red-400';
      default: return 'bg-slate-700/40 border-slate-600 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide font-mono flex items-center gap-2">
            CCTV MONITORING & BUILDING ANALYTICS
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-sans font-normal">
              SPATIAL MATRIX
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Multi-floor blueprint editor, camera orientation placement & live video analytics</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
          <button onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>

          <button
            onClick={() => setShowWizardModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Register Building
          </button>

          <button id="open-upload-modal-btn" onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg font-bold shadow-md shadow-cyan-500/20 transition-all">
            <Upload className="w-4 h-4" /> Upload CCTV Video
          </button>
        </div>
      </div>

      {/* ── Building View & Multi-Floor Navigation Section ── */}
      {buildings.length > 0 && selectedBuilding && (
        <div className="glass-panel p-5 rounded-2xl border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider">
                  {selectedBuilding.name}
                </h2>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-mono text-xs">
                  {selectedBuilding.code}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedBuilding.description || 'Facility CCTV Surveillance Grid'} — {selectedBuilding.address || 'Campus Location'}
              </p>
            </div>

            {/* Select active building dropdown */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-500 text-[11px]">FACILITY:</span>
              <select
                value={selectedBuilding.id}
                onChange={(e) => {
                  const b = buildings.find(item => item.id === e.target.value);
                  if (b) {
                    setSelectedBuilding(b);
                    if (b.floors?.length > 0) setSelectedFloor(b.floors[0]);
                  }
                }}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Multi-Floor Navigation Tabs [Floor 1] [Floor 2] [Floor 3] */}
          <div className="flex items-center justify-between gap-3 flex-wrap font-mono text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase font-bold mr-1">FLOORS:</span>
              {selectedBuilding.floors?.map(fl => {
                const isActive = selectedFloor?.id === fl.id;
                const camCount = cameras.filter(c => c.floor_id === fl.id).length;

                return (
                  <button
                    key={fl.id}
                    onClick={() => setSelectedFloor(fl)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${isActive ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold shadow-lg shadow-cyan-500/10' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'}`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{fl.floor_name || `Floor ${fl.floor_number}`}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-950 text-cyan-400 border border-slate-800">
                      {camCount} 📹
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedFloor && (
              <button
                onClick={() => setShowFloorEditor(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg font-bold transition-colors"
              >
                <Compass className="w-3.5 h-3.5" /> Edit Floor Blueprint & Cameras
              </button>
            )}
          </div>

          {/* Visual Floor Blueprint Canvas Preview */}
          {selectedFloor && (
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-mono border-b border-slate-900 pb-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-200 font-bold">
                    {selectedFloor.floor_name || `Floor ${selectedFloor.floor_number}`} Blueprint Overview
                  </span>
                </div>
                <span className="text-slate-500 text-[10px]">
                  Normalized spatial coordinates relative lock active
                </span>
              </div>

              <div className="relative aspect-[16/9] w-full max-h-[360px] bg-slate-900 rounded-lg overflow-hidden border border-slate-800/80 flex items-center justify-center select-none">
                {selectedFloor.blueprint_url ? (
                  <img
                    src={selectedFloor.blueprint_url}
                    alt={`Floor ${selectedFloor.floor_number} Blueprint`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-600 space-y-2 font-mono">
                    <ImageIcon className="w-10 h-10 text-slate-700" />
                    <p className="text-xs text-slate-500">NO BLUEPRINT UPLOADED FOR THIS FLOOR</p>
                    <button
                      onClick={() => setShowFloorEditor(true)}
                      className="text-[11px] text-cyan-400 hover:underline mt-1"
                    >
                      + Upload Floor Blueprint Image
                    </button>
                  </div>
                )}

                {/* Render Placed Camera Markers with Direction Pointers */}
                {floorCameras.map((cam) => {
                  const angle = cam.direction_angle || 0;
                  const compass = getCompassDirection(angle);

                  return (
                    <div
                      key={`blueprint-cam-${cam.id}`}
                      className="absolute z-20 flex flex-col items-center group cursor-pointer"
                      style={{
                        left: `${cam.position_x}%`,
                        top: `${cam.position_y}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      {/* Vision Cone Indicator Pointer */}
                      <div
                        className="absolute w-10 h-10 rounded-full border border-cyan-400/40 bg-cyan-500/10 pointer-events-none flex items-start justify-center"
                        style={{ transform: `rotate(${angle}deg)` }}
                      >
                        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-0.5 shadow-sm shadow-cyan-400" />
                      </div>

                      {/* Camera Icon Marker */}
                      <div className="w-7 h-7 rounded-full bg-slate-950/90 text-cyan-400 border border-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-all">
                        <Camera className="w-3.5 h-3.5" />
                      </div>

                      {/* Label */}
                      <span className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-800 text-[8px] font-mono font-bold text-cyan-300 shadow">
                        {cam.camera_code} ({compass})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main CCTV Stream & Telemetry Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Video Player & Camera Matrix */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel rounded-xl overflow-hidden border-slate-800 space-y-3">
            <div className="p-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2 min-w-0">
                <Video className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                {videos.length > 1 ? (
                  <select
                    value={selectedVideo?.id || ''}
                    onChange={(e) => {
                      const v = videos.find(item => item.id === e.target.value);
                      if (v) setSelectedVideo(v);
                    }}
                    className="bg-slate-800/90 border border-slate-700 text-white font-bold font-mono text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-400 max-w-[220px] sm:max-w-[260px] truncate"
                  >
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.filename} [{v.processing_status}]
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-bold text-white truncate max-w-[220px] sm:max-w-[260px]">
                    {selectedVideo ? selectedVideo.filename : 'SELECT A CCTV RECORDING'}
                  </span>
                )}
              </div>

              {selectedVideo && (
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${statusBadgeCls(selectedVideo.processing_status)}`}>
                    {selectedVideo.processing_status}
                  </span>

                  {(selectedVideo.processing_status === 'PROCESSING' || selectedVideo.processing_status === 'PENDING') ? (
                    <button
                      onClick={handleStopProcessing}
                      disabled={stoppingAI}
                      title="Stop AI processing immediately"
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold transition-colors disabled:opacity-50"
                    >
                      {stoppingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-current" />}
                      Stop Processing
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        disabled={processingAI}
                        title="Choose AI Model Engine"
                        className="bg-slate-900 border border-cyan-500/40 text-cyan-300 font-mono text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-400 cursor-pointer disabled:opacity-50"
                      >
                        <option value="yolo11s.pt">YOLO11-Small (Fast / &lt;1m)</option>
                        <option value="yolo11m.pt">YOLO11-Medium (High Recall)</option>
                        <option value="yolo11n.pt">YOLO11-Nano (Ultra Fast)</option>
                      </select>

                      <button
                        onClick={() => handleTriggerAI(selectedModel)}
                        disabled={processingAI}
                        className="flex items-center gap-1.5 px-3 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-xs font-mono font-bold transition-colors disabled:opacity-50 shadow"
                      >
                        {processingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
                        Run AI Detection
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleDeleteVideo(selectedVideo.id)}
                    disabled={deletingVideoId === selectedVideo.id}
                    title="Delete recording and clear data to re-upload"
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-xs font-mono transition-colors disabled:opacity-50"
                  >
                    {deletingVideoId === selectedVideo.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete Video
                  </button>
                </div>
              )}
            </div>

            {/* Video Player Display */}
            <div className="bg-slate-950 min-h-[320px] flex items-center justify-center relative border-y border-slate-900 overflow-hidden w-full max-h-[460px]">
              {selectedVideo && (selectedVideo.processing_status === 'PROCESSING' || selectedVideo.processing_status === 'PENDING') && (
                <div className="absolute top-3 left-3 right-3 bg-amber-500/95 text-slate-950 font-bold px-3 py-2.5 rounded-lg border border-amber-400 text-[11px] font-mono shadow-xl flex items-center justify-between gap-3 z-30">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-slate-950" />
                    <span>AI PIPELINE RUNNING: Background tracking is in progress...</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleStopProcessing}
                      disabled={stoppingAI}
                      className="px-2.5 py-1 rounded bg-slate-900 text-rose-300 hover:bg-slate-950 border border-rose-500/40 text-[10px] font-bold font-mono transition-colors flex items-center gap-1 shadow"
                    >
                      {stoppingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3 fill-current" />}
                      Stop
                    </button>
                    <button
                      onClick={() => handleDeleteVideo(selectedVideo.id)}
                      disabled={deletingVideoId === selectedVideo.id}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold font-mono transition-colors flex items-center gap-1 shadow"
                    >
                      {deletingVideoId === selectedVideo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Stop & Delete
                    </button>
                  </div>
                </div>
              )}
              {selectedVideo ? (
                <div
                  className="relative w-full h-full flex items-center justify-center"
                  style={getZoomTransform()}
                >
                  <video
                    ref={videoPlayerRef}
                    key={selectedVideo.id}
                    controls
                    autoPlay
                    muted
                    className="w-full max-h-[460px] object-contain rounded"
                    src={videosAPI.streamUrl(selectedVideo.id)}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                  />

                  {/* SVG Motion Trail Overlay */}
                  {focusTrack && videoDims.width > 0 && (
                    <svg
                      className="absolute pointer-events-none z-10"
                      style={{
                        left: `${videoDims.left}px`,
                        top: `${videoDims.top}px`,
                        width: `${videoDims.width}px`,
                        height: `${videoDims.height}px`,
                      }}
                    >
                      {renderMotionTrail()}
                    </svg>
                  )}

                  {/* HTML Bounding Box Overlay */}
                  {focusTrack && videoDims.width > 0 && (() => {
                    const bbox = getActiveBBox();
                    if (!bbox) return null;
                    
                    const [bx, by, bw, bh] = bbox;
                    const left = bx * videoDims.width + videoDims.left;
                    const top = by * videoDims.height + videoDims.top;
                    const width = bw * videoDims.width;
                    const height = bh * videoDims.height;
                    
                    return (
                      <div
                        className="absolute border border-dashed border-cyan-400 bg-cyan-500/10 pointer-events-none z-20 flex flex-col justify-between"
                        style={{
                          left: `${left}px`,
                          top: `${top}px`,
                          width: `${width}px`,
                          height: `${height}px`,
                          boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)',
                        }}
                      >
                        {/* Corner Brackets */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-300" />
                        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-300" />
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-300" />
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-300" />
                        
                        {/* Reticle center crosshair */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-30">
                          <div className="w-3 h-[1px] bg-cyan-300" />
                          <div className="h-3 w-[1px] bg-cyan-300 absolute" />
                        </div>

                        {/* Tag Badge */}
                        <div
                          className="absolute bg-cyan-500 text-slate-950 font-bold px-1.5 py-0.5 rounded text-[8px] uppercase font-mono tracking-wider shadow-lg flex items-center gap-1 whitespace-nowrap"
                          style={{
                            top: '-20px',
                            left: '0px',
                          }}
                        >
                          <Target className="w-2.5 h-2.5 text-slate-950 animate-spin" style={{ animationDuration: '3s' }} />
                          <span>ID #{focusTrack.track_id} | {focusTrack.class_name.toUpperCase()}</span>
                          <span className="bg-slate-950/20 px-1 rounded text-[7px]">{formatRelativeTime(videoTime)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 p-12 text-slate-600">
                  <Film className="w-12 h-12 text-slate-700" />
                  <span className="text-xs font-mono text-slate-500">NO CCTV VIDEO SELECTED</span>
                </div>
              )}
            </div>

            {/* Forensic Temporal Telemetry Banner */}
            {selectedVideo && (
              <div className="p-3 bg-slate-900/90 border-t border-slate-800 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    {selectedVideo.timestamp_source !== 'UNKNOWN' && selectedVideo.recording_start_datetime ? (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300 font-bold">Real-World Start:</span>
                        <span className="text-cyan-300 font-bold">
                          {new Date(selectedVideo.recording_start_datetime).toLocaleString()} ({selectedVideo.recording_timezone || 'UTC'})
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[9px] font-bold">
                          {selectedVideo.timestamp_source}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold">⚠️ Real-World Timestamp Unavailable</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[9px] font-bold">
                          VIDEO-RELATIVE TIME ONLY
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Video Timeline Duration */}
                  <div className="text-[11px] text-slate-400 font-bold">
                    Span: {formatRelativeTime(0)} ──────── {formatRelativeTime(selectedVideo.duration_seconds)}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Duration</span>
                    <span className="text-slate-200 font-bold">{selectedVideo.duration_seconds}s</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Frame Rate</span>
                    <span className="text-slate-200 font-bold">{selectedVideo.fps} FPS</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Resolution</span>
                    <span className="text-slate-200 font-bold">{selectedVideo.width} x {selectedVideo.height}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">SHA-256 Checksum</span>
                    <span className="text-cyan-400 font-bold truncate block" title={selectedVideo.sha256_hash}>
                      {selectedVideo.sha256_hash?.slice(0, 12)}…
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Forensic Clip Control Panel */}
            {focusTrack && (
              <div className="p-4 bg-cyan-950/20 border-t border-cyan-500/30 rounded-b-xl space-y-3 font-mono text-xs">
                {/* Panel Header */}
                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold">
                    <Shield className="w-4 h-4 text-cyan-400 animate-pulse" />
                    <span>FORENSIC TRACK INVESTIGATION: ID #{focusTrack.track_id}</span>
                  </div>
                  <button
                    onClick={handleExitFocusTrack}
                    className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded font-bold transition-colors"
                  >
                    Exit Clip Mode
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center">
                  {/* Subject Crop Preview */}
                  {focusTrack.thumbnail_url ? (
                    <img
                      src={focusTrack.thumbnail_url}
                      alt={`Track ${focusTrack.track_id}`}
                      className="w-16 h-16 object-cover rounded-lg border border-cyan-500/40 bg-slate-950 shadow-md shadow-cyan-500/10"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center text-slate-600">
                      <UserCheck className="w-8 h-8" />
                    </div>
                  )}

                  {/* Playback & Loop Controls */}
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Active Window: {formatRelativeTime(focusTrack.start_time_offset)} ── {formatRelativeTime(videoTime)} ── {formatRelativeTime(focusTrack.end_time_offset)}</span>
                      <span className="text-cyan-400 font-bold">Status: FOCUSING</span>
                    </div>

                    {/* Control buttons row */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Replay Entry */}
                      <button
                        onClick={() => handleSeekVideo(focusTrack.start_time_offset)}
                        className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 rounded text-slate-300 hover:text-white flex items-center gap-1 font-bold animate-pulse"
                      >
                        ⏮ Entry
                      </button>
                      
                      {/* Skip Exit */}
                      <button
                        onClick={() => handleSeekVideo(focusTrack.end_time_offset - 0.2)}
                        className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 hover:border-cyan-500/50 rounded text-slate-300 hover:text-white flex items-center gap-1 font-bold"
                      >
                        ⏭ Exit
                      </button>

                      {/* Loop Toggle */}
                      <button
                        onClick={() => setIsLoopingClip(!isLoopingClip)}
                        className={`px-3 py-1.5 border rounded flex items-center gap-1.5 font-bold transition-colors ${
                          isLoopingClip
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        🔁 Loop {isLoopingClip ? 'ON' : 'OFF'}
                      </button>

                      {/* Speed Selector */}
                      <div className="flex items-center bg-slate-900 border border-slate-700 rounded overflow-hidden">
                        <button
                          onClick={() => handlePlaybackSpeedChange(0.5)}
                          className={`px-2 py-1.5 text-[10px] font-bold ${playbackSpeed === 0.5 ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                        >
                          0.5x Slow
                        </button>
                        <button
                          onClick={() => handlePlaybackSpeedChange(1.0)}
                          className={`px-2 py-1.5 text-[10px] font-bold ${playbackSpeed === 1.0 ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                        >
                          1.0x
                        </button>
                        <button
                          onClick={() => handlePlaybackSpeedChange(2.0)}
                          className={`px-2 py-1.5 text-[10px] font-bold ${playbackSpeed === 2.0 ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                        >
                          2.0x
                        </button>
                      </div>

                      {/* Focus Zoom Button */}
                      <button
                        onClick={() => setIsFocusZoom(!isFocusZoom)}
                        className={`px-3 py-1.5 border rounded flex items-center gap-1.5 font-bold transition-all ml-auto ${
                          isFocusZoom
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        🔍 Focus Area {isFocusZoom ? 'Active' : 'OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Camera Feed Matrix */}
          <div className="glass-panel p-4 rounded-xl border-slate-800 space-y-3">
            <h2 className="text-xs font-bold text-white font-mono flex items-center justify-between">
              <span>CAMERA FEED MATRIX ({selectedFloor ? selectedFloor.floor_name || `Floor ${selectedFloor.floor_number}` : 'All'})</span>
              <span className="text-[10px] text-slate-500 font-normal">{floorCameras.length} floor nodes</span>
            </h2>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-mono">
                <AlertCircle className="w-4 h-4" />{error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {floorCameras.length === 0 ? (
                <div className="col-span-2 py-8 text-center text-slate-500 font-mono text-xs space-y-2">
                  <p>No cameras assigned to this floor yet.</p>
                  <button
                    onClick={() => setShowFloorEditor(true)}
                    className="text-cyan-400 hover:underline font-bold text-[11px]"
                  >
                    + Add / Place Cameras on Floor Blueprint
                  </button>
                </div>
              ) : (
                floorCameras.map((cam) => {
                  const camVideos = videos.filter(v => v.camera_id === cam.id);
                  const compass = getCompassDirection(cam.direction_angle || 0);

                  return (
                    <div
                      key={`matrix-cam-${cam.id}`}
                      className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2 hover:border-cyan-500/40 transition-colors group"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-cyan-400">{cam.camera_code}</span>
                          <span className="text-[9px] px-1 rounded bg-slate-800 text-slate-400 font-bold">
                            {Math.round(cam.direction_angle || 0)}° {compass}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                            {cam.status}
                          </span>
                          <button
                            onClick={() => handleDeleteCamera(cam.id)}
                            disabled={deletingCamId === cam.id}
                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-600 hover:text-red-400 transition-all"
                          >
                            {deletingCamId === cam.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-300">{cam.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {cam.area_zone ? `Zone: ${cam.area_zone}` : cam.location_description}
                        {cam.time_offset_seconds ? ` (Clock Offset: ${cam.time_offset_seconds}s)` : ''}
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono">
                        <span className="text-slate-400">{camVideos.length} recordings</span>
                        {camVideos.length > 0 && (
                          <button
                            onClick={() => setSelectedVideo(camVideos[0])}
                            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold"
                          >
                            <Play className="w-3 h-3 fill-current" /> Watch Feed
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Unassigned / Legacy Cameras Drawer */}
            {unassignedCameras.length > 0 && (
              <div className="pt-3 border-t border-slate-800 font-mono text-xs space-y-2">
                <h3 className="text-[11px] font-bold text-amber-400 flex items-center justify-between">
                  <span>UNASSIGNED / LEGACY CAMERAS ({unassignedCameras.length})</span>
                  <span className="text-[10px] text-slate-500 font-normal">Not placed on floor blueprints</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {unassignedCameras.map(uCam => (
                    <div key={uCam.id} className="p-2 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-200">{uCam.camera_code}</div>
                        <div className="text-[10px] text-slate-500">{uCam.name}</div>
                      </div>
                      <button
                        onClick={() => setShowFloorEditor(true)}
                        className="text-[10px] px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-bold"
                      >
                        Assign →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Tracked Entities (MOT) & AI Overlay Telemetry Inspector */}
        <div className="space-y-4 font-mono text-xs">
          <div className="glass-panel p-4 rounded-xl border-slate-800 space-y-4">
            {/* Header with Tab Navigation */}
            <div className="space-y-2 border-b border-slate-800 pb-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" /> MULTI-OBJECT TRACKING
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                  ByteTrack + YOLO
                </span>
              </div>

              {/* Tab Selector */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveRightTab('tracks')}
                  className={`flex-1 py-1.5 px-2 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeRightTab === 'tracks'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Entities ({tracks.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRightTab('detections')}
                  className={`flex-1 py-1.5 px-2 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeRightTab === 'detections'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Boxes ({detections.length})</span>
                </button>
              </div>
            </div>

            {/* Active Filter Banner */}
            {selectedTrackFilter !== null && (
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg flex items-center justify-between text-cyan-300">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Filtering: Track #{selectedTrackFilter}</span>
                </div>
                <button
                  onClick={() => setSelectedTrackFilter(null)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition-colors"
                >
                  Clear Filter
                </button>
              </div>
            )}

            {/* TAB 1: TRACKED ENTITIES (MOT) */}
            {activeRightTab === 'tracks' && (
              <div className="space-y-3">
                {loadingTracks ? (
                  <div className="flex items-center justify-center p-8 gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> Extracting persistent tracks...
                  </div>
                ) : tracks.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <Target className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="font-bold text-slate-400">No Tracked Entities Found</p>
                    <p className="text-[10px] text-slate-600">
                      Process video with AI to identify persistent movement trajectories & unique track IDs.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {tracks.map((trk) => {
                      const isFiltered = selectedTrackFilter === trk.track_id;
                      return (
                        <div
                          key={trk.id || trk.track_id}
                          className={`p-3 rounded-xl border transition-all ${
                            isFiltered
                              ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500/40'
                              : 'bg-slate-900/90 border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold text-[11px]">
                                TRACK #{trk.track_id}
                              </span>
                              <span className="text-[10px] uppercase font-bold text-slate-300 px-1.5 py-0.5 rounded bg-slate-800">
                                {trk.class_name}
                              </span>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-bold">
                              {(trk.avg_confidence * 100).toFixed(0)}% avg conf
                            </span>
                          </div>

                          {/* Body with Thumbnail & Trajectory Info */}
                          <div className="flex gap-3 items-center">
                            {trk.thumbnail_url ? (
                              <img
                                src={trk.thumbnail_url}
                                alt={`Track ${trk.track_id}`}
                                className="w-16 h-16 object-cover rounded-lg border border-slate-800 bg-slate-950 flex-shrink-0"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center flex-shrink-0 text-slate-700">
                                <UserCheck className="w-6 h-6" />
                              </div>
                            )}

                            <div className="flex-1 space-y-1 text-[10px]">
                              <div className="flex items-center justify-between text-slate-400">
                                <span>Duration:</span>
                                <span className="text-cyan-300 font-bold">
                                  {formatRelativeTime(trk.start_time_offset)} → {formatRelativeTime(trk.end_time_offset)} ({trk.duration_seconds}s)
                                </span>
                              </div>

                              {trk.real_world_start_time && (
                                <div className="flex items-center justify-between text-slate-400">
                                  <span>Real-World:</span>
                                  <span className="text-emerald-400 font-bold">
                                    {new Date(trk.real_world_start_time).toLocaleTimeString()}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center justify-between text-slate-500">
                                <span>Frames:</span>
                                <span className="text-slate-300">{trk.total_detections} detected ({trk.trajectory_points_count || trk.total_detections} pts)</span>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2 border-t border-slate-800/80">
                            <button
                              type="button"
                              onClick={() => handleStartFocusTrack(trk)}
                              className={`flex items-center justify-center gap-1 px-1.5 py-1.5 rounded text-[9px] font-bold transition-colors truncate ${
                                focusTrack?.track_id === trk.track_id
                                  ? 'bg-cyan-500 text-slate-950 border border-cyan-400'
                                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                              title="Engage Interactive Forensic Clip Mode"
                            >
                              <PlayCircle className="w-3 h-3 shrink-0" /> Jump
                            </button>
                            <button
                              type="button"
                              onClick={() => setTrajectoryTrackId(trk.id)}
                              className="flex items-center justify-center gap-1 px-1.5 py-1.5 bg-gradient-to-r from-blue-600/80 to-cyan-600/80 hover:from-blue-500 hover:to-cyan-500 text-white rounded text-[9px] font-bold shadow transition-all truncate"
                              title="Reconstruct Cross-Camera Spatial Trajectory"
                            >
                              <Navigation className="w-3 h-3 shrink-0 text-cyan-200 animate-pulse" /> Trajectory
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTrackFilter(isFiltered ? null : trk.track_id);
                                setActiveRightTab('detections');
                              }}
                              className={`flex items-center justify-center gap-1 px-1.5 py-1.5 border rounded text-[9px] font-bold transition-colors truncate ${
                                isFiltered
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              }`}
                              title={isFiltered ? 'Reset BBox Filter' : 'Filter BBoxes by Track ID'}
                            >
                              <Filter className="w-3 h-3 shrink-0" /> {isFiltered ? 'Reset' : 'Filter'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: RAW FRAME DETECTIONS */}
            {activeRightTab === 'detections' && (
              <div className="space-y-3">
                {loadingDetections ? (
                  <div className="flex items-center justify-center p-8 gap-2 text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> Loading detections...
                  </div>
                ) : detections.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 space-y-2">
                    <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
                    <p>No detections found for this video.</p>
                    <p className="text-[10px] text-slate-600">Click "Run AI Detection" above to process video.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {detections
                      .filter(d => selectedTrackFilter === null || d.track_id === selectedTrackFilter)
                      .map((d, i) => (
                        <div
                          key={d.id || i}
                          className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 space-y-1.5 hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-cyan-300 uppercase">{d.class_name}</span>
                              {d.track_id !== undefined && d.track_id !== null && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                                  ID #{d.track_id}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold">
                              {(d.confidence * 100).toFixed(0)}% conf
                            </span>
                          </div>

                          {/* Dual Time Representation */}
                          <div className="p-2 rounded bg-slate-950 border border-slate-900 space-y-1 text-[10px]">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Relative Offset:</span>
                              <button
                                type="button"
                                onClick={() => handleSeekVideo(d.timestamp_offset)}
                                className="text-cyan-300 font-bold hover:underline flex items-center gap-1"
                              >
                                <span>{d.relative_time || `${d.timestamp_offset?.toFixed(2)}s`}</span>
                                <Play className="w-2.5 h-2.5 fill-current" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Real-World Time:</span>
                              {d.real_world_timestamp ? (
                                <span className="text-emerald-400 font-bold">
                                  {new Date(d.real_world_timestamp).toLocaleTimeString()}
                                </span>
                              ) : (
                                <span className="text-amber-400 font-bold">UNKNOWN</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>Frame #{d.frame_number}</span>
                            <span className="truncate max-w-[120px]">BBox: [{d.bbox?.map(v => v.toFixed(2)).join(', ')}]</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals & Wizards ── */}
      {showUploadModal && (
        <UploadVideoModal

          cameras={cameras}
          buildings={buildings}
          onClose={() => setShowUploadModal(false)}
          onUploaded={(newVid) => { loadData(); setSelectedVideo(newVid); }}
        />
      )}

      {showWizardModal && (
        <BuildingRegistrationWizard
          onClose={() => setShowWizardModal(false)}
          onBuildingCreated={(bldg) => {
            loadData();
            setSelectedBuilding(bldg);
            if (bldg.floors?.length > 0) setSelectedFloor(bldg.floors[0]);
          }}
        />
      )}

      {showFloorEditor && selectedFloor && selectedBuilding && (
        <FloorPlanEditor
          floor={selectedFloor}
          building={selectedBuilding}
          unassignedCameras={unassignedCameras}
          onClose={() => setShowFloorEditor(false)}
          onSaved={loadData}
        />
      )}

      {trajectoryTrackId && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto">
            <SpatialTrajectoryViewer
              trackEventId={trajectoryTrackId}
              onClose={() => setTrajectoryTrackId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
