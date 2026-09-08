import React, { useState, useEffect } from 'react';
import { Search, Bell, ShieldAlert, FolderGit2, Clock, CheckCircle2 } from 'lucide-react';

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 bg-[#0B1120]/35 backdrop-blur-xl border-b border-slate-800/60 px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Active Case Context */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/40 border border-slate-700/60 text-xs font-mono backdrop-blur-md">
          <FolderGit2 className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-400">ACTIVE CASE:</span>
          <span className="text-cyan-300 font-bold">CASE-2026-001</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>{time.toISOString().replace('T', ' ').substring(0, 19)} UTC</span>
        </div>
      </div>

      {/* Center: Search input */}
      <div className="flex-1 max-w-md mx-6 hidden sm:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search cameras, subject IDs, evidence hashes..."
            className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-950/40 border border-slate-700/50 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 backdrop-blur-md transition-all font-mono"
          />
        </div>
      </div>

      {/* Right Status indicators */}
      <div className="flex items-center gap-3">
        {/* Integrity status */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 text-xs font-mono">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>VAULT VERIFIED</span>
        </div>

        {/* Threat Alert Pill */}
        <button className="relative p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400 transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500"></span>
        </button>
      </div>
    </header>
  );
}
