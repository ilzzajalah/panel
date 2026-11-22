import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  ExternalLink, 
  Server, 
  CreditCard, 
  ShieldAlert, 
  Info, 
  AlertTriangle,
  X,
  HardDrive
} from 'lucide-react';
import type { AppNotification, NotificationCategory, NotificationSeverity } from '../../packages/shared/types';
import { apiRequest } from '../lib/api';

interface NotificationDropdownProps {
  onServerStatusChange?: (serverId: string, status: string) => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ onServerStatusChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'server' | 'billing' | 'security' | 'system'>('all');
  const [latestToast, setLatestToast] = useState<AppNotification | null>(null);
  const [toastTimer, setToastTimer] = useState<NodeJS.Timeout | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial notifications
  const fetchNotifications = async () => {
    try {
      const res = await apiRequest<{ success: boolean; notifications: AppNotification[]; unreadCount: number }>('/api/notifications');
      if (res.success) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch {
      // Quiet fail if guest or offline
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time WebSocket connection
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let isMounted = true;

    const connectWebSocket = () => {
      const token = localStorage.getItem('token') || '';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (token) {
            ws.send(JSON.stringify({ type: 'auth', token }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'notification' && data.notification) {
              const newNotif = data.notification as AppNotification;
              setNotifications(prev => [newNotif, ...prev.filter(n => n.id !== newNotif.id)]);
              setUnreadCount(prev => prev + 1);

              // Show real-time popup toast
              if (toastTimer) clearTimeout(toastTimer);
              setLatestToast(newNotif);
              const timer = setTimeout(() => setLatestToast(null), 6000);
              setToastTimer(timer);
            } else if (data.type === 'admin_alert') {
              fetchNotifications();
            } else if (data.type === 'server_status' && onServerStatusChange) {
              onServerStatusChange(data.serverId, data.status);
            }
          } catch {
            // ignore non-json
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            reconnectTimeout = setTimeout(connectWebSocket, 5000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (isMounted) {
          reconnectTimeout = setTimeout(connectWebSocket, 8000);
        }
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      if (toastTimer) clearTimeout(toastTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [onServerStatusChange]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/notifications/${id}`, { method: 'DELETE' });
      const target = notifications.find(n => n.id === id);
      if (target && !target.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {
      // ignore
    }
  };

  const getCategoryIcon = (category: NotificationCategory, severity: NotificationSeverity) => {
    switch (category) {
      case 'server':
        return <Server className="w-4 h-4 text-blue-400" />;
      case 'billing':
        return <CreditCard className="w-4 h-4 text-emerald-400" />;
      case 'security':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case 'backup':
        return <HardDrive className="w-4 h-4 text-indigo-400" />;
      default:
        if (severity === 'danger') return <AlertTriangle className="w-4 h-4 text-rose-400" />;
        return <Info className="w-4 h-4 text-amber-400" />;
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'server') return n.category === 'server' || n.category === 'backup' || n.category === 'provisioning';
    if (activeTab === 'billing') return n.category === 'billing' || n.category === 'payment';
    if (activeTab === 'security') return n.category === 'security';
    if (activeTab === 'system') return n.category === 'system';
    return true;
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) {
            // Optionally fetch fresh notifications
            fetchNotifications();
          }
        }}
        className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        title="Pemberitahuan & Notifikasi"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[10px] font-bold text-white items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Floating Realtime Toast */}
      {latestToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-4 flex items-start space-x-3 animate-bounce-short backdrop-blur-md">
          <div className="p-2 rounded-lg bg-slate-800 shrink-0">
            {getCategoryIcon(latestToast.category, latestToast.severity)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {latestToast.category}
              </span>
              <button 
                onClick={() => setLatestToast(null)} 
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <h4 className="text-sm font-medium text-white truncate mt-0.5">{latestToast.title}</h4>
            <p className="text-xs text-slate-300 line-clamp-2 mt-1">{latestToast.message}</p>
            {latestToast.link && (
              <a 
                href={latestToast.link}
                className="inline-flex items-center space-x-1 text-xs text-cyan-400 hover:underline mt-2"
                onClick={() => setLatestToast(null)}
              >
                <span>Lihat Detail</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-white text-sm">Notifikasi</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full">
                  {unreadCount} baru
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 transition-colors"
                title="Tandai semua dibaca"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Baca Semua</span>
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center px-2 py-1.5 border-b border-slate-800/80 bg-slate-950/40 text-xs overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'server', label: 'Server & Backup' },
              { id: 'billing', label: 'Pembayaran' },
              { id: 'security', label: 'Keamanan' },
              { id: 'system', label: 'Sistem' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/15 text-cyan-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/50">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada notifikasi di kategori ini</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => !notif.isRead && handleMarkAsRead(notif.id)}
                  className={`p-4 transition-colors cursor-pointer group flex items-start space-x-3 ${
                    notif.isRead 
                      ? 'bg-slate-900/40 hover:bg-slate-800/40' 
                      : 'bg-cyan-950/20 hover:bg-cyan-950/30 border-l-2 border-cyan-500'
                  }`}
                >
                  <div className="p-2 rounded-lg bg-slate-800/80 shrink-0 mt-0.5">
                    {getCategoryIcon(notif.category, notif.severity)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-xs font-semibold truncate ${notif.isRead ? 'text-slate-300' : 'text-white'}`}>
                        {notif.title}
                      </h4>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {new Date(notif.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                      {notif.message}
                    </p>

                    <div className="mt-2.5 flex items-center justify-between">
                      {notif.link ? (
                        <a
                          href={notif.link}
                          onClick={() => setIsOpen(false)}
                          className="inline-flex items-center space-x-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium"
                        >
                          <span>Buka</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : <span />}

                      <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!notif.isRead && (
                          <button
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            className="p-1 text-slate-400 hover:text-emerald-400 rounded transition-colors"
                            title="Tandai dibaca"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(notif.id, e)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-slate-800/80 bg-slate-950/60 text-center text-[11px] text-slate-500">
            Pembaruan realtime via WebSocket & Nodemailer Email
          </div>
        </div>
      )}
    </div>
  );
};
