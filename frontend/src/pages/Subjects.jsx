import React, { useState, useEffect } from 'react';
import {
  Users, User, Plus, Trash2, RefreshCw, Loader2, AlertCircle,
  Camera, Sparkles, X, Shield, Eye, Navigation, UploadCloud,
  Layers, Search, Sliders, PlayCircle, Filter, CheckCircle2, ChevronRight
} from 'lucide-react';
import { subjectsAPI, camerasAPI, reidAPI } from '../services/api';
import SpatialTrajectoryViewer from '../components/SpatialTrajectoryViewer';

function NewSubjectModal({ onClose, onCreated }) {
  const [notes, setNotes] = useState('');
  const [appearanceMetadata, setAppearanceMetadata] = useState('');
  const [thumbnail, setThumbnail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    if (notes) formData.append('notes', notes);
    if (appearanceMetadata) formData.append('appearance_metadata', appearanceMetadata);
    if (thumbnail) formData.append('thumbnail', thumbnail);

    try {
      await subjectsAPI.create(formData);
      onCreated();
      onClose();
    } catch {
      setError('Failed to create subject profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="glass-panel rounded-2xl border-slate-700 w-full max-w-md p-6 space-y-5 mx-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-400" />
            REGISTER NEW SUBJECT PROFILE
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
          <div>
            <label className="text-slate-400 uppercase mb-1.5 block">Face Reference Photo / Crop</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setThumbnail(e.target.files[0])}
              className="w-full text-slate-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-mono file:font-bold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20 file:cursor-pointer border border-slate-800 rounded-lg bg-slate-900/50 p-2"
            />
          </div>

          <div>
            <label className="text-slate-400 uppercase mb-1.5 block">Appearance Descriptors</label>
            <input
              type="text"
              value={appearanceMetadata}
              onChange={e => setAppearanceMetadata(e.target.value)}
              placeholder="e.g. Male, dark hoodie, blue jeans, black cap"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 font-sans"
            />
          </div>

          <div>
            <label className="text-slate-400 uppercase mb-1.5 block">Investigation Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Primary suspect notes, behavior observation..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500 font-sans resize-none"
            />
          </div>

          {error && <div className="text-red-400 text-xs">{error}</div>}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-white bg-slate-800 border border-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              id="create-subject-submit-btn"
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg font-bold shadow-md disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {loading ? 'Creating...' : 'Register Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Query Image Matcher Modal ───────────────────────────────────────────────
function QueryImageMatcherModal({ onClose, onOpenTrajectoryForTrack }) {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [minSim, setMinSim] = useState(0.50);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleImageChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setImageFile(f);
      setImagePreview(URL.createObjectURL(f));
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!imageFile) return;
    setSearching(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      const res = await reidAPI.matchImage(formData, minSim);
      setResults(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to execute visual Re-ID search.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-cyan-800/60 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl font-mono text-xs">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/80">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              QUERY IMAGE RE-IDENTIFICATION SEARCH
            </h2>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Deep appearance embedding matcher across all camera footage in database
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-4 aspect-[3/4] bg-slate-950 rounded-xl border-2 border-dashed border-cyan-800/60 hover:border-cyan-500/80 flex flex-col items-center justify-center relative overflow-hidden transition-all group">
                {imagePreview ? (
                  <img src={imagePreview} alt="Query Target" className="w-full h-full object-cover" />
                ) : (
                  <div className="p-4 text-center text-slate-500 space-y-2">
                    <UploadCloud className="w-8 h-8 mx-auto text-cyan-500/60 group-hover:scale-110 transition-transform" />
                    <p className="text-[10px]">Click or drag query person photo</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              <div className="md:col-span-8 space-y-3">
                <div>
                  <label className="text-slate-400 uppercase text-[10px] block mb-1.5">
                    Match Sensitivity Threshold: <strong className="text-cyan-300">{Math.round(minSim * 100)}%</strong>
                  </label>
                  <input
                    type="range"
                    min="0.30"
                    max="0.85"
                    step="0.05"
                    value={minSim}
                    onChange={(e) => setMinSim(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Lower values increase recall; higher values reduce false positives.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!imageFile || searching}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {searching ? 'Computing Appearance Vector Match...' : 'Search All Surveillance Feeds'}
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Results List */}
          {results && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-cyan-300 font-bold">
                  {results.total_matches} Match{results.total_matches !== 1 ? 'es' : ''} Found
                </span>
                <span className="text-slate-500 text-[10px]">Ranked by Cosine Similarity</span>
              </div>

              {results.matches?.length === 0 ? (
                <p className="text-slate-500 text-center py-6">No camera sightings exceeded the {Math.round(minSim * 100)}% similarity threshold.</p>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {results.matches.map((m) => (
                    <div
                      key={m.track_event_id}
                      className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3 hover:border-cyan-500/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {m.thumbnail_url ? (
                          <img
                            src={m.thumbnail_url}
                            alt="Crop"
                            className="w-12 h-12 rounded-lg object-cover border border-slate-800"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-slate-600">
                            <User className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-cyan-400">{m.camera_code}</span>
                            <span className="text-[10px] text-slate-400">{m.area_zone || 'Surveillance Node'}</span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            Track #{m.track_id} • Dwell {m.duration_seconds}s
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-cyan-300 font-bold text-xs block">
                            {Math.round(m.similarity_score * 100)}%
                          </span>
                          <span className="text-[9px] text-slate-500">Sim Score</span>
                        </div>
                        <button
                          onClick={() => {
                            onClose();
                            onOpenTrajectoryForTrack(m.track_event_id);
                          }}
                          className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg text-[10px] flex items-center gap-1 shadow transition"
                        >
                          <Navigation className="w-3 h-3" /> Trace Path
                        </button>
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
  );
}

// ─── ReID Matches Drawer ─────────────────────────────────────────────────────
function ReIDDrawer({ subject, cameras, onClose, onOpenTrajectory }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (subject) {
      subjectsAPI.getCameraMatches(subject.id)
        .then(res => setMatches(res.data || []))
        .catch(() => setMatches([]))
        .finally(() => setLoading(false));
    }
  }, [subject]);

  const getCamCode = (camId) => {
    const found = cameras.find(c => c.id === camId);
    return found ? found.camera_code : 'CAM MATCH';
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              RE-IDENTIFICATION MATCHES
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{subject.subject_code} Cosine Similarity Telemetry</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action button to open full trajectory */}
        <button
          onClick={() => {
            onClose();
            onOpenTrajectory(subject.id);
          }}
          className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl font-mono text-xs font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <Navigation className="w-4 h-4" /> Open Interactive Spatial Trajectory
        </button>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400 font-mono text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            Matching embeddings across camera matrix...
          </div>
        ) : matches.length === 0 ? (
          <div className="p-8 text-center text-slate-500 font-mono text-xs space-y-3 glass-panel rounded-xl border-slate-800">
            <Camera className="w-8 h-8 text-slate-600 mx-auto" />
            <p>No automatic Re-ID cross-camera matches recorded yet for this subject profile.</p>
            <p className="text-[10px] text-slate-600">Run CCTV processing on multiple camera feeds to populate cosine similarity matches.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <div key={m.id} className="glass-panel p-4 rounded-xl border-slate-800 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-400">{getCamCode(m.target_camera_id)}</span>
                  <span className="text-[10px] text-slate-400">Track #{m.target_track_id}</span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Cosine Similarity</span>
                    <span className="text-cyan-300 font-bold">{(m.similarity_score * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full"
                      style={{ width: `${m.similarity_score * 100}%` }}
                    />
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 text-right pt-1">
                  Matched at: {m.matched_at ? new Date(m.matched_at).toLocaleTimeString() : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Subjects Component ─────────────────────────────────────────────────
export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showQueryMatcher, setShowQueryMatcher] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [trajectorySubjectId, setTrajectorySubjectId] = useState(null);
  const [trajectoryTrackId, setTrajectoryTrackId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, cRes] = await Promise.all([subjectsAPI.list(), camerasAPI.list()]);
      setSubjects(sRes.data || []);
      setCameras(cRes.data || []);
    } catch {
      setError('Failed to load subject profiles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = async (id, code) => {
    if (!window.confirm(`Delete subject profile ${code}?`)) return;
    try {
      await subjectsAPI.delete(id);
      await loadData();
    } catch {
      alert('Delete failed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide font-mono flex items-center gap-2">
            SUBJECT PROFILES & MULTI-CAMERA RE-ID
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-sans font-normal">
              {subjects.length} Profiles
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Tracked subject profiles, deep Re-ID appearance embeddings & spatial trajectory reconstruction
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-cyan-300 transition-colors px-3 py-2 rounded-lg bg-slate-900 border border-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowQueryMatcher(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs font-bold font-mono transition-all"
          >
            <Search className="w-4 h-4 text-cyan-400" />
            Query Photo Matcher
          </button>
          <button
            id="register-subject-btn"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg text-xs font-bold font-mono shadow-md shadow-cyan-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Register New Subject
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 gap-2 text-slate-400 font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" /> Loading subject profiles...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-mono">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      ) : subjects.length === 0 ? (
        <div className="text-center py-16 space-y-3 glass-panel rounded-xl border-slate-800">
          <Users className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-500 font-mono text-sm">No subject profiles registered yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-mono hover:bg-cyan-500/20 transition-colors"
          >
            + Register First Subject
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {subjects.map((s) => (
            <div key={s.id} className="glass-panel p-4 rounded-xl border-slate-800 space-y-3 hover:border-cyan-500/40 transition-colors group flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
                    {s.subject_code}
                  </span>
                  <button
                    onClick={() => handleDelete(s.id, s.subject_code)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Face Thumbnail Image or Fallback */}
                <div className="h-44 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800 relative">
                  {s.thumbnail_path ? (
                    <img
                      src={subjectsAPI.thumbnailUrl(s.id)}
                      alt={s.subject_code}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                    />
                  ) : null}
                  <div className={`w-full h-full flex flex-col items-center justify-center text-slate-700 ${s.thumbnail_path ? 'hidden' : ''}`}>
                    <User className="w-12 h-12" />
                    <span className="text-[10px] font-mono text-slate-600 mt-1">NO FACE IMAGE</span>
                  </div>
                </div>

                <div className="text-xs font-mono space-y-1">
                  {s.appearance_metadata && (
                    <p className="text-slate-300 font-sans text-xs line-clamp-2">
                      <span className="font-mono text-cyan-400 font-bold">Traits: </span>{s.appearance_metadata}
                    </p>
                  )}
                  {s.notes && (
                    <p className="text-slate-400 text-[11px] font-sans line-clamp-2">
                      {s.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setSelectedSubject(s)}
                    className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-white"
                  >
                    <Eye className="w-3.5 h-3.5 text-cyan-400" /> Matches
                  </button>

                  <button
                    onClick={() => setTrajectorySubjectId(s.id)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded text-[11px] font-mono font-bold transition-all"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Trajectory AI
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NewSubjectModal
          onClose={() => setShowModal(false)}
          onCreated={loadData}
        />
      )}

      {showQueryMatcher && (
        <QueryImageMatcherModal
          onClose={() => setShowQueryMatcher(false)}
          onOpenTrajectoryForTrack={(trkId) => setTrajectoryTrackId(trkId)}
        />
      )}

      {selectedSubject && (
        <ReIDDrawer
          subject={selectedSubject}
          cameras={cameras}
          onClose={() => setSelectedSubject(null)}
          onOpenTrajectory={(subId) => setTrajectorySubjectId(subId)}
        />
      )}

      {/* Trajectory Viewer Modal for Subject or Track */}
      {(trajectorySubjectId || trajectoryTrackId) && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto">
            <SpatialTrajectoryViewer
              subjectId={trajectorySubjectId}
              trackEventId={trajectoryTrackId}
              onClose={() => {
                setTrajectorySubjectId(null);
                setTrajectoryTrackId(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
