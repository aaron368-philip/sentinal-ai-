import React, { useState, useEffect } from 'react';
import { FileText, Download, Sparkles, Loader2, Trash2, RefreshCw, AlertCircle, Plus, X } from 'lucide-react';
import { reportsAPI, casesAPI } from '../services/api';

function GenerateReportModal({ onClose, onCreated, cases }) {
  const [mode, setMode] = useState('auto'); // 'auto' | 'manual'
  const [caseId, setCaseId] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!caseId) { setError('Please select a case.'); return; }
    setLoading(true);
    setError(null);
    try {
      if (mode === 'auto') {
        await reportsAPI.autoGenerate(caseId);
      } else {
        if (!title.trim() || !summary.trim()) { setError('Title and summary are required.'); setLoading(false); return; }
        await reportsAPI.create({ case_id: caseId, title, summary });
      }
      onCreated();
      onClose();
    } catch {
      setError('Failed to generate report. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel rounded-2xl border-slate-700 w-full max-w-lg p-6 space-y-5 mx-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white font-mono">GENERATE REPORT</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-lg">
          {['auto', 'manual'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded-md text-xs font-mono transition-all ${mode === m ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'}`}>
              {m === 'auto' ? '⚡ AI Auto-Generate' : '✍ Manual Report'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-mono text-slate-400 uppercase mb-1.5 block">Select Case *</label>
            <select
              value={caseId}
              onChange={e => setCaseId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="">Choose a case...</option>
              {cases.map(c => (
                <option key={c.id} value={c.id}>{c.case_number} — {c.title}</option>
              ))}
            </select>
          </div>

          {mode === 'manual' && (
            <>
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase mb-1.5 block">Report Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Incident Report — Aug 2026"
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase mb-1.5 block">Summary *</label>
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  rows={4}
                  placeholder="Investigation summary, key findings..."
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-sans resize-none"
                />
              </div>
            </>
          )}

          {mode === 'auto' && (
            <p className="text-xs text-slate-400 font-sans">
              SENTINEL AI will automatically compile all evidence items, detection events, and camera activity into a comprehensive investigation report.
            </p>
          )}

          {error && <div className="text-red-400 text-xs font-mono">{error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-mono text-slate-400 hover:text-white bg-slate-800 border border-slate-700 transition-colors">
              Cancel
            </button>
            <button
              id="generate-report-submit-btn"
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg text-xs font-bold font-mono disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, cRes] = await Promise.all([reportsAPI.list(), casesAPI.list()]);
      setReports(rRes.data || []);
      setCases(cRes.data || []);
    } catch {
      setError('Failed to load reports. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete report "${title}"?`)) return;
    try {
      await reportsAPI.delete(id);
      await load();
    } catch {
      alert('Delete failed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide font-mono flex items-center gap-2">
            INVESTIGATION REPORTS
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-sans font-normal">
              {reports.length} reports
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">AI-assisted investigation summaries, incident timelines & evidence-grounded reports</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-cyan-300 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            id="generate-report-btn"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg text-xs font-bold font-mono shadow-md"
          >
            <Sparkles className="w-4 h-4" />
            Generate Report
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-mono text-sm">Loading reports...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-mono">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-500 font-mono text-sm">No reports generated yet.</p>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-lg text-xs font-mono hover:bg-cyan-500/20 transition-colors">
            + Generate First Report
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <div key={r.id} className="glass-panel rounded-xl border-slate-800 overflow-hidden group">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                      {r.case_number}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {r.generated_at ? new Date(r.generated_at).toLocaleString() : '—'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-600">by {r.generated_by}</span>
                  </div>
                  <h2 className="text-sm font-bold text-white font-mono truncate">{r.title}</h2>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg text-xs font-mono flex items-center gap-2 border border-slate-700 transition-colors"
                  >
                    {expanded === r.id ? 'Collapse' : 'Expand'}
                  </button>
                  <button
                    id={`delete-report-btn-${r.id}`}
                    onClick={() => handleDelete(r.id, r.title)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {expanded === r.id && (
                <div className="p-5 space-y-4">
                  <div>
                    <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Summary</div>
                    <p className="text-sm text-slate-300 font-sans leading-relaxed">{r.summary}</p>
                  </div>
                  {r.ai_findings && (
                    <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] font-mono text-cyan-400 uppercase mb-2 font-bold">AI Findings</div>
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{r.ai_findings}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <GenerateReportModal
          cases={cases}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}
