import React, { useState, useEffect, useRef } from 'react';
import {
  Navigation,
  Play,
  Pause,
  RotateCcw,
  MapPin,
  Clock,
  Shield,
  Activity,
  Sliders,
  FolderPlus,
  CheckCircle2,
  AlertTriangle,
  Maximize2,
  Minimize2,
  ChevronRight,
  Layers
} from 'lucide-react';
import { trajectoriesAPI, casesAPI } from '../services/api';

export default function SpatialTrajectoryViewer({
  trackEventId = null,
  subjectId = null,
  initialData = null,
  onClose = null,
}) {
  const [loading, setLoading] = useState(!initialData);
  const [trajectoryData, setTrajectoryData] = useState(initialData);
  const [minSimilarity, setMinSimilarity] = useState(0.55);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [casesList, setCasesList] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [syncingCase, setSyncingCase] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(null);
  const [showCaseModal, setShowCaseModal] = useState(false);

  const containerRef = useRef(null);
  const timerRef = useRef(null);

  // Fetch trajectory data if not passed directly
  const fetchTrajectory = async () => {
    setLoading(true);
    try {
      let res;
      if (trackEventId) {
        res = await trajectoriesAPI.getTrackTrajectory(trackEventId, minSimilarity);
      } else if (subjectId) {
        res = await trajectoriesAPI.getSubjectTrajectory(subjectId, minSimilarity);
      }
      if (res && res.data) {
        setTrajectoryData(res.data);
        if (res.data.waypoints && res.data.waypoints.length > 0) {
          setSelectedWaypoint(res.data.waypoints[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load spatial trajectory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialData && (trackEventId || subjectId)) {
      fetchTrajectory();
    } else if (initialData) {
      setTrajectoryData(initialData);
      if (initialData.waypoints && initialData.waypoints.length > 0) {
        setSelectedWaypoint(initialData.waypoints[0]);
      }
    }
  }, [trackEventId, subjectId, minSimilarity]);

  // Load cases for sync option
  useEffect(() => {
    casesAPI.list('OPEN').then(res => {
      if (res.data && res.data.length > 0) {
        setCasesList(res.data);
        setSelectedCaseId(res.data[0].id);
      }
    }).catch(() => {});
  }, []);

  // Animation player timer
  useEffect(() => {
    if (isPlaying && trajectoryData?.waypoints?.length > 1) {
      timerRef.current = setInterval(() => {
        setActiveStepIndex(prev => {
          const next = (prev + 1) % trajectoryData.waypoints.length;
          setSelectedWaypoint(trajectoryData.waypoints[next]);
          if (next === trajectoryData.waypoints.length - 1) {
            setIsPlaying(false);
          }
          return next;
        });
      }, 2500 / playbackSpeed);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, trajectoryData, playbackSpeed]);

  const handleSyncToCase = async () => {
    if (!selectedCaseId) return;
    setSyncingCase(true);
    setSyncSuccess(null);
    try {
      const payload = {
        track_event_id: trackEventId || (trajectoryData?.waypoints?.[0]?.track_event_id),
        subject_id: subjectId,
        min_similarity: minSimilarity
      };
      const res = await trajectoriesAPI.syncToCase(selectedCaseId, payload);
      setSyncSuccess(res.data.message || 'Successfully attached trajectory to case file.');
      setTimeout(() => setShowCaseModal(false), 2000);
    } catch (err) {
      console.error('Failed to sync to case:', err);
      setSyncSuccess('Error: Could not attach to case.');
    } finally {
      setSyncingCase(false);
    }
  };

  const waypoints = trajectoryData?.waypoints || [];
  const narrative = trajectoryData?.narrative_report;

  // Toggle Fullscreen
  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullScreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullScreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`bg-slate-950 text-slate-100 rounded-2xl border border-cyan-900/40 shadow-2xl overflow-hidden flex flex-col ${
        isFullScreen ? 'w-screen h-screen fixed inset-0 z-50 rounded-none' : 'w-full min-h-[750px]'
      }`}
    >
      {/* ─── Top Control Header ─────────────────────────────────────────── */}
      <div className="bg-slate-900/90 backdrop-blur-md px-6 py-4 border-b border-cyan-900/30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-950/80 border border-cyan-500/40 rounded-xl text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Navigation className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono tracking-widest text-cyan-400 font-semibold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                Spatial Trajectory AI
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {trajectoryData?.building ? `${trajectoryData.building.name} • ${trajectoryData.floor?.floor_name || 'Ground'}` : 'Cross-Camera Spatial Graph'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2 mt-0.5">
              Subject Path Reconstruction: <span className="text-cyan-300 font-mono">#{trajectoryData?.track_id || trackEventId || 'TARGET'}</span>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-normal">
                {waypoints.length} Surveillance Nodes Traversed
              </span>
            </h2>
          </div>
        </div>

        {/* Top Action Bar */}
        <div className="flex items-center gap-3">
          {/* Similarity Filter Slider */}
          <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
            <Sliders className="text-cyan-400 w-4 h-4" />
            <span className="text-slate-400">Re-ID Match:</span>
            <span className="text-cyan-300 font-bold">{Math.round(minSimilarity * 100)}%</span>
            <input
              type="range"
              min="0.40"
              max="0.90"
              step="0.05"
              value={minSimilarity}
              onChange={(e) => setMinSimilarity(parseFloat(e.target.value))}
              className="w-20 accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
          </div>

          {/* Sync to Case Button */}
          <button
            onClick={() => setShowCaseModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition-all shadow-md active:scale-95"
          >
            <FolderPlus className="w-4 h-4" />
            Attach to Case
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullScreen}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700/60 transition"
            title={isFullScreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800/40 rounded-lg text-xs font-mono transition"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* ─── Main Content Grid: Interactive Blueprint + Forensic Narrative ─── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        
        {/* LEFT / CENTER: Interactive Blueprint Spatial Canvas (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-950 flex flex-col relative border-r border-cyan-900/30 overflow-hidden">
          
          {/* Blueprint Canvas Header Status */}
          <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-cyan-800/40 text-xs font-mono shadow-lg flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span className="text-cyan-300 font-semibold">LIVE SPATIAL GRAPH</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">Transit: {trajectoryData?.total_transit_formatted || '0s'}</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">Dwell: {trajectoryData?.total_dwell_formatted || '0s'}</span>
            </div>
          </div>

          {/* Canvas Floorplan Container */}
          <div className="flex-1 relative flex items-center justify-center p-6 bg-[radial-gradient(#0f172a_1px,transparent_1px)] [background-size:24px_24px] overflow-hidden min-h-[480px]">
            
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 text-cyan-400">
                <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="font-mono text-xs tracking-wider">COMPUTING RE-ID SPATIOTEMPORAL TRAJECTORY...</span>
              </div>
            ) : waypoints.length === 0 ? (
              <div className="text-center p-8 bg-slate-900/60 rounded-xl border border-slate-800 max-w-md">
                <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                <h4 className="font-semibold text-slate-200">No Cross-Camera Path Found</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Try lowering the Re-ID Match threshold slider or verify that camera nodes have spatial coordinates configured.
                </p>
              </div>
            ) : (
              <div className="relative w-full h-full max-w-[850px] max-h-[580px] aspect-[16/10] bg-slate-900/60 rounded-xl border border-cyan-900/40 shadow-[inset_0_0_40px_rgba(6,182,212,0.05)] overflow-hidden flex items-center justify-center">
                
                {/* Floor Blueprint Image if present */}
                {trajectoryData?.floor?.blueprint_path ? (
                  <img
                    src={`/api/v1/floors/${trajectoryData.floor.id}/blueprint-file`}
                    alt="Floor Blueprint"
                    className="absolute inset-0 w-full h-full object-contain opacity-35 filter brightness-110 contrast-125 pointer-events-none"
                  />
                ) : (
                  /* Synthetic Grid Vector Floorplan overlay */
                  <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#06b6d4" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                  </svg>
                )}

                {/* SVG Vector Path Layers for Spatial Lines & Directional Arrows */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                  <defs>
                    <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
                      <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.95" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <marker
                      id="arrow"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#06b6d4" />
                    </marker>
                  </defs>

                  {/* Render connected trajectory segments */}
                  {waypoints.map((wp, idx) => {
                    if (idx === 0) return null;
                    const prev = waypoints[idx - 1];
                    const isSegmentActive = idx <= activeStepIndex;
                    
                    return (
                      <g key={`path-${idx}`}>
                        {/* Glow underlayer */}
                        <line
                          x1={`${prev.position_x}%`}
                          y1={`${prev.position_y}%`}
                          x2={`${wp.position_x}%`}
                          y2={`${wp.position_y}%`}
                          stroke={isSegmentActive ? '#06b6d4' : '#334155'}
                          strokeWidth={isSegmentActive ? '4' : '2'}
                          strokeOpacity={isSegmentActive ? '0.4' : '0.2'}
                          filter={isSegmentActive ? 'url(#glow)' : undefined}
                        />
                        {/* Animated Main Directional Vector */}
                        <line
                          x1={`${prev.position_x}%`}
                          y1={`${prev.position_y}%`}
                          x2={`${wp.position_x}%`}
                          y2={`${wp.position_y}%`}
                          stroke={isSegmentActive ? 'url(#pathGradient)' : '#475569'}
                          strokeWidth="2.5"
                          strokeDasharray={isSegmentActive ? '6,6' : '3,3'}
                          className={isSegmentActive ? 'animate-[dash_1s_linear_infinite]' : ''}
                          markerEnd={isSegmentActive ? 'url(#arrow)' : undefined}
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Render Interactive Camera Waypoint Node Pins */}
                {waypoints.map((wp, idx) => {
                  const isSelected = selectedWaypoint?.sequence_index === wp.sequence_index;
                  const isCurrentAnim = activeStepIndex === idx;
                  const isOrigin = idx === 0;
                  const isFinal = idx === waypoints.length - 1;

                  return (
                    <div
                      key={`wp-${wp.sequence_index}`}
                      onClick={() => {
                        setSelectedWaypoint(wp);
                        setActiveStepIndex(idx);
                      }}
                      style={{
                        left: `${wp.position_x}%`,
                        top: `${wp.position_y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className="absolute z-20 cursor-pointer group"
                    >
                      {/* Pulse ring for active waypoint */}
                      {(isSelected || isCurrentAnim) && (
                        <span className="absolute -inset-2 rounded-full bg-cyan-400/30 animate-ping"></span>
                      )}

                      {/* Main Node Pin Circle */}
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all shadow-xl ${
                          isOrigin
                            ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/30'
                            : isFinal
                            ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/30'
                            : isSelected || isCurrentAnim
                            ? 'bg-cyan-400 text-slate-950 ring-4 ring-cyan-400/40 scale-110'
                            : 'bg-slate-800 text-cyan-300 border border-cyan-700/60 hover:border-cyan-400 hover:scale-105'
                        }`}
                      >
                        {wp.sequence_index}
                      </div>

                      {/* Floating Tooltip Label */}
                      <div className="absolute top-10 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/95 backdrop-blur-sm border border-cyan-800/60 px-2.5 py-1 rounded-md shadow-2xl whitespace-nowrap z-30 flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-bold text-cyan-300 font-mono uppercase">
                          {wp.camera_code} • {wp.area_zone}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          Dwell: {wp.dwell_formatted} | Match: {Math.round(wp.composite_confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Bottom Scrubber & Journey Controls ──────────────────────── */}
          <div className="bg-slate-900/80 backdrop-blur-sm px-6 py-3 border-t border-cyan-900/30 flex flex-wrap items-center justify-between gap-4 z-20">
            {/* Playback Transport */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={waypoints.length < 2}
                className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition shadow-lg"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Pause Playback' : 'Simulate Journey'}
              </button>

              <button
                onClick={() => {
                  setIsPlaying(false);
                  setActiveStepIndex(0);
                  if (waypoints.length > 0) setSelectedWaypoint(waypoints[0]);
                }}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                title="Reset to Origin"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Playback speed selector */}
              <div className="flex items-center bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs font-mono ml-2">
                {[1, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-2 py-0.5 rounded transition ${
                      playbackSpeed === speed
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Stepper Dots & Status */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400">
                Waypoint <strong className="text-cyan-300">{activeStepIndex + 1}</strong> of {waypoints.length}
              </span>
              <div className="flex items-center gap-1.5">
                {waypoints.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setIsPlaying(false);
                      setActiveStepIndex(i);
                      setSelectedWaypoint(waypoints[i]);
                    }}
                    className={`h-2 rounded-full transition-all ${
                      i === activeStepIndex
                        ? 'w-6 bg-cyan-400 shadow-[0_0_8px_#06b6d4]'
                        : i < activeStepIndex
                        ? 'w-2 bg-cyan-800'
                        : 'w-2 bg-slate-800 hover:bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Forensic Narrative & Selected Waypoint Details (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900/60 flex flex-col overflow-y-auto max-h-[750px] p-5 space-y-5">
          
          {/* Selected Waypoint Card Preview */}
          {selectedWaypoint ? (
            <div className="bg-slate-900/90 rounded-xl border border-cyan-900/50 p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center font-mono text-xs font-bold">
                    {selectedWaypoint.sequence_index}
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-100 font-mono">
                      {selectedWaypoint.camera_code} • {selectedWaypoint.area_zone}
                    </h4>
                    <span className="text-[11px] text-slate-400">{selectedWaypoint.camera_name}</span>
                  </div>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  selectedWaypoint.is_source
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                    : 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                }`}>
                  {selectedWaypoint.is_source ? 'ORIGIN SEED' : `${Math.round(selectedWaypoint.composite_confidence * 100)}% RE-ID MATCH`}
                </span>
              </div>

              {/* Waypoint Thumbnail & Metrics */}
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-4 aspect-[3/4] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                  {selectedWaypoint.thumbnail_url ? (
                    <img
                      src={selectedWaypoint.thumbnail_url}
                      alt="Crop Sighting"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-2 text-slate-600 font-mono text-[10px]">
                      NO THUMBNAIL
                    </div>
                  )}
                </div>

                <div className="col-span-8 space-y-2 text-xs font-mono">
                  <div className="flex justify-between border-b border-slate-800/60 pb-1">
                    <span className="text-slate-400">Dwell Time:</span>
                    <span className="text-cyan-300 font-semibold">{selectedWaypoint.dwell_formatted}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1">
                    <span className="text-slate-400">Transit Duration:</span>
                    <span className="text-slate-200">{selectedWaypoint.transit_formatted}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1">
                    <span className="text-slate-400">Timestamp:</span>
                    <span className="text-slate-300 text-[11px]">
                      {selectedWaypoint.real_world_start_time
                        ? new Date(selectedWaypoint.real_world_start_time).toLocaleTimeString()
                        : `+${selectedWaypoint.start_time_offset.toFixed(1)}s`}
                    </span>
                  </div>
                  {selectedWaypoint.heading_direction && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Heading:</span>
                      <span className="text-amber-400 font-bold">{selectedWaypoint.heading_direction}-Bound</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* ─── Automated Forensic Chronological Narrative ────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-cyan-400" />
                Forensic Narrative Report
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">ISO/IEC 27037 Standard</span>
            </div>

            {narrative && (
              <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-4 space-y-3 text-xs">
                <p className="text-slate-300 leading-relaxed text-[11px] border-b border-slate-800/80 pb-3">
                  {narrative.summary}
                </p>

                {/* Chronological Steps */}
                <div className="space-y-3 pt-1">
                  {narrative.steps?.map((step, sIdx) => {
                    const isStepActive = selectedWaypoint?.sequence_index === step.sequence;
                    return (
                      <div
                        key={sIdx}
                        onClick={() => {
                          setActiveStepIndex(sIdx);
                          if (waypoints[sIdx]) setSelectedWaypoint(waypoints[sIdx]);
                        }}
                        className={`p-3 rounded-lg border transition cursor-pointer flex gap-3 ${
                          isStepActive
                            ? 'bg-cyan-950/40 border-cyan-500/50 shadow-md'
                            : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold ${
                            isStepActive ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {step.sequence}
                          </span>
                          {sIdx < narrative.steps.length - 1 && (
                            <span className="w-0.5 flex-1 bg-slate-800 my-1"></span>
                          )}
                        </div>

                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-cyan-300 font-bold text-[11px]">
                              {step.area_zone}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {step.timestamp_label}
                            </span>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-snug">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Attach to Case Modal ────────────────────────────────────────── */}
      {showCaseModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-800/60 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <FolderPlus className="text-cyan-400 w-4 h-4" />
                Attach Trajectory to Investigation Case
              </h3>
              <button
                onClick={() => setShowCaseModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will automatically convert all {waypoints.length} multi-camera trajectory waypoints into structured timeline events attached to the selected case.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-mono text-slate-400">Select Active Case:</label>
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {casesList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.case_number} — {c.title} ({c.priority})
                  </option>
                ))}
              </select>
            </div>

            {syncSuccess && (
              <div className={`p-3 rounded-lg text-xs font-mono flex items-center gap-2 ${
                syncSuccess.includes('Error') ? 'bg-red-950/60 text-red-300 border border-red-800' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
              }`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {syncSuccess}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCaseModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSyncToCase}
                disabled={syncingCase || !selectedCaseId}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-lg flex items-center gap-2"
              >
                {syncingCase ? 'Syncing Waypoints...' : 'Confirm Attachment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
