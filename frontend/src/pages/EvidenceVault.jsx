import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, Loader2, Trash2,
  RefreshCw, AlertCircle, FileVideo, Eye, X, Download, FileText,
} from 'lucide-react';
import { evidenceAPI } from '../services/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const statusBadge = (status) => {
  const map = {
    VERIFIED:    'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    TAMPERED:    'bg-red-500/10 border-red-500/30 text-red-400',
    UNVERIFIED:  'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    FILE_MISSING:'bg-slate-700/40 border-slate-600 text-slate-400',
  };
  return map[status] || 'bg-slate-700/40 border-slate-600 text-slate-400';
};

const statusIcon = (status) => {
  if (status === 'VERIFIED') return <CheckCircle2 className="w-3 h-3" />;
  if (status === 'TAMPERED') return <AlertTriangle className="w-3 h-3" />;
  return <AlertCircle className="w-3 h-3" />;
};

const isTextFile = (filename = '') => {
  const ext = filename.split('.').pop().toLowerCase();
  return ['txt', 'log', 'csv', 'json', 'xml', 'md'].includes(ext);
};

// ─── Preview Modal ────────────────────────────────────────────────────────────
function PreviewModal({ item, onClose }) {
  const [content, setContent]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    setError(null);

    if (isTextFile(item.original_filename)) {
      evidenceAPI.preview(item.id)
        .then(res => setContent(res.data.content))
        .catch(() => setError('Could not load file preview.'))
        .finally(() => setLoading(false));
    } else {
      // For non-text (video / binary) just show download option
      setContent(null);
      setLoading(false);
    }
  }, [item]);

  if (!item) return null;

  const isText = isTextFile(item.original_filename);
  const isVideo = item.file_type === 'CCTV_VIDEO';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {isText ? <FileText className="w-4 h-4 text-cyan-400" /> : <FileVideo className="w-4 h-4 text-blue-400" />}
            <div>
              <div className="text-sm font-bold text-white font-mono">{item.evidence_code}</div>
              <div className="text-[11px] text-slate-400 font-sans truncate max-w-[400px]">{item.original_filename}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={evidenceAPI.downloadUrl(item.id)}
              download={item.original_filename}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-xs font-mono transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button
              id="evidence-preview-close"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-mono text-sm">Loading preview…</span>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400 font-mono text-sm">{error}</div>
          ) : isText && content !== null ? (
            /* Text file viewer */
            <pre className="p-5 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {content}
            </pre>
          ) : isVideo ? (
            /* Video player */
            <div className="p-6 flex flex-col items-center gap-4">
              <video
                controls
                className="rounded-xl w-full max-h-[55vh] bg-black"
                src={evidenceAPI.downloadUrl(item.id)}
              />
            </div>
          ) : (
            /* Generic binary — download only */
            <div className="p-10 flex flex-col items-center gap-4 text-slate-400">
              <FileText className="w-10 h-10 opacity-30" />
              <p className="font-mono text-sm">No in-browser preview available for this file type.</p>
              <a
                href={evidenceAPI.downloadUrl(item.id)}
                download={item.original_filename}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm font-mono hover:bg-cyan-500/20 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download File
              </a>
            </div>
          )}
        </div>

        {/* Footer — hash details */}
        <div className="px-5 py-2.5 border-t border-slate-800 flex items-center gap-4 flex-shrink-0 bg-slate-950/50">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${statusBadge(item.verification_status)}`}>
            {statusIcon(item.verification_status)}
            {item.verification_status}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">SHA-256: {item.sha256_hash}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EvidenceVault() {
  const [evidence, setEvidence]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [verifying, setVerifying]     = useState({});
  const [error, setError]             = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await evidenceAPI.list();
      setEvidence(res.data || []);
    } catch {
      setError('Failed to load evidence vault. Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async (id) => {
    setVerifying(v => ({ ...v, [id]: true }));
    setVerifyResult(null);
    try {
      const res = await evidenceAPI.verify(id);
      setVerifyResult(res.data);
      await load();
    } catch {
      setVerifyResult({ status: 'ERROR', message: 'Verification request failed.' });
    } finally {
      setVerifying(v => ({ ...v, [id]: false }));
    }
  };

  const handleDelete = async (id, code) => {
    if (!window.confirm(`Delete evidence ${code}? This cannot be undone.`)) return;
    try {
      await evidenceAPI.delete(id);
      await load();
    } catch {
      alert('Delete failed.');
    }
  };

  return (
    <>
      {/* Preview Modal */}
      {previewItem && <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}

      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-slate-800 pb-4">
          <h1 className="text-xl font-bold text-white tracking-wide font-mono flex items-center gap-2">
            DIGITAL EVIDENCE VAULT
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-sans font-normal">
              INTEGRITY MONITOR
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Cryptographic SHA-256 hash verification, tamper detection &amp; chain of custody</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total Items',  value: evidence.length, icon: ShieldCheck, color: 'text-cyan-400' },
            { label: 'Verified',     value: evidence.filter(e => e.verification_status === 'VERIFIED').length,  icon: CheckCircle2,   color: 'text-emerald-400' },
            { label: 'Tampered',     value: evidence.filter(e => e.verification_status === 'TAMPERED').length,  icon: AlertTriangle,  color: 'text-red-400' },
            { label: 'Video Files',  value: evidence.filter(e => e.file_type === 'CCTV_VIDEO').length,          icon: FileVideo,      color: 'text-blue-400' },
          ].map(stat => (
            <div key={stat.label} className="glass-panel p-4 rounded-xl border-slate-800 flex items-center gap-3">
              <stat.icon className={`w-5 h-5 ${stat.color} flex-shrink-0`} />
              <div>
                <div className="text-xl font-bold text-white font-mono">{stat.value}</div>
                <div className="text-[10px] text-slate-400 uppercase font-mono">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Verify Result Toast */}
        {verifyResult && (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-mono ${
            verifyResult.status === 'VERIFIED'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            {verifyResult.status === 'VERIFIED'
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <div>
              <div className="font-bold">{verifyResult.status}</div>
              <div className="text-xs opacity-80 mt-0.5">{verifyResult.message}</div>
              {verifyResult.stored_hash && (
                <div className="mt-1.5 space-y-0.5 text-[10px] opacity-70">
                  <div>Stored  : {verifyResult.stored_hash}</div>
                  <div>Computed: {verifyResult.computed_hash}</div>
                </div>
              )}
            </div>
            <button onClick={() => setVerifyResult(null)} className="ml-auto text-xs opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Evidence Table */}
        <div className="glass-panel rounded-xl border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              REGISTERED EVIDENCE ARTIFACTS
            </h2>
            <button
              id="evidence-refresh-btn"
              onClick={load}
              className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-cyan-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-10 gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-mono text-sm">Loading vault…</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-400 text-sm font-mono">{error}</div>
          ) : evidence.length === 0 ? (
            <div className="p-10 text-center text-slate-500 font-mono text-sm">
              No evidence items registered. Upload a CCTV video to begin.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="px-4 pb-3 pt-3">EVIDENCE ID</th>
                    <th className="px-4 pb-3 pt-3">FILENAME</th>
                    <th className="px-4 pb-3 pt-3">TYPE</th>
                    <th className="px-4 pb-3 pt-3">SHA-256</th>
                    <th className="px-4 pb-3 pt-3">STATUS</th>
                    <th className="px-4 pb-3 pt-3">UPLOADED</th>
                    <th className="px-4 pb-3 pt-3">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {evidence.map(e => (
                    <tr key={e.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-bold text-cyan-400">{e.evidence_code}</td>
                      <td className="px-4 py-3 text-slate-300 font-sans max-w-[180px] truncate" title={e.original_filename}>
                        {e.original_filename}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{e.file_type}</td>
                      <td className="px-4 py-3 text-slate-500 text-[10px] max-w-[120px] truncate" title={e.sha256_hash}>
                        {e.sha256_hash?.slice(0, 16)}…
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold ${statusBadge(e.verification_status)}`}>
                          {statusIcon(e.verification_status)}
                          {e.verification_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {e.uploaded_at ? new Date(e.uploaded_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* View button */}
                          <button
                            id={`view-btn-${e.id}`}
                            onClick={() => setPreviewItem(e)}
                            title="View file"
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 text-[10px] border border-slate-700 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>

                          {/* Verify button */}
                          <button
                            id={`verify-btn-${e.id}`}
                            onClick={() => handleVerify(e.id)}
                            disabled={verifying[e.id]}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] border border-slate-700 disabled:opacity-50 transition-colors"
                          >
                            {verifying[e.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                            Verify
                          </button>

                          {/* Delete button */}
                          <button
                            id={`delete-evidence-btn-${e.id}`}
                            onClick={() => handleDelete(e.id, e.evidence_code)}
                            title="Delete evidence"
                            className="p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
