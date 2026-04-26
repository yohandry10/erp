// Genera un JWT HS256 sin dependencias externas para el worker POS (uno, varios o todos los tenants).
// Uso:
//   POS_WORKER_JWT_SECRET="secreto-hex-32" node scripts/generate-pos-worker-token.js TENANT1 TENANT2
//   POS_WORKER_JWT_SECRET="secreto-hex-32" node scripts/generate-pos-worker-token.js --all

const crypto = require('crypto');

const secret = process.env.POS_WORKER_JWT_SECRET;
if (!secret) {
  console.error('Falta POS_WORKER_JWT_SECRET en el entorno');
  process.exit(1);
}

const args = process.argv.slice(2);
const allowAll = args.includes('--all');
const tenantIds = args.filter(a => a !== '--all');

const payload = {
  scope: 'pos.worker',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 60 * 30, // 30 minutos
};

if (allowAll) {
  payload.all_tenants = true;
} else if (tenantIds.length === 1) {
  payload.tenant_id = tenantIds[0];
} else if (tenantIds.length > 1) {
  payload.tenant_ids = tenantIds;
} else {
  console.error('Debes pasar al menos un tenant_id o usar --all');
  process.exit(1);
}

const base64url = (obj) =>
  Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const header = { alg: 'HS256', typ: 'JWT' };
const segments = [base64url(header), base64url(payload)];
const signingInput = segments.join('.');
const signature = crypto
  .createHmac('sha256', secret)
  .update(signingInput)
  .digest('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const token = `${signingInput}.${signature}`;

console.log('TOKEN:');
console.log(token);
console.log('\nPayload:');
console.log(JSON.stringify(payload, null, 2));
