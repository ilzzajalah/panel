import React from 'react';
import { 
  ArrowRight, 
  Terminal, 
  ShieldCheck, 
  Zap, 
  Cpu, 
  HardDrive, 
  Server, 
  QrCode, 
  Layers, 
  Globe2, 
  RefreshCw,
  GitBranch,
  ChevronDown
} from 'lucide-react';
import { PRESET_PLANS } from '@/packages/shared/constants';
import { DEFAULT_EGGS } from '@/packages/shared/eggs';

interface LandingPageProps {
  onSelectPlan: (planId: string) => void;
  onNavigateConfigure: () => void;
  onNavigateTrack: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSelectPlan,
  onNavigateConfigure,
  onNavigateTrack
}) => {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  const faqs = [
    {
      q: 'Bagaimana cara kerja pembayaran otomatis dengan BuatQris?',
      a: 'Anda tidak perlu registrasi atau login terlebih dahulu. Cukup pilih spesifikasi server yang diinginkan di konfigurator, lalu checkout. Sistem langsung membuat QRIS dinamis resmi melalui BuatQris Open API. Setelah scan & bayar lewat aplikasi m-banking atau e-wallet (BCA, Mandiri, GoPay, OVO, Dana, ShopeePay), webhook kami langsung memverifikasi pembayaran dalam hitungan detik dan otomatis membuat akun serta meluncurkan server Anda.'
    },
    {
      q: 'Apakah server benar-benar berjalan dan terisolasi?',
      a: 'Ya. Setiap server dijalankan dalam container Docker terisolasi dengan dedicated volume, CPU limit (NanoCPUs), memory swap prevention, ulimits, serta port mapping tersendiri. Anda memiliki akses penuh ke console realtime, file manager, dan dapat menjalankan script/bot Node.js, Python, atau server Minecraft kapan saja.'
    },
    {
      q: 'Bagaimana cara mengakses server setelah pembayaran berhasil?',
      a: 'Halaman sukses akan menampilkan kredensial akun Anda (email, temporary password yang aman, dan port server). Anda juga dapat langsung mengklik tombol "Masuk ke Panel" atau menggunakan menu Lacak Pesanan dengan memasukkan kode order dan alamat email Anda.'
    },
    {
      q: 'Apakah saya bisa memperpanjang atau upgrade spesifikasi server?',
      a: 'Tentu saja. Di dalam dashboard server terdapat tab Billing & Renewal. Anda bisa memperpanjang durasi (1, 3, 6, atau 12 bulan) dengan QRIS baru, atau meng-upgrade alokasi RAM/CPU/Disk secara otomatis tanpa menghapus data server Anda.'
    }
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 md:pt-28 md:pb-24 overflow-hidden border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>BuatQris Open API Automated Provisioning Engine</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
              Cloud Hosting Panel <br />
              <span className="text-neutral-400">Tanpa Antre, Siap Pakai.</span>
            </h1>

            <p className="text-lg text-neutral-400 leading-relaxed mb-8 max-w-2xl">
              Pilih spesifikasi yang Anda butuhkan, bayar via QRIS otomatis dalam hitungan detik, dan terima server container aktif lengkap dengan terminal realtime, file manager, serta isolasi sumber daya penuh.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={onNavigateConfigure}
                className="px-6 py-3 text-sm font-semibold text-black bg-white hover:bg-neutral-200 rounded-xl transition-all flex items-center gap-2 group shadow-lg"
              >
                <span>Konfigurasi Sendiri</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onNavigateTrack}
                className="px-6 py-3 text-sm font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl transition-colors"
              >
                Lacak Pesanan
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 pt-10 border-t border-neutral-900 text-neutral-400 text-xs font-mono">
            <div>
              <div className="text-xl sm:text-2xl font-bold text-white tabular-nums mb-1">{"< 15"} detik</div>
              <div>Rata-rata provisioning server</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-white tabular-nums mb-1">100% QRIS</div>
              <div>BuatQris real-time webhook</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-white tabular-nums mb-1">99.98%</div>
              <div>Tier 3 datacenter availability</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-white tabular-nums mb-1">0 KB</div>
              <div>Docker container shared leak</div>
            </div>
          </div>
        </div>
      </section>

      {/* Preset Ready-to-Deploy Plans */}
      <section className="py-20 border-b border-neutral-900 bg-neutral-950/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
            <div>
              <div className="text-xs font-mono uppercase text-neutral-500 tracking-wider mb-2">Pilihan Cepat</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Paket Server Siap Pakai</h2>
            </div>
            <p className="text-sm text-neutral-400 mt-2 md:mt-0 max-w-md">
              Ingin langsung mulai? Pilih paket rekomendasi kami di bawah atau gunakan konfigurator untuk kustomisasi tak terbatas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRESET_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`p-6 rounded-2xl border transition-all relative flex flex-col justify-between ${
                  plan.isPopular
                    ? 'border-white bg-neutral-900/90 shadow-2xl ring-1 ring-white/10'
                    : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700'
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3 right-6 px-3 py-0.5 text-[11px] font-semibold bg-white text-black rounded-full shadow-sm">
                    Paling Populer
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed mb-6 min-h-[36px]">{plan.description}</p>

                  <div className="space-y-3 py-4 border-y border-neutral-800 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">RAM Dedicated</span>
                      <span className="text-white font-semibold">{plan.ramMb >= 1024 ? `${plan.ramMb / 1024} GB` : `${plan.ramMb} MB`}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">CPU Allocation</span>
                      <span className="text-white font-semibold">{plan.cpuPercent}% Core</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">NVMe SSD Storage</span>
                      <span className="text-white font-semibold">{plan.diskGb} GB</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Backup Slot</span>
                      <span className="text-white font-semibold">{plan.backupSlots} Slot</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Port Tambahan</span>
                      <span className="text-white font-semibold">{plan.extraPorts} Port</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={() => onSelectPlan(plan.id)}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      plan.isPopular
                        ? 'bg-white text-black hover:bg-neutral-200'
                        : 'bg-neutral-800 text-white hover:bg-neutral-700'
                    }`}
                  >
                    Pilih Paket Ini
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="py-20 border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-xs font-mono uppercase text-neutral-500 tracking-wider mb-2">Fitur Unggulan</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Arsitektur Handal Mirip Pterodactyl Panel
            </h2>
            <p className="text-sm text-neutral-400 mt-3">
              Dibangun dari nol dengan standar produksi untuk developer, pemilik bot, dan pengelola game server.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bento Card 1: 2x1 */}
            <div className="md:col-span-2 p-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-white mb-6">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Automated QRIS via BuatQris Open API</h3>
                <p className="text-sm text-neutral-400 leading-relaxed max-w-xl">
                  Proses tanpa hambatan tanpa perlu mendaftar di awal. Sistem menghasilkan QRIS dinamis berstandar nasional dan menerima webhook real-time terenkripsi HMAC-SHA256. Begitu pembayaran terkonfirmasi, worker langsung meluncurkan container Anda secara otomatis.
                </p>
              </div>

              <div className="mt-8 p-4 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs text-neutral-400 flex items-center justify-between">
                <span>Webhook verify: HMAC-SHA256 timingSafeEqual</span>
                <span className="text-emerald-400 font-semibold">Active & Idempotent</span>
              </div>
            </div>

            {/* Bento Card 2: 1x1 */}
            <div className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-white mb-6">
                  <Terminal className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Realtime ANSI Console</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Stream stdout/stderr container secara langsung dengan warna ANSI. Kirim input perintah ke stdin, jalankan perintah cepat, dan monitor CPU/RAM interaktif.
                </p>
              </div>
              <div className="mt-6 text-xs font-mono text-neutral-500">
                Auto-reconnect · Crash detection
              </div>
            </div>

            {/* Bento Card 3: 1x1 */}
            <div className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-white mb-6">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Volume & File Manager</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Editor kode bawaan, upload file langsung, clone repository Git dari URL, serta ekstraksi arsip ZIP dengan proteksi Zip-Slip yang ketat.
                </p>
              </div>
              <div className="mt-6 text-xs font-mono text-neutral-500">
                Monaco Editor · Git Clone · ZIP Extract
              </div>
            </div>

            {/* Bento Card 4: 1x1 */}
            <div className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-white mb-6">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Isolasi Docker & Anti-Abuse</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Non-privileged container, drop seluruh root capabilities berbahaya, batas thread fork-bomb (PidsLimit), dan kuota disk terisolasi.
                </p>
              </div>
              <div className="mt-6 text-xs font-mono text-neutral-500">
                Drop ALL caps · PidsLimit 512
              </div>
            </div>

            {/* Bento Card 5: 1x1 */}
            <div className="p-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center text-white mb-6">
                  <Globe2 className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">9router & Custom Domain</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  Dukungan integrasi 9router dan Caddy reverse proxy untuk memetakan domain kustom dan menerbitkan sertifikat SSL otomatis.
                </p>
              </div>
              <div className="mt-6 text-xs font-mono text-neutral-500">
                Auto SSL · HTTP/HTTPS Reverse Proxy
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Egg Runtimes Showcase */}
      <section className="py-20 border-b border-neutral-900 bg-neutral-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="text-xs font-mono uppercase text-neutral-500 tracking-wider mb-2">Template & Egg</div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Dukungan Berbagai Ekosistem</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {DEFAULT_EGGS.map(egg => (
              <div key={egg.id} className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/20 hover:border-neutral-700 transition-colors">
                <div className="text-xs font-mono text-neutral-500 mb-1">{egg.category}</div>
                <div className="font-semibold text-white text-sm mb-1">{egg.name}</div>
                <div className="text-[11px] text-neutral-400 line-clamp-2">{egg.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Pertanyaan yang Sering Diajukan</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div 
                key={idx} 
                className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between text-sm font-semibold text-white focus:outline-none"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-5 text-xs text-neutral-400 leading-relaxed border-t border-neutral-800/60 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <button
              onClick={onNavigateConfigure}
              className="px-6 py-3 text-sm font-semibold text-black bg-white hover:bg-neutral-200 rounded-xl transition-all inline-flex items-center gap-2"
            >
              <span>Mulai Konfigurasi Server Anda</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
