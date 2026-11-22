#!/bin/bash
# ==============================================================
# AETHERPANEL - MASTER 24/7 VPS AUTO-DEPLOYMENT SCRIPT
# OS Target: Ubuntu 22.04 / 24.04 LTS
# ==============================================================
set -e

echo "=========================================================="
echo "  MEMULAI INSTALASI 24/7 PRODUCTION AETHERPANEL PADA VPS"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Harap jalankan script ini sebagai root atau dengan sudo: sudo bash $0"
  exit 1
fi

DOMAIN="${1:-}"
EMAIL="${2:-admin@aetherpanel.com}"
APP_DIR="/var/www/aetherpanel"

# 1. UPDATE SISTEM & INSTALL CORE PACKAGES
echo "[1/7] Memperbarui sistem dan menginstall paket dasar..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl wget git unzip ufw fail2ban unattended-upgrades nginx certbot python3-certbot-nginx build-essential

# 2. INSTALL NODE.JS 20 LTS JIKA BELUM ADA
if ! command -v node >/dev/null 2>&1; then
    echo "[2/7] Menginstall Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js Version: $(node -v) | NPM Version: $(npm -v)"

# 3. SETUP DIREKTORI & SALIN BERKAS
echo "[3/7] Menyiapkan direktori aplikasi di ${APP_DIR}..."
mkdir -p "$APP_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Salin seluruh repositori ke /var/www/aetherpanel
cp -ru "$SCRIPT_DIR"/* "$APP_DIR/" 2>/dev/null || true
cd "$APP_DIR"

# Install dependensi npm & build
echo "Menginstall dependensi npm..."
npm install --omit=dev || npm install
npm run build || true

# 4. SETUP SYSTEMD SERVICE (24/7 AUTO-RESTART)
echo "[4/7] Memasang systemd service aetherpanel..."
cp "$APP_DIR/systemd/aetherpanel.service" /etc/systemd/system/aetherpanel.service
systemctl daemon-reload
systemctl enable aetherpanel
systemctl restart aetherpanel

# 5. SETUP CRON BACKUP & MONITORING
echo "[5/7] Mengonfigurasi cron job backup dan monitoring..."
chmod +x "$APP_DIR/scripts/backup.sh" "$APP_DIR/scripts/monitor.sh"

# Pasang cron job harian backup (jam 02:00) dan monitor tiap 5 menit
(crontab -l 2>/dev/null | grep -v "aetherpanel"; echo "0 2 * * * /bin/bash ${APP_DIR}/scripts/backup.sh >> /var/log/aether_backup.log 2>&1"; echo "*/5 * * * * /bin/bash ${APP_DIR}/scripts/monitor.sh >/dev/null 2>&1") | crontab -

# 6. SETUP FIREWALL UFW & FAIL2BAN
echo "[6/7] Mengaktifkan proteksi keamanan UFW & Fail2ban..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 8000:9999/tcp comment 'AetherPanel Container Ports'
ufw --force enable

systemctl enable fail2ban
systemctl restart fail2ban

# 7. KONFIGURASI NGINX & REVERSE PROXY
echo "[7/7] Menyiapkan reverse proxy Nginx..."
if [ -n "$DOMAIN" ]; then
    cat <<EOF > "/etc/nginx/sites-available/aetherpanel"
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF
    ln -sf "/etc/nginx/sites-available/aetherpanel" "/etc/nginx/sites-enabled/"
    nginx -t && systemctl reload nginx

    # Terbitkan SSL Let's Encrypt jika ada domain
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect || true
fi

echo "=========================================================="
echo "✅ INSTALASI SELESAI! AETHERPANEL BERJALAN 24/7 NONSTOP"
echo "=========================================================="
echo "Status Service: systemctl status aetherpanel"
echo "Lokasi Data:    ${APP_DIR}/data"
echo "Lokasi Backup:  /var/backups/aetherpanel"
echo "=========================================================="
