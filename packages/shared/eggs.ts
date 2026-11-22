import { EggConfig } from './types.js';

export const DEFAULT_EGGS: EggConfig[] = [
  {
    id: 'nodejs',
    name: 'Node.js 20 LTS',
    category: 'Runtime',
    dockerImage: 'node:20-alpine',
    defaultStartup: 'npm start',
    entryFile: 'index.js',
    installScript: 'npm install --production',
    stopCommand: '^C',
    description: 'High-performance runtime for Express, Fastify, NestJS, and general Node.js backend services.',
    envVars: {
      NODE_ENV: { label: 'Node Environment', default: 'production', required: true },
      PORT: { label: 'Application Port', default: '{{SERVER_PORT}}', required: true },
      ENTRY_FILE: { label: 'Entry Script', default: 'index.js', required: true }
    }
  },
  {
    id: 'python',
    name: 'Python 3.12',
    category: 'Runtime',
    dockerImage: 'python:3.12-slim',
    defaultStartup: 'python -u {{ENTRY_FILE}}',
    entryFile: 'main.py',
    installScript: 'pip install -r requirements.txt',
    stopCommand: '^C',
    description: 'Clean Python 3 environment for FastAPI, Flask, automation workers, and web scraping scripts.',
    envVars: {
      PYTHONUNBUFFERED: { label: 'Unbuffered Output', default: '1', required: true },
      PORT: { label: 'Server Port', default: '{{SERVER_PORT}}', required: false },
      ENTRY_FILE: { label: 'Main Script', default: 'main.py', required: true }
    }
  },
  {
    id: 'discord-node',
    name: 'Discord Bot (Node.js)',
    category: 'Bots',
    dockerImage: 'node:20-alpine',
    defaultStartup: 'node {{ENTRY_FILE}}',
    entryFile: 'bot.js',
    installScript: 'npm install discord.js dotenv',
    stopCommand: '^C',
    description: 'Preconfigured for discord.js v14 bots with automatic reconnect and keep-alive handling.',
    envVars: {
      DISCORD_TOKEN: { label: 'Bot Token', default: 'YOUR_BOT_TOKEN_HERE', required: true },
      CLIENT_ID: { label: 'Client Application ID', default: '', required: false },
      ENTRY_FILE: { label: 'Bot Entry File', default: 'bot.js', required: true }
    }
  },
  {
    id: 'discord-python',
    name: 'Discord Bot (discord.py)',
    category: 'Bots',
    dockerImage: 'python:3.12-slim',
    defaultStartup: 'python -u {{ENTRY_FILE}}',
    entryFile: 'bot.py',
    installScript: 'pip install discord.py python-dotenv',
    stopCommand: '^C',
    description: 'Python bot template using discord.py with command cogs and async loop support.',
    envVars: {
      DISCORD_TOKEN: { label: 'Bot Token', default: 'YOUR_BOT_TOKEN_HERE', required: true },
      COMMAND_PREFIX: { label: 'Prefix', default: '!', required: true },
      ENTRY_FILE: { label: 'Bot Entry File', default: 'bot.py', required: true }
    }
  },
  {
    id: 'static-nginx',
    name: 'Static Site (Nginx)',
    category: 'Web',
    dockerImage: 'nginx:alpine',
    defaultStartup: 'nginx -g "daemon off;"',
    entryFile: 'index.html',
    installScript: 'echo "Nginx static files initialized"',
    stopCommand: 'nginx -s quit',
    description: 'Ultra-fast static web server for HTML/CSS/JS, Vite builds, and React/Vue/Svelte static exports.',
    envVars: {
      PORT: { label: 'HTTP Port', default: '{{SERVER_PORT}}', required: true }
    }
  },
  {
    id: 'php-nginx',
    name: 'PHP 8.2 + Nginx',
    category: 'Web',
    dockerImage: 'php:8.2-fpm-alpine',
    defaultStartup: 'php-fpm -D && nginx -g "daemon off;"',
    entryFile: 'index.php',
    installScript: 'composer install --no-dev --optimize-autoloader || echo "Ready"',
    stopCommand: 'killall php-fpm && nginx -s quit',
    description: 'Full PHP-FPM and Nginx stack for Laravel, CodeIgniter, WordPress, and custom PHP APIs.',
    envVars: {
      PORT: { label: 'Web Port', default: '{{SERVER_PORT}}', required: true },
      PHP_MEMORY_LIMIT: { label: 'Memory Limit', default: '256M', required: true }
    }
  },
  {
    id: 'minecraft-java',
    name: 'Minecraft Java Edition',
    category: 'Gaming',
    dockerImage: 'eclipse-temurin:21-jre-alpine',
    defaultStartup: 'java -Xms128M -Xmx{{RAM_MAX_MB}}M -jar server.jar nogui',
    entryFile: 'server.jar',
    installScript: 'echo "eula=true" > eula.txt',
    stopCommand: 'stop',
    description: 'Paper / Spigot / Vanilla Minecraft server with optimized JVM flags and auto EULA acceptance.',
    envVars: {
      SERVER_PORT: { label: 'Server Port', default: '{{SERVER_PORT}}', required: true },
      EULA: { label: 'Accept EULA', default: 'true', required: true },
      MAX_PLAYERS: { label: 'Max Players', default: '20', required: true }
    }
  },
  {
    id: 'custom-docker',
    name: 'Custom Docker Container',
    category: 'Advanced',
    dockerImage: 'alpine:latest',
    defaultStartup: 'sh run.sh',
    entryFile: 'run.sh',
    installScript: 'chmod +x run.sh',
    stopCommand: '^C',
    description: 'Deploy any custom Docker image, Golang binary, Rust microservice, or custom bash automation.',
    envVars: {
      PORT: { label: 'Service Port', default: '{{SERVER_PORT}}', required: false },
      CUSTOM_COMMAND: { label: 'Launch Command', default: 'sh run.sh', required: true }
    }
  }
];
