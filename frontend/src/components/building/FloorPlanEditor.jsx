import React, { useState, useRef, useEffect } from 'react';
import {
  Camera as CameraIcon, Save, Plus, Trash2, X, Compass, Move, RotateCw,
  CheckCircle2, AlertCircle, Loader2, Layers, Grid, ChevronRight, MapPin, Eye, Link2, Shield
} from 'lucide-react';
import { camerasAPI, cameraConnectionsAPI } from '../../services/api';

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

const COMMON_ZONES = [
  'Main Entrance', 'Lobby', 'Corridor', 'Parking', 'Staircase',
  'Restricted Area', 'Reception', 'Warehouse', 'Perimeter Exit', 'Elevator Hall'
];

export default function FloorPlanEditor({ floor, building, unassignedCameras = [], onClose, onSaved }) {
  const canvasRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selected camera for configuration panel
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [draggingCamId, setDraggingCamId] = useState(null);

  // Connection creation mode
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceCamId, setConnectSourceCamId] = useState(null);

  // Add camera modal / state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCamCode, setNewCamCode] = useState('');
  const [newCamName, setNewCamName] = useState('');
  const [newCamZone, setNewCamZone] = useState('Main Entrance');
  const [newCamDesc, setNewCamDesc] = useState('');

  // Load cameras for this floor
  const loadFloorCameras = async () => {
    setLoading(true);
    try {
      const [cRes, connRes] = await Promise.all([
        camerasAPI.list({ floor_id: floor.id }),
        cameraConnectionsAPI.list(building.id)
      ]);
      setCameras(cRes.data || []);
      setConnections(connRes.data || []);
    } catch (err) {
      console.error('Failed to load floor cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (floor?.id) loadFloorCameras();
  }, [floor?.id]);

  // Canvas Drag & Drop handlers
  const handleCanvasMouseDown = (e) => {
    if (!canvasRef.current || connectMode) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    // Check if clicked near an existing camera marker (within ~5% threshold)
    const targetCam = cameras.find(c =>
      Math.abs(c.position_x - clickX) < 4 && Math.abs(c.position_y - clickY) < 4
    );

    if (targetCam) {
      setDraggingCamId(targetCam.id);
      setSelectedCamera(targetCam);
    } else {
      setSelectedCamera(null);
    }
  };

  const handleMouseMove = (e) => {
    if (!draggingCamId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let newX = ((e.clientX - rect.left) / rect.width) * 100;
    let newY = ((e.clientY - rect.top) / rect.height) * 100;

    // Clamp coordinates to [2%, 98%] canvas boundary
    newX = Math.max(2, Math.min(98, newX));
    newY = Math.max(2, Math.min(98, newY));

    setCameras(prev => prev.map(c => c.id === draggingCamId ? { ...c, position_x: newX, position_y: newY } : c));
  };

  const handleMouseUp = () => {
    setDraggingCamId(null);
  };

  // Add camera onto floor plan
  const handleCreateCamera = async (e) => {
    e.preventDefault();
    if (!newCamCode || !newCamName) return;

    try {
      const res = await camerasAPI.create({
        camera_code: newCamCode,
        name: newCamName,
        building_id: building.id,
        floor_id: floor.id,
        area_zone: newCamZone,
        location_description: newCamDesc || newCamName,
        position_x: 50.0,
        position_y: 50.0,
        direction_angle: 0.0,
        status: 'ONLINE'
      });

      const newCam = res.data;
      setCameras(prev => [...prev, newCam]);
      setSelectedCamera(newCam);
      setShowAddModal(false);
      setNewCamCode('');
      setNewCamName('');
      setNewCamDesc('');
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create camera.');
    }
  };

  // Assign existing unassigned camera to floor
  const handleAssignUnassignedCamera = async (cam) => {
    try {
      const res = await camerasAPI.update(cam.id, {
        building_id: building.id,
        floor_id: floor.id,
        position_x: 50.0,
        position_y: 50.0
      });
      setCameras(prev => [...prev, res.data]);
      setSelectedCamera(res.data);
    } catch (err) {
      alert('Failed to assign camera to floor.');
    }
  };

  // Remove camera from floor plan (unassign floor_id)
  const handleRemoveCameraFromFloor = async (camId) => {
    if (!window.confirm('Remove this camera from floor plan? Camera record and videos will be preserved.')) return;
    try {
      await camerasAPI.update(camId, { floor_id: null });
      setCameras(prev => prev.filter(c => c.id !== camId));
      if (selectedCamera?.id === camId) setSelectedCamera(null);
    } catch (err) {
      alert('Failed to remove camera from floor.');
    }
  };

  // Handle Camera Connection click
  const handleCameraMarkerClick = (cam) => {
    if (connectMode) {
      if (!connectSourceCamId) {
        setConnectSourceCamId(cam.id);
      } else if (connectSourceCamId !== cam.id) {
        // Create connection
        createConnection(connectSourceCamId, cam.id);
        setConnectSourceCamId(null);
        setConnectMode(false);
      }
    } else {
      setSelectedCamera(cam);
    }
  };

  const createConnection = async (sourceId, targetId) => {
    try {
      const res = await cameraConnectionsAPI.create({
        source_camera_id: sourceId,
        target_camera_id: targetId,
        description: 'Movement Path'
      });
      setConnections(prev => [...prev, res.data]);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to connect cameras.');
    }
  };

  // Save all camera positions & angles
  const handleSaveArrangement = async () => {
    setSaving(true);
    try {
      await camerasAPI.reorder(cameras.map(c => ({
        id: c.id,
        position_x: c.position_x,
        position_y: c.position_y,
        direction_angle: c.direction_angle || 0.0,
        floor_id: floor.id,
        area_zone: c.area_zone
      })));
      if (onSaved) onSaved();
      alert('Floor plan camera arrangement saved successfully!');
    } catch (err) {
      alert('Failed to save camera positions.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <div className="glass-panel rounded-2xl border-slate-700 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        {/* Editor Top Bar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90 flex-shrink-0 font-mono text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">{building?.name}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-cyan-400 font-bold text-sm">
                  {floor?.floor_name || `Floor ${floor?.floor_number}`}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Visual Floor Plan Camera Editor & Normalized Orientation Placement</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setConnectMode(!connectMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${connectMode ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
            >
              <Link2 className="w-3.5 h-3.5 text-cyan-400" />
              {connectMode ? 'Click 2nd Camera to Link' : '+ Add Camera Link'}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-400 border border-slate-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Register Camera
            </button>
            <button
              onClick={handleSaveArrangement}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg font-bold font-mono shadow-md disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save Arrangement'}
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded-lg bg-slate-800 border border-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Canvas & Configuration Sidebar Layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          {/* Blueprint Canvas Viewport */}
          <div
            className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center p-4 select-none cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Background Grid Pattern */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(to right, #06b6d4 1px, transparent 1px), linear-gradient(to bottom, #06b6d4 1px, transparent 1px)',
                backgroundSize: '40px 40px'
              }}
            />

            {/* Blueprint Container */}
            <div
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              className="relative max-w-full max-h-full rounded-xl overflow-hidden border-2 border-slate-800 shadow-2xl bg-slate-900 flex items-center justify-center"
              style={{ aspectRatio: '16/9', width: '100%', maxWidth: '1000px' }}
            >
              {floor?.blueprint_url ? (
                <img
                  src={floor.blueprint_url}
                  alt={`Floor ${floor.floor_number} Blueprint`}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center text-slate-600 space-y-3 font-mono">
                  <Grid className="w-12 h-12 text-slate-700" />
                  <div>
                    <p className="text-sm font-bold text-slate-400">NO BLUEPRINT IMAGE UPLOADED</p>
                    <p className="text-xs text-slate-600 mt-1">Upload a floor blueprint image using the registration wizard</p>
                  </div>
                </div>
              )}

              {/* Render Camera-to-Camera Connection Vectors */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                {connections.map(conn => {
                  const sourceCam = cameras.find(c => c.id === conn.source_camera_id);
                  const targetCam = cameras.find(c => c.id === conn.target_camera_id);
                  if (!sourceCam || !targetCam) return null;

                  return (
                    <g key={conn.id}>
                      <line
                        x1={`${sourceCam.position_x}%`}
                        y1={`${sourceCam.position_y}%`}
                        x2={`${targetCam.position_x}%`}
                        y2={`${targetCam.position_y}%`}
                        stroke="#06b6d4"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        opacity="0.8"
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Render Placed Camera Markers */}
              {cameras.map((cam) => {
                const isSelected = selectedCamera?.id === cam.id;
                const angle = cam.direction_angle || 0;
                const compass = getCompassDirection(angle);

                return (
                  <div
                    key={cam.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCameraMarkerClick(cam);
                    }}
                    className={`absolute z-20 flex flex-col items-center cursor-grab active:cursor-grabbing transition-transform ${isSelected ? 'scale-110' : 'hover:scale-105'}`}
                    style={{
                      left: `${cam.position_x}%`,
                      top: `${cam.position_y}%`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    {/* Directional Vision Indicator Pointer */}
                    <div
                      className="absolute w-12 h-12 rounded-full border border-cyan-400/30 bg-cyan-500/10 pointer-events-none flex items-start justify-center"
                      style={{ transform: `rotate(${angle}deg)` }}
                    >
                      <div className="w-2 h-2 bg-cyan-400 rounded-full mt-0.5 shadow-sm shadow-cyan-400" />
                    </div>

                    {/* Camera Badge Icon */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-lg transition-all ${isSelected ? 'bg-cyan-500 text-slate-950 border-white ring-4 ring-cyan-500/30' : 'bg-slate-900/90 text-cyan-400 border-cyan-400/80 hover:border-cyan-300'}`}>
                      <CameraIcon className="w-4 h-4" />
                    </div>

                    {/* Camera Label & Area Tag */}
                    <div className="mt-1 flex flex-col items-center font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-800 text-[9px] font-bold text-cyan-300 shadow">
                        {cam.camera_code} ({compass})
                      </span>
                      {cam.area_zone && (
                        <span className="text-[8px] text-slate-400 bg-slate-900/80 px-1 rounded mt-0.5">
                          {cam.area_zone}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Configuration Sidebar / Drawer */}
          <div className="w-full lg:w-80 bg-slate-900/95 border-l border-slate-800 p-4 space-y-4 font-mono text-xs overflow-y-auto flex-shrink-0">
            {selectedCamera ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                    <CameraIcon className="w-4 h-4 text-cyan-400" /> CAMERA DETAILS
                  </h3>
                  <button onClick={() => setSelectedCamera(null)} className="text-slate-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">Camera Code / ID *</label>
                    <input
                      type="text"
                      value={selectedCamera.camera_code}
                      onChange={e => setSelectedCamera({ ...selectedCamera, camera_code: e.target.value })}
                      onBlur={() => {
                        setCameras(prev => prev.map(c => c.id === selectedCamera.id ? selectedCamera : c));
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-cyan-300 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">Camera Name *</label>
                    <input
                      type="text"
                      value={selectedCamera.name}
                      onChange={e => setSelectedCamera({ ...selectedCamera, name: e.target.value })}
                      onBlur={() => {
                        setCameras(prev => prev.map(c => c.id === selectedCamera.id ? selectedCamera : c));
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase block mb-1">Area / Zone</label>
                    <input
                      type="text"
                      list="zone-suggestions"
                      placeholder="e.g. Main Entrance"
                      value={selectedCamera.area_zone || ''}
                      onChange={e => {
                        const updated = { ...selectedCamera, area_zone: e.target.value };
                        setSelectedCamera(updated);
                        setCameras(prev => prev.map(c => c.id === updated.id ? updated : c));
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100"
                    />
                    <datalist id="zone-suggestions">
                      {COMMON_ZONES.map(z => <option key={z} value={z} />)}
                    </datalist>
                  </div>

                  {/* Direction Angle Dial Slider */}
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 font-bold flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-cyan-400" /> Viewing Direction:
                      </span>
                      <span className="text-cyan-300 font-bold">
                        {Math.round(selectedCamera.direction_angle || 0)}° ({getCompassDirection(selectedCamera.direction_angle)})
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={selectedCamera.direction_angle || 0}
                      onChange={e => {
                        const angle = parseFloat(e.target.value);
                        const updated = { ...selectedCamera, direction_angle: angle, orientation: getCompassDirection(angle) };
                        setSelectedCamera(updated);
                        setCameras(prev => prev.map(c => c.id === updated.id ? updated : c));
                      }}
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Camera Clock Time Drift Offset */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="uppercase">Clock Time Offset (seconds)</span>
                      <span className="text-cyan-300 font-bold">{selectedCamera.time_offset_seconds || 0.0}s</span>
                    </div>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="0.0"
                      value={selectedCamera.time_offset_seconds || 0.0}
                      onChange={e => {
                        const offset = parseFloat(e.target.value) || 0.0;
                        const updated = { ...selectedCamera, time_offset_seconds: offset };
                        setSelectedCamera(updated);
                        setCameras(prev => prev.map(c => c.id === updated.id ? updated : c));
                      }}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs"
                    />
                    <span className="text-[9px] text-slate-500 block mt-0.5">Used for cross-camera temporal clock synchronization (e.g. -12.0s)</span>
                  </div>

                  {/* Normalized Position Coordinates (Read-only / drag indicator) */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 bg-slate-950 p-2.5 rounded border border-slate-800">
                    <div>X Pos: <span className="text-cyan-300 font-bold">{selectedCamera.position_x.toFixed(1)}%</span></div>
                    <div>Y Pos: <span className="text-cyan-300 font-bold">{selectedCamera.position_y.toFixed(1)}%</span></div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between gap-2">
                    <button
                      onClick={() => handleRemoveCameraFromFloor(selectedCamera.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-[11px] font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove from Floor
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-2">
                  <h3 className="font-bold text-white text-sm">FLOOR CAMERAS ({cameras.length})</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Click camera marker to edit orientation & details</p>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {cameras.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCamera(c)}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/40 cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-cyan-300">{c.camera_code}</div>
                        <div className="text-[10px] text-slate-400">{c.name}</div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {Math.round(c.direction_angle || 0)}°
                      </span>
                    </div>
                  ))}

                  {cameras.length === 0 && (
                    <div className="py-6 text-center text-slate-500 font-mono text-[11px]">
                      No cameras placed on this floor yet. Click "+ Register Camera" or assign unassigned nodes below.
                    </div>
                  )}
                </div>

                {/* Unassigned Cameras Section */}
                {unassignedCameras.length > 0 && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <h4 className="font-bold text-amber-400 text-xs flex items-center justify-between">
                      <span>UNASSIGNED CAMERAS ({unassignedCameras.length})</span>
                    </h4>
                    <div className="space-y-1.5">
                      {unassignedCameras.map(uCam => (
                        <div key={uCam.id} className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-[11px]">
                          <div>
                            <span className="text-slate-200 font-bold">{uCam.camera_code}</span>
                            <span className="text-slate-500 block text-[9px]">{uCam.name}</span>
                          </div>
                          <button
                            onClick={() => handleAssignUnassignedCamera(uCam)}
                            className="px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-[10px] font-bold"
                          >
                            + Place
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Register Camera Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl border-slate-700 w-full max-w-md p-6 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <CameraIcon className="w-4 h-4 text-cyan-400" /> REGISTER NEW CAMERA NODE
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCamera} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Camera Code / ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CAM-05"
                  value={newCamCode}
                  onChange={e => setNewCamCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Camera Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. East Gate Reception"
                  value={newCamName}
                  onChange={e => setNewCamName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Area / Zone</label>
                <input
                  type="text"
                  list="new-zone-suggestions"
                  placeholder="e.g. Main Entrance"
                  value={newCamZone}
                  onChange={e => setNewCamZone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-slate-100 focus:border-cyan-500"
                />
                <datalist id="new-zone-suggestions">
                  {COMMON_ZONES.map(z => <option key={z} value={z} />)}
                </datalist>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-400 rounded hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded shadow-md"
                >
                  Place Camera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
