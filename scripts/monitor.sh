#!/bin/bash
# ==============================================================
# AETHERPANEL 24/7 MONITORING & NOTIFICATION DAEMON
# ==============================================================
# Mendukung notifikasi ke Telegram Bot dan Discord Webhook

# ----------------- KONFIGURASI NOTIFIKASI -----------------
# 1. Telegram (Opsional: Kosongkan jika tidak dipakai)
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# 2. Discord Webhook (Opsional: Kosongkan jika tidak dipakai)
DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"

# Ambang Batas Peringatan (Persen)
CPU_LIMIT=85
RAM_LIMIT=90
DISK_LIMIT=85
SERVICE_NAME="aetherpanel"
HOSTNAME=$(hostname)

send_alert() {
    local title="$1"
    local message="$2"
    local timestamp=$(date +"%Y-%m-%d %H:%M:%S")

    # Kirim ke Telegram jika token terisi
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d chat_id="${TELEGRAM_CHAT_ID}" \
            -d text="🚨 <b>[${title}]</b>%0AServer: <code>${HOSTNAME}</code>%0AWaktu: ${timestamp}%0A%0A${message}" \
            -d parse_mode="HTML" > /dev/null 2>&1
    fi

    # Kirim ke Discord jika webhook terisi
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        local payload=$(cat <<EOF
{
  "embeds": [{
    "title": "🚨 ${title} - ${HOSTNAME}",
    "description": "${message}",
    "color": 15158332,
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }]
}
EOF
)
        curl -s -H "Content-Type: application/json" -X POST -d "$payload" "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1
    fi
}

# 1. CEK STATUS SERVICE AETHERPANEL
if command -v systemctl >/dev/null 2>&1; then
    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        send_alert "CRITICAL: Service Down" "Service ${SERVICE_NAME} mati di ${HOSTNAME}! Systemd sedang berupaya auto-restart..."
    fi
fi

# 2. CEK CPU USAGE
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print int(100 - $8)}')
if [ "$CPU_USAGE" -gt "$CPU_LIMIT" ]; then
    send_alert "WARNING: CPU Usage Tinggi" "Penggunaan CPU saat ini mencapai ${CPU_USAGE}% (Batas aman: ${CPU_LIMIT}%)"
fi

# 3. CEK RAM USAGE
RAM_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
if [ "$RAM_USAGE" -gt "$RAM_LIMIT" ]; then
    send_alert "WARNING: RAM Menipis" "Penggunaan RAM saat ini mencapai ${RAM_USAGE}% (Batas aman: ${RAM_LIMIT}%)"
fi

# 4. CEK DISK STORAGE (PARTISI ROOT /)
DISK_USAGE=$(df -h / | awk 'NR==2 {print int($5)}')
if [ "$DISK_USAGE" -gt "$DISK_LIMIT" ]; then
    send_alert "CRITICAL: Disk Storage Kritis" "Ruang penyimpanan disk utama mencapai ${DISK_USAGE}% (Batas: ${DISK_LIMIT}%)"
fi
