import React, { useState, useEffect } from 'react';
import { 
  HardDrive, 
  RotateCw, 
  Download, 
  Trash2, 
  Play, 
  Clock, 
  Calendar, 
  ShieldCheck, 
  AlertTriangle, 
  Plus, 
  Check, 
  Loader2,
  Settings,
  Sparkles
} from 'lucide-react';
import type { ServerBackup, BackupScheduleConfig } from '../../packages/shared/types';
import { apiRequest } from '../lib/api';

interface ServerBackupsTabProps {
  serverId: string;
  serverName: string;
  backupSlots: number;
}

export const ServerBackupsTab: React.FC<ServerBackupsTabProps> = ({
  serverId,
  serverName,
  backupSlots = 2
}) => {
  const [backups, setBackups] = useState<ServerBackup[]>([]);
  const [slotsUsed, setSlotsUsed] = useState(0);
  const [maxSlots, setMaxSlots] = useState(backupSlots);
  const [schedule, setSchedule] = useState<BackupScheduleConfig>({
    enabled: false,
    frequency: 'daily',
    hour: 2,
    targetHour: 2,
    dayOfWeek: 0,
    targetDayOfWeek: 0,
    maxSlots: backupSlots
  });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [customBackupName, setCustomBackupName] = useState('');
  const [restoreModal, setRestoreModal] = useState<ServerBackup | null>(null);
  const [deleteModal, setDeleteModal] = useState<ServerBackup | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadBackupData = async () => {
    try {
      const res = await apiRequest<{
        success: boolean;
        backups: ServerBackup[];
        slotsUsed: number;
        maxSlots: number;
        schedule: BackupScheduleConfig;
      }>(`/api/servers/${serverId}/backups`);

      if (res.success) {
        setBackups(res.backups || []);
        setSlotsUsed(res.slotsUsed ?? (res.backups ? res.backups.length : 0));
        setMaxSlots(res.maxSlots || backupSlots);
        if (res.schedule) {
          setSchedule(res.schedule);
        }
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Gagal memuat data backup' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackupData();
  }, [serverId]);

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    setScheduleSuccess(false);
    try {
      const res = await apiRequest<{ success: boolean; schedule: BackupScheduleConfig }>(
        `/api/servers/${serverId}/backup-schedule`,
        {
          method: 'PUT',
          body: JSON.stringify(schedule)
        }
      );
      if (res.success && res.schedule) {
        setSchedule(res.schedule);
        setScheduleSuccess(true);
        setTimeout(() => setScheduleSuccess(false), 3000);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Gagal menyimpan jadwal backup' });
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleCreateBackup = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const name = customBackupName.trim() || `ManualBackup_${new Date().toISOString().slice(0, 10)}`;
      await apiRequest(`/api/servers/${serverId}/backups`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      setCreateModal(false);
      setCustomBackupName('');
      setFeedback({ type: 'success', message: `Cadangan "${name}" berhasil dibuat!` });
      await loadBackupData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Gagal membuat backup' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreModal) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        `/api/servers/${serverId}/backups/${restoreModal.id}/restore`,
        { method: 'POST' }
      );
      setRestoreModal(null);
      setFeedback({ type: 'success', message: res.message || 'Server berhasil dipulihkan dari cadangan!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Gagal merestore backup' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBackup = async () => {
    if (!deleteModal) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await apiRequest(`/api/servers/${serverId}/backups/${deleteModal.id}`, {
        method: 'DELETE'
      });
      setDeleteModal(null);
      setFeedback({ type: 'success', message: 'Cadangan berhasil dihapus.' });
      await loadBackupData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Gagal menghapus backup' });
    } finally {
      setActionLoading(false);
    }
  };

  const formatBytes = (bytes: number | bigint): string => {
    const b = typeof bytes === 'bigint' ? Number(bytes) : bytes;
    if (!b || b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const usagePercent = Math.min(100, Math.round((slotsUsed / (maxSlots || 1)) * 100));

  return (
    <div className="space-y-6">
      {/* Feedback Alert */}
      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between ${
          feedback.type === 'success' 
            ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-950/60 border border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Top Banner: Slots Usage & Action Button */}
      <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-md">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">Cadangan Server & Pemulihan</h2>
          </div>
          <p className="text-xs text-neutral-400">
            Cadangkan volume server Anda secara berkala. Anda dapat mengembalikan (restore) data kapan saja atau mengunduh arsip ZIP langsung ke komputer Anda.
          </p>

          {/* Slot Progress Bar */}
          <div className="pt-2">
            <div className="flex justify-between text-xs font-mono mb-1.5">
              <span className="text-neutral-400">Penggunaan Kuota Slot:</span>
              <span className={`font-bold ${slotsUsed >= maxSlots ? 'text-amber-400' : 'text-cyan-400'}`}>
                {slotsUsed} / {maxSlots} Slot Terpakai
              </span>
            </div>
            <div className="w-full h-2 bg-neutral-950 border border-neutral-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  slotsUsed >= maxSlots ? 'bg-amber-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={() => {
              setCustomBackupName(`Backup_${serverName.replace(/[^a-zA-Z0-9_-]/g, '')}_${new Date().toISOString().slice(0, 10)}`);
              setCreateModal(true);
            }}
            disabled={slotsUsed >= maxSlots || actionLoading}
            className="px-4 py-2.5 text-xs font-semibold bg-white hover:bg-neutral-200 text-black rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Cadangan Manual</span>
          </button>
        </div>
      </div>

      {/* Automated Backup Schedule Card */}
      <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Jadwal Backup Otomatis & Rotasi Slot</h3>
              <p className="text-xs text-neutral-400">
                Sistem akan membuat arsip otomatis dan merotasi cadangan tertua saat slot penuh.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox"
              checked={schedule.enabled}
              onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
          </label>
        </div>

        {schedule.enabled && (
          <div className="pt-4 border-t border-neutral-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Frekuensi Jadwal</label>
              <select
                value={schedule.frequency}
                onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value as any })}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="daily">Setiap Hari (Harian)</option>
                <option value="weekly">Setiap Minggu (Mingguan)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">Jam Eksekusi (WIB / Server Time)</label>
              <select
                value={schedule.targetHour ?? schedule.hour ?? 2}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setSchedule(prev => ({ ...prev, hour: val, targetHour: val }));
                }}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {Array.from({ length: 24 }).map((_, hour) => (
                  <option key={hour} value={hour}>
                    {hour.toString().padStart(2, '0')}:00 WIB
                  </option>
                ))}
              </select>
            </div>

            {schedule.frequency === 'weekly' && (
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Hari Eksekusi</label>
                <select
                  value={schedule.targetDayOfWeek ?? schedule.dayOfWeek ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setSchedule(prev => ({ ...prev, dayOfWeek: val, targetDayOfWeek: val }));
                  }}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value={0}>Minggu</option>
                  <option value={1}>Senin</option>
                  <option value={2}>Selasa</option>
                  <option value={3}>Rabu</option>
                  <option value={4}>Kamis</option>
                  <option value={5}>Jumat</option>
                  <option value={6}>Sabtu</option>
                </select>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-500">
          <div>
            {schedule.lastRunAt && (
              <span>Terakhir berjalan: <strong className="text-neutral-300">{new Date(schedule.lastRunAt).toLocaleString('id-ID')}</strong></span>
            )}
            {schedule.nextRunAt && (
              <span className="ml-3">Jadwal berikutnya: <strong className="text-cyan-400">{new Date(schedule.nextRunAt).toLocaleString('id-ID')}</strong></span>
            )}
          </div>

          <button
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-1.5 self-end sm:self-auto"
          >
            {savingSchedule ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : scheduleSuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Settings className="w-3.5 h-3.5 text-neutral-400" />
            )}
            <span>{scheduleSuccess ? 'Tersimpan' : 'Simpan Pengaturan Jadwal'}</span>
          </button>
        </div>
      </div>

      {/* Backups List */}
      <div className="p-6 rounded-2xl bg-neutral-900/40 border border-neutral-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Daftar Berkas Cadangan ({backups.length})</h3>
          <button 
            onClick={loadBackupData} 
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            title="Muat Ulang"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-neutral-500 text-xs">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            <span>Memuat berkas cadangan...</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-neutral-800 rounded-xl text-neutral-500 text-xs space-y-2">
            <HardDrive className="w-8 h-8 mx-auto opacity-30 text-neutral-400" />
            <p>Belum ada arsip cadangan (backup) untuk server ini.</p>
            <p className="text-[11px] text-neutral-600">
              Klik &quot;Buat Cadangan Manual&quot; atau aktifkan Jadwal Otomatis di atas.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/80">
            {backups.map((b) => (
              <div 
                key={b.id} 
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-xs">{b.name}</span>
                    {b.isAutomatic ? (
                      <span className="px-2 py-0.5 text-[10px] bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-full font-medium">
                        Otomatis
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded-full font-medium">
                        Manual
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-neutral-400 flex items-center gap-3">
                    <span>{new Date(b.createdAt).toLocaleString('id-ID')}</span>
                    <span>•</span>
                    <span className="font-mono text-cyan-400">{formatBytes(b.sizeBytes)}</span>
                    {b.checksum && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-neutral-500 text-[10px]" title="Checksum SHA">
                          Hash: {b.checksum.slice(0, 8)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {/* Restore Button */}
                  <button
                    onClick={() => setRestoreModal(b)}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                    title="Pulihkan Server dari Backup Ini"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Pulihkan</span>
                  </button>

                  {/* Download Button */}
                  <a
                    href={`/api/servers/${serverId}/backups/${b.id}/download`}
                    download
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                    title="Unduh Berkas ZIP"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unduh</span>
                  </a>

                  {/* Delete Button */}
                  <button
                    onClick={() => setDeleteModal(b)}
                    className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded-lg transition-colors"
                    title="Hapus Cadangan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: CREATE MANUAL BACKUP */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">Buat Cadangan Manual</h3>
            </div>
            <p className="text-xs text-neutral-400">
              Sistem akan mengompres seluruh isi berkas server Anda ke dalam satu arsip ZIP yang aman.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300">Nama Cadangan:</label>
              <input
                type="text"
                value={customBackupName}
                onChange={(e) => setCustomBackupName(e.target.value)}
                placeholder="Contoh: Backup_Sebelum_Update"
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCreateModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs text-neutral-400 hover:text-white rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleCreateBackup}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-xl disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{actionLoading ? 'Membuat Arsip...' : 'Buat Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESTORE CONFIRMATION */}
      {restoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Konfirmasi Pemulihan (Restore)</h3>
            </div>
            <div className="text-xs text-neutral-300 space-y-2 bg-neutral-950 p-4 rounded-xl border border-neutral-800/80">
              <p>
                Anda akan memulihkan data server ke arsip cadangan: <strong className="text-white">{restoreModal.name}</strong>.
              </p>
              <p className="text-amber-300/90">
                ⚠️ Catatan: Jika server sedang berjalan, server akan dimatikan sesaat, berkas server saat ini akan ditimpa dengan data cadangan, dan server akan dinyalakan kembali secara otomatis.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRestoreModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs text-neutral-400 hover:text-white rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleRestoreBackup}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{actionLoading ? 'Memulihkan Server...' : 'Ya, Pulihkan Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Hapus Cadangan</h3>
            </div>
            <p className="text-xs text-neutral-300">
              Apakah Anda yakin ingin menghapus arsip cadangan <strong className="text-white">{deleteModal.name}</strong>? Tindakan ini tidak dapat dibatalkan dan akan membebaskan 1 slot cadangan.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs text-neutral-400 hover:text-white rounded-xl"
              >
                Batal
              </button>
              <button
                onClick={handleDeleteBackup}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{actionLoading ? 'Menghapus...' : 'Hapus Cadangan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
