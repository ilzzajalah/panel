import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, KeyRound, Sparkles } from 'lucide-react';
import { apiRequest, authStorage } from '../lib/api';
import { signInWithGoogle } from '../lib/firebase';

interface LoginPageProps {
  initialEmail?: string;
  initialPassword?: string;
  onLoginSuccess: (user: any) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  initialEmail,
  initialPassword,
  onLoginSuccess
}) => {
  const [email, setEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState(initialPassword || '');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forced password change modal
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempUser, setTempUser] = useState<any>(null);

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
    if (initialPassword) setPassword(initialPassword);
  }, [initialEmail, initialPassword]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);
    try {
      const firebaseRes = await signInWithGoogle();
      const fbUser = firebaseRes.user;

      // Sync with fullstack backend session
      const res = await apiRequest('/api/auth/google-sync', {
        method: 'POST',
        body: JSON.stringify({
          email: fbUser.email,
          name: fbUser.name,
          photoURL: fbUser.photoURL
        })
      });

      if (res.success && res.token) {
        authStorage.setToken(res.token);
        authStorage.setUser(res.user);
        onLoginSuccess(res.user);
      } else {
        throw new Error(res.error || 'Sinkronisasi profil akun Google gagal');
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      setErrorMsg(err.message || 'Login dengan Google dibatalkan atau gagal.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Harap isi email dan password Anda');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password })
      });

      if (res.success && res.token) {
        authStorage.setToken(res.token);
        authStorage.setUser(res.user);

        if (res.user.mustChangePassword) {
          setTempUser(res.user);
          setShowPasswordChange(true);
        } else {
          onLoginSuccess(res.user);
        }
      } else {
        throw new Error(res.error || 'Login gagal');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Email atau password tidak sesuai');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setErrorMsg('Password baru minimal 6 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Konfirmasi password tidak cocok');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword })
      });

      const updatedUser = { ...tempUser, mustChangePassword: false };
      authStorage.setUser(updatedUser);
      setShowPasswordChange(false);
      onLoginSuccess(updatedUser);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah password');
    } finally {
      setLoading(false);
    }
  };

  const setDemoLogin = (type: 'superadmin' | 'admin' | 'user') => {
    if (type === 'superadmin') {
      setEmail('rizramadhan975@gmail.com');
      setPassword('admin123');
    } else if (type === 'admin') {
      setEmail('admin@aetherpanel.com');
      setPassword('admin123');
    } else {
      setEmail('user@example.com');
      setPassword('user123');
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 min-h-screen flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-white text-black font-bold flex items-center justify-center mx-auto mb-3 text-base shadow-lg shadow-white/5">
          AP
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Masuk ke AetherPanel</h1>
        <p className="text-xs text-neutral-400 mt-1">
          Akses konsol server, file manager, dan pengaturan alokasi hosting.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3.5 mb-5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Admin Notice */}
      <div className="mb-5 p-3 rounded-xl bg-neutral-900/70 border border-neutral-800 text-xs text-neutral-300 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
        <div className="leading-relaxed text-[11px]">
          <span className="font-semibold text-white">Administrator: </span>
          Email <code className="px-1 py-0.5 bg-neutral-800 rounded text-emerald-300 font-mono text-[10px]">rizramadhan975@gmail.com</code> otomatis terdaftar sebagai Super Admin dengan akses penuh fitur Atur Harga, Bikin Voucher, dan Buat Panel Unlimited GB.
        </div>
      </div>

      {showPasswordChange ? (
        <form onSubmit={handlePasswordChangeSubmit} className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Perbarui Kata Sandi Pertama</h2>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Demi keamanan akun Anda, silakan masukkan password baru permanen untuk login selanjutnya.
          </p>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Password Baru</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="w-full px-3.5 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">Ulangi Password Baru</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Konfirmasi password"
              className="w-full px-3.5 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors"
          >
            {loading ? 'Menyimpan...' : 'Simpan Password & Masuk'}
          </button>
        </form>
      ) : (
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-4 shadow-xl backdrop-blur-sm">
          {/* Primary Google Login Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full py-2.5 px-4 rounded-xl bg-white text-neutral-900 font-semibold text-xs hover:bg-neutral-100 transition-all flex items-center justify-center gap-3 shadow-md border border-neutral-200"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{googleLoading ? 'Menghubungkan ke Google...' : 'Masuk dengan Akun Google'}</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-neutral-800"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase font-mono text-neutral-500 tracking-wider">Atau masuk dengan kredensial</span>
            <div className="flex-grow border-t border-neutral-800"></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Alamat Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-neutral-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@domain.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Kata Sandi</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-neutral-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-xl text-white focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <span>{loading ? 'Memverifikasi...' : 'Masuk dengan Email & Password'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Quick Access Testing Shortcuts */}
          <div className="pt-3 border-t border-neutral-800/80">
            <div className="text-[10px] font-mono text-neutral-500 text-center mb-2 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Akses Cepat Pengujian:</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDemoLogin('superadmin')}
                className="py-1.5 px-2 text-[10px] font-mono text-emerald-300 bg-neutral-950 border border-emerald-900/50 rounded-lg hover:border-emerald-700 transition-colors text-left truncate"
                title="Super Admin rizramadhan975@gmail.com"
              >
                👑 rizramadhan975 (Admin)
              </button>
              <button
                type="button"
                onClick={() => setDemoLogin('user')}
                className="py-1.5 px-2 text-[10px] font-mono text-neutral-300 bg-neutral-950 border border-neutral-800 rounded-lg hover:border-neutral-600 transition-colors text-left truncate"
              >
                👤 Demo User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
