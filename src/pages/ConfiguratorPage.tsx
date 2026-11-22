import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Database, 
  Radio, 
  Archive, 
  ArrowRight, 
  Tag, 
  Check, 
  AlertCircle,
  Clock,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { DEFAULT_EGGS } from '@/packages/shared/eggs';
import { DEFAULT_NODES } from '@/packages/shared/constants';
import { calculatePriceQuote } from '@/packages/shared/pricing';
import { EggId, ServerSpecs, PriceQuote } from '@/packages/shared/types';
import { apiRequest } from '../lib/api';

interface ConfiguratorPageProps {
  initialPlanId?: string | null;
  onOrderCreated: (orderCode: string) => void;
}

export const ConfiguratorPage: React.FC<ConfiguratorPageProps> = ({
  initialPlanId,
  onOrderCreated
}) => {
  const [step, setStep] = useState<1 | 2>(1);

  // Specs State
  const [eggId, setEggId] = useState<EggId>('nodejs');
  const [nodeId, setNodeId] = useState<string>('node-jkt-01');
  const [ramMb, setRamMb] = useState<number>(1024);
  const [cpuPercent, setCpuPercent] = useState<number>(100);
  const [diskGb, setDiskGb] = useState<number>(10);
  const [backupSlots, setBackupSlots] = useState<number>(1);
  const [extraPorts, setExtraPorts] = useState<number>(0);
  const [databases, setDatabases] = useState<number>(0);
  const [durationMonths, setDurationMonths] = useState<number>(1);
  const [couponCode, setCouponCode] = useState<string>('');
  const [serverName, setServerName] = useState<string>('My Production Server');

  // Buyer Info State
  const [customerName, setCustomerName] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [agreedToTos, setAgreedToTos] = useState<boolean>(true);

  // Status & Validation
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [liveRules, setLiveRules] = useState<any>(undefined);
  const [liveCoupons, setLiveCoupons] = useState<any>(undefined);

  // Fetch live pricing rules and vouchers
  useEffect(() => {
    apiRequest('/api/pricing/rules')
      .then(res => {
        if (res.success) {
          if (res.rules) setLiveRules(res.rules);
          if (res.coupons) setLiveCoupons(res.coupons);
        }
      })
      .catch(() => {});
  }, []);

  // Preset plans apply
  useEffect(() => {
    if (initialPlanId === 'starter') {
      setRamMb(512);
      setCpuPercent(50);
      setDiskGb(5);
      setBackupSlots(1);
    } else if (initialPlanId === 'pro') {
      setRamMb(2048);
      setCpuPercent(100);
      setDiskGb(20);
      setBackupSlots(3);
      setExtraPorts(1);
      setDatabases(1);
    } else if (initialPlanId === 'ultra') {
      setRamMb(4096);
      setCpuPercent(200);
      setDiskGb(50);
      setBackupSlots(5);
      setExtraPorts(2);
      setDatabases(2);
      setEggId('minecraft-java');
    }
  }, [initialPlanId]);

  // Recalculate price quote reactively
  useEffect(() => {
    const specs: ServerSpecs = {
      eggId,
      nodeId,
      ramMb,
      cpuPercent,
      diskGb,
      backupSlots,
      extraPorts,
      databases,
      durationMonths,
      couponCode,
      serverName
    };
    const calculated = calculatePriceQuote(specs, liveRules, liveCoupons);
    setQuote(calculated);
  }, [eggId, nodeId, ramMb, cpuPercent, diskGb, backupSlots, extraPorts, databases, durationMonths, couponCode, serverName, liveRules, liveCoupons]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail || !customerName) {
      setErrorMsg('Harap isi nama dan email Anda');
      return;
    }
    if (!agreedToTos) {
      setErrorMsg('Anda harus menyetujui Ketentuan Layanan & Kebijakan Anti-Abuse');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        customerName,
        customerEmail,
        customerPhone,
        specs: {
          eggId,
          nodeId,
          ramMb,
          cpuPercent,
          diskGb,
          backupSlots,
          extraPorts,
          databases,
          durationMonths,
          couponCode,
          serverName: serverName || 'My Cloud Server'
        }
      };

      const res = await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success && res.order?.orderCode) {
        onOrderCreated(res.order.orderCode);
      } else {
        throw new Error(res.error || 'Gagal memproses pesanan');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuat pesanan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const ramOptions = [
    { label: '256 MB', val: 256 },
    { label: '512 MB', val: 512 },
    { label: '1 GB', val: 1024 },
    { label: '2 GB', val: 2048 },
    { label: '4 GB', val: 4096 },
    { label: '8 GB', val: 8192 },
    { label: '16 GB', val: 16384 }
  ];

  const durations = [
    { months: 1, label: '1 Bulan', discount: '0%' },
    { months: 3, label: '3 Bulan', discount: 'Diskon 5%' },
    { months: 6, label: '6 Bulan', discount: 'Diskon 10%' },
    { months: 12, label: '12 Bulan', discount: 'Diskon 15%' }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-screen">
      {/* Stepper Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 text-xs font-mono text-neutral-400 mb-2">
          <span className={step >= 1 ? 'text-white font-semibold' : ''}>01. Konfigurasi Server</span>
          <span>/</span>
          <span className={step >= 2 ? 'text-white font-semibold' : ''}>02. Data Pembeli</span>
          <span>/</span>
          <span>03. Bayar QRIS</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {step === 1 ? 'Kustomisasi Spesifikasi Server' : 'Lengkapi Informasi Pembeli'}
        </h1>
      </div>

      {errorMsg && (
        <div className="p-4 mb-6 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Form Controls (Step 1 or Step 2) */}
        <div className="lg:col-span-2 space-y-8">
          {step === 1 ? (
            <>
              {/* Section 1: Egg / Template */}
              <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-sm font-semibold text-white">1. Pilih Template Runtime (Egg)</label>
                  <span className="text-xs font-mono text-neutral-500">{DEFAULT_EGGS.length} Runtimes</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {DEFAULT_EGGS.map(egg => (
                    <button
                      key={egg.id}
                      type="button"
                      onClick={() => setEggId(egg.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        eggId === egg.id
                          ? 'border-white bg-neutral-800/80 ring-1 ring-white/20'
                          : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700'
                      }`}
                    >
                      <div className="text-[10px] font-mono text-neutral-500 mb-1">{egg.category}</div>
                      <div className="text-xs font-bold text-white mb-1 truncate">{egg.name}</div>
                      <div className="text-[11px] text-neutral-400 line-clamp-1">{egg.entryFile}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 2: Datacenter Location */}
              <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800">
                <label className="block text-sm font-semibold text-white mb-4">2. Pilih Lokasi Node Datacenter</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {DEFAULT_NODES.map(node => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setNodeId(node.id)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        nodeId === node.id
                          ? 'border-white bg-neutral-800/80 ring-1 ring-white/20'
                          : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-lg">{node.flag}</span>
                        <span className="text-[10px] font-mono text-emerald-400">{node.pingMs}ms</span>
                      </div>
                      <div className="text-xs font-bold text-white mb-0.5">{node.name}</div>
                      <div className="text-[11px] text-neutral-500 font-mono">{node.code} · Tier 3</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Hardware Resources (RAM, CPU, Disk) */}
              <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-neutral-400" />
                      <span>Dedicated Memory (RAM)</span>
                    </label>
                    <span className="text-xs font-mono font-bold text-white tabular-nums">
                      {ramMb >= 1024 ? `${ramMb / 1024} GB` : `${ramMb} MB`}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-3">
                    {ramOptions.map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setRamMb(opt.val)}
                        className={`py-2 text-xs font-mono rounded-lg border transition-all ${
                          ramMb === opt.val
                            ? 'border-white bg-white text-black font-bold'
                            : 'border-neutral-800 bg-neutral-950/60 text-neutral-300 hover:border-neutral-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-white flex items-center gap-2">
                      <Radio className="w-4 h-4 text-neutral-400" />
                      <span>CPU Core Limit</span>
                    </label>
                    <span className="text-xs font-mono font-bold text-white tabular-nums">{cpuPercent}% Core</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="400"
                    step="25"
                    value={cpuPercent}
                    onChange={(e) => setCpuPercent(parseInt(e.target.value))}
                    className="w-full accent-white bg-neutral-800 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-neutral-500 mt-1">
                    <span>50% (0.5 vCPU)</span>
                    <span>100% (1 vCPU)</span>
                    <span>200% (2 vCPU)</span>
                    <span>400% (4 vCPU)</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-white flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-neutral-400" />
                      <span>NVMe SSD Storage</span>
                    </label>
                    <span className="text-xs font-mono font-bold text-white tabular-nums">{diskGb} GB</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={diskGb}
                    onChange={(e) => setDiskGb(parseInt(e.target.value))}
                    className="w-full accent-white bg-neutral-800 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-neutral-500 mt-1">
                    <span>5 GB</span>
                    <span>25 GB</span>
                    <span>50 GB</span>
                    <span>100 GB</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Addons & Server Name */}
              <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
                <label className="block text-sm font-semibold text-white mb-2">4. Add-on & Penamaan Server</label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                    <div className="text-xs font-semibold text-neutral-300 mb-1">Backup Slot</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-neutral-500">+Rp 2.000/slot</span>
                      <select
                        value={backupSlots}
                        onChange={(e) => setBackupSlots(parseInt(e.target.value))}
                        className="bg-neutral-800 text-white text-xs font-mono px-2 py-1 rounded border border-neutral-700"
                      >
                        {[0, 1, 2, 3, 5, 10].map(n => (
                          <option key={n} value={n}>{n} Slot</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                    <div className="text-xs font-semibold text-neutral-300 mb-1">Port Tambahan</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-neutral-500">+Rp 1.500/port</span>
                      <select
                        value={extraPorts}
                        onChange={(e) => setExtraPorts(parseInt(e.target.value))}
                        className="bg-neutral-800 text-white text-xs font-mono px-2 py-1 rounded border border-neutral-700"
                      >
                        {[0, 1, 2, 3, 5].map(n => (
                          <option key={n} value={n}>{n} Port</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800">
                    <div className="text-xs font-semibold text-neutral-300 mb-1">Database Instance</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-neutral-500">+Rp 3.000/db</span>
                      <select
                        value={databases}
                        onChange={(e) => setDatabases(parseInt(e.target.value))}
                        className="bg-neutral-800 text-white text-xs font-mono px-2 py-1 rounded border border-neutral-700"
                      >
                        {[0, 1, 2, 3].map(n => (
                          <option key={n} value={n}>{n} DB</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-xs font-medium text-neutral-400 mb-1">Nama Server</label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="Contoh: Express Production API"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
                  />
                </div>
              </div>
            </>
          ) : (
            /* Step 2: Buyer Information Form */
            <div className="p-8 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
              <h2 className="text-lg font-bold text-white mb-2">Informasi Pembeli & Akun Baru</h2>
              <p className="text-xs text-neutral-400 mb-6">
                Setelah pembayaran QRIS berhasil diverifikasi, sistem akan otomatis membuatkan akun panel Anda dan mengirimkan kredensial sementara.
              </p>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Rizki Ramadhan"
                  className="w-full px-4 py-2.5 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder:text-neutral-600 focus:outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Alamat Email Aktif *</label>
                <input
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="nama@domain.com"
                  className="w-full px-4 py-2.5 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder:text-neutral-600 focus:outline-none focus:border-white"
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">Email ini akan digunakan untuk login ke panel.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">No. WhatsApp (Opsional)</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="081234567890"
                  className="w-full px-4 py-2.5 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder:text-neutral-600 focus:outline-none focus:border-white"
                />
              </div>

              <div className="pt-4 border-t border-neutral-800">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTos}
                    onChange={(e) => setAgreedToTos(e.target.checked)}
                    className="mt-0.5 rounded border-neutral-700 bg-neutral-900 text-white focus:ring-0"
                  />
                  <span className="text-xs text-neutral-400 leading-relaxed">
                    Saya menyetujui Ketentuan Layanan, Kebijakan Anti-Abuse (dilarang DDoS/Mining), serta memahami bahwa pembayaran QRIS diproses secara non-tunai melalui BuatQris Open API.
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 rounded-xl"
                >
                  Kembali ke Konfigurasi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Sticky Pricing Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-6 shadow-xl">
            <h2 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Ringkasan Biaya</span>
              <span className="text-xs font-mono text-neutral-500">BuatQris IDR</span>
            </h2>

            {/* Duration Selector */}
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-2">Durasi Berlangganan</label>
              <div className="grid grid-cols-2 gap-2">
                {durations.map(d => (
                  <button
                    key={d.months}
                    type="button"
                    onClick={() => setDurationMonths(d.months)}
                    className={`py-2 px-2.5 text-left rounded-xl border transition-all ${
                      durationMonths === d.months
                        ? 'border-white bg-neutral-800 text-white font-semibold'
                        : 'border-neutral-800 bg-neutral-950/60 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <div className="text-xs font-mono">{d.label}</div>
                    <div className="text-[10px] text-neutral-500 font-mono">{d.discount}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Pricing Breakdown */}
            {quote && (
              <div className="space-y-2 py-4 border-y border-neutral-800 text-xs font-mono">
                <div className="flex justify-between text-neutral-400">
                  <span>RAM ({ramMb >= 1024 ? `${ramMb / 1024} GB` : `${ramMb} MB`})</span>
                  <span>Rp {quote.ramPrice.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>CPU ({cpuPercent}%)</span>
                  <span>Rp {quote.cpuPrice.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>NVMe ({diskGb} GB)</span>
                  <span>Rp {quote.diskPrice.toLocaleString('id-ID')}</span>
                </div>
                {quote.backupPrice > 0 && (
                  <div className="flex justify-between text-neutral-400">
                    <span>Backup ({backupSlots} slot)</span>
                    <span>Rp {quote.backupPrice.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {quote.portsPrice > 0 && (
                  <div className="flex justify-between text-neutral-400">
                    <span>Port Ekstra ({extraPorts})</span>
                    <span>Rp {quote.portsPrice.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {quote.databasesPrice > 0 && (
                  <div className="flex justify-between text-neutral-400">
                    <span>Database ({databases})</span>
                    <span>Rp {quote.databasesPrice.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between text-neutral-400">
                  <span>Base Maintenance</span>
                  <span>Rp {quote.baseMonthly.toLocaleString('id-ID')}</span>
                </div>

                {quote.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400 pt-1">
                    <span>Diskon Durasi ({quote.discountPercent}%)</span>
                    <span>-Rp {quote.discountAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}

                {quote.couponDiscountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Promo Kupon</span>
                    <span>-Rp {quote.couponDiscountAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}

                <div className="flex justify-between text-neutral-400 pt-1">
                  <span>Biaya Admin QRIS</span>
                  <span>Rp {quote.adminFee.toLocaleString('id-ID')}</span>
                </div>
              </div>
            )}

            {/* Promo Code Input */}
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Kode Promo (LAUNCH20, HEMAT50)"
                  className="flex-1 px-3 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white uppercase font-mono focus:outline-none focus:border-neutral-600"
                />
              </div>
            </div>

            {/* Grand Total */}
            {quote && (
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-neutral-400">Total Pembayaran:</span>
                  <div className="text-right">
                    <div className="text-2xl font-extrabold text-white font-mono tabular-nums">
                      Rp {quote.totalPayable.toLocaleString('id-ID')}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                      {durationMonths} bulan · QRIS Otomatis
                    </div>
                  </div>
                </div>

                {!quote.isValid && (
                  <p className="text-[11px] text-rose-400 mt-2 font-mono">
                    {quote.validationError}
                  </p>
                )}
              </div>
            )}

            {/* Action CTA */}
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!quote?.isValid}
                className="w-full py-3 text-xs font-semibold text-black bg-white hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-white rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <span>Lanjut ke Data Pembeli</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isSubmitting || !quote?.isValid}
                className="w-full py-3 text-xs font-semibold text-black bg-white hover:bg-neutral-200 disabled:opacity-40 disabled:hover:bg-white rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <span>{isSubmitting ? 'Membuat QRIS...' : 'Bayar via QRIS Sekarang'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
