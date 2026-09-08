import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Video, 
  Briefcase, 
  Search, 
  Users, 
  FileText, 
  ShieldCheck, 
  Settings, 
  Shield, 
  LogOut,
  Activity,
  Cpu
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'CCTV Monitoring', path: '/cctv', icon: Video },
  { name: 'Investigations', path: '/investigations', icon: Briefcase },
  { name: 'AI Search', path: '/search', icon: Search },
  { name: 'Subjects', path: '/subjects', icon: Users },
  { name: 'Reports', path: '/reports', icon: FileText },
  { name: 'Evidence Vault', path: '/evidence', icon: ShieldCheck },
  { name: 'System Settings', path: '/settings', icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-[#0B1120]/35 backdrop-blur-xl border-r border-slate-800/60 flex flex-col h-screen sticky top-0 select-none z-30">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/60 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-white tracking-wider font-mono">SENTINEL<span className="text-cyan-400">AI</span></h1>
          <p className="text-[10px] text-slate-400 font-medium tracking-tight">CCTV INVESTIGATION PLATFORM</p>
        </div>
      </div>

      {/* System Status Pill */}
      <div className="px-4 py-3 mx-3 my-3 rounded-lg bg-slate-950/30 backdrop-blur-md border border-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-mono text-slate-300">AI PIPELINE READY</span>
        </div>
        <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/10 backdrop-blur-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-slate-800/60 bg-slate-950/30 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-xs font-bold font-mono">
            {user?.username ? user.username.substring(0, 2).toUpperCase() : 'INV'}
          </div>
          <div className="truncate">
            <p className="text-xs font-semibold text-slate-200 truncate">{user?.username || 'Investigator'}</p>
            <p className="text-[10px] text-cyan-400 font-mono tracking-wider">{user?.role || 'INVESTIGATOR'}</p>
          </div>
        </div>
        {user && (
          <button
            onClick={logout}
            title="Sign Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
