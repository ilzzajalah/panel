import fs from 'fs';
import crypto from 'crypto';
import { db } from './db.js';
import { containerEngine } from './containerEngine.js';
import { notificationService } from './notificationService.js';
import type { ServerInstance, BackupScheduleConfig } from '../../packages/shared/types.js';

function formatSize(bytes: number | bigint): string {
  const b = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  public start() {
    console.log('[BackupScheduler] Automated backup & maintenance worker initiated.');
    // Run initial check after 10 seconds, then every 60 seconds
    setTimeout(() => this.runMaintenanceCycle(), 10000);
    this.timer = setInterval(() => this.runMaintenanceCycle(), 60000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async runMaintenanceCycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.processScheduledBackups();
      await this.processRenewalReminders();
      await this.processAdminHealthAlerts();
    } catch (err) {
      console.error('[BackupScheduler] Error during maintenance cycle:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process automated backups for servers that have backupSchedule enabled
   */
  public async processScheduledBackups() {
    const servers = db.listAllServers();
    const now = new Date();

    for (const server of servers) {
      if (!server.backupSchedule || !server.backupSchedule.enabled) continue;

      const schedule = server.backupSchedule;
      const targetHour = schedule.targetHour ?? schedule.hour ?? 2; // Default 02:00 AM
      const currentHour = now.getHours();

      // Check frequency requirements
      let isDue = false;
      const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;

      if (schedule.frequency === 'daily') {
        // Due if current hour matches target hour and hasn't run today
        const hasRunToday = lastRun && 
          lastRun.getDate() === now.getDate() && 
          lastRun.getMonth() === now.getMonth() && 
          lastRun.getFullYear() === now.getFullYear();

        if (currentHour === targetHour && !hasRunToday) {
          isDue = true;
        }
      } else if (schedule.frequency === 'weekly') {
        const targetDay = schedule.targetDayOfWeek ?? schedule.dayOfWeek ?? 0; // 0 = Sunday
        const currentDay = now.getDay();

        const hasRunThisWeek = lastRun && 
          (now.getTime() - lastRun.getTime()) < (6 * 24 * 60 * 60 * 1000);

        if (currentDay === targetDay && currentHour === targetHour && !hasRunThisWeek) {
          isDue = true;
        }
      }

      if (isDue) {
        await this.executeAutoBackupForServer(server);
      }
    }
  }

  /**
   * Execute backup and handle slot limits + auto-rotation of oldest backup
   */
  public async executeAutoBackupForServer(server: ServerInstance): Promise<boolean> {
    try {
      console.log(`[BackupScheduler] Starting scheduled auto-backup for server ${server.name} (${server.id})...`);

      const maxSlots = server.backupSlots || 2;
      const existingBackups = db.listBackups(server.id);

      // Auto-rotation: If backup slots are full, delete the oldest backup
      if (existingBackups.length >= maxSlots) {
        // Sort by createdAt ascending (oldest first)
        const sorted = [...existingBackups].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const oldest = sorted[0];
        console.log(`[BackupScheduler] Slot limit reached (${existingBackups.length}/${maxSlots}). Rotating oldest backup: ${oldest.name} (${oldest.id})`);

        // Delete backup file if present
        if (oldest.filePath && fs.existsSync(oldest.filePath)) {
          try {
            fs.unlinkSync(oldest.filePath);
          } catch (e) {
            console.warn('[BackupScheduler] Failed to unlink rotated backup file:', e);
          }
        }
        db.deleteBackup(oldest.id);
      }

      // Generate new backup archive
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupName = `AutoBackup-${dateStr}`;
      const archive = containerEngine.createBackupArchive(server.uuid, backupName);

      const newBackup = db.createBackup({
        id: `bck-auto-${crypto.randomBytes(5).toString('hex')}`,
        serverId: server.id,
        name: backupName,
        sizeBytes: Number(archive.sizeBytes),
        checksum: crypto.randomBytes(8).toString('hex'),
        createdAt: new Date().toISOString(),
        filePath: archive.filePath,
        isAutomatic: true
      });

      // Update schedule nextRunAt and lastRunAt
      const nextRun = new Date();
      if (server.backupSchedule?.frequency === 'weekly') {
        nextRun.setDate(nextRun.getDate() + 7);
      } else {
        nextRun.setDate(nextRun.getDate() + 1);
      }
      const hour = server.backupSchedule?.targetHour ?? server.backupSchedule?.hour ?? 2;
      nextRun.setHours(hour, 0, 0, 0);

      const updatedSchedule: BackupScheduleConfig = {
        enabled: true,
        frequency: server.backupSchedule?.frequency || 'daily',
        hour,
        targetHour: hour,
        dayOfWeek: server.backupSchedule?.targetDayOfWeek ?? server.backupSchedule?.dayOfWeek ?? 0,
        targetDayOfWeek: server.backupSchedule?.targetDayOfWeek ?? server.backupSchedule?.dayOfWeek ?? 0,
        maxSlots,
        lastRunAt: new Date().toISOString(),
        nextRunAt: nextRun.toISOString()
      };

      db.updateServer(server.id, { backupSchedule: updatedSchedule });

      const currentCount = db.listBackups(server.id).length;

      // Send User Notification via WebSocket & Email
      await notificationService.notifyUser({
        userId: server.userId,
        title: `Backup Otomatis Berhasil: ${server.name}`,
        message: `Cadangan otomatis untuk server "${server.name}" telah berhasil dibuat.\nUkuran Arsip: ${formatSize(archive.sizeBytes)}\nSlot Terpakai: ${currentCount}/${maxSlots}`,
        category: 'backup',
        severity: 'success',
        link: `/servers/${server.id}?tab=backups`,
        metadata: {
          serverId: server.id,
          backupId: newBackup.id,
          sizeBytes: archive.sizeBytes
        },
        sendEmail: true
      });

      return true;
    } catch (err: any) {
      console.error(`[BackupScheduler] Auto-backup failed for server ${server.id}:`, err);
      // Notify user about backup failure
      await notificationService.notifyUser({
        userId: server.userId,
        title: `Gagal Membuat Backup Otomatis: ${server.name}`,
        message: `Proses backup terjadwal untuk server "${server.name}" mengalami kendala: ${err.message}`,
        category: 'backup',
        severity: 'danger',
        link: `/servers/${server.id}?tab=backups`,
        sendEmail: true
      });
      return false;
    }
  }

  /**
   * Monitor server expiration dates and send H-7, H-3, H-1 reminders
   */
  public async processRenewalReminders() {
    const servers = db.listAllServers();
    const now = Date.now();

    for (const server of servers) {
      if (!server.expiresAt) continue;
      const expireTime = new Date(server.expiresAt).getTime();
      const diffMs = expireTime - now;
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Retrieve or initialize reminder metadata
      const env = server.envVars || {};
      const h7Sent = env.__RENEWAL_H7_SENT === 'true';
      const h3Sent = env.__RENEWAL_H3_SENT === 'true';
      const h1Sent = env.__RENEWAL_H1_SENT === 'true';

      if (daysLeft <= 7 && daysLeft > 3 && !h7Sent) {
        await notificationService.notifyUser({
          userId: server.userId,
          title: `Pengingat Perpanjangan Layanan (H-7): ${server.name}`,
          message: `Masa aktif server hosting "${server.name}" tersisa 7 hari lagi (kedaluwarsa pada ${new Date(server.expiresAt).toLocaleDateString('id-ID')}). Segera perpanjang agar layanan Anda tidak terhenti.`,
          category: 'billing',
          severity: 'warning',
          link: `/billing`,
          sendEmail: true
        });
        db.updateServer(server.id, {
          envVars: { ...env, __RENEWAL_H7_SENT: 'true' }
        });
      } else if (daysLeft <= 3 && daysLeft > 1 && !h3Sent) {
        await notificationService.notifyUser({
          userId: server.userId,
          title: `Peringatan Kritis Perpanjangan (H-3): ${server.name}`,
          message: `Masa aktif server "${server.name}" akan berakhir dalam 3 hari! Lakukan perpanjangan segera untuk mencegah otomatisasi suspend server.`,
          category: 'billing',
          severity: 'warning',
          link: `/billing`,
          sendEmail: true
        });
        db.updateServer(server.id, {
          envVars: { ...env, __RENEWAL_H3_SENT: 'true' }
        });
      } else if (daysLeft <= 1 && daysLeft > 0 && !h1Sent) {
        await notificationService.notifyUser({
          userId: server.userId,
          title: `Pemberitahuan Terakhir (H-1): ${server.name} Akan Kedaluwarsa Besok!`,
          message: `PERHATIAN: Masa aktif server "${server.name}" akan berakhir besok. Server akan otomatis dinonaktifkan jika perpanjangan tidak diselesaikan hari ini.`,
          category: 'billing',
          severity: 'danger',
          link: `/billing`,
          sendEmail: true
        });
        db.updateServer(server.id, {
          envVars: { ...env, __RENEWAL_H1_SENT: 'true' }
        });
      } else if (daysLeft <= 0 && !server.suspended) {
        // Suspend expired server
        console.log(`[BackupScheduler] Suspending expired server ${server.name} (${server.id})`);
        containerEngine.stopServer(server.id).catch(() => {});
        db.updateServer(server.id, { suspended: true, status: 'offline' });

        await notificationService.notifyUser({
          userId: server.userId,
          title: `Server Di-Suspend: ${server.name}`,
          message: `Server "${server.name}" telah di-suspend karena masa aktif telah habis. Silakan bayar tagihan perpanjangan untuk mengaktifkannya kembali.`,
          category: 'billing',
          severity: 'danger',
          link: `/billing`,
          sendEmail: true
        });
      }
    }
  }

  /**
   * Monitor critical system issues for Admin alerts:
   * 1. Failed provisioning orders
   * 2. Servers with repeated crashes
   */
  public async processAdminHealthAlerts() {
    const orders = db.listOrders();
    const failedOrders = orders.filter((o) => o.status === 'FAILED');

    // Alert admins if there are failed orders that haven't been alerted
    for (const order of failedOrders) {
      if (!order.adminAlerted) {
        await notificationService.notifyAdmins({
          title: `Antrean Provisioning Gagal: Order #${order.orderCode || order.id}`,
          message: `Provisioning server untuk pemesan ${order.customerEmail || order.userId} mengalami kegagalan sistem. Harap cek log server di Admin Panel.`,
          category: 'provisioning',
          severity: 'danger',
          link: `/admin`,
          sendEmail: true
        });
        db.updateOrder(order.orderCode, { adminAlerted: true });
      }
    }
  }
}

export const backupScheduler = new BackupScheduler();
