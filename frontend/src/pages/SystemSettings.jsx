import React, { useState, useEffect } from 'react';
import { Settings, Cpu, Shield, Key, Server, HardDrive, CheckCircle2, Save, RefreshCw, Activity } from 'lucide-react';
import api from '../services/api';

export default function SystemSettings() {
  const [yoloModel, setYoloModel] = useState('yolo11s.pt');
  const [targetMode, setTargetMode] = useState('person_and_bags');
  const [sampleFps, setSampleFps] = useState(3);
  const [yoloConf, setYoloConf] = useState(0.20);
  const [personConf, setPersonConf] = useState(0.15);
  const [bagConf, setBagConf] = useState(0.18);
  const [occludedRecovery, setOccludedRecovery] = useState(true);
  const [trackBuffer, setTrackBuffer] = useState(30);
  const [reidThreshold, setReidThreshold] = useState(0.75);
  const [llmProvider, setLlmProvider] = useState('gemini');
  const [health, setHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const checkHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await api.get('/health');
      setHealth(res.data);
    } catch {
      setHealth({ status: 'UNREACHABLE', system: 'SENTINEL AI Backend' });
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    checkHealth();
    // Load saved settings from localStorage
    const saved = localStorage.getItem('sentinel_sys_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.yoloModel) setYoloModel(parsed.yoloModel);
        if (parsed.targetMode) setTargetMode(parsed.targetMode);
        if (parsed.sampleFps) setSampleFps(parsed.sampleFps);
        if (parsed.yoloConf) setYoloConf(parsed.yoloConf);
        if (parsed.personConf) setPersonConf(parsed.personConf);
        if (parsed.bagConf) setBagConf(parsed.bagConf);
        if (parsed.occludedRecovery !== undefined) setOccludedRecovery(parsed.occludedRecovery);
        if (parsed.trackBuffer) setTrackBuffer(parsed.trackBuffer);
        if (parsed.reidThreshold) setReidThreshold(parsed.reidThreshold);
        if (parsed.llmProvider) setLlmProvider(parsed.llmProvider);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const handleSave = (e) => {
    e.preventDefault();
    const settingsObj = { yoloModel, targetMode, sampleFps, yoloConf, personConf, bagConf, occludedRecovery, trackBuffer, reidThreshold, llmProvider };
    localStorage.setItem('sentinel_sys_settings', JSON.stringify(settingsObj));
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide font-mono flex items-center gap-2">
            SYSTEM CONFIGURATION
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-sans font-normal">
              ADMIN PANEL
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Configure AI detection confidence thresholds, LLM API keys, storage directories & system diagnostics</p>
        </div>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg text-xs font-bold font-mono shadow-md transition-all"
        >
          <Save className="w-4 h-4" />
          Save Configurations
        </button>
      </div>

      {savedToast && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          System configuration parameters saved successfully.
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: AI Model Parameters */}
        <div className="glass-panel p-5 rounded-xl border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            AI MODEL & TRACKING PARAMETERS
          </h2>

          <div className="space-y-4 text-xs font-mono">
            <div>
              <label className="text-slate-400 block mb-1">AI Detection Model Engine</label>
              <select
                value={yoloModel}
                onChange={e => setYoloModel(e.target.value)}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
              >
                <option value="yolo11s.pt">YOLO11-Small (Fast / &lt;1m Execution - 9.4M params)</option>
                <option value="yolo11m.pt">YOLO11-Medium (Maximum Recall & Occlusion - 20.1M params)</option>
                <option value="yolo11n.pt">YOLO11-Nano (Ultra Fast Baseline - 2.6M params)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                YOLO11-Small provides 45ms/frame inference for instant CCTV analysis under 1 minute.
              </p>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Target Detection Focus</label>
              <select
                value={targetMode}
                onChange={e => setTargetMode(e.target.value)}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
              >
                <option value="person_and_bags">🎯 Persons & Bags (Fast: Handbags, Backpacks, Suitcases)</option>
                <option value="all">🌐 All Objects (Comprehensive 80 COCO Categories)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                Focusing on Persons & Bags eliminates non-human clutter and accelerates MOT tracking speed.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">Video Sampling Rate (FPS)</label>
                <span className="text-cyan-400 font-bold">{sampleFps} FPS ({Math.round(1000 / sampleFps)}ms interval)</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={sampleFps}
                onChange={e => setSampleFps(parseInt(e.target.value) || 3)}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                3 FPS is the surveillance industry sweet spot: tracks walking humans smoothly in ~30s per minute of video.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">Person-Specific Sensitivity Threshold</label>
                <span className="text-emerald-400 font-bold">{(personConf * 100).toFixed(0)}% ({personConf})</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.40"
                step="0.01"
                value={personConf}
                onChange={e => setPersonConf(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Lowering to 15% catches subtle motion, unusual poses, and distant figures without false alarms.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">Bags / Handbags Sensitivity Threshold</label>
                <span className="text-fuchsia-400 font-bold">{(bagConf * 100).toFixed(0)}% ({bagConf})</span>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.40"
                step="0.01"
                value={bagConf}
                onChange={e => setBagConf(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-400"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                High sensitivity threshold (18%) specifically tuned for handbags, backpacks, and luggage.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">General Object Confidence Threshold</label>
                <span className="text-cyan-400 font-bold">{(yoloConf * 100).toFixed(0)}% ({yoloConf})</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={yoloConf}
                onChange={e => setYoloConf(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            <div className="flex items-center justify-between p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div>
                <div className="text-slate-200 font-bold">Occluded / Seated Person Recovery</div>
                <div className="text-[10px] text-slate-500">Synthesizes upper-body person detections for individuals seated behind desks/counters</div>
              </div>
              <input
                type="checkbox"
                checked={occludedRecovery}
                onChange={e => setOccludedRecovery(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">ByteTrack Track Buffer (Frames)</label>
                <span className="text-cyan-400 font-bold">{trackBuffer} frames</span>
              </div>
              <input
                type="number"
                min="10"
                max="120"
                value={trackBuffer}
                onChange={e => setTrackBuffer(parseInt(e.target.value) || 30)}
                className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400">Re-ID Cosine Match Threshold</label>
                <span className="text-cyan-400 font-bold">{(reidThreshold * 100).toFixed(0)}% ({reidThreshold})</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={reidThreshold}
                onChange={e => setReidThreshold(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>
        </div>

        {/* Right Column: LLM Provider & Storage */}
        <div className="space-y-6">
          <div className="glass-panel p-5 rounded-xl border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              GENERATIVE AI PROVIDER
            </h2>
            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="text-slate-400 mb-1 block">LLM Engine Provider</label>
                <select
                  value={llmProvider}
                  onChange={e => setLlmProvider(e.target.value)}
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="gemini">Google Gemini (API Key Configured via .env)</option>
                  <option value="ollama">Local Ollama / Llama 3</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 mb-1 block">Gemini API Key</label>
                <input
                  type="password"
                  placeholder="●●●●●●●●●●●●●●●● (Loaded from backend .env)"
                  disabled
                  className="w-full p-2 bg-slate-900/50 border border-slate-800 rounded text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* System Health Diagnostics */}
          <div className="glass-panel p-5 rounded-xl border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                SYSTEM DIAGNOSTICS & HEALTH
              </h2>
              <button onClick={checkHealth} className="text-xs font-mono text-slate-500 hover:text-cyan-300">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Backend Status</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                  <Activity className="w-3.5 h-3.5" />
                  {health?.status || 'HEALTHY'}
                </span>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">API Version</span>
                <span className="text-slate-200 font-bold mt-0.5 block">{health?.version || '1.0.0'}</span>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Database Engine</span>
                <span className="text-cyan-400 font-bold mt-0.5 block">SQLite (sentinel.db)</span>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase block">Object Detector</span>
                <span className="text-purple-400 font-bold mt-0.5 block">YOLO11 + Haar Cascade</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
