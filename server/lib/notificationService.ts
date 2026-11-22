import nodemailer from 'nodemailer';
import WsModule, { WebSocketServer } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { db } from './db.js';
import type { AppNotification, NotificationCategory, NotificationSeverity } from '../../packages/shared/types.js';

type AuthenticatedWebSocket = InstanceType<typeof WsModule.WebSocket> & {
  isAlive?: boolean;
  userId?: string;
  userRole?: string;
  userEmail?: string;
};

class NotificationService {
  private transporter: any = null;
  private wss: InstanceType<typeof WebSocketServer> | null = null;
  private userSockets: Map<string, Set<AuthenticatedWebSocket>> = new Map();
  private adminSockets: Set<AuthenticatedWebSocket> = new Set();

  constructor() {
    this.initMailTransporter();
  }

  private initMailTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass && pass !== 'smtp_password') {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
          tls: { rejectUnauthorized: false }
        });
        console.log(`[SMTP] Transporter configured for host: ${host}:${port}`);
      } catch (err) {
        console.warn('[SMTP] Failed to initialize mail transporter:', (err as Error).message);
      }
    } else {
      console.log('[SMTP] Running in development mode with simulated email delivery.');
    }
  }

  public attachWebSocketServer(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (socket: any, req: IncomingMessage) => {
      const ws = socket as AuthenticatedWebSocket;
      ws.isAlive = true;

      // Check token in query param: /ws?token=xyz
      try {
        const url = new URL(req.url || '', 'http://localhost');
        const token = url.searchParams.get('token');
        if (token) {
          this.authenticateSocket(ws, token);
        }
      } catch {
        // Continue unauthenticated until message
      }

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data: Buffer | string) => {
        try {
          const payload = JSON.parse(data.toString());
          if (payload.type === 'auth' && payload.token) {
            this.authenticateSocket(ws, payload.token);
          } else if (payload.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch {
          // ignore non-json messages
        }
      });

      ws.on('close', () => {
        this.removeSocket(ws);
      });

      ws.on('error', () => {
        this.removeSocket(ws);
      });
    });

    // Heartbeat check every 30s
    const pingInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((client: any) => {
        const authWs = client as AuthenticatedWebSocket;
        if (authWs.isAlive === false) {
          this.removeSocket(authWs);
          return authWs.terminate();
        }
        authWs.isAlive = false;
        authWs.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(pingInterval);
    });

    console.log('[WebSocket] Realtime Notification WebSocket Server attached at /ws');
  }

  private authenticateSocket(ws: AuthenticatedWebSocket, token: string) {
    try {
      let userId: string | undefined;
      let userRole: string | undefined;
      let userEmail: string | undefined;

      // Check simple token format (userId.hex or raw userId)
      if (token.includes('.')) {
        const parts = token.split('.');
        const user = db.findUserById(parts[0]);
        if (user) {
          userId = user.id;
          userRole = user.role;
          userEmail = user.email;
        }
      } else {
        const user = db.findUserById(token);
        if (user) {
          userId = user.id;
          userRole = user.role;
          userEmail = user.email;
        }
      }

      if (!userId) {
        throw new Error('User not found');
      }

      ws.userId = userId;
      ws.userRole = userRole || 'USER';
      ws.userEmail = userEmail;

      // Register in user map
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(ws);

      if (ws.userRole === 'ADMIN') {
        this.adminSockets.add(ws);
      }

      ws.send(JSON.stringify({
        type: 'auth_success',
        userId,
        role: ws.userRole,
        message: 'Connected to realtime notification stream'
      }));
    } catch {
      ws.send(JSON.stringify({
        type: 'auth_error',
        message: 'Invalid or expired authentication token'
      }));
    }
  }

  private removeSocket(ws: AuthenticatedWebSocket) {
    if (ws.userId && this.userSockets.has(ws.userId)) {
      const set = this.userSockets.get(ws.userId)!;
      set.delete(ws);
      if (set.size === 0) {
        this.userSockets.delete(ws.userId);
      }
    }
    this.adminSockets.delete(ws);
  }

  public sendToUser(userId: string, payload: unknown) {
    const clients = this.userSockets.get(userId);
    if (!clients || clients.size === 0) return;
    const message = JSON.stringify(payload);
    clients.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  }

  public sendToAdmins(payload: unknown) {
    const message = JSON.stringify(payload);
    this.adminSockets.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  }

  public broadcast(payload: unknown) {
    if (!this.wss) return;
    const message = JSON.stringify(payload);
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  public broadcastServerStatus(serverId: string, status: string, serverName?: string) {
    const payload = {
      type: 'server_status',
      serverId,
      status,
      serverName,
      timestamp: new Date().toISOString()
    };
    this.broadcast(payload);
  }

  public async notifyUser(params: {
    userId: string;
    title: string;
    message: string;
    category: NotificationCategory;
    severity?: NotificationSeverity;
    link?: string;
    metadata?: Record<string, unknown>;
    sendEmail?: boolean;
    recipientEmail?: string;
  }): Promise<AppNotification> {
    const notif = db.createNotification({
      userId: params.userId,
      title: params.title,
      message: params.message,
      category: params.category,
      severity: params.severity || 'info',
      link: params.link,
      metadata: params.metadata
    });

    // Realtime WebSocket push
    this.sendToUser(params.userId, {
      type: 'notification',
      notification: notif
    });

    // Nodemailer Email dispatch
    if (params.sendEmail) {
      let email = params.recipientEmail;
      if (!email) {
        const user = db.getUserById(params.userId);
        email = user?.email;
      }

      if (email) {
        const sent = await this.sendEmailNotification({
          to: email,
          title: params.title,
          message: params.message,
          category: params.category,
          severity: params.severity || 'info',
          link: params.link
        });
        if (sent) {
          notif.emailSent = true;
        }
      }
    }

    return notif;
  }

  public async notifyAdmins(params: {
    title: string;
    message: string;
    category: NotificationCategory;
    severity?: NotificationSeverity;
    link?: string;
    metadata?: Record<string, unknown>;
    sendEmail?: boolean;
  }) {
    const users = db.listUsers();
    const admins = users.filter((u) => u.role === 'ADMIN');

    for (const admin of admins) {
      await this.notifyUser({
        userId: admin.id,
        title: `[ADMIN ALERT] ${params.title}`,
        message: params.message,
        category: params.category,
        severity: params.severity || 'warning',
        link: params.link,
        metadata: params.metadata,
        sendEmail: params.sendEmail,
        recipientEmail: admin.email
      });
    }

    // Direct push to active admin sockets
    this.sendToAdmins({
      type: 'admin_alert',
      title: params.title,
      message: params.message,
      category: params.category,
      severity: params.severity || 'warning',
      timestamp: new Date().toISOString()
    });
  }

  public async sendEmailNotification(params: {
    to: string;
    title: string;
    message: string;
    category: NotificationCategory;
    severity: NotificationSeverity;
    link?: string;
  }): Promise<boolean> {
    const from = process.env.SMTP_FROM || 'Aether Hosting <noreply@aetherpanel.internal>';
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const actionUrl = params.link ? (params.link.startsWith('http') ? params.link : `${appUrl}${params.link}`) : appUrl;

    const badgeColorMap: Record<string, string> = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      error: '#ef4444'
    };
    const badgeColor = badgeColorMap[params.severity] || '#3b82f6';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #f8fafc; }
    .card { max-width: 580px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4); }
    .header { padding: 24px; background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); text-align: left; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
    .content { padding: 28px 24px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #ffffff; background-color: ${badgeColor}; margin-bottom: 16px; }
    .title { font-size: 18px; font-weight: 600; color: #f8fafc; margin: 0 0 12px 0; }
    .message { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px 0; white-space: pre-line; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none; text-align: center; }
    .btn:hover { background-color: #0369a1; }
    .footer { padding: 16px 24px; background-color: #0f172a; border-top: 1px solid #334155; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Aether Hosting System Notification</h1>
    </div>
    <div class="content">
      <span class="badge">${params.category.toUpperCase()} • ${params.severity.toUpperCase()}</span>
      <h2 class="title">${params.title}</h2>
      <p class="message">${params.message}</p>
      ${params.link ? `<a href="${actionUrl}" class="btn">Buka Panel Hosting</a>` : ''}
    </div>
    <div class="footer">
      Email otomatis dari Aether Hosting Panel. Mohon tidak membalas email ini secara langsung.
    </div>
  </div>
</body>
</html>
    `.trim();

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: params.to,
          subject: `[AetherPanel] ${params.title}`,
          text: `${params.title}\n\n${params.message}\n\nAkses di: ${actionUrl}`,
          html: htmlBody
        });
        console.log(`[SMTP] Successfully sent email to ${params.to}: "${params.title}"`);
        return true;
      } catch (err) {
        console.error(`[SMTP] Failed sending email to ${params.to}:`, (err as Error).message);
        return false;
      }
    } else {
      console.log(`[SMTP Sim] To: ${params.to} | Subject: [AetherPanel] ${params.title} | Link: ${actionUrl}`);
      return true;
    }
  }
}

export const notificationService = new NotificationService();
