import React, { useState, useEffect } from 'react';
import { 
  PackageOpen, 
  Download, 
  RotateCw, 
  Trash2, 
  Plus, 
  Check, 
  AlertTriangle, 
  FileCode, 
  Terminal, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  RefreshCw, 
  Loader2, 
  Bot, 
  ShieldAlert,
  ArrowRight,
  Play,
  Cpu
} from 'lucide-react';
import { apiRequest } from '../lib/api';

interface DependencyItem {
  name: string;
  version: string;
  isInstalled: boolean;
  installedVersion?: string;
  type: 'prod' | 'dev';
}

interface PackageDetails {
  hasPackageJson: boolean;
  dependencies: DependencyItem[];
  scripts: Record<string, string>;
  nodeModulesExists: boolean;
  isPython: boolean;
  pythonPackages?: Array<{ name: string; version?: string }>;
  projectSubDir?: string;
}

interface ServerPackagesTabProps {
  serverId: string;
  serverName: string;
  onOpenCodeEditor?: (filePath: string) => void;
  onSwitchToConsole?: () => void;
}

export const ServerPackagesTab: React.FC<ServerPackagesTabProps> = ({
  serverId,
  serverName,
  onOpenCodeEditor,
  onSwitchToConsole
}) => {
  const [data, setData] = useState<PackageDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionText, setActionText] = useState<string | null>(null);
  const [inputPackage, setInputPackage] = useState('');
  const [isDevDep, setIsDevDep] = useState(false);
  const [selectedPm, setSelectedPm] = useState<'npm' | 'yarn' | 'pnpm' | 'pip'>('npm');
  const [customCmd, setCustomCmd] = useState('');
  const [consoleOutput, setConsoleOutput] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [codeScan, setCodeScan] = useState<{
    detectedPackages: string[];
    missingPackages: string[];
    installedPackages: string[];
    recommendedPlugins: Array<{ name: string; description: string; category: string; installed: boolean }>;
  } | null>(null);
  const [scanningCode, setScanningCode] = useState(false);
  const [isAutoFixing, setIsAutoFixing] = useState(false);

  // Node.js Runtime Version State
  const [nodeVersions, setNodeVersions] = useState<Array<{
    version: string;
    fullVersion: string;
    title: string;
    tag: string;
    desc: string;
    isInstalled: boolean;
    isCurrent: boolean;
  }>>([]);
  const [currentNodeVer, setCurrentNodeVer] = useState<string>('22');
  const [selectedNodeVer, setSelectedNodeVer] = useState<string>('22');
  const [isSwitchingNode, setIsSwitchingNode] = useState(false);

  const fetchNodeVersions = async () => {
    try {
      const res = await apiRequest(`/api/servers/${serverId}/node-versions`);
      if (res.success) {
        setNodeVersions(res.versions || []);
        setCurrentNodeVer(res.current || '22');
        setSelectedNodeVer(res.current || '22');
      }
    } catch (e: any) {
      console.warn('Node version fetch error:', e.message);
    }
  };

  const handleSwitchNodeVersion = async (targetVer: string) => {
    if (isSwitchingNode) return;
    setIsSwitchingNode(true);
    setActionText(`Mengalihkan runtime server ke Node.js v${targetVer}...`);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/node-version`, {
        method: 'POST',
        body: JSON.stringify({ version: targetVer })
      });
      if (res.success) {
        setCurrentNodeVer(res.current || targetVer);
        setSelectedNodeVer(res.current || targetVer);
        setNotification({
          type: 'success',
          message: res.message || `Berhasil mengalihkan runtime ke Node.js v${targetVer}!`
        });
        await fetchNodeVersions();
      } else {
        throw new Error(res.error || 'Gagal mengubah versi Node.js');
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Gagal mengubah versi Node.js'
      });
    } finally {
      setIsSwitchingNode(false);
      setActionText(null);
    }
  };

  const scanCodeDependencies = async () => {
    try {
      setScanningCode(true);
      const res = await apiRequest(`/api/servers/${serverId}/packages/scan`);
      if (res.success) {
        setCodeScan(res);
      }
    } catch (e: any) {
      console.warn('Scan error:', e.message);
    } finally {
      setScanningCode(false);
    }
  };

  const handleAutoFixMissing = async () => {
    setIsAutoFixing(true);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/packages/auto-fix`, { method: 'POST' });
      if (res.success) {
        setNotification({
          type: 'success',
          message: res.message || 'Berhasil menginstall dependensi kode!'
        });
        await fetchPackages();
        await scanCodeDependencies();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal auto-fix dependensi' });
    } finally {
      setIsAutoFixing(false);
    }
  };

  const fetchPackages = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/api/servers/${serverId}/packages`);
      if (res.success) {
        setData(res);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal memuat daftar paket' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPackages();
    scanCodeDependencies();
  }, [serverId]);

  const handleRunInstall = async (
    packageName?: string, 
    isDev?: boolean, 
    clean?: boolean, 
    pm: 'npm' | 'yarn' | 'pnpm' | 'pip' = selectedPm
  ) => {
    const actionId = `${pm}-${packageName || 'all'}-${clean ? 'clean' : 'norm'}`;
    setActiveActionId(actionId);
    
    const desc = clean 
      ? `Membersihkan dan menginstall ulang dependensi (${pm.toUpperCase()})...` 
      : packageName 
        ? `Menginstall paket ${packageName} (${pm.toUpperCase()})...` 
        : `Menjalankan ${pm} install...`;
        
    setActionText(desc);
    setConsoleOutput(null);

    try {
      const res = await apiRequest(`/api/servers/${serverId}/packages/install`, {
        method: 'POST',
        body: JSON.stringify({ packageName, isDev, clean, packageManager: pm })
      });

      if (res.success) {
        setConsoleOutput(res.output || 'Instalasi selesai.');
        setNotification({ 
          type: 'success', 
          message: packageName 
            ? `Berhasil menginstall paket ${packageName} via ${pm.toUpperCase()}` 
            : `Berhasil menginstall semua dependensi via ${pm.toUpperCase()}!` 
        });
        if (packageName === inputPackage) setInputPackage('');
        await fetchPackages();
      } else {
        throw new Error(res.error || 'Gagal menginstall paket');
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal menjalankan instalasi' });
      if (err.output) setConsoleOutput(err.output);
    } finally {
      setActiveActionId(null);
      setActionText(null);
    }
  };

  const handleRunCustomCmd = async (commandToRun: string) => {
    const cmd = commandToRun.trim();
    if (!cmd) return;

    setActiveActionId('custom-cmd');
    setActionText(`Menjalankan terminal command: ${cmd}...`);
    setConsoleOutput(null);

    try {
      const res = await apiRequest(`/api/servers/${serverId}/exec`, {
        method: 'POST',
        body: JSON.stringify({ command: cmd })
      });

      if (res.success) {
        setConsoleOutput(res.output || 'Selesai dieksekusi.');
        setNotification({ type: 'success', message: `Perintah '${cmd}' berhasil dieksekusi.` });
        if (cmd === customCmd) setCustomCmd('');
        await fetchPackages();
      } else {
        throw new Error(res.error || 'Gagal mengeksekusi perintah');
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal mengeksekusi perintah' });
    } finally {
      setActiveActionId(null);
      setActionText(null);
    }
  };

  const handleUninstall = async (packageName: string) => {
    if (!confirm(`Hapus paket ${packageName} dari server?`)) return;
    setActiveActionId(`uninstall-${packageName}`);
    setActionText(`Menghapus paket ${packageName}...`);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/packages/uninstall`, {
        method: 'POST',
        body: JSON.stringify({ packageName })
      });
      if (res.success) {
        setConsoleOutput(res.output || 'Paket dihapus.');
        setNotification({ type: 'success', message: `Paket ${packageName} berhasil dihapus` });
        await fetchPackages();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Gagal menghapus paket' });
    } finally {
      setActiveActionId(null);
      setActionText(null);
    }
  };

  // WhatsApp Baileys Stack Presets
  const baileysPresets = [
    { name: '@whiskeysockets/baileys', desc: 'Library inti WhatsApp Web Multi-Device API', version: '^6.7.0' },
    { name: '@hapi/boom', desc: 'Error-handling library untuk koneksi & status Baileys', version: '^10.0.1' },
    { name: 'qrcode-terminal', desc: 'Tampilkan QR Code langsung di Console Terminal', version: '^0.12.0' },
    { name: 'pino', desc: 'High-speed structured logger wajib untuk Baileys', version: '^9.5.0' },
    { name: 'dotenv', desc: 'Muat file environment variable .env', version: '^16.4.7' }
  ];

  const popularGeneralPresets = [
    { name: 'axios', desc: 'HTTP client untuk REST API' },
    { name: 'express', desc: 'Web server & dashboard' },
    { name: 'moment', desc: 'Format waktu & tanggal' },
    { name: 'chalk', desc: 'Warna teks console' },
    { name: 'discord.js', desc: 'Discord Bot Client' }
  ];

  const handleInstallBaileysStack = async () => {
    await handleRunInstall('@whiskeysockets/baileys @hapi/boom qrcode-terminal pino', false, false, 'npm');
  };

  const missingDependencies = data?.dependencies.filter(d => !d.isInstalled) || [];

  return (
    <div className="space-y-6">
      {/* Top Banner Alert / Notification */}
      {notification && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-mono animate-in fade-in ${
          notification.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' 
            : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-neutral-400 hover:text-white text-xs">Tutup</button>
        </div>
      )}

      {/* Header Overview Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <PackageOpen className="w-5 h-5" />
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">Pengelola Paket Multi-Bahasa (NPM / Yarn / PIP / Shell)</h2>
            </div>
            <p className="text-xs text-neutral-400">
              Kelola dependensi Node.js, Yarn, Python PIP, pasang WhatsApp Bot Baileys, atau eksekusi perintah terminal secara cepat.
            </p>
          </div>

          {/* Package Manager Selector Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-950 rounded-xl border border-neutral-800">
            {(['npm', 'yarn', 'pnpm', 'pip'] as const).map((pm) => (
              <button
                key={pm}
                onClick={() => setSelectedPm(pm)}
                className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-colors ${
                  selectedPm === pm
                    ? 'bg-emerald-500 text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                {pm.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Code Dependency Auto-Detector & Missing Modules Banner */}
        <div className="mt-4 pt-4 border-t border-neutral-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white">Deteksi Paket & Plugin Otomatis dari Kode</span>
              {scanningCode && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />}
            </div>

            {codeScan?.missingPackages && codeScan.missingPackages.length > 0 && (
              <button
                type="button"
                disabled={isAutoFixing}
                onClick={handleAutoFixMissing}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-950 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isAutoFixing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Install Semua Dependensi ({codeScan.missingPackages.length} Paket)</span>
              </button>
            )}
          </div>

          {codeScan?.missingPackages && codeScan.missingPackages.length > 0 ? (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-rose-200">
                <span className="font-bold">⚠️ Modul Belum Terpasang:</span> Kode Anda memanggil paket{' '}
                <span className="font-mono font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">
                  {codeScan.missingPackages.join(', ')}
                </span>{' '}
                tetapi belum terpasang di <code>node_modules</code>.
              </div>
            </div>
          ) : codeScan?.detectedPackages && codeScan.detectedPackages.length > 0 ? (
            <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Seluruh modul yang dipanggil kode Anda (<b>{codeScan.detectedPackages.join(', ')}</b>) sudah terpasang dengan lengkap di <code>node_modules</code>.
              </span>
            </div>
          ) : null}

          {/* Quick 1-Click Popular Plugins Bar */}
          {codeScan?.recommendedPlugins && (
            <div className="pt-2">
              <div className="text-[11px] text-neutral-400 mb-1.5 font-medium">Pasang plugin / paket populer dengan 1-klik:</div>
              <div className="flex flex-wrap gap-1.5">
                {codeScan.recommendedPlugins.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleRunInstall(p.name, false, false, 'npm')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 border transition-all cursor-pointer ${
                      p.installed 
                        ? 'bg-neutral-900/80 text-emerald-400 border-emerald-900/40 hover:bg-neutral-800'
                        : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-600 hover:text-white'
                    }`}
                    title={p.description}
                  >
                    {p.installed ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3 text-neutral-400" />}
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Install Action Bar */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-neutral-800">
          <button
            onClick={() => handleRunInstall(undefined, false, false, selectedPm)}
            className="px-4 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl shadow-lg shadow-emerald-500/10 flex items-center gap-2 transition-all cursor-pointer"
            title={`Jalankan ${selectedPm} install`}
          >
            {activeActionId === `${selectedPm}-all-norm` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{selectedPm === 'yarn' ? 'yarn install' : selectedPm === 'pip' ? 'pip install -r requirements.txt' : 'npm install'}</span>
          </button>

          <button
            onClick={() => handleRunInstall(undefined, false, true, selectedPm)}
            className="px-3 py-2 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Clean reinstall: membersihkan cache & mengunduh ulang dependensi"
          >
            {activeActionId === `${selectedPm}-all-clean` ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <RotateCw className="w-3.5 h-3.5 text-amber-400" />}
            <span>Clean Reinstall ({selectedPm.toUpperCase()})</span>
          </button>

          {/* Yarn Clean Quick Button */}
          <button
            onClick={() => handleRunCustomCmd('rm -rf node_modules yarn.lock && yarn cache clean && yarn install')}
            className="px-3 py-2 text-xs font-medium bg-neutral-950 hover:bg-neutral-800 text-cyan-300 border border-neutral-700 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Clean Yarn Cache & Reinstall (bebas error abu-abu)"
          >
            <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Yarn Reinstall & Clean Cache</span>
          </button>

          <button
            onClick={fetchPackages}
            className="p-2 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors"
            title="Segarkan status berkas"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-neutral-800/60 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
            <div className="text-[10px] text-neutral-500 uppercase">Aktif PM</div>
            <div className="text-white font-bold flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{selectedPm.toUpperCase()}</span>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
            <div className="text-[10px] text-neutral-500 uppercase">package.json</div>
            <div className="text-white font-bold flex items-center gap-1.5 mt-0.5">
              {data?.hasPackageJson ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 truncate" title={data.projectSubDir ? `Terdeteksi di /${data.projectSubDir}` : 'Di direktori root'}>
                    {data.projectSubDir ? `/${data.projectSubDir}` : 'Root'}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">Belum Ada</span>
                </>
              )}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
            <div className="text-[10px] text-neutral-500 uppercase">Folder node_modules</div>
            <div className="text-white font-bold flex items-center gap-1.5 mt-0.5">
              {data?.nodeModulesExists ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Siap</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400">Belum Terpasang</span>
                </>
              )}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/60">
            <div className="text-[10px] text-neutral-500 uppercase">Total Dependensi</div>
            <div className="text-white font-bold mt-0.5">
              {data?.dependencies.length || 0} paket ({missingDependencies.length > 0 ? `${missingDependencies.length} belum diinstall` : 'semua terpasang'})
            </div>
          </div>
        </div>
      </div>

      {/* NODE.JS RUNTIME VERSION SELECTOR CARD */}
      <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Cpu className="w-5 h-5" />
              </span>
              <h3 className="text-sm font-bold text-white tracking-tight">Pilih Versi Node.js (Node.js Version Selector)</h3>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                v{currentNodeVer} Aktif
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              Pilih versi Node.js yang sesuai untuk script server Anda. Node.js 20 LTS sangat direkomendasikan untuk WhatsApp Bot (<span className="text-emerald-400 font-mono">@whiskeysockets/baileys</span>) agar koneksi lancar dan tidak crash.
            </p>
          </div>

          <button
            onClick={() => handleSwitchNodeVersion(selectedNodeVer)}
            disabled={isSwitchingNode || selectedNodeVer === currentNodeVer}
            className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              selectedNodeVer !== currentNodeVer
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 animate-pulse'
                : 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
            }`}
          >
            {isSwitchingNode ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menerapkan Runtime...</span>
              </>
            ) : selectedNodeVer !== currentNodeVer ? (
              <>
                <Play className="w-4 h-4 fill-black" />
                <span>Terapkan v{selectedNodeVer} & Restart</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Versi v{currentNodeVer} Sedang Aktif</span>
              </>
            )}
          </button>
        </div>

        {/* Node Version Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {(nodeVersions.length > 0 ? nodeVersions : [
            {
              version: '20',
              fullVersion: 'v20.18.3 LTS',
              title: 'Node.js 20 LTS (Iron)',
              tag: 'Rekomendasi Utama WA Bot',
              desc: 'Paling stabil untuk WhatsApp Bot (@whiskeysockets/baileys), Discord.js v14, dan otomatisasi modern.',
              isInstalled: true,
              isCurrent: currentNodeVer === '20'
            },
            {
              version: '22',
              fullVersion: 'v22.23.3 (Current)',
              title: 'Node.js 22 Current',
              tag: 'Bawaan Sistem',
              desc: 'Runtime Node.js bawaan sistem AetherPanel dengan engine V8 terbaru dan performa JavaScript tinggi.',
              isInstalled: true,
              isCurrent: currentNodeVer === '22'
            },
            {
              version: '18',
              fullVersion: 'v18.20.7 LTS',
              title: 'Node.js 18 LTS (Hydrogen)',
              tag: 'Legacy / Kompatibilitas Lama',
              desc: 'Disediakan khusus untuk script bot lama yang memerlukan Node.js 18 atau pustaka lawas.',
              isInstalled: true,
              isCurrent: currentNodeVer === '18'
            }
          ]).map((ver) => {
            const isSelected = selectedNodeVer === ver.version;
            const isCurrent = currentNodeVer === ver.version;

            return (
              <div
                key={ver.version}
                onClick={() => setSelectedNodeVer(ver.version)}
                className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-neutral-950/80 border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/40'
                    : 'bg-neutral-950/40 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-950/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      ver.version === '20'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : ver.version === '22'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {ver.tag}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Aktif
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    {ver.title}
                  </h4>
                  <div className="text-[11px] font-mono text-neutral-400 mt-0.5">{ver.fullVersion}</div>
                  <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                    {ver.desc}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
                    <Terminal className="w-3.5 h-3.5" />
                    <span>node -v: v{ver.version}</span>
                  </div>
                  <span className={`text-xs font-bold ${isSelected ? 'text-emerald-400' : 'text-neutral-500'}`}>
                    {isSelected ? (isCurrent ? 'Versi Aktif' : 'Terpilih') : 'Pilih Versi'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Warning If Dependencies are in package.json but not installed */}
      {missingDependencies.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300">Ada {missingDependencies.length} dependensi belum terpasang di server!</span>
              <p className="text-neutral-400 text-[11px] mt-0.5 font-mono">
                {missingDependencies.map(d => d.name).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleRunInstall(undefined, false, false, selectedPm)}
            className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black rounded-lg whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install Sekarang ({selectedPm.toUpperCase()})</span>
          </button>
        </div>
      )}

      {/* Loading progress banner */}
      {activeActionId && (
        <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-500/40 flex items-center gap-3 text-xs text-blue-200 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
          <div className="font-mono">{actionText || 'Sedang memproses perintah di container...'}</div>
        </div>
      )}

      {/* DIRECT TERMINAL COMMAND EXECUTOR (Executes any shell command: ls -la, cat, rm, yarn, etc.) */}
      <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Eksekusi Perintah Terminal Bebas</h3>
          </div>
          <span className="text-[11px] font-mono text-neutral-500">Mendukung: ls, cat, rm, yarn, npm, pip, python, go, git, dll</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customCmd}
            onChange={(e) => setCustomCmd(e.target.value)}
            placeholder="Ketik perintah CLI (contoh: ls -la node_modules/@sairidev/baileys-new/, cat package.json, rm -rf node_modules yarn.lock, yarn install)..."
            className="flex-1 px-3.5 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
            onKeyDown={(e) => e.key === 'Enter' && customCmd.trim() && handleRunCustomCmd(customCmd)}
          />
          <button
            onClick={() => handleRunCustomCmd(customCmd)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>Jalankan</span>
          </button>
        </div>

        {/* Quick Shell Shortcuts */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-400 pt-1">
          <span className="text-[10px] font-mono text-neutral-500">Pilihan Cepat:</span>
          {[
            { label: 'ls -la (Semua berkas)', cmd: 'ls -la' },
            { label: 'cat package.json', cmd: 'cat package.json' },
            { label: 'Cek Baileys Module', cmd: 'ls -la node_modules/@sairidev/baileys-new/ || ls -la node_modules/@whiskeysockets/baileys/' },
            { label: 'Hapus node_modules & yarn.lock', cmd: 'rm -rf node_modules yarn.lock package-lock.json' },
            { label: 'yarn cache clean', cmd: 'yarn cache clean' },
            { label: 'yarn install', cmd: 'yarn install' }
          ].map((sc, i) => (
            <button
              key={i}
              onClick={() => handleRunCustomCmd(sc.cmd)}
              className="px-2 py-0.5 rounded-md bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 font-mono text-[11px] transition-colors cursor-pointer border border-neutral-700/60"
            >
              ${sc.label}
            </button>
          ))}
        </div>
      </div>

      {/* SPECIAL PRESET SECTION: WhatsApp Baileys Bot */}
      <div className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Bot className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Preset Modul WhatsApp Bot (Baileys)</h3>
              <p className="text-[11px] text-neutral-400">
                Paket utama untuk menjalankan bot WhatsApp Multi-Device menggunakan <code>@whiskeysockets/baileys</code>.
              </p>
            </div>
          </div>
          <button
            onClick={handleInstallBaileysStack}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Install Semua Sekaligus</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {baileysPresets.map(preset => {
            const isInstalled = data?.dependencies.some(d => d.name === preset.name && d.isInstalled);
            return (
              <div 
                key={preset.name}
                className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80 hover:border-neutral-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white font-mono">{preset.name}</span>
                    {isInstalled ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Terinstall
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-neutral-500">{preset.version}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2">{preset.desc}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-neutral-900 flex items-center justify-between">
                  <span className="text-[10px] text-neutral-500 font-mono">{selectedPm} install {preset.name}</span>
                  <button
                    onClick={() => handleRunInstall(preset.name, false, false, selectedPm)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                      isInstalled
                        ? 'text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800'
                        : 'text-black bg-emerald-400 hover:bg-emerald-300 font-semibold'
                    }`}
                  >
                    {isInstalled ? 'Reinstall' : 'Install'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Install New Package Input Form */}
      <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Pasang Paket {selectedPm.toUpperCase()} Baru</h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputPackage}
              onChange={(e) => setInputPackage(e.target.value)}
              placeholder={`Ketik nama paket ${selectedPm.toUpperCase()} (contoh: @whiskeysockets/baileys, axios, discord.js)...`}
              className="w-full px-3.5 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
              onKeyDown={(e) => e.key === 'Enter' && inputPackage.trim() && handleRunInstall(inputPackage.trim(), isDevDep, false, selectedPm)}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-neutral-400 font-mono cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDevDep}
              onChange={(e) => setIsDevDep(e.target.checked)}
              className="rounded border-neutral-700 text-emerald-500 bg-neutral-900"
            />
            <span>--save-dev</span>
          </label>

          <button
            onClick={() => handleRunInstall(inputPackage.trim(), isDevDep, false, selectedPm)}
            className="px-4 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Pasang ({selectedPm.toUpperCase()})</span>
          </button>
        </div>

        {/* Quick Suggestions */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
          <span className="text-[11px] font-mono text-neutral-500">Populer:</span>
          {popularGeneralPresets.map(p => (
            <button
              key={p.name}
              onClick={() => handleRunInstall(p.name, false, false, selectedPm)}
              className="px-2 py-0.5 rounded-md bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 font-mono text-[11px] transition-colors cursor-pointer"
              title={p.desc}
            >
              +{p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Currently Declared Dependencies Table */}
      <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-neutral-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Dependensi Terdaftar ({data?.dependencies.length || 0})
            </h3>
          </div>

          {onOpenCodeEditor && (
            <button
              onClick={() => onOpenCodeEditor('package.json')}
              className="text-xs font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              <span>Edit package.json</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-neutral-500 font-mono flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
            <span>Memuat informasi modul...</span>
          </div>
        ) : !data?.dependencies || data.dependencies.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500 font-mono">
            Belum ada dependensi terdaftar di berkas package.json.
            <div className="mt-2 text-neutral-400">
              Gunakan form di atas untuk memasang paket seperti <code>@whiskeysockets/baileys</code> atau <code>@hapi/boom</code>.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-[11px]">
                  <th className="py-2.5 px-3">Nama Paket</th>
                  <th className="py-2.5 px-3">Versi (package.json)</th>
                  <th className="py-2.5 px-3">Status Terinstall</th>
                  <th className="py-2.5 px-3">Tipe</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {data.dependencies.map(dep => (
                  <tr key={dep.name} className="hover:bg-neutral-800/30">
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {dep.name}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400">
                      {dep.version}
                    </td>
                    <td className="py-2.5 px-3">
                      {dep.isInstalled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Check className="w-3 h-3" />
                          <span>v{dep.installedVersion || 'Terinstall'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Belum Terpasang</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400">
                        {dep.type === 'dev' ? 'dev' : 'prod'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleRunInstall(dep.name, false, false, selectedPm)}
                          className="px-2 py-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded transition-colors cursor-pointer"
                          title="Install ulang paket ini"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleUninstall(dep.name)}
                          className="px-2 py-1 text-[11px] bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 rounded transition-colors cursor-pointer"
                          title="Hapus paket ini"
                        >
                          <Trash2 className="w-3 h-3" />
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

      {/* Output Console Result */}
      {consoleOutput && (
        <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white font-bold">Output Execution Result</span>
            </div>
            <div className="flex items-center gap-3">
              {onSwitchToConsole && (
                <button
                  onClick={onSwitchToConsole}
                  className="text-neutral-400 hover:text-white flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <span>Lihat di Console Utama</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => setConsoleOutput(null)}
                className="text-neutral-500 hover:text-white text-[11px] cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
          <pre className="p-3 rounded-xl bg-black border border-neutral-900 text-xs font-mono text-neutral-300 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {consoleOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
