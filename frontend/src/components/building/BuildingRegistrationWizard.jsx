import React, { useState } from 'react';
import {
  Building2, Layers, Upload, CheckCircle2, AlertCircle, Loader2, X, ArrowRight, ArrowLeft, Image as ImageIcon
} from 'lucide-react';
import { buildingsAPI, floorsAPI } from '../../services/api';

export default function BuildingRegistrationWizard({ onClose, onBuildingCreated }) {
  const [step, setStep] = useState(1); // 1: Details, 2: Floor Blueprints
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1 Form Data
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [floorsCount, setFloorsCount] = useState(3);

  // Created Building & Floors state
  const [createdBuilding, setCreatedBuilding] = useState(null);
  const [floors, setFloors] = useState([]);
  const [blueprintFiles, setBlueprintFiles] = useState({}); // floorId -> File
  const [uploadingFloors, setUploadingFloors] = useState({}); // floorId -> boolean

  // Step 1: Submit Building Details
  const handleStep1Submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Building Name is required.'); return; }
    const buildingCode = code.trim() || `BLDG-${Date.now().toString().slice(-4)}`;
    
    setLoading(true);
    setError(null);
    try {
      const res = await buildingsAPI.create({
        name,
        code: buildingCode,
        description,
        address,
        floors_count: parseInt(floorsCount, 10) || 1,
      });
      const bldg = res.data;
      setCreatedBuilding(bldg);
      setFloors(bldg.floors || []);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create building.');
    } finally {
      setLoading(false);
    }
  };

  // Handle blueprint file selection for a specific floor
  const handleFileSelect = (floorId, file) => {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      alert('Please upload a valid image file (PNG, JPG, JPEG, WebP)');
      return;
    }
    setBlueprintFiles(prev => ({ ...prev, [floorId]: file }));
  };

  // Upload blueprint file for a specific floor
  const handleUploadBlueprint = async (floorId) => {
    const file = blueprintFiles[floorId];
    if (!file) return;

    setUploadingFloors(prev => ({ ...prev, [floorId]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await floorsAPI.uploadBlueprint(floorId, formData);
      const updatedFloor = res.data;

      setFloors(prev => prev.map(f => f.id === floorId ? updatedFloor : f));
      setBlueprintFiles(prev => {
        const copy = { ...prev };
        delete copy[floorId];
        return copy;
      });
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload blueprint.');
    } finally {
      setUploadingFloors(prev => ({ ...prev, [floorId]: false }));
    }
  };

  // Finish Wizard
  const handleFinish = () => {
    if (onBuildingCreated && createdBuilding) {
      onBuildingCreated(createdBuilding);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="glass-panel rounded-2xl border-slate-700 w-full max-w-2xl p-6 space-y-6 mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-mono">NEW BUILDING REGISTRATION</h2>
              <p className="text-xs text-slate-400">Configure multi-floor facilities and blueprints</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Stepper */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-900/80 border border-slate-800 rounded-xl flex-shrink-0 font-mono text-xs">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 1 ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}>1</span>
            Building Details
          </div>
          <div className="h-0.5 flex-1 bg-slate-800 mx-4" />
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 2 ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}>2</span>
            Floor Blueprints Setup
          </div>
        </div>

        {/* Wizard Step Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {step === 1 ? (
            <form id="step1-form" onSubmit={handleStep1Submit} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">Building Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Headquarters"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase block mb-1">Building Code</label>
                  <input
                    type="text"
                    placeholder="e.g. HQ-BLDG-01"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Number of Floors *</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={floorsCount}
                    onChange={e => setFloorsCount(e.target.value)}
                    className="w-32 px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-cyan-400 font-bold focus:outline-none focus:border-cyan-500 text-sm"
                  />
                  <span className="text-slate-400 text-[11px]">
                    Separate blueprints can be uploaded for each floor.
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Primary operational facility with high-security zones"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Facility Address</label>
                <input
                  type="text"
                  placeholder="Block A, Technology Park, Sector 4"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </form>
          ) : (
            <div className="space-y-4 font-mono text-xs">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-300 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">{createdBuilding?.name}</div>
                  <div className="text-[10px] opacity-80">{floors.length} floors configured</div>
                </div>
                <span className="px-2 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-[10px] font-bold text-cyan-300">
                  {createdBuilding?.code}
                </span>
              </div>

              <div className="space-y-3">
                {floors.map((fl) => {
                  const hasBlueprint = Boolean(fl.blueprint_url || fl.blueprint_path);
                  const selectedFile = blueprintFiles[fl.id];
                  const isUploading = uploadingFloors[fl.id];

                  return (
                    <div
                      key={fl.id}
                      className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-cyan-400" />
                          <span className="font-bold text-white text-sm">
                            Floor {fl.floor_number}
                          </span>
                          <span className="text-[11px] text-slate-400">({fl.floor_name})</span>
                        </div>
                        {hasBlueprint ? (
                          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Blueprint Active
                          </span>
                        ) : (
                          <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold">
                            No Blueprint Uploaded
                          </span>
                        )}
                      </div>

                      {/* Blueprint preview or upload dropzone */}
                      <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-950 p-3 rounded-lg border border-slate-800">
                        {hasBlueprint ? (
                          <div className="relative w-full sm:w-36 h-24 bg-slate-900 rounded overflow-hidden border border-slate-800 flex-shrink-0 flex items-center justify-center">
                            <img
                              src={fl.blueprint_url}
                              alt={`Floor ${fl.floor_number} blueprint`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full sm:w-36 h-24 rounded border border-dashed border-slate-800 bg-slate-900/50 flex flex-col items-center justify-center text-slate-500 flex-shrink-0">
                            <ImageIcon className="w-6 h-6 mb-1 text-slate-600" />
                            <span className="text-[9px]">PNG, JPG, WebP</span>
                          </div>
                        )}

                        <div className="flex-1 space-y-2 w-full">
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            onChange={e => handleFileSelect(fl.id, e.target.files[0])}
                            className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-mono file:font-bold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 file:cursor-pointer border border-slate-800 rounded-lg bg-slate-900/50 p-1.5"
                          />

                          {selectedFile && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-cyan-300 truncate max-w-[200px]">{selectedFile.name}</span>
                              <button
                                onClick={() => handleUploadBlueprint(fl.id)}
                                disabled={isUploading}
                                className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded text-[11px] font-bold shadow-md transition-colors disabled:opacity-50"
                              >
                                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                                {isUploading ? 'Uploading...' : 'Save Blueprint'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 flex-shrink-0 font-mono text-xs">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-400 hover:text-white bg-slate-800 border border-slate-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Details
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-white bg-slate-800 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
          )}

          {step === 1 ? (
            <button
              form="step1-form"
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg font-bold shadow-md disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              {loading ? 'Creating Building...' : 'Next: Configure Floors →'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-lg font-bold shadow-md transition-all"
            >
              <CheckCircle2 className="w-4 h-4" /> Finish & View Building
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
