import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  ShoppingCart, 
  Server, 
  Users, 
  Globe2, 
  CreditCard, 
  Activity, 
  RefreshCw, 
  Check, 
  AlertCircle,
  Copy,
  ExternalLink,
  Shield,
  ShieldCheck,
  Play,
  Trash2,
  Lock,
  Pause,
  DollarSign,
  Ticket,
  Sparkles,
  Zap,
  Plus,
  Flame,
  CheckCircle2,
  Sliders,
  Database,
  Cpu,
  HardDrive,
  Clock,
  X,
  Mail,
  Send,
  Bell
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { db as firestoreDb, isUserAdmin, SUPER_ADMIN_EMAIL } from '../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { DEFAULT_EGGS } from '@/packages/shared/eggs';
import { DEFAULT_NODES } from '@/packages/shared/constants';

interface AdminPageProps {
  onBack: () => void;
  onSelectServer?: (serverId: string) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBack, onSelectServer }) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'pricing' | 'vouchers' | 'unlimited' | 'orders' | 'servers' | 'users' | 'payment' | 'router' | 'logs' | 'scheduler'
  >('overview');

  const [overview, setOverview] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [routerConfig, setRouterConfig] = useState<any>(null);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [schedulerStats, setSchedulerStats] = useState<any>(null);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedKeepAlive, setCopiedKeepAlive] = useState(false);
  const [testingKeepAlive, setTestingKeepAlive] = useState(false);
  const [keepAliveTestResult, setKeepAliveTestResult] = useState<string | null>(null);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSeverity, setBroadcastSeverity] = useState('info');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // Pricing Rules State
  const [pricingRules, setPricingRules] = useState<any>({
    baseMonthlyFee: 5000,
    pricePerGbRam: 15000,
    pricePerCpuCore: 10000,
    pricePerGbDisk: 1000,
    pricePerBackupSlot: 2000,
    pricePerExtraPort: 3000,
    pricePerDatabase: 5000,
    discountMonths3: 0.05,
    discountMonths6: 0.10,
    discountMonths12: 0.20,
    minAmount: 1000,
    maxAmount: 5000000
  });

  // Vouchers State
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [newVoucherCode, setNewVoucherCode] = useState('');
  const [newVoucherType, setNewVoucherType] = useState<'percent' | 'fixed'>('percent');
  const [newVoucherVal, setNewVoucherVal] = useState('20');
  const [newVoucherMaxDiscount, setNewVoucherMaxDiscount] = useState('50000');
  const [newVoucherMaxUsage, setNewVoucherMaxUsage] = useState('100');
  const [isCreatingVoucher, setIsCreatingVoucher] = useState(false);

  // Unlimited Panel Generator State
  const [unlServerName, setUnlServerName] = useState('Unlimited Cloud Master');
  const [unlTargetEmail, setUnlTargetEmail] = useState(SUPER_ADMIN_EMAIL);
  const [unlEggId, setUnlEggId] = useState('nodejs');
  const [unlNodeId, setUnlNodeId] = useState('node-jkt-01');
  const [unlExpiryOption, setUnlExpiryOption] = useState<'unlimited' | '24h' | '3d' | '7d' | '30d' | '1y' | 'custom'>('unlimited');
  const [unlCustomHours, setUnlCustomHours] = useState('24');
  const [isDeployingUnlimited, setIsDeployingUnlimited] = useState(false);
  const [deployedUnlimitedServer, setDeployedUnlimitedServer] = useState<any>(null);

  // Server Expiry Adjustment Modal State
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [selectedServerForExpiry, setSelectedServerForExpiry] = useState<any>(null);
  const [modalExpiryOption, setModalExpiryOption] = useState<'unlimited' | '24h' | '3d' | '7d' | '30d' | '1y' | 'custom'>('unlimited');
  const [modalCustomHours, setModalCustomHours] = useState('24');
  const [isUpdatingExpiry, setIsUpdatingExpiry] = useState(false);

  // Editable Payment Form
  const [accountId, setAccountId] = useState('');
  const [secretToken, setSecretToken] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [paymentMode, setPaymentMode] = useState('mock');
  const [feeBy, setFeeBy] = useState('buyer');
  const [qrisMethod, setQrisMethod] = useState('qris_one');

  // Router Form
  const [routerEndpoint, setRouterEndpoint] = useState('https://api.9router.com');
  const [routerApiKey, setRouterApiKey] = useState('');

  const loadData = async () => {
    try {
      const safeGet = (endpoint: string) => apiRequest(endpoint).catch(() => ({ success: false }));

      // Batch 1: Primary Overview & Entities
      const [ovRes, ordRes, srvRes, usrRes] = await Promise.all([
        safeGet('/api/admin/overview'),
        safeGet('/api/admin/orders'),
        safeGet('/api/admin/servers'),
        safeGet('/api/admin/users')
      ]);

      // Small delay between batches to respect Cloud Run QPS rate limit
      await new Promise(r => setTimeout(r, 60));

      // Batch 2: Configuration & Rules
      const [payRes, rtrRes, prcRes] = await Promise.all([
        safeGet('/api/admin/payment-settings'),
        safeGet('/api/admin/router-settings'),
        safeGet('/api/pricing/rules')
      ]);

      await new Promise(r => setTimeout(r, 60));

      // Batch 3: Logs, Vouchers & Scheduler
      const [logRes, vchRes, schRes] = await Promise.all([
        safeGet('/api/admin/activity-logs'),
        safeGet('/api/admin/vouchers'),
        safeGet('/api/admin/scheduler/status')
      ]);

      if (ovRes.success) setOverview(ovRes.stats);
      if (ordRes.success) setOrders(ordRes.orders);
      if (srvRes.success) setServers(srvRes.servers);
      if (usrRes.success) setUsers(usrRes.users);
      if (prcRes.success && prcRes.rules) setPricingRules(prcRes.rules);
      if (vchRes.success && vchRes.vouchers) setVouchers(vchRes.vouchers);
      if (schRes.success) setSchedulerStats(schRes.stats);

      if (payRes.success) {
        setPaymentConfig(payRes.config);
        setAccountId(payRes.config.accountId || '');
        setSecretToken(payRes.config.secretTokenMasked || '');
        setSigningSecret(payRes.config.signingSecretMasked || '');
        setPaymentMode(payRes.config.mode || 'mock');
        setFeeBy(payRes.config.feeBy || 'buyer');
        setQrisMethod(payRes.config.defaultMethod || 'qris_one');
      }
      if (rtrRes.success) {
        setRouterConfig(rtrRes.config);
        setRouterEndpoint(rtrRes.config.endpoint || 'https://api.9router.com');
        setRouterApiKey(rtrRes.config.apiKey || '');
      }
      if (logRes.success) setActivityLogs(logRes.logs);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTriggerManualCleanup = async () => {
    setIsRunningCleanup(true);
    try {
      const res = await apiRequest('/api/admin/scheduler/trigger', { method: 'POST' });
      if (res.success && res.result) {
        const { cleanedContainers, reclaimedPorts, terminatedZombies, freedBytes } = res.result;
        const freedMb = (freedBytes / (1024 * 1024)).toFixed(2);
        setStatusMsg({
          type: 'success',
          text: `Cleanup Selesai: ${cleanedContainers} server kedaluwarsa dibersihkan, ${reclaimedPorts} port dipulihkan, ${terminatedZombies} zombie dihentikan, ${freedMb} MB disk dibebaskan.`
        });
        loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal menjalankan cleanup' });
    } finally {
      setIsRunningCleanup(false);
    }
  };

  // Save Pricing Rules (syncs to Backend & Firestore)
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/admin/pricing', {
        method: 'POST',
        body: JSON.stringify(pricingRules)
      });

      if (res.success) {
        // Also persist to Firestore /pricing/global
        try {
          await setDoc(doc(firestoreDb, 'pricing', 'global'), {
            ...pricingRules,
            updatedAt: new Date().toISOString(),
            updatedBy: SUPER_ADMIN_EMAIL
          }, { merge: true });
        } catch (fErr) {
          console.warn('[Firestore] Pricing sync notice:', fErr);
        }

        setStatusMsg({ type: 'success', text: 'Aturan harga hosting berhasil diperbarui & disinkronkan ke sistem.' });
        setTimeout(() => setStatusMsg(null), 4000);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal menyimpan harga' });
    }
  };

  // Create Voucher (syncs to Backend & Firestore)
  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoucherCode.trim()) {
      setStatusMsg({ type: 'error', text: 'Kode voucher wajib diisi' });
      return;
    }

    setIsCreatingVoucher(true);
    try {
      const payload = {
        code: newVoucherCode.trim().toUpperCase(),
        discountPercent: newVoucherType === 'percent' ? parseInt(newVoucherVal) : null,
        discountFixed: newVoucherType === 'fixed' ? parseInt(newVoucherVal) : null,
        maxDiscount: newVoucherMaxDiscount ? parseInt(newVoucherMaxDiscount) : null,
        maxUsage: newVoucherMaxUsage ? parseInt(newVoucherMaxUsage) : 100
      };

      const res = await apiRequest('/api/admin/vouchers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success) {
        // Sync to Firestore /vouchers/{code}
        try {
          await setDoc(doc(firestoreDb, 'vouchers', payload.code), {
            ...payload,
            usedCount: 0,
            isActive: true,
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (fErr) {
          console.warn('[Firestore] Voucher sync notice:', fErr);
        }

        setStatusMsg({ type: 'success', text: `Voucher ${payload.code} berhasil dibuat!` });
        setNewVoucherCode('');
        loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal membuat voucher' });
    } finally {
      setIsCreatingVoucher(false);
    }
  };

  // Delete Voucher
  const handleDeleteVoucher = async (code: string) => {
    if (!confirm(`Hapus voucher ${code}?`)) return;
    try {
      const res = await apiRequest(`/api/admin/vouchers/${code}`, { method: 'DELETE' });
      if (res.success) {
        try {
          await deleteDoc(doc(firestoreDb, 'vouchers', code));
        } catch (e) {
          console.warn(e);
        }
        setStatusMsg({ type: 'success', text: `Voucher ${code} berhasil dihapus` });
        loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  // Deploy Unlimited GB Server
  const handleDeployUnlimitedServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlServerName || !unlTargetEmail) {
      setStatusMsg({ type: 'error', text: 'Nama server dan target email wajib diisi' });
      return;
    }

    setIsDeployingUnlimited(true);
    try {
      const res = await apiRequest('/api/admin/servers/create-unlimited', {
        method: 'POST',
        body: JSON.stringify({
          name: unlServerName,
          ownerEmail: unlTargetEmail.trim().toLowerCase(),
          eggId: unlEggId,
          nodeId: unlNodeId,
          expiryOption: unlExpiryOption,
          customHours: unlCustomHours
        })
      });

      if (res.success && res.server) {
        setDeployedUnlimitedServer(res.server);

        // Record in Firestore /servers/{serverId}
        try {
          await setDoc(doc(firestoreDb, 'servers', res.server.id), {
            serverId: res.server.id,
            name: res.server.name,
            eggId: res.server.eggId,
            nodeId: res.server.nodeId,
            ramMb: res.server.ramMb,
            diskGb: res.server.diskGb,
            isUnlimited: true,
            ownerEmail: res.server.userEmail,
            status: res.server.status,
            expiresAt: res.server.expiresAt,
            createdAt: new Date().toISOString()
          }, { merge: true });
        } catch (fErr) {
          console.warn('[Firestore] Server record notice:', fErr);
        }

        setStatusMsg({ type: 'success', text: `Panel Unlimited "${res.server.name}" berhasil dibuat & langsung online (Masa Aktif: ${unlExpiryOption.toUpperCase()})!` });
        loadData();
      } else {
        throw new Error(res.error || 'Gagal mem-provisioning panel unlimited');
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal membuat panel unlimited' });
    } finally {
      setIsDeployingUnlimited(false);
    }
  };

  // Update Server Masa Aktif / Expiry Date
  const handleSaveServerExpiry = async () => {
    if (!selectedServerForExpiry) return;
    setIsUpdatingExpiry(true);
    try {
      const res = await apiRequest(`/api/admin/servers/${selectedServerForExpiry.id}/expiry`, {
        method: 'POST',
        body: JSON.stringify({
          expiryOption: modalExpiryOption,
          customHours: modalCustomHours
        })
      });

      if (res.success) {
        setStatusMsg({ type: 'success', text: `Masa aktif server ${selectedServerForExpiry.name} berhasil diperbarui!` });
        setShowExpiryModal(false);
        setSelectedServerForExpiry(null);
        await loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal memperbarui masa aktif server' });
    } finally {
      setIsUpdatingExpiry(false);
    }
  };

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/admin/payment-settings', {
        method: 'POST',
        body: JSON.stringify({
          accountId,
          secretToken,
          signingSecret,
          mode: paymentMode,
          feeBy,
          defaultMethod: qrisMethod
        })
      });
      if (res.success) {
        setStatusMsg({ type: 'success', text: 'Pengaturan BuatQris berhasil disimpan' });
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleTestBuatQrisConnection = async () => {
    try {
      const res = await apiRequest('/api/admin/payment-settings/test-connection', { method: 'POST' });
      if (res.success) {
        setStatusMsg({ type: 'success', text: 'Koneksi BuatQris sukses! Transaksi test sandbox berhasil dibuat.' });
      } else {
        setStatusMsg({ type: 'error', text: res.message || 'Koneksi gagal' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleManualApproveOrder = async (orderCode: string) => {
    try {
      const res = await apiRequest(`/api/admin/orders/${orderCode}/manual-approve`, { method: 'POST' });
      if (res.success) {
        setStatusMsg({ type: 'success', text: `Order ${orderCode} berhasil disetujui & server otomatis diprovisioning` });
        loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleSuspendServer = async (id: string) => {
    try {
      const res = await apiRequest(`/api/admin/servers/${id}/suspend`, { method: 'POST' });
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.suspended ? 'Server di-suspend' : 'Server di-unsuspend' });
        loadData();
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleCopyWebhookUrl = () => {
    const url = paymentConfig?.webhookUrl || `${window.location.origin}/api/webhooks/buatqris`;
    navigator.clipboard.writeText(url);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleCopyKeepAliveUrl = () => {
    const url = `${window.location.origin}/api/ping`;
    navigator.clipboard.writeText(url);
    setCopiedKeepAlive(true);
    setTimeout(() => setCopiedKeepAlive(false), 2000);
  };

  const handleTestKeepAlive = async () => {
    setTestingKeepAlive(true);
    setKeepAliveTestResult(null);
    try {
      const res = await fetch('/api/ping?source=admin_panel_test', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) {
        setKeepAliveTestResult(`200 OK • Uptime ${Math.floor((data.uptimeSeconds || 0) / 60)}m • ${data.activeServers} server berjalan • Total ping ${data.totalPings}x`);
        loadData();
      } else {
        setKeepAliveTestResult('Endpoint ping tidak merespons normal');
      }
    } catch {
      setKeepAliveTestResult('Gagal menghubungi /api/ping');
    } finally {
      setTestingKeepAlive(false);
    }
  };

  const handleSendTestEmail = async () => {
    setTestEmailLoading(true);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/api/admin/notifications/test-email', {
        method: 'POST',
        body: JSON.stringify({ recipientEmail: testEmailRecipient.trim() || undefined })
      });
      setStatusMsg({ type: res.success ? 'success' : 'error', text: res.message });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal mengirim email test' });
    } finally {
      setTestEmailLoading(false);
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    setIsBroadcasting(true);
    try {
      const res = await apiRequest<{ success: boolean; count: number }>('/api/admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          severity: broadcastSeverity,
          sendEmail: true
        })
      });
      setStatusMsg({ type: 'success', text: `Notifikasi disiarkan ke ${res.count} pengguna!` });
      setBroadcastTitle('');
      setBroadcastMessage('');
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal menyiarkan notifikasi' });
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 mb-1">
            <button onClick={onBack} className="hover:text-white transition-colors">Panel Utama</button>
            <span>/</span>
            <span className="text-white">Administration Console</span>
            <span>/</span>
            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{SUPER_ADMIN_EMAIL}</span>
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <span>Admin Management Panel</span>
            <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              Super Admin Active
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('unlimited')}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-950 flex items-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
            <span>+ Buat Panel Unlimited GB</span>
          </button>
          <button
            onClick={loadData}
            className="p-2 text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-xl transition-colors"
            title="Muat Ulang Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3.5 mb-6 rounded-xl border text-xs flex items-center justify-between ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' 
            : 'bg-rose-950/40 border-rose-800 text-rose-300'
        }`}>
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-xs font-bold underline">Tutup</button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex items-center gap-1 p-1 bg-neutral-900/60 border border-neutral-800 rounded-xl mb-6 overflow-x-auto text-xs font-medium">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'pricing', label: 'Atur Harga', icon: DollarSign, badge: 'Setting' },
          { id: 'vouchers', label: 'Bikin Voucher', icon: Ticket, badge: `${vouchers.length}` },
          { id: 'unlimited', label: 'Buat Panel Unlimited', icon: Sparkles, highlight: true },
          { id: 'orders', label: 'Orders & Transaksi', icon: ShoppingCart },
          { id: 'servers', label: 'Semua Server', icon: Server },
          { id: 'users', label: 'Pengguna', icon: Users },
          { id: 'payment', label: 'Payment (BuatQris)', icon: CreditCard },
          { id: 'router', label: '9router Edge', icon: Globe2 },
          { id: 'logs', label: 'Activity Logs', icon: Activity },
          { id: 'scheduler', label: '24/7 Scheduler & Cleanup', icon: Clock, badge: '24/7' }
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : t.highlight 
                    ? 'text-emerald-400 hover:text-emerald-300 hover:bg-neutral-800/80 bg-emerald-950/30' 
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              {t.badge && (
                <span className={`px-1.5 py-0.2 text-[10px] rounded font-mono ${
                  activeTab === t.id ? 'bg-neutral-200 text-black' : 'bg-neutral-800 text-neutral-300'
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 1. OVERVIEW TAB */}
      {/* ============================================================== */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          {/* Admin & Firebase Status Banner */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Super Admin: {SUPER_ADMIN_EMAIL}</span>
                </div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">
                  Firestore Project: <span className="text-neutral-300">ilzz-host-7d7f4</span> (asia-southeast1) • Database ID: <span className="text-neutral-300">ai-studio-aetherpanelcloud-4a713311-54ff-42e3-a42f-a56814443528</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-[11px] font-mono rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                ● Firebase Online
              </span>
              <span className="px-2.5 py-1 text-[11px] font-mono rounded-lg bg-blue-950 text-blue-300 border border-blue-800/80">
                ● BuatQris Ready
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Total Pendapatan</div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                Rp {overview.totalRevenue.toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-emerald-400 mt-1 font-mono">Lunas via BuatQris QRIS</div>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Total Pesanan</div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {overview.totalOrders}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 font-mono">{overview.paidOrders} sukses bayar</div>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Server Terpasang</div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {overview.activeServers}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 font-mono">{overview.runningServers} aktif berjalan</div>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Pengguna Terdaftar</div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {overview.totalUsers}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 font-mono">User & Admin</div>
            </div>
          </div>

          {/* Quick Action Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setActiveTab('pricing')}
              className="p-5 rounded-2xl bg-neutral-900/30 border border-neutral-800 hover:border-neutral-600 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-neutral-800 text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Atur Harga Hosting</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Ubah tarif RAM/GB, CPU core, disk, dan diskon durasi secara instan.
              </p>
            </button>

            <button
              onClick={() => setActiveTab('vouchers')}
              className="p-5 rounded-2xl bg-neutral-900/30 border border-neutral-800 hover:border-neutral-600 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-neutral-800 text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Ticket className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Bikin Voucher Baru</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Buat kode promo persen atau potongan tetap dengan batas pemakaian.
              </p>
            </button>

            <button
              onClick={() => setActiveTab('unlimited')}
              className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-900/50 hover:border-emerald-600 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-900/50 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">Buat Panel Unlimited GB</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Deploy server khusus dengan RAM & Storage tanpa batas untuk akun apa saja.
              </p>
            </button>
          </div>

          {/* Sistem Notifikasi Otomatis & Pengujian SMTP */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Test Nodemailer SMTP */}
            <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Uji Coba Pengiriman Email (Nodemailer)</h3>
                  <p className="text-xs text-neutral-400">Tes koneksi server SMTP dan format HTML template email.</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-mono text-neutral-400 mb-1">Email Penerima (Default: Super Admin)</label>
                  <input
                    type="email"
                    value={testEmailRecipient}
                    onChange={(e) => setTestEmailRecipient(e.target.value)}
                    placeholder={SUPER_ADMIN_EMAIL}
                    className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={testEmailLoading}
                  className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{testEmailLoading ? 'Mengirim Email...' : 'Kirim Email Uji Coba'}</span>
                </button>
                <div className="text-[11px] text-neutral-500 font-mono">
                  Menguji template notifikasi: server status, pembayaran, pengingat perpanjangan & keamanan.
                </div>
              </div>
            </div>

            {/* Broadcast Notifikasi Realtime */}
            <form onSubmit={handleBroadcastNotification} className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Siarkan Pengumuman (WebSocket & Email)</h3>
                  <p className="text-xs text-neutral-400">Kirim notifikasi langsung ke semua pengguna secara instan.</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <input
                    type="text"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                    placeholder="Judul Pengumuman (contoh: Maintenance Node Jakarta)"
                    className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Isi pesan pengumuman untuk seluruh pengguna..."
                    rows={2}
                    className="w-full px-3.5 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <select
                    value={broadcastSeverity}
                    onChange={(e) => setBroadcastSeverity(e.target.value)}
                    className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="info">Info (Biru)</option>
                    <option value="warning">Peringatan (Kuning)</option>
                    <option value="danger">Penting / Kritis (Merah)</option>
                  </select>

                  <button
                    type="submit"
                    disabled={isBroadcasting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isBroadcasting ? 'Menyiarkan...' : 'Siarkan Pengumuman'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. ATUR HARGA (PRICING RULES) TAB */}
      {/* ============================================================== */}
      {activeTab === 'pricing' && (
        <form onSubmit={handleSavePricing} className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Atur Harga Komponen Hosting & Batasan</span>
              </h2>
              <p className="text-xs text-neutral-400">
                Nilai harga di bawah ini langsung berlaku di Konfigurator & Checkout (tersinkron ke backend & Firebase Firestore).
              </p>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200 transition-colors shrink-0 shadow-lg"
            >
              Simpan & Terapkan Harga
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
            {/* Base & Resource Prices */}
            <div className="space-y-4">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-neutral-300">Biaya Komponen Utama</h3>
              
              <div>
                <label className="block text-neutral-400 mb-1">Biaya Dasar Bulanan (Base Monthly Fee) - Rp</label>
                <input
                  type="number"
                  required
                  value={pricingRules.baseMonthlyFee}
                  onChange={(e) => setPricingRules({ ...pricingRules, baseMonthlyFee: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Harga per GB RAM per Bulan - Rp</label>
                <input
                  type="number"
                  required
                  value={pricingRules.pricePerGbRam}
                  onChange={(e) => setPricingRules({ ...pricingRules, pricePerGbRam: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Harga per CPU Core (100%) - Rp</label>
                <input
                  type="number"
                  required
                  value={pricingRules.pricePerCpuCore}
                  onChange={(e) => setPricingRules({ ...pricingRules, pricePerCpuCore: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Harga per GB NVMe Disk - Rp</label>
                <input
                  type="number"
                  required
                  value={pricingRules.pricePerGbDisk}
                  onChange={(e) => setPricingRules({ ...pricingRules, pricePerGbDisk: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>
            </div>

            {/* Add-ons & Limits */}
            <div className="space-y-4">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-neutral-300">Biaya Fitur Tambahan & Limit</h3>
              
              <div>
                <label className="block text-neutral-400 mb-1">Harga Slot Backup per Bulan - Rp</label>
                <input
                  type="number"
                  required
                  value={pricingRules.pricePerBackupSlot}
                  onChange={(e) => setPricingRules({ ...pricingRules, pricePerBackupSlot: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Harga Port Tambahan per Bulan - Rp</label>
                <input
                  type="number"
                  required
                  value={pricingRules.pricePerExtraPort}
                  onChange={(e) => setPricingRules({ ...pricingRules, pricePerExtraPort: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Harga Database Tambahan per Bulan - Rp</label>
                <input
                  type="number"
                  required
                  value={pricingRules.pricePerDatabase}
                  onChange={(e) => setPricingRules({ ...pricingRules, pricePerDatabase: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">Minimal Order (Rp)</label>
                  <input
                    type="number"
                    value={pricingRules.minAmount}
                    onChange={(e) => setPricingRules({ ...pricingRules, minAmount: parseInt(e.target.value) || 1000 })}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                  />
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Maksimal Order (Rp)</label>
                  <input
                    type="number"
                    value={pricingRules.maxAmount}
                    onChange={(e) => setPricingRules({ ...pricingRules, maxAmount: parseInt(e.target.value) || 5000000 })}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Duration Multipliers */}
          <div className="pt-4 border-t border-neutral-800">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider text-neutral-300 mb-3 font-mono">
              Diskon Berlangganan Durasi
            </h3>
            <div className="grid grid-cols-3 gap-4 font-mono text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">Diskon 3 Bulan (%)</label>
                <input
                  type="number"
                  step="1"
                  value={Math.round((pricingRules.discountMonths3 || 0.05) * 100)}
                  onChange={(e) => setPricingRules({ ...pricingRules, discountMonths3: (parseFloat(e.target.value) || 0) / 100 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Diskon 6 Bulan (%)</label>
                <input
                  type="number"
                  step="1"
                  value={Math.round((pricingRules.discountMonths6 || 0.10) * 100)}
                  onChange={(e) => setPricingRules({ ...pricingRules, discountMonths6: (parseFloat(e.target.value) || 0) / 100 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Diskon 12 Bulan (%)</label>
                <input
                  type="number"
                  step="1"
                  value={Math.round((pricingRules.discountMonths12 || 0.20) * 100)}
                  onChange={(e) => setPricingRules({ ...pricingRules, discountMonths12: (parseFloat(e.target.value) || 0) / 100 })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200 transition-colors shadow-lg"
            >
              Simpan & Terapkan Harga Sekarang
            </button>
          </div>
        </form>
      )}

      {/* ============================================================== */}
      {/* 3. BIKIN VOUCHER (COUPON MANAGEMENT) TAB */}
      {/* ============================================================== */}
      {activeTab === 'vouchers' && (
        <div className="space-y-6 max-w-5xl">
          {/* Create Voucher Form */}
          <form onSubmit={handleCreateVoucher} className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-neutral-800">
              <Ticket className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-bold text-white">Buat Voucher / Kode Promo Baru</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 font-mono text-xs">
              <div className="lg:col-span-1">
                <label className="block text-neutral-400 mb-1">Kode Voucher</label>
                <input
                  type="text"
                  required
                  placeholder="MISAL: DISKON50"
                  value={newVoucherCode}
                  onChange={(e) => setNewVoucherCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-bold tracking-wider focus:outline-none focus:border-white uppercase"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Tipe Potongan</label>
                <select
                  value={newVoucherType}
                  onChange={(e: any) => setNewVoucherType(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                >
                  <option value="percent">Persentase (%)</option>
                  <option value="fixed">Nominal Tetap (Rp)</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">
                  {newVoucherType === 'percent' ? 'Besar Diskon (%)' : 'Besar Diskon (Rp)'}
                </label>
                <input
                  type="number"
                  required
                  value={newVoucherVal}
                  onChange={(e) => setNewVoucherVal(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Maks. Potongan (Rp)</label>
                <input
                  type="number"
                  placeholder="Kosongkan jika bebas"
                  value={newVoucherMaxDiscount}
                  onChange={(e) => setNewVoucherMaxDiscount(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Batas Penggunaan</label>
                <input
                  type="number"
                  value={newVoucherMaxUsage}
                  onChange={(e) => setNewVoucherMaxUsage(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isCreatingVoucher}
                className="px-5 py-2.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200 transition-colors flex items-center gap-1.5 shadow-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreatingVoucher ? 'Membuat...' : 'Buat Voucher Sekarang'}</span>
              </button>
            </div>
          </form>

          {/* Active Vouchers List */}
          <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
              <span>Daftar Voucher Aktif ({vouchers.length})</span>
              <span className="text-xs text-neutral-400 font-mono">Tersedia untuk pembeli di halaman konfigurator</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500 text-[11px]">
                    <th className="py-2.5 px-3">Kode Voucher</th>
                    <th className="py-2.5 px-3">Bentuk Potongan</th>
                    <th className="py-2.5 px-3">Maksimal Diskon</th>
                    <th className="py-2.5 px-3">Penggunaan</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {vouchers.map(v => (
                    <tr key={v.code} className="hover:bg-neutral-800/20">
                      <td className="py-2.5 px-3">
                        <span className="px-2.5 py-1 bg-neutral-800 text-white font-bold rounded-lg border border-neutral-700 tracking-wider">
                          {v.code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400 font-semibold">
                        {v.discountPercent ? `Diskon ${v.discountPercent}%` : `Potongan Rp ${v.discountFixed?.toLocaleString('id-ID')}`}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-300">
                        {v.maxDiscount ? `Rp ${v.maxDiscount.toLocaleString('id-ID')}` : 'Tanpa batas'}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-400">
                        {v.usedCount || 0} / {v.maxUsage || '∞'} kali
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 font-bold">
                          AKTIF
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(v.code);
                            setStatusMsg({ type: 'success', text: `Kode voucher ${v.code} disalin` });
                            setTimeout(() => setStatusMsg(null), 2000);
                          }}
                          className="px-2 py-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded"
                          title="Salin Kode"
                        >
                          Salin
                        </button>
                        <button
                          onClick={() => handleDeleteVoucher(v.code)}
                          className="px-2 py-1 text-[11px] bg-rose-950 hover:bg-rose-900 text-rose-300 rounded font-semibold"
                          title="Hapus"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                  {vouchers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-neutral-500 font-sans text-xs">
                        Belum ada voucher yang dibuat. Silakan tambahkan voucher baru di atas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. BUAT PANEL UNLIMITED GB (SPECIAL ADMIN PROVISIONER) */}
      {/* ============================================================== */}
      {activeTab === 'unlimited' && (
        <div className="space-y-6 max-w-4xl">
          <form onSubmit={handleDeployUnlimitedServer} className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-neutral-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Buat Panel Hosting Unlimited GB</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-bold">
                    Khusus Admin
                  </span>
                </h2>
                <p className="text-xs text-neutral-400">
                  Provisioning container server dengan RAM & NVMe Disk tak terbatas, bypass pembayaran, dan langsung online.
                </p>
              </div>
            </div>

            {/* Spec Highlights Bento */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-xs font-mono">
              <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <div className="text-neutral-500 text-[10px] uppercase">Alokasi RAM</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">64 GB (∞)</div>
                <div className="text-[10px] text-neutral-400">65,536 MB Dedikasi</div>
              </div>
              <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <div className="text-neutral-500 text-[10px] uppercase">Penyimpanan Disk</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">2,000 GB NVMe</div>
                <div className="text-[10px] text-neutral-400">Unlimited GB</div>
              </div>
              <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <div className="text-neutral-500 text-[10px] uppercase">CPU Core</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">800% (8 Cores)</div>
                <div className="text-[10px] text-neutral-400">Dedicated Threading</div>
              </div>
              <div className="p-3 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <div className="text-neutral-500 text-[10px] uppercase">Masa Aktif</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">5 Tahun VIP</div>
                <div className="text-[10px] text-neutral-400">Auto Renewal Free</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
              <div>
                <label className="block text-neutral-300 mb-1 font-semibold">Nama Panel / Server</label>
                <input
                  type="text"
                  required
                  value={unlServerName}
                  onChange={(e) => setUnlServerName(e.target.value)}
                  placeholder="Misal: Enterprise Bot Unlimited"
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-semibold">Target Email Pemilik (Owner)</label>
                <input
                  type="email"
                  required
                  value={unlTargetEmail}
                  onChange={(e) => setUnlTargetEmail(e.target.value)}
                  placeholder="rizramadhan975@gmail.com"
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white transition-colors"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Bisa diberikan ke akun admin sendiri ({SUPER_ADMIN_EMAIL}) atau email klien mana pun.
                </span>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-semibold">Pilih Template Egg (Runtime)</label>
                <select
                  value={unlEggId}
                  onChange={(e) => setUnlEggId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                >
                  {DEFAULT_EGGS.map(egg => (
                    <option key={egg.id} value={egg.id}>
                      {egg.name} ({egg.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-semibold">Pilih Lokasi Node / Datacenter</label>
                <select
                  value={unlNodeId}
                  onChange={(e) => setUnlNodeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                >
                  {DEFAULT_NODES.map(node => (
                    <option key={node.id} value={node.id}>
                      {node.flag} {node.name} ({node.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-300 mb-1 font-semibold">Masa Aktif Panel (Durasi Server)</label>
                <select
                  value={unlExpiryOption}
                  onChange={(e: any) => setUnlExpiryOption(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 border border-emerald-800/80 text-emerald-400 font-semibold rounded-xl focus:outline-none"
                >
                  <option value="unlimited">✨ Unlimited / Selamanya (Tanpa Kadaluarsa)</option>
                  <option value="24h">⏱️ 24 Jam (1 Hari Trial / Promo)</option>
                  <option value="3d">📅 3 Hari (Short Term)</option>
                  <option value="7d">📅 7 Hari (1 Minggu)</option>
                  <option value="30d">📅 30 Hari (1 Bulan Standard)</option>
                  <option value="1y">📅 1 Tahun (365 Hari VIP)</option>
                  <option value="custom">⚙️ Custom Jam</option>
                </select>
                {unlExpiryOption === 'custom' && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={unlCustomHours}
                      onChange={(e) => setUnlCustomHours(e.target.value)}
                      placeholder="Masukkan total jam..."
                      className="flex-1 px-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-white font-mono text-xs focus:outline-none"
                    />
                    <span className="text-xs text-neutral-400 font-mono">Jam</span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-mono">
                Container akan langsung dibuat, di-inject runtime template, dan status menjadi ONLINE.
              </span>

              <button
                type="submit"
                disabled={isDeployingUnlimited}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950 transition-all flex items-center gap-2"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>{isDeployingUnlimited ? 'Mendeploy Container...' : '🚀 Buat & Jalankan Panel Unlimited Sekarang'}</span>
              </button>
            </div>
          </form>

          {/* Deployed Result Modal / Card */}
          {deployedUnlimitedServer && (
            <div className="p-6 rounded-2xl bg-neutral-900/90 border border-emerald-500/50 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-white">Panel Unlimited Berhasil Dibuat & Siap Digunakan!</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs">
                <div>
                  <div className="text-neutral-500 text-[10px]">Nama Server:</div>
                  <div className="text-white font-bold">{deployedUnlimitedServer.name}</div>
                </div>
                <div>
                  <div className="text-neutral-500 text-[10px]">Server ID:</div>
                  <div className="text-neutral-300">{deployedUnlimitedServer.id}</div>
                </div>
                <div>
                  <div className="text-neutral-500 text-[10px]">Alamat Host & Port:</div>
                  <div className="text-emerald-300 font-bold">{deployedUnlimitedServer.ip}:{deployedUnlimitedServer.primaryPort}</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-neutral-400 font-mono">
                  Owner: <span className="text-white">{deployedUnlimitedServer.userEmail}</span>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (onSelectServer) onSelectServer(deployedUnlimitedServer.id);
                    }}
                    className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200 transition-colors flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Buka Konsol & File Manager</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. ORDERS TAB */}
      {/* ============================================================== */}
      {activeTab === 'orders' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <h2 className="text-base font-bold text-white mb-4">Semua Pesanan & Riwayat Transaksi BuatQris</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-[11px]">
                  <th className="py-2.5 px-3">Kode Order</th>
                  <th className="py-2.5 px-3">Pembeli</th>
                  <th className="py-2.5 px-3">Total</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {orders.map(ord => (
                  <tr key={ord.id} className="hover:bg-neutral-800/20">
                    <td className="py-2.5 px-3 text-white font-bold">{ord.orderCode}</td>
                    <td className="py-2.5 px-3">
                      <div className="text-white">{ord.customerName}</div>
                      <div className="text-neutral-500 text-[10px]">{ord.customerEmail}</div>
                    </td>
                    <td className="py-2.5 px-3 text-white font-semibold tabular-nums">
                      Rp {ord.totalAmount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ord.status === 'ACTIVE' || ord.status === 'PAID' 
                          ? 'bg-emerald-950 text-emerald-300' 
                          : ord.status === 'PENDING' 
                            ? 'bg-amber-950 text-amber-300' 
                            : 'bg-neutral-800 text-neutral-400'
                      }`}>
                        {ord.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400">
                      {new Date(ord.createdAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {ord.status === 'PENDING' && (
                        <button
                          onClick={() => handleManualApproveOrder(ord.orderCode)}
                          className="px-2.5 py-1 text-[11px] bg-white text-black font-semibold rounded hover:bg-neutral-200"
                        >
                          Manual Approve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-neutral-500 font-sans text-xs">
                      Belum ada pesanan yang masuk.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. SERVERS TAB */}
      {/* ============================================================== */}
      {activeTab === 'servers' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">Seluruh Server Aktif ({servers.length})</h2>
            <button
              onClick={() => setActiveTab('unlimited')}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Server Unlimited</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-[11px]">
                  <th className="py-2.5 px-3">Nama Server</th>
                  <th className="py-2.5 px-3">Owner</th>
                  <th className="py-2.5 px-3">Spesifikasi</th>
                  <th className="py-2.5 px-3">Port</th>
                  <th className="py-2.5 px-3">Masa Aktif</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {servers.map(s => {
                  const isUnlimited = s.envVars?.IS_UNLIMITED === 'true' || 
                                      !s.expiresAt || 
                                      s.expiresAt.startsWith('2099') || 
                                      s.expiresAt === 'unlimited' ||
                                      new Date(s.expiresAt).getFullYear() > 2090;

                  return (
                    <tr key={s.id} className="hover:bg-neutral-800/20">
                      <td className="py-2.5 px-3">
                        <div className="text-white font-bold flex items-center gap-1.5">
                          <span>{s.name}</span>
                          {isUnlimited && (
                            <span className="px-1.5 py-0.2 text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-bold">
                              UNLIMITED
                            </span>
                          )}
                        </div>
                        <div className="text-neutral-500 text-[10px]">{s.id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-400">{s.userEmail}</td>
                      <td className="py-2.5 px-3 text-neutral-300">
                        {s.ramMb >= 65536 ? '64GB' : `${s.ramMb}MB`} / {s.cpuPercent}% / {s.diskGb >= 1000 ? `${s.diskGb}GB (∞)` : `${s.diskGb}GB`}
                      </td>
                      <td className="py-2.5 px-3 text-white font-semibold">{s.primaryPort}</td>
                      <td className="py-2.5 px-3 font-mono">
                        {isUnlimited ? (
                          <span className="text-emerald-400 font-bold">Selamanya (∞)</span>
                        ) : (
                          <span className="text-amber-300 font-semibold">{new Date(s.expiresAt).toLocaleDateString('id-ID')}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          s.suspended ? 'bg-rose-950 text-rose-300' : s.status === 'running' ? 'bg-emerald-950 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
                        }`}>
                          {s.suspended ? 'SUSPENDED' : s.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5">
                        {onSelectServer && (
                          <button
                            onClick={() => onSelectServer(s.id)}
                            className="px-2 py-1 text-[11px] bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded"
                          >
                            Konsol
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setSelectedServerForExpiry(s);
                            setModalExpiryOption(isUnlimited ? 'unlimited' : '30d');
                            setShowExpiryModal(true);
                          }}
                          className="px-2 py-1 text-[11px] bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 rounded font-medium"
                          title="Ubah Masa Aktif / Perpanjang Durasi"
                        >
                          Masa Aktif
                        </button>
                        <button
                          onClick={() => handleSuspendServer(s.id)}
                          className={`px-2 py-1 text-[11px] rounded font-semibold ${
                            s.suspended ? 'bg-emerald-900 text-emerald-200' : 'bg-rose-950 text-rose-300'
                          }`}
                        >
                          {s.suspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 7. USERS TAB */}
      {/* ============================================================== */}
      {activeTab === 'users' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <h2 className="text-base font-bold text-white mb-4">Pengguna Terdaftar ({users.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 text-[11px]">
                  <th className="py-2.5 px-3">Nama</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Tanggal Dibuat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-neutral-800/20">
                    <td className="py-2.5 px-3 text-white font-bold">{u.name}</td>
                    <td className="py-2.5 px-3 text-neutral-300">
                      <span>{u.email}</span>
                      {u.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() && (
                        <span className="ml-2 text-[10px] text-emerald-400 font-bold">★ SUPER ADMIN</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.role === 'ADMIN' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-neutral-800 text-neutral-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500">
                      {new Date(u.createdAt).toLocaleDateString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 8. BUATQRIS PAYMENT SETTINGS TAB */}
      {/* ============================================================== */}
      {activeTab === 'payment' && (
        <form onSubmit={handleSavePaymentSettings} className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6 max-w-3xl">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
            <div>
              <h2 className="text-base font-bold text-white">Konfigurasi BuatQris Open API</h2>
              <p className="text-xs text-neutral-400">Atur kredensial resmi, webhook callback, dan mode transaksi.</p>
            </div>
            <button
              type="button"
              onClick={handleTestBuatQrisConnection}
              className="px-3.5 py-1.5 text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl"
            >
              Test Koneksi API
            </button>
          </div>

          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Webhook / Callback URL:</span>
              <button
                type="button"
                onClick={handleCopyWebhookUrl}
                className="flex items-center gap-1.5 text-white hover:text-neutral-300"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook ? 'Tersalin' : 'Salin URL'}</span>
              </button>
            </div>
            <div className="p-2 rounded bg-neutral-900 text-neutral-200 select-all break-all">
              {paymentConfig?.webhookUrl || `${window.location.origin}/api/webhooks/buatqris`}
            </div>
            <span className="text-[11px] text-neutral-500 block">
              Salin URL ini ke dasbor BuatQris: Dasbor → Open API → Webhook / Callback.
            </span>
          </div>

          <div className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-neutral-400 mb-1">Account ID</label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Secret Token</label>
              <input
                type="text"
                value={secretToken}
                onChange={(e) => setSecretToken(e.target.value)}
                placeholder="Masukkan secret token baru..."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">Signing Secret (HMAC-SHA256)</label>
              <input
                type="text"
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
                placeholder="Masukkan signing secret baru..."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-neutral-400 mb-1">Mode Transaksi</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                >
                  <option value="mock">Mock (Simulasi Lokal)</option>
                  <option value="sandbox">Sandbox (Uji Coba)</option>
                  <option value="live">Live (Produksi)</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Biaya Admin (fee_by)</label>
                <select
                  value={feeBy}
                  onChange={(e) => setFeeBy(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                >
                  <option value="buyer">buyer (Dibebankan ke Pembeli)</option>
                  <option value="user">user (Dipotong dari Saldo Kita)</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Metode QRIS Default</label>
                <select
                  value={qrisMethod}
                  onChange={(e) => setQrisMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
                >
                  <option value="qris_one">qris_one</option>
                  <option value="qris_two">qris_two</option>
                  <option value="qris_three">qris_three</option>
                  <option value="qris_four">qris_four</option>
                </select>
              </div>
            </div>
          </div>

          <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl text-[11px] text-neutral-400">
            Peringatan Keamanan: Jangan pernah membagikan Secret Token atau Signing Secret kepada siapa pun. Jika bocor, segera lakukan Regenerate di dasbor BuatQris.
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200"
          >
            Simpan Konfigurasi Payment
          </button>
        </form>
      )}

      {/* ============================================================== */}
      {/* 9. 9ROUTER SETTINGS */}
      {/* ============================================================== */}
      {activeTab === 'router' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6 max-w-2xl">
          <h2 className="text-base font-bold text-white">Integrasi 9router Gateway</h2>

          <div className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-neutral-400 mb-1">API Endpoint</label>
              <input
                type="text"
                value={routerEndpoint}
                onChange={(e) => setRouterEndpoint(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-neutral-400 mb-1">API Key</label>
              <input
                type="text"
                value={routerApiKey}
                onChange={(e) => setRouterApiKey(e.target.value)}
                placeholder="sk_router_..."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  const res = await apiRequest('/api/admin/router-settings/test', {
                    method: 'POST',
                    body: JSON.stringify({ endpoint: routerEndpoint, apiKey: routerApiKey })
                  });
                  setStatusMsg({ type: res.success ? 'success' : 'error', text: res.message });
                }}
                className="px-4 py-2 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200"
              >
                Test Koneksi 9router
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 10. ACTIVITY LOGS */}
      {/* ============================================================== */}
      {activeTab === 'logs' && (
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
          <h2 className="text-base font-bold text-white mb-4">Audit & Security Activity Logs</h2>
          <div className="space-y-2">
            {activityLogs.map(log => (
              <div key={log.id} className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs flex justify-between items-start">
                <div>
                  <div className="text-white font-bold">{log.action}</div>
                  <div className="text-neutral-400 mt-0.5">{log.details}</div>
                </div>
                <div className="text-neutral-500 text-[11px] shrink-0 ml-4">
                  {new Date(log.createdAt).toLocaleTimeString('id-ID')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 11. SCHEDULER TAB (24/7 Background Scheduler & Cleanup) */}
      {/* ============================================================== */}
      {activeTab === 'scheduler' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">24/7 Background Scheduler Daemon</h2>
                  <span className="px-2.5 py-0.5 text-xs font-mono rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                    🟢 ONLINE & ACTIVE 24/7
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
                  Scheduler otomatis memantau uptime kontainer secara real-time, menghentikan server yang kedaluwarsa, membebaskan port jaringan (prevent EADDRINUSE), membersihkan berkas temporer, dan membunuh proses zombie 24jam non-stop tanpa henti.
                </p>
              </div>
            </div>

            <button
              onClick={handleTriggerManualCleanup}
              disabled={isRunningCleanup}
              className="px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/10 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRunningCleanup ? 'animate-spin' : ''}`} />
              <span>{isRunningCleanup ? 'Memproses Cleanup...' : 'Jalankan Cleanup Sekarang'}</span>
            </button>
          </div>

          {/* 24/7 Keep-Alive & Anti-Sleep Panel */}
          <div className="p-6 rounded-2xl bg-neutral-900/40 border border-emerald-500/30 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>Keep-Alive 24 Jam Non-Stop (Anti-Sleep Cloud Run)</span>
                </h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
                  Gunakan endpoint publik di bawah ini pada monitor eksternal (UptimeRobot / Cron-job.org) setiap 5 menit agar server utama & seluruh kontainer Mode 24 Jam tetap menyala penuh walau semua browser ditutup.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleTestKeepAlive}
                  disabled={testingKeepAlive}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingKeepAlive ? 'animate-spin' : ''}`} />
                  <span>{testingKeepAlive ? 'Menguji...' : 'Test Ping Sekarang'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyKeepAliveUrl}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1.5"
                >
                  {copiedKeepAlive ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKeepAlive ? 'URL Tersalin' : 'Salin Ping URL'}</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/80 border border-neutral-800 font-mono text-xs text-emerald-300 select-all break-all flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>{`${window.location.origin}/api/ping`}</span>
              <span className="text-[11px] text-neutral-400 shrink-0">
                Alternatif: /api/health · /ping
              </span>
            </div>

            {keepAliveTestResult && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 font-mono text-xs">
                ✅ {keepAliveTestResult}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="text-[11px] font-mono text-neutral-500">Uptime Host Panel</div>
                <div className="text-xl font-bold font-mono text-white mt-1 tabular-nums">
                  {Math.floor((schedulerStats?.uptimeSeconds || 0) / 3600)}j {Math.floor(((schedulerStats?.uptimeSeconds || 0) % 3600) / 60)}m
                </div>
                <div className="text-[11px] text-emerald-400 font-mono mt-1">Process Guard Aktif</div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="text-[11px] font-mono text-neutral-500">Server Mode 24/7</div>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">
                  {schedulerStats?.activeServers ?? 0} / {schedulerStats?.alwaysOn247Count ?? 0}
                </div>
                <div className="text-[11px] text-neutral-400 font-mono mt-1">Berjalan / Terjadwal 24 Jam</div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="text-[11px] font-mono text-neutral-500">Total Keep-Alive Ping</div>
                <div className="text-xl font-bold font-mono text-cyan-400 mt-1 tabular-nums">
                  {schedulerStats?.totalKeepAlivePings || 0}x
                </div>
                <div className="text-[11px] text-neutral-400 font-mono mt-1 truncate">
                  Terakhir: {schedulerStats?.lastKeepAlivePingAt ? new Date(schedulerStats.lastKeepAlivePingAt).toLocaleTimeString('id-ID') : '-'} ({schedulerStats?.lastKeepAliveSource || 'boot'})
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div className="text-[11px] font-mono text-neutral-500">Auto-Recovery 24/7</div>
                <div className="text-xl font-bold font-mono text-amber-400 mt-1 tabular-nums">
                  {schedulerStats?.totalAutoRecoveries || 0}x
                </div>
                <div className="text-[11px] text-neutral-400 font-mono mt-1">Smart Exponential Backoff</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 text-xs text-neutral-300 space-y-1.5">
              <div className="font-semibold text-white">Panduan Singkat Setup 24 Jam Gratis:</div>
              <ol className="list-decimal list-inside space-y-1 text-neutral-400 text-[11px] leading-relaxed">
                <li>Buka <span className="text-white">UptimeRobot.com</span> atau <span className="text-white">Cron-job.org</span> lalu buat monitor baru tipe <span className="text-emerald-400">HTTP(s) GET</span>.</li>
                <li>Tempelkan URL Keep-Alive <span className="font-mono text-emerald-300">{`${window.location.origin}/api/ping`}</span>.</li>
                <li>Atur interval pengecekan setiap <span className="text-white">5 menit</span> lalu simpan. Panel & seluruh bot 24/7 akan terjaga menyala non-stop.</li>
              </ol>
            </div>
          </div>

          {/* Metrics Overview Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Total Cleanup Dijalankan</div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {schedulerStats?.totalCleanups || 0}x
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 font-mono">Setiap 30 detik otomatis</div>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Kontainer Dibersihkan</div>
              <div className="text-2xl font-bold font-mono text-cyan-400 tabular-nums">
                {schedulerStats?.cleanedContainers || 0}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 font-mono">Expired & Idle auto-stop</div>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Port & Zombie Reclaimed</div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {(schedulerStats?.reclaimedPorts || 0) + (schedulerStats?.terminatedZombies || 0)}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 font-mono">Bebas EADDRINUSE crash</div>
            </div>

            <div className="p-5 rounded-2xl bg-neutral-900/40 border border-neutral-800">
              <div className="text-xs font-mono text-neutral-500 mb-1">Disk Storage Dibebaskan</div>
              <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
                {((schedulerStats?.freedBytes || 0) / (1024 * 1024)).toFixed(1)} MB
              </div>
              <div className="text-[11px] text-neutral-400 mt-1 font-mono">Cache & file temporer</div>
            </div>
          </div>

          {/* Scheduler Live Activity Event Log */}
          <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Log Aktivitas Background Scheduler (24/7 Live Stream)</span>
            </h3>

            <div className="bg-black/80 rounded-xl border border-neutral-800 p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2">
              {schedulerStats?.recentEvents && schedulerStats.recentEvents.length > 0 ? (
                schedulerStats.recentEvents.map((evt: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 py-1 border-b border-neutral-900/80 last:border-0">
                    <span className="text-neutral-500 shrink-0">[{evt.timestamp}]</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase shrink-0 ${
                      evt.type === 'warn' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                      evt.type === 'success' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                      'bg-neutral-800 text-neutral-300'
                    }`}>
                      {evt.type}
                    </span>
                    <span className="text-neutral-300">{evt.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-neutral-500 text-center py-6">
                  Belum ada log aktivitas scheduler. Daemon berjalan normal.
                </div>
              )}
            </div>
          </div>

          {/* Anti-Loss & Persistent Database Snapshot Engine */}
          <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Anti-Loss Persistence Engine (Mencegah Panel & Server Hilang)</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      Multi-Mirror Active
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Data server tersinkronisasi otomatis di 4 lokasi: <code>data/db.json</code>, <code>data/db_backup.json</code>, <code>/tmp/aether_db_backup.json</code>, dan <code>data/backups/snapshot_latest.json</code>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await apiRequest('/api/admin/database/snapshot/create', { method: 'POST' });
                      if (res.success) {
                        setStatusMsg({
                          type: 'success',
                          text: `Snapshot berhasil dibuat: ${res.snapshot.filename} (${res.snapshot.serverCount} server tersimpan aman)!`
                        });
                      }
                    } catch (e: any) {
                      setStatusMsg({ type: 'error', text: e.message || 'Gagal membuat snapshot' });
                    }
                  }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl border border-neutral-700 flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Buat Snapshot Baru</span>
                </button>

                <a
                  href="/api/admin/database/snapshot/download"
                  download
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-950 flex items-center gap-1.5 transition-colors"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Unduh Backup JSON</span>
                </a>
              </div>
            </div>
          </div>

          {/* VPS 24/7 Production Deployment Guide & Scripts */}
          <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Panduan Deployment VPS 24 Jam Nonstop</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Gunakan script bawaan di folder <code>/scripts</code> untuk otomatisasi Auto-Restart systemd, UFW Firewall, Fail2ban, Let's Encrypt SSL, dan Backup harian di Ubuntu VPS.
                </p>
              </div>
            </div>

            <div className="bg-neutral-950 rounded-xl p-4 border border-neutral-800 space-y-3 font-mono text-xs">
              <div className="text-neutral-400 text-[11px] font-sans">
                Jalankan perintah ini di VPS Anda untuk instalasi lengkap 1-langkah:
              </div>
              <div className="p-3 bg-black/90 rounded-lg border border-neutral-800 text-emerald-400 select-all flex items-center justify-between">
                <span>sudo bash scripts/setup-vps-24jam.sh panel.domainanda.com admin@domainanda.com</span>
                <span className="text-neutral-500 text-[10px] font-sans">Klik untuk salin</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-400 text-[11px] font-sans pt-1">
                <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="font-bold text-white mb-0.5">1. Auto-Restart (systemd)</div>
                  File unit <code>systemd/aetherpanel.service</code> menjaga panel otomatis bangkit saat crash/reboot.
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="font-bold text-white mb-0.5">2. Monitoring (monitor.sh)</div>
                  Memantau CPU, RAM, Disk, dan Uptime serta mengirim notifikasi Telegram/Discord.
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="font-bold text-white mb-0.5">3. Backup Retensi 7 Hari (backup.sh)</div>
                  Backup terkompresi otomatis jam 02:00 pagi dengan restore 1-langkah.
                </div>
                <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                  <div className="font-bold text-white mb-0.5">4. Keamanan UFW & HTTPS</div>
                  Firewall UFW menutup port berbahaya, Fail2ban memblokir brute-force, dan Nginx SSL gratis.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SET MASA AKTIF SERVER */}
      {showExpiryModal && selectedServerForExpiry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Ubah Masa Aktif Server</h3>
              </div>
              <button
                onClick={() => setShowExpiryModal(false)}
                className="p-1 text-neutral-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs">
              <div className="text-neutral-400">Server Target:</div>
              <div className="text-white font-bold text-sm">{selectedServerForExpiry.name} ({selectedServerForExpiry.id})</div>
              <div className="text-neutral-500 text-[11px] mt-1">Pemilik: {selectedServerForExpiry.userEmail}</div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1">Pilih Masa Aktif Baru</label>
              <select
                value={modalExpiryOption}
                onChange={(e: any) => setModalExpiryOption(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-indigo-800 text-indigo-300 font-mono text-xs font-semibold rounded-xl focus:outline-none"
              >
                <option value="unlimited">✨ Unlimited / Selamanya (Tanpa Kadaluarsa)</option>
                <option value="24h">⏱️ 24 Jam (1 Hari)</option>
                <option value="3d">📅 3 Hari</option>
                <option value="7d">📅 7 Hari (1 Minggu)</option>
                <option value="30d">📅 30 Hari (1 Bulan Standard)</option>
                <option value="1y">📅 1 Tahun (365 Hari VIP)</option>
                <option value="custom">⚙️ Custom Jam</option>
              </select>

              {modalExpiryOption === 'custom' && (
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={modalCustomHours}
                    onChange={(e) => setModalCustomHours(e.target.value)}
                    placeholder="Total jam..."
                    className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono text-xs focus:outline-none"
                  />
                  <span className="text-xs text-neutral-400 font-mono">Jam</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExpiryModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isUpdatingExpiry}
                onClick={handleSaveServerExpiry}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-950 transition-all flex items-center gap-1.5"
              >
                {isUpdatingExpiry && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Simpan Masa Aktif</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
