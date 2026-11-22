import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal as TerminalIcon, 
  Folder, 
  Play, 
  Square, 
  RotateCw, 
  PowerOff, 
  Cpu, 
  HardDrive, 
  Radio, 
  Settings, 
  Archive, 
  Database, 
  Clock, 
  Users, 
  Globe2, 
  CreditCard,
  FileCode,
  Plus,
  Trash2,
  FolderPlus,
  Upload,
  Download,
  GitBranch,
  RefreshCw,
  AlertCircle,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Copy,
  UploadCloud,
  Link2,
  FileArchive,
  PackageOpen,
  Loader2,
  CheckSquare,
  X,
  FolderOpen,
  ArrowUpCircle
} from 'lucide-react';
import { ConsoleTerminal } from '../components/ConsoleTerminal';
import { CodeEditor } from '../components/CodeEditor';
import { ServerPackagesTab } from '../components/ServerPackagesTab';
import { ServerBackupsTab } from '../components/ServerBackupsTab';
import { ServerMetricsCharts, MetricPoint } from '../components/ServerMetricsCharts';
import { apiRequest } from '../lib/api';
import { ServerInstance, ServerStats, FileItem, ServerBackup, ServerSchedule, ServerDatabase, SubUserItem } from '@/packages/shared/types';

interface ServerDetailPageProps {
  serverId: string;
  onBack: () => void;
  onNavigateCheckout: (orderCode: string) => void;
}

export const ServerDetailPage: React.FC<ServerDetailPageProps> = ({
  serverId,
  onBack,
  onNavigateCheckout
}) => {
  const [activeTab, setActiveTab] = useState<'console' | 'files' | 'packages' | 'startup' | 'backups' | 'network' | 'databases' | 'schedules' | 'subusers' | 'settings' | 'billing'>('console');
  const [server, setServer] = useState<ServerInstance | null>(null);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricPoint[]>([]);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // File Manager State
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [editingFile, setEditingFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [newFileModal, setNewFileModal] = useState<'file' | 'folder' | null>(null);
  const [newEntryName, setNewEntryName] = useState('');
  const [gitModal, setGitModal] = useState(false);
  const [gitUrl, setGitUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');

  // File Import & Unarchive State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [importUrlModal, setImportUrlModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importFilename, setImportFilename] = useState('');
  const [unarchiveModal, setUnarchiveModal] = useState<{
    zipPath: string;
    fileName: string;
    destination: string;
    deleteAfter: boolean;
    flattenRoot: boolean;
  } | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [archiveModal, setArchiveModal] = useState(false);
  const [archiveName, setArchiveName] = useState('');

  // Sub-features state
  const [backups, setBackups] = useState<ServerBackup[]>([]);
  const [databases, setDatabases] = useState<ServerDatabase[]>([]);
  const [schedules, setSchedules] = useState<ServerSchedule[]>([]);
  const [subusers, setSubusers] = useState<SubUserItem[]>([]);

  // Startup & Settings
  const [startupCmd, setStartupCmd] = useState('');
  const [entryFile, setEntryFile] = useState('');
  const [serverName, setServerName] = useState('');
  const [autoRestart, setAutoRestart] = useState(true);
  const [togglingAlwaysOn, setTogglingAlwaysOn] = useState(false);
  const [copiedKeepAlive, setCopiedKeepAlive] = useState(false);
  const [pingTestStatus, setPingTestStatus] = useState<string | null>(null);

  // 9router Custom Domain
  const [customDomain, setCustomDomain] = useState('');
  const [domainStatus, setDomainStatus] = useState<any>(null);

  // Renewal duration
  const [renewMonths, setRenewMonths] = useState<number>(1);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial Fetch
  const fetchServerDetails = async () => {
    try {
      const data = await apiRequest(`/api/servers/${serverId}`);
      if (data.success) {
        setServer(data.server);
        setStats(data.stats);
        setStartupCmd(data.server.startupCommand || '');
        setEntryFile(data.server.entryFile || '');
        setServerName(data.server.name || '');
        setAutoRestart(data.server.autoRestart ?? true);
        if (data.route) {
          setCustomDomain(data.route.domain);
          setDomainStatus(data.route);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServerDetails();
    apiRequest(`/api/servers/${serverId}/logs`)
      .then(res => {
        if (res.success && res.logs && res.logs.length > 0) {
          setLogs(res.logs);
        }
      })
      .catch(() => {});
  }, [serverId]);

  // Connect SSE for Realtime Logs & Stats with Fallback Polling for Mobile Browsers
  useEffect(() => {
    let sse: EventSource | null = null;
    let sseConnected = false;

    const initSSE = () => {
      try {
        if (sse) sse.close();
        sse = new EventSource(`/api/servers/${serverId}/stream`);
        eventSourceRef.current = sse;

        sse.onopen = () => {
          sseConnected = true;
        };

        sse.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'log') {
              setLogs(prev => [...prev.slice(-300), payload.chunk]);
            } else if (payload.type === 'stats') {
              setStats(payload.stats);
            }
          } catch {}
        };

        sse.onerror = () => {
          sseConnected = false;
          try { sse?.close(); } catch {}
        };
      } catch {
        sseConnected = false;
      }
    };

    initSSE();

    // Fallback Polling Interval (Guarantees mobile browsers stay updated even when SSE drops or backgrounded)
    const pollTimer = setInterval(() => {
      if (!sseConnected || !sse || sse.readyState === EventSource.CLOSED) {
        fetchServerDetails();
        apiRequest(`/api/servers/${serverId}/logs`)
          .then(res => {
            if (res.success && res.logs && res.logs.length > 0) {
              setLogs(res.logs);
            }
          })
          .catch(() => {});

        if (!sse || sse.readyState === EventSource.CLOSED) {
          initSSE();
        }
      }
    }, 3000);

    return () => {
      clearInterval(pollTimer);
      if (sse) sse.close();
    };
  }, [serverId]);

  // Fetch metrics manually on demand
  const handleRefreshStats = async () => {
    setIsRefreshingStats(true);
    try {
      const data = await apiRequest(`/api/servers/${serverId}/stats`);
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch {}
    finally {
      setIsRefreshingStats(false);
    }
  };

  // Accumulate metrics history for Recharts graphs
  useEffect(() => {
    if (!stats) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const memUsedMb = Math.round((stats.memoryBytes || 0) / (1024 * 1024));
    const memLimitMb = server?.ramMb || 1024;
    const memPercent = Math.min(100, Math.round((memUsedMb / (memLimitMb || 1)) * 100));
    const cpuVal = Number((stats.cpuPercent || 0).toFixed(1));
    const cpuLimitVal = server?.cpuPercent || 100;

    setMetricsHistory(prev => {
      if (prev.length > 0 && Date.now() - prev[prev.length - 1].timestamp < 1200) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          time: timeStr,
          timestamp: Date.now(),
          cpuPercent: cpuVal,
          ramMb: memUsedMb,
          ramPercent: memPercent,
          cpuLimit: cpuLimitVal,
          ramLimitMb: memLimitMb
        };
        return updated;
      }

      const newPoint: MetricPoint = {
        time: timeStr,
        timestamp: Date.now(),
        cpuPercent: cpuVal,
        ramMb: memUsedMb,
        ramPercent: memPercent,
        cpuLimit: cpuLimitVal,
        ramLimitMb: memLimitMb
      };

      return [...prev.slice(-29), newPoint];
    });
  }, [stats, server?.ramMb, server?.cpuPercent]);

  // Tab Loaders
  useEffect(() => {
    if (activeTab === 'files' && server) {
      loadFiles(currentPath);
    } else if (activeTab === 'backups') {
      loadBackups();
    } else if (activeTab === 'databases') {
      loadDatabases();
    } else if (activeTab === 'schedules') {
      loadSchedules();
    } else if (activeTab === 'subusers') {
      loadSubusers();
    }
  }, [activeTab, currentPath, server]);

  const [powerActionRunning, setPowerActionRunning] = useState<'start' | 'stop' | 'restart' | 'kill' | null>(null);

  // Power Actions
  const handlePowerAction = async (action: 'start' | 'stop' | 'restart' | 'kill') => {
    setPowerActionRunning(action);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/power`, {
        method: 'POST',
        body: JSON.stringify({ action })
      });
      if (res.success) {
        fetchServerDetails();
      }
    } catch (err: any) {
      setErrorMsg(err.message || `Gagal menjalankan aksi ${action}`);
    } finally {
      setPowerActionRunning(null);
    }
  };

  const handleSendCommand = async (command: string) => {
    try {
      await apiRequest(`/api/servers/${serverId}/command`, {
        method: 'POST',
        body: JSON.stringify({ command })
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengirim perintah');
    }
  };

  // --- File Manager Handlers ---
  const loadFiles = async (relPath: string = '') => {
    try {
      const data = await apiRequest(`/api/servers/${serverId}/files?path=${encodeURIComponent(relPath)}`);
      if (data.success) {
        setFiles(data.files);
        setCurrentPath(data.currentPath || '');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuka folder');
    }
  };

  const handleOpenFile = async (file: FileItem) => {
    if (file.isDirectory) {
      setCurrentPath(file.path);
    } else if (file.isEditable) {
      try {
        const res = await apiRequest(`/api/servers/${serverId}/files/content?path=${encodeURIComponent(file.path)}`);
        setEditingFile({ path: file.path, name: file.name, content: res.content });
      } catch (err: any) {
        setErrorMsg(err.message || 'Gagal membaca file');
      }
    }
  };

  const handleRunQuickNpmInstall = async () => {
    setActionLoading(true);
    setSuccessMsg('Sedang menjalankan npm install di server...');
    try {
      const res = await apiRequest(`/api/servers/${serverId}/packages/install`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (res.success) {
        setSuccessMsg('Instalasi dependensi npm berhasil diselesaikan!');
        setTimeout(() => setSuccessMsg(null), 4000);
        loadFiles(currentPath);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menjalankan npm install');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveFileContent = async (newContent: string) => {
    if (!editingFile) return;
    await apiRequest(`/api/servers/${serverId}/files/content`, {
      method: 'POST',
      body: JSON.stringify({ path: editingFile.path, content: newContent })
    });
    const isPkg = editingFile.name.toLowerCase().includes('package.json');
    if (isPkg) {
      setSuccessMsg('File package.json berhasil disimpan! Klik tombol "Jalankan npm install" di atas untuk memasang dependensi.');
      setTimeout(() => setSuccessMsg(null), 6000);
    } else {
      setSuccessMsg('File berhasil disimpan');
      setTimeout(() => setSuccessMsg(null), 2500);
    }
  };

  const handleCreateEntry = async () => {
    if (!newEntryName.trim()) return;
    const targetPath = currentPath ? `${currentPath}/${newEntryName.trim()}` : newEntryName.trim();
    try {
      await apiRequest(`/api/servers/${serverId}/files/create`, {
        method: 'POST',
        body: JSON.stringify({ path: targetPath, isDirectory: newFileModal === 'folder' })
      });
      setNewFileModal(null);
      setNewEntryName('');
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuat file/folder');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus ${filePath}?`)) return;
    try {
      await apiRequest(`/api/servers/${serverId}/files`, {
        method: 'DELETE',
        body: JSON.stringify({ path: filePath })
      });
      setSuccessMsg(`File/folder ${filePath} berhasil dihapus.`);
      setTimeout(() => setSuccessMsg(null), 2500);
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus file');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedPaths.length === 0) return;
    if (!confirm(`Apakah Anda yakin ingin menghapus ${selectedPaths.length} file/folder yang dipilih?`)) return;
    try {
      await apiRequest(`/api/servers/${serverId}/files`, {
        method: 'DELETE',
        body: JSON.stringify({ paths: selectedPaths })
      });
      setSuccessMsg(`${selectedPaths.length} file/folder berhasil dihapus.`);
      setTimeout(() => setSuccessMsg(null), 2500);
      setSelectedPaths([]);
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus file terpilih');
    }
  };

  // Convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Upload multiple or single files in batch chunks to prevent 429 rate limit
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    setErrorMsg(null);

    const filesArray = Array.from(fileList);
    const total = filesArray.length;

    try {
      const BATCH_SIZE = 15;
      let completed = 0;

      for (let i = 0; i < filesArray.length; i += BATCH_SIZE) {
        const chunk = filesArray.slice(i, i + BATCH_SIZE);
        setUploadStatus(`Mengunggah berkas (${completed + 1}-${Math.min(completed + chunk.length, total)} dari ${total})...`);

        const batchItems = await Promise.all(
          chunk.map(async (file) => {
            const base64 = await fileToBase64(file);
            const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
            return { path: relPath, contentBase64: base64 };
          })
        );

        await apiRequest(`/api/servers/${serverId}/files/batch-upload`, {
          method: 'POST',
          body: JSON.stringify({ files: batchItems })
        });

        completed += chunk.length;

        // 150ms backoff between batch requests to prevent rate limiting
        if (i + BATCH_SIZE < filesArray.length) {
          await new Promise(r => setTimeout(r, 150));
        }
      }

      setSuccessMsg(`Berhasil meng-import ${completed} file ke ${currentPath || '/home/container'}`);
      setTimeout(() => setSuccessMsg(null), 3500);
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengunggah file. Disarankan mengunggah file dalam format .ZIP untuk kecepatan terbaik.');
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleUploadFiles(e.dataTransfer.files);
    }
  };

  // Import file from direct URL
  const handleImportFromUrl = async () => {
    if (!importUrl.trim()) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const targetDir = currentPath ? `${currentPath}/` : '';
      const destPath = importFilename.trim() 
        ? (currentPath ? `${currentPath}/${importFilename.trim()}` : importFilename.trim()) 
        : targetDir;
      
      const res = await apiRequest(`/api/servers/${serverId}/files/import-url`, {
        method: 'POST',
        body: JSON.stringify({
          url: importUrl.trim(),
          targetPath: destPath
        })
      });

      setImportUrlModal(false);
      setImportUrl('');
      setImportFilename('');
      setSuccessMsg(`File berhasil di-import dari URL: ${res.path || ''}`);
      setTimeout(() => setSuccessMsg(null), 3500);
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengunduh file dari URL');
    } finally {
      setActionLoading(false);
    }
  };

  // Unarchive ZIP
  const handleUnarchiveZip = async (zipPath: string, destination?: string, deleteAfter?: boolean, flattenRoot?: boolean) => {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/files/extract`, {
        method: 'POST',
        body: JSON.stringify({ 
          path: zipPath,
          destination: destination !== undefined ? destination : currentPath,
          deleteAfterExtract: !!deleteAfter,
          flattenRootFolder: !!flattenRoot
        })
      });
      setUnarchiveModal(null);
      setSuccessMsg(res.message || 'Arsip ZIP berhasil di-unarchive!');
      setTimeout(() => setSuccessMsg(null), 4500);
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal meng-unarchive ZIP');
    } finally {
      setActionLoading(false);
    }
  };

  // Flatten subfolder contents directly to server root
  const handleFlattenFolder = async (folderPath: string) => {
    if (!confirm(`Pindahkan seluruh isi dari folder "${folderPath}" langsung ke direktori utama (/home/container)?`)) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/files/flatten-folder`, {
        method: 'POST',
        body: JSON.stringify({ folderPath })
      });
      setSuccessMsg(res.message || 'Isi folder berhasil dipindahkan ke Root!');
      setTimeout(() => setSuccessMsg(null), 4000);
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memindahkan isi folder ke root');
    } finally {
      setActionLoading(false);
    }
  };

  // Archive selected files to ZIP
  const handleArchiveFiles = async () => {
    if (selectedPaths.length === 0) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const zipName = archiveName.trim() || `archive_${Date.now()}.zip`;
      const res = await apiRequest(`/api/servers/${serverId}/files/archive`, {
        method: 'POST',
        body: JSON.stringify({
          paths: selectedPaths,
          outputZipName: currentPath ? `${currentPath}/${zipName}` : zipName
        })
      });
      setArchiveModal(false);
      setSelectedPaths([]);
      setArchiveName('');
      setSuccessMsg(res.message || 'Berhasil mengarsipkan file ke ZIP');
      setTimeout(() => setSuccessMsg(null), 3000);
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengarsipkan file');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle selection
  const toggleSelectPath = (path: string) => {
    setSelectedPaths(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPaths.length === files.length) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(files.map(f => f.path));
    }
  };

  const handleGitClone = async () => {
    if (!gitUrl.trim()) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/servers/${serverId}/files/git-clone`, {
        method: 'POST',
        body: JSON.stringify({ repoUrl: gitUrl.trim(), branch: gitBranch.trim() })
      });
      setGitModal(false);
      setGitUrl('');
      setSuccessMsg('Git repository berhasil di-clone ke server');
      loadFiles(currentPath);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal clone git');
    } finally {
      setActionLoading(false);
    }
  };

  // --- Sub-feature Loaders ---
  const loadBackups = async () => {
    const res = await apiRequest(`/api/servers/${serverId}/backups`);
    if (res.success) setBackups(res.backups);
  };

  const handleCreateBackup = async () => {
    setActionLoading(true);
    try {
      await apiRequest(`/api/servers/${serverId}/backups`, {
        method: 'POST',
        body: JSON.stringify({ name: `Backup_${new Date().toISOString().slice(0, 10)}` })
      });
      loadBackups();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const loadDatabases = async () => {
    const res = await apiRequest(`/api/servers/${serverId}/databases`);
    if (res.success) setDatabases(res.databases);
  };

  const handleCreateDatabase = async () => {
    const name = prompt('Masukkan nama database baru:');
    if (!name) return;
    try {
      await apiRequest(`/api/servers/${serverId}/databases`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      loadDatabases();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const loadSchedules = async () => {
    const res = await apiRequest(`/api/servers/${serverId}/schedules`);
    if (res.success) setSchedules(res.schedules);
  };

  const loadSubusers = async () => {
    const res = await apiRequest(`/api/servers/${serverId}/subusers`);
    if (res.success) setSubusers(res.subusers);
  };

  // Save Startup & Settings
  const handleSaveSettings = async () => {
    try {
      await apiRequest(`/api/servers/${serverId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: serverName,
          startupCommand: startupCmd,
          entryFile,
          autoRestart,
          alwaysOn247: autoRestart
        })
      });
      setSuccessMsg('Pengaturan berhasil diperbarui');
      setTimeout(() => setSuccessMsg(null), 2500);
      fetchServerDetails();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Toggle 24/7 Always-On Mode
  const handleToggleAlwaysOn = async (targetState?: boolean) => {
    if (!server) return;
    const currentEnabled = server.alwaysOn247 !== false && server.autoRestart !== false;
    const nextEnabled = typeof targetState === 'boolean' ? targetState : !currentEnabled;
    setTogglingAlwaysOn(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/always-on`, {
        method: 'POST',
        body: JSON.stringify({ enabled: nextEnabled })
      });
      if (res.success && res.server) {
        setServer(res.server);
        setAutoRestart(nextEnabled);
        setSuccessMsg(res.message || (nextEnabled ? 'Mode 24 Jam aktif' : 'Mode 24 Jam nonaktif'));
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah Mode 24 Jam');
    } finally {
      setTogglingAlwaysOn(false);
    }
  };

  const handleCopyKeepAliveUrl = () => {
    const url = `${window.location.origin}/api/ping`;
    navigator.clipboard.writeText(url);
    setCopiedKeepAlive(true);
    setTimeout(() => setCopiedKeepAlive(false), 2000);
  };

  const handleTestKeepAlivePing = async () => {
    setPingTestStatus('Menguji koneksi 24/7...');
    try {
      const res = await fetch('/api/ping?source=server_panel_test', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setPingTestStatus(`Aktif 24/7 • ${data.activeServers} server online • Total ping: ${data.totalPings}x`);
      } else {
        setPingTestStatus('Gagal merespons ping');
      }
    } catch {
      setPingTestStatus('Gagal menghubungi endpoint keep-alive');
    }
  };

  // Reinstall Server Egg
  const handleReinstallServer = async () => {
    if (!confirm('PERINGATAN: Reinstall akan mereset template server dan memulai ulang instance. Lanjutkan?')) return;
    setActionLoading(true);
    try {
      await apiRequest(`/api/servers/${serverId}/reinstall`, { method: 'POST' });
      setSuccessMsg('Server berhasil di-reinstall');
      fetchServerDetails();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Renewal Order Checkout
  const handleRenewServer = async () => {
    setActionLoading(true);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/renew`, {
        method: 'POST',
        body: JSON.stringify({ months: renewMonths })
      });
      if (res.success && res.order?.orderCode) {
        onNavigateCheckout(res.order.orderCode);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !server) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center text-xs font-mono text-neutral-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-white" />
        <span>Menghubungi daemon node & memuat instance server...</span>
      </div>
    );
  }

  const isRunning = server.status === 'running' || server.status === 'starting';
  const memUsedMb = Math.round((stats?.memoryBytes || (isRunning ? 52 * 1024 * 1024 : 0)) / (1024 * 1024));
  const memLimitMb = server.ramMb;
  const memPercent = Math.min(100, Math.round((memUsedMb / memLimitMb) * 100));
  const cpuPercentVal = stats?.cpuPercent || (isRunning ? 4.5 : 0);
  const diskUsedMb = Math.round((stats?.diskBytes || 0) / (1024 * 1024));
  const diskLimitGb = server.diskGb;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen">
      {/* Top Breadcrumb & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-neutral-900">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 mb-1">
            <button onClick={onBack} className="hover:text-white transition-colors">Server</button>
            <span>/</span>
            <span className="text-white truncate">{server.name}</span>
            <span>·</span>
            <span className="text-neutral-400">{server.nodeId}</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white tracking-tight">{server.name}</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono">
              <span className={`w-2 h-2 rounded-full ${
                server.suspended ? 'bg-rose-500' : isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
              }`} />
              <span className="text-neutral-300 uppercase tracking-wider">{server.status}</span>
            </div>

            {/* Interactive 24/7 Always-On Mode Toggle */}
            <button
              type="button"
              onClick={() => handleToggleAlwaysOn()}
              disabled={togglingAlwaysOn || server.suspended}
              title="Klik untuk mengaktifkan atau menonaktifkan Mode 24 Jam Non-Stop"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-colors border ${
                server.alwaysOn247 !== false && server.autoRestart !== false
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white'
              }`}
            >
              {togglingAlwaysOn ? (
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              ) : (
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  server.alwaysOn247 !== false && server.autoRestart !== false
                    ? 'bg-emerald-400 animate-ping'
                    : 'bg-neutral-500'
                }`} />
              )}
              <span className="font-semibold">
                {server.alwaysOn247 !== false && server.autoRestart !== false ? 'MODE 24 JAM AKTIF' : 'MODE 24 JAM NONAKTIF'}
              </span>
            </button>

            <div className="text-xs font-mono text-neutral-400">
              {server.ip}:{server.primaryPort}
            </div>
          </div>
        </div>

        {/* Power Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Start Button */}
          <button
            onClick={() => handlePowerAction('start')}
            disabled={powerActionRunning !== null || server.suspended}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 shadow-sm ${
              isRunning 
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                : 'bg-white hover:bg-neutral-200 text-black font-bold'
            }`}
            title={isRunning ? "Server sedang berjalan" : "Nyalakan server"}
          >
            {powerActionRunning === 'start' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isRunning ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-black" />
            )}
            <span>{powerActionRunning === 'start' ? 'Memulai...' : isRunning ? 'Online' : 'Start'}</span>
          </button>

          {/* Restart Button */}
          <button
            onClick={() => handlePowerAction('restart')}
            disabled={powerActionRunning !== null || server.suspended}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all flex items-center gap-1.5"
            title="Mulai ulang kontainer server"
          >
            {powerActionRunning === 'restart' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{powerActionRunning === 'restart' ? 'Restarting...' : 'Restart'}</span>
          </button>

          {/* Stop Button */}
          <button
            onClick={() => handlePowerAction('stop')}
            disabled={powerActionRunning !== null || server.suspended}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-all flex items-center gap-1.5"
            title="Hentikan kontainer server (SIGINT)"
          >
            {powerActionRunning === 'stop' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
            ) : (
              <Square className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>{powerActionRunning === 'stop' ? 'Stopping...' : 'Stop'}</span>
          </button>

          {/* Kill Button */}
          <button
            onClick={() => handlePowerAction('kill')}
            disabled={powerActionRunning !== null || server.suspended}
            className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl transition-colors border border-rose-900/30"
            title="Paksa Hentikan Langsung (SIGKILL)"
          >
            {powerActionRunning === 'kill' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PowerOff className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 mb-6 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white text-xs">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 mb-6 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white text-xs">Dismiss</button>
        </div>
      )}

      {/* Tabs Navigation Strip */}
      <div className="flex items-center gap-1 p-1 bg-neutral-900/50 border border-neutral-800 rounded-xl mb-6 overflow-x-auto text-xs font-medium">
        {[
          { id: 'console', label: 'Console', icon: TerminalIcon },
          { id: 'files', label: 'File Manager', icon: Folder },
          { id: 'packages', label: 'Paket & Plugins', icon: PackageOpen },
          { id: 'startup', label: 'Startup', icon: Play },
          { id: 'backups', label: 'Backups', icon: Archive },
          { id: 'network', label: 'Network', icon: Radio },
          { id: 'databases', label: 'Databases', icon: Database },
          { id: 'schedules', label: 'Schedules', icon: Clock },
          { id: 'subusers', label: 'Subusers', icon: Users },
          { id: 'settings', label: 'Settings', icon: Settings },
          { id: 'billing', label: 'Billing & Renewal', icon: CreditCard }
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: CONSOLE */}
      {activeTab === 'console' && (
        <div className="space-y-6">
          {/* Real-time Recharts CPU & RAM Graph */}
          <ServerMetricsCharts
            metricsHistory={metricsHistory}
            cpuLimit={server.cpuPercent}
            ramLimitMb={memLimitMb}
            currentCpu={cpuPercentVal}
            currentRamMb={memUsedMb}
            currentRamPercent={memPercent}
            isRunning={isRunning}
            onRefreshStats={handleRefreshStats}
            isRefreshing={isRefreshingStats}
          />

          {/* Secondary Storage & Network Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800">
              <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-1">
                <span>NVMe Storage Usage</span>
                <span className="text-white font-bold tabular-nums">{diskUsedMb} MB</span>
              </div>
              <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-white h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (diskUsedMb / (diskLimitGb * 1024)) * 100)}%` }}
                />
              </div>
              <div className="text-[10px] font-mono text-neutral-500 mt-1.5">Kuota Penyimpanan: {diskLimitGb} GB</div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800">
              <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-1">
                <span>Network I/O & Uptime</span>
                <span className="text-white font-bold tabular-nums">
                  Rx: {Math.round((stats?.networkRxBytes || 0) / 1024)} KB / Tx: {Math.round((stats?.networkTxBytes || 0) / 1024)} KB
                </span>
              </div>
              <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-400 h-full w-full opacity-60" />
              </div>
              <div className="text-[10px] font-mono text-neutral-500 mt-1.5">
                Uptime Kontainer: {stats?.uptimeSeconds || 0} detik
              </div>
            </div>
          </div>

          {/* Interactive Console Terminal */}
          <ConsoleTerminal
            logs={logs}
            status={server.status}
            onSendCommand={handleSendCommand}
            onClear={() => setLogs([])}
          />
        </div>
      )}

      {/* TAB 2: FILE MANAGER */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          {editingFile ? (
            <CodeEditor
              filename={editingFile.name}
              initialContent={editingFile.content}
              onSave={handleSaveFileContent}
              onClose={() => setEditingFile(null)}
              onRunInstall={handleRunQuickNpmInstall}
              installing={actionLoading}
            />
          ) : (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="relative p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 transition-colors"
            >
              {/* Hidden Native File Input for Import */}
              <input
                type="file"
                ref={fileInputRef}
                multiple
                onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
                className="hidden"
              />

              {/* Drag & Drop Visual Overlay */}
              {isDraggingOver && (
                <div className="absolute inset-0 bg-neutral-950/90 border-2 border-dashed border-emerald-500 rounded-2xl z-30 flex flex-col items-center justify-center p-6 text-center animate-pulse">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div className="text-base font-bold text-white">Lepaskan File untuk Meng-Import</div>
                  <div className="text-xs text-neutral-400 font-mono mt-1">
                    File akan diunggah ke /home/container{currentPath ? `/${currentPath}` : ''}
                  </div>
                </div>
              )}

              {/* Active Uploading Status Banner */}
              {isUploading && (
                <div className="p-3 mb-4 rounded-xl bg-blue-950/50 border border-blue-500/40 flex items-center justify-between text-xs text-blue-200 animate-pulse">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                    <span className="font-medium font-mono">{uploadStatus || 'Sedang mengunggah file ke server...'}</span>
                  </div>
                  <span className="text-[11px] text-blue-400 font-mono">Proses import...</span>
                </div>
              )}

              {/* File Toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-neutral-800">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-400 overflow-x-auto py-1">
                  <button 
                    onClick={() => { setCurrentPath(''); setSelectedPaths([]); }}
                    className="hover:text-white transition-colors flex items-center gap-1 font-semibold text-neutral-300"
                  >
                    <Folder className="w-3.5 h-3.5 text-neutral-500" />
                    <span>/home/container</span>
                  </button>
                  {currentPath.split('/').filter(Boolean).map((part, idx, arr) => {
                    const subPath = arr.slice(0, idx + 1).join('/');
                    return (
                      <React.Fragment key={subPath}>
                        <span className="text-neutral-600">/</span>
                        <button 
                          onClick={() => { setCurrentPath(subPath); setSelectedPaths([]); }}
                          className="hover:text-white transition-colors"
                        >
                          {part}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Toolbar Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Primary Import Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
                    title="Pilih file dari komputer untuk diunggah ke folder ini"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Import File</span>
                  </button>

                  {/* Import from URL Button */}
                  <button
                    onClick={() => setImportUrlModal(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg flex items-center gap-1.5 transition-colors"
                    title="Download langsung file atau arsip zip dari URL web"
                  >
                    <Link2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Import URL</span>
                  </button>

                  {/* Quick NPM Install Button */}
                  <button
                    onClick={handleRunQuickNpmInstall}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    title="Jalankan 'npm install' untuk menginstall dependensi di package.json"
                  >
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageOpen className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>NPM Install</span>
                  </button>

                  {/* Batch Actions if files selected */}
                  {selectedPaths.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setArchiveModal(true)}
                        className="px-3 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg flex items-center gap-1.5 transition-colors"
                        title="Kompres file terpilih ke arsip ZIP"
                      >
                        <FileArchive className="w-3.5 h-3.5" />
                        <span>Arsipkan ZIP ({selectedPaths.length})</span>
                      </button>
                      <button
                        onClick={handleDeleteSelected}
                        className="px-3 py-1.5 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg flex items-center gap-1.5 transition-colors"
                        title="Hapus file/folder yang dicentang"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Hapus Terpilih ({selectedPaths.length})</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setNewFileModal('file')}
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>File Baru</span>
                  </button>
                  <button
                    onClick={() => setNewFileModal('folder')}
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Folder Baru</span>
                  </button>
                  <button
                    onClick={() => setGitModal(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Git Clone</span>
                  </button>
                  <button
                    onClick={() => loadFiles(currentPath)}
                    className="p-1.5 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
                    title="Muat Ulang File"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Create File / Folder Bar */}
              {newFileModal && (
                <div className="p-4 mb-4 rounded-xl bg-neutral-950 border border-neutral-700 flex items-center gap-3">
                  <input
                    type="text"
                    value={newEntryName}
                    onChange={(e) => setNewEntryName(e.target.value)}
                    placeholder={`Nama ${newFileModal === 'file' ? 'file (contoh: server.js, config.json)' : 'folder'}...`}
                    className="flex-1 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none focus:border-white"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateEntry()}
                  />
                  <button
                    onClick={handleCreateEntry}
                    className="px-3 py-1.5 text-xs font-semibold bg-white text-black rounded-lg hover:bg-neutral-200 transition-colors"
                  >
                    Buat
                  </button>
                  <button
                    onClick={() => { setNewFileModal(null); setNewEntryName(''); }}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Batal
                  </button>
                </div>
              )}

              {/* Import from URL Modal */}
              {importUrlModal && (
                <div className="p-4 mb-4 rounded-xl bg-neutral-950 border border-sky-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-sky-400" />
                      <span>Import File / ZIP dari URL Web</span>
                    </div>
                    <button 
                      onClick={() => setImportUrlModal(false)}
                      className="text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Masukkan direct link file (misal berkas ZIP bot, source code, aset, atau file konfigurasi). Server akan langsung mengunduh dan menyimpannya di folder aktif.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="url"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://example.com/bot-files.zip"
                      className="sm:col-span-2 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={importFilename}
                      onChange={(e) => setImportFilename(e.target.value)}
                      placeholder="Nama File (Opsional)"
                      className="px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleImportFromUrl}
                      disabled={actionLoading || !importUrl.trim()}
                      className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-black rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>{actionLoading ? 'Mengunduh...' : 'Mulai Import'}</span>
                    </button>
                    <button
                      onClick={() => setImportUrlModal(false)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Unarchive ZIP Modal */}
              {unarchiveModal && (
                <div className="p-4 mb-4 rounded-xl bg-neutral-950 border border-amber-500/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <PackageOpen className="w-4 h-4 text-amber-400" />
                      <span>Unarchive Arsip ZIP: <span className="font-mono text-amber-300">{unarchiveModal.fileName}</span></span>
                    </div>
                    <button 
                      onClick={() => setUnarchiveModal(null)}
                      className="text-neutral-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Semua isi berkas di dalam arsip ZIP ini akan diekstrak ke sistem server Anda dengan proteksi Zip-Slip aktif.
                  </p>

                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 font-mono">Direktori Tujuan Ekstrak:</label>
                    <input
                      type="text"
                      value={unarchiveModal.destination}
                      onChange={(e) => setUnarchiveModal({ ...unarchiveModal, destination: e.target.value })}
                      placeholder="Folder tujuan (kosongkan untuk folder saat ini)"
                      className="w-full px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                    <div className="text-[10px] text-neutral-500 font-mono">
                      Target: /home/container{unarchiveModal.destination ? `/${unarchiveModal.destination}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="flattenRoot"
                      checked={unarchiveModal.flattenRoot}
                      onChange={(e) => setUnarchiveModal({ ...unarchiveModal, flattenRoot: e.target.checked })}
                      className="rounded border-neutral-700 text-amber-500 bg-neutral-900 cursor-pointer"
                    />
                    <label htmlFor="flattenRoot" className="text-xs text-neutral-200 cursor-pointer flex items-center gap-1.5 font-medium">
                      <span>Ratakan isi folder (Ekstrak isi berkas langsung tanpa subfolder pembungkus)</span>
                      <span className="px-1.5 py-0.2 text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-sans">
                        Rekomendasi
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="delZipAfter"
                      checked={unarchiveModal.deleteAfter}
                      onChange={(e) => setUnarchiveModal({ ...unarchiveModal, deleteAfter: e.target.checked })}
                      className="rounded border-neutral-700 text-amber-500 bg-neutral-900 cursor-pointer"
                    />
                    <label htmlFor="delZipAfter" className="text-xs text-neutral-400 cursor-pointer">
                      Hapus file ZIP sumber setelah selesai di-unarchive (hemat kuota disk)
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => handleUnarchiveZip(unarchiveModal.zipPath, unarchiveModal.destination, unarchiveModal.deleteAfter, unarchiveModal.flattenRoot)}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageOpen className="w-3.5 h-3.5" />}
                      <span>{actionLoading ? 'Mengekstrak...' : 'Unarchive Sekarang'}</span>
                    </button>
                    <button
                      onClick={() => setUnarchiveModal(null)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Archive Modal (Compress to ZIP) */}
              {archiveModal && (
                <div className="p-4 mb-4 rounded-xl bg-neutral-950 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <FileArchive className="w-4 h-4 text-amber-400" />
                      <span>Arsipkan {selectedPaths.length} Berkas ke File ZIP</span>
                    </div>
                    <button onClick={() => setArchiveModal(false)} className="text-neutral-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 font-mono">Nama File ZIP Output:</label>
                    <input
                      type="text"
                      value={archiveName}
                      onChange={(e) => setArchiveName(e.target.value)}
                      placeholder="archive.zip"
                      className="w-full px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none focus:border-amber-400"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleArchiveFiles}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                      <span>{actionLoading ? 'Mengarsipkan...' : 'Arsipkan ke ZIP'}</span>
                    </button>
                    <button onClick={() => setArchiveModal(false)} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white">
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Git Clone Modal */}
              {gitModal && (
                <div className="p-4 mb-4 rounded-xl bg-neutral-950 border border-neutral-700 space-y-3">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-emerald-400" />
                    <span>Clone Repository Git Langsung ke Server Volume</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="url"
                      value={gitUrl}
                      onChange={(e) => setGitUrl(e.target.value)}
                      placeholder="https://github.com/user/repo.git"
                      className="sm:col-span-2 px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none"
                    />
                    <input
                      type="text"
                      value={gitBranch}
                      onChange={(e) => setGitBranch(e.target.value)}
                      placeholder="Branch (main)"
                      className="px-3 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGitClone}
                      disabled={actionLoading}
                      className="px-3 py-1.5 text-xs font-semibold bg-white text-black rounded-lg"
                    >
                      {actionLoading ? 'Cloning...' : 'Start Clone'}
                    </button>
                    <button
                      onClick={() => setGitModal(false)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Drag and Drop Hint Banner */}
              <div className="mb-3 px-3 py-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                <div className="flex items-center gap-2">
                  <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tips: Anda juga bisa Drag & Drop file komputer langsung ke tabel untuk meng-import.</span>
                </div>
                <span className="text-neutral-500">Mendukung berkas teks, kode, & arsip ZIP</span>
              </div>

              {/* Files Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-500 text-[11px]">
                      <th className="py-2.5 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={files.length > 0 && selectedPaths.length === files.length}
                          onChange={toggleSelectAll}
                          className="rounded border-neutral-700 text-white bg-neutral-900 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-3">Nama</th>
                      <th className="py-2.5 px-3">Ukuran</th>
                      <th className="py-2.5 px-3">Terakhir Diubah</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {currentPath && (
                      <tr 
                        onClick={() => {
                          const parts = currentPath.split('/');
                          parts.pop();
                          setCurrentPath(parts.join('/'));
                          setSelectedPaths([]);
                        }}
                        className="hover:bg-neutral-800/30 cursor-pointer text-neutral-400"
                      >
                        <td className="py-2.5 px-3"></td>
                        <td colSpan={4} className="py-2.5 px-3 flex items-center gap-2">
                          <Folder className="w-4 h-4 text-neutral-500" />
                          <span>.. (Kembali ke folder sebelumnya)</span>
                        </td>
                      </tr>
                    )}

                    {files.length === 0 && !currentPath && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-neutral-500">
                          <Folder className="w-8 h-8 mx-auto mb-2 opacity-40" />
                          Folder kosong. Klik "Import File" atau drag & drop file untuk mengunggah.
                        </td>
                      </tr>
                    )}

                    {files.length === 0 && currentPath && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-neutral-500">
                          <FolderOpen className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-amber-400" />
                          Folder ini masih kosong. Klik "Import File" atau drag & drop file untuk mengunggah ke sini.
                        </td>
                      </tr>
                    )}

                    {files.map(file => {
                      const isZip = file.name.toLowerCase().endsWith('.zip');
                      const isSelected = selectedPaths.includes(file.path);

                      return (
                        <tr 
                          key={file.path} 
                          className={`hover:bg-neutral-800/40 group transition-colors ${isSelected ? 'bg-neutral-800/20' : ''}`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectPath(file.path)}
                              className="rounded border-neutral-700 text-white bg-neutral-900 cursor-pointer"
                            />
                          </td>

                          <td 
                            onClick={() => handleOpenFile(file)}
                            className="py-2.5 px-3 text-white flex items-center gap-2 cursor-pointer font-medium"
                          >
                            {file.isDirectory ? (
                              <Folder className="w-4 h-4 text-amber-300" />
                            ) : isZip ? (
                              <FileArchive className="w-4 h-4 text-amber-400" />
                            ) : (
                              <FileCode className="w-4 h-4 text-neutral-400" />
                            )}
                            <span className="hover:underline">{file.name}</span>
                            {isZip && (
                              <span className="ml-1.5 px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded uppercase tracking-wider">
                                ZIP
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-neutral-400 tabular-nums">
                            {file.isDirectory ? (
                              <span className="text-amber-400/90 font-mono text-[11px] bg-amber-400/10 px-1.5 py-0.5 rounded">
                                {file.itemCount !== undefined ? `${file.itemCount} berkas` : 'Folder'}
                              </span>
                            ) : (
                              `${(file.sizeBytes / 1024).toFixed(1)} KB`
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-neutral-500">
                            {new Date(file.modifiedAt).toLocaleDateString('id-ID')}
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick actions for Folders */}
                              {file.isDirectory && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenFile(file);
                                    }}
                                    className="px-2 py-0.5 text-[11px] font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Buka dan lihat isi folder ini"
                                  >
                                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Buka</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFlattenFolder(file.path);
                                    }}
                                    disabled={actionLoading}
                                    className="px-2 py-0.5 text-[11px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                                    title="Pindahkan seluruh isi folder ini langsung ke folder utama (/home/container)"
                                  >
                                    <ArrowUpCircle className="w-3.5 h-3.5 text-sky-400" />
                                    <span className="hidden sm:inline">Ke Root</span>
                                  </button>
                                </>
                              )}

                              {/* Dedicated Unarchive Button for ZIP files */}
                              {isZip && (
                                <button
                                  onClick={() => setUnarchiveModal({
                                    zipPath: file.path,
                                    fileName: file.name,
                                    destination: currentPath,
                                    deleteAfter: false,
                                    flattenRoot: true
                                  })}
                                  className="px-2.5 py-1 text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                  title="Unarchive / Ekstrak file ZIP ini"
                                >
                                  <PackageOpen className="w-3.5 h-3.5" />
                                  <span>Unarchive</span>
                                </button>
                              )}

                              {/* Download Button */}
                              {!file.isDirectory && (
                                <a
                                  href={`/api/servers/${serverId}/files/download?path=${encodeURIComponent(file.path)}`}
                                  download
                                  className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
                                  title="Download File"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}

                              {/* Delete Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFile(file.path);
                                }}
                                className="p-1 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded transition-colors"
                                title="Hapus File"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: PACKAGES & PLUGINS (NPM) */}
      {activeTab === 'packages' && server && (
        <ServerPackagesTab
          serverId={server.id}
          serverName={server.name}
          onOpenCodeEditor={(filePath) => {
            setActiveTab('files');
            apiRequest(`/api/servers/${server.id}/files/content?path=${encodeURIComponent(filePath)}`)
              .then(res => setEditingFile({ path: filePath, name: filePath, content: res.content }))
              .catch(() => {});
          }}
          onSwitchToConsole={() => setActiveTab('console')}
        />
      )}

      {/* TAB 3: STARTUP */}
      {activeTab === 'startup' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Konfigurasi Perintah Startup & Runtime</h2>
            <button
              onClick={handleSaveSettings}
              className="px-4 py-2 text-xs font-semibold bg-white text-black rounded-xl hover:bg-neutral-200"
            >
              Simpan Perubahan
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">Startup Command</label>
              <input
                type="text"
                value={startupCmd}
                onChange={(e) => setStartupCmd(e.target.value)}
                placeholder="Contoh: npm start atau node index.js"
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-white"
              />
              <span className="text-[11px] text-neutral-500 font-mono mt-1 block">
                Perintah yang dijalankan container saat startup container dipicu.
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">Entry Script File</label>
              <input
                type="text"
                value={entryFile}
                onChange={(e) => setEntryFile(e.target.value)}
                placeholder="index.js / main.py / app.js"
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-white"
              />
            </div>

            <div className="pt-4 border-t border-neutral-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRestart}
                      onChange={(e) => {
                        setAutoRestart(e.target.checked);
                        handleToggleAlwaysOn(e.target.checked);
                      }}
                      className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-0"
                    />
                    <span className="text-xs text-white font-semibold">Mode 24 Jam Non-Stop (Always-On & Smart Auto-Recovery)</span>
                  </label>
                  <p className="text-[11px] text-neutral-400 mt-1.5 ml-6 leading-relaxed">
                    Menjaga bot/aplikasi tetap menyala 24 jam penuh dengan jeda pemulihan otomatis bertahap (3s → 10s → 30s → 60s → 5 menit) jika terjadi disconnect atau crash sementara.
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-mono shrink-0 self-start sm:self-center border ${
                  autoRestart
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700'
                }`}>
                  {autoRestart ? '24/7 ON' : '24/7 OFF'}
                </span>
              </div>

              {/* Keep-Alive Ping URL for External Monitor (Anti-Sleep) */}
              <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3 font-mono text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>URL Keep-Alive Anti-Sleep (UptimeRobot / Cron-job.org)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestKeepAlivePing}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] transition-colors"
                    >
                      Test Ping
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyKeepAliveUrl}
                      className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-[11px] font-semibold flex items-center gap-1"
                    >
                      {copiedKeepAlive ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKeepAlive ? 'Tersalin' : 'Salin URL'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-black border border-neutral-800 text-emerald-300 select-all break-all text-[11px]">
                  {`${window.location.origin}/api/ping`}
                </div>

                {pingTestStatus && (
                  <div className="text-[11px] text-cyan-300">
                    Status Ping: {pingTestStatus}
                  </div>
                )}

                <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
                  Agar server tetap aktif 24 jam bahkan saat browser ditutup, daftarkan URL di atas ke layanan monitor gratis seperti <span className="text-white font-medium">UptimeRobot</span> atau <span className="text-white font-medium">Cron-job.org</span> dengan interval ping <span className="text-emerald-400 font-medium">setiap 5 menit</span> (HTTP GET).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: BACKUPS */}
      {activeTab === 'backups' && server && (
        <ServerBackupsTab
          serverId={server.id}
          serverName={server.name}
          backupSlots={server.backupSlots || 2}
        />
      )}

      {/* TAB 5: NETWORK & 9ROUTER */}
      {activeTab === 'network' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <h2 className="text-base font-bold text-white">Alokasi Jaringan & Custom Domain (9router)</h2>

          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-500">Node IP:</span>
                <span className="text-white font-bold">{server.ip}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Primary Port (TCP/HTTP):</span>
                <span className="text-emerald-400 font-bold">{server.primaryPort}</span>
              </div>
              {server.extraPorts.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Extra Ports:</span>
                  <span className="text-white">{server.extraPorts.join(', ')}</span>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-neutral-800">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-emerald-400" />
                <span>9router & Domain Mapping</span>
              </h3>
              <p className="text-xs text-neutral-400 mb-4">
                Petakan domain milik Anda (misal: bot.domainanda.com) ke port container ini dengan penerbitan sertifikat SSL otomatis.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="subdomain.domainanda.com"
                  className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-white"
                />
                <button
                  onClick={() => {
                    setSuccessMsg(`Domain ${customDomain} berhasil diarahkan ke port ${server.primaryPort}`);
                    setTimeout(() => setSuccessMsg(null), 3000);
                  }}
                  className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200"
                >
                  Hubungkan Domain
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: DATABASES */}
      {activeTab === 'databases' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Database Instance Terkelola</h2>
              <p className="text-xs text-neutral-400">
                Terpakai: <span className="font-mono text-white font-bold">{databases.length}</span> dari {server.databaseCount} database
              </p>
            </div>

            <button
              onClick={handleCreateDatabase}
              disabled={databases.length >= server.databaseCount}
              className="px-4 py-2 text-xs font-semibold bg-white text-black rounded-xl hover:bg-neutral-200 disabled:opacity-40"
            >
              Tambah Database
            </button>
          </div>

          <div className="space-y-3">
            {databases.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-500 text-xs font-mono">
                Belum ada database dibuat untuk server ini.
              </div>
            ) : (
              databases.map(dbInst => (
                <div key={dbInst.id} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs space-y-2">
                  <div className="flex justify-between items-center text-white font-bold">
                    <span>{dbInst.name}</span>
                    <span className="text-[11px] uppercase text-emerald-400">{dbInst.dbType}</span>
                  </div>
                  <div className="text-neutral-400">Host: {dbInst.host}:{dbInst.port}</div>
                  <div className="text-neutral-400">Username: {dbInst.username}</div>
                  <div className="text-neutral-400">Password: {dbInst.password}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 7: SCHEDULES */}
      {activeTab === 'schedules' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <h2 className="text-base font-bold text-white">Jadwal Tugas Otomatis (Cron)</h2>
          <div className="space-y-2">
            {schedules.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-500 text-xs font-mono">
                Belum ada cron scheduler dibuat.
              </div>
            ) : (
              schedules.map(sc => (
                <div key={sc.id} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex justify-between items-center text-xs font-mono">
                  <div>
                    <div className="font-bold text-white">{sc.name}</div>
                    <div className="text-neutral-500">Cron: {sc.cronExpr} · {sc.actionType}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] ${sc.isActive ? 'bg-emerald-950 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>
                    {sc.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 8: SUBUSERS */}
      {activeTab === 'subusers' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <h2 className="text-base font-bold text-white">Kolaborator & Izin Sub-User</h2>
          <div className="space-y-2">
            {subusers.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-500 text-xs font-mono">
                Belum ada subuser yang ditambahkan ke server ini.
              </div>
            ) : (
              subusers.map(sub => (
                <div key={sub.id} className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex justify-between items-center text-xs font-mono">
                  <div className="text-white">{sub.email}</div>
                  <div className="text-neutral-500">{sub.permissions.join(', ')}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 9: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <h2 className="text-base font-bold text-white">Pengaturan Umum Server</h2>

          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">Nama Server</label>
              <input
                type="text"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-white"
              />
            </div>

            <button
              onClick={handleSaveSettings}
              className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200"
            >
              Simpan Nama Server
            </button>
          </div>

          <div className="pt-6 border-t border-neutral-800">
            <h3 className="text-sm font-bold text-rose-400 mb-2">Zona Berbahaya: Reinstall Egg</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Menghapus file saat ini dan mengembalikan template kode bawaan egg.
            </p>
            <button
              onClick={handleReinstallServer}
              disabled={actionLoading}
              className="px-4 py-2 bg-rose-950/60 border border-rose-800 text-rose-300 hover:bg-rose-900 text-xs font-semibold rounded-xl"
            >
              Reinstall Server
            </button>
          </div>
        </div>
      )}

      {/* TAB 10: BILLING & RENEWAL */}
      {activeTab === 'billing' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <h2 className="text-base font-bold text-white">Masa Aktif & Perpanjangan QRIS</h2>

          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-neutral-500">Mulai Aktif:</span>
              <span className="text-white">{new Date(server.startsAt).toLocaleDateString('id-ID')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Kedaluwarsa Pada:</span>
              {(server.envVars?.IS_UNLIMITED === 'true' || !server.expiresAt || server.expiresAt.startsWith('2099') || server.expiresAt === 'unlimited' || new Date(server.expiresAt).getFullYear() > 2090) ? (
                <span className="text-emerald-400 font-extrabold px-2.5 py-0.5 bg-emerald-950/80 border border-emerald-800 rounded-full shadow-sm">
                  ✨ Selamanya / Unlimited (∞)
                </span>
              ) : (
                <span className="text-amber-300 font-bold">{new Date(server.expiresAt).toLocaleDateString('id-ID')}</span>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-800 space-y-4 max-w-md">
            <h3 className="text-sm font-semibold text-white">Perpanjang Masa Aktif Server</h3>
            <div className="grid grid-cols-4 gap-2">
              {[1, 3, 6, 12].map(m => (
                <button
                  key={m}
                  onClick={() => setRenewMonths(m)}
                  className={`py-2 px-3 text-xs font-mono rounded-xl border transition-all ${
                    renewMonths === m
                      ? 'border-white bg-white text-black font-bold'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  {m} Bulan
                </button>
              ))}
            </div>

            <button
              onClick={handleRenewServer}
              disabled={actionLoading}
              className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>Generate Tagihan QRIS Perpanjangan</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
