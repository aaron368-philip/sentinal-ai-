import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import CCTVMonitoring from './pages/CCTVMonitoring';
import Investigations from './pages/Investigations';
import AISearch from './pages/AISearch';
import Subjects from './pages/Subjects';
import Reports from './pages/Reports';
import EvidenceVault from './pages/EvidenceVault';
import SystemSettings from './pages/SystemSettings';
import Login from './pages/Login';
import Silk from './components/common/Silk';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-cyan-400 font-mono text-xs">
        INITIALIZING SENTINEL AI SECURITY CONSOLE...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <MainLayout>{children}</MainLayout>;
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="relative min-h-screen bg-[#080d19] text-slate-100 font-sans overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
          {/* Global Silk Background Canvas */}
          <div className="fixed inset-0 pointer-events-none z-0 opacity-50">
            <Silk
              speed={4}
              scale={1.2}
              color="#0284c7"
              noiseIntensity={1.2}
              rotation={0.25}
            />
          </div>

          <div className="relative z-10 min-h-screen">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/cctv" element={<ProtectedRoute><CCTVMonitoring /></ProtectedRoute>} />
              <Route path="/investigations" element={<ProtectedRoute><Investigations /></ProtectedRoute>} />
              <Route path="/search" element={<ProtectedRoute><AISearch /></ProtectedRoute>} />
              <Route path="/subjects" element={<ProtectedRoute><Subjects /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/evidence" element={<ProtectedRoute><EvidenceVault /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SystemSettings /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
