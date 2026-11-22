import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Terminal, 
  Cpu, 
  HardDrive, 
  Plus, 
  Clock, 
  RefreshCw, 
  AlertCircle,
  ExternalLink,
  Shield,
  ArrowUpRight
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { ServerInstance } from '@/packages/shared/types';

interface DashboardPageProps {
  user: any;
  onSelectServer: (serverId: string) => void;
  onNavigateConfigure: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  onSelectServer,
  onNavigateConfigure
}) => {
  const [servers, setServers] = useState<ServerInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchServers = async () => {
    try {
      const data = await apiRequest('/api/servers');
      if (data.success) {
        setServers(data.servers);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengambil daftar server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 8000);
    return () => clearInterval(interval);
  }, []);

  const totalRam = servers.reduce((acc, s) => acc + s.ramMb, 0);
  const totalDisk = servers.reduce((acc, s) => acc + s.diskGb, 0);
  const runningServers = servers.filter(s => s.status === 'running').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-screen">
      {/* Top Welcome & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Dashboard Server
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Selamat datang, <span className="text-white font-semibold">{user.name}</span>. Kelola alokasi container dan akses console Anda.
          </p>
        </div>

        <button
          onClick={onNavigateConfigure}
          className="px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center gap-2 shadow-lg self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Buat Server Baru</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 mb-6 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Bento Grid Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <div className="text-xs font-mono text-neutral-500 mb-1">Total Server</div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">{servers.length}</div>
          <div className="text-[11px] text-neutral-400 mt-1 font-mono">Dedicated containers</div>
        </div>

        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <div className="text-xs font-mono text-neutral-500 mb-1">Status Aktif</div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">{runningServers} Running</div>
          <div className="text-[11px] text-neutral-400 mt-1 font-mono">{servers.length - runningServers} Offline</div>
        </div>

        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <div className="text-xs font-mono text-neutral-500 mb-1">Alokasi RAM</div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            {totalRam >= 1024 ? `${(totalRam / 1024).toFixed(1)} GB` : `${totalRam} MB`}
          </div>
          <div className="text-[11px] text-neutral-400 mt-1 font-mono">Total dedicated memory</div>
        </div>

        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <div className="text-xs font-mono text-neutral-500 mb-1">Kapasitas NVMe</div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">{totalDisk} GB</div>
          <div className="text-[11px] text-neutral-400 mt-1 font-mono">Total volume storage</div>
        </div>
      </div>

      {/* Servers List */}
      <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-white">Daftar Server Anda</h2>
          <button
            onClick={fetchServers}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            title="Muat ulang"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-neutral-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-white" />
            <span>Memuat server...</span>
          </div>
        ) : servers.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-neutral-800 rounded-xl">
            <Server className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
            <div className="text-sm font-semibold text-white mb-1">Belum Ada Server Aktif</div>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto mb-6">
              Anda belum memiliki server aktif. Buat server pertama Anda dengan konfigurasi fleksibel dan bayar via QRIS instan.
            </p>
            <button
              onClick={onNavigateConfigure}
              className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors"
            >
              Konfigurasi Server Pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => {
              const isRunning = server.status === 'running';
              const daysLeft = Math.max(0, Math.ceil((new Date(server.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

              return (
                <div
                  key={server.id}
                  onClick={() => onSelectServer(server.id)}
                  className="p-5 rounded-xl border border-neutral-800 bg-neutral-950/70 hover:border-neutral-600 cursor-pointer transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          server.suspended 
                            ? 'bg-rose-500' 
                            : isRunning 
                              ? 'bg-emerald-400' 
                              : 'bg-neutral-600'
                        }`} />
                        <span className="text-[11px] font-mono uppercase text-neutral-400 tracking-wider">
                          {server.suspended ? 'Suspended' : server.status}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-500">
                        {server.nodeId}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-white group-hover:text-neutral-200 transition-colors mb-1 truncate">
                      {server.name}
                    </h3>
                    <div className="text-xs text-neutral-400 font-mono mb-4">
                      {server.ip}:{server.primaryPort}
                    </div>

                    <div className="space-y-1.5 py-3 border-t border-neutral-900 text-[11px] font-mono text-neutral-400">
                      <div className="flex justify-between">
                        <span>Runtime Egg</span>
                        <span className="text-white">{server.eggId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Alokasi RAM</span>
                        <span className="text-white font-semibold">
                          {server.ramMb >= 1024 ? `${server.ramMb / 1024} GB` : `${server.ramMb} MB`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>CPU & Storage</span>
                        <span className="text-white">{server.cpuPercent}% / {server.diskGb}GB</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-neutral-900 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <Clock className={`w-3 h-3 ${server.suspended ? 'text-rose-400' : 'text-neutral-400'}`} />
                      <span className={server.suspended ? 'text-rose-400 font-bold' : 'text-neutral-300'}>
                        {server.suspended 
                          ? 'Masa Aktif Habis' 
                          : daysLeft > 1000 
                            ? 'Permanen 24/7 VIP' 
                            : `Sisa Aktif: ${daysLeft} Hari`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-semibold text-white group-hover:translate-x-0.5 transition-transform">
                      <span>Kelola Panel</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
