import { calculatePriceQuote } from '../packages/shared/pricing.js';
import { buatQrisClient } from '../server/lib/buatqris.js';
import { containerEngine } from '../server/lib/containerEngine.js';
import { db } from '../server/lib/db.js';

console.log('--- RUNNING AETHERPANEL AUTOMATED TEST SUITE ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

// 1. Price Quote Calculation Test
const quote1 = calculatePriceQuote({
  eggId: 'nodejs',
  nodeId: 'node-jkt-01',
  ramMb: 1024,
  cpuPercent: 100,
  diskGb: 10,
  backupSlots: 1,
  extraPorts: 0,
  databases: 0,
  durationMonths: 1
});

assert(quote1.ramPrice === 10000, 'RAM 1GB priced at Rp 10.000');
assert(quote1.cpuPrice === 8000, 'CPU 100% priced at Rp 8.000');
assert(quote1.diskPrice === 4000, 'Disk 10GB priced at Rp 4.000');
assert(quote1.totalPayable > 1000, 'Total payable exceeds minimum amount');

// 2. Duration Discount Test
const quote12Mo = calculatePriceQuote({
  eggId: 'nodejs',
  nodeId: 'node-jkt-01',
  ramMb: 2048,
  cpuPercent: 100,
  diskGb: 20,
  backupSlots: 2,
  extraPorts: 0,
  databases: 0,
  durationMonths: 12
});
assert(quote12Mo.discountPercent === 15, '12-Month duration grants 15% discount');
assert(quote12Mo.discountAmount > 0, 'Discount amount applied correctly');

// 3. Webhook Signature Verification Test
const simWebhook = buatQrisClient.createSimulatedWebhook({
  transactionId: 'TRX-TEST-VALID-001',
  amount: 25000,
  totalAmount: 25750,
  status: 'success'
});
const isValidSig = buatQrisClient.verifyWebhookSignature(simWebhook.rawBody, simWebhook.signatureHeader);
assert(isValidSig === true, 'HMAC-SHA256 signature verification succeeds for authentic payload');

const isTampered = buatQrisClient.verifyWebhookSignature(simWebhook.rawBody + 'tamper', simWebhook.signatureHeader);
assert(isTampered === false, 'HMAC-SHA256 signature verification rejects tampered payload');

const isWrongSig = buatQrisClient.verifyWebhookSignature(simWebhook.rawBody, 'sha256=0000000000000000000000000000000000000000000000000000000000000000');
assert(isWrongSig === false, 'HMAC-SHA256 signature verification rejects invalid hash');

// 4. Idempotency Test
const trxId = `TRX-IDEMP-${Date.now()}`;
assert(db.isWebhookProcessed('payment.success', trxId) === false, 'Initially not processed');
db.recordWebhookProcessed('payment.success', trxId);
assert(db.isWebhookProcessed('payment.success', trxId) === true, 'Successfully marked processed');
// Second attempt should be recognized as duplicate
assert(db.isWebhookProcessed('payment.success', trxId) === true, 'Idempotency detects duplicate transaction');

// 5. File Manager Path Traversal & Zip-Slip Defense Test
const serverUuid = 'test-server-security-uuid';
let traversalBlocked = false;
try {
  containerEngine.resolveSafePath(serverUuid, '../../../../etc/passwd');
} catch (e: any) {
  traversalBlocked = true;
}
assert(traversalBlocked === true, 'Directory traversal path escape is strictly blocked');

console.log(`\nALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
process.exit(0);
