// Worker de ejemplo: itera todos los tenants y llama al endpoint POS para procesar ventas pendientes.
// Requiere:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - POS_WORKER_JWT_SECRET
// - API_URL (opcional, default http://localhost:3002/api)
//
// Uso:
//   $env:SUPABASE_URL="..." ; $env:SUPABASE_SERVICE_ROLE_KEY="..." ; $env:POS_WORKER_JWT_SECRET="..." ; node scripts/run-pos-pending-worker.js

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.POS_WORKER_JWT_SECRET;
const apiBase = process.env.API_URL || 'http://localhost:3002/api';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!secret) {
  console.error('Falta POS_WORKER_JWT_SECRET');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const base64url = (obj) =>
  Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

function signWorkerToken() {
  const payload = {
    scope: 'pos.worker',
    all_tenants: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 15, // 15 min
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${signature}`;
}

async function fetchTenants() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id');
  if (error) throw error;
  return (data || []).map(t => t.id);
}

async function processTenant(tenantId, token) {
  const url = `${apiBase}/pos/worker/procesar-pendientes?tenant_id=${tenantId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

async function main() {
  console.log('🔑 Generando token all_tenants...');
  const token = signWorkerToken();
  console.log('✅ Token generado (15m). Llamando tenants...');

  const tenants = await fetchTenants();
  console.log(`📦 Tenants encontrados: ${tenants.length}`);

  let procesadas = 0;
  let errores = 0;

  for (const tenantId of tenants) {
    try {
      const result = await processTenant(tenantId, token);
      procesadas += result?.procesadas || 0;
      errores += result?.errores || 0;
      console.log(`✅ Tenant ${tenantId}: procesadas=${result?.procesadas || 0}, errores=${result?.errores || 0}`);
    } catch (err) {
      errores += 1;
      console.error(`❌ Tenant ${tenantId}: ${err.message}`);
    }
  }

  console.log(`🏁 Completado. Procesadas=${procesadas}, errores=${errores}`);
}

main().catch((err) => {
  console.error('❌ Error general:', err);
  process.exit(1);
});
