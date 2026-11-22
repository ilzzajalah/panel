import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

import { db, OrderRecord, PaymentRecord } from './server/lib/db.js';
import { buatQrisClient } from './server/lib/buatqris.js';
import { containerEngine } from './server/lib/containerEngine.js';
import { provisionOrderServer, oneTimeCredentials } from './server/lib/provisioning.js';
import { nineRouter } from './server/lib/9router.js';
import { calculatePriceQuote } from './packages/shared/pricing.js';
import { DEFAULT_EGGS } from './packages/shared/eggs.js';
import { ServerSpecs, ServerInstance, BackupScheduleConfig } from './packages/shared/types.js';
import { hashPassword } from './prisma/seed.js';
import { notificationService } from './server/lib/notificationService.js';
import { backupScheduler } from './server/lib/backupScheduler.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// 24/7 Process Crash Guards — prevent transient async errors from terminating the panel host
process.on('uncaughtException', (err) => {
  console.error('[AetherPanel 24/7 Guard] Uncaught Exception (recovered):', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[AetherPanel 24/7 Guard] Unhandled Rejection (recovered):', reason?.message || reason);
});

// Attach Realtime Notification WebSocket Server
notificationService.attachWebSocketServer(httpServer);

// Enable raw body capture for webhook signature verification
app.use(express.json({
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Simple Auth Helper
function extractUserFromAuth(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  try {
    const [userId, sign] = token.split('.');
    if (!userId || !sign) return null;
    return db.findUserById(userId);
  } catch {
    return null;
  }
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = extractUserFromAuth(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Harap login terlebih dahulu' });
  }
  (req as any).user = user;
  next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = extractUserFromAuth(req);
  if (!user || user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Akses khusus Administrator' });
  }
  (req as any).user = user;
  next();
}

// -------------------------------------------------------------
// 24/7 KEEP-ALIVE & HEALTH CHECK APIS (Public — Non-Sensitive Operational Stats Only)
// -------------------------------------------------------------
const handleKeepAliveHealth = (req: express.Request, res: express.Response) => {
  const sourceParam = typeof req.query.source === 'string' ? req.query.source.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '') : '';
  const source = sourceParam || (req.headers['user-agent']?.toLowerCase().includes('uptimerobot')
    ? 'uptimerobot'
    : req.headers['user-agent']?.toLowerCase().includes('cron-job')
      ? 'cron-job'
      : 'http_ping');

  const summary = containerEngine.recordKeepAlivePing(source);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).json({
    ok: true,
    status: 'online_24_7',
    uptimeSeconds: summary.uptimeSeconds,
    activeServers: summary.activeServers,
    alwaysOn247Servers: summary.alwaysOn247Servers,
    totalServers: summary.totalServers,
    totalPings: summary.totalKeepAlivePings,
    totalAutoRecoveries: summary.totalAutoRecoveries,
    lastPingAt: new Date(summary.lastKeepAlivePingAt).toISOString(),
    timestamp: new Date().toISOString()
  });
};

app.get('/ping', handleKeepAliveHealth);
app.get('/api/ping', handleKeepAliveHealth);
app.get('/api/health', handleKeepAliveHealth);

// -------------------------------------------------------------
// PUBLIC & CONFIGURATOR APIS
// -------------------------------------------------------------

// List available Eggs
app.get('/api/eggs', (_req, res) => {
  res.json({ success: true, eggs: DEFAULT_EGGS });
});

// List Nodes & capacity
app.get('/api/nodes', (_req, res) => {
  res.json({ success: true, nodes: db.getNodes() });
});

// Get Pricing Rules & Coupon validation
app.get('/api/pricing/rules', (_req, res) => {
  res.json({ success: true, rules: db.getPricingRules(), coupons: db.getCoupons() });
});

app.post('/api/pricing/quote', (req, res) => {
  const specs: ServerSpecs = req.body;
  const pricingRules = db.getPricingRules();
  const quote = calculatePriceQuote(specs, pricingRules, db.getCoupons());
  res.json({ success: true, quote });
});

// CREATE ORDER & INITIATE BUATQRIS TRANSACTION
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, specs } = req.body;

    if (!customerEmail || !customerName) {
      return res.status(400).json({ error: 'Nama dan email wajib diisi' });
    }

    // Always recalculate price authoritatively on backend
    const pricingRules = db.getPricingRules();
    const quote = calculatePriceQuote(specs, pricingRules, db.getCoupons());

    if (!quote.isValid) {
      return res.status(400).json({ error: quote.validationError || 'Konfigurasi tidak valid' });
    }

    const orderCode = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const orderId = `ord-${crypto.randomBytes(6).toString('hex')}`;

    const orderRecord: OrderRecord = {
      id: orderId,
      orderCode,
      customerName,
      customerEmail: customerEmail.toLowerCase().trim(),
      customerPhone: customerPhone || '-',
      status: 'PENDING',
      specs,
      priceQuote: quote,
      totalAmount: quote.totalPayable,
      durationMonths: specs.durationMonths || 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.createOrder(orderRecord);

    // Call BuatQris to generate QRIS
    const callbackUrl = `${process.env.APP_URL || 'https://example.com'}/api/webhooks/buatqris`;
    const qrisRes = await buatQrisClient.createTransaction({
      amount: quote.netTotal,
      description: `Order ${orderCode} (${specs.ramMb}MB RAM)`,
      orderCode,
      callbackUrl
    });

    if (!qrisRes.success || !qrisRes.data) {
      return res.status(502).json({
        error: qrisRes.message || 'Gagal membuat QRIS ke payment gateway BuatQris'
      });
    }

    // Save payment record
    const paymentRecord: PaymentRecord = {
      id: `pay-${crypto.randomBytes(6).toString('hex')}`,
      orderId: orderRecord.id,
      orderCode: orderRecord.orderCode,
      transactionId: qrisRes.data.transaction_id,
      amount: qrisRes.data.amount,
      totalAmount: qrisRes.data.total_amount,
      adminFee: qrisRes.data.admin_fee,
      creditAmount: qrisRes.data.credit_amount,
      feeBy: qrisRes.data.fee_by,
      qrisMethod: qrisRes.data.qris_method,
      qrUrl: qrisRes.data.qr_url,
      paymentUrl: qrisRes.data.payment_url,
      status: 'PENDING',
      isTest: buatQrisClient.getConfig().mode !== 'live',
      expiredAt: qrisRes.data.expired_at,
      createdAt: new Date().toISOString(),
      rawResponse: qrisRes.data
    };

    db.createPayment(paymentRecord);

    res.json({
      success: true,
      order: orderRecord,
      payment: paymentRecord,
      paymentMode: buatQrisClient.getConfig().mode
    });
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: err.message || 'Gagal memproses pesanan' });
  }
});

// GET ORDER DETAILS
app.get('/api/orders/:orderCode', (req, res) => {
  const order = db.findOrderByCode(req.params.orderCode);
  if (!order) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
  }
  const payment = db.findPaymentByOrderCode(order.orderCode);
  const server = order.serverId ? db.findServerById(order.serverId) : null;

  res.json({
    success: true,
    order,
    payment,
    server,
    paymentMode: buatQrisClient.getConfig().mode
  });
});

// MANUAL CHECK STATUS (Respecting 20s rate limit)
app.post('/api/orders/:orderCode/check-payment', async (req, res) => {
  const order = db.findOrderByCode(req.params.orderCode);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const payment = db.findPaymentByOrderCode(order.orderCode);
  if (!payment) return res.status(404).json({ error: 'Payment record not found' });

  if (payment.status === 'SUCCESS' || order.status === 'ACTIVE') {
    return res.json({ success: true, status: 'SUCCESS', alreadyPaid: true });
  }

  const checkRes = await buatQrisClient.checkStatus(payment.transactionId);
  if (!checkRes.success) {
    return res.status(checkRes.error === 'rate_limited' ? 429 : 400).json(checkRes);
  }

  if (checkRes.data?.status === 'success') {
    db.updatePayment(payment.transactionId, { status: 'SUCCESS', paidAt: new Date().toISOString() });
    await provisionOrderServer(order.orderCode);
    return res.json({ success: true, status: 'SUCCESS', newlyPaid: true });
  }

  res.json({ success: true, status: checkRes.data?.status || 'PENDING' });
});

// 1-CLICK SIMULATED PAYMENT (For Sandbox / Mock / Local Testing)
app.post('/api/orders/:orderCode/simulate-payment', async (req, res) => {
  const order = db.findOrderByCode(req.params.orderCode);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const payment = db.findPaymentByOrderCode(order.orderCode);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  // Generate valid webhook payload and signature
  const { rawBody, signatureHeader, payload } = buatQrisClient.createSimulatedWebhook({
    transactionId: payment.transactionId,
    totalAmount: payment.totalAmount,
    amount: payment.amount,
    status: 'success'
  });

  // Verify HMAC-SHA256 signature to guarantee identical webhook code path
  const isValid = buatQrisClient.verifyWebhookSignature(rawBody, signatureHeader);
  if (!isValid) {
    return res.status(500).json({ error: 'Signature verification failed in simulation test' });
  }

  // Idempotency check
  if (db.isWebhookProcessed('payment.success', payment.transactionId)) {
    return res.json({ success: true, message: 'Already processed', orderCode: order.orderCode });
  }

  db.recordWebhookProcessed('payment.success', payment.transactionId);
  db.updatePayment(payment.transactionId, { status: 'SUCCESS', paidAt: new Date().toISOString() });

  // Provision server automatically
  const provisionResult = await provisionOrderServer(order.orderCode);

  res.json({
    success: true,
    message: 'Pembayaran berhasil disimulasikan & Server otomatis dibuat!',
    provisionResult,
    orderCode: order.orderCode
  });
});

// ONE-TIME CREDENTIALS RETRIEVAL FOR SUCCESS PAGE
app.get('/api/orders/:orderCode/success-credentials', (req, res) => {
  const creds = oneTimeCredentials.get(req.params.orderCode);
  const order = db.findOrderByCode(req.params.orderCode);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  res.json({
    success: true,
    credentials: creds || null,
    order
  });
});

// PUBLIC ORDER TRACKING (Order Code + Email)
app.post('/api/track', (req, res) => {
  const { orderCode, email } = req.body;
  if (!orderCode || !email) {
    return res.status(400).json({ error: 'Harap masukkan Kode Order dan Email' });
  }

  const order = db.findOrderByCode(orderCode.trim());
  if (!order || order.customerEmail.toLowerCase() !== email.toLowerCase().trim()) {
    return res.status(404).json({ error: 'Pesanan tidak ditemukan atau email tidak sesuai' });
  }

  const payment = db.findPaymentByOrderCode(order.orderCode);
  const server = order.serverId ? db.findServerById(order.serverId) : null;

  res.json({ success: true, order, payment, server });
});

// -------------------------------------------------------------
// BUATQRIS WEBHOOK HANDLER: POST /api/webhooks/buatqris
// -------------------------------------------------------------
app.post('/api/webhooks/buatqris', async (req: any, res) => {
  const rawBody: string = req.rawBody || JSON.stringify(req.body);
  const signatureHeader = (req.headers['x-buatqris-signature'] || req.headers['X-BuatQris-Signature']) as string;
  const eventHeader = (req.headers['x-buatqris-event'] || req.headers['X-BuatQris-Event']) as string;
  const deliveryHeader = (req.headers['x-buatqris-delivery'] || req.headers['X-BuatQris-Delivery']) as string;

  console.log(`[Webhook] Incoming from BuatQris - Event: ${eventHeader}, Delivery: ${deliveryHeader}`);

  // 1. Verify HMAC-SHA256 signature
  const isValidSig = buatQrisClient.verifyWebhookSignature(rawBody, signatureHeader);
  if (!isValidSig) {
    console.warn('[Webhook] Invalid signature received:', signatureHeader);
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  let data: any;
  try {
    data = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  const { event, transaction_id, status, total_amount, is_test } = data;

  // Ignore withdrawal events
  if (event?.startsWith('withdrawal.')) {
    return res.status(200).json({ status: 'ignored' });
  }

  // 2. Lookup payment by transaction_id
  const payment = db.findPaymentByTransactionId(transaction_id);
  if (!payment) {
    console.warn(`[Webhook] Transaction ${transaction_id} not found in database`);
    return res.status(200).json({ status: 'not_found_logged' });
  }

  // 3. Verify total_amount matches stored record
  if (payment.totalAmount !== total_amount) {
    console.error(`[Webhook] Amount mismatch! Stored: ${payment.totalAmount}, Webhook: ${total_amount}`);
    db.addActivityLog({
      action: 'SUSPICIOUS_PAYMENT_MISMATCH',
      details: `Total amount mismatch for trx ${transaction_id}. Stored: ${payment.totalAmount}, got ${total_amount}.`
    });
    return res.status(400).json({ error: 'Total amount mismatch' });
  }

  // 4. Idempotency guard: Don't process twice
  const eventName = event || 'payment.' + status;
  if (db.isWebhookProcessed(eventName, transaction_id)) {
    return res.status(200).json({ status: 'already_processed' });
  }
  db.recordWebhookProcessed(eventName, transaction_id);

  // 5. Handle event types
  if (status === 'success' || event === 'payment.success') {
    db.updatePayment(transaction_id, { status: 'SUCCESS', paidAt: new Date().toISOString() });
    
    // Quick HTTP 200 response to meet BuatQris 6s timeout rule, then run provisioning asynchronously
    res.status(200).json({ status: 'ok', processing: true });

    // Asynchronous provisioning
    setImmediate(async () => {
      console.log(`[Webhook] Triggering server provisioning for order ${payment.orderCode}...`);
      await provisionOrderServer(payment.orderCode);
    });
    return;
  } else if (status === 'expired' || event === 'payment.expired') {
    db.updatePayment(transaction_id, { status: 'EXPIRED' });
    db.updateOrder(payment.orderCode, { status: 'EXPIRED' });
    return res.status(200).json({ status: 'expired_processed' });
  } else if (status === 'failed' || event === 'payment.failed') {
    db.updatePayment(transaction_id, { status: 'FAILED' });
    db.updateOrder(payment.orderCode, { status: 'FAILED' });
    return res.status(200).json({ status: 'failed_processed' });
  }

  return res.status(200).json({ status: 'unhandled_event' });
});

// -------------------------------------------------------------
// AUTHENTICATION APIS
// -------------------------------------------------------------
// Failed login tracker for security alerts
const failedLoginTracker = new Map<string, { count: number; lastTime: number }>();

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = db.findUserByEmail(cleanEmail);
  if (!user) {
    return res.status(401).json({ error: 'Email atau password tidak cocok' });
  }

  if (user.isSuspended) {
    return res.status(403).json({ error: 'Akun Anda telah dinonaktifkan oleh administrator' });
  }

  const hashed = hashPassword(password);
  if (hashed !== user.passwordHash) {
    const tracker = failedLoginTracker.get(cleanEmail) || { count: 0, lastTime: 0 };
    tracker.count += 1;
    tracker.lastTime = Date.now();
    failedLoginTracker.set(cleanEmail, tracker);

    // If failed 3 or more times, trigger security alert via WebSocket & Email
    if (tracker.count >= 3) {
      notificationService.notifyUser({
        userId: user.id,
        title: 'Peringatan Keamanan: Percobaan Login Gagal',
        message: `Terdeteksi ${tracker.count} kali percobaan login dengan sandi yang salah pada akun Anda (IP: ${req.ip || '127.0.0.1'}).\nJika ini bukan aktivitas Anda, segera amankan akun Anda.`,
        category: 'security',
        severity: 'danger',
        link: '/profile',
        sendEmail: true,
        recipientEmail: user.email
      }).catch(() => {});

      notificationService.notifyAdmins({
        title: `Percobaan Login Gagal Berulang: ${user.email}`,
        message: `Akun ${user.email} mengalami ${tracker.count} kegagalan login beruntun dari IP ${req.ip || '127.0.0.1'}.`,
        category: 'security',
        severity: 'warning',
        link: '/admin'
      }).catch(() => {});
    }

    return res.status(401).json({ error: 'Email atau password tidak cocok' });
  }

  // Clear failed tracker on successful login
  failedLoginTracker.delete(cleanEmail);

  // Clean token: <userId>.<hash>
  const token = `${user.id}.${crypto.randomBytes(16).toString('hex')}`;

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    }
  });
});

app.post('/api/auth/google-sync', (req, res) => {
  const { email, name, photoURL } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email wajib diisi' });
  }

  const isSuperAdmin = email.toLowerCase().trim() === 'rizramadhan975@gmail.com';
  let user = db.findUserByEmail(email);
  if (!user) {
    user = db.createUser({
      email,
      name: name || email.split('@')[0],
      role: isSuperAdmin ? 'ADMIN' : 'USER',
      mustChangePassword: false
    });
  } else if (isSuperAdmin && user.role !== 'ADMIN') {
    const updated = db.updateUser(user.id, { role: 'ADMIN' });
    if (updated) user = updated;
  }

  if (!user) {
    return res.status(500).json({ error: 'Gagal memproses pengguna' });
  }

  const token = `${user.id}.${crypto.randomBytes(16).toString('hex')}`;
  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    }
  });
});

app.get('/api/auth/me', requireAuth, (req: any, res) => {
  const user = req.user;
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      mustChangePassword: user.mustChangePassword
    }
  });
});

app.post('/api/auth/change-password', requireAuth, (req: any, res) => {
  const user = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  }

  if (!user.mustChangePassword) {
    if (hashPassword(currentPassword) !== user.passwordHash) {
      return res.status(400).json({ error: 'Password saat ini salah' });
    }
  }

  db.updateUser(user.id, {
    passwordHash: hashPassword(newPassword),
    mustChangePassword: false
  });

  res.json({ success: true, message: 'Password berhasil diperbarui' });
});

// -------------------------------------------------------------
// SERVER MANAGEMENT APIS
// -------------------------------------------------------------

// Flexible Auth Middleware: checks user auth, query parameters, or orderCode
function flexAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = extractUserFromAuth(req);
  if (user) {
    (req as any).user = user;
    return next();
  }
  
  // Allow unauthenticated guests to interact with existing servers on mobile/laptop
  const serverId = req.params.id;
  if (serverId && db.findServerById(serverId)) {
    (req as any).user = { id: 'guest-session', name: 'Guest User', role: 'USER', email: 'guest@aetherpanel.com' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Harap login terlebih dahulu' });
}

// List servers for current user (or all if admin/query email)
app.get('/api/servers', (req: any, res) => {
  const user = extractUserFromAuth(req);
  if (user) {
    const isAdmin = user.role === 'ADMIN' || user.email.toLowerCase().trim() === 'rizramadhan975@gmail.com';
    const servers = isAdmin ? db.listAllServers() : db.listServersByUser(user.id, user.email);
    return res.json({ success: true, servers });
  }

  // Fallback for guest or unauthenticated mobile device searching by email / orderCode
  const emailQuery = (req.query.email || req.query.customerEmail || '') as string;
  const orderQuery = (req.query.orderCode || '') as string;

  let servers = db.listAllServers();
  if (emailQuery) {
    const cleanE = emailQuery.toLowerCase().trim();
    servers = servers.filter(s => 
      s.userEmail?.toLowerCase().trim() === cleanE || 
      s.description?.toLowerCase().includes(cleanE)
    );
  } else if (orderQuery) {
    servers = servers.filter(s => s.orderCode?.toUpperCase().trim() === orderQuery.toUpperCase().trim());
  }

  res.json({ success: true, servers });
});

// Get single server details (accessible across all devices via server ID)
app.get('/api/servers/:id', (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const stats = containerEngine.getCurrentStats(server.id);
  const route = nineRouter.getRoute(server.id);

  res.json({ success: true, server, stats, route });
});

// Dedicated Container Stats API
app.get('/api/servers/:id/stats', (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const stats = containerEngine.getCurrentStats(server.id);
  res.json({ success: true, stats });
});

// POWER ACTIONS: Start, Stop, Restart, Kill
app.post('/api/servers/:id/power', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  if (server.suspended) {
    return res.status(403).json({ error: 'Server sedang di-suspend karena kedaluwarsa atau pelanggaran.' });
  }

  const { action } = req.body;
  let ok = false;

  switch (action) {
    case 'start':
      ok = await containerEngine.startServer(server.id);
      break;
    case 'stop':
      ok = await containerEngine.stopServer(server.id);
      break;
    case 'restart':
      ok = await containerEngine.restartServer(server.id);
      break;
    case 'kill':
      ok = containerEngine.killServer(server.id);
      break;
    default:
      return res.status(400).json({ error: 'Invalid power action' });
  }

  db.addActivityLog({
    userId: req.user.id,
    serverId: server.id,
    action: `POWER_${action.toUpperCase()}`,
    details: `User executed ${action} command on ${server.name}`
  });

  // Realtime WebSocket broadcast of updated status
  notificationService.broadcastServerStatus(server.id, server.status, server.name);

  // Send in-panel notification
  const actionLabels: Record<string, string> = {
    start: 'dinyalakan',
    stop: 'dihentikan',
    restart: 'dimuat ulang',
    kill: 'dipaksa berhenti'
  };
  notificationService.notifyUser({
    userId: server.userId,
    title: `Server ${server.name} ${actionLabels[action] || action}`,
    message: `Perintah ${action.toUpperCase()} berhasil dieksekusi. Status server saat ini: ${server.status}.`,
    category: 'server',
    severity: action === 'stop' || action === 'kill' ? 'warning' : 'info',
    link: `/servers/${server.id}`
  }).catch(() => {});

  res.json({ success: ok, action, status: server.status });
});

// FREE CONFLICTING PORT MANUALLY
app.post('/api/servers/:id/free-port', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const port = req.body.port ? parseInt(req.body.port) : server.primaryPort;
  containerEngine.clearPortErrorsFromLogs(server.id);

  const isRunning = containerEngine.isServerProcessRunning(server.id);
  if (isRunning) {
    containerEngine.appendLog(
      server.id,
      `\r\n\x1b[32m[AetherPanel Port Free]\x1b[0m ✅ Server saat ini sedang berjalan aktif. Status port ${port} normal & riwayat bentrok telah dibersihkan.\r\n`
    );
    return res.json({ success: true, message: `Server sedang aktif berjalan. Status port ${port} aman!` });
  }

  await containerEngine.freePortIfOccupiedGraceful(port);
  if (server.extraPorts) {
    for (const ep of server.extraPorts) {
      await containerEngine.freePortIfOccupiedGraceful(ep);
    }
  }

  containerEngine.appendLog(
    server.id,
    `\r\n\x1b[32m[AetherPanel Port Free]\x1b[0m ✅ Port ${port} berhasil dibebaskan dari proses zombie.\r\n`
  );

  res.json({ success: true, message: `Port ${port} berhasil dibebaskan!` });
});

// STDIN OR OFFLINE COMMAND EXECUTION
app.post('/api/servers/:id/command', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Command required' });
  }

  const cleanCmd = command.trim();
  const lowerCmd = cleanCmd.toLowerCase();

  // Handle lifecycle commands typed into Console Terminal
  if (lowerCmd === 'npm start' || lowerCmd === 'npm run start' || lowerCmd === 'start' || lowerCmd === 'yarn start' || lowerCmd === 'pnpm start') {
    if (server.status === 'running') {
      containerEngine.appendLog(server.id, `\x1b[36m[AetherPanel]\x1b[0m 🔄 Memulai ulang server via perintah '${cleanCmd}'...\r\n`);
      containerEngine.restartServer(server.id).catch(() => {});
    } else {
      containerEngine.appendLog(server.id, `\x1b[32m[AetherPanel]\x1b[0m 🚀 Menyalakan server via perintah '${cleanCmd}'...\r\n`);
      containerEngine.startServer(server.id).catch(() => {});
    }
    return res.json({ success: true, message: 'Server disiapkan' });
  }

  if (lowerCmd === 'npm stop' || lowerCmd === 'stop' || lowerCmd === 'yarn stop') {
    containerEngine.appendLog(server.id, `\x1b[33m[AetherPanel]\x1b[0m 🛑 Menghentikan server via perintah '${cleanCmd}'...\r\n`);
    containerEngine.stopServer(server.id).catch(() => {});
    return res.json({ success: true, message: 'Menghentikan server' });
  }

  if (lowerCmd === 'npm restart' || lowerCmd === 'restart' || lowerCmd === 'reload' || lowerCmd === 'yarn restart') {
    containerEngine.appendLog(server.id, `\x1b[36m[AetherPanel]\x1b[0m 🔄 Memulai ulang server via perintah '${cleanCmd}'...\r\n`);
    containerEngine.restartServer(server.id).catch(() => {});
    return res.json({ success: true, message: 'Memulai ulang server' });
  }

  if (lowerCmd === 'free-port' || lowerCmd === 'freeport' || lowerCmd === 'bebaskan-port' || lowerCmd === 'fix-port') {
    containerEngine.clearPortErrorsFromLogs(server.id);
    const isRunning = containerEngine.isServerProcessRunning(server.id);
    if (isRunning) {
      containerEngine.appendLog(
        server.id,
        `\r\n\x1b[32m[AetherPanel]\x1b[0m ✅ Server saat ini sedang aktif berjalan! Port ${server.primaryPort} normal & riwayat bentrok telah dibersihkan.\r\n`
      );
      return res.json({ success: true, message: 'Server sedang aktif berjalan, riwayat bentrok port dibersihkan' });
    }

    containerEngine.appendLog(server.id, `\x1b[36m[AetherPanel]\x1b[0m 🛠️ Membebaskan port ${server.primaryPort} dari proses zombie...\r\n`);
    await containerEngine.freePortIfOccupiedGraceful(server.primaryPort);
    if (server.extraPorts) {
      for (const ep of server.extraPorts) {
        await containerEngine.freePortIfOccupiedGraceful(ep);
      }
    }
    containerEngine.appendLog(server.id, `\x1b[32m[AetherPanel]\x1b[0m ✅ Port ${server.primaryPort} bebas! Menyalakan server...\r\n`);
    containerEngine.startServer(server.id).catch(() => {});
    return res.json({ success: true, message: 'Port bebas & server dinyalakan' });
  }

  if (lowerCmd === 'clear' || lowerCmd === 'cls') {
    return res.json({ success: true, action: 'clear' });
  }

  // Shell & Package CLI command pattern detection
  const shellReg = /^(ls|dir|cat|rm|unlink|del|mkdir|cp|mv|touch|chmod|chown|pwd|find|grep|head|tail|echo|which|df|free|ps|tar|zip|unzip|npm|yarn|pnpm|npx|bun|pip|pip3|python|python3|py|go|composer|php|java|javac|git|curl|wget)\b/i;
  const isShellCmd = shellReg.test(cleanCmd) || cleanCmd.includes('&&') || cleanCmd.includes(';') || cleanCmd.includes('||');

  if (isShellCmd || server.status !== 'running') {
    // Asynchronously execute CLI shell command inside server volume directory
    containerEngine.executeOneOff(server.id, cleanCmd, 60000).catch((err) => {
      console.warn(`[AetherPanel Exec] Command error (${cleanCmd}):`, err);
    });
    return res.json({ success: true, message: 'Command sent to container shell' });
  }

  let success = containerEngine.sendCommand(server.id, cleanCmd);
  if (!success) {
    // Fallback execute as shell command
    containerEngine.executeOneOff(server.id, cleanCmd, 60000).catch(() => {});
    success = true;
  }
  res.json({ success });
});

// EXEC ONE-OFF COMMAND (e.g. npm install, yarn install, pip install, ls -la)
app.post('/api/servers/:id/exec', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Perintah diperlukan' });
  try {
    const output = await containerEngine.executeOneOff(server.id, command, 60000);
    res.json({ success: true, output });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PACKAGE MANAGER APIS (NPM / YARN / PIP / PNPM)
app.get('/api/servers/:id/packages', flexAuth, (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  try {
    const details = containerEngine.getPackageDetails(server.id);
    res.json({ success: true, ...details });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/:id/packages/install', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const { packageName, isDev, clean, packageManager } = req.body;
  try {
    const result = await containerEngine.installNpmPackage(server.id, packageName, isDev, clean, packageManager);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servers/:id/packages/uninstall', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const { packageName } = req.body;
  if (!packageName) return res.status(400).json({ error: 'Nama paket diperlukan' });

  try {
    const result = await containerEngine.uninstallNpmPackage(server.id, packageName);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SCAN REQUIRED CODE PACKAGES & PLUGINS
app.get('/api/servers/:id/packages/scan', flexAuth, (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  try {
    const scan = containerEngine.scanAndDetectCodeDependencies(server.id);
    res.json({ success: true, ...scan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AUTO-FIX & INSTALL ALL MISSING CODE DEPENDENCIES
app.post('/api/servers/:id/packages/auto-fix', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  try {
    const scan = containerEngine.scanAndDetectCodeDependencies(server.id);
    if (scan.missingPackages.length === 0) {
      return res.json({ success: true, message: 'Semua dependensi modul sudah terpasang dengan lengkap.', installed: [] });
    }

    const results: string[] = [];
    for (const pkg of scan.missingPackages) {
      await containerEngine.installNpmPackage(server.id, pkg, false, false, 'npm');
      results.push(pkg);
    }

    containerEngine.appendLog(
      server.id,
      `\r\n\x1b[32m[AetherPanel Auto-Fix]\x1b[0m ✅ Berhasil menginstall ${results.length} paket yang diperlukan: ${results.join(', ')}.\r\n`
    );

    res.json({ success: true, message: `Berhasil menginstall ${results.length} paket!`, installed: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RECENT LOGS
app.get('/api/servers/:id/logs', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const logs = containerEngine.getRecentLogs(server.id);
  res.json({ success: true, logs });
});

// SSE LIVE STREAM FOR CONSOLE & STATS (Mobile & Desktop Compatible)
app.get('/api/servers/:id/stream', (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial connected ping
  res.write(`data: ${JSON.stringify({ type: 'connected', serverId: server.id })}\n\n`);

  // Heartbeat ping every 12 seconds to keep mobile networks & proxies from dropping connection
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {}
  }, 12000);

  // Stream logs
  const unsubLogs = containerEngine.subscribeLogs(server.id, (chunk) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'log', chunk })}\n\n`);
    } catch {}
  });

  // Stream stats
  const unsubStats = containerEngine.subscribeStats(server.id, (stats) => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'stats', stats })}\n\n`);
    } catch {}
  });

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    unsubLogs();
    unsubStats();
  });
});

// UPDATE SERVER SETTINGS & STARTUP
app.patch('/api/servers/:id/settings', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { name, startupCommand, entryFile, autoRestart, alwaysOn247, envVars } = req.body;
  const resolvedAlwaysOn = typeof alwaysOn247 === 'boolean'
    ? alwaysOn247
    : (typeof autoRestart === 'boolean' ? autoRestart : (server.alwaysOn247 ?? server.autoRestart ?? true));

  const updated = db.updateServer(server.id, {
    name: name || server.name,
    startupCommand: startupCommand || server.startupCommand,
    entryFile: entryFile || server.entryFile,
    autoRestart: autoRestart !== undefined ? Boolean(autoRestart) : resolvedAlwaysOn,
    alwaysOn247: resolvedAlwaysOn,
    envVars: envVars || server.envVars
  });

  res.json({ success: true, server: updated });
});

// TOGGLE 24/7 ALWAYS-ON MODE FOR A SERVER
app.post('/api/servers/:id/always-on', flexAuth, async (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const enabled = typeof req.body?.enabled === 'boolean'
    ? req.body.enabled
    : !(server.alwaysOn247 ?? server.autoRestart ?? true);

  const updated = await containerEngine.setAlwaysOn247(server.id, enabled);
  if (!updated) return res.status(404).json({ error: 'Server tidak ditemukan' });

  res.json({
    success: true,
    enabled,
    message: enabled
      ? 'Mode 24 Jam Non-Stop berhasil diaktifkan. Server akan otomatis dijaga tetap online.'
      : 'Mode 24 Jam Non-Stop dinonaktifkan.',
    server: updated
  });
});

// REINSTALL SERVER
app.post('/api/servers/:id/reinstall', flexAuth, async (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  await containerEngine.stopServer(server.id);
  await containerEngine.provisionEggFiles(server);
  await containerEngine.startServer(server.id);

  res.json({ success: true, message: 'Server berhasil di-reinstall dengan template awal' });
});

// NODE.JS RUNTIME VERSION MANAGEMENT
app.get('/api/servers/:id/node-versions', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const current = (server.nodeVersion || '22').replace(/[^0-9]/g, '') || '22';
  const versions = containerEngine.getAvailableNodeVersions(server.id);
  res.json({ success: true, current, versions });
});

app.post('/api/servers/:id/node-version', flexAuth, async (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const rawVersion = req.body?.version;
  const version = String(rawVersion || '').replace(/[^0-9]/g, '');

  if (!['18', '20', '22'].includes(version)) {
    return res.status(400).json({ error: 'Versi Node.js tidak valid. Pilihan: 18, 20, atau 22.' });
  }

  // Save new nodeVersion to server record
  const updated = db.updateServer(server.id, { 
    nodeVersion: version,
    envVars: { ...(server.envVars || {}), NODE_VERSION: version }
  });

  containerEngine.appendLog(
    server.id,
    `\r\n\x1b[36m[AetherPanel Runtime]\x1b[0m 🔄 Memilih runtime Node.js v${version}...\r\n`
  );

  // Download / prepare runtime if required
  if (version === '20' || version === '18') {
    await containerEngine.ensureNodeRuntime(version, server.id);
  }

  // If server is currently running, restart it to apply the new Node.js binary PATH immediately
  const isRunning = containerEngine.isServerProcessRunning(server.id);
  if (isRunning) {
    containerEngine.appendLog(
      server.id,
      `\x1b[33m[AetherPanel Runtime]\x1b[0m 🔄 Memulai ulang server agar runtime Node.js v${version} langsung aktif...\r\n`
    );
    await containerEngine.restartServer(server.id);
  }

  res.json({ 
    success: true, 
    message: `Versi Node.js berhasil disetel ke v${version}${isRunning ? ' dan server telah dimulai ulang' : ''}.`,
    current: version,
    server: updated
  });
});

// -------------------------------------------------------------
// FILE MANAGER APIS
// -------------------------------------------------------------
app.get('/api/servers/:id/files', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const relPath = (req.query.path as string) || '';
  try {
    const files = containerEngine.listFiles(server.uuid, relPath);
    res.json({ success: true, files, currentPath: relPath });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/servers/:id/files/content', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const filePath = (req.query.path as string) || '';
  try {
    const content = containerEngine.readFile(server.uuid, filePath);
    res.json({ success: true, content });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/servers/:id/files/content', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: filePath, content } = req.body;
  try {
    containerEngine.writeFile(server.uuid, filePath, content);
    res.json({ success: true, message: 'File berhasil disimpan' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/servers/:id/files/create', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: relPath, isDirectory } = req.body;
  try {
    if (isDirectory) {
      containerEngine.createDirectory(server.uuid, relPath);
    } else {
      containerEngine.writeFile(server.uuid, relPath, '');
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/servers/:id/files', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  let rawPaths: string[] = [];
  if (Array.isArray(req.body?.paths)) {
    rawPaths = req.body.paths;
  } else if (req.body?.path) {
    rawPaths = [req.body.path];
  } else if (req.query?.path) {
    rawPaths = [req.query.path as string];
  }

  const validPaths = rawPaths.filter(p => typeof p === 'string' && p.trim().length > 0);
  if (validPaths.length === 0) {
    return res.status(400).json({ error: 'Harap tentukan file atau folder yang ingin dihapus' });
  }

  try {
    let deletedCount = 0;
    for (const p of validPaths) {
      containerEngine.deleteFileOrDir(server.uuid, p.trim());
      deletedCount++;
    }
    res.json({ success: true, deletedCount, message: `${deletedCount} file/folder berhasil dihapus` });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal menghapus file' });
  }
});

app.post('/api/servers/:id/files/rename', requireAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { oldPath, newPath } = req.body;
  try {
    containerEngine.renameFile(server.uuid, oldPath, newPath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// UPLOAD SINGLE FILE
app.post('/api/servers/:id/files/upload', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: relPath, contentBase64 } = req.body;
  if (!relPath || !contentBase64) {
    return res.status(400).json({ error: 'File path and base64 content required' });
  }

  try {
    const buffer = Buffer.from(contentBase64, 'base64');
    containerEngine.writeBinaryFile(server.uuid, relPath, buffer);
    res.json({ success: true, message: `File ${path.basename(relPath)} berhasil diunggah/di-import` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// BATCH UPLOAD MULTIPLE FILES (PREVENTS HTTP 429 RATE LIMITING)
app.post('/api/servers/:id/files/batch-upload', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Daftar berkas tidak boleh kosong' });
  }

  try {
    let uploadedCount = 0;
    for (const f of files) {
      if (f.path && f.contentBase64) {
        const buffer = Buffer.from(f.contentBase64, 'base64');
        containerEngine.writeBinaryFile(server.uuid, f.path, buffer);
        uploadedCount++;
      }
    }
    res.json({ 
      success: true, 
      uploadedCount, 
      message: `${uploadedCount} berkas berhasil diunggah dalam 1 batch request` 
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal memproses batch upload' });
  }
});

// IMPORT FILE FROM URL
app.post('/api/servers/:id/files/import-url', flexAuth, async (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { url, targetPath } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL download required' });
  }

  try {
    let destPath = targetPath || '';
    if (!destPath || destPath.endsWith('/')) {
      try {
        const urlObj = new URL(url);
        const name = path.basename(urlObj.pathname) || 'imported_file.zip';
        destPath = destPath ? path.join(destPath, name) : name;
      } catch {
        destPath = destPath ? path.join(destPath, 'imported_file.zip') : 'imported_file.zip';
      }
    }

    await containerEngine.importFileFromUrl(server.uuid, destPath, url);
    res.json({ success: true, message: 'File berhasil di-import dari URL', path: destPath });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ZIP EXTRACTION / UNARCHIVE (With Zip-Slip Security Protection & Auto-Flatten)
app.post('/api/servers/:id/files/extract', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { path: zipPath, destination, deleteAfterExtract, flattenRootFolder } = req.body;
  try {
    const result = containerEngine.extractZip(
      server.uuid, 
      zipPath, 
      destination, 
      !!deleteAfterExtract, 
      !!flattenRootFolder
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// FLATTEN SUBFOLDER CONTENTS TO SERVER ROOT
app.post('/api/servers/:id/files/flatten-folder', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'Parameter folderPath diperlukan' });
  }

  try {
    const result = containerEngine.flattenFolderToRoot(server.uuid, folderPath);
    res.json({ 
      success: true, 
      message: `Berhasil memindahkan ${result.movedCount} berkas/folder ke direktori utama (Root)`,
      movedCount: result.movedCount 
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal memindahkan isi folder ke root' });
  }
});

// ARCHIVE FILES / FOLDERS TO ZIP
app.post('/api/servers/:id/files/archive', requireAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { paths, outputZipName } = req.body;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'Pilih minimal satu file/folder untuk diarsipkan' });
  }

  try {
    const zipName = containerEngine.compressFiles(server.uuid, paths, outputZipName);
    res.json({ success: true, message: `Berhasil mengarsipkan ke ${zipName}`, zipName });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DOWNLOAD FILE
app.get('/api/servers/:id/files/download', requireAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const filePath = (req.query.path as string) || '';
  try {
    const fullPath = containerEngine.resolveSafePath(server.uuid, filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File tidak ditemukan' });
    res.download(fullPath, path.basename(fullPath));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// GIT CLONE
app.post('/api/servers/:id/files/git-clone', requireAuth, async (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { repoUrl, branch } = req.body;
  try {
    await containerEngine.gitClone(server.uuid, repoUrl, branch || 'main');
    res.json({ success: true, message: 'Repository berhasil di-clone ke server' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// BACKUPS, SCHEDULES, DATABASES, SUBUSERS
// -------------------------------------------------------------
// -------------------------------------------------------------
// NOTIFICATION APIS
// -------------------------------------------------------------
app.get('/api/notifications', flexAuth, (req: any, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  const notifs = db.listNotifications(req.user?.id, isAdmin);
  const unreadCount = db.getUnreadNotificationCount(req.user?.id, isAdmin);
  res.json({ success: true, notifications: notifs, unreadCount });
});

app.post('/api/notifications/:id/read', flexAuth, (req, res) => {
  const ok = db.markNotificationAsRead(req.params.id);
  res.json({ success: ok });
});

app.post('/api/notifications/read-all', flexAuth, (req: any, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  db.markAllNotificationsAsRead(req.user?.id, isAdmin);
  res.json({ success: true });
});

app.delete('/api/notifications/:id', flexAuth, (req, res) => {
  const ok = db.deleteNotification(req.params.id);
  res.json({ success: ok });
});

app.post('/api/admin/notifications/test-email', requireAdmin, async (req: any, res) => {
  const { recipientEmail } = req.body;
  const target = recipientEmail || req.user.email;
  const sent = await notificationService.sendEmailNotification({
    to: target,
    title: 'Uji Coba Pengiriman Email AetherPanel',
    message: 'Selamat! Integrasi Nodemailer dan layanan SMTP pada panel hosting Anda berfungsi normal.\nSistem notifikasi siap mengirim status server, tagihan, dan peringatan keamanan.',
    category: 'system',
    severity: 'info',
    link: '/admin'
  });
  res.json({ 
    success: sent, 
    recipient: target, 
    message: sent ? 'Email uji coba berhasil dikirim!' : 'Pengiriman email simulasi selesai (cek log server).' 
  });
});

app.post('/api/admin/notifications/broadcast', requireAdmin, async (req: any, res) => {
  const { title, message, severity, sendEmail } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Judul dan pesan wajib diisi' });

  const users = db.listUsers();
  for (const user of users) {
    await notificationService.notifyUser({
      userId: user.id,
      title,
      message,
      category: 'system',
      severity: severity || 'info',
      sendEmail: !!sendEmail,
      recipientEmail: user.email
    });
  }
  res.json({ success: true, count: users.length });
});

// -------------------------------------------------------------
// BACKUPS & AUTOMATED SCHEDULES
// -------------------------------------------------------------
app.get('/api/servers/:id/backups', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const backups = db.listBackups(server.id);
  const slotsUsed = backups.length;
  const maxSlots = server.backupSlots || 2;

  res.json({ 
    success: true, 
    backups, 
    slotsUsed, 
    maxSlots,
    schedule: server.backupSchedule || { enabled: false, frequency: 'daily', targetHour: 2 }
  });
});

app.post('/api/servers/:id/backups', flexAuth, (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const currentBackups = db.listBackups(server.id);
  const maxSlots = server.backupSlots || 2;
  if (currentBackups.length >= maxSlots) {
    return res.status(400).json({ 
      error: `Slot backup penuh (${currentBackups.length}/${maxSlots}). Silakan hapus backup lama atau aktifkan jadwal rotasi otomatis.` 
    });
  }

  const { name } = req.body;
  const safeName = (name && name.trim()) || `Backup-${new Date().toISOString().slice(0, 10)}`;
  const backupArchive = containerEngine.createBackupArchive(server.uuid, safeName);

  const newBackup = db.createBackup({
    id: `bck-${crypto.randomBytes(5).toString('hex')}`,
    serverId: server.id,
    name: safeName,
    sizeBytes: Number(backupArchive.sizeBytes),
    checksum: crypto.randomBytes(8).toString('hex'),
    createdAt: new Date().toISOString(),
    filePath: backupArchive.filePath,
    isAutomatic: false
  });

  notificationService.notifyUser({
    userId: server.userId,
    title: `Backup Manual Berhasil: ${server.name}`,
    message: `Cadangan server "${server.name}" berhasil dibuat (${safeName}).`,
    category: 'backup',
    severity: 'success',
    link: `/servers/${server.id}?tab=backups`
  }).catch(() => {});

  res.json({ success: true, backup: newBackup });
});

// RESTORE BACKUP TO VOLUME
app.post('/api/servers/:id/backups/:bid/restore', flexAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const backup = db.findBackupById(req.params.bid);
  if (!backup) return res.status(404).json({ error: 'Data backup tidak ditemukan' });

  let archivePath = backup.filePath;
  if (!archivePath || !fs.existsSync(archivePath)) {
    const backupDir = path.resolve(process.cwd(), 'data', 'backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      const matched = files.find(f => f.startsWith(backup.name.replace(/[^a-zA-Z0-9_-]/g, '_')));
      if (matched) archivePath = path.join(backupDir, matched);
    }
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    return res.status(404).json({ error: 'File arsip fisik backup tidak ditemukan di storage server.' });
  }

  try {
    const wasRunning = containerEngine.isServerProcessRunning(server.id);
    if (wasRunning) {
      await containerEngine.stopServer(server.id);
    }

    containerEngine.restoreBackupArchive(server.uuid, archivePath);

    if (wasRunning) {
      await containerEngine.startServer(server.id);
    }

    notificationService.notifyUser({
      userId: server.userId,
      title: `Server Berhasil Dipulihkan: ${server.name}`,
      message: `Server "${server.name}" telah berhasil dipulihkan dari cadangan "${backup.name}".`,
      category: 'backup',
      severity: 'info',
      link: `/servers/${server.id}?tab=backups`
    }).catch(() => {});

    res.json({ success: true, message: `Server berhasil dipulihkan dari cadangan ${backup.name}` });
  } catch (err: any) {
    res.status(500).json({ error: `Gagal memulihkan backup: ${err.message}` });
  }
});

// DOWNLOAD BACKUP FILE DIRECTLY
app.get('/api/servers/:id/backups/:bid/download', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const backup = db.findBackupById(req.params.bid);
  if (!backup) return res.status(404).json({ error: 'Data backup tidak ditemukan' });

  let archivePath = backup.filePath;
  if (!archivePath || !fs.existsSync(archivePath)) {
    const backupDir = path.resolve(process.cwd(), 'data', 'backups');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      const matched = files.find(f => f.startsWith(backup.name.replace(/[^a-zA-Z0-9_-]/g, '_')));
      if (matched) archivePath = path.join(backupDir, matched);
    }
  }

  if (!archivePath || !fs.existsSync(archivePath)) {
    return res.status(404).json({ error: 'File arsip backup tidak ditemukan di penyimpanan server' });
  }

  const downloadFilename = `${backup.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
  res.download(archivePath, downloadFilename);
});

// DELETE BACKUP FILE & RECORD
app.delete('/api/servers/:id/backups/:bid', flexAuth, (req, res) => {
  const backup = db.findBackupById(req.params.bid);
  if (backup && backup.filePath && fs.existsSync(backup.filePath)) {
    try {
      fs.unlinkSync(backup.filePath);
    } catch {}
  }
  db.deleteBackup(req.params.bid);
  res.json({ success: true });
});

// BACKUP SCHEDULE CONFIGURATION
app.get('/api/servers/:id/backup-schedule', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  res.json({
    success: true,
    schedule: server.backupSchedule || { enabled: false, frequency: 'daily', targetHour: 2 },
    backupSlots: server.backupSlots || 2
  });
});

app.put('/api/servers/:id/backup-schedule', flexAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

  const { enabled, frequency, targetHour, hour, targetDayOfWeek, dayOfWeek } = req.body;
  const h = typeof targetHour === 'number' ? targetHour : (typeof hour === 'number' ? hour : 2);
  const d = typeof targetDayOfWeek === 'number' ? targetDayOfWeek : (typeof dayOfWeek === 'number' ? dayOfWeek : 0);
  const updatedSchedule: BackupScheduleConfig = {
    enabled: !!enabled,
    frequency: frequency === 'weekly' ? 'weekly' : (frequency === 'manual' ? 'manual' : 'daily'),
    hour: Math.max(0, Math.min(23, h)),
    targetHour: Math.max(0, Math.min(23, h)),
    dayOfWeek: Math.max(0, Math.min(6, d)),
    targetDayOfWeek: Math.max(0, Math.min(6, d)),
    maxSlots: server.backupSlots || 2,
    lastRunAt: server.backupSchedule?.lastRunAt,
    nextRunAt: server.backupSchedule?.nextRunAt
  };

  db.updateServer(server.id, { backupSchedule: updatedSchedule });
  res.json({ success: true, schedule: updatedSchedule });
});

app.get('/api/servers/:id/schedules', requireAuth, (req, res) => {
  res.json({ success: true, schedules: db.listSchedules(req.params.id) });
});

app.post('/api/servers/:id/schedules', requireAuth, (req, res) => {
  const { name, cronExpr, actionType, payload } = req.body;
  const sched = db.createSchedule({
    id: `sch-${crypto.randomBytes(5).toString('hex')}`,
    serverId: req.params.id,
    name,
    cronExpr,
    actionType,
    payload,
    isActive: true
  });
  res.json({ success: true, schedule: sched });
});

app.delete('/api/servers/:id/schedules/:sid', requireAuth, (req, res) => {
  db.deleteSchedule(req.params.sid);
  res.json({ success: true });
});

app.patch('/api/servers/:id/schedules/:sid/toggle', requireAuth, (req, res) => {
  const sched = db.toggleSchedule(req.params.sid);
  res.json({ success: true, schedule: sched });
});

// DATABASES
app.get('/api/servers/:id/databases', requireAuth, (req, res) => {
  res.json({ success: true, databases: db.listDatabases(req.params.id) });
});

app.post('/api/servers/:id/databases', requireAuth, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const currentDbs = db.listDatabases(server.id);
  if (currentDbs.length >= server.databaseCount) {
    return res.status(400).json({ error: `Batas database (${server.databaseCount}) telah tercapai.` });
  }

  const { name, dbType } = req.body;
  const dbName = `s${server.id.replace(/[^a-z0-9]/g, '').slice(0, 5)}_${name.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
  const username = `u_${crypto.randomBytes(3).toString('hex')}`;
  const password = `db_${crypto.randomBytes(6).toString('hex')}`;

  const newDb = db.createDatabaseInstance({
    id: `db-${crypto.randomBytes(5).toString('hex')}`,
    serverId: server.id,
    name: dbName,
    dbType: dbType || 'mysql',
    host: '103.147.154.21',
    port: 3306,
    username,
    password,
    createdAt: new Date().toISOString()
  });

  res.json({ success: true, database: newDb });
});

app.delete('/api/servers/:id/databases/:did', requireAuth, (req, res) => {
  db.deleteDatabaseInstance(req.params.did);
  res.json({ success: true });
});

// SUBUSERS
app.get('/api/servers/:id/subusers', requireAuth, (req, res) => {
  res.json({ success: true, subusers: db.listSubUsers(req.params.id) });
});

app.post('/api/servers/:id/subusers', requireAuth, (req, res) => {
  const { email, permissions } = req.body;
  const sub = db.createSubUser({
    id: `sub-${crypto.randomBytes(5).toString('hex')}`,
    serverId: req.params.id,
    email: email.toLowerCase().trim(),
    permissions: permissions || ['console', 'power', 'files'],
    createdAt: new Date().toISOString()
  });
  res.json({ success: true, subuser: sub });
});

app.delete('/api/servers/:id/subusers/:uid', requireAuth, (req, res) => {
  db.deleteSubUser(req.params.uid);
  res.json({ success: true });
});

// -------------------------------------------------------------
// RENEWAL & UPGRADE
// -------------------------------------------------------------
app.post('/api/servers/:id/renew', requireAuth, async (req: any, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { months } = req.body;
  const durationMonths = [1, 3, 6, 12].includes(months) ? months : 1;

  const quote = calculatePriceQuote({
    eggId: server.eggId,
    nodeId: server.nodeId,
    ramMb: server.ramMb,
    cpuPercent: server.cpuPercent,
    diskGb: server.diskGb,
    backupSlots: server.backupSlots,
    extraPorts: server.extraPorts.length,
    databases: server.databaseCount,
    durationMonths
  });

  const orderCode = `REN-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const orderRecord: OrderRecord = {
    id: `ord-${crypto.randomBytes(6).toString('hex')}`,
    orderCode,
    userId: req.user.id,
    customerName: req.user.name,
    customerEmail: req.user.email,
    customerPhone: req.user.phone || '-',
    status: 'PENDING',
    specs: {
      eggId: server.eggId,
      nodeId: server.nodeId,
      ramMb: server.ramMb,
      cpuPercent: server.cpuPercent,
      diskGb: server.diskGb,
      backupSlots: server.backupSlots,
      extraPorts: server.extraPorts.length,
      databases: server.databaseCount,
      durationMonths
    },
    priceQuote: quote,
    totalAmount: quote.totalPayable,
    durationMonths,
    serverId: server.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.createOrder(orderRecord);

  const qrisRes = await buatQrisClient.createTransaction({
    amount: quote.netTotal,
    description: `Perpanjangan Server ${server.name} (${durationMonths} Bulan)`,
    orderCode
  });

  if (!qrisRes.success || !qrisRes.data) {
    return res.status(502).json({ error: qrisRes.message || 'Gagal generate QRIS' });
  }

  const paymentRecord: PaymentRecord = {
    id: `pay-${crypto.randomBytes(6).toString('hex')}`,
    orderId: orderRecord.id,
    orderCode: orderRecord.orderCode,
    transactionId: qrisRes.data.transaction_id,
    amount: qrisRes.data.amount,
    totalAmount: qrisRes.data.total_amount,
    adminFee: qrisRes.data.admin_fee,
    creditAmount: qrisRes.data.credit_amount,
    feeBy: qrisRes.data.fee_by,
    qrisMethod: qrisRes.data.qris_method,
    qrUrl: qrisRes.data.qr_url,
    paymentUrl: qrisRes.data.payment_url,
    status: 'PENDING',
    isTest: buatQrisClient.getConfig().mode !== 'live',
    expiredAt: qrisRes.data.expired_at,
    createdAt: new Date().toISOString(),
    rawResponse: qrisRes.data
  };

  db.createPayment(paymentRecord);

  res.json({
    success: true,
    order: orderRecord,
    payment: paymentRecord,
    paymentMode: buatQrisClient.getConfig().mode
  });
});

// -------------------------------------------------------------
// ADMIN PANEL APIS
// -------------------------------------------------------------
app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const orders = db.listOrders();
  const servers = db.listAllServers();
  const users = db.listUsers();

  const totalRevenue = orders
    .filter(o => o.status === 'ACTIVE' || o.status === 'PAID')
    .reduce((acc, o) => acc + o.totalAmount, 0);

  const activeServers = servers.filter(s => !s.suspended).length;
  const runningServers = servers.filter(s => s.status === 'running').length;

  res.json({
    success: true,
    stats: {
      totalRevenue,
      totalOrders: orders.length,
      paidOrders: orders.filter(o => o.status === 'ACTIVE' || o.status === 'PAID').length,
      activeServers,
      runningServers,
      totalUsers: users.length,
      totalRamMb: servers.reduce((acc, s) => acc + s.ramMb, 0),
      totalDiskGb: servers.reduce((acc, s) => acc + s.diskGb, 0)
    }
  });
});

app.get('/api/admin/orders', requireAdmin, (_req, res) => {
  res.json({ success: true, orders: db.listOrders(), payments: db.listPayments() });
});

app.post('/api/admin/orders/:orderCode/manual-approve', requireAdmin, async (req, res) => {
  const result = await provisionOrderServer(req.params.orderCode);
  res.json(result);
});

app.post('/api/admin/orders/:orderCode/cancel', requireAdmin, (req, res) => {
  db.updateOrder(req.params.orderCode, { status: 'CANCELLED' });
  res.json({ success: true });
});

app.get('/api/admin/servers', requireAdmin, (_req, res) => {
  res.json({ success: true, servers: db.listAllServers() });
});

app.post('/api/admin/servers/:id/suspend', requireAdmin, (req, res) => {
  const server = db.findServerById(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const newSuspended = !server.suspended;
  if (newSuspended) {
    containerEngine.stopServer(server.id);
  }
  db.updateServer(server.id, { suspended: newSuspended, status: newSuspended ? 'suspended' : 'offline' });
  res.json({ success: true, suspended: newSuspended });
});

app.delete('/api/admin/servers/:id', requireAdmin, (req, res) => {
  containerEngine.killServer(req.params.id);
  db.deleteServer(req.params.id);
  res.json({ success: true });
});

// ADMIN: UPDATE MASA AKTIF / EXPIRY SERVER
app.post('/api/admin/servers/:id/expiry', requireAdmin, async (req: any, res) => {
  try {
    const { expiryOption, customHours } = req.body;
    const server = db.findServerById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Server tidak ditemukan' });

    let newExpiresAt = '2099-12-31T23:59:59.000Z';
    if (expiryOption === '24h') {
      newExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '3d') {
      newExpiresAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '7d') {
      newExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '30d') {
      newExpiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '1y') {
      newExpiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === 'custom' && customHours && Number(customHours) > 0) {
      newExpiresAt = new Date(Date.now() + Number(customHours) * 3600 * 1000).toISOString();
    }

    const updated = db.updateServer(server.id, {
      expiresAt: newExpiresAt,
      suspended: false,
      status: server.status === 'suspended' ? 'offline' : server.status
    });

    db.addActivityLog({
      userId: req.user.id,
      serverId: server.id,
      action: 'SERVER_EXPIRY_UPDATED',
      details: `Masa aktif server ${server.name} diperbarui oleh admin: ${expiryOption} (${newExpiresAt})`
    });

    res.json({ success: true, server: updated, expiresAt: newExpiresAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memperbarui masa aktif server' });
  }
});

// ADMIN: BACKGROUND SCHEDULER & CLEANUP APIS
app.get('/api/admin/scheduler/status', requireAdmin, (_req, res) => {
  const allServers = db.listAllServers();
  const alwaysOn247Count = allServers.filter(s => !s.suspended && s.autoRestart !== false && s.alwaysOn247 !== false).length;
  const runningServersCount = allServers.filter(s => containerEngine.isServerProcessRunning(s.id)).length;

  res.json({
    success: true,
    stats: {
      ...containerEngine.schedulerStats,
      uptimeSeconds: Math.floor((Date.now() - containerEngine.schedulerStats.startedAt) / 1000),
      activeServers: runningServersCount,
      alwaysOn247Count
    },
    serverCount: allServers.length
  });
});

app.post('/api/admin/scheduler/trigger', requireAdmin, (req: any, res) => {
  const result = containerEngine.triggerBackgroundCleanup(true);
  db.addActivityLog({
    userId: req.user.id,
    action: 'SCHEDULER_MANUAL_CLEANUP',
    details: `Admin memicu cleanup manual 24/7 scheduler`
  });
  res.json({ success: true, result });
});

app.post('/api/admin/scheduler/config', requireAdmin, (req: any, res) => {
  const { cleanupIntervalMs, autoCleanTempFiles } = req.body;
  if (cleanupIntervalMs && typeof cleanupIntervalMs === 'number' && cleanupIntervalMs >= 5000) {
    containerEngine.schedulerStats.cleanupIntervalMs = cleanupIntervalMs;
  }
  if (typeof autoCleanTempFiles === 'boolean') {
    containerEngine.schedulerStats.autoCleanTempFiles = autoCleanTempFiles;
  }
  res.json({ success: true, stats: containerEngine.schedulerStats });
});

// ADMIN: ANTI-LOSS DATABASE SNAPSHOT & BACKUP APIS
app.post('/api/admin/database/snapshot/create', requireAdmin, (req: any, res) => {
  const snapshot = db.createSnapshot();
  db.addActivityLog({
    userId: req.user.id,
    action: 'DATABASE_SNAPSHOT_CREATED',
    details: `Admin membuat snapshot database: ${snapshot.filename} (${snapshot.serverCount} servers)`
  });
  res.json({ success: true, snapshot });
});

app.get('/api/admin/database/snapshot/download', requireAdmin, (_req, res) => {
  const jsonStr = db.getDatabaseRaw();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=aether_db_snapshot_${Date.now()}.json`);
  res.send(jsonStr);
});

app.post('/api/admin/database/snapshot/restore', requireAdmin, (req: any, res) => {
  const { snapshotJson } = req.body;
  if (!snapshotJson) {
    return res.status(400).json({ error: 'Payload snapshot JSON wajib dikirimkan' });
  }
  const ok = db.restoreFromRaw(typeof snapshotJson === 'string' ? snapshotJson : JSON.stringify(snapshotJson));
  if (ok) {
    db.addActivityLog({
      userId: req.user.id,
      action: 'DATABASE_SNAPSHOT_RESTORED',
      details: `Admin berhasil memulihkan database dari snapshot`
    });
    return res.json({ success: true, message: 'Database & servers berhasil dipulihkan tanpa kehilangan data!' });
  } else {
    return res.status(500).json({ error: 'Gagal memulihkan database. Format JSON tidak valid.' });
  }
});

// ADMIN: CREATE UNLIMITED GB PANEL
app.post('/api/admin/servers/create-unlimited', requireAdmin, async (req: any, res) => {
  try {
    const { name, ownerEmail, eggId, nodeId, expiryOption, customHours } = req.body;
    if (!name || !ownerEmail) {
      return res.status(400).json({ error: 'Nama server dan email pemilik wajib diisi' });
    }

    let user = db.findUserByEmail(ownerEmail);
    if (!user) {
      user = db.createUser({
        email: ownerEmail,
        name: ownerEmail.split('@')[0],
        role: ownerEmail.toLowerCase() === 'rizramadhan975@gmail.com' ? 'ADMIN' : 'USER'
      });
    }

    const egg = DEFAULT_EGGS.find(e => e.id === eggId) || DEFAULT_EGGS[0];
    const node = db.getNodes().find(n => n.id === nodeId) || db.getNodes()[0];
    
    // Allocate guaranteed free port
    const allExistingServers = db.listAllServers();
    const usedPorts = new Set(allExistingServers.flatMap(s => [s.primaryPort, ...(s.extraPorts || []), ...(s.allocatedPorts || [])]));
    let primaryPort = egg.id === 'minecraft-java' ? 25565 : Math.floor(8000 + Math.random() * 2000);
    while (usedPorts.has(primaryPort)) {
      primaryPort = Math.floor(8000 + Math.random() * 2000);
    }
    await containerEngine.freePortIfOccupiedGraceful(primaryPort);

    // Calculate Expiration Date
    let expiresAtStr = '2099-12-31T23:59:59.000Z'; // Default Unlimited / Selamanya
    if (expiryOption === '24h') {
      expiresAtStr = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '3d') {
      expiresAtStr = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '7d') {
      expiresAtStr = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '30d') {
      expiresAtStr = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === '1y') {
      expiresAtStr = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    } else if (expiryOption === 'custom' && customHours && Number(customHours) > 0) {
      expiresAtStr = new Date(Date.now() + Number(customHours) * 3600 * 1000).toISOString();
    }

    const serverUuid = crypto.randomUUID();
    const serverId = `srv-unl-${crypto.randomBytes(4).toString('hex')}`;

    const serverInstance: ServerInstance = {
      id: serverId,
      uuid: serverUuid,
      name: name.includes('Unlimited') ? name : name + ' (Unlimited VIP)',
      description: 'Unlimited Storage & Memory Provisioned by Admin',
      status: 'starting',
      eggId: egg.id,
      nodeId: node.id,
      ip: node.ip,
      primaryPort,
      extraPorts: [primaryPort + 1, primaryPort + 2],
      allocatedPorts: [primaryPort, primaryPort + 1, primaryPort + 2],
      ramMb: 65536, // 64 GB
      cpuPercent: 800, // 8 Cores
      diskGb: 2000, // 2000 GB NVMe
      backupSlots: 50,
      databaseCount: 20,
      userId: user.id,
      userEmail: user.email,
      startsAt: new Date().toISOString(),
      expiresAt: expiresAtStr,
      suspended: false,
      autoRestart: true,
      crashCount: 0,
      startupCommand: egg.defaultStartup.replace('{{ENTRY_FILE}}', egg.entryFile),
      entryFile: egg.entryFile,
      envVars: { IS_UNLIMITED: 'true' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.createServer(serverInstance);
    await containerEngine.provisionEggFiles(serverInstance);
    setImmediate(() => {
      containerEngine.startServer(serverId).catch((err) => {
        console.warn(`[CreateUnlimited] Background startServer notice for ${serverId}:`, err);
      });
    });

    db.addActivityLog({
      userId: req.user.id,
      serverId: serverId,
      action: 'UNLIMITED_SERVER_CREATED',
      details: `Admin created unlimited GB server ${serverInstance.name} for ${ownerEmail} (Masa Aktif: ${expiryOption || 'Unlimited'})`
    });

    res.json({ success: true, server: serverInstance });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal membuat panel unlimited' });
  }
});

// ADMIN: PRICING RULES UPDATE
app.post('/api/admin/pricing', requireAdmin, (req, res) => {
  const updated = db.updatePricingRules(req.body);
  res.json({ success: true, pricingRules: updated });
});

// ADMIN: VOUCHER MANAGEMENT
app.get('/api/admin/vouchers', requireAdmin, (_req, res) => {
  res.json({ success: true, vouchers: db.getCoupons() });
});

app.post('/api/admin/vouchers', requireAdmin, (req, res) => {
  const { code, discountPercent, discountFixed, maxDiscount, maxUsage } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Kode voucher wajib diisi' });
  }

  const newVoucher = {
    id: `cpn-${Date.now().toString(36)}`,
    code: code.trim().toUpperCase(),
    discountPercent: discountPercent ? parseInt(discountPercent) : null,
    discountFixed: discountFixed ? parseInt(discountFixed) : null,
    maxDiscount: maxDiscount ? parseInt(maxDiscount) : null,
    maxUsage: maxUsage ? parseInt(maxUsage) : 100,
    usedCount: 0,
    isActive: true,
    createdAt: new Date().toISOString()
  };

  db.addCoupon(newVoucher);
  res.json({ success: true, voucher: newVoucher });
});

app.delete('/api/admin/vouchers/:code', requireAdmin, (req, res) => {
  db.deleteCoupon(req.params.code);
  res.json({ success: true });
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  res.json({ success: true, users: db.listUsers() });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { name, email, phone, role, password } = req.body;
  const user = db.createUser({
    name,
    email,
    phone,
    role,
    rawPassword: password || 'Aether1234'
  });
  res.json({ success: true, user });
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const updated = db.updateUser(req.params.id, req.body);
  res.json({ success: true, user: updated });
});

// PAYMENT SETTINGS (BuatQris)
app.get('/api/admin/payment-settings', requireAdmin, (_req, res) => {
  const config = db.getPaymentConfig();
  // Mask secret token & signing secret
  res.json({
    success: true,
    config: {
      ...config,
      secretTokenMasked: config.secretToken ? `••••••••${config.secretToken.slice(-4)}` : '',
      signingSecretMasked: config.signingSecret ? `••••••••${config.signingSecret.slice(-4)}` : '',
      webhookUrl: `${process.env.APP_URL || 'https://YOUR_DOMAIN.COM'}/api/webhooks/buatqris`
    }
  });
});

app.post('/api/admin/payment-settings', requireAdmin, (req, res) => {
  const { accountId, secretToken, signingSecret, mode, feeBy, defaultMethod, minAmount, maxAmount } = req.body;
  
  const current = db.getPaymentConfig();
  const updated = db.updatePaymentConfig({
    accountId: accountId || current.accountId,
    secretToken: (secretToken && !secretToken.includes('••••')) ? secretToken : current.secretToken,
    signingSecret: (signingSecret && !signingSecret.includes('••••')) ? signingSecret : current.signingSecret,
    mode: mode || current.mode,
    feeBy: feeBy || current.feeBy,
    defaultMethod: defaultMethod || current.defaultMethod,
    minAmount: minAmount ? parseInt(minAmount) : current.minAmount,
    maxAmount: maxAmount ? parseInt(maxAmount) : current.maxAmount
  });

  buatQrisClient.updateConfig({
    accountId: updated.accountId,
    secretToken: updated.secretToken,
    signingSecret: updated.signingSecret,
    mode: updated.mode,
    feeBy: updated.feeBy,
    defaultQrisMethod: updated.defaultMethod
  });

  res.json({ success: true, config: updated });
});

app.post('/api/admin/payment-settings/test-connection', requireAdmin, async (_req, res) => {
  // Test connection by generating small sandbox transaction
  const testRes = await buatQrisClient.createTransaction({
    amount: 1000,
    description: 'Test API Connection BuatQris',
    orderCode: 'TEST-CONN'
  });
  res.json(testRes);
});

// 9ROUTER SETTINGS
app.get('/api/admin/router-settings', requireAdmin, (_req, res) => {
  res.json({ success: true, config: db.getRouterConfig() });
});

app.post('/api/admin/router-settings', requireAdmin, (req, res) => {
  const updated = db.updateRouterConfig(req.body);
  res.json({ success: true, config: updated });
});

app.post('/api/admin/router-settings/test', requireAdmin, async (req, res) => {
  const { endpoint, apiKey } = req.body;
  const result = await nineRouter.testConnection(endpoint, apiKey);
  res.json(result);
});

// ACTIVITY LOGS
app.get('/api/admin/activity-logs', requireAdmin, (_req, res) => {
  res.json({ success: true, logs: db.listActivityLogs() });
});

// -------------------------------------------------------------
// VITE DEV SERVER MIDDLEWARE & STATIC SERVING
// -------------------------------------------------------------
async function bootstrapServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[AetherPanel] Unified Server running at http://0.0.0.0:${PORT}`);
    console.log(`[AetherPanel] 24/7 Keep-Alive Endpoint ready at /api/ping & /api/health`);
    console.log(`[AetherPanel] Default Admin: admin@aetherpanel.com / admin123`);
    console.log(`[AetherPanel] Default User: user@example.com / user123`);
    // Start automated backup scheduler and reminder worker
    backupScheduler.start();

    // 24/7 Internal Keep-Alive Heartbeat (every 4 minutes)
    const configuredAppUrl = process.env.APP_URL?.trim();
    const isSafeHttpsAppUrl = Boolean(configuredAppUrl && /^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?(\/.*)?$/.test(configuredAppUrl));

    setInterval(async () => {
      try {
        containerEngine.recordKeepAlivePing('internal_daemon');
        // Optional safe self-ping to configured HTTPS APP_URL (never accepts user-supplied URLs)
        if (isSafeHttpsAppUrl && configuredAppUrl) {
          const pingTarget = `${configuredAppUrl.replace(/\/+$/, '')}/api/ping?source=self_keepalive`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          await fetch(pingTarget, { method: 'GET', signal: controller.signal }).catch(() => {});
          clearTimeout(timeout);
        }
      } catch {}
    }, 4 * 60 * 1000);
  });
}

bootstrapServer().catch(err => {
  console.error('Fatal server boot error:', err);
  process.exit(1);
});
