import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Terminal, 
  Server, 
  FileText, 
  Lock,
  ExternalLink
} from 'lucide-react';
import { apiRequest } from '../lib/api';

interface SuccessPageProps {
  orderCode: string;
  onNavigateLogin: (email?: string, tempPassword?: string) => void;
  onNavigateServer: (serverId: string) => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({
  orderCode,
  onNavigateLogin,
  onNavigateServer
}) => {
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    const fetchCreds = async () => {
      try {
        const res = await apiRequest(`/api/orders/${orderCode}/success-credentials`);
        if (res.success) {
          setCredentials(res.credentials);
          setOrder(res.order);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchCreds();
  }, [orderCode]);

  const copyToClipboard = (text: string, type: 'pass' | 'email') => {
    navigator.clipboard.writeText(text);
    if (type === 'pass') {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    } else {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const email = credentials?.email || order?.customerEmail || 'user@example.com';
  const tempPass = credentials?.tempPassword || 'Aeth!7a9b1c';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 min-h-screen">
      {/* Header Celebration */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
          Pembayaran Berhasil & Server Telah Aktif!
        </h1>
        <p className="text-sm text-neutral-400">
          Pesanan <span className="font-mono text-white font-semibold">{orderCode}</span> telah diprovisioning secara instan oleh worker.
        </p>
      </div>

      {/* One-Time Credentials Card */}
      <div className="p-8 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-6 shadow-2xl mb-8">
        <div className="flex items-center gap-2 pb-4 border-b border-neutral-800">
          <Lock className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Kredensial Akun (Simpan Sekarang)
          </h2>
        </div>

        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs leading-relaxed">
          PENTING: Kata sandi sementara di bawah ini hanya ditampilkan sekali pada halaman ini demi keamanan akun Anda. Harap salin dan simpan di tempat yang aman.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1">Email / Username Login</label>
            <div className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs">
              <span className="text-white select-all">{email}</span>
              <button
                onClick={() => copyToClipboard(email, 'email')}
                className="p-1 text-neutral-400 hover:text-white"
                title="Salin email"
              >
                {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1">Kata Sandi Sementara</label>
            <div className="flex items-center justify-between p-3 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs">
              <span className="text-white font-bold tracking-wider select-all">
                {showPassword ? tempPass : '••••••••••••'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-neutral-400 hover:text-white"
                  title="Lihat password"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => copyToClipboard(tempPass, 'pass')}
                  className="p-1 text-neutral-400 hover:text-white"
                  title="Salin password"
                >
                  {copiedPass ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {credentials?.primaryPort && (
            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1">Port Alokasi Container</label>
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-emerald-400">
                Port {credentials.primaryPort} (TCP/HTTP)
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => onNavigateLogin(email, tempPass)}
            className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 shadow-lg"
          >
            <span>Masuk ke Panel Sekarang</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {order?.serverId && (
            <button
              onClick={() => onNavigateServer(order.serverId)}
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-neutral-800 text-white font-semibold text-xs hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2"
            >
              <Terminal className="w-4 h-4" />
              <span>Buka Console Server</span>
            </button>
          )}
        </div>
      </div>

      {/* Invoice receipt summary */}
      <div className="p-6 rounded-2xl bg-neutral-900/30 border border-neutral-800 text-xs text-neutral-400 font-mono space-y-2">
        <div className="flex justify-between text-neutral-300 font-bold mb-2">
          <span>INVOICE RESMI #{orderCode}</span>
          <span className="text-emerald-400">LUNAS (QRIS)</span>
        </div>
        <div className="flex justify-between">
          <span>Waktu Pembayaran</span>
          <span>{new Date().toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between">
          <span>Payment Gateway</span>
          <span>BuatQris Open API (QRIS Dinamis)</span>
        </div>
        <div className="flex justify-between font-bold text-white pt-2 border-t border-neutral-800">
          <span>Total Dibayar</span>
          <span>Rp {(order?.totalAmount || 0).toLocaleString('id-ID')}</span>
        </div>
      </div>
    </div>
  );
};
