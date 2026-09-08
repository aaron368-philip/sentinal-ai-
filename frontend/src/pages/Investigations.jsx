import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, FolderOpen, Calendar, UserCheck, Loader2, Trash2, RefreshCw, AlertCircle, X } from 'lucide-react';
import { casesAPI } from '../services/api';

const statusConfig = {
  OPEN: { cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', label: 'OPEN' },
  IN_PROGRESS: { cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400', label: 'IN PROGRESS' },
  CLOSED: { cls: 'bg-slate-700/40 border-slate-600 text-slate-400', label: 'CLOSED' },
};

function NewCaseModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setLoading(true);
    setError(null);
    try {
      await casesAPI.create({ title, description });
      onCreated();
      onClose();
    } catch {
      setError('Failed to create case. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel rounded-2xl border-slate-700 w-full max-w-md p-6 space-y-5 mx-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white font-mono">NEW INVESTIGATION CASE</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-mono text-slate-400 uppercase mb-1.5 block">Case Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Suspicious Activity Near Vault Exit"
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-slate-400 uppercase mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Case overview, initial findings..."
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans resize-none"
            />
          </div>
          {error && <div className="text-red-400 text-xs font-mono">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-mono text-slate-400 hover:text-white bg-slate-800 border border-slate-700 transition-colors">
              Cancel
            </button>
            <button
              id="create-case-submit-btn"
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg text-xs font-bold font-mono disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create Case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Investigations() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await casesAPI.list(filterStatus || undefined);
      setCases(res.data || []);
    } catch {
      setError('Failed to load cases. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterStatus]);

  const handleDelete = async (id, num) => {
    if (!window.confirm(`Delete case ${num}? This cannot be undone.`)) return;
    try {
      await casesAPI.delete(id);
      await load();
    } catch {
      alert('Delete failed.');
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await casesAPI.update(id, { status });
      await load();
    } catch {
      alert('Status update failed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide font-mono flex items-center gap-2">
            INVESTIGATION CASES
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-sans font-normal">
              {cases.length} active
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Manage active crime investigation cases, multi-camera event logs & subject trajectories</p>
        </div>
        <button
          id="new-case-btn"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-lg text-xs font-bold font-mono shadow-md shadow-cyan-500/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Case
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {['', 'OPEN', 'IN_PROGRESS', 'CLOSED'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
              filterStatus === s
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {s === '' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
        <button onClick={load} className="ml-auto flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-cyan-300 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Cases Grid */}
      {loading ? (
        <div className="flex items-center justify-center p-16 gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-mono text-sm">Loading cases...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-mono">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      ) : cases.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FolderOpen className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-500 font-mono text-sm">No cases found. Create a new investigation case to begin.</p>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-mono hover:bg-cyan-500/20 transition-colors">
            + Create First Case
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map(c => {
            const cfg = statusConfig[c.status] || statusConfig.OPEN;
            return (
              <div key={c.id} className="glass-panel p-5 rounded-xl border-slate-800 space-y-4 hover:border-cyan-500/40 transition-colors group">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
                    {c.case_number}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={c.status}
                      onChange={e => handleStatusChange(c.id, e.target.value)}
                      className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold bg-transparent cursor-pointer focus:outline-none ${cfg.cls}`}
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="IN_PROGRESS">IN PROGRESS</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white leading-snug">{c.title}</h3>
                  {c.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {c.evidence_count} evidence
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderOpen className="w-3 h-3" />
                    {c.events_count} events
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    {c.assigned_investigator || 'Unassigned'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                    </span>
                    <button
                      id={`delete-case-btn-${c.id}`}
                      onClick={() => handleDelete(c.id, c.case_number)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && <NewCaseModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}
