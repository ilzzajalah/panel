import crypto from 'crypto';
import { DEFAULT_EGGS } from '../packages/shared/eggs.js';
import { DEFAULT_NODES, DEFAULT_PRICING_RULE, VALID_COUPONS } from '../packages/shared/constants.js';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'salt_aether_2026').digest('hex');
}

export function getInitialSeedData() {
  const adminPassword = hashPassword('admin123');
  const demoPassword = hashPassword('user123');

  const users = [
    {
      id: 'usr-admin-001',
      email: 'admin@aetherpanel.com',
      name: 'System Administrator',
      phone: '081234567890',
      passwordHash: adminPassword,
      role: 'ADMIN' as const,
      mustChangePassword: false,
      isSuspended: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-admin-super',
      email: 'rizramadhan975@gmail.com',
      name: 'Rizki Ramadhan (Super Admin)',
      phone: '081234567899',
      passwordHash: hashPassword('admin123'),
      role: 'ADMIN' as const,
      mustChangePassword: false,
      isSuspended: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr-demo-002',
      email: 'user@example.com',
      name: 'Demo User',
      phone: '085712345678',
      passwordHash: demoPassword,
      role: 'USER' as const,
      mustChangePassword: false,
      isSuspended: false,
      createdAt: new Date().toISOString()
    }
  ];

  const nodes = DEFAULT_NODES.map(node => ({
    ...node,
    daemonToken: `tok_daemon_${node.code.toLowerCase()}_sec_${crypto.randomBytes(8).toString('hex')}`
  }));

  const pricingRules = { ...DEFAULT_PRICING_RULE };

  const coupons = Object.entries(VALID_COUPONS).map(([code, config]) => ({
    id: `cpn-${code.toLowerCase()}`,
    code,
    discountPercent: config.discountPercent || null,
    discountFixed: config.discountFixed || null,
    maxDiscount: config.maxDiscount || null,
    maxUsage: 100,
    usedCount: 0,
    isActive: true
  }));

  const routerConfig = {
    id: 'default',
    endpoint: 'https://api.9router.com',
    apiKey: '',
    mode: 'auto',
    isEnabled: true
  };

  const paymentConfig = {
    id: 'buatqris',
    provider: 'buatqris',
    accountId: process.env.BUATQRIS_ACCOUNT_ID || 'ACC-DEMO-9912',
    secretToken: process.env.BUATQRIS_SECRET_TOKEN || 'sec_tok_live_demo_9823184',
    signingSecret: process.env.BUATQRIS_SIGNING_SECRET || 'sign_sec_demo_hash_98231',
    mode: process.env.BUATQRIS_MODE || 'mock',
    defaultMethod: 'qris_one',
    feeBy: 'buyer',
    minAmount: 1000,
    maxAmount: 5000000
  };

  return {
    users,
    nodes,
    eggs: DEFAULT_EGGS,
    pricingRules,
    coupons,
    routerConfig,
    paymentConfig
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Seed data prepared successfully.');
}
