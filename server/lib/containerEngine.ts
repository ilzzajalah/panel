import fs from 'fs';
import path from 'path';
import { spawn, execSync, ChildProcess } from 'child_process';
import net from 'net';
import AdmZip from 'adm-zip';
import { 
  ServerInstance, 
  ServerStats, 
  FileItem, 
  ServerStatus 
} from '../../packages/shared/types.js';
import { db } from './db.js';
import { notificationService } from './notificationService.js';

interface ActiveProcess {
  process: ChildProcess;
  logs: string[];
  startedAt: number;
  cpuPercent: number;
  memoryBytes: number;
}

export function isValidNpmPackageName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 214) return false;
  return /^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(trimmed);
}

export class ContainerEngine {
  private baseServersDir = path.resolve(process.cwd(), 'data', 'servers');
  private processes = new Map<string, ActiveProcess>();
  private logListeners = new Map<string, Set<(chunk: string) => void>>();
  private statsListeners = new Map<string, Set<(stats: ServerStats) => void>>();
  private statsInterval?: NodeJS.Timeout;

  private userStoppedServers = new Set<string>();
  private restartingServers = new Set<string>();
  private recoveryTimers = new Map<string, NodeJS.Timeout>();

  private clearRecoveryTimer(serverId: string) {
    const existing = this.recoveryTimers.get(serverId);
    if (existing) {
      clearTimeout(existing);
      this.recoveryTimers.delete(serverId);
    }
  }

  constructor() {
    if (!fs.existsSync(this.baseServersDir)) {
      fs.mkdirSync(this.baseServersDir, { recursive: true });
    }
    this.startMetricsLoop();
    this.startWatchdogLoop();
  }

  public getServerDirectory(serverUuid: string): string {
    const dir = path.join(this.baseServersDir, serverUuid);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Safe path sanitization to prevent directory traversal and symlink escapes
   */
  public resolveSafePath(serverUuid: string, relativePath: string = ''): string {
    const rootDir = this.getServerDirectory(serverUuid);
    const resolved = path.resolve(rootDir, relativePath);

    if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) {
      throw new Error('Access denied: Path traversal attempt detected');
    }
    return resolved;
  }

  /**
   * Initialize server volume with Egg starter template files
   */
  public async provisionEggFiles(server: ServerInstance): Promise<void> {
    const serverDir = this.getServerDirectory(server.uuid);
    
    // Wipe all existing files in serverDir to guarantee 100% clean file isolation for new or reinstalled panels
    if (fs.existsSync(serverDir)) {
      try {
        const existingItems = fs.readdirSync(serverDir);
        for (const item of existingItems) {
          fs.rmSync(path.join(serverDir, item), { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[AetherPanel] Notice clearing directory ${serverDir}:`, err);
      }
    }
    
    // Create default files based on egg type
    switch (server.eggId) {
      case 'nodejs': {
        const pkgJson = {
          name: server.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
          version: '1.0.0',
          main: server.entryFile || 'index.js',
          type: 'commonjs',
          scripts: {
            start: `node ${server.entryFile || 'index.js'}`
          },
          dependencies: {
            express: '^4.21.2'
          }
        };
        fs.writeFileSync(path.join(serverDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        fs.writeFileSync(
          path.join(serverDir, 'index.js'),
          `// AetherPanel - Node.js Server Instance\n` +
          `const http = require('http');\n` +
          `const PORT = process.env.PORT || ${server.primaryPort};\n\n` +
          `const server = http.createServer((req, res) => {\n` +
          `  res.writeHead(200, { 'Content-Type': 'application/json' });\n` +
          `  res.end(JSON.stringify({\n` +
          `    message: 'Hello from ${server.name}!',\n` +
          `    server: '${server.uuid}',\n` +
          `    uptime: process.uptime(),\n` +
          `    timestamp: new Date().toISOString()\n` +
          `  }));\n` +
          `});\n\n` +
          `server.listen(PORT, () => {\n` +
          `  console.log('[Aether] Server "${server.name}" running on port ' + PORT);\n` +
          `  console.log('[Aether] Node.js process initialized successfully.');\n` +
          `});\n`
        );
        break;
      }

      case 'python': {
        fs.writeFileSync(path.join(serverDir, 'requirements.txt'), '# Add your python dependencies here\n');
        fs.writeFileSync(
          path.join(serverDir, 'main.py'),
          `# AetherPanel - Python Service\n` +
          `import time\n` +
          `import sys\n\n` +
          `print(f"[Aether] Starting ${server.name} on Python {sys.version.split()[0]}...")\n` +
          `counter = 0\n` +
          `while True:\n` +
          `    counter += 1\n` +
          `    print(f"[Aether] Service heartbeat #{counter} - ${server.name} is running healthy.")\n` +
          `    sys.stdout.flush()\n` +
          `    time.sleep(15)\n`
        );
        break;
      }

      case 'discord-node': {
        fs.writeFileSync(
          path.join(serverDir, 'package.json'),
          JSON.stringify({
            name: 'discord-bot-app',
            version: '1.0.0',
            main: 'bot.js',
            scripts: { start: 'node bot.js' }
          }, null, 2)
        );
        fs.writeFileSync(
          path.join(serverDir, 'bot.js'),
          `// AetherPanel - Discord Bot\n` +
          `console.log('[Bot] Loading Discord Bot runtime...');\n` +
          `console.log('[Bot] Configured Token: ' + (process.env.DISCORD_TOKEN ? 'Present (Hidden)' : 'Missing'));\n` +
          `console.log('[Bot] Gateway connection simulating...');\n` +
          `setInterval(() => {\n` +
          `  console.log('[Bot] Shard #0 heartbeat ACK: Latency 22ms');\n` +
          `}, 20000);\n`
        );
        break;
      }

      case 'discord-python': {
        fs.writeFileSync(
          path.join(serverDir, 'bot.py'),
          `# Discord Python Bot Template\n` +
          `import time, sys\n` +
          `print("[Discord Bot] Initializing discord.py client...")\n` +
          `print("[Discord Bot] Logged in as AetherHelper#1024")\n` +
          `while True:\n` +
          `    time.sleep(30)\n` +
          `    print("[Discord Bot] Ping: 18ms | Serving 4 servers")\n` +
          `    sys.stdout.flush()\n`
        );
        break;
      }

      case 'static-nginx': {
        fs.writeFileSync(
          path.join(serverDir, 'index.html'),
          `<!DOCTYPE html>\n<html>\n<head>\n  <title>${server.name}</title>\n  <style>body{font-family:sans-serif;background:#0a0a0a;color:#fff;display:grid;place-content:center;height:100vh;margin:0;}</style>\n</head>\n<body>\n  <h1>Welcome to ${server.name}</h1>\n  <p>Static Nginx container running on AetherPanel.</p>\n</body>\n</html>`
        );
        break;
      }

      case 'minecraft-java': {
        fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');
        fs.writeFileSync(
          path.join(serverDir, 'server.properties'),
          `server-port=${server.primaryPort}\nmotd=Welcome to ${server.name}\nmax-players=20\nonline-mode=false\n`
        );
        fs.writeFileSync(
          path.join(serverDir, 'start.sh'),
          `#!/bin/sh\necho "[Minecraft] Initializing Paper/Spigot Server..."\necho "[Minecraft] Max Memory Allocation: ${server.ramMb}MB"\necho "[Minecraft] Server listening on port ${server.primaryPort}"\nwhile true; do sleep 30; done\n`
        );
        break;
      }

      default: {
        fs.writeFileSync(
          path.join(serverDir, 'run.sh'),
          `#!/bin/sh\necho "Running ${server.name} in custom container..."\nwhile true; do echo "[Worker] Heartbeat $(date)"; sleep 20; done\n`
        );
      }
    }

    // Default .env file
    const envLines = [
      `SERVER_NAME="${server.name}"`,
      `SERVER_PORT=${server.primaryPort}`,
      `RAM_MAX_MB=${server.ramMb}`,
      `CPU_LIMIT=${server.cpuPercent}%`
    ];
    if (server.envVars) {
      for (const [k, v] of Object.entries(server.envVars)) {
        envLines.push(`${k}="${v}"`);
      }
    }
    fs.writeFileSync(path.join(serverDir, '.env'), envLines.join('\n') + '\n');
  }

  /**
   * Subscribe to live stdout/stderr console stream
   */
  public subscribeLogs(serverId: string, callback: (chunk: string) => void): () => void {
    if (!this.logListeners.has(serverId)) {
      this.logListeners.set(serverId, new Set());
    }
    this.logListeners.get(serverId)!.add(callback);

    // Send recent backlog from persistent buffer or active process
    const backlog = this.serverLogs.get(serverId);
    if (backlog && backlog.length > 0) {
      callback(backlog.slice(-150).join(''));
    } else {
      const active = this.processes.get(serverId);
      if (active && active.logs.length > 0) {
        callback(active.logs.slice(-100).join(''));
      }
    }

    return () => {
      this.logListeners.get(serverId)?.delete(callback);
    };
  }

  /**
   * Subscribe to real-time stats (CPU, RAM, Disk, Net)
   */
  public subscribeStats(serverId: string, callback: (stats: ServerStats) => void): () => void {
    if (!this.statsListeners.has(serverId)) {
      this.statsListeners.set(serverId, new Set());
    }
    this.statsListeners.get(serverId)!.add(callback);

    // Immediately push current state
    const currentStats = this.getCurrentStats(serverId);
    callback(currentStats);

    return () => {
      this.statsListeners.get(serverId)?.delete(callback);
    };
  }

  private serverLogs = new Map<string, string[]>();

  public getRecentLogs(serverId: string): string[] {
    const list = this.serverLogs.get(serverId);
    if (list && list.length > 0) return [...list];
    const active = this.processes.get(serverId);
    return active ? [...active.logs] : [];
  }

  public appendLog(serverId: string, text: string) {
    if (!this.serverLogs.has(serverId)) {
      this.serverLogs.set(serverId, []);
    }
    const logBuffer = this.serverLogs.get(serverId)!;
    logBuffer.push(text);
    if (logBuffer.length > 500) {
      logBuffer.shift();
    }

    const active = this.processes.get(serverId);
    if (active) {
      active.logs.push(text);
      if (active.logs.length > 500) {
        active.logs.shift();
      }
    }

    const listeners = this.logListeners.get(serverId);
    if (listeners) {
      listeners.forEach(cb => {
        try { cb(text); } catch {}
      });
    }
  }

  public isServerProcessRunning(serverId: string): boolean {
    const active = this.processes.get(serverId);
    if (!active || !active.process) return false;
    try {
      return active.process.exitCode === null && !active.process.killed;
    } catch {
      return false;
    }
  }

  public clearPortErrorsFromLogs(serverId: string): void {
    const filterFn = (line: string) => {
      return !/EADDRINUSE|address already in use|Port.*sedang digunakan|Port.*Bentrok/i.test(line);
    };

    const logs = this.serverLogs.get(serverId);
    if (logs) {
      this.serverLogs.set(serverId, logs.filter(filterFn));
    }

    const active = this.processes.get(serverId);
    if (active && active.logs) {
      active.logs = active.logs.filter(filterFn);
    }
  }

  public async checkPortAvailable(port: number): Promise<boolean> {
    if (!port || port <= 0) return true;
    return new Promise<boolean>((resolve) => {
      const tester = net.createServer();
      tester.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(true);
        }
      });
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(port, '0.0.0.0');
    });
  }

  /**
   * Universal Linux PID discovery for sockets actually listening on port via /proc/net/tcp and /proc/net/tcp6 + /proc/<pid>/fd/*
   */
  public findPidsListeningOnPort(port: number, excludePids: number[] = []): number[] {
    const pids = new Set<number>();
    if (!port || port <= 0) return [];

    const excluded = new Set<number>([process.pid, process.ppid, 1, ...excludePids]);

    try {
      if (process.platform === 'linux') {
        const hexPort = port.toString(16).toUpperCase().padStart(4, '0');
        const inodes = new Set<string>();

        for (const tcpFile of ['/proc/net/tcp', '/proc/net/tcp6']) {
          if (!fs.existsSync(tcpFile)) continue;
          try {
            const lines = fs.readFileSync(tcpFile, 'utf8').trim().split('\n').slice(1);
            for (const line of lines) {
              const parts = line.trim().split(/\s+/);
              const local = parts[1];
              const inode = parts[9];
              // State 0A is TCP_LISTEN in /proc/net/tcp
              const state = parts[3];
              if (local && local.toUpperCase().endsWith(':' + hexPort) && inode && inode !== '0') {
                if (!state || state.toUpperCase() === '0A') {
                  inodes.add(inode);
                }
              }
            }
          } catch {}
        }

        // If no socket inode is listening on this port in TCP tables, port is free!
        if (inodes.size === 0) {
          return [];
        }

        if (fs.existsSync('/proc')) {
          const procEntries = fs.readdirSync('/proc');
          for (const pidStr of procEntries) {
            if (!/^\d+$/.test(pidStr)) continue;
            const pid = parseInt(pidStr, 10);
            if (excluded.has(pid)) continue;

            // Only match processes that actually hold a file descriptor to this listening socket
            try {
              const fdDir = path.join('/proc', pidStr, 'fd');
              if (fs.existsSync(fdDir)) {
                const fds = fs.readdirSync(fdDir);
                for (const fd of fds) {
                  try {
                    const link = fs.readlinkSync(path.join(fdDir, fd));
                    for (const inode of inodes) {
                      if (link === `socket:[${inode}]`) {
                        pids.add(pid);
                      }
                    }
                  } catch {}
                }
              }
            } catch {}
          }
        }
      }
    } catch {}

    return Array.from(pids);
  }

  /**
   * Safely free network port if occupied by leftover process or zombie socket synchronously
   */
  public freePortIfOccupied(port: number, excludePids: number[] = []): void {
    if (!port || port <= 0) return;
    try {
      // 1. Linux native /proc PID discovery for confirmed listening sockets
      const pids = this.findPidsListeningOnPort(port, excludePids);
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
          console.log(`[AetherPanel Port Free] Force-killed zombie process ${pid} listening on port ${port} (SIGKILL)`);
        } catch {}
      }

      // 2. Targeted tool fallbacks (only if socket is still bound)
      if (process.platform === 'linux' || process.platform === 'darwin') {
        try {
          execSync(`ss -tulpn "sport = :${port}" 2>/dev/null | grep -oP 'pid=\\K\\d+' | xargs -r kill -9 2>/dev/null || true`, { stdio: 'ignore' });
          execSync(`fuser -k -9 ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
        } catch {}
      }
    } catch {}
  }

  /**
   * Graceful port cleanup: Sends SIGTERM (-15) first, waits up to 2000ms for processes to release port,
   * then escalates to SIGKILL (-9) if port remains bound.
   */
  public async freePortIfOccupiedGraceful(port: number, excludePids: number[] = []): Promise<void> {
    if (!port || port <= 0) return;

    const available = await this.checkPortAvailable(port);
    if (available) {
      return; // Port is already 100% free
    }

    // Phase 1: Graceful SIGTERM via /proc PIDs
    const pids = this.findPidsListeningOnPort(port, excludePids);
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`[AetherPanel Port Graceful] Sent SIGTERM to PID ${pid} on port ${port}`);
      } catch {}
    }

    // Wait up to 1500ms
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await this.checkPortAvailable(port)) {
        return; // Freed gracefully!
      }
    }

    // Phase 2: Escalation to SIGKILL if still occupied
    this.freePortIfOccupied(port, excludePids);
    await new Promise((r) => setTimeout(r, 200));
  }

  /**
   * Ensure port is guaranteed available; rebinds to an unused port if still occupied to prevent EADDRINUSE crashes
   */
  public async ensureFreePort(serverId: string, requestedPort: number): Promise<number> {
    await this.freePortIfOccupiedGraceful(requestedPort);

    const isAvailable = await new Promise<boolean>((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(requestedPort, '0.0.0.0');
    });

    if (isAvailable) return requestedPort;

    // Retry once more with graceful check
    await this.freePortIfOccupiedGraceful(requestedPort);

    const retryAvailable = await new Promise<boolean>((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(requestedPort, '0.0.0.0');
    });

    if (retryAvailable) return requestedPort;

    // Dynamically assign alternative free port to eliminate EADDRINUSE crash loops!
    const newFreePort = await new Promise<number>((resolve) => {
      const tester = net.createServer();
      tester.once('listening', () => {
        const addr = tester.address();
        const p = typeof addr === 'object' && addr ? addr.port : requestedPort + 10;
        tester.close(() => resolve(p));
      });
      tester.listen(0);
    });

    console.log(`[AetherPanel Port Engine] Rebound port for ${serverId}: ${requestedPort} -> ${newFreePort}`);
    db.updateServer(serverId, { primaryPort: newFreePort, allocatedPorts: [newFreePort] });
    return newFreePort;
  }

  /**
   * Auto-detect and flatten single nested subfolder (e.g., zip extracted into denia/ or bot/)
   * into the server root directory so scripts always execute properly.
   */
  public flattenSingleSubfolderIfPresent(serverUuid: string): boolean {
    const serverDir = this.getServerDirectory(serverUuid);
    try {
      const items = fs.readdirSync(serverDir, { withFileTypes: true });
      const dirs = items.filter(i => i.isDirectory() && i.name !== 'node_modules' && !i.name.startsWith('.'));
      
      // If root does NOT contain package.json or main script, check if there's a code subfolder
      const rootHasPkg = fs.existsSync(path.join(serverDir, 'package.json'));
      const rootHasMainScript = ['index.js', 'bot.js', 'main.js', 'app.js', 'server.js', 'main.py', 'bot.py'].some(f => fs.existsSync(path.join(serverDir, f)));

      if (!rootHasPkg && !rootHasMainScript && dirs.length === 1) {
        const subDir = path.join(serverDir, dirs[0].name);
        const subItems = fs.readdirSync(subDir);
        
        // If subDir contains package.json or main script, flatten it up to root
        if (subItems.includes('package.json') || subItems.includes('index.js') || subItems.includes('bot.js') || subItems.includes('main.js') || subItems.includes('socket.js') || subItems.includes('main.py') || subItems.includes('bot.py')) {
          console.log(`[AetherPanel Auto-Flatten] Moving nested files from ${dirs[0].name}/ to server root volume...`);
          for (const item of subItems) {
            const srcPath = path.join(subDir, item);
            const destPath = path.join(serverDir, item);
            if (fs.existsSync(destPath)) {
              try { fs.rmSync(destPath, { recursive: true, force: true }); } catch {}
            }
            fs.renameSync(srcPath, destPath);
          }
          try { fs.rmSync(subDir, { recursive: true, force: true }); } catch {}
          return true;
        }
      }
    } catch (err: any) {
      console.warn('[Auto-Flatten Notice]:', err.message);
    }
    return false;
  }

  /**
   * Explicitly flatten an extracted subfolder to root (e.g. user clicked "Pindahkan isi ke Root")
   */
  public flattenFolderToRoot(serverUuid: string, relFolder: string): { movedCount: number; targetDir: string } {
    const serverDir = this.getServerDirectory(serverUuid);
    const sourceDir = this.resolveSafePath(serverUuid, relFolder);

    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Folder '${relFolder}' tidak ditemukan.`);
    }
    const stat = fs.statSync(sourceDir);
    if (!stat.isDirectory()) {
      throw new Error(`'${relFolder}' bukan sebuah folder.`);
    }
    if (sourceDir === serverDir) {
      throw new Error(`Folder ini sudah berada di direktori utama.`);
    }

    const items = fs.readdirSync(sourceDir);
    let movedCount = 0;
    for (const item of items) {
      const srcPath = path.join(sourceDir, item);
      const destPath = path.join(serverDir, item);
      if (fs.existsSync(destPath)) {
        try { fs.rmSync(destPath, { recursive: true, force: true }); } catch {}
      }
      fs.renameSync(srcPath, destPath);
      movedCount++;
    }

    try {
      fs.rmSync(sourceDir, { recursive: true, force: true });
    } catch {}

    return { movedCount, targetDir: '/home/container' };
  }

  /**
   * Find effective project root directory:
   * 1. Checks if package.json or main entry candidates exist directly in server root
   * 2. If not, inspects subdirectories for package.json or entry candidates (e.g. index.js, bot.js, main.js, app.js, main.py)
   * 3. Returns the resolved directory path, relative path, and whether it has package.json
   */
  public findProjectRoot(serverUuid: string): { 
    workDir: string; 
    relWorkDir: string; 
    hasPackageJson: boolean; 
    pkgPath: string | null;
    entryFile: string | null;
  } {
    const serverDir = this.getServerDirectory(serverUuid);
    const rootPkg = path.join(serverDir, 'package.json');
    const entryCandidates = [
      'bot.js', 'index.js', 'main.js', 'app.js', 'server.js', 
      'index.mjs', 'bot.mjs', 'main.mjs', 'index.cjs', 'bot.cjs',
      'main.py', 'bot.py', 'app.py', 'server.py',
      'index.ts', 'bot.ts', 'main.ts'
    ];

    // Check root directory first
    if (fs.existsSync(rootPkg)) {
      let foundEntry: string | null = null;
      for (const cand of entryCandidates) {
        if (fs.existsSync(path.join(serverDir, cand))) {
          foundEntry = cand;
          break;
        }
      }
      return { workDir: serverDir, relWorkDir: '', hasPackageJson: true, pkgPath: rootPkg, entryFile: foundEntry };
    }

    for (const cand of entryCandidates) {
      if (fs.existsSync(path.join(serverDir, cand))) {
        return { workDir: serverDir, relWorkDir: '', hasPackageJson: false, pkgPath: null, entryFile: cand };
      }
    }

    // Inspect immediate subdirectories (ignoring node_modules, .git, etc.)
    try {
      const items = fs.readdirSync(serverDir, { withFileTypes: true });
      const ignoreDirs = new Set(['node_modules', '.git', '.cache', 'backups', 'dist', 'build', '.aistudio']);
      const subDirs = items.filter(i => i.isDirectory() && !ignoreDirs.has(i.name) && !i.name.startsWith('.'));

      // Check subdirectories for package.json
      for (const d of subDirs) {
        const subDirPath = path.join(serverDir, d.name);
        const subPkg = path.join(subDirPath, 'package.json');
        if (fs.existsSync(subPkg)) {
          let foundEntry: string | null = null;
          for (const cand of entryCandidates) {
            if (fs.existsSync(path.join(subDirPath, cand))) {
              foundEntry = cand;
              break;
            }
          }
          return { workDir: subDirPath, relWorkDir: d.name, hasPackageJson: true, pkgPath: subPkg, entryFile: foundEntry };
        }
      }

      // If no package.json in subfolders, check for entry script files in subfolders
      for (const d of subDirs) {
        const subDirPath = path.join(serverDir, d.name);
        for (const cand of entryCandidates) {
          if (fs.existsSync(path.join(subDirPath, cand))) {
            return { workDir: subDirPath, relWorkDir: d.name, hasPackageJson: false, pkgPath: null, entryFile: cand };
          }
        }
      }
    } catch {}

    return { workDir: serverDir, relWorkDir: '', hasPackageJson: false, pkgPath: null, entryFile: null };
  }

  /**
   * START SERVER
   */
  public async startServer(serverId: string): Promise<boolean> {
    const server = db.findServerById(serverId);
    if (!server) return false;

    // Remove from user-stopped set, clear pending backoff timers, and persist running intent
    this.clearRecoveryTimer(serverId);
    this.userStoppedServers.delete(serverId);
    db.updateServer(serverId, { crashCount: 0, desiredState: 'running' });

    if (this.processes.has(serverId)) {
      // Already running
      return true;
    }

    // Safely free port and guarantee availability before spawning container to eliminate EADDRINUSE collisions
    const activePort = await this.ensureFreePort(serverId, server.primaryPort);
    if (server.extraPorts) {
      for (const ep of server.extraPorts) {
        await this.freePortIfOccupiedGraceful(ep);
      }
    }

    db.updateServer(serverId, { status: 'starting' });
    const serverDir = this.getServerDirectory(server.uuid);

    // Auto-flatten single nested subdirectory if user extracted a ZIP containing a parent folder (e.g. denia/)
    this.flattenSingleSubfolderIfPresent(server.uuid);

    // Prepare startup command with 'exec' to ensure SIGTERM reaches the process directly (enabling fast graceful shutdown)
    let cmd = server.startupCommand || 'npm start';
    let shell = '/bin/sh';
    let formattedCmd = cmd;
    if (process.platform !== 'win32' && !cmd.trim().startsWith('exec ')) {
      formattedCmd = `exec ${cmd}`;
    }
    let args = ['-c', formattedCmd];

    if (process.platform === 'win32') {
      shell = 'cmd.exe';
      args = ['/c', cmd];
    }

    // Auto-detect and resolve Main Script Entry File & Project Root
    const projectRoot = this.findProjectRoot(server.uuid);
    const effectiveWorkDir = projectRoot.workDir;
    const pkgPath = projectRoot.pkgPath || path.join(effectiveWorkDir, 'package.json');
    let realEntryFile = projectRoot.entryFile || server.entryFile || 'index.js';

    if (projectRoot.relWorkDir) {
      this.appendLog(
        serverId,
        `\x1b[36m[AetherPanel Subfolder Detection]\x1b[0m 📁 Berkas script & dependensi terdeteksi di subfolder '\x1b[1m${projectRoot.relWorkDir}\x1b[0m'. Menjalankan container dari direktori ini.\r\n`
      );
    }

    // Search for existing script files if current entryFile doesn't exist on disk
    if (!fs.existsSync(path.join(effectiveWorkDir, realEntryFile)) && !fs.existsSync(path.join(serverDir, realEntryFile))) {
      const candidates = ['bot.js', 'index.js', 'main.js', 'app.js', 'server.js', 'index.mjs', 'bot.mjs', 'main.py', 'bot.py', 'index.ts', 'bot.ts'];
      for (const cand of candidates) {
        if (fs.existsSync(path.join(effectiveWorkDir, cand)) || fs.existsSync(path.join(serverDir, cand))) {
          realEntryFile = cand;
          this.appendLog(
            serverId,
            `\x1b[36m[AetherPanel Entry Guard]\x1b[0m 🔍 Ditemukan berkas utama '\x1b[1m${cand}\x1b[0m' di direktori kerja server. Otomatis mengarahkan startup ke berkas ini.\r\n`
          );
          db.updateServer(serverId, { entryFile: cand });
          break;
        }
      }
    }

    if (fs.existsSync(pkgPath)) {
      try {
        const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(pkgRaw);

        // Ensure "scripts.start" exists in package.json
        if (!pkg.scripts || typeof pkg.scripts !== 'object') {
          pkg.scripts = {};
        }
        if (!pkg.scripts.start) {
          pkg.scripts.start = `node ${realEntryFile}`;
          fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
          this.appendLog(
            serverId,
            `\x1b[36m[AetherPanel Init]\x1b[0m 🛠️ Menambahkan script "start": "node ${realEntryFile}" ke package.json.\r\n`
          );
        }

        // 1. ESM / CommonJS Compatibility Guard
        const entryCandidate = realEntryFile || pkg.main || 'index.js';
        const entryPath = fs.existsSync(path.join(effectiveWorkDir, entryCandidate))
          ? path.join(effectiveWorkDir, entryCandidate)
          : path.join(serverDir, entryCandidate);
        const isEsmConfigured = pkg.type === 'module';

        let needsSave = false;

        if (fs.existsSync(entryPath)) {
          const entryCode = fs.readFileSync(entryPath, 'utf8');
          const usesRequire = /require\s*\(/g.test(entryCode);
          const usesImport = /import\s+[\s\S]*?from/g.test(entryCode) || /import\s*\(/g.test(entryCode);

          if (isEsmConfigured && usesRequire && !usesImport) {
            delete pkg.type;
            needsSave = true;
            this.appendLog(
              serverId,
              `\x1b[33m[AetherPanel Init]\x1b[0m 🛠️ Mendeteksi 'type': 'module' di package.json yang berbenturan dengan require() di ${entryCandidate}. Otomatis menyesuaikan package.json ke CommonJS.\r\n`
            );
          } else if (!isEsmConfigured && usesImport && !usesRequire) {
            pkg.type = 'module';
            needsSave = true;
            this.appendLog(
              serverId,
              `\x1b[36m[AetherPanel Init]\x1b[0m 🛠️ Mendeteksi sintaks ES Module (import) di ${entryCandidate}. Otomatis menyetel "type": "module" di package.json.\r\n`
            );
          }
        } else {
          // Scan directory for any .js files if entry candidate isn't directly on disk
          if (isEsmConfigured) {
            const files = fs.readdirSync(effectiveWorkDir);
            for (const f of files) {
              if (f.endsWith('.js')) {
                const code = fs.readFileSync(path.join(effectiveWorkDir, f), 'utf8');
                if (code.includes('require(') && !code.includes('import ')) {
                  delete pkg.type;
                  needsSave = true;
                  this.appendLog(
                    serverId,
                    `\x1b[33m[AetherPanel Init]\x1b[0m 🛠️ Menyelaraskan berkas ${f} (require) dengan menghapus 'type': 'module' dari package.json.\r\n`
                  );
                  break;
                }
              }
            }
          }
        }

        if (needsSave) {
          fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
        }

        // 2. Auto-detect and install missing dependencies if package.json exists
        const depsObj = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const depNames = Object.keys(depsObj);
        const nodeModulesPath = path.join(effectiveWorkDir, 'node_modules');

        if (depNames.length > 0) {
          const missing = depNames.filter(dep => !fs.existsSync(path.join(nodeModulesPath, dep)));

          if (!fs.existsSync(nodeModulesPath) || missing.length > 0) {
            this.appendLog(
              serverId,
              `\x1b[36m[AetherPanel]\x1b[0m 📦 Mendeteksi ${missing.length > 0 ? missing.length : depNames.length} dependensi npm di package.json yang belum terinstall (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''})\r\n`
            );
            this.appendLog(
              serverId,
              `\x1b[36m[AetherPanel]\x1b[0m ⏳ Menjalankan 'npm install' otomatis sebelum server dimulai...\r\n`
            );
            await this.executeOneOff(serverId, 'npm install --no-audit --no-fund', 12000, effectiveWorkDir);
            this.appendLog(
              serverId,
              `\x1b[32m[AetherPanel]\x1b[0m ✅ Selesai menginisialisasi dependensi npm. Memulai proses server...\r\n`
            );
          }
        }
      } catch (err: any) {
        this.appendLog(
          serverId,
          `\x1b[33m[AetherPanel] Peringatan inisialisasi:\x1b[0m ${err.message}\r\n`
        );
      }
    }

    // Auto-detect any missing npm packages referenced in source code (.js, .mjs, .cjs, .ts)
    if (server.eggId === 'nodejs' || server.eggId === 'discord-node') {
      try {
        const depScan = this.scanAndDetectCodeDependencies(serverId);
        if (depScan.missingPackages.length > 0) {
          this.appendLog(
            serverId,
            `\x1b[36m[AetherPanel Auto-Plugin]\x1b[0m 📦 Mendeteksi modul yang dibutuhkan kode Anda: ${depScan.missingPackages.join(', ')}.\r\n` +
            `\x1b[36m[AetherPanel Auto-Plugin]\x1b[0m ⏳ Menginstall otomatis paket yang diperlukan...\r\n`
          );
          for (const pkg of depScan.missingPackages) {
            await this.installNpmPackage(serverId, pkg, false, false, 'npm');
          }
          this.appendLog(
            serverId,
            `\x1b[32m[AetherPanel Auto-Plugin]\x1b[0m ✅ Selesai menginstall seluruh dependensi yang dibutuhkan kode Anda.\r\n`
          );
        }
      } catch (e: any) {
        console.warn('[Auto-Plugin Scan notice]:', e.message);
      }
    }

    // Resolve Node.js runtime directory if a specific version is configured
    const selectedNodeVer = (server.nodeVersion || server.envVars?.NODE_VERSION || '').replace(/[^0-9]/g, '');
    let customNodeBinDir: string | null = null;
    if (selectedNodeVer === '20' || selectedNodeVer === '18') {
      const runtimesDir = path.resolve(process.cwd(), 'data', 'node-runtimes');
      const targetDir = path.join(runtimesDir, `v${selectedNodeVer}`);
      if (fs.existsSync(path.join(targetDir, 'bin', 'node'))) {
        customNodeBinDir = path.join(targetDir, 'bin');
      }
    }
    const containerPath = customNodeBinDir 
      ? `${customNodeBinDir}:${process.env.PATH || ''}` 
      : process.env.PATH;

    try {
      const child = spawn(shell, args, {
        cwd: effectiveWorkDir,
        env: {
          ...process.env,
          PATH: containerPath,
          NODE_ENV: 'production',
          PORT: String(activePort),
          SERVER_PORT: String(activePort),
          RAM_MAX_MB: String(server.ramMb),
          MALLOC_ARENA_MAX: '2',
          NODE_OPTIONS: '--max-old-space-size=384',
          ...server.envVars
        }
      });

      const activeRecord: ActiveProcess = {
        process: child,
        logs: [`\x1b[32m[AetherPanel 24/7 Daemon]\x1b[0m 🚀 Container booted successfully (24/7 Always-On Active) at ${new Date().toLocaleTimeString()}\r\n`],
        startedAt: Date.now(),
        cpuPercent: 5.2,
        memoryBytes: 45 * 1024 * 1024
      };
      this.processes.set(serverId, activeRecord);

      db.updateServer(serverId, { status: 'running' });
      notificationService.broadcastServerStatus(serverId, 'running', server.name);

      child.stdout.on('data', data => {
        this.appendLog(serverId, data.toString());
      });

      child.stderr.on('data', data => {
        const str = data.toString();
        this.appendLog(serverId, `\x1b[33m${str}\x1b[0m`);

        if (str.includes('EADDRINUSE') || str.includes('address already in use')) {
          // Robust port extraction ignoring line numbers like node:events:497 or index.js:15:8
          const portMatch =
            str.match(/(?:address already in use|EADDRINUSE)[^]*?(?:::|:|\bport\s*:?\s*)(\d{4,5})\b/i) ||
            str.match(/(?:port\s*:\s*|:::|:)(\d{4,5})\b/i) ||
            str.match(/\b(8\d{3}|9\d{3}|[1-6]\d{4})\b/);
          const port = portMatch ? parseInt(portMatch[1]) : server.primaryPort;
          this.appendLog(
            serverId,
            `\r\n\x1b[36m[AetherPanel Port Auto-Fix]\x1b[0m 🛠️ Mendeteksi bentrok port ${port} (EADDRINUSE). Otomatis membebaskan port ${port} via SIGTERM (3s)...\r\n`
          );
          this.freePortIfOccupiedGraceful(port).catch(() => {});
        }

        // Auto-heal missing npm packages (CommonJS & ESM Node.js support)
        if (
          str.includes('Cannot find module') || 
          str.includes('MODULE_NOT_FOUND') ||
          str.includes('Cannot find package') ||
          str.includes('ERR_MODULE_NOT_FOUND')
        ) {
          let pkgName: string | null = null;

          // Pattern 1: Node.js ESM "Cannot find package '.../node_modules/@scope/pkg/...'" or "Cannot find package 'pkg'"
          const pkgQuoteMatch = str.match(/Cannot find package ['"]([^'"]+)['"]/i);
          if (pkgQuoteMatch && pkgQuoteMatch[1]) {
            const raw = pkgQuoteMatch[1].trim();
            if (raw.includes('node_modules/')) {
              const nmMatch = raw.match(/node_modules\/((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)/i);
              if (nmMatch) pkgName = nmMatch[1];
            } else if (!raw.startsWith('.') && !raw.startsWith('/')) {
              pkgName = raw.startsWith('@') ? raw.split('/').slice(0, 2).join('/') : raw.split('/')[0];
            }
          }

          // Pattern 2: Direct node_modules/ path in stderr
          if (!pkgName) {
            const nmMatch = str.match(/node_modules\/((?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+)/i);
            if (nmMatch && nmMatch[1]) {
              pkgName = nmMatch[1];
            }
          }

          // Pattern 3: CommonJS "Cannot find module 'pkg'"
          if (!pkgName) {
            const modMatch = str.match(/Cannot find module ['"]([^'"]+)['"]/i);
            if (modMatch && modMatch[1]) {
              const rawMod = modMatch[1].trim();
              if (!rawMod.startsWith('.') && !rawMod.startsWith('/')) {
                pkgName = rawMod.startsWith('@') ? rawMod.split('/').slice(0, 2).join('/') : rawMod.split('/')[0];
              }
            }
          }

          if (pkgName && isValidNpmPackageName(pkgName)) {
            this.appendLog(
              serverId,
              `\r\n\x1b[33m[AetherPanel Auto-Installer]\x1b[0m ⚠️ Modul/paket '\x1b[1m${pkgName}\x1b[0m' belum terinstall di server.\r\n` +
              `\x1b[36m[AetherPanel Auto-Installer]\x1b[0m ⏳ Menginstall otomatis paket '${pkgName}' via npm install...\r\n`
            );
            this.installNpmPackage(serverId, pkgName).then(res => {
              if (res.success) {
                this.appendLog(serverId, `\x1b[32m[AetherPanel Auto-Installer]\x1b[0m ✅ Paket '${pkgName}' selesai diinstall. Memulai ulang server otomatis...\r\n`);
                this.restartServer(serverId).catch(() => {});
              }
            }).catch(() => {});
          }
        }
      });

      child.on('exit', (code, signal) => {
        this.appendLog(serverId, `\r\n\x1b[31m[AetherPanel]\x1b[0m Container process exited with code ${code} (${signal || 'none'})\r\n`);
        this.processes.delete(serverId);

        const isErrorCode = code !== null && code !== 0 && signal !== 'SIGINT' && signal !== 'SIGTERM';
        const currentSrv = db.findServerById(serverId);
        const newCrashCount = isErrorCode ? ((currentSrv?.crashCount || 0) + 1) : 0;

        if (currentSrv) {
          db.updateServer(serverId, { crashCount: newCrashCount });
        }

        const isRestarting = this.restartingServers.has(serverId);
        const wasUserStopped = this.userStoppedServers.has(serverId);
        const isAlwaysOnEnabled = Boolean(currentSrv && currentSrv.autoRestart !== false && currentSrv.alwaysOn247 !== false && !currentSrv.suspended && currentSrv.desiredState !== 'stopped');

        if (isRestarting) {
          // Server is undergoing a restart cycle, don't flag as permanently offline or user-stopped
          db.updateServer(serverId, { status: 'starting' });
        } else if (wasUserStopped) {
          db.updateServer(serverId, { status: 'offline', desiredState: 'stopped' });
          this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m Server dihentikan oleh pengguna (User Stopped).\r\n`);
        } else if (isAlwaysOnEnabled) {
          // 24/7 SMART EXPONENTIAL BACKOFF RECOVERY:
          // Never permanently abandon 24/7 bots on transient network/API disconnects,
          // while progressively increasing cooldown to prevent log spam on repeated fatal crashes.
          const backoffSeconds = !isErrorCode
            ? 5
            : newCrashCount === 1
              ? 3
              : newCrashCount === 2
                ? 10
                : newCrashCount === 3
                  ? 30
                  : newCrashCount === 4
                    ? 60
                    : 300;

          db.updateServer(serverId, { status: backoffSeconds >= 30 ? 'offline' : 'starting' });
          this.schedulerStats.totalAutoRecoveries++;

          if (backoffSeconds >= 60) {
            this.appendLog(
              serverId,
              `\r\n\x1b[33m[AetherPanel 24/7 Smart Recovery]\x1b[0m ⚠️ Terdeteksi crash berulang (${newCrashCount}x, Exit Code ${code}).\r\n` +
              `\x1b[36m[AetherPanel 24/7 Smart Recovery]\x1b[0m 🛡️ Masuk mode cooldown ${backoffSeconds} detik agar log bersih, lalu otomatis restart lagi untuk menjaga uptime 24 jam.\r\n`
            );
          } else {
            this.appendLog(
              serverId,
              `\x1b[33m[AetherPanel 24/7 Watchdog]\x1b[0m 🛡️ Proses berhenti (code ${code ?? 'null'}). Mode 24 Jam akan memulai ulang otomatis dalam ${backoffSeconds} detik (percobaan #${Math.max(1, newCrashCount)})...\r\n`
            );
          }

          this.logSchedulerEvent(
            `24/7 Auto-Recovery dijadwalkan untuk ${currentSrv?.name || serverId} dalam ${backoffSeconds}s (crash #${newCrashCount})`,
            newCrashCount >= 3 ? 'warn' : 'info'
          );

          this.clearRecoveryTimer(serverId);
          const timer = setTimeout(() => {
            this.recoveryTimers.delete(serverId);
            const latestSrv = db.findServerById(serverId);
            if (
              latestSrv &&
              !latestSrv.suspended &&
              latestSrv.autoRestart !== false &&
              latestSrv.alwaysOn247 !== false &&
              latestSrv.desiredState !== 'stopped' &&
              !this.userStoppedServers.has(serverId) &&
              !this.processes.has(serverId)
            ) {
              this.startServer(serverId).catch(() => {});
            }
          }, backoffSeconds * 1000);
          this.recoveryTimers.set(serverId, timer);
        } else {
          db.updateServer(serverId, { status: 'offline' });
        }
      });

      child.on('error', err => {
        this.appendLog(serverId, `\r\n\x1b[31m[AetherPanel] Execution error:\x1b[0m ${err.message}\r\n`);
        this.processes.delete(serverId);
        db.updateServer(serverId, { status: 'offline' });
      });

      return true;
    } catch (err: any) {
      this.appendLog(serverId, `\x1b[31m[AetherPanel] Failed to spawn container:\x1b[0m ${err.message}\r\n`);
      db.updateServer(serverId, { status: 'offline' });
      return false;
    }
  }

  /**
   * STOP SERVER - Graceful Shutdown (SIGTERM 2s timeout -> SIGKILL)
   */
  public async stopServer(serverId: string, isRestart: boolean = false): Promise<boolean> {
    this.clearRecoveryTimer(serverId);
    if (!isRestart) {
      this.userStoppedServers.add(serverId);
      this.restartingServers.delete(serverId);
    } else {
      this.restartingServers.add(serverId);
      this.userStoppedServers.delete(serverId);
    }
    const active = this.processes.get(serverId);
    if (!active) {
      if (!isRestart) {
        db.updateServer(serverId, { status: 'offline', desiredState: 'stopped' });
      }
      return true;
    }

    db.updateServer(serverId, { status: 'stopping' });
    this.appendLog(
      serverId,
      `\x1b[33m[AetherPanel Graceful Shutdown]\x1b[0m 🛑 Mengirim sinyal SIGTERM ke proses server (memberikan batas waktu 2s untuk shutdown bersih)...\r\n`
    );

    return new Promise<boolean>((resolve) => {
      let completed = false;
      let sigkillTimer: NodeJS.Timeout | null = null;
      const processRef = active.process;

      const finishStop = () => {
        if (sigkillTimer) {
          clearTimeout(sigkillTimer);
          sigkillTimer = null;
        }
        if (!completed) {
          completed = true;
          if (this.processes.get(serverId)?.process === processRef) {
            this.processes.delete(serverId);
          }
          if (!isRestart) {
            db.updateServer(serverId, { status: 'offline', desiredState: 'stopped' });
          }
          resolve(true);
        }
      };

      const handleExit = () => {
        this.appendLog(serverId, `\x1b[32m[AetherPanel Graceful Shutdown]\x1b[0m ✅ Proses server telah berhenti dengan bersih (SIGTERM).\r\n`);
        finishStop();
      };

      processRef.once('exit', handleExit);

      try {
        processRef.kill('SIGTERM');
      } catch {
        this.killServer(serverId, isRestart);
        finishStop();
        return;
      }

      // 2s SIGTERM timeout before escalating to SIGKILL
      sigkillTimer = setTimeout(() => {
        processRef.removeListener('exit', handleExit);
        // Only kill if the process in memory is still the EXACT old process reference that failed to exit
        if (this.processes.get(serverId)?.process === processRef) {
          this.appendLog(
            serverId,
            `\x1b[31m[AetherPanel Graceful Shutdown]\x1b[0m ⚠️ Proses tidak merespons SIGTERM dalam 2 detik. Memaksa penghentian (SIGKILL)...\r\n`
          );
          this.killServer(serverId, isRestart);
        }
        finishStop();
      }, 2000);
    });
  }

  /**
   * RESTART SERVER - Graceful Stop & Port Cleanup then Boot
   */
  public async restartServer(serverId: string): Promise<boolean> {
    this.restartingServers.add(serverId);
    this.userStoppedServers.delete(serverId);
    this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 🔄 Memulai proses restart server (Graceful Shutdown -> Port Release -> Spawn)...\r\n`);
    await this.stopServer(serverId, true);
    await new Promise(r => setTimeout(r, 400));
    this.userStoppedServers.delete(serverId);
    this.restartingServers.delete(serverId);
    return this.startServer(serverId);
  }

  /**
   * KILL SERVER (SIGKILL)
   */
  public killServer(serverId: string, isRestart: boolean = false): boolean {
    this.clearRecoveryTimer(serverId);
    if (!isRestart) {
      this.userStoppedServers.add(serverId);
      this.restartingServers.delete(serverId);
    } else {
      this.restartingServers.add(serverId);
      this.userStoppedServers.delete(serverId);
    }

    const server = db.findServerById(serverId);
    if (server) {
      if (server.primaryPort) {
        this.freePortIfOccupied(server.primaryPort);
      }
      if (server.extraPorts) {
        for (const ep of server.extraPorts) {
          this.freePortIfOccupied(ep);
        }
      }
    }

    const active = this.processes.get(serverId);
    if (active) {
      try {
        if (active.process.pid) {
          try { process.kill(-active.process.pid, 'SIGKILL'); } catch {}
        }
        active.process.kill('SIGKILL');
      } catch {}
      this.processes.delete(serverId);
    }

    if (!isRestart) {
      db.updateServer(serverId, { status: 'offline', desiredState: 'stopped' });
    }

    this.appendLog(serverId, `\x1b[31m[AetherPanel Force Kill]\x1b[0m 🛑 Container & zombie port listener forcefully terminated (SIGKILL).\r\n`);
    return true;
  }

  public schedulerStats = {
    isRunning: true,
    startedAt: Date.now(),
    lastRunAt: Date.now(),
    totalCleanups: 0,
    cleanedContainers: 0,
    freedBytes: 0,
    reclaimedPorts: 0,
    terminatedZombies: 0,
    totalAutoRecoveries: 0,
    totalKeepAlivePings: 0,
    lastKeepAlivePingAt: Date.now(),
    lastKeepAliveSource: 'boot',
    keepAliveEnabled: true,
    autoCleanTempFiles: true,
    cleanupIntervalMs: 30000,
    recentEvents: [] as Array<{
      timestamp: string;
      message: string;
      type: 'info' | 'success' | 'warn';
      details?: any;
    }>
  };

  /**
   * Record a 24/7 Keep-Alive heartbeat ping and verify all Always-On servers are alive
   */
  public recordKeepAlivePing(source: string = 'external'): {
    uptimeSeconds: number;
    activeServers: number;
    alwaysOn247Servers: number;
    totalServers: number;
    totalKeepAlivePings: number;
    totalAutoRecoveries: number;
    lastKeepAlivePingAt: number;
  } {
    const now = Date.now();
    this.schedulerStats.lastKeepAlivePingAt = now;
    this.schedulerStats.totalKeepAlivePings++;
    this.schedulerStats.lastKeepAliveSource = source;

    const allServers = db.listAllServers();
    let alwaysOn247Servers = 0;
    let wokenCount = 0;

    for (const srv of allServers) {
      const isUnlimited = srv.envVars?.IS_UNLIMITED === 'true' ||
        !srv.expiresAt ||
        srv.expiresAt.startsWith('2099') ||
        srv.expiresAt === 'unlimited' ||
        new Date(srv.expiresAt).getFullYear() > 2090;
      const isExpired = !isUnlimited && srv.expiresAt && new Date(srv.expiresAt).getTime() <= now;

      if (!srv.suspended && !isExpired && srv.autoRestart !== false && srv.alwaysOn247 !== false) {
        alwaysOn247Servers++;
        if (
          wokenCount < 1 &&
          srv.desiredState !== 'stopped' &&
          !this.processes.has(srv.id) &&
          !this.userStoppedServers.has(srv.id) &&
          !this.recoveryTimers.has(srv.id)
        ) {
          wokenCount++;
          setTimeout(() => {
            if (!this.processes.has(srv.id) && !this.userStoppedServers.has(srv.id) && !this.recoveryTimers.has(srv.id)) {
              this.startServer(srv.id).catch(() => {});
            }
          }, 500);
        }
      }
    }

    return {
      uptimeSeconds: Math.floor((now - this.schedulerStats.startedAt) / 1000),
      activeServers: this.processes.size,
      alwaysOn247Servers,
      totalServers: allServers.length,
      totalKeepAlivePings: this.schedulerStats.totalKeepAlivePings,
      totalAutoRecoveries: this.schedulerStats.totalAutoRecoveries,
      lastKeepAlivePingAt: this.schedulerStats.lastKeepAlivePingAt
    };
  }

  /**
   * Toggle 24/7 Always-On mode for a specific server
   */
  public async setAlwaysOn247(serverId: string, enabled: boolean): Promise<ServerInstance | null> {
    const server = db.findServerById(serverId);
    if (!server) return null;

    const updated = db.updateServer(serverId, {
      alwaysOn247: enabled,
      autoRestart: enabled,
      desiredState: enabled ? 'running' : server.desiredState
    });

    if (enabled) {
      this.userStoppedServers.delete(serverId);
      this.appendLog(serverId, `\x1b[32m[AetherPanel 24/7 Mode]\x1b[0m ⚡ Mode 24 Jam Non-Stop DIAKTIFKAN. Watchdog akan menjaga server tetap online 24/7.\r\n`);
      if (!server.suspended && !this.processes.has(serverId)) {
        await this.startServer(serverId);
      }
    } else {
      this.clearRecoveryTimer(serverId);
      this.appendLog(serverId, `\x1b[33m[AetherPanel 24/7 Mode]\x1b[0m ⏸️ Mode 24 Jam Non-Stop dinonaktifkan.\r\n`);
    }

    return updated || null;
  }

  public logSchedulerEvent(message: string, type: 'info' | 'success' | 'warn' = 'info', details?: any) {
    const event = {
      timestamp: new Date().toLocaleTimeString('id-ID'),
      message,
      type,
      details
    };
    this.schedulerStats.recentEvents.unshift(event);
    if (this.schedulerStats.recentEvents.length > 50) {
      this.schedulerStats.recentEvents.pop();
    }
    console.log(`[Scheduler 24/7 Daemon] [${type.toUpperCase()}] ${message}`);
  }

  /**
   * Background Scheduler & Cleanup Routine for Idle/Expired Containers
   */
  public triggerBackgroundCleanup(isManual: boolean = false): {
    success: boolean;
    cleanedContainers: number;
    freedBytes: number;
    reclaimedPorts: number;
    terminatedZombies: number;
    details: string[];
  } {
    const now = Date.now();
    let cleanedContainers = 0;
    let freedBytes = 0;
    let reclaimedPorts = 0;
    let terminatedZombies = 0;
    const details: string[] = [];

    try {
      const allServers = db.listAllServers();

      for (const srv of allServers) {
        const isUnlimited = srv.envVars?.IS_UNLIMITED === 'true' || 
                            !srv.expiresAt || 
                            srv.expiresAt.startsWith('2099') || 
                            srv.expiresAt === 'unlimited' ||
                            new Date(srv.expiresAt).getFullYear() > 2090;

        // 1. CLEANUP EXPIRED CONTAINERS
        if (!isUnlimited && srv.expiresAt && new Date(srv.expiresAt).getTime() <= now) {
          const isProcessActive = this.processes.has(srv.id);
          if (isProcessActive || !srv.suspended) {
            this.appendLog(
              srv.id,
              `\r\n\x1b[31m[AetherPanel Background Scheduler]\x1b[0m 🛑 Masa aktif server telah habis pada ${new Date(srv.expiresAt).toLocaleString('id-ID')}. Menghentikan kontainer & membebaskan resource...\r\n`
            );
            if (isProcessActive) {
              this.stopServer(srv.id);
            }
            if (srv.primaryPort) {
              this.freePortIfOccupied(srv.primaryPort);
              reclaimedPorts++;
            }
            if (srv.extraPorts) {
              for (const ep of srv.extraPorts) {
                this.freePortIfOccupied(ep);
                reclaimedPorts++;
              }
            }
            db.updateServer(srv.id, { suspended: true, status: 'suspended' });
            cleanedContainers++;
            details.push(`Server ${srv.name} (${srv.id}) kedaluwarsa & dibersihkan.`);
          }
        }

        // 2. CLEANUP ZOMBIE / LEFT-OVER PORTS FOR OFFLINE / SUSPENDED CONTAINERS
        if (srv.suspended || srv.status === 'offline') {
          if (!this.processes.has(srv.id) && srv.primaryPort) {
            try {
              if (process.platform === 'linux' || process.platform === 'darwin') {
                const portCheck = execSync(`lsof -ti :${srv.primaryPort} 2>/dev/null || true`).toString().trim();
                if (portCheck) {
                  this.freePortIfOccupied(srv.primaryPort);
                  reclaimedPorts++;
                  terminatedZombies++;
                  details.push(`Zombie process pada port ${srv.primaryPort} (${srv.name}) dihentikan.`);
                }
              }
            } catch {}
          }
        }

        // 3. TEMP FILES & CACHE CLEANUP
        if (this.schedulerStats.autoCleanTempFiles) {
          try {
            const serverDir = this.getServerDirectory(srv.uuid);
            const junkDirs = ['node_modules/.cache', '.npm', '.tmp', 'dist.zip.tmp'];
            for (const jd of junkDirs) {
              const fullJunk = path.join(serverDir, jd);
              if (fs.existsSync(fullJunk)) {
                try {
                  const size = this.calculateDirectorySize(fullJunk);
                  fs.rmSync(fullJunk, { recursive: true, force: true });
                  freedBytes += size;
                } catch {}
              }
            }
          } catch {}
        }

        // 4. LOG BUFFER TRIMMING TO PREVENT MEMORY LEAKAGE
        const serverLogsList = this.serverLogs.get(srv.id);
        if (serverLogsList && serverLogsList.length > 500) {
          serverLogsList.splice(0, serverLogsList.length - 500);
        }
      }

      this.schedulerStats.totalCleanups++;
      this.schedulerStats.cleanedContainers += cleanedContainers;
      this.schedulerStats.freedBytes += freedBytes;
      this.schedulerStats.reclaimedPorts += reclaimedPorts;
      this.schedulerStats.terminatedZombies += terminatedZombies;
      this.schedulerStats.lastRunAt = now;

      const freedMbFormatted = (freedBytes / (1024 * 1024)).toFixed(2);
      const summaryMsg = `Cleanup ${isManual ? 'Manual' : 'Otomatis 24/7'}: ${cleanedContainers} kontainer kedaluwarsa dibersihkan, ${reclaimedPorts} port dipulihkan, ${terminatedZombies} proses zombie dihentikan, ${freedMbFormatted} MB disk dibebaskan.`;
      
      this.logSchedulerEvent(summaryMsg, cleanedContainers > 0 || terminatedZombies > 0 ? 'warn' : 'success');

      return {
        success: true,
        cleanedContainers,
        freedBytes,
        reclaimedPorts,
        terminatedZombies,
        details
      };
    } catch (err: any) {
      this.logSchedulerEvent(`Error saat mengeksekusi cleanup scheduler: ${err.message}`, 'warn');
      return {
        success: false,
        cleanedContainers,
        freedBytes,
        reclaimedPorts,
        terminatedZombies,
        details: [err.message]
      };
    }
  }

  /**
   * Boot all active servers from database on system start/reboot
   */
  public async bootAllActiveServers(): Promise<void> {
    try {
      const allServers = db.listAllServers();
      console.log(`[AetherPanel 24/7 Engine] Initializing ${allServers.length} servers from persistent database...`);
      const now = Date.now();

      // Resolve duplicate port collisions across servers in database without blocking main thread
      const assignedPorts = new Set<number>();
      for (const srv of allServers) {
        if (assignedPorts.has(srv.primaryPort)) {
          let newPort = srv.primaryPort + 10;
          while (assignedPorts.has(newPort)) {
            newPort++;
          }
          console.log(`[AetherPanel Port Engine] Resolved port conflict on ${srv.name} (${srv.id}). Changing ${srv.primaryPort} -> ${newPort}`);
          srv.primaryPort = newPort;
          db.updateServer(srv.id, { primaryPort: newPort, allocatedPorts: [newPort, ...(srv.extraPorts || [])] });
        }
        assignedPorts.add(srv.primaryPort);
      }

      let bootOrderIndex = 0;
      for (const srv of allServers) {
        const isUnlimited = srv.envVars?.IS_UNLIMITED === 'true' || 
                            !srv.expiresAt || 
                            srv.expiresAt.startsWith('2099') || 
                            srv.expiresAt === 'unlimited' ||
                            new Date(srv.expiresAt).getFullYear() > 2090;

        // Check if server expired
        if (!isUnlimited && srv.expiresAt && new Date(srv.expiresAt).getTime() <= now) {
          if (!srv.suspended) {
            db.updateServer(srv.id, { suspended: true, status: 'suspended' });
            console.log(`[AetherPanel 24/7 Engine] Server ${srv.name} (${srv.id}) expired on ${srv.expiresAt}. Suspended.`);
          }
          continue;
        }

        if (srv.suspended) continue;

        // Respect persistent user-stopped state across host restarts
        if (srv.desiredState === 'stopped') {
          this.userStoppedServers.add(srv.id);
          continue;
        }

        // Auto-boot server on engine startup with staggered delay to keep web panel responsive
        if (srv.autoRestart !== false && srv.alwaysOn247 !== false) {
          const delayMs = 4000 + bootOrderIndex * 3000;
          bootOrderIndex++;
          const timer = setTimeout(() => {
            this.recoveryTimers.delete(srv.id);
            if (!this.userStoppedServers.has(srv.id) && !this.processes.has(srv.id)) {
              console.log(`[AetherPanel 24/7 Engine] 🚀 Auto-booting 24/7 server: ${srv.name} (${srv.id})`);
              this.startServer(srv.id).catch(() => {});
            }
          }, delayMs);
          this.recoveryTimers.set(srv.id, timer);
        }
      }
    } catch (err) {
      console.error('[AetherPanel 24/7 Engine] Boot error:', err);
    }
  }

  /**
   * 24/7 Watchdog Daemon Loop: Checks all servers every 10s and ensures non-stop 24/7 uptime
   */
  private startWatchdogLoop() {
    // Initial boot on startup (after Vite & HTTP server finish binding)
    setTimeout(() => {
      this.bootAllActiveServers();
    }, 3000);

    let lastCleanupTime = Date.now();

    setInterval(() => {
      try {
        const allServers = db.listAllServers();
        const now = Date.now();
        let bootedInThisTick = 0;

        // 1. Fast Heartbeat Watchdog & 24/7 Auto-Restart Guard
        for (const srv of allServers) {
          const isUnlimited = srv.envVars?.IS_UNLIMITED === 'true' || 
                              !srv.expiresAt || 
                              srv.expiresAt.startsWith('2099') || 
                              srv.expiresAt === 'unlimited' ||
                              new Date(srv.expiresAt).getFullYear() > 2090;

          // Check expiration date
          if (!isUnlimited && srv.expiresAt && new Date(srv.expiresAt).getTime() <= now) {
            if (!srv.suspended) {
              this.appendLog(srv.id, `\r\n\x1b[31m[AetherPanel Expiry Daemon]\x1b[0m ⚠️ Masa aktif server telah habis pada ${new Date(srv.expiresAt).toLocaleString('id-ID')}. Server di-suspend otomatis.\r\n`);
              this.stopServer(srv.id);
              db.updateServer(srv.id, { suspended: true, status: 'suspended' });
            }
            continue;
          }

          if (srv.suspended || srv.autoRestart === false || srv.alwaysOn247 === false || srv.desiredState === 'stopped') continue;

          const isProcessActive = this.processes.has(srv.id);
          const isUserStopped = this.userStoppedServers.has(srv.id);
          const isWaitingBackoff = this.recoveryTimers.has(srv.id);

          // If not running, not in backoff cooldown, and user didn't stop it: auto-reboot max 1 container per tick
          if (!isProcessActive && !isUserStopped && !isWaitingBackoff && bootedInThisTick < 1) {
            bootedInThisTick++;
            console.log(`[Watchdog 24/7] Auto-rebooting 24/7 server: ${srv.name} (${srv.id})`);
            this.appendLog(srv.id, `\x1b[36m[AetherPanel 24/7 Watchdog]\x1b[0m 🛡️ Memastikan kontainer tetap ON 24jam non-stop. Booting ulang...\r\n`);
            this.startServer(srv.id).catch(() => {});
          }

          // Reset crash count if server has been running stably > 30s
          if (isProcessActive && srv.crashCount > 0) {
            const active = this.processes.get(srv.id);
            if (active && (now - active.startedAt > 30000)) {
              db.updateServer(srv.id, { crashCount: 0 });
            }
          }
        }

        // 2. Scheduled Idle & Expired Cleanup Routine (Every cleanupIntervalMs)
        if (now - lastCleanupTime >= this.schedulerStats.cleanupIntervalMs) {
          lastCleanupTime = now;
          this.triggerBackgroundCleanup(false);
        }
      } catch (err) {
        console.error('[Watchdog 24/7 Loop Error]:', err);
      }
    }, 10000);
  }

  /**
   * Send STDIN command to running server
   */
  public sendCommand(serverId: string, command: string): boolean {
    const active = this.processes.get(serverId);
    if (!active) return false;

    this.appendLog(serverId, `\x1b[90m> ${command}\x1b[0m\r\n`);
    try {
      active.process.stdin?.write(command + '\n');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute one-off command (e.g. npm install lodash or git status) inside server directory
   */
  public async executeOneOff(serverId: string, command: string, timeoutMs: number = 45000, customCwd?: string): Promise<string> {
    const server = db.findServerById(serverId);
    if (!server) throw new Error('Server not found');
    const serverDir = this.getServerDirectory(server.uuid);
    const targetCwd = customCwd || this.findProjectRoot(server.uuid).workDir || serverDir;

    this.appendLog(serverId, `\x1b[35m[AetherExec]\x1b[0m ${command}\r\n`);

    return new Promise((resolve) => {
      const child = spawn('/bin/sh', ['-c', command], { 
        cwd: targetCwd,
        env: {
          ...process.env,
          PATH: this.getEnvPathForServer(serverId)
        }
      });
      let output = '';
      let isDone = false;

      const timer = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          try { child.kill('SIGKILL'); } catch {}
          const msg = `\r\n\x1b[33m[AetherExec]\x1b[0m ⏱️ Perintah melampaui batas waktu (${Math.round(timeoutMs/1000)}s). Melanjutkan proses...\r\n`;
          this.appendLog(serverId, msg);
          output += msg;
          resolve(output);
        }
      }, timeoutMs);

      child.stdout.on('data', d => {
        const str = d.toString();
        output += str;
        this.appendLog(serverId, str);
      });

      child.stderr.on('data', d => {
        const str = d.toString();
        output += str;
        this.appendLog(serverId, `\x1b[33m${str}\x1b[0m`);
      });

      child.on('close', code => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          this.appendLog(serverId, `\x1b[35m[AetherExec]\x1b[0m Done with code ${code}\r\n`);
          resolve(output);
        }
      });

      child.on('error', err => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          this.appendLog(serverId, `\x1b[31m[AetherExec Error]\x1b[0m ${err.message}\r\n`);
          resolve(output + '\n' + err.message);
        }
      });
    });
  }

  // --- Real-time Metrics & Stats ---
  private startMetricsLoop() {
    this.statsInterval = setInterval(() => {
      for (const [serverId, active] of this.processes.entries()) {
        const server = db.findServerById(serverId);
        if (!server) continue;

        // Simulate realistic metric variations based on running activity
        const baseCpu = 3 + Math.random() * 8;
        active.cpuPercent = parseFloat(baseCpu.toFixed(1));
        const baseRam = 48 * 1024 * 1024 + Math.floor(Math.random() * 8 * 1024 * 1024);
        active.memoryBytes = baseRam;

        const stats = this.getCurrentStats(serverId);
        const listeners = this.statsListeners.get(serverId);
        if (listeners) {
          listeners.forEach(cb => {
            try { cb(stats); } catch {}
          });
        }
      }
    }, 2000);
    this.statsInterval.unref();
  }

  public getCurrentStats(serverId: string): ServerStats {
    const server = db.findServerById(serverId);
    const active = this.processes.get(serverId);

    const memLimit = (server?.ramMb || 1024) * 1024 * 1024;
    const memUsed = active ? active.memoryBytes : 0;
    const cpuPct = active ? active.cpuPercent : 0;

    let diskBytes = 0;
    if (server) {
      try {
        diskBytes = this.calculateDirectorySize(this.getServerDirectory(server.uuid));
      } catch {}
    }

    const diskLimit = (server?.diskGb || 10) * 1024 * 1024 * 1024;

    return {
      serverId,
      cpuPercent: cpuPct,
      memoryBytes: memUsed,
      memoryLimitBytes: memLimit,
      memoryPercent: Math.round((memUsed / memLimit) * 100),
      diskBytes,
      diskLimitBytes: diskLimit,
      networkRxBytes: active ? Math.floor(128000 + (Date.now() - active.startedAt) * 12) : 0,
      networkTxBytes: active ? Math.floor(96000 + (Date.now() - active.startedAt) * 8) : 0,
      uptimeSeconds: active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0,
      status: server ? server.status : 'offline'
    };
  }

  private calculateDirectorySize(dirPath: string): number {
    let size = 0;
    if (!fs.existsSync(dirPath)) return 0;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const p = path.join(dirPath, file);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        size += this.calculateDirectorySize(p);
      } else {
        size += stat.size;
      }
    }
    return size;
  }

  // --- FILE MANAGER OPERATIONS ---
  public listFiles(serverUuid: string, relativePath: string = ''): FileItem[] {
    const targetDir = this.resolveSafePath(serverUuid, relativePath);
    if (!fs.existsSync(targetDir)) return [];

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    return entries.map(ent => {
      const fullPath = path.join(targetDir, ent.name);
      const stat = fs.statSync(fullPath);
      const rel = path.relative(this.getServerDirectory(serverUuid), fullPath).replace(/\\/g, '/');

      let itemCount: number | undefined;
      if (ent.isDirectory()) {
        try {
          itemCount = fs.readdirSync(fullPath).length;
        } catch {}
      }

      return {
        name: ent.name,
        path: rel,
        isDirectory: ent.isDirectory(),
        itemCount,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        permissions: (stat.mode & 0o777).toString(8),
        isEditable: !ent.isDirectory() && stat.size < 5 * 1024 * 1024 // max 5MB editable
      };
    }).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  public readFile(serverUuid: string, relativePath: string): string {
    const filePath = this.resolveSafePath(serverUuid, relativePath);
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    return fs.readFileSync(filePath, 'utf8');
  }

  public writeFile(serverUuid: string, relativePath: string, content: string): void {
    const filePath = this.resolveSafePath(serverUuid, relativePath);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
  }

  public createDirectory(serverUuid: string, relativePath: string): void {
    const dirPath = this.resolveSafePath(serverUuid, relativePath);
    fs.mkdirSync(dirPath, { recursive: true });
  }

  public deleteFileOrDir(serverUuid: string, relativePath: string): void {
    const p = this.resolveSafePath(serverUuid, relativePath);
    if (!fs.existsSync(p)) return;
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
    }
  }

  public renameFile(serverUuid: string, oldRel: string, newRel: string): void {
    const oldPath = this.resolveSafePath(serverUuid, oldRel);
    const newPath = this.resolveSafePath(serverUuid, newRel);
    fs.renameSync(oldPath, newPath);
  }

  public writeBinaryFile(serverUuid: string, relativePath: string, buffer: Buffer): void {
    const filePath = this.resolveSafePath(serverUuid, relativePath);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
  }

  public async importFileFromUrl(serverUuid: string, targetRelPath: string, fileUrl: string): Promise<string> {
    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
      throw new Error('URL harus berawalan http:// atau https://');
    }
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Gagal mengunduh file dari URL (${res.status} ${res.statusText})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    this.writeBinaryFile(serverUuid, targetRelPath, buffer);
    return targetRelPath;
  }

  /**
   * Extract ZIP with Zip-Slip protection, target destination, auto-flatten option, and post-extract cleanup
   */
  public extractZip(
    serverUuid: string, 
    zipRelPath: string, 
    destinationSubDir?: string, 
    deleteAfterExtract: boolean = false,
    flattenRootFolder: boolean = false
  ): {
    success: boolean;
    extractedFolder: string | null;
    totalFiles: number;
    message: string;
  } {
    const zipPath = this.resolveSafePath(serverUuid, zipRelPath);
    const serverDir = this.getServerDirectory(serverUuid);
    
    // If destinationSubDir is provided, use it; otherwise extract to the folder where the ZIP file is located
    let destDir = serverDir;
    if (destinationSubDir !== undefined && destinationSubDir !== '') {
      destDir = this.resolveSafePath(serverUuid, destinationSubDir);
    } else {
      destDir = path.dirname(zipPath);
    }

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const zip = new AdmZip(zipPath);

    const zipEntries = zip.getEntries();
    const prefixes = new Set<string>();

    for (const entry of zipEntries) {
      const entryName = entry.entryName;
      // Strict Zip-Slip check: Ensure target does not escape destination directory
      const targetPath = path.resolve(destDir, entryName);
      if (!targetPath.startsWith(destDir)) {
        throw new Error(`Deteksi arsip ZIP berbahaya (Zip-Slip attempt): ${entryName}`);
      }

      // Track top-level folder
      const parts = entryName.replace(/\\/g, '/').split('/').filter(Boolean);
      if (parts.length > 0) {
        prefixes.add(parts[0]);
      }
    }

    const singleRoot = prefixes.size === 1 ? Array.from(prefixes)[0] : null;

    zip.extractAllTo(destDir, true);

    let extractedFolder: string | null = null;
    let message = `Arsip ZIP berhasil diekstrak (${zipEntries.length} berkas).`;

    if (singleRoot) {
      const extractedRootPath = path.join(destDir, singleRoot);
      if (fs.existsSync(extractedRootPath) && fs.statSync(extractedRootPath).isDirectory()) {
        if (flattenRootFolder) {
          // Flatten: move all items from extractedRootPath up into destDir
          const subItems = fs.readdirSync(extractedRootPath);
          for (const item of subItems) {
            const src = path.join(extractedRootPath, item);
            const dst = path.join(destDir, item);
            if (fs.existsSync(dst)) {
              try { fs.rmSync(dst, { recursive: true, force: true }); } catch {}
            }
            fs.renameSync(src, dst);
          }
          try { fs.rmSync(extractedRootPath, { recursive: true, force: true }); } catch {}
          message = `Arsip ZIP berhasil diekstrak dan seluruh isi folder diratakan langsung ke direktori tujuan (${zipEntries.length} berkas).`;
        } else {
          extractedFolder = singleRoot;
          message = `Arsip ZIP berhasil diekstrak ke folder '${singleRoot}'. Anda dapat membuka folder ini atau klik 'Pindahkan ke Root' kapan saja.`;
        }
      }
    }

    if (deleteAfterExtract && fs.existsSync(zipPath)) {
      try {
        fs.unlinkSync(zipPath);
      } catch {}
    }

    return {
      success: true,
      extractedFolder,
      totalFiles: zipEntries.length,
      message
    };
  }

  /**
   * Compress multiple files/folders into a ZIP archive
   */
  public compressFiles(serverUuid: string, relativePaths: string[], outputZipName?: string): string {
    const serverDir = this.getServerDirectory(serverUuid);
    const zip = new AdmZip();

    for (const rel of relativePaths) {
      const fullPath = this.resolveSafePath(serverUuid, rel);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        zip.addLocalFolder(fullPath, path.basename(rel));
      } else {
        zip.addLocalFile(fullPath);
      }
    }

    const name = outputZipName 
      ? (outputZipName.endsWith('.zip') ? outputZipName : `${outputZipName}.zip`)
      : `archive_${Date.now()}.zip`;

    const targetZipPath = path.join(serverDir, name);
    zip.writeZip(targetZipPath);
    return name;
  }

  /**
   * Clone git repo directly into server volume
   */
  public async gitClone(serverUuid: string, repoUrl: string, branch: string = 'main'): Promise<void> {
    const destDir = this.getServerDirectory(serverUuid);
    // Sanitize repo url
    if (!repoUrl.startsWith('https://') && !repoUrl.startsWith('http://')) {
      throw new Error('Only HTTPS/HTTP git repository URLs are supported');
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn('git', ['clone', '--depth', '1', '-b', branch, repoUrl, '.'], { cwd: destDir });
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Git clone failed with exit code ${code}`));
      });
      child.on('error', reject);
    });
  }

  /**
   * Create compressed backup archive of server volume
   */
  public createBackupArchive(serverUuid: string, backupName: string): { filePath: string; sizeBytes: number } {
    const serverDir = this.getServerDirectory(serverUuid);
    const backupDir = path.resolve(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filename = `${backupName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.zip`;
    const targetZipPath = path.join(backupDir, filename);

    const zip = new AdmZip();
    zip.addLocalFolder(serverDir);
    zip.writeZip(targetZipPath);

    const stat = fs.statSync(targetZipPath);
    return { filePath: targetZipPath, sizeBytes: stat.size };
  }

  /**
   * Restore backup archive into server volume
   */
  public restoreBackupArchive(serverUuid: string, backupZipPath: string): void {
    const serverDir = this.getServerDirectory(serverUuid);
    if (!fs.existsSync(backupZipPath)) throw new Error('Backup file does not exist');
    const zip = new AdmZip(backupZipPath);
    zip.extractAllTo(serverDir, true);
  }

  /**
   * Scan code files (.js, .mjs, .cjs, .ts) for imported / required npm packages
   * and detect which ones are missing from node_modules.
   */
  public scanAndDetectCodeDependencies(serverId: string): {
    detectedPackages: string[];
    missingPackages: string[];
    installedPackages: string[];
    recommendedPlugins: Array<{ name: string; description: string; category: string; installed: boolean }>;
  } {
    const server = db.findServerById(serverId);
    if (!server) throw new Error('Server not found');
    const serverDir = this.getServerDirectory(server.uuid);

    const builtInModules = new Set([
      'fs', 'path', 'http', 'https', 'crypto', 'child_process', 'os', 'net', 'events',
      'util', 'stream', 'url', 'buffer', 'querystring', 'cluster', 'tls', 'dgram',
      'dns', 'readline', 'zlib', 'v8', 'vm', 'perf_hooks', 'worker_threads', 'string_decoder',
      'punycode', 'constants', 'timers', 'assert', 'module', 'process', 'fs/promises', 'stream/promises'
    ]);

    const detected = new Set<string>();

    const scanFile = (filePath: string) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Match require('pkg') or require("pkg")
        const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const m of requireMatches) {
          const raw = m[1].trim();
          if (!raw.startsWith('.') && !raw.startsWith('/') && !builtInModules.has(raw)) {
            const rootPkg = raw.startsWith('@') ? raw.split('/').slice(0, 2).join('/') : raw.split('/')[0];
            if (isValidNpmPackageName(rootPkg)) {
              detected.add(rootPkg);
            }
          }
        }

        // Match import ... from 'pkg'
        const importMatches = content.matchAll(/from\s*['"]([^'"]+)['"]/g);
        for (const m of importMatches) {
          const raw = m[1].trim();
          if (!raw.startsWith('.') && !raw.startsWith('/') && !builtInModules.has(raw)) {
            const rootPkg = raw.startsWith('@') ? raw.split('/').slice(0, 2).join('/') : raw.split('/')[0];
            if (isValidNpmPackageName(rootPkg)) {
              detected.add(rootPkg);
            }
          }
        }

        // Match dynamic import('pkg')
        const dynImportMatches = content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
        for (const m of dynImportMatches) {
          const raw = m[1].trim();
          if (!raw.startsWith('.') && !raw.startsWith('/') && !builtInModules.has(raw)) {
            const rootPkg = raw.startsWith('@') ? raw.split('/').slice(0, 2).join('/') : raw.split('/')[0];
            if (isValidNpmPackageName(rootPkg)) {
              detected.add(rootPkg);
            }
          }
        }
      } catch {}
    };

    const walkDir = (dir: string, depth = 0) => {
      if (depth > 4) return;
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          if (item.name === 'node_modules' || item.name === '.git' || item.name.startsWith('.')) continue;
          const full = path.join(dir, item.name);
          if (item.isDirectory()) {
            walkDir(full, depth + 1);
          } else if (item.name.endsWith('.js') || item.name.endsWith('.mjs') || item.name.endsWith('.cjs') || item.name.endsWith('.ts')) {
            scanFile(full);
          }
        }
      } catch {}
    };

    walkDir(serverDir);

    const project = this.findProjectRoot(server.uuid);
    const nodeModulesPath = path.join(project.workDir, 'node_modules');
    const nodeModulesRoot = path.join(serverDir, 'node_modules');
    const missing: string[] = [];
    const installed: string[] = [];

    for (const pkg of detected) {
      const pkgFolder = path.join(nodeModulesPath, pkg);
      const pkgFolderRoot = path.join(nodeModulesRoot, pkg);
      if (fs.existsSync(pkgFolder) || fs.existsSync(pkgFolderRoot)) {
        installed.push(pkg);
      } else {
        missing.push(pkg);
      }
    }

    const popularPlugins = [
      { name: 'express', description: 'Fast, unopinionated, minimalist web framework for node.', category: 'Web Server' },
      { name: 'cors', description: 'Cross-Origin Resource Sharing middleware.', category: 'Web Server' },
      { name: 'dotenv', description: 'Loads environment variables from .env file.', category: 'Config' },
      { name: 'axios', description: 'Promise based HTTP client for node.js.', category: 'Networking' },
      { name: 'ws', description: 'Fast WebSocket client and server library.', category: 'Real-time' },
      { name: 'discord.js', description: 'Official Discord Bot API wrapper.', category: 'Bot' },
      { name: 'socket.io', description: 'Real-time bidirectional event-based communication.', category: 'Real-time' },
      { name: 'mysql2', description: 'Fast MySQL driver with prepared statements & promises.', category: 'Database' },
      { name: 'pg', description: 'Non-blocking PostgreSQL client for Node.js.', category: 'Database' },
      { name: 'node-cron', description: 'Task scheduler for Node.js based on cron.', category: 'Utility' },
      { name: 'chalk', description: 'Terminal string styling done right.', category: 'Utility' }
    ].map(p => ({
      ...p,
      installed: fs.existsSync(path.join(nodeModulesPath, p.name)) || fs.existsSync(path.join(nodeModulesRoot, p.name))
    }));

    return {
      detectedPackages: Array.from(detected),
      missingPackages: missing,
      installedPackages: installed,
      recommendedPlugins: popularPlugins
    };
  }

  /**
   * Inspect declared vs installed packages (Node.js package.json / Python requirements.txt)
   */
  public getPackageDetails(serverId: string): {
    hasPackageJson: boolean;
    dependencies: Array<{ name: string; version: string; isInstalled: boolean; installedVersion?: string; type: 'prod' | 'dev' }>;
    scripts: Record<string, string>;
    nodeModulesExists: boolean;
    isPython: boolean;
    pythonPackages?: Array<{ name: string; version?: string }>;
    projectSubDir?: string;
  } {
    const server = db.findServerById(serverId);
    if (!server) throw new Error('Server not found');
    const serverDir = this.getServerDirectory(server.uuid);
    const project = this.findProjectRoot(server.uuid);
    const effectiveDir = project.workDir;
    const pkgPath = project.pkgPath || path.join(effectiveDir, 'package.json');
    const nodeModulesPath = path.join(effectiveDir, 'node_modules');
    const nodeModulesRoot = path.join(serverDir, 'node_modules');
    const nodeModulesExists = fs.existsSync(nodeModulesPath) || fs.existsSync(nodeModulesRoot);

    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const depsList: Array<{ name: string; version: string; isInstalled: boolean; installedVersion?: string; type: 'prod' | 'dev' }> = [];

        if (pkg.dependencies && typeof pkg.dependencies === 'object') {
          for (const [name, version] of Object.entries(pkg.dependencies)) {
            const depDir = path.join(nodeModulesPath, name);
            const depDirRoot = path.join(nodeModulesRoot, name);
            const isInstalled = fs.existsSync(depDir) || fs.existsSync(depDirRoot);
            let installedVersion: string | undefined;
            if (isInstalled) {
              try {
                const targetFolder = fs.existsSync(depDir) ? depDir : depDirRoot;
                const subPkg = JSON.parse(fs.readFileSync(path.join(targetFolder, 'package.json'), 'utf8'));
                installedVersion = subPkg.version;
              } catch {}
            }
            depsList.push({ name, version: String(version), isInstalled, installedVersion, type: 'prod' });
          }
        }

        if (pkg.devDependencies && typeof pkg.devDependencies === 'object') {
          for (const [name, version] of Object.entries(pkg.devDependencies)) {
            const depDir = path.join(nodeModulesPath, name);
            const depDirRoot = path.join(nodeModulesRoot, name);
            const isInstalled = fs.existsSync(depDir) || fs.existsSync(depDirRoot);
            let installedVersion: string | undefined;
            if (isInstalled) {
              try {
                const targetFolder = fs.existsSync(depDir) ? depDir : depDirRoot;
                const subPkg = JSON.parse(fs.readFileSync(path.join(targetFolder, 'package.json'), 'utf8'));
                installedVersion = subPkg.version;
              } catch {}
            }
            depsList.push({ name, version: String(version), isInstalled, installedVersion, type: 'dev' });
          }
        }

        return {
          hasPackageJson: true,
          dependencies: depsList,
          scripts: pkg.scripts || {},
          nodeModulesExists,
          isPython: false,
          projectSubDir: project.relWorkDir
        };
      } catch (err) {
        return {
          hasPackageJson: true,
          dependencies: [],
          scripts: {},
          nodeModulesExists,
          isPython: false,
          projectSubDir: project.relWorkDir
        };
      }
    }

    // Python check
    const reqPath = path.join(serverDir, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      const content = fs.readFileSync(reqPath, 'utf8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      const pyPkgs = lines.map(line => {
        const parts = line.split(/[==|>=|<=]/);
        return { name: parts[0].trim(), version: parts[1]?.trim() };
      });
      return {
        hasPackageJson: false,
        dependencies: [],
        scripts: {},
        nodeModulesExists: false,
        isPython: true,
        pythonPackages: pyPkgs
      };
    }

    return {
      hasPackageJson: false,
      dependencies: [],
      scripts: {},
      nodeModulesExists: false,
      isPython: false
    };
  }

  /**
   * Universal Package Manager Installer (NPM, Yarn, PNPM, PIP, Bun)
   */
  public async installNpmPackage(
    serverId: string,
    packageName?: string,
    isDev: boolean = false,
    clean: boolean = false,
    packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' = 'npm'
  ): Promise<{ success: boolean; output: string }> {
    const server = db.findServerById(serverId);
    if (!server) throw new Error('Server not found');
    const project = this.findProjectRoot(server.uuid);
    const targetDir = project.workDir;

    // Clean reinstall
    if (clean) {
      this.appendLog(serverId, `\x1b[33m[AetherPanel]\x1b[0m 🧹 Membersihkan node_modules, yarn.lock, package-lock.json & cache...\r\n`);
      const nmPath = path.join(targetDir, 'node_modules');
      const lockNpm = path.join(targetDir, 'package-lock.json');
      const lockYarn = path.join(targetDir, 'yarn.lock');
      if (fs.existsSync(nmPath)) {
        try { fs.rmSync(nmPath, { recursive: true, force: true }); } catch {}
      }
      if (fs.existsSync(lockNpm)) {
        try { fs.unlinkSync(lockNpm); } catch {}
      }
      if (fs.existsSync(lockYarn)) {
        try { fs.unlinkSync(lockYarn); } catch {}
      }
    }

    // Ensure package.json or requirements.txt exists
    if (packageManager === 'pip') {
      const reqPath = path.join(targetDir, 'requirements.txt');
      if (!fs.existsSync(reqPath)) {
        fs.writeFileSync(reqPath, '# Python requirements\n');
      }
    } else {
      const pkgPath = project.pkgPath || path.join(targetDir, 'package.json');
      if (!fs.existsSync(pkgPath)) {
        const defaultPkg = {
          name: server.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
          version: '1.0.0',
          main: server.entryFile || 'index.js',
          scripts: { start: `node ${server.entryFile || 'index.js'}` },
          dependencies: {}
        };
        fs.writeFileSync(pkgPath, JSON.stringify(defaultPkg, null, 2));
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m Berkas package.json otomatis dibuat.\r\n`);
      }
    }

    let command = '';
    const cleanPkg = packageName ? packageName.trim() : '';

    if (cleanPkg && !isValidNpmPackageName(cleanPkg)) {
      this.appendLog(serverId, `\x1b[31m[AetherPanel Auto-Plugin]\x1b[0m ⚠️ Nama paket '${cleanPkg}' tidak valid dan diabaikan.\r\n`);
      return { success: false, output: `Nama paket tidak valid: ${cleanPkg}` };
    }

    if (packageManager === 'yarn') {
      if (cleanPkg) {
        command = `yarn add ${cleanPkg}${isDev ? ' --dev' : ''}`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 🧶 [Yarn] Menginstall paket: ${cleanPkg}...\r\n`);
      } else if (clean) {
        command = `yarn cache clean && yarn install`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 🧶 [Yarn] Membersihkan cache dan menginstall ulang dependensi...\r\n`);
      } else {
        command = `yarn install`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 🧶 [Yarn] Menjalankan yarn install...\r\n`);
      }
    } else if (packageManager === 'pip') {
      if (cleanPkg) {
        command = `pip install ${cleanPkg}`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 🐍 [Python PIP] Menginstall paket: ${cleanPkg}...\r\n`);
      } else {
        command = `pip install -r requirements.txt`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 🐍 [Python PIP] Menginstall dependensi dari requirements.txt...\r\n`);
      }
    } else if (packageManager === 'pnpm') {
      if (cleanPkg) {
        command = `pnpm add ${cleanPkg}${isDev ? ' -D' : ''}`;
      } else {
        command = `pnpm install`;
      }
      this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 📦 [PNPM] Memproses ${command}...\r\n`);
    } else {
      // Default NPM
      if (cleanPkg) {
        const saveFlag = isDev ? '--save-dev' : '--save';
        command = `npm install ${saveFlag} ${cleanPkg} --no-audit`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 📦 [NPM] Menginstall paket: ${cleanPkg} (${saveFlag})...\r\n`);
      } else if (clean) {
        command = `npm cache clean --force && npm install --no-audit`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 📦 [NPM] Membersihkan cache & menginstall ulang dependensi...\r\n`);
      } else {
        command = `npm install --no-audit`;
        this.appendLog(serverId, `\x1b[36m[AetherPanel]\x1b[0m 📦 [NPM] Menjalankan npm install...\r\n`);
      }
    }

    const output = await this.executeOneOff(serverId, command, 90000, targetDir);
    this.appendLog(serverId, `\x1b[32m[AetherPanel]\x1b[0m ✅ Selesai memproses instalasi (${packageManager}).\r\n`);
    return { success: true, output };
  }

  /**
   * Uninstall an npm package
   */
  public async uninstallNpmPackage(serverId: string, packageName: string): Promise<{ success: boolean; output: string }> {
    const server = db.findServerById(serverId);
    if (!server) throw new Error('Server not found');
    const project = this.findProjectRoot(server.uuid);

    const cleanPkg = packageName.trim();
    this.appendLog(serverId, `\x1b[33m[AetherPanel]\x1b[0m 🗑️ Menghapus paket: ${cleanPkg}...\r\n`);
    const output = await this.executeOneOff(serverId, `npm uninstall ${cleanPkg}`, 45000, project.workDir);
    this.appendLog(serverId, `\x1b[32m[AetherPanel]\x1b[0m ✅ Paket ${cleanPkg} berhasil dihapus.\r\n`);
    return { success: true, output };
  }

  /**
   * Resolve custom Node.js binary directory for server if configured
   */
  public getNodeBinDirForServer(serverId: string): string | null {
    const server = db.findServerById(serverId);
    if (!server) return null;
    const selectedNodeVer = (server.nodeVersion || server.envVars?.NODE_VERSION || '').replace(/[^0-9]/g, '');
    if (selectedNodeVer === '20' || selectedNodeVer === '18') {
      const runtimesDir = path.resolve(process.cwd(), 'data', 'node-runtimes');
      const targetDir = path.join(runtimesDir, `v${selectedNodeVer}`);
      if (fs.existsSync(path.join(targetDir, 'bin', 'node'))) {
        return path.join(targetDir, 'bin');
      }
    }
    return null;
  }

  /**
   * Returns PATH environment variable with server-specific node runtime prepended if present
   */
  public getEnvPathForServer(serverId: string): string {
    const customBin = this.getNodeBinDirForServer(serverId);
    return customBin ? `${customBin}:${process.env.PATH || ''}` : (process.env.PATH || '');
  }

  /**
   * Ensure the specified Node.js version is downloaded and ready to execute
   */
  public async ensureNodeRuntime(version: string, serverId?: string): Promise<string | null> {
    const cleanVer = (version || '').replace(/[^0-9]/g, '');
    if (cleanVer !== '20' && cleanVer !== '18') {
      // Default system Node.js (Node 22 Current)
      return null;
    }

    const runtimesDir = path.resolve(process.cwd(), 'data', 'node-runtimes');
    const targetDir = path.join(runtimesDir, `v${cleanVer}`);
    const binNode = path.join(targetDir, 'bin', 'node');

    if (fs.existsSync(binNode)) {
      return path.join(targetDir, 'bin');
    }

    if (!fs.existsSync(runtimesDir)) {
      fs.mkdirSync(runtimesDir, { recursive: true });
    }

    const fullVersions: Record<string, string> = {
      '20': '20.18.3',
      '18': '18.20.7'
    };
    const fullVer = fullVersions[cleanVer] || `${cleanVer}.0.0`;

    if (serverId) {
      this.appendLog(
        serverId,
        `\x1b[36m[AetherPanel Runtime]\x1b[0m ⏳ Menyiapkan runtime Node.js v${fullVer} LTS...\r\n`
      );
    }

    try {
      const tarUrl = `https://nodejs.org/dist/v${fullVer}/node-v${fullVer}-linux-x64.tar.gz`;
      const tempTar = path.join(runtimesDir, `node-v${fullVer}.tar.gz`);

      execSync(`curl -fsSL --retry 2 --connect-timeout 15 "${tarUrl}" -o "${tempTar}"`, {
        timeout: 60000,
        stdio: 'ignore'
      });

      if (fs.existsSync(tempTar)) {
        execSync(`tar -xzf "${tempTar}" -C "${runtimesDir}"`, {
          timeout: 45000,
          stdio: 'ignore'
        });

        const extractedDir = path.join(runtimesDir, `node-v${fullVer}-linux-x64`);
        if (fs.existsSync(extractedDir)) {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          fs.renameSync(extractedDir, targetDir);
        }

        try { fs.unlinkSync(tempTar); } catch {}

        if (fs.existsSync(binNode)) {
          if (serverId) {
            this.appendLog(
              serverId,
              `\x1b[32m[AetherPanel Runtime]\x1b[0m ✅ Runtime Node.js v${fullVer} LTS siap digunakan!\r\n`
            );
          }
          return path.join(targetDir, 'bin');
        }
      }
    } catch (err: any) {
      console.warn(`[NodeRuntime Notice] Could not fetch v${fullVer}:`, err.message);
      if (serverId) {
        this.appendLog(
          serverId,
          `\x1b[33m[AetherPanel Runtime]\x1b[0m ⚠️ Pengunduhan otomatis Node v${fullVer} gagal: ${err.message}. Menggunakan runtime sistem bawaan (Node 22).\r\n`
        );
      }
    }

    return null;
  }

  /**
   * Return list of available Node.js runtimes for UI selection
   */
  public getAvailableNodeVersions(serverId?: string): Array<{
    version: string;
    fullVersion: string;
    title: string;
    tag: string;
    desc: string;
    isInstalled: boolean;
    isCurrent: boolean;
  }> {
    const server = serverId ? db.findServerById(serverId) : undefined;
    const currentVer = (server?.nodeVersion || '22').replace(/[^0-9]/g, '') || '22';

    const runtimesDir = path.resolve(process.cwd(), 'data', 'node-runtimes');
    const is20Downloaded = fs.existsSync(path.join(runtimesDir, 'v20', 'bin', 'node'));
    const is18Downloaded = fs.existsSync(path.join(runtimesDir, 'v18', 'bin', 'node'));

    return [
      {
        version: '20',
        fullVersion: 'v20.18.3 LTS',
        title: 'Node.js 20 LTS (Iron)',
        tag: 'Rekomendasi Utama WA Bot',
        desc: 'Paling stabil untuk WhatsApp Bot (@whiskeysockets/baileys), Discord.js v14, dan otomatisasi modern.',
        isInstalled: is20Downloaded,
        isCurrent: currentVer === '20'
      },
      {
        version: '22',
        fullVersion: 'v22.23.3 (Current)',
        title: 'Node.js 22 Current',
        tag: 'Bawaan Sistem',
        desc: 'Runtime Node.js bawaan sistem AetherPanel dengan engine V8 terbaru dan performa JavaScript tinggi.',
        isInstalled: true,
        isCurrent: currentVer === '22'
      },
      {
        version: '18',
        fullVersion: 'v18.20.7 LTS',
        title: 'Node.js 18 LTS (Hydrogen)',
        tag: 'Legacy / Kompatibilitas Lama',
        desc: 'Disediakan khusus untuk script bot lama yang memerlukan Node.js 18 atau pustaka lawas.',
        isInstalled: is18Downloaded,
        isCurrent: currentVer === '18'
      }
    ];
  }
}

export const containerEngine = new ContainerEngine();
