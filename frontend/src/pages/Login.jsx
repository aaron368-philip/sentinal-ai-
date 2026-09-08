import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import LetterGlitch from '../components/common/LetterGlitch';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('S3nt1n3l#Analytics2026!Key');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 selection:bg-cyan-500/30 overflow-hidden bg-[#090D16]">
      {/* LetterGlitch Canvas Background */}
      <div className="absolute inset-0 z-0">
        <LetterGlitch
          glitchColors={['#06b6d4', '#3b82f6', '#10b981', '#1e293b']}
          glitchSpeed={50}
          centerVignette={true}
          outerVignette={true}
          smooth={true}
          backgroundColor="#090D16"
        />
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md p-8 rounded-2xl border border-cyan-500/30 space-y-6 shadow-2xl shadow-cyan-950/60 backdrop-blur-2xl bg-slate-950/30">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-cyan-500/80 to-blue-600/80 flex items-center justify-center shadow-lg shadow-cyan-500/30 backdrop-blur-md">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wider font-mono">SENTINEL<span className="text-cyan-400">AI</span></h1>
          <p className="text-xs text-slate-300 font-medium">AI-ASSISTED CCTV VIDEO ANALYTICS PLATFORM</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono text-center backdrop-blur-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div>
            <label className="block text-slate-300 mb-1 font-semibold">INVESTIGATOR ID / USERNAME</label>
            <div className="relative">
              <User className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950/40 border border-slate-700/60 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 backdrop-blur-md transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-semibold">PASSWORD</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-9 pr-4 py-2.5 bg-slate-950/40 border border-slate-700/60 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 backdrop-blur-md transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all font-mono text-xs flex items-center justify-center gap-2"
          >
            {loading ? 'AUTHENTICATING...' : 'AUTHENTICATE ACCESS'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80 text-center text-[11px] font-mono text-slate-500">
          Default Credentials: <span className="text-cyan-400 font-bold">admin</span> / <span className="text-cyan-400 font-bold">S3nt1n3l#Analytics2026!Key</span>
        </div>
      </div>
    </div>
  );
}
