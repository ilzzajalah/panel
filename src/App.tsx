import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { LandingPage } from './pages/LandingPage';
import { ConfiguratorPage } from './pages/ConfiguratorPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { SuccessPage } from './pages/SuccessPage';
import { TrackPage } from './pages/TrackPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ServerDetailPage } from './pages/ServerDetailPage';
import { AdminPage } from './pages/AdminPage';
import { authStorage, apiRequest } from './lib/api';

import { testFirebaseConnection } from './lib/firebase';

export default function App() {
  const [currentView, setCurrentView] = useState<string>('landing');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [activeOrderCode, setActiveOrderCode] = useState<string>('');
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [user, setUser] = useState<any>(authStorage.getUser());
  const [isDark, setIsDark] = useState<boolean>(true);
  const [loginPrefill, setLoginPrefill] = useState<{ email?: string; pass?: string }>({});

  useEffect(() => {
    // Test Firebase Firestore connection per SKILL.md
    testFirebaseConnection();

    // Check current auth token on mount
    const verifyAuth = async () => {
      const token = authStorage.getToken();
      if (token) {
        try {
          const res = await apiRequest('/api/auth/me');
          if (res.success && res.user) {
            setUser(res.user);
            authStorage.setUser(res.user);
          }
        } catch {
          authStorage.clearToken();
          setUser(null);
        }
      }
    };
    verifyAuth();

    // Silent 24/7 Keep-Alive heartbeat while web panel is open (every 4 minutes)
    const sendClientHeartbeat = () => {
      fetch('/api/ping?source=web_client', { method: 'GET', cache: 'no-store' }).catch(() => {});
    };
    sendClientHeartbeat();
    const keepAliveTimer = setInterval(sendClientHeartbeat, 4 * 60 * 1000);
    return () => clearInterval(keepAliveTimer);
  }, []);

  const handleNavigate = (view: string, param?: string) => {
    setCurrentView(view);
    if (view === 'server' && param) {
      setSelectedServerId(param);
    } else if (view === 'checkout' && param) {
      setActiveOrderCode(param);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    authStorage.clearToken();
    setUser(null);
    setCurrentView('landing');
  };

  const handleToggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark', !isDark);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'dark bg-neutral-950 text-neutral-100' : 'light bg-neutral-50 text-neutral-900'} flex flex-col font-sans transition-colors duration-200 pb-20`}>
      <Navbar
        currentView={currentView}
        onNavigate={handleNavigate}
        user={user}
        onLogout={handleLogout}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1">
        {currentView === 'landing' && (
          <LandingPage
            onSelectPlan={(planId) => {
              setSelectedPlanId(planId);
              setCurrentView('configure');
            }}
            onNavigateConfigure={() => {
              setSelectedPlanId(null);
              setCurrentView('configure');
            }}
            onNavigateTrack={() => setCurrentView('track')}
          />
        )}

        {currentView === 'configure' && (
          <ConfiguratorPage
            initialPlanId={selectedPlanId}
            onOrderCreated={(orderCode) => {
              setActiveOrderCode(orderCode);
              setCurrentView('checkout');
            }}
          />
        )}

        {currentView === 'checkout' && (
          <CheckoutPage
            orderCode={activeOrderCode}
            onPaymentSuccess={(orderCode) => {
              setActiveOrderCode(orderCode);
              setCurrentView('success');
            }}
            onNavigateHome={() => setCurrentView('landing')}
          />
        )}

        {currentView === 'success' && (
          <SuccessPage
            orderCode={activeOrderCode}
            onNavigateLogin={(email, pass) => {
              setLoginPrefill({ email, pass });
              setCurrentView('login');
            }}
            onNavigateServer={(serverId) => {
              setSelectedServerId(serverId);
              setCurrentView('server');
            }}
          />
        )}

        {currentView === 'track' && (
          <TrackPage
            onNavigateCheckout={(orderCode) => {
              setActiveOrderCode(orderCode);
              setCurrentView('checkout');
            }}
            onNavigateLogin={(email) => {
              setLoginPrefill({ email });
              setCurrentView('login');
            }}
            onNavigateServer={(serverId) => {
              setSelectedServerId(serverId);
              setCurrentView('server');
            }}
          />
        )}

        {currentView === 'login' && (
          <LoginPage
            initialEmail={loginPrefill.email}
            initialPassword={loginPrefill.pass}
            onLoginSuccess={(loggedInUser) => {
              setUser(loggedInUser);
              setCurrentView('dashboard');
            }}
          />
        )}

        {currentView === 'dashboard' && (
          <DashboardPage
            user={user || { name: 'User' }}
            onSelectServer={(serverId) => {
              setSelectedServerId(serverId);
              setCurrentView('server');
            }}
            onNavigateConfigure={() => {
              setSelectedPlanId(null);
              setCurrentView('configure');
            }}
          />
        )}

        {currentView === 'server' && (
          <ServerDetailPage
            serverId={selectedServerId}
            onBack={() => setCurrentView(user ? 'dashboard' : 'landing')}
            onNavigateCheckout={(orderCode) => {
              setActiveOrderCode(orderCode);
              setCurrentView('checkout');
            }}
          />
        )}

        {currentView === 'admin' && (
          <AdminPage
            onBack={() => setCurrentView('dashboard')}
            onSelectServer={(serverId) => {
              setSelectedServerId(serverId);
              setCurrentView('server');
            }}
          />
        )}
      </main>

      {/* Floating Bottom Navigation Dock */}
      <BottomNav
        currentView={currentView}
        onNavigate={handleNavigate}
        user={user}
        onLogout={handleLogout}
      />

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-10 text-xs text-neutral-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-bold text-white">AETHERPANEL</span> — Cloud Container Hosting Platform
          </div>
          <div className="flex items-center gap-6">
            <span>BuatQris Open API Automated QRIS</span>
            <span>·</span>
            <span>Docker Container Isolation</span>
            <span>·</span>
            <span>9router Edge Routing</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
