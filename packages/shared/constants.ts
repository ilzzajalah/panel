import { NodeLocation, PricingRuleConfig } from './types.js';

export const DEFAULT_NODES: NodeLocation[] = [
  {
    id: 'node-jkt-01',
    name: 'Jakarta 01 (Cyber Building)',
    code: 'JKT-01',
    country: 'Indonesia',
    flag: '🇮🇩',
    ip: '103.147.154.21',
    port: 8080,
    isOnline: true,
    totalRamMb: 65536,
    usedRamMb: 18432,
    totalDiskGb: 2000,
    usedDiskGb: 610,
    pingMs: 8
  },
  {
    id: 'node-sg-01',
    name: 'Singapore 01 (Equinix SG1)',
    code: 'SGP-01',
    country: 'Singapore',
    flag: '🇸🇬',
    ip: '139.180.201.45',
    port: 8080,
    isOnline: true,
    totalRamMb: 32768,
    usedRamMb: 12288,
    totalDiskGb: 1000,
    usedDiskGb: 340,
    pingMs: 19
  },
  {
    id: 'node-tyo-01',
    name: 'Tokyo 01 (TYO Datacenter)',
    code: 'TYO-01',
    country: 'Japan',
    flag: '🇯🇵',
    ip: '172.105.228.89',
    port: 8080,
    isOnline: true,
    totalRamMb: 32768,
    usedRamMb: 8192,
    totalDiskGb: 1000,
    usedDiskGb: 220,
    pingMs: 64
  }
];

export const DEFAULT_PRICING_RULE: PricingRuleConfig = {
  baseMonthlyFee: 4000,
  pricePerGbRam: 10000,
  pricePerCpuCore: 8000,
  pricePerGbDisk: 400,
  pricePerBackupSlot: 2000,
  pricePerExtraPort: 1500,
  pricePerDatabase: 3000,
  durationDiscounts: {
    1: 0,
    3: 0.05,
    6: 0.10,
    12: 0.15
  },
  minAmount: 1000,
  maxAmount: 5000000
};

export const PRESET_PLANS = [
  {
    id: 'starter',
    name: 'Starter Cloud',
    description: 'Cocok untuk Discord bot kecil, bot WhatsApp, microservice, atau script cron.',
    ramMb: 512,
    cpuPercent: 50,
    diskGb: 5,
    backupSlots: 1,
    extraPorts: 0,
    databases: 0,
    isPopular: false
  },
  {
    id: 'pro',
    name: 'Pro Developer',
    description: 'Paling populer untuk API Express/NestJS, web backend, database ringan & Discord bot besar.',
    ramMb: 2048,
    cpuPercent: 100,
    diskGb: 20,
    backupSlots: 3,
    extraPorts: 1,
    databases: 1,
    isPopular: true
  },
  {
    id: 'ultra',
    name: 'Ultra Game / High Load',
    description: 'Didesain untuk server Minecraft Java, high-throughput backend, atau multi-worker worker tasks.',
    ramMb: 4098,
    cpuPercent: 200,
    diskGb: 50,
    backupSlots: 5,
    extraPorts: 2,
    databases: 2,
    isPopular: false
  }
];

export const VALID_COUPONS: Record<string, { discountPercent?: number; discountFixed?: number; maxDiscount?: number }> = {
  'LAUNCH20': { discountPercent: 20, maxDiscount: 25000 },
  'HEMAT50': { discountFixed: 5000 },
  'DEV10': { discountPercent: 10, maxDiscount: 15000 }
};
