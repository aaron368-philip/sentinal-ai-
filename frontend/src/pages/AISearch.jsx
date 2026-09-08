import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Sparkles, Filter, AlertCircle, Loader2, BarChart2,
  Camera, Eye, Play, Pause, ChevronDown, ChevronUp, Clock,
  MapPin, Tag, Users, Film, X, CheckCircle2, ShieldAlert,
  Repeat, ZoomIn, ZoomOut, Maximize, Minimize, RotateCcw, Scan
} from 'lucide-react';
import { aiSearchAPI, camerasAPI } from '../services/api';

const CLASS_FILTERS = ['person', 'car', 'motorcycle', 'bus', 'truck', 'backpack', 'handbag'];
const CONFIDENCE_OPTIONS = [
  { label: 'High (80%+)', value: 0.8 },
  { label: 'Medium (60%+)', value: 0.6 },
  { label: 'Low (40%+)', value: 0.4 },
];

const EXAMPLE_PROMPTS = [
  'find a man in red shirt',
  'woman in pink dress',
  'man in a black suit',
  'man in blue puffer jacket',
  'two kids walking together',
  'person with black backpack',
];

const statusColor = (cls) => {
  const map = {
    person: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    car: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    motorcycle: 'bg-green-500/10 border-green-500/30 text-green-400',
    bus: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
    truck: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    backpack: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
    handbag: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
  };
  return map[cls] || 'bg-slate-700/40 border-slate-600 text-slate-300';
};

function VideoClipPlayer({ clipInfo, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLooping, setIsLooping] = useState(true);
  const [showBox, setShowBox] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [videoDims, setVideoDims] = useState({ left: 0, top: 0, width: 0, height: 0 });

  // Update dynamic video dimensions based on letterbox borders inside object-contain
  const updateVideoDimensions = useCallback(() => {
    const video = videoRef.current;
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

  // Initialize and jump to start time
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      if (clipInfo.start_time_offset) {
        videoRef.current.currentTime = clipInfo.start_time_offset;
      }
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
    updateVideoDimensions();
  };

  // Buttery-smooth overlay updates driven by requestAnimationFrame
  useEffect(() => {
    let animFrame;
    const updateTime = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
        
        // Loop back manually if we reach end_time_offset and looping is on
        if (isLooping && clipInfo.end_time_offset && videoRef.current.currentTime >= clipInfo.end_time_offset) {
          videoRef.current.currentTime = clipInfo.start_time_offset || 0;
        }
      }
      updateVideoDimensions();
      animFrame = requestAnimationFrame(updateTime);
    };
    animFrame = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animFrame);
  }, [isLooping, clipInfo.start_time_offset, clipInfo.end_time_offset, updateVideoDimensions]);

  // Window resize handler
  useEffect(() => {
    window.addEventListener('resize', updateVideoDimensions);
    return () => window.removeEventListener('resize', updateVideoDimensions);
  }, [updateVideoDimensions]);

  // Fullscreen event listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleLoop = () => {
    setIsLooping(!isLooping);
  };

  const toggleBox = () => {
    setShowBox(!showBox);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom(z => Math.min(z + 0.5, 4));
  const handleZoomOut = () => {
    setZoom(z => {
      const next = Math.max(z - 0.5, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Drag pan handlers
  const handleMouseDown = (e) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging || zoom <= 1) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Bounding box lookup
  const getActiveBbox = () => {
    if (!clipInfo.bbox_trajectory || clipInfo.bbox_trajectory.length === 0) return null;
    
    let closestPoint = null;
    let minDiff = Infinity;
    
    for (const pt of clipInfo.bbox_trajectory) {
      const diff = Math.abs(pt.timestamp - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestPoint = pt;
      }
    }
    
    if (minDiff > 1.2) return null; // threshold gap 1.2 seconds
    return closestPoint ? closestPoint.bbox : null;
  };

  const activeBbox = getActiveBbox();

  return (
    <div 
      ref={containerRef}
      className={`mt-4 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl animate-fadeIn ${
        isFullscreen ? 'w-screen h-screen mt-0 rounded-none border-none' : ''
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            CCTV Player — {clipInfo.camera_name || 'Camera'} ({clipInfo.camera_code || 'N/A'})
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Start: {clipInfo.start_time_offset?.toFixed(1)}s
          </span>
          {clipInfo.end_time_offset && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
              End: {clipInfo.end_time_offset?.toFixed(1)}s
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          title="Close Clip"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Video Container viewport */}
      <div 
        className="relative bg-slate-950 overflow-hidden flex items-center justify-center select-none"
        style={{ height: isFullscreen ? 'calc(100vh - 100px)' : '380px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Transform Wrapper containing video + box overlay */}
        <div 
          className="relative w-full h-full flex items-center justify-center transition-transform duration-75 ease-out origin-center"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
          }}
        >
          {/* We make the inner container exactly aspect-video for precise alignment */}
          <div className="relative aspect-video max-w-full max-h-full w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={clipInfo.stream_url}
              onLoadedMetadata={handleLoadedMetadata}
              onClick={togglePlay}
              className="w-full h-full object-contain pointer-events-auto rounded"
              loop={isLooping && !clipInfo.end_time_offset}
            />

            {/* Bounding box overlay layer */}
            {showBox && activeBbox && videoDims.width > 0 && (() => {
              const [bx, by, bw, bh] = activeBbox;
              const boxLeft = bx * videoDims.width + videoDims.left;
              const boxTop = by * videoDims.height + videoDims.top;
              const boxWidth = bw * videoDims.width;
              const boxHeight = bh * videoDims.height;
              
              return (
                <div
                  className="absolute border-2 border-cyan-400 bg-cyan-400/15 rounded transition-all duration-100 ease-out shadow-[0_0_12px_rgba(34,211,238,0.7)] pointer-events-none z-20"
                  style={{
                    left: `${boxLeft}px`,
                    top: `${boxTop}px`,
                    width: `${boxWidth}px`,
                    height: `${boxHeight}px`,
                  }}
                >
                  <div className="absolute -top-6 left-0 bg-cyan-500 text-slate-950 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                    🎯 {clipInfo.class_name?.toUpperCase() || 'TARGET'} #{clipInfo.track_id || 'ID'}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Video status overlay */}
        <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-md text-[11px] font-mono text-cyan-400 border border-slate-800">
          📍 {clipInfo.display_timestamp}
        </div>

        {zoom > 1 && (
          <div className="absolute top-3 right-3 bg-cyan-500 text-slate-950 font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow">
            ZOOMED {zoom.toFixed(1)}x (Drag to Pan)
          </div>
        )}
      </div>

      {/* Control panel bar */}
      <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className={`p-2 rounded-lg transition-all ${
              isPlaying ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          
          <button
            onClick={toggleLoop}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-[11px] font-bold transition-all ${
              isLooping 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'bg-slate-800 text-slate-400 border border-transparent hover:bg-slate-700'
            }`}
            title="Toggle Looping"
          >
            <Repeat className="w-3.5 h-3.5" />
            LOOP: {isLooping ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={toggleBox}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-[11px] font-bold transition-all ${
              showBox 
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' 
                : 'bg-slate-800 text-slate-400 border border-transparent hover:bg-slate-700'
            }`}
            title="Toggle Bounding Box Overlay"
          >
            <Scan className="w-3.5 h-3.5" />
            BOX: {showBox ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Video seek timeline status */}
        <div className="text-xs font-mono text-slate-400">
          {currentTime.toFixed(1)}s / {duration.toFixed(1) || '0.0'}s
        </div>

        {/* Zoom & Fullscreen Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={handleZoomOut}
              disabled={zoom <= 1}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono font-bold text-white min-w-[32px] text-center">
              {zoom.toFixed(1)}x
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoom >= 4}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {zoom > 1 && (
              <button
                onClick={handleResetZoom}
                className="p-1.5 text-slate-400 hover:text-white border-l border-slate-700 transition-colors"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AISearch() {
  const [activeTab, setActiveTab] = useState('describe'); // 'describe' | 'class'

  // Describe Search state
  const [description, setDescription] = useState('');
  const [selectedCameraIds, setSelectedCameraIds] = useState([]);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeResults, setDescribeResults] = useState(null);
  const [describeError, setDescribeError] = useState(null);
  const [describeSearched, setDescribeSearched] = useState(false);
  const [groupUniquePersons, setGroupUniquePersons] = useState(true);

  // Active clip state
  const [activeClipId, setActiveClipId] = useState(null);
  const [clipInfo, setClipInfo] = useState(null);
  const [clipLoadingId, setClipLoadingId] = useState(null);

  // Object Class Search state
  const [objectClass, setObjectClass] = useState('person');
  const [minConfidence, setMinConfidence] = useState(0.4);
  const [cameras, setCameras] = useState([]);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [cameraActivity, setCameraActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const toggleCamera = (camId) => {
    setSelectedCameraIds(prev =>
      prev.includes(camId) ? prev.filter(id => id !== camId) : [...prev, camId]
    );
  };

  const selectAllCameras = () => {
    setSelectedCameraIds(cameras.map(c => c.id));
  };

  const clearCameraSelection = () => {
    setSelectedCameraIds([]);
  };

  useEffect(() => {
    camerasAPI.list().then(r => setCameras(r.data)).catch(() => {});
    aiSearchAPI.getDetectionSummary()
      .then(r => setSummary(r.data))
      .catch(() => {});
    aiSearchAPI.getCameraActivity()
      .then(r => setCameraActivity(r.data))
      .catch(() => {});
  }, []);

  // Natural language describe search
  const handleDescribeSearch = useCallback(async (queryText) => {
    const textToSearch = queryText !== undefined ? queryText : description;
    if (!textToSearch.trim()) return;

    setDescribeLoading(true);
    setDescribeError(null);
    setDescribeSearched(true);
    setActiveClipId(null);
    setClipInfo(null);

    try {
      const payload = {
        description: textToSearch,
        camera_ids: selectedCameraIds.length > 0 ? selectedCameraIds : undefined,
        time_from: timeFrom ? new Date(timeFrom).toISOString() : undefined,
        time_to: timeTo ? new Date(timeTo).toISOString() : undefined,
      };
      const res = await aiSearchAPI.describeSearch(payload);
      setDescribeResults(res.data);
    } catch (e) {
      setDescribeError('Forensic description search failed. Check backend status or network connection.');
      setDescribeResults(null);
    } finally {
      setDescribeLoading(false);
    }
  }, [description, selectedCameraIds, timeFrom, timeTo]);

  // Handle jump to clip
  const handleJumpToClip = async (sighting) => {
    const targetId = sighting.primary_track_event_id || sighting.track_event_id;
    if (activeClipId === sighting.track_event_id) {
      // Toggle off
      setActiveClipId(null);
      setClipInfo(null);
      return;
    }

    setClipLoadingId(sighting.track_event_id);
    try {
      // If group sighting with non-DB track event id like "group_xxx", use primary track ID
      const queryId = targetId.startsWith('group_') ? targetId.replace('group_', '') : targetId;
      const res = await aiSearchAPI.getSightingClipInfo(queryId);
      setClipInfo(res.data);
      setActiveClipId(sighting.track_event_id);
    } catch (e) {
      // Fallback inline clip info if endpoint errors
      setClipInfo({
        track_event_id: sighting.track_event_id,
        video_id: sighting.video_id,
        stream_url: `/api/v1/videos/${sighting.video_id}/stream`,
        start_time_offset: sighting.start_time_offset,
        end_time_offset: sighting.end_time_offset,
        camera_name: sighting.camera_name,
        camera_code: sighting.camera_code,
        display_timestamp: sighting.real_world_start_time || `Frame offset ${sighting.start_time_offset}s`,
      });
      setActiveClipId(sighting.track_event_id);
    } finally {
      setClipLoadingId(null);
    }
  };

  // Class Search
  const handleClassSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const payload = {
        object_class: objectClass || undefined,
        camera_ids: selectedCameraIds.length > 0 ? selectedCameraIds : undefined,
        min_confidence: minConfidence,
      };
      const res = await aiSearchAPI.searchByAttributes(payload);
      setResults(res.data.results || []);
    } catch (e) {
      setError('Search failed. Ensure backend is running and videos are processed.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [objectClass, selectedCameraIds, minConfidence]);

  // Render multi-camera selector widget
  const renderCameraSelector = () => (
    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wide">
            Select Cameras for AI Search
          </span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
            selectedCameraIds.length === 0
              ? 'bg-slate-800 text-slate-300 border-slate-700'
              : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
          }`}>
            {selectedCameraIds.length === 0 ? 'All Cameras Active' : `${selectedCameraIds.length} of ${cameras.length} Selected`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={clearCameraSelection}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all border ${
              selectedCameraIds.length === 0
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm font-bold'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            All Cameras
          </button>
          <button
            type="button"
            onClick={selectAllCameras}
            className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-slate-900 text-slate-400 border border-slate-800 hover:text-cyan-300 transition-all"
          >
            Select All
          </button>
          {selectedCameraIds.length > 0 && (
            <button
              type="button"
              onClick={clearCameraSelection}
              className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Camera Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {cameras.map((c) => {
          const isSelected = selectedCameraIds.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCamera(c.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                isSelected
                  ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200 font-bold shadow-sm shadow-cyan-500/20 ring-1 ring-cyan-500/30'
                  : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                isSelected
                  ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold'
                  : 'border-slate-700 bg-slate-800'
              }`}>
                {isSelected && '✓'}
              </div>
              <span>{c.camera_code}</span>
              <span className="text-[10px] opacity-70 hidden md:inline">· {c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Status Helper */}
      <div className="text-[11px] font-mono pt-1 border-t border-slate-900 flex items-center gap-2">
        {selectedCameraIds.length === 0 ? (
          <span className="text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Footage from <strong className="text-slate-300">all cameras</strong> will be searched.
          </span>
        ) : (
          <span className="text-cyan-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>
              Searching <strong className="text-white">only {selectedCameraIds.length} camera{selectedCameraIds.length > 1 ? 's' : ''}</strong>:{' '}
              <span className="text-cyan-400 underline font-semibold">
                {cameras.filter(c => selectedCameraIds.includes(c.id)).map(c => c.camera_code).join(', ')}
              </span>
            </span>
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide font-mono flex items-center gap-2">
            AI FORENSIC SEARCH & DETECTION
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-sans font-normal">
              SENTINEL v2.0
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Locate targeted individuals and objects across processed CCTV streams using natural descriptions or class filters.
          </p>
        </div>

        {/* Mode Navigation Tabs */}
        <div className="flex items-center bg-slate-900/80 p-1 rounded-xl border border-slate-800 self-start">
          <button
            onClick={() => setActiveTab('describe')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'describe'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Describe & Find
          </button>
          <button
            onClick={() => setActiveTab('class')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeTab === 'class'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Object Class Search
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DESCRIBE & FIND (Natural Language Forensic Search)                  */}
      {/* ========================================================================= */}
      {activeTab === 'describe' && (
        <div className="space-y-6">
          {/* Search Box */}
          <div className="glass-panel p-6 rounded-xl border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Describe Subject or Event
              </label>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs font-mono text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                {showFilters ? 'Hide Filters' : 'Camera / Time Filters'}
                {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleDescribeSearch();
                  }
                }}
                placeholder="Type a description e.g. 'man wearing a red cap carrying a black backpack' or 'two kids walking together'..."
                rows={3}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 font-sans focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all resize-none"
              />
            </div>

            {/* Quick Prompts Chips */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase">Quick Suggestions:</span>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setDescription(prompt);
                    handleDescribeSearch(prompt);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-sans bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-all"
                >
                  "{prompt}"
                </button>
              ))}
            </div>

            {/* Multi-Camera Selector */}
            {renderCameraSelector()}

            {/* Collapsible Filters */}
            {showFilters && (
              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase mb-1 block">Time From</label>
                  <input
                    type="datetime-local"
                    value={timeFrom}
                    onChange={(e) => setTimeFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase mb-1 block">Time To</label>
                  <input
                    type="datetime-local"
                    value={timeTo}
                    onChange={(e) => setTimeTo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Rule-based natural language parser active
              </div>
              <button
                id="ai-describe-search-btn"
                onClick={() => handleDescribeSearch()}
                disabled={describeLoading || !description.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                {describeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {describeLoading ? 'Scanning Footage...' : 'Search All Footage'}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {describeError && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {describeError}
            </div>
          )}

          {/* Results List */}
          {describeSearched && !describeLoading && describeResults && (
            <div className="space-y-4">
              {/* Summary Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 glass-panel rounded-xl border-slate-800">
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono font-bold text-white uppercase">
                    FORENSIC SIGHTINGS ({groupUniquePersons ? (describeResults.individual_sightings || 0) : (describeResults.raw_sightings_count || describeResults.total_results || 0)})
                  </span>
                  {describeResults.group_sightings > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      {describeResults.group_sightings} Groups
                    </span>
                  )}
                </div>

                {/* Grouping Toggle */}
                <div className="flex items-center gap-2 bg-slate-950 p-0.5 rounded-lg border border-slate-800 self-start sm:self-auto">
                  <button
                    onClick={() => {
                      setGroupUniquePersons(true);
                      setActiveClipId(null);
                      setClipInfo(null);
                    }}
                    className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                      groupUniquePersons
                        ? 'bg-cyan-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Unique Persons
                  </button>
                  <button
                    onClick={() => {
                      setGroupUniquePersons(false);
                      setActiveClipId(null);
                      setClipInfo(null);
                    }}
                    className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                      !groupUniquePersons
                        ? 'bg-cyan-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Raw Fragments
                  </button>
                </div>
              </div>

              {/* Sightings Grid / List */}
              {((groupUniquePersons ? describeResults.sighting_logs : (describeResults.raw_sighting_logs || describeResults.sighting_logs)) || []).length === 0 ? (
                <div className="glass-panel p-12 text-center rounded-xl border-slate-800 space-y-3">
                  <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-slate-400 font-mono text-sm">No matching sightings found for this description.</p>
                  <p className="text-slate-500 text-xs font-sans">
                    Try broadening your prompt or checking if video footage has been processed with AI MOT tracking.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {((groupUniquePersons ? describeResults.sighting_logs : (describeResults.raw_sighting_logs || describeResults.sighting_logs)) || []).map((sighting) => {
                    const isExpanded = activeClipId === sighting.track_event_id;
                    const isLoadingClip = clipLoadingId === sighting.track_event_id;

                    return (
                      <div
                        key={sighting.track_event_id}
                        className={`glass-panel rounded-xl border transition-all overflow-hidden ${
                          isExpanded ? 'border-cyan-500/60 ring-1 ring-cyan-500/30' : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="p-5 flex flex-col md:flex-row gap-5">
                          {/* Thumbnail / Preview Box */}
                          <div className="w-full md:w-44 h-32 bg-slate-950 rounded-lg border border-slate-800 flex-shrink-0 relative overflow-hidden flex items-center justify-center group">
                            {sighting.thumbnail_url ? (
                              <img
                                src={sighting.thumbnail_url}
                                alt="Sighting thumbnail"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="text-center p-3">
                                <Camera className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                                <span className="text-[10px] font-mono text-slate-500 uppercase">Track Thumbnail</span>
                              </div>
                            )}

                            {sighting.is_group_sighting && (
                              <div className="absolute top-2 left-2 bg-violet-600/90 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow">
                                <Users className="w-3 h-3" />
                                GROUP ({sighting.group_member_count})
                              </div>
                            )}

                            {sighting.is_deduplicated && groupUniquePersons && (
                              <div className="absolute top-2 left-2 bg-cyan-500 text-slate-950 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow">
                                <Users className="w-3 h-3" />
                                UNIQUE PERSON ({sighting.reentry_count})
                              </div>
                            )}
                          </div>

                          {/* Metadata Body */}
                          <div className="flex-1 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                                    {sighting.camera_name}
                                  </h3>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                    {sighting.camera_code}
                                  </span>
                                  {sighting.area_zone && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/60 text-slate-400">
                                      📍 {sighting.area_zone}
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                                  {sighting.has_real_time ? (
                                    <span>{sighting.real_world_start_time} IST</span>
                                  ) : (
                                    <span>Offset {sighting.start_time_offset?.toFixed(1)}s → {sighting.end_time_offset?.toFixed(1)}s</span>
                                  )}
                                </div>
                              </div>

                              {/* Relevance Score Badge */}
                              <div className="text-right flex-shrink-0">
                                <div className="text-xs font-mono font-bold text-cyan-400">
                                  {Math.min(99, Math.max(1, Math.round((sighting.relevance_score || 0) * 100)))}% Match
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono">Confidence</div>
                              </div>
                            </div>

                            {/* Badges Row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                                ⏱ {sighting.is_deduplicated ? `Total duration: ${sighting.total_duration_seconds}s` : `Seen for ${sighting.duration_seconds}s`}
                              </span>

                              {sighting.reentry_count > 1 && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                                  🔄 {sighting.reentry_count} Sightings/Re-entries
                                </span>
                              )}

                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                📍 {sighting.movement_type}
                              </span>

                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${statusColor(sighting.class_name)}`}>
                                {sighting.class_name}
                              </span>

                              {/* Matched Keywords */}
                              {sighting.matched_keywords?.map((kw) => (
                                <span
                                  key={kw}
                                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                                >
                                  <Tag className="w-2.5 h-2.5" />
                                  {kw} ✓
                                </span>
                              ))}
                            </div>

                            {/* Timeline segment selection for unique persons */}
                            {sighting.is_deduplicated && groupUniquePersons && sighting.timeline?.length > 1 && (
                              <div className="mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 space-y-1.5">
                                <div className="text-[10px] uppercase font-mono font-bold text-slate-400">
                                  Sightings & Re-entry Timeline:
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {sighting.timeline.map((item, idx) => {
                                    const isItemPlaying = activeClipId === item.track_event_id;
                                    return (
                                      <button
                                        key={item.track_event_id}
                                        onClick={() => handleJumpToClip(item)}
                                        className={`flex items-center justify-between p-2 rounded border font-mono text-[10px] transition-all text-left ${
                                          isItemPlaying 
                                            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' 
                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1 truncate">
                                          <span className="text-[8px] bg-slate-800 px-1 py-0.5 rounded text-slate-400">#{idx + 1}</span>
                                          <span className="truncate">{item.camera_code}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          <span>{item.start_time_offset?.toFixed(1)}s ({item.duration_seconds}s)</span>
                                          <Play className={`w-2.5 h-2.5 ${isItemPlaying ? 'fill-cyan-300' : ''}`} />
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Footer / Jump Button */}
                            <div className="pt-2 flex items-center justify-between border-t border-slate-800/60">
                              <div className="text-[11px] font-mono text-slate-500">
                                Track ID #{sighting.track_id || 'N/A'} · Detections: {sighting.total_detections}
                              </div>

                              <button
                                onClick={() => handleJumpToClip(sighting)}
                                disabled={isLoadingClip}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
                                  isExpanded
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
                                }`}
                              >
                                {isLoadingClip ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : isExpanded ? (
                                  <X className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-cyan-300" />
                                )}
                                {isExpanded ? 'Close Clip' : 'Jump to Clip'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Inline Video Player Container */}
                        {isExpanded && clipInfo && (
                          <div className="px-5 pb-5">
                            <VideoClipPlayer clipInfo={clipInfo} onClose={() => setActiveClipId(null)} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OBJECT CLASS SEARCH (Existing Functionality Preserved)             */}
      {/* ========================================================================= */}
      {activeTab === 'class' && (
        <div className="space-y-6">
          {/* Search Controls */}
          <div className="glass-panel p-5 rounded-xl border-slate-800 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Class Filter */}
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase mb-1.5 block">Object Class</label>
                <select
                  value={objectClass}
                  onChange={(e) => setObjectClass(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="">All Classes</option>
                  {CLASS_FILTERS.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Confidence */}
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase mb-1.5 block">Min Confidence</label>
                <select
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                >
                  {CONFIDENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Multi-Camera Selector */}
            {renderCameraSelector()}

            <div className="flex items-center gap-3">
              <button
                id="ai-search-btn"
                onClick={handleClassSearch}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-lg shadow-md transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? 'Searching...' : 'Run AI Search'}
              </button>

              {/* Chip filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                {CLASS_FILTERS.slice(0, 4).map((c) => (
                  <button
                    key={c}
                    onClick={() => setObjectClass(c)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                      objectClass === c
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-cyan-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary?.summary?.slice(0, 4).map((item) => (
              <div key={item.class_name} className="glass-panel p-4 rounded-xl border-slate-800 flex items-center gap-3">
                <BarChart2 className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                <div>
                  <div className="text-lg font-bold text-white font-mono">{item.count.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono">{item.class_name}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Results Table */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {searched && !loading && !error && (
            <div className="glass-panel rounded-xl border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
                <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  DETECTION RESULTS
                </h2>
                <span className="text-xs font-mono text-slate-400">{results.length} matches found</span>
              </div>

              {results.length === 0 ? (
                <div className="p-10 text-center text-slate-500 font-mono text-sm">
                  No detections found for the selected filters. Upload and process a video first.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="px-4 pb-3 pt-3">CLASS</th>
                        <th className="px-4 pb-3 pt-3">CAMERA</th>
                        <th className="px-4 pb-3 pt-3">CONFIDENCE</th>
                        <th className="px-4 pb-3 pt-3">FRAME</th>
                        <th className="px-4 pb-3 pt-3">TIMESTAMP</th>
                        <th className="px-4 pb-3 pt-3">BBOX [X Y W H]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {results.map((d) => (
                        <tr key={d.detection_id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${statusColor(d.class_name)}`}>
                              {d.class_name.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-300">
                            <span className="flex items-center gap-1">
                              <Camera className="w-3 h-3 text-slate-500" />
                              {d.camera_code}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                  style={{ width: `${d.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-slate-300">{(d.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-400">#{d.frame_number}</td>
                          <td className="px-4 py-2.5 text-slate-400">{d.timestamp_offset?.toFixed(2)}s</td>
                          <td className="px-4 py-2.5 text-slate-500 text-[10px]">
                            [{d.bbox?.map((v) => v.toFixed(3)).join(', ')}]
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Camera Activity */}
          {cameraActivity.length > 0 && (
            <div className="glass-panel p-5 rounded-xl border-slate-800 space-y-3">
              <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                CAMERA ACTIVITY HEATMAP
              </h2>
              <div className="space-y-2">
                {cameraActivity.map((cam) => {
                  const max = cameraActivity[0]?.detection_count || 1;
                  const pct = (cam.detection_count / max) * 100;
                  return (
                    <div key={cam.camera_id} className="flex items-center gap-3 text-xs font-mono">
                      <span className="w-28 text-slate-400 truncate">{cam.camera_code}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-slate-300 w-12 text-right">{cam.detection_count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
