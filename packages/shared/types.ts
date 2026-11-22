export type ServerStatus = 'offline' | 'starting' | 'running' | 'stopping' | 'suspended';

export type EggId = 
  | 'nodejs' 
  | 'python' 
  | 'discord-node' 
  | 'discord-python' 
  | 'static-nginx' 
  | 'php-nginx' 
  | 'minecraft-java' 
  | 'custom-docker';

export interface EggConfig {
  id: EggId;
  name: string;
  category: string;
  dockerImage: string;
  defaultStartup: string;
  entryFile: string;
  installScript: string;
  stopCommand: string;
  description: string;
  envVars: Record<string, { label: string; default: string; required?: boolean; description?: string }>;
}

export interface NodeLocation {
  id: string;
  name: string;
  code: string;
  country: string;
  flag: string;
  ip: string;
  port: number;
  isOnline: boolean;
  totalRamMb: number;
  usedRamMb: number;
  totalDiskGb: number;
  usedDiskGb: number;
  pingMs: number;
}

export interface PricingRuleConfig {
  baseMonthlyFee: number; // e.g. Rp 5,000
  pricePerGbRam: number; // e.g. Rp 10,000 per GB
  pricePerCpuCore: number; // e.g. Rp 8,000 per 100%
  pricePerGbDisk: number; // e.g. Rp 500 per GB
  pricePerBackupSlot: number; // e.g. Rp 2,000 per slot
  pricePerExtraPort: number; // e.g. Rp 1,500 per port
  pricePerDatabase: number; // e.g. Rp 3,000 per DB
  durationDiscounts: {
    1: number; // 0%
    3: number; // 5%
    6: number; // 10%
    12: number; // 15%
  };
  minAmount: number; // BuatQris min Rp 1,000
  maxAmount: number; // BuatQris max Rp 5,000,000
}

export interface ServerSpecs {
  eggId: EggId;
  nodeId: string;
  ramMb: number;
  cpuPercent: number;
  diskGb: number;
  backupSlots: number;
  extraPorts: number;
  databases: number;
  durationMonths: number;
  couponCode?: string;
  serverName?: string;
}

export interface PriceQuote {
  ramPrice: number;
  cpuPrice: number;
  diskPrice: number;
  backupPrice: number;
  portsPrice: number;
  databasesPrice: number;
  baseMonthly: number;
  monthlySubtotal: number;
  durationMonths: number;
  grossTotal: number;
  discountPercent: number;
  discountAmount: number;
  couponDiscountAmount: number;
  netTotal: number;
  adminFee: number;
  totalPayable: number;
  isValid: boolean;
  validationError?: string;
}

export type OrderStatus = 
  | 'PENDING' 
  | 'PAID' 
  | 'PROVISIONING' 
  | 'ACTIVE' 
  | 'FAILED' 
  | 'EXPIRED' 
  | 'CANCELLED' 
  | 'REFUNDED';

export interface BuatQrisCreatePayload {
  action: 'api_create_qris';
  account_id: string;
  secret_token: string;
  amount: number;
  description: string;
  fee_by: 'user' | 'buyer';
  qris_method?: string;
  callback_url?: string;
  test?: '1' | '0';
  app_name?: string;
  app_version?: string;
  app_url?: string;
}

export interface BuatQrisCreateResponse {
  success: boolean;
  message?: string;
  data?: {
    transaction_id: string;
    amount: number;
    total_amount: number;
    amount_uniq: number;
    admin_fee: number;
    credit_amount: number;
    fee_by: string;
    qris_method: string;
    description: string;
    umkm_name: string;
    qr_url: string;
    qris_image: string;
    expired_at: string;
    status: string;
    payment_url: string;
    direct_url?: string | null;
    qris_string?: string | null;
    qris_url?: string | null;
  };
}

export interface BuatQrisCheckStatusResponse {
  success: boolean;
  message?: string;
  data?: {
    transaction_id: string;
    status: 'pending' | 'success' | 'expired' | 'failed';
    amount: number;
    total_amount: number;
    paid_at?: string;
    is_test?: boolean;
  };
  error?: string;
  retry_after?: number;
}

export interface BuatQrisWebhookPayload {
  event: 'payment.success' | 'payment.expired' | 'payment.failed';
  transaction_id: string;
  status: 'success' | 'expired' | 'failed';
  amount: number;
  total_amount: number;
  credit_amount: number;
  admin_fee: number;
  fee_by: string;
  qris_method: string;
  is_test: boolean;
  paid_at?: string;
}

export interface ServerInstance {
  id: string;
  uuid: string;
  orderCode?: string;
  name: string;
  description?: string;
  status: ServerStatus;
  eggId: EggId;
  nodeId: string;
  ip: string;
  primaryPort: number;
  extraPorts: number[];
  allocatedPorts: number[];
  ramMb: number;
  cpuPercent: number;
  diskGb: number;
  backupSlots: number;
  databaseCount: number;
  userId: string;
  userEmail: string;
  startsAt: string;
  expiresAt: string;
  suspended: boolean;
  autoRestart: boolean;
  alwaysOn247?: boolean;
  desiredState?: 'running' | 'stopped';
  crashCount: number;
  startupCommand: string;
  entryFile: string;
  nodeVersion?: string;
  backupSchedule?: BackupScheduleConfig;
  envVars: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ServerStats {
  serverId: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  diskBytes: number;
  diskLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeSeconds: number;
  status: ServerStatus;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
  permissions: string;
  isEditable: boolean;
  itemCount?: number;
}

export interface ServerBackup {
  id: string;
  serverId: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string;
  filePath?: string;
  isAutomatic?: boolean;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'manual';
  hour?: number; // 0 - 23 (e.g. 2 for 02:00 AM)
  targetHour?: number; // alias
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  targetDayOfWeek?: number; // alias
  maxSlots?: number;
  lastRunAt?: string;
  nextRunAt?: string;
}

export type NotificationCategory = 'server' | 'provisioning' | 'payment' | 'billing' | 'renewal' | 'security' | 'admin' | 'backup' | 'system';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error' | 'danger';

export interface AppNotification {
  id: string;
  userId?: string; // target user ID, or empty for all/admin
  userEmail?: string;
  isAdminOnly?: boolean;
  title: string;
  message: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  link?: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  emailSent?: boolean;
  createdAt: string;
}

export interface ServerSchedule {
  id: string;
  serverId: string;
  name: string;
  cronExpr: string;
  actionType: 'power' | 'command' | 'backup';
  payload: string; // 'start' | 'stop' | 'restart' or bash command
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface ServerDatabase {
  id: string;
  serverId: string;
  name: string;
  dbType: 'mysql' | 'postgres' | 'sqlite';
  host: string;
  port: number;
  username: string;
  password?: string;
  createdAt: string;
}

export interface SubUserItem {
  id: string;
  serverId: string;
  email: string;
  permissions: string[]; // ['console', 'power', 'files', 'startup', 'backups', 'databases']
  createdAt: string;
}
