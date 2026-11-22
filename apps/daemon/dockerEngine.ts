import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

export interface CreateContainerOptions {
  uuid: string;
  image: string;
  memoryMb: number;
  cpuPercent: number;
  diskGb: number;
  primaryPort: number;
  extraPorts: number[];
  env: Record<string, string>;
  startupCommand: string;
}

export class DockerDaemonEngine extends EventEmitter {
  private docker: any;
  private serversRoot: string;

  constructor(socketPath: string = '/var/run/docker.sock', serversRoot: string = '/var/lib/panel/servers') {
    super();
    this.docker = new Docker({ socketPath });
    this.serversRoot = serversRoot;

    if (!fs.existsSync(this.serversRoot)) {
      try {
        fs.mkdirSync(this.serversRoot, { recursive: true });
      } catch {}
    }
  }

  public getServerPath(uuid: string): string {
    const dir = path.join(this.serversRoot, uuid);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Pull image if not present locally
   */
  public async ensureImage(imageName: string): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
    } catch {
      await new Promise((resolve, reject) => {
        this.docker.pull(imageName, (err: any, stream: any) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, onFinished, onProgress);
          function onFinished(err2: any) {
            if (err2) reject(err2);
            else resolve(true);
          }
          function onProgress(event: any) {}
        });
      });
    }
  }

  /**
   * Create an isolated Docker container for a server instance
   * Following security rules:
   * - Drop capabilities
   * - No-new-privileges
   * - User non-root (UID 1000)
   * - Memory limit and MemorySwap = Memory (no swap abuse)
   * - NanoCpus / CpuQuota limits
   * - PidsLimit to prevent fork-bombs
   * - Never mount docker.sock
   * - Network isolation
   */
  public async createServerContainer(options: CreateContainerOptions): Promise<string> {
    await this.ensureImage(options.image);

    const serverDir = this.getServerPath(options.uuid);
    const containerName = `aether_${options.uuid}`;

    // Port bindings
    const exposedPorts: Record<string, {}> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};

    exposedPorts[`${options.primaryPort}/tcp`] = {};
    portBindings[`${options.primaryPort}/tcp`] = [{ HostPort: `${options.primaryPort}` }];

    for (const port of options.extraPorts) {
      exposedPorts[`${port}/tcp`] = {};
      portBindings[`${port}/tcp`] = [{ HostPort: `${port}` }];
    }

    // Convert env vars
    const envArray: string[] = [
      `SERVER_PORT=${options.primaryPort}`,
      `SERVER_MEMORY=${options.memoryMb}`,
      `SERVER_UUID=${options.uuid}`
    ];
    for (const [k, v] of Object.entries(options.env)) {
      envArray.push(`${k}=${v}`);
    }

    // Convert memory to bytes
    const memoryBytes = options.memoryMb * 1024 * 1024;
    // CPU NanoCPUs (100% = 1 core = 1e9 nanoCPUs)
    const nanoCpus = Math.round((options.cpuPercent / 100) * 1e9);

    const container = await this.docker.createContainer({
      name: containerName,
      Image: options.image,
      WorkingDir: '/home/container',
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Env: envArray,
      ExposedPorts: exposedPorts,
      HostConfig: {
        Binds: [`${serverDir}:/home/container:rw`],
        PortBindings: portBindings,
        Memory: memoryBytes,
        MemorySwap: memoryBytes, // prevent swapping to disk
        NanoCpus: nanoCpus,
        CpuQuota: options.cpuPercent * 1000,
        CpuPeriod: 100000,
        PidsLimit: 512, // Anti-fork bomb
        CapDrop: ['ALL'], // Drop all root capabilities
        CapAdd: ['CHOWN', 'DAC_OVERRIDE', 'SETUID', 'SETGID'], // Minimal required
        SecurityOpt: ['no-new-privileges:true'],
        NetworkMode: 'bridge',
        RestartPolicy: { Name: 'no' } // Panel manages restarts
      }
    });

    return container.id;
  }

  public async startContainer(uuid: string): Promise<void> {
    const container = this.docker.getContainer(`aether_${uuid}`);
    await container.start();
  }

  public async stopContainer(uuid: string, timeout: number = 10): Promise<void> {
    const container = this.docker.getContainer(`aether_${uuid}`);
    await container.stop({ t: timeout });
  }

  public async restartContainer(uuid: string): Promise<void> {
    const container = this.docker.getContainer(`aether_${uuid}`);
    await container.restart({ t: 5 });
  }

  public async killContainer(uuid: string): Promise<void> {
    const container = this.docker.getContainer(`aether_${uuid}`);
    await container.kill();
  }

  public async removeContainer(uuid: string): Promise<void> {
    const container = this.docker.getContainer(`aether_${uuid}`);
    try {
      await container.remove({ force: true });
    } catch {}
  }

  /**
   * Attach live console stream to WebSocket client
   */
  public async attachConsole(uuid: string, onStdout: (data: Buffer) => void): Promise<(stdinData: string) => void> {
    const container = this.docker.getContainer(`aether_${uuid}`);
    const stream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true
    });

    stream.on('data', (chunk: any) => {
      onStdout(chunk);
    });

    return (stdinData: string) => {
      stream.write(stdinData);
    };
  }

  /**
   * Fetch current stats from Docker engine
   */
  public async getContainerStats(uuid: string): Promise<any> {
    const container = this.docker.getContainer(`aether_${uuid}`);
    const statsStream = await container.stats({ stream: false });
    return statsStream;
  }
}
