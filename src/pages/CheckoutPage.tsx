import React, { useState, useEffect } from 'react';
import { 
  QrCode, 
  Copy, 
  Check, 
  Clock, 
  ExternalLink, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Info
} from 'lucide-react';
import { apiRequest } from '../lib/api';

interface CheckoutPageProps {
  orderCode: string;
  onPaymentSuccess: (orderCode: string) => void;
  onNavigateHome: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  orderCode,
  onPaymentSuccess,
  onNavigateHome
}) => {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [payment, setPayment] = useState<any>(null);
  const [paymentMode, setPaymentMode] = useState<string>('mock');
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const [simulating, setSimulating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOrder = async () => {
    try {
      const data = await apiRequest(`/api/orders/${orderCode}`);
      if (data.success) {
        setOrder(data.order);
        setPayment(data.payment);
        setPaymentMode(data.paymentMode || 'mock');

        if (data.order.status === 'ACTIVE' || data.order.status === 'PAID') {
          onPaymentSuccess(orderCode);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat data transaksi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // Auto-poll our internal database every 5 seconds (NOT polling BuatQris directly)
    const interval = setInterval(fetchOrder, 5000);
    return () => clearInterval(interval);
  }, [orderCode]);

  // Countdown timer calculation
  useEffect(() => {
    if (!payment?.expiredAt) return;

    const timer = setInterval(() => {
      const expiry = new Date(payment.expiredAt).getTime();
      const now = Date.now();
      const diff = expiry - now;

      if (diff <= 0) {
        setIsExpired(true);
        setTimeRemaining('00:00');
        clearInterval(timer);
      } else {
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setTimeRemaining(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [payment]);

  // Cooldown timer for manual check
  useEffect(() => {
    if (rateLimitCooldown <= 0) return;
    const cd = setInterval(() => {
      setRateLimitCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(cd);
  }, [rateLimitCooldown]);

  const handleCopyAmount = () => {
    if (!payment?.totalAmount) return;
    navigator.clipboard.writeText(payment.totalAmount.toString());
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
  };

  // Manual Check Button (calls our backend which checks BuatQris with 20s rate limiting)
  const handleManualCheck = async () => {
    if (rateLimitCooldown > 0 || checkingStatus) return;
    setCheckingStatus(true);
    setErrorMsg(null);

    try {
      const res = await apiRequest(`/api/orders/${orderCode}/check-payment`, {
        method: 'POST'
      });

      if (res.status === 'SUCCESS' || res.newlyPaid) {
        onPaymentSuccess(orderCode);
      } else if (res.error === 'rate_limited') {
        setRateLimitCooldown(res.retry_after || 20);
        setErrorMsg(`Batas cek status 1 kali per 20 detik. Coba lagi dalam ${res.retry_after || 20} detik.`);
      } else {
        setErrorMsg('Pembayaran belum terdeteksi. Silakan selesaikan pembayaran di aplikasi m-banking / e-wallet Anda.');
        setRateLimitCooldown(20);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengecek status');
      setRateLimitCooldown(20);
    } finally {
      setCheckingStatus(false);
    }
  };

  // 1-Click Simulation Button (For Sandbox / Mock testing)
  const handleSimulatePayment = async () => {
    setSimulating(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest(`/api/orders/${orderCode}/simulate-payment`, {
        method: 'POST'
      });
      if (res.success) {
        onPaymentSuccess(orderCode);
      } else {
        throw new Error(res.error || 'Simulasi gagal');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menjalankan simulasi pembayaran');
    } finally {
      setSimulating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center text-neutral-400 font-mono text-xs">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-white" />
        <span>Menghubungi BuatQris Gateway & Menyiapkan QRIS...</span>
      </div>
    );
  }

  if (!order || !payment) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-white mb-2">Transaksi Tidak Ditemukan</h2>
        <p className="text-xs text-neutral-400 mb-6">{errorMsg || 'Data pesanan atau pembayaran tidak valid.'}</p>
        <button
          onClick={onNavigateHome}
          className="px-4 py-2 text-xs font-semibold text-black bg-white rounded-lg"
        >
          Kembali ke Beranda
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-screen">
      {/* Top Banner for Test/Sandbox/Mock Mode */}
      {paymentMode !== 'live' && (
        <div className="mb-6 p-4 rounded-xl bg-neutral-900 border border-neutral-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <div>
              <span className="font-bold text-white uppercase tracking-wider">Mode Pengujian ({paymentMode.toUpperCase()})</span>
              <span className="text-neutral-400 block sm:inline sm:ml-2">
                Tidak menggunakan uang asli. Anda dapat mencoba langsung tombol simulasi di bawah.
              </span>
            </div>
          </div>

          <button
            onClick={handleSimulatePayment}
            disabled={simulating}
            className="px-4 py-2 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors shrink-0 flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-black" />
            <span>{simulating ? 'Memproses Simulasi...' : 'Simulasikan Bayar Berhasil'}</span>
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Column: Order Summary (5 cols) */}
        <div className="md:col-span-5 p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-6">
          <div>
            <div className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-1">Kode Transaksi</div>
            <div className="font-mono text-sm font-bold text-white">{order.orderCode}</div>
          </div>

          <div className="space-y-3 py-4 border-y border-neutral-800 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-neutral-400">Template / Egg</span>
              <span className="text-white font-semibold">{order.specs.eggId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Memory (RAM)</span>
              <span className="text-white font-semibold">{order.specs.ramMb >= 1024 ? `${order.specs.ramMb / 1024} GB` : `${order.specs.ramMb} MB`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">CPU Allocation</span>
              <span className="text-white font-semibold">{order.specs.cpuPercent}% Core</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">NVMe Storage</span>
              <span className="text-white font-semibold">{order.specs.diskGb} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Durasi</span>
              <span className="text-white font-semibold">{order.durationMonths} Bulan</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Nama Pembeli</span>
              <span className="text-white">{order.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Email Akun</span>
              <span className="text-white truncate max-w-[180px]">{order.customerEmail}</span>
            </div>
          </div>

          <div>
            <div className="text-xs text-neutral-400 mb-1">Total yang Harus Dibayar:</div>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-extrabold text-white font-mono tabular-nums">
                Rp {payment.totalAmount.toLocaleString('id-ID')}
              </div>
              <button
                onClick={handleCopyAmount}
                className="px-2.5 py-1 text-xs font-mono text-neutral-300 hover:text-white bg-neutral-800 rounded-md transition-colors flex items-center gap-1"
                title="Salin nominal pas"
              >
                {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAmount ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono mt-1 block">
              *Harap bayar sesuai nominal pas hingga digit terakhir agar otomatis terverifikasi.
            </span>
          </div>

          <div className="pt-2">
            <a
              href={payment.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <span>Buka Halaman Pembayaran BuatQris</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Right Column: QRIS Display & Realtime Status (7 cols) */}
        <div className="md:col-span-7 p-8 rounded-2xl bg-neutral-900/40 border border-neutral-800 flex flex-col items-center text-center space-y-6">
          <div className="flex items-center gap-2 px-3 py-1 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-300">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <span>Sisa Waktu Bayar: </span>
            <span className={`font-bold tabular-nums ${isExpired ? 'text-rose-400' : 'text-white'}`}>
              {timeRemaining || '15:00'}
            </span>
          </div>

          {/* QR Code Frame */}
          <div className="relative p-4 bg-white rounded-2xl shadow-2xl">
            {payment.qrUrl ? (
              <img
                src={payment.qrUrl}
                alt="QRIS BuatQris"
                className="w-64 h-64 sm:w-72 sm:h-72 object-contain"
              />
            ) : (
              <div className="w-64 h-64 sm:w-72 sm:h-72 bg-neutral-100 flex items-center justify-center text-black font-mono text-xs">
                QRIS Code Ready
              </div>
            )}

            {isExpired && (
              <div className="absolute inset-0 bg-neutral-950/90 rounded-2xl flex flex-col items-center justify-center p-6 text-white">
                <AlertTriangle className="w-8 h-8 text-rose-400 mb-2" />
                <div className="font-bold text-sm mb-1">QRIS Telah Kedaluwarsa</div>
                <div className="text-xs text-neutral-400 mb-4">Waktu pembayaran 15 menit telah habis.</div>
              </div>
            )}
          </div>

          <div className="max-w-sm space-y-1">
            <div className="font-semibold text-white text-sm">Scan Menggunakan Aplikasi Favorit Anda</div>
            <div className="text-xs text-neutral-400">
              BCA, Mandiri Livin, BRImo, BNI, GoPay, OVO, DANA, ShopeePay, LinkAja, atau QRIS Bank apa pun.
            </div>
          </div>

          {/* Verification Status & Manual Check Action */}
          <div className="w-full max-w-sm pt-4 border-t border-neutral-800 flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-neutral-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Menunggu notifikasi webhook BuatQris...</span>
            </div>

            <button
              onClick={handleManualCheck}
              disabled={checkingStatus || rateLimitCooldown > 0}
              className="w-full py-2.5 text-xs font-medium text-neutral-200 hover:text-white bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:hover:bg-neutral-800 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
              <span>
                {checkingStatus 
                  ? 'Memeriksa ke server...' 
                  : rateLimitCooldown > 0 
                    ? `Cek Status (${rateLimitCooldown}s)` 
                    : 'Cek Status Pembayaran Manual'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
