import React from 'react';
import { Terminal, Shield, LogOut, Sun, Moon } from 'lucide-react';
import { authStorage } from '../lib/api';
import { NotificationDropdown } from './NotificationDropdown';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string, param?: string) => void;
  user: any;
  onLogout: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  user,
  onLogout,
  isDark,
  onToggleTheme
}) => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button 
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2.5 text-left group shrink-0 focus:outline-none"
        >
          <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold text-sm tracking-wider shadow-sm group-hover:scale-105 transition-transform">
            AP
          </div>
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            AETHER<span className="text-neutral-500 font-normal">PANEL</span>
          </span>
        </button>

        {/* Zone 2: 4-5 Single-line Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-neutral-400">
          <button 
            onClick={() => onNavigate('landing')}
            className={`whitespace-nowrap shrink-0 hover:text-white transition-colors ${currentView === 'landing' ? 'text-white font-semibold' : ''}`}
          >
            Beranda
          </button>
          <button 
            onClick={() => onNavigate('configure')}
            className={`whitespace-nowrap shrink-0 hover:text-white transition-colors ${currentView === 'configure' ? 'text-white font-semibold' : ''}`}
          >
            Konfigurator
          </button>
          <button 
            onClick={() => onNavigate('track')}
            className={`whitespace-nowrap shrink-0 hover:text-white transition-colors ${currentView === 'track' ? 'text-white font-semibold' : ''}`}
          >
            Lacak Pesanan
          </button>
          {user && (
            <button 
              onClick={() => onNavigate('dashboard')}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors ${currentView === 'dashboard' ? 'text-white font-semibold' : ''}`}
            >
              Server Saya
            </button>
          )}
          {user?.role === 'ADMIN' && (
            <button 
              onClick={() => onNavigate('admin')}
              className={`whitespace-nowrap shrink-0 hover:text-white transition-colors ${currentView === 'admin' ? 'text-white font-semibold' : ''}`}
            >
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: 1 Primary Action + Theme Toggle + Notifications */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Realtime Notification Center */}
          <NotificationDropdown />

          <button
            onClick={onToggleTheme}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-900 transition-colors"
            title={isDark ? "Ubah ke mode terang" : "Ubah ke mode gelap"}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('dashboard')}
                className="px-3.5 py-1.5 text-xs font-semibold text-black bg-white hover:bg-neutral-200 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{user.name.split(' ')[0]}</span>
              </button>
              <button
                onClick={onLogout}
                className="p-2 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 rounded-lg transition-colors"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('login')}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Masuk
              </button>
              <button
                onClick={() => onNavigate('configure')}
                className="px-4 py-1.5 text-xs font-semibold text-black bg-white hover:bg-neutral-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Buat Server
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
