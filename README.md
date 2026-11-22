# AetherPanel - Automated Cloud Hosting Panel (Pterodactyl-Style)

AetherPanel adalah platform hosting server mandiri modern berbasis Docker container dengan integrasi pembayaran **QRIS Otomatis** melalui **BuatQris Open API** (https://api.buatqris.site).

Pengunjung dapat memilih konfigurasi resource (RAM, CPU, NVMe Disk, Durasi, Port), membayar melalui QRIS langsung tanpa perlu login di awal, lalu sistem worker secara instan memverifikasi webhook dan mem-provisioning container Docker terisolasi lengkap dengan kredensial login sementara.

---

## Fitur Utama

- **Monochrome Bento Grid Design**: Estetika minimalis hitam putih, tipografi proporsional, tabular numbers, tanpa elemen dekoratif berlebih.
- **BuatQris Open API Integration**:
  - Request `action=api_create_qris` resmi
  - Verifikasi signature webhook HMAC-SHA256 (`sha256=<hex>`) menggunakan `crypto.timingSafeEqual`
  - Idempotency guard (mencegah duplikasi pembuatan server dari replay webhook)
  - Validasi nominal `total_amount` ketat (termasuk kode unik)
  - Fallback pengecekan manual `action=api_check_status` dengan rate-limiting ketat 1 cek per 20 detik
  - Mode **Mock** & **Sandbox** untuk pengujian lokal instan dengan 1 tombol simulasi
- **Hosting Nyata & Terisolasi**:
  - Setiap server berjalan dalam 1 container Docker terisolasi
  - Limit RAM (Memory & MemorySwap = Memory)
  - Limit CPU (NanoCpus & CpuQuota)
  - Batas thread `PidsLimit: 512` (mencegah fork-bomb)
  - Drop semua capabilities berbahaya (`CapDrop: ALL`)
  - Volume data terisolasi di `/var/lib/panel/servers/<uuid>` (di-mount ke `/home/container`)
- **Console Realtime (xterm style)**:
  - Streaming stdout & stderr dengan warna ANSI via SSE / WebSocket
  - Interactive STDIN command bar dengan command history (Up/Down arrow)
  - Tombol Power: Start, Stop (SIGINT), Restart, Force Kill (SIGKILL)
  - Auto-restart saat crash
  - Quick command dropdown (`npm install`, `node -v`, `ps aux`, `df -h`)
- **File Manager**:
  - Monaco-style in-app code editor dengan line numbers dan save shortcut (`Ctrl+S`)
  - Upload file (drag & drop)
  - Ekstraksi arsip ZIP dengan proteksi Zip-Slip traversal
  - Git Clone langsung dari URL repository ke volume server
  - Kompresi folder ke ZIP
  - Download & hapus file
- **Fitur Lengkap Server**:
  - Startup Command & Environment Variables editor
  - Backup & Restore otomatis (dengan slot limit)
  - Alokasi Port & Subdomain 9router (Auto SSL reverse proxy)
  - Database terkelola (MySQL / PostgreSQL / SQLite)
  - Kolaborator Sub-User dengan izin granular
  - Perpanjangan masa aktif (Renew) & Upgrade spesifikasi via QRIS baru
- **Admin Panel**:
  - Ringkasan pendapatan, server aktif, order list
  - Manual approve, retry provisioning, suspend/unsuspend server
  - Konfigurasi BuatQris (Account ID, Secret Token, Signing Secret, Test koneksi, salin Webhook URL)
  - Pengaturan 9router Edge
  - Audit & Security activity log

---

## 1. Instalasi di VPS Linux dengan Docker Compose

### Persyaratan VPS
- OS: Ubuntu 22.04 LTS / Debian 12
- RAM: Minimal 2 GB (Rekomendasi 4 GB+)
- Docker Engine & Docker Compose v2+
- Port terbuka di firewall: `80`, `443`, `3000`, `8080`, dan rentang port game/server (misal `25565`, `8000-9000`)

### Langkah Instalasi

1. Clone repositori ini ke VPS:
```bash
git clone https://github.com/yourusername/aetherpanel.git /opt/aetherpanel
cd /opt/aetherpanel
```

2. Konfigurasi Environment:
```bash
cp .env.example .env
nano .env
```
Isi variabel berikut:
```env
APP_URL="https://panel.domainanda.com"
BUATQRIS_ACCOUNT_ID="ACC-XXXX-XXXX"
BUATQRIS_SECRET_TOKEN="sec_tok_xxxx"
BUATQRIS_SIGNING_SECRET="sign_sec_xxxx"
BUATQRIS_MODE="live" # atau 'sandbox' untuk pengujian
DAEMON_TOKEN="buat_token_acak_panjang"
```

3. Jalankan dengan Docker Compose:
```bash
docker compose up -d --build
```

4. Periksa container yang berjalan:
```bash
docker compose ps
```
Layanan berikut akan aktif:
- `aether_web`: Port 3000 (Panel Web & REST API)
- `aether_daemon`: Port 8080 (Agent Docker node)
- `aether_postgres`: Port 5432 (Database PostgreSQL)
- `aether_redis`: Port 6379 (Queue & State)

---

## 2. Pengaturan Webhook BuatQris Open API

Agar pembayaran QRIS otomatis memicu aktivasi server:

1. Buka Dasbor BuatQris: [https://buatqris.site](https://buatqris.site)
2. Masuk ke menu **Open API** → **Webhook / Callback**
3. Masukkan URL Webhook Anda:
   ```
   https://panel.domainanda.com/api/webhooks/buatqris
   ```
4. Salin nilai **Signing Secret** yang tertera di dasbor BuatQris ke dalam file `.env` sebagai `BUATQRIS_SIGNING_SECRET` (atau simpan melalui menu **Admin → Payment** di AetherPanel).
5. Klik **Simpan** di dasbor BuatQris.

---

## 3. Akun Bawaan (Default Login)

Pada instalasi awal, akun berikut telah dibuat:

- **Administrator**:
  - Email: `admin@aetherpanel.com`
  - Password: `admin123`
- **Demo User**:
  - Email: `user@example.com`
  - Password: `user123`

*Catatan: Ganti password default ini segera setelah login pertama melalui menu pengaturan profil.*

---

## 4. Pengujian Lokal & Sandbox Mode

AetherPanel menyediakan 2 opsi pengujian tanpa uang asli:

1. **Mode Mock (Default di Development)**:
   - Tidak memanggil internet ke BuatQris.
   - Menghasilkan QR code sungguhan yang valid di layar.
   - Menyediakan tombol **"Simulasikan Bayar Berhasil"** di halaman checkout.
   - Memproses logika verifikasi signature HMAC-SHA256 internal yang identik dan otomatis mem-provisioning server dalam hitungan detik.

2. **Mode Sandbox**:
   - Menghubungkan langsung ke endpoint `https://api.buatqris.site` dengan parameter `test=1`.
   - Transaksi terdaftar di dasbor BuatQris mode sandbox.

---

## 5. Menjalankan Unit & Security Test

Untuk memverifikasi keabsahan rumus harga, verifikasi HMAC, idempotensi, dan anti Zip-Slip:

```bash
npx tsx tests/verify.test.ts
```

Output:
```
--- RUNNING AETHERPANEL AUTOMATED TEST SUITE ---
[PASS] RAM 1GB priced at Rp 10.000
[PASS] CPU 100% priced at Rp 8.000
[PASS] Disk 10GB priced at Rp 4.000
[PASS] Total payable exceeds minimum amount
[PASS] 12-Month duration grants 15% discount
[PASS] Discount amount applied correctly
[PASS] HMAC-SHA256 signature verification succeeds for authentic payload
[PASS] HMAC-SHA256 signature verification rejects tampered payload
[PASS] HMAC-SHA256 signature verification rejects invalid hash
[PASS] Initially not processed
[PASS] Successfully marked processed
[PASS] Idempotency detects duplicate transaction
[PASS] Directory traversal path escape is strictly blocked

ALL 13/13 TESTS PASSED SUCCESSFULLY!
```

---

## 6. Troubleshooting

- **Server tidak mau Start**: Pastikan port primer yang dialokasikan tidak sedang dipakai oleh proses lain di host.
- **Webhook Error 401**: Pastikan `BUATQRIS_SIGNING_SECRET` di `.env` persis sama dengan yang tertera di dasbor BuatQris.
- **Rate Limit Check Status (HTTP 429)**: BuatQris membatasi cek manual maksimal 1 kali per 20 detik per transaksi. Gunakan webhook sebagai saluran utama.
- **Node offline**: Pastikan `DAEMON_TOKEN` di file `.env` panel sama persis dengan yang dikonfigurasi di node agent.
