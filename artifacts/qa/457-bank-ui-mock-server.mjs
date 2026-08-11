import http from 'node:http';

const port = 39002;
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ledgerBankA = '11111111-1111-4111-8111-111111111111';
const ledgerBankB = '22222222-2222-4222-8222-222222222222';
const counterExpense = '33333333-3333-4333-8333-333333333333';
const counterIncome = '44444444-4444-4444-8444-444444444444';
const accountA = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111', nombre: 'Operaciones BCP', banco: 'BCP',
  numero_cuenta: '191-000457-01', tipo_cuenta: 'CORRIENTE', moneda: 'PEN',
  saldo: 1000, saldo_actual: 1000, saldo_contable: 1000, cuenta_contable_id: ledgerBankA,
  permite_sobregiro: false, activa: true, estado: 'ACTIVO', created_at: '2026-08-01T00:00:00Z',
};
const accountB = {
  id: 'aaaaaaaa-2222-4222-8222-222222222222', nombre: 'Reservas BBVA', banco: 'BBVA',
  numero_cuenta: '001-000457-02', tipo_cuenta: 'AHORROS', moneda: 'PEN',
  saldo: 500, saldo_actual: 500, saldo_contable: 500, cuenta_contable_id: ledgerBankB,
  permite_sobregiro: false, activa: true, estado: 'ACTIVO', created_at: '2026-08-02T00:00:00Z',
};
const accounts = [accountA, accountB];
const movements = [];

const user = {
  id: actorId, email: 'qa457@local.test', nombre: 'QA', apellido: 'Bancos',
  roles: ['ADMIN'], tenant_id: tenantId, is_super_admin: false,
};
const country = {
  pais_id: 1, pais: 'PE', paisCodigo: 'PE', moneda: 'PEN', monedaDefecto: 'PEN',
  tipo_empresa: 'MICRO', usar_flujo_logistica: false, gre_obligatorio: false,
  gre_automatico_habilitado: false,
};
const permissions = [
  ['finanzas', 'ver', '*'], ['finanzas', 'gestionar', '*'],
  ['contabilidad', 'ver', '*'], ['contabilidad', 'gestionar', '*'],
].map(([modulo, accion, recurso], index) => ({
  id: `perm-${index}`, tenant_id: tenantId, modulo, accion, recurso,
}));

function json(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

async function bodyOf(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method || 'GET';

  if (method === 'GET' && path === '/api/paises') {
    return json(response, 200, { success: true, data: [{
      id: 1, codigo_iso: 'PE', nombre: 'Perú', nombre_fiscal: 'SUNAT',
      moneda_codigo: 'PEN', moneda_simbolo: 'S/', activo: true,
    }] });
  }
  if (method === 'POST' && path === '/api/auth/login') {
    return json(response, 200, { access_token: 'qa-457-token', user }, {
      'set-cookie': 'access_token=qa-457-token; Path=/; HttpOnly; SameSite=Lax',
    });
  }
  if (method === 'GET' && path === '/api/auth/profile') return json(response, 200, user);
  if (method === 'GET' && path === '/api/configuration/context/country') return json(response, 200, { success: true, data: country });
  if (method === 'GET' && path === '/api/tenants/me') return json(response, 200, { id: tenantId, nombre: 'QA local 457', pais: 'PE', moneda: 'PEN', estado: 'ACTIVO' });
  if (method === 'GET' && path === '/api/demo/status') return json(response, 200, { success: true, data: { is_demo: true } });
  if (method === 'GET' && path.includes('/usuarios-sistema/me/permissions')) return json(response, 200, { success: true, data: permissions });
  if (method === 'GET' && path === '/api/notifications') return json(response, 200, { success: true, data: [] });
  if (method === 'GET' && path === '/api/contabilidad/plan-cuentas') return json(response, 200, { success: true, data: [
    { id: ledgerBankA, codigo: '104101', nombre: 'BCP Operaciones', acepta_movimiento: true, estado: 'ACTIVO' },
    { id: ledgerBankB, codigo: '104102', nombre: 'BBVA Reservas', acepta_movimiento: true, estado: 'ACTIVO' },
    { id: counterExpense, codigo: '639101', nombre: 'Gastos bancarios', acepta_movimiento: true, estado: 'ACTIVO' },
    { id: counterIncome, codigo: '759101', nombre: 'Otros ingresos', acepta_movimiento: true, estado: 'ACTIVO' },
  ] });

  if (method === 'GET' && path === '/api/finanzas/bancos/cuentas') return json(response, 200, { success: true, data: accounts });
  const accountMatch = path.match(/^\/api\/finanzas\/bancos\/cuentas\/([^/]+)$/);
  if (method === 'GET' && accountMatch) {
    return json(response, 200, { success: true, data: accounts.find((item) => item.id === accountMatch[1]) || null });
  }
  const movementMatch = path.match(/^\/api\/finanzas\/bancos\/cuentas\/([^/]+)\/movimientos$/);
  if (method === 'GET' && movementMatch) {
    const data = movements.filter((item) => item.cuenta_bancaria_id === movementMatch[1]);
    return json(response, 200, { success: true, data, pagination: { page: 1, limit: 50, total: data.length, totalPages: data.length ? 1 : 0 } });
  }
  if (method === 'POST' && path === '/api/finanzas/bancos/movimientos') {
    const payload = await bodyOf(request);
    const account = accounts.find((item) => item.id === payload.cuenta_bancaria_id);
    const movement = {
      id: `mov-${movements.length + 1}`, ...payload, conciliado: false,
      referencia: payload.referencia || null, created_at: new Date().toISOString(),
    };
    movements.unshift(movement);
    account.saldo += payload.tipo === 'ABONO' ? payload.monto : -payload.monto;
    account.saldo_actual = account.saldo;
    account.saldo_contable = account.saldo;
    return json(response, 201, { success: true, data: { movimiento_id: movement.id, saldo_nuevo: account.saldo } });
  }
  if (method === 'POST' && path === '/api/finanzas/bancos/transferencias') {
    const payload = await bodyOf(request);
    const source = accounts.find((item) => item.id === payload.cuenta_origen_id);
    const destination = accounts.find((item) => item.id === payload.cuenta_destino_id);
    source.saldo -= payload.monto;
    destination.saldo += payload.monto;
    source.saldo_actual = source.saldo_contable = source.saldo;
    destination.saldo_actual = destination.saldo_contable = destination.saldo;
    movements.unshift(
      { id: `mov-${movements.length + 1}`, cuenta_bancaria_id: source.id, tipo: 'CARGO', monto: payload.monto, fecha: payload.fecha, descripcion: payload.descripcion, referencia: payload.referencia || null, conciliado: false, created_at: new Date().toISOString() },
      { id: `mov-${movements.length + 2}`, cuenta_bancaria_id: destination.id, tipo: 'ABONO', monto: payload.monto, fecha: payload.fecha, descripcion: payload.descripcion, referencia: payload.referencia || null, conciliado: false, created_at: new Date().toISOString() },
    );
    return json(response, 201, { success: true, data: { movimiento_origen_id: movements[1].id, movimiento_destino_id: movements[0].id } });
  }

  if (method === 'GET' && path === '/api/finanzas/conciliacion') return json(response, 200, { success: true, data: [] });
  if (method === 'GET' && path === '/api/finanzas/conciliacion/pendientes') return json(response, 200, { success: true, data: [] });
  if (method === 'GET' && path === '/api/finanzas/conciliacion/plantillas-csv') return json(response, 200, { success: true, data: [] });

  if (method === 'GET') return json(response, 200, { success: true, data: [] });
  return json(response, 200, { success: true, data: {} });
});

server.listen(port, '127.0.0.1', () => console.log(`QA 457 mock listening on ${port}`));
