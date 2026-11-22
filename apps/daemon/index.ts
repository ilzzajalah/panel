import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { DockerDaemonEngine } from './dockerEngine.js';

const PORT = process.env.DAEMON_PORT ? parseInt(process.env.DAEMON_PORT) : 8080;
const DAEMON_TOKEN = process.env.DAEMON_TOKEN || 'aether_daemon_secret_token_change_in_production';

const app = express();
app.use(cors());
app.use(express.json());

const engine = new DockerDaemonEngine();

// Auth Middleware
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token || token !== DAEMON_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid daemon token' });
  }
  next();
}

// Heartbeat & Node Status
app.get('/api/v1/health', authMiddleware, (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Container lifecycle
app.post('/api/v1/servers', authMiddleware, async (req, res) => {
  try {
    const containerId = await engine.createServerContainer(req.body);
    res.json({ success: true, containerId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/v1/servers/:uuid/power', authMiddleware, async (req, res) => {
  const { uuid } = req.params;
  const { action } = req.body; // start, stop, restart, kill

  try {
    switch (action) {
      case 'start':
        await engine.startContainer(uuid);
        break;
      case 'stop':
        await engine.stopContainer(uuid);
        break;
      case 'restart':
        await engine.restartContainer(uuid);
        break;
      case 'kill':
        await engine.killContainer(uuid);
        break;
      default:
        return res.status(400).json({ error: 'Unknown power action' });
    }
    res.json({ success: true, action });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/api/v1/stream' });

wss.on('connection', async (ws: any, req: any) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  const serverUuid = url.searchParams.get('server');

  if (token !== DAEMON_TOKEN || !serverUuid) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  try {
    const writeStdin = await engine.attachConsole(serverUuid, (chunk: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk.toString('utf8'));
      }
    });

    ws.on('message', (msg: string) => {
      writeStdin(msg.toString());
    });
  } catch (err: any) {
    ws.send(`[Daemon] Error attaching to container: ${err.message}\r\n`);
  }
});

server.listen(PORT, () => {
  console.log(`[Aether Daemon] Node agent listening on port ${PORT}`);
});
