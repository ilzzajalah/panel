#!/bin/bash
# ==============================================================
# AETHERPANEL 24/7 AUTOMATED BACKUP & ANTI-LOSS ENGINE
# ==============================================================
# Cara Restore 1 Langkah:
# sudo tar -xzf /var/backups/aetherpanel/aether_backup_TIMESTAMP.tar.gz -C /var/www/aetherpanel/ && sudo systemctl restart aetherpanel

SOURCE_DIR="${AETHER_DIR:-/var/www/aetherpanel}"
BACKUP_DIR="${AETHER_BACKUP_DIR:-/var/backups/aetherpanel}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/aether_backup_${TIMESTAMP}.tar.gz"

if [ ! -d "$SOURCE_DIR" ]; then
    # Fallback jika dijalankan langsung di direktori repo
    SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# Fallback direktori backup jika /var/backups tidak dapat diakses
if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
    BACKUP_DIR="${SOURCE_DIR}/data/backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="${BACKUP_DIR}/aether_backup_${TIMESTAMP}.tar.gz"
fi

echo "[$(date)] Memulai proses backup data AetherPanel dari ${SOURCE_DIR}..."

# Kumpulkan folder/file yang ada untuk di-backup
ITEMS_TO_BACKUP=()
for item in data packages prisma .env .env.example server.ts; do
    if [ -e "${SOURCE_DIR}/${item}" ]; then
        ITEMS_TO_BACKUP+=("${item}")
    fi
done

# Mengarsipkan data server, database persistent, dan konfigurasi
tar -czf "$BACKUP_FILE" \
    --exclude="data/servers/*/node_modules" \
    --exclude="data/servers/*/.cache" \
    -C "$SOURCE_DIR" "${ITEMS_TO_BACKUP[@]}"

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup sukses dibuat: ${BACKUP_FILE} (Ukuran: ${SIZE})"
    cp "$BACKUP_FILE" "${BACKUP_DIR}/aether_backup_latest.tar.gz" 2>/dev/null || true
else
    echo "[$(date)] ERROR: Gagal membuat file arsip backup!"
    exit 1
fi

# Rotasi pembersihan: Hapus backup yang berusia lebih dari 7 hari (Retensi 7 Hari)
find "$BACKUP_DIR" -type f -name "aether_backup_*.tar.gz" -mtime +7 -delete

echo "[$(date)] Selesai. Data aman terlindungi 24/7."
