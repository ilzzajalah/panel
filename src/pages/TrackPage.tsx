import React, { useState } from 'react';
import { Search, Server, Clock, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface TrackPageProps {
  onNavigateCheckout: (orderCode: string) => void;
  onNavigateLogin: (email?: string) => void;
  onNavigateServer: (serverId: string) => void;
}

export const TrackPage: React.FC<TrackPageProps> = ({
  onNavigateCheckout,
  onNavigateLogin,
  onNavigateServer
}) => {
  const [orderCode, setOrderCode] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderCode.trim() || !email.trim()) {
      setErrorMsg('Harap masukkan Kode Order dan Email Anda');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      const data = await apiRequest('/api/track', {
        method: 'POST',
        body: JSON.stringify({ orderCode: orderCode.trim(), email: email.trim() })
      });

      if (data.success) {
        setResult(data);
      } else {
        throw new Error(data.error || 'Pesanan tidak ditemukan');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Pesanan tidak ditemukan atau email tidak cocok');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 min-h-screen">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">Lacak Status Pesanan</h1>
        <p className="text-xs text-neutral-400">
          Masukkan kode order Anda beserta alamat email yang digunakan saat checkout.
        </p>
      </div>

      <form onSubmit={handleTrack} className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4 mb-8">
        <div>
          <label className="block text-xs font-semibold text-neutral-300 mb-1">Kode Order</label>
          <input
            type="text"
            required
            placeholder="Contoh: ORD-1024-ABC"
            value={orderCode}
            onChange={(e) => setOrderCode(e.target.value)}
            className="w-full px-4 py-2.5 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:border-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-300 mb-1">Email Pembeli</label>
          <input
            type="email"
            required
            placeholder="nama@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
        >
          <Search className="w-4 h-4" />
          <span>{loading ? 'Mencari Data Pesanan...' : 'Lacak Sekarang'}</span>
        </button>
      </form>

      {errorMsg && (
        <div className="p-4 mb-6 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {result && (
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
            <div>
              <div className="text-[11px] font-mono text-neutral-500">Kode Pesanan</div>
              <div className="text-base font-bold font-mono text-white">{result.order.orderCode}</div>
            </div>
            <div className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-neutral-800 text-white">
              Status: {result.order.status}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono text-neutral-300">
            <div>
              <span className="text-neutral-500 block">Template:</span>
              <span className="font-semibold">{result.order.specs.eggId}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">RAM & CPU:</span>
              <span className="font-semibold">{result.order.specs.ramMb}MB / {result.order.specs.cpuPercent}%</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Total Nominal:</span>
              <span className="font-semibold text-emerald-400">Rp {result.order.totalAmount.toLocaleString('id-ID')}</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Tanggal Dibuat:</span>
              <span>{new Date(result.order.createdAt).toLocaleDateString('id-ID')}</span>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
            {result.order.status === 'PENDING' && (
              <button
                onClick={() => onNavigateCheckout(result.order.orderCode)}
                className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200"
              >
                Lanjutkan Pembayaran QRIS
              </button>
            )}

            {(result.order.status === 'ACTIVE' || result.order.status === 'PAID') && result.server && (
              <button
                onClick={() => onNavigateServer(result.server.id)}
                className="px-4 py-2 bg-white text-black font-semibold text-xs rounded-xl hover:bg-neutral-200 flex items-center gap-2"
              >
                <span>Kelola Server ({result.server.name})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
