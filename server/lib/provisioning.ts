import crypto from 'crypto';
import { db, OrderRecord, UserRecord } from './db.js';
import { containerEngine } from './containerEngine.js';
import { ServerInstance } from '../../packages/shared/types.js';
import { DEFAULT_EGGS } from '../../packages/shared/eggs.js';
import { notificationService } from './notificationService.js';

export interface ProvisioningResult {
  success: boolean;
  serverId?: string;
  serverUuid?: string;
  userEmail?: string;
  temporaryPassword?: string;
  isNewUser?: boolean;
  errorMessage?: string;
}

// Temporary credentials cache for one-time display on success page
export const oneTimeCredentials = new Map<string, {
  email: string;
  tempPassword?: string;
  isNewUser: boolean;
  serverName: string;
  primaryPort: number;
  loginUrl: string;
  serverUrl: string;
}>();

export async function provisionOrderServer(orderCode: string): Promise<ProvisioningResult> {
  const order = db.findOrderByCode(orderCode);
  if (!order) {
    return { success: false, errorMessage: 'Order not found' };
  }

  try {
    db.updateOrder(orderCode, { status: 'PROVISIONING' });

    // 1. Locate or create user account
    let user = db.findUserByEmail(order.customerEmail);
    let temporaryPassword: string | undefined = undefined;
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // Generate clean 12-char secure temporary password
      const randHex = crypto.randomBytes(4).toString('hex');
      temporaryPassword = `Aeth!${randHex}`;
      
      user = db.createUser({
        email: order.customerEmail,
        name: order.customerName,
        phone: order.customerPhone,
        rawPassword: temporaryPassword,
        role: 'USER',
        mustChangePassword: true
      });
    }

    // 2. Determine egg & node configurations
    const egg = DEFAULT_EGGS.find(e => e.id === order.specs.eggId) || DEFAULT_EGGS[0];
    const node = db.getNodes().find(n => n.id === order.specs.nodeId) || db.getNodes()[0];

    // Allocate unique non-conflicting ports
    const allExistingServers = db.listAllServers();
    const usedPorts = new Set(allExistingServers.flatMap(s => [s.primaryPort, ...(s.extraPorts || [])]));
    
    let basePort = egg.id === 'minecraft-java' ? 25565 : Math.floor(9000 + Math.random() * 1000);
    while (usedPorts.has(basePort)) {
      basePort++;
    }

    const extraPorts: number[] = [];
    for (let i = 0; i < (order.specs.extraPorts || 0); i++) {
      let ep = Math.floor(10000 + Math.random() * 5000);
      while (usedPorts.has(ep) || extraPorts.includes(ep) || ep === basePort) {
        ep++;
      }
      extraPorts.push(ep);
    }

    const serverUuid = crypto.randomUUID();
    const serverId = `srv-${crypto.randomBytes(5).toString('hex')}`;
    const serverName = order.specs.serverName || `${egg.name} Instance`;

    const now = new Date();
    const expiresDate = new Date();
    expiresDate.setMonth(expiresDate.getMonth() + (order.durationMonths || 1));

    // 3. Build Server Instance
    const serverInstance: ServerInstance = {
      id: serverId,
      uuid: serverUuid,
      orderCode: order.orderCode,
      name: serverName,
      description: `Provisioned for ${order.customerName} (${order.orderCode})`,
      status: 'starting',
      eggId: egg.id,
      nodeId: node.id,
      ip: node.ip,
      primaryPort: basePort,
      extraPorts,
      allocatedPorts: [basePort, ...extraPorts],
      ramMb: order.specs.ramMb,
      cpuPercent: order.specs.cpuPercent,
      diskGb: order.specs.diskGb,
      backupSlots: order.specs.backupSlots,
      databaseCount: order.specs.databases,
      userId: user.id,
      userEmail: user.email,
      startsAt: now.toISOString(),
      expiresAt: expiresDate.toISOString(),
      suspended: false,
      autoRestart: true,
      crashCount: 0,
      startupCommand: egg.defaultStartup.replace('{{ENTRY_FILE}}', egg.entryFile),
      entryFile: egg.entryFile,
      envVars: {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    // 4. Save to Database
    db.createServer(serverInstance);

    // 5. Initialize Server Volume Files
    await containerEngine.provisionEggFiles(serverInstance);

    // 6. Start server container automatically in background
    setImmediate(() => {
      containerEngine.startServer(serverId).catch((err) => {
        console.warn(`[Provisioning] Background startServer notice for ${serverId}:`, err);
      });
    });

    // 7. Update Order status to ACTIVE
    db.updateOrder(orderCode, {
      status: 'ACTIVE',
      userId: user.id,
      serverId: serverId
    });

    // 8. Cache one-time credentials for the Success page view
    oneTimeCredentials.set(order.orderCode, {
      email: user.email,
      tempPassword: temporaryPassword,
      isNewUser,
      serverName,
      primaryPort: basePort,
      loginUrl: '/login',
      serverUrl: `/server/${serverId}`
    });

    // 9. Add Activity Log
    db.addActivityLog({
      userId: user.id,
      serverId: serverId,
      action: 'SERVER_PROVISIONED',
      details: `Server ${serverName} (${serverUuid}) automatically provisioned from order ${order.orderCode}.`
    });

    // 10. Send User Notification
    notificationService.notifyUser({
      userId: user.id,
      title: `Server Berhasil Dibuat: ${serverName}`,
      message: `Server hosting "${serverName}" telah aktif dan siap digunakan.\nPort Utama: ${basePort}.\nSilakan masuk ke panel untuk mengelola aplikasi atau bot Anda.`,
      category: 'provisioning',
      severity: 'success',
      link: `/servers/${serverId}`,
      sendEmail: true,
      recipientEmail: user.email
    }).catch((e) => console.warn('[Provisioning] Notification error:', e));

    return {
      success: true,
      serverId,
      serverUuid,
      userEmail: user.email,
      temporaryPassword,
      isNewUser
    };
  } catch (err: any) {
    console.error(`[Provisioning] Error provisioning order ${orderCode}:`, err);
    db.updateOrder(orderCode, { status: 'FAILED' });

    // Notify Admins
    notificationService.notifyAdmins({
      title: `Provisioning Server Gagal: Order #${orderCode}`,
      message: `Gagal memproses pembuatan server otomatis untuk order ${orderCode}: ${err.message}`,
      category: 'provisioning',
      severity: 'danger',
      link: `/admin`,
      sendEmail: true
    }).catch(() => {});

    return {
      success: false,
      errorMessage: err.message || 'Gagal memproses pembuatan server otomatis'
    };
  }
}
