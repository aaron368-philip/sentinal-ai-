import React from 'react';
import Sidebar from '../components/common/Sidebar';
import Header from '../components/common/Header';

export default function MainLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#080d19]/20 text-slate-100 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
