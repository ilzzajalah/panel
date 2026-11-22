import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getInitialSeedData, hashPassword } from '../../prisma/seed.js';
import { 
  ServerInstance, 
  OrderStatus, 
  ServerStatus, 
  ServerBackup, 
  ServerSchedule, 
  ServerDatabase, 
  SubUserItem, 
  PriceQuote, 
  ServerSpecs,
  AppNotification
} from '../../packages/shared/types.js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
  role: 'USER' | 'ADMIN';
  mustChangePassword: boolean;
  isSuspended: boolean;
  createdAt: string;
}

export interface OrderRecord {
  id: string;
  orderCode: string;
  userId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  status: OrderStatus;
  specs: ServerSpecs;
  priceQuote: PriceQuote;
  totalAmount: number;
  durationMonths: number;
  createdAt: string;
  updatedAt: string;
  serverId?: string;
  adminAlerted?: boolean;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  orderCode: string;
  transactionId: string;
  amount: number;
  totalAmount: number;
  adminFee: number;
  creditAmount: number;
  feeBy: string;
  qrisMethod: string;
  qrUrl: string;
  paymentUrl: string;
  status: 'PENDING' | 'SUCCESS' | 'EXPIRED' | 'FAILED';
  isTest: boolean;
  expiredAt: string;
  paidAt?: string;
  lastCheckedAt?: string;
  createdAt: string;
  rawResponse?: any;
}

export interface ActivityLogRecord {
  id: string;
  userId?: string;
  serverId?: string;
  action: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

interface DatabaseSchema {
  users: UserRecord[];
  servers: ServerInstance[];
  orders: OrderRecord[];
  payments: PaymentRecord[];
  webhookLogs: { event: string; transactionId: string; processedAt: string }[];
  backups: ServerBackup[];
  schedules: ServerSchedule[];
  databases: ServerDatabase[];
  subUsers: SubUserItem[];
  activityLogs: ActivityLogRecord[];
  nodes: any[];
  eggs: any[];
  pricingRules: any;
  coupons: any[];
  routerConfig: any;
  paymentConfig: any;
  settings: Record<string, string>;
  notifications: AppNotification[];
}

class DatabaseService {
  private dataDir = path.resolve(process.cwd(), 'data');
  private dbFilePath = path.join(this.dataDir, 'db.json');
  private backupFilePath1 = path.join(this.dataDir, 'db_backup.json');
  private backupFilePath2 = path.resolve('/tmp', 'aether_db_backup.json');
  private memoryDb: DatabaseSchema;

  constructor() {
    this.memoryDb = this.loadDatabase();
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      const backupsDir = path.join(this.dataDir, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const snapshotLatest = path.join(backupsDir, 'snapshot_latest.json');
      const snapshotAuto = path.join(backupsDir, 'snapshot_auto.json');
      const allCandidateFiles = [
        this.dbFilePath, 
        this.backupFilePath1, 
        this.backupFilePath2, 
        snapshotLatest, 
        snapshotAuto
      ];

      // Also discover any timestamped snapshot files in data/backups
      try {
        if (fs.existsSync(backupsDir)) {
          const snapshotFiles = fs.readdirSync(backupsDir)
            .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
            .map(f => path.join(backupsDir, f));
          allCandidateFiles.push(...snapshotFiles);
        }
      } catch {}

      const loadedSchemas: DatabaseSchema[] = [];

      for (const filePath of allCandidateFiles) {
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object') {
              loadedSchemas.push(parsed);
            }
          } catch (e) {
            console.warn(`[Database] Error reading candidate database ${filePath}:`, e);
          }
        }
      }

      if (loadedSchemas.length > 0) {
        // Pick the candidate with the highest number of servers as base
        const baseDb = loadedSchemas.reduce((prev, curr) => {
          const prevCount = (prev.servers || []).length;
          const currCount = (curr.servers || []).length;
          return currCount >= prevCount ? curr : prev;
        }, loadedSchemas[0]);

        // Merge and deduplicate all servers across all backups
        const mergedServersMap = new Map<string, ServerInstance>();
        for (const schema of loadedSchemas) {
          if (Array.isArray(schema.servers)) {
            for (const srv of schema.servers) {
              if (srv && (srv.id || srv.uuid)) {
                const key = srv.id || srv.uuid;
                if (!mergedServersMap.has(key)) {
                  mergedServersMap.set(key, srv);
                }
              }
            }
          }
        }
        baseDb.servers = Array.from(mergedServersMap.values());

        // Merge and deduplicate users
        const mergedUsersMap = new Map<string, UserRecord>();
        for (const schema of loadedSchemas) {
          if (Array.isArray(schema.users)) {
            for (const usr of schema.users) {
              if (usr && usr.id && !mergedUsersMap.has(usr.id)) {
                mergedUsersMap.set(usr.id, usr);
              }
            }
          }
        }
        baseDb.users = Array.from(mergedUsersMap.values());

        // Merge and deduplicate orders
        const mergedOrdersMap = new Map<string, OrderRecord>();
        for (const schema of loadedSchemas) {
          if (Array.isArray(schema.orders)) {
            for (const ord of schema.orders) {
              if (ord && ord.id && !mergedOrdersMap.has(ord.id)) {
                mergedOrdersMap.set(ord.id, ord);
              }
            }
          }
        }
        baseDb.orders = Array.from(mergedOrdersMap.values());

        if (!Array.isArray(baseDb.notifications)) {
          baseDb.notifications = [];
        }

        console.log(`[Database Persistent Sync] Loaded & merged ${baseDb.servers.length} servers from ${loadedSchemas.length} backup files.`);
        this.saveDatabase(baseDb);
        return baseDb;
      }
    } catch (e) {
      console.warn('[Database] Failed to read db.json or backups, generating default seed:', e);
    }

    // Initialize with Seed Data
    const seed = getInitialSeedData();
    const initialData: DatabaseSchema = {
      users: seed.users,
      servers: [],
      orders: [],
      payments: [],
      notifications: [],
      webhookLogs: [],
      backups: [],
      schedules: [],
      databases: [],
      subUsers: [],
      activityLogs: [
        {
          id: 'act-init-001',
          action: 'SYSTEM_BOOT',
          details: 'AetherPanel database initialized with default seeds.',
          createdAt: new Date().toISOString()
        }
      ],
      nodes: seed.nodes,
      eggs: seed.eggs,
      pricingRules: seed.pricingRules,
      coupons: seed.coupons,
      routerConfig: seed.routerConfig,
      paymentConfig: seed.paymentConfig,
      settings: {
        registrationOpen: 'false',
        gracePeriodDays: '3',
        brandName: 'Aether Cloud Hosting',
        smtpHost: 'smtp.mailgun.org',
        smtpPort: '587'
      }
    };

    this.saveDatabase(initialData);
    return initialData;
  }

  public saveDatabase(data?: DatabaseSchema) {
    const payload = data || this.memoryDb;
    const jsonStr = JSON.stringify(payload, null, 2);
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.dbFilePath, jsonStr, 'utf8');
      fs.writeFileSync(this.backupFilePath1, jsonStr, 'utf8');
      try {
        fs.writeFileSync(this.backupFilePath2, jsonStr, 'utf8');
      } catch {}

      // Write snapshot copy to data/backups/snapshot_latest.json
      const backupsDir = path.join(this.dataDir, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(backupsDir, 'snapshot_latest.json'), jsonStr, 'utf8');

      // If server count > 0, also ensure persistent auto snapshot
      if (Array.isArray(payload.servers) && payload.servers.length > 0) {
        fs.writeFileSync(path.join(backupsDir, 'snapshot_auto.json'), jsonStr, 'utf8');
      }
    } catch (e) {
      console.error('[Database] Failed to save db.json:', e);
    }
  }

  public createSnapshot(): { filename: string; serverCount: number; timestamp: string } {
    const backupsDir = path.join(this.dataDir, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${timestamp}.json`;
    const fullPath = path.join(backupsDir, filename);
    const jsonStr = JSON.stringify(this.memoryDb, null, 2);
    fs.writeFileSync(fullPath, jsonStr, 'utf8');
    fs.writeFileSync(path.join(backupsDir, 'snapshot_latest.json'), jsonStr, 'utf8');
    return {
      filename,
      serverCount: this.memoryDb.servers.length,
      timestamp: new Date().toISOString()
    };
  }

  public getDatabaseRaw(): string {
    return JSON.stringify(this.memoryDb, null, 2);
  }

  public restoreFromRaw(rawJson: string): boolean {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.servers)) {
          this.memoryDb.servers = parsed.servers;
        }
        if (Array.isArray(parsed.users)) {
          this.memoryDb.users = parsed.users;
        }
        if (Array.isArray(parsed.orders)) {
          this.memoryDb.orders = parsed.orders;
        }
        if (parsed.settings) {
          this.memoryDb.settings = parsed.settings;
        }
        this.saveDatabase();
        return true;
      }
      return false;
    } catch (e) {
      console.error('[Database Restore Error]:', e);
      return false;
    }
  }

  // --- Users ---
  public findUserByEmail(email: string): UserRecord | undefined {
    const user = this.memoryDb.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user && user.email.toLowerCase() === 'rizramadhan975@gmail.com') {
      user.role = 'ADMIN';
    }
    return user;
  }

  public findUserById(id: string): UserRecord | undefined {
    const user = this.memoryDb.users.find(u => u.id === id);
    if (user && user.email.toLowerCase() === 'rizramadhan975@gmail.com') {
      user.role = 'ADMIN';
    }
    return user;
  }

  public getUserById(id: string): UserRecord | undefined {
    return this.findUserById(id);
  }

  public createUser(userData: {
    email: string;
    name: string;
    phone?: string;
    rawPassword?: string;
    passwordHash?: string;
    role?: 'USER' | 'ADMIN';
    mustChangePassword?: boolean;
  }): UserRecord {
    const isSuperAdmin = userData.email.toLowerCase().trim() === 'rizramadhan975@gmail.com';
    const role: 'USER' | 'ADMIN' = isSuperAdmin ? 'ADMIN' : (userData.role || 'USER');
    const passwordHash = userData.passwordHash || hashPassword(userData.rawPassword || 'AetherPass!123');
    const newUser: UserRecord = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      email: userData.email.toLowerCase().trim(),
      name: userData.name.trim(),
      phone: userData.phone,
      passwordHash,
      role,
      mustChangePassword: userData.mustChangePassword ?? false,
      isSuspended: false,
      createdAt: new Date().toISOString()
    };
    this.memoryDb.users.push(newUser);
    this.saveDatabase();
    return newUser;
  }

  public updateUser(id: string, updates: Partial<UserRecord>): UserRecord | undefined {
    const user = this.findUserById(id);
    if (!user) return undefined;
    Object.assign(user, updates);
    this.saveDatabase();
    return user;
  }

  public listUsers(): UserRecord[] {
    return [...this.memoryDb.users];
  }

  // --- Servers ---
  public findServerById(id: string): ServerInstance | undefined {
    return this.memoryDb.servers.find(s => s.id === id || s.uuid === id);
  }

  public listServersByUser(userId: string, userEmail?: string): ServerInstance[] {
    const cleanEmail = userEmail?.toLowerCase().trim();
    return this.memoryDb.servers.filter(s => {
      if (s.userId === userId) return true;
      if (cleanEmail && s.userEmail && s.userEmail.toLowerCase().trim() === cleanEmail) return true;
      return false;
    });
  }

  public listAllServers(): ServerInstance[] {
    return [...this.memoryDb.servers];
  }

  public createServer(server: ServerInstance): ServerInstance {
    this.memoryDb.servers.push(server);
    this.saveDatabase();
    return server;
  }

  public updateServer(id: string, updates: Partial<ServerInstance>): ServerInstance | undefined {
    const server = this.findServerById(id);
    if (!server) return undefined;
    Object.assign(server, { ...updates, updatedAt: new Date().toISOString() });
    this.saveDatabase();
    return server;
  }

  public deleteServer(id: string): boolean {
    const initialLen = this.memoryDb.servers.length;
    this.memoryDb.servers = this.memoryDb.servers.filter(s => s.id !== id && s.uuid !== id);
    const removed = this.memoryDb.servers.length < initialLen;
    if (removed) {
      this.saveDatabase();
    }
    return removed;
  }

  // --- Orders ---
  public createOrder(order: OrderRecord): OrderRecord {
    this.memoryDb.orders.push(order);
    this.saveDatabase();
    return order;
  }

  public findOrderByCode(orderCode: string): OrderRecord | undefined {
    return this.memoryDb.orders.find(o => o.orderCode.toUpperCase() === orderCode.toUpperCase());
  }

  public findOrderById(id: string): OrderRecord | undefined {
    return this.memoryDb.orders.find(o => o.id === id);
  }

  public updateOrder(orderCode: string, updates: Partial<OrderRecord>): OrderRecord | undefined {
    const order = this.findOrderByCode(orderCode);
    if (!order) return undefined;
    Object.assign(order, { ...updates, updatedAt: new Date().toISOString() });
    this.saveDatabase();
    return order;
  }

  public listOrders(): OrderRecord[] {
    return [...this.memoryDb.orders].reverse();
  }

  // --- Payments ---
  public createPayment(payment: PaymentRecord): PaymentRecord {
    this.memoryDb.payments.push(payment);
    this.saveDatabase();
    return payment;
  }

  public findPaymentByTransactionId(trxId: string): PaymentRecord | undefined {
    return this.memoryDb.payments.find(p => p.transactionId === trxId);
  }

  public findPaymentByOrderCode(orderCode: string): PaymentRecord | undefined {
    return this.memoryDb.payments.filter(p => p.orderCode === orderCode).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }

  public updatePayment(trxId: string, updates: Partial<PaymentRecord>): PaymentRecord | undefined {
    const payment = this.findPaymentByTransactionId(trxId);
    if (!payment) return undefined;
    Object.assign(payment, updates);
    this.saveDatabase();
    return payment;
  }

  public listPayments(): PaymentRecord[] {
    return [...this.memoryDb.payments].reverse();
  }

  // --- Webhook Logs (Idempotency) ---
  public isWebhookProcessed(event: string, transactionId: string): boolean {
    return this.memoryDb.webhookLogs.some(l => l.event === event && l.transactionId === transactionId);
  }

  public recordWebhookProcessed(event: string, transactionId: string) {
    if (!this.isWebhookProcessed(event, transactionId)) {
      this.memoryDb.webhookLogs.push({
        event,
        transactionId,
        processedAt: new Date().toISOString()
      });
      this.saveDatabase();
    }
  }

  public listBackups(serverId: string): ServerBackup[] {
    return this.memoryDb.backups.filter(b => b.serverId === serverId);
  }

  public findBackupById(id: string): ServerBackup | undefined {
    return this.memoryDb.backups.find(b => b.id === id);
  }

  public createBackup(backup: ServerBackup): ServerBackup {
    this.memoryDb.backups.push(backup);
    this.saveDatabase();
    return backup;
  }

  public deleteBackup(id: string): boolean {
    const len = this.memoryDb.backups.length;
    this.memoryDb.backups = this.memoryDb.backups.filter(b => b.id !== id);
    if (this.memoryDb.backups.length < len) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- Schedules ---
  public listSchedules(serverId: string): ServerSchedule[] {
    return this.memoryDb.schedules.filter(s => s.serverId === serverId);
  }

  public createSchedule(schedule: ServerSchedule): ServerSchedule {
    this.memoryDb.schedules.push(schedule);
    this.saveDatabase();
    return schedule;
  }

  public deleteSchedule(id: string): boolean {
    const len = this.memoryDb.schedules.length;
    this.memoryDb.schedules = this.memoryDb.schedules.filter(s => s.id !== id);
    if (this.memoryDb.schedules.length < len) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  public toggleSchedule(id: string): ServerSchedule | undefined {
    const sched = this.memoryDb.schedules.find(s => s.id === id);
    if (sched) {
      sched.isActive = !sched.isActive;
      this.saveDatabase();
    }
    return sched;
  }

  // --- Databases ---
  public listDatabases(serverId: string): ServerDatabase[] {
    return this.memoryDb.databases.filter(d => d.serverId === serverId);
  }

  public createDatabaseInstance(dbInst: ServerDatabase): ServerDatabase {
    this.memoryDb.databases.push(dbInst);
    this.saveDatabase();
    return dbInst;
  }

  public deleteDatabaseInstance(id: string): boolean {
    const len = this.memoryDb.databases.length;
    this.memoryDb.databases = this.memoryDb.databases.filter(d => d.id !== id);
    if (this.memoryDb.databases.length < len) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- SubUsers ---
  public listSubUsers(serverId: string): SubUserItem[] {
    return this.memoryDb.subUsers.filter(s => s.serverId === serverId);
  }

  public createSubUser(subUser: SubUserItem): SubUserItem {
    this.memoryDb.subUsers.push(subUser);
    this.saveDatabase();
    return subUser;
  }

  public deleteSubUser(id: string): boolean {
    const len = this.memoryDb.subUsers.length;
    this.memoryDb.subUsers = this.memoryDb.subUsers.filter(s => s.id !== id);
    if (this.memoryDb.subUsers.length < len) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  // --- Activity Logs ---
  public addActivityLog(log: Omit<ActivityLogRecord, 'id' | 'createdAt'>): ActivityLogRecord {
    const record: ActivityLogRecord = {
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      ...log
    };
    this.memoryDb.activityLogs.unshift(record);
    if (this.memoryDb.activityLogs.length > 500) {
      this.memoryDb.activityLogs.pop();
    }
    this.saveDatabase();
    return record;
  }

  public listActivityLogs(filter?: { serverId?: string; userId?: string }): ActivityLogRecord[] {
    return this.memoryDb.activityLogs.filter(log => {
      if (filter?.serverId && log.serverId !== filter.serverId) return false;
      if (filter?.userId && log.userId !== filter.userId) return false;
      return true;
    });
  }

  // --- Configurations ---
  public getPaymentConfig() {
    return { ...this.memoryDb.paymentConfig };
  }

  public updatePaymentConfig(newConfig: any) {
    this.memoryDb.paymentConfig = { ...this.memoryDb.paymentConfig, ...newConfig };
    this.saveDatabase();
    return this.memoryDb.paymentConfig;
  }

  public getRouterConfig() {
    return { ...this.memoryDb.routerConfig };
  }

  public updateRouterConfig(newConfig: any) {
    this.memoryDb.routerConfig = { ...this.memoryDb.routerConfig, ...newConfig };
    this.saveDatabase();
    return this.memoryDb.routerConfig;
  }

  public getPricingRules() {
    return { ...this.memoryDb.pricingRules };
  }

  public updatePricingRules(rules: any) {
    this.memoryDb.pricingRules = { ...this.memoryDb.pricingRules, ...rules };
    this.saveDatabase();
    return this.memoryDb.pricingRules;
  }

  public getNodes() {
    return [...this.memoryDb.nodes];
  }

  public addNode(node: any) {
    this.memoryDb.nodes.push(node);
    this.saveDatabase();
    return node;
  }

  public updateNode(nodeId: string, updates: any) {
    const node = this.memoryDb.nodes.find(n => n.id === nodeId);
    if (node) {
      Object.assign(node, updates);
      this.saveDatabase();
    }
    return node;
  }

  public getCoupons() {
    return [...this.memoryDb.coupons];
  }

  public addCoupon(coupon: any) {
    this.memoryDb.coupons = this.memoryDb.coupons.filter(c => c.code.toUpperCase() !== coupon.code.toUpperCase());
    this.memoryDb.coupons.push(coupon);
    this.saveDatabase();
    return coupon;
  }

  public deleteCoupon(code: string) {
    this.memoryDb.coupons = this.memoryDb.coupons.filter(c => c.code.toUpperCase() !== code.toUpperCase());
    this.saveDatabase();
    return true;
  }

  public getEggs() {
    return [...this.memoryDb.eggs];
  }

  public getSettings() {
    return { ...this.memoryDb.settings };
  }

  public updateSettings(settings: Record<string, string>) {
    this.memoryDb.settings = { ...this.memoryDb.settings, ...settings };
    this.saveDatabase();
    return this.memoryDb.settings;
  }

  // --- Notifications ---
  public listNotifications(userId?: string, isAdmin?: boolean, limit = 50): AppNotification[] {
    if (!Array.isArray(this.memoryDb.notifications)) {
      this.memoryDb.notifications = [];
    }
    let list = this.memoryDb.notifications;
    if (isAdmin) {
      list = list.filter(n => !n.userId || n.userId === userId || n.isAdminOnly);
    } else if (userId) {
      list = list.filter(n => (n.userId === userId || (!n.userId && !n.isAdminOnly)));
    }
    return list.slice(-limit).reverse();
  }

  public createNotification(notif: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'> & { id?: string; createdAt?: string }): AppNotification {
    if (!Array.isArray(this.memoryDb.notifications)) {
      this.memoryDb.notifications = [];
    }
    const newNotif: AppNotification = {
      id: notif.id || `notif-${crypto.randomBytes(6).toString('hex')}`,
      userId: notif.userId,
      userEmail: notif.userEmail,
      isAdminOnly: !!notif.isAdminOnly,
      title: notif.title,
      message: notif.message,
      category: notif.category,
      severity: notif.severity,
      link: notif.link,
      metadata: notif.metadata || {},
      isRead: false,
      createdAt: notif.createdAt || new Date().toISOString()
    };
    this.memoryDb.notifications.push(newNotif);
    if (this.memoryDb.notifications.length > 1000) {
      this.memoryDb.notifications = this.memoryDb.notifications.slice(-1000);
    }
    this.saveDatabase();
    return newNotif;
  }

  public markNotificationAsRead(id: string, userId?: string): boolean {
    if (!Array.isArray(this.memoryDb.notifications)) return false;
    const notif = this.memoryDb.notifications.find(n => n.id === id);
    if (!notif) return false;
    if (userId && notif.userId && notif.userId !== userId) return false;
    notif.isRead = true;
    this.saveDatabase();
    return true;
  }

  public markAllNotificationsAsRead(userId?: string, isAdmin?: boolean): number {
    if (!Array.isArray(this.memoryDb.notifications)) return 0;
    let count = 0;
    for (const notif of this.memoryDb.notifications) {
      if (!notif.isRead) {
        if (isAdmin || (userId && notif.userId === userId) || (!notif.userId && !notif.isAdminOnly)) {
          notif.isRead = true;
          count++;
        }
      }
    }
    if (count > 0) this.saveDatabase();
    return count;
  }

  public deleteNotification(id: string, userId?: string): boolean {
    if (!Array.isArray(this.memoryDb.notifications)) return false;
    const len = this.memoryDb.notifications.length;
    this.memoryDb.notifications = this.memoryDb.notifications.filter(n => {
      if (n.id === id) {
        if (userId && n.userId && n.userId !== userId) return true;
        return false;
      }
      return true;
    });
    if (this.memoryDb.notifications.length < len) {
      this.saveDatabase();
      return true;
    }
    return false;
  }

  public getUnreadNotificationCount(userId?: string, isAdmin?: boolean): number {
    if (!Array.isArray(this.memoryDb.notifications)) return 0;
    return this.memoryDb.notifications.filter(n => {
      if (n.isRead) return false;
      if (isAdmin) return true;
      if (userId) return n.userId === userId || (!n.userId && !n.isAdminOnly);
      return !n.userId && !n.isAdminOnly;
    }).length;
  }
}

export const db = new DatabaseService();
