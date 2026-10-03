import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fetchWithLocalLoginRetry } from "./peru-local-http.mjs";
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, "1");
assert.equal(process.env.PGHOST, "127.0.0.1");
assert.equal(process.env.PGDATABASE, "erp_e2e");
const api = process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname, "127.0.0.1");
const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const f = JSON.parse(
  fs.readFileSync(path.join(output, "configuration-admin-fixture.json")),
);
const sql = (query) =>
  execFileSync(
    process.env.PSQL_BIN,
    [
      "-XqAt",
      "-h",
      "127.0.0.1",
      "-p",
      process.env.PGPORT,
      "-U",
      "postgres",
      "-d",
      "erp_e2e",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query, encoding: "utf8", windowsHide: true },
  ).trim();
const q = (id) => {
  assert.match(id, /^[0-9a-f-]{36}$/i);
  return "'" + id + "'::uuid";
};
assert.equal(sql("SELECT current_database();"), "erp_e2e");
const scenarios = [],
  requests = [];
const proof = {
  success: false,
  remoteWrites: false,
  local_only: true,
  scope:
    "Anticipos y ajustes fiscales de CxP por API real, primer ADMIN no demo; parámetros de prueba no acreditan tasas legales ni depósito externo en SUNAT",
  scenarios,
  requests,
};
let token;
async function call(
  endpoint,
  body,
  status = body === undefined ? 200 : 201,
  headers = {},
  method = body === undefined ? "GET" : "POST",
) {
  const r = await fetchWithLocalLoginRetry(api + "/api/" + endpoint, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
      "idempotency-key": randomUUID(),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await r.json();
  requests.push({
    method,
    endpoint: endpoint.replace(
      /[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,
      ":id",
    ),
    status: r.status,
  });
  assert.equal(r.status, status, endpoint + ": " + JSON.stringify(raw));
  return raw.data ?? raw;
}
const pass = (scenario) => scenarios.push({ scenario, passed: true });
const cents = (value) => Math.round(Number(value) * 100);
const snapshot = () =>
  sql(
    `SELECT md5(jsonb_build_object('bank',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM cuentas_bancarias x WHERE tenant_id=${q(f.tenant)}),'cxp',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM cuentas_por_pagar x WHERE tenant_id=${q(f.tenant)}),'adjustments',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM operaciones_fiscales_financieras x WHERE tenant_id=${q(f.tenant)}),'advances',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM anticipos_terceros x WHERE tenant_id=${q(f.tenant)}),'outbox',(SELECT jsonb_agg(to_jsonb(x) ORDER BY event_id) FROM outbox_events x WHERE tenant_id=${q(f.tenant)}))::text);`,
  );
try {
  const login = await call("auth/login", {
    email: f.email,
    password: "Cliente-Local-2026-Only!",
  });
  token = login.access_token;
  assert.equal(login.user.is_super_admin, false);
  const other = await call("auth/login", {
    email: "peru-integrated-2@example.test",
    password: "Local-Peru-2026-Only!",
  });
  const foreign = { authorization: "Bearer " + other.access_token };
  const accounts = await call("contabilidad/plan-cuentas");
  const account = (code) => {
    const row = accounts.find((x) => x.codigo === code && x.activo);
    assert.ok(row, code);
    return row.id;
  };
  const today = sql(`SELECT app.hoy_tenant(${q(f.tenant)});`);
  const bank = await call("finanzas/bancos/cuentas", {
    nombre: "Banco ajustes local",
    banco: "BANCO LOCAL",
    numero_cuenta: "LOCAL-AJUSTES",
    moneda: "PEN",
    tipo_cuenta: "CORRIENTE",
    cuenta_contable_id: account("1041"),
    saldo: 0,
  });
  await call("finanzas/bancos/movimientos", {
    cuenta_bancaria_id: bank.id,
    cuenta_contrapartida_id: account("70"),
    tipo: "ABONO",
    monto: 1000,
    moneda: "PEN",
    fecha: today,
    descripcion: "Fondo local",
    referencia: "FONDO-LOCAL",
    categoria: "OTRO_INGRESO",
    metodo_pago: "TRANSFERENCIA",
    idempotency_key: randomUUID(),
  });
  const provider = await call("compras/proveedores", {
    ruc: "20198765431",
    razon_social: "Proveedor ajustes local",
    direccion: "LOCAL",
    email: "ajustes@example.test",
  });
  const client = await call("ventas/clientes", {
    tipo: "PERSONA",
    documento_tipo: "DNI",
    documento_numero: "12345678",
    razon_social: "Cliente anticipo local",
  });
  for (const tipo of ["RETENCION", "PERCEPCION", "DETRACCION", "ANTICIPO"]) {
    const result = await call("retenciones/calcular", {
      tipo,
      base_calculo: 118,
      tasa: 3,
    });
    assert.equal(cents(result.monto), 354);
    assert.equal(
      cents(result.saldo_resultante),
      tipo === "PERCEPCION" ? 12154 : 11446,
    );
  }
  await call(
    "retenciones/calcular",
    { tipo: "QUINTA", base_calculo: 118, tasa: 3 },
    400,
  );
  await call(
    "retenciones/calcular",
    { tipo: "RETENCION", base_calculo: 0, tasa: 3 },
    400,
  );
  pass(
    "Ajustes: cálculo y validación por API; quinta no ofrecida y base cero rechazadas",
  );
  const invoice = await call("finanzas/cxp", {
    proveedor_id: provider.id,
    numero_documento: "F001-LOCAL-AJUSTES",
    serie: "F001",
    tipo_documento: "FACTURA",
    fecha_emision: today,
    condiciones_pago: "CREDITO_30",
    subtotal: 100,
    igv: 18,
    total: 118,
    moneda: "PEN",
    tipo_cambio: 1,
    destino_credito_fiscal: "GRAVADAS",
  });
  const supplierBody = {
    origen: "PROVEEDOR",
    proveedor_id: provider.id,
    cuenta_bancaria_id: bank.id,
    monto: 100,
    moneda: "PEN",
    fecha: today,
    tipo_cambio: 1,
    referencia: "ANT-PROV-LOCAL",
    idempotency_key: randomUUID(),
  };
  const supplier = await call("retenciones/anticipos", supplierBody);
  const beforeReplay = snapshot();
  assert.equal(
    (await call("retenciones/anticipos", supplierBody)).id,
    supplier.id,
  );
  assert.equal(snapshot(), beforeReplay);
  assert.equal(
    cents((await call("finanzas/bancos/cuentas/" + bank.id)).saldo),
    90000,
  );
  pass(
    "Anticipo proveedor: cargo bancario y saldo disponible persistidos; replay sin residuos",
  );
  const customerBody = {
    origen: "CLIENTE",
    cliente_id: client.id,
    cuenta_bancaria_id: bank.id,
    monto: 50,
    moneda: "PEN",
    fecha: today,
    tipo_cambio: 1,
    referencia: "ANT-CLI-LOCAL",
    idempotency_key: randomUUID(),
  };
  const customer = await call("retenciones/anticipos", customerBody);
  const customerHash = snapshot();
  await call("retenciones/anticipos", customerBody);
  assert.equal(snapshot(), customerHash);
  assert.equal(
    cents((await call("finanzas/bancos/cuentas/" + bank.id)).saldo),
    95000,
  );
  pass("Anticipo cliente: abono bancario, consulta y replay persistidos");
  const base = {
    origen: "PROVEEDOR",
    cuenta_id: invoice.id,
    moneda: "PEN",
    fecha: today,
    tipo_cambio: 1,
  };
  const applyBody = {
    ...base,
    tipo: "ANTICIPO",
    anticipo_id: supplier.id,
    monto: 40,
    referencia: "APP-LOCAL",
    idempotency_key: randomUUID(),
  };
  const applied = await call("retenciones/ajustes", applyBody);
  const appliedHash = snapshot();
  await call("retenciones/ajustes", applyBody);
  assert.equal(snapshot(), appliedHash);
  assert.equal(cents((await call("finanzas/cxp/" + invoice.id)).saldo), 7800);
  assert.equal(
    sql(
      `SELECT monto_disponible FROM anticipos_terceros WHERE id=${q(supplier.id)};`,
    ),
    "60.00",
  );
  pass(
    "Anticipo proveedor: aplicación parcial reduce deuda y disponible una vez",
  );
  const retain = await call("retenciones/ajustes", {
    ...base,
    tipo: "RETENCION",
    monto: 10,
    base_calculo: 100,
    tasa: 10,
    referencia: "RET-LOCAL",
    idempotency_key: randomUUID(),
  });
  await call("retenciones/ajustes", {
    ...base,
    tipo: "PERCEPCION",
    monto: 2,
    referencia: "PER-LOCAL",
    idempotency_key: randomUUID(),
  });
  const detBody = {
    ...base,
    tipo: "DETRACCION",
    monto: 20,
    referencia: "DET-LOCAL",
    idempotency_key: randomUUID(),
  };
  const detraction = await call("retenciones/ajustes", detBody);
  const detHash = snapshot();
  await call("retenciones/ajustes", detBody);
  assert.equal(snapshot(), detHash);
  assert.equal(detraction.estado, "PENDIENTE_TESORERIA");
  assert.equal(cents((await call("finanzas/cxp/" + invoice.id)).saldo), 5000);
  assert.equal(
    cents((await call("finanzas/bancos/cuentas/" + bank.id)).saldo),
    95000,
  );
  pass(
    "CxP: retención, percepción y detracción alteran deuda correctamente sin tocar banco",
  );
  const invalidHash = snapshot();
  for (const invalid of [
    { ...base, tipo: "ANTICIPO", monto: 61, anticipo_id: supplier.id },
    { ...base, tipo: "RETENCION", monto: 51 },
    { ...base, tipo: "RETENCION", monto: 1, base_calculo: 100, tasa: 10 },
    { ...base, tipo: "ANTICIPO", monto: 1, anticipo_id: customer.id },
  ]) {
    await call(
      "retenciones/ajustes",
      { ...invalid, idempotency_key: randomUUID() },
      400,
    );
    assert.equal(snapshot(), invalidHash);
  }
  pass(
    "Ajustes: exceso de deuda/anticipo, cálculo incompatible y tercero incorrecto rechazados sin residuos",
  );
  await call("retenciones/" + detraction.id, undefined, 404, foreign);
  await call(
    "retenciones/" + detraction.id + "/depositar-detraccion",
    {
      cuenta_bancaria_id: bank.id,
      fecha: today,
      idempotency_key: randomUUID(),
    },
    400,
    foreign,
  );
  assert.equal(snapshot(), invalidHash);
  pass("Ajustes: consulta y depósito ajenos aislados");
  const depositBody = {
    cuenta_bancaria_id: bank.id,
    fecha: today,
    referencia: "DEPOSITO-LOCAL",
    tipo_cambio: 1,
    idempotency_key: randomUUID(),
  };
  const deposit = await call(
    "retenciones/" + detraction.id + "/depositar-detraccion",
    depositBody,
  );
  assert.equal(deposit.estado, "APLICADO");
  const depositHash = snapshot();
  await call(
    "retenciones/" + detraction.id + "/depositar-detraccion",
    depositBody,
  );
  assert.equal(snapshot(), depositHash);
  assert.equal(
    cents((await call("finanzas/bancos/cuentas/" + bank.id)).saldo),
    93000,
  );
  assert.equal(cents((await call("finanzas/cxp/" + invoice.id)).saldo), 5000);
  pass(
    "Detracción: depósito contable local y replay cargan banco una vez sin repetir reducción de CxP",
  );
  const filtered = await call(
    "retenciones?origen=PROVEEDOR&tipo=DETRACCION&estado=APLICADO",
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, detraction.id);
  const advances = await call("retenciones/anticipos?origen=CLIENTE");
  assert.ok(advances.some((x) => x.id === customer.id));
  pass(
    "Ajustes: consulta por ID y filtros de origen/tipo/estado; anticipos por cliente",
  );
  const denied = {
    authorization:
      "Bearer " +
      (
        await call("auth/login", {
          email: f.reader_email,
          password: "Lector-Local-2026!",
        })
      ).access_token,
  };
  const deniedHash = snapshot();
  await call("retenciones", undefined, 403, denied);
  await call(
    "retenciones/ajustes",
    { ...base, tipo: "RETENCION", monto: 1, idempotency_key: randomUUID() },
    403,
    denied,
  );
  assert.equal(snapshot(), deniedHash);
  pass("Ajustes: rol sin finanzas no consulta ni aplica movimientos");
  const paymentBody = {
    cxp_id: invoice.id,
    monto: 50,
    fecha_pago: today,
    metodo_pago: "TRANSFERENCIA",
    cuenta_bancaria_id: bank.id,
    referencia: "PAGO-NETO-AJUSTES",
    idempotency_key: randomUUID(),
  };
  const payment = await call("finanzas/tesoreria/pagos", paymentBody);
  const paymentHash = snapshot();
  const paymentReplay = await call("finanzas/tesoreria/pagos", paymentBody);
  assert.equal(paymentReplay.pago.id, payment.pago.id);
  assert.equal(snapshot(), paymentHash);
  assert.equal((await call("finanzas/cxp/" + invoice.id)).estado, "PAGADA");
  assert.equal(
    cents((await call("finanzas/bancos/cuentas/" + bank.id)).saldo),
    88000,
  );
  pass(
    "CxP ajustada: pago neto y replay liquidan deuda, banco y obligación sin doble movimiento",
  );
  const invoiceUi = await call("finanzas/cxp", {
    proveedor_id: provider.id,
    numero_documento: "F001-LOCAL-UI-AJUSTES",
    serie: "F001",
    tipo_documento: "FACTURA",
    fecha_emision: today,
    condiciones_pago: "CREDITO_30",
    subtotal: 100,
    igv: 18,
    total: 118,
    moneda: "PEN",
    tipo_cambio: 1,
    destino_credito_fiscal: "GRAVADAS",
  });
  fs.writeFileSync(
    path.join(output, "tax-adjustments-fixture.json"),
    JSON.stringify({
      ...f,
      invoice_ui_id: invoiceUi.id,
      bank_id: bank.id,
      provider_id: provider.id,
      client_id: client.id,
      today,
    }),
  );
  const apiDir = path.resolve("apps/erp-api");
  const req = createRequire(path.join(apiDir, "package.json"));
  fs.writeFileSync(
    path.join(output, "tax-adjustment-accounting.log"),
    execFileSync(
      process.execPath,
      [
        req.resolve("ts-node/dist/bin.js"),
        "--transpile-only",
        "tests/e2e/helpers/local-api-harness.ts",
        "--accounting-once",
      ],
      {
        cwd: apiDir,
        env: process.env,
        encoding: "utf8",
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 5000000,
      },
    ),
  );
  const postings = JSON.parse(
    sql(
      `SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'event_id',a.source_event_id,'debe',a.total_debe,'haber',a.total_haber,'estado',a.estado) ORDER BY a.id),'[]') FROM asientos_contables a WHERE a.tenant_id=${q(f.tenant)};`,
    ),
  );
  assert.ok(postings.length >= 10);
  assert.ok(
    postings.every(
      (x) => cents(x.debe) === cents(x.haber) && cents(x.debe) > 0,
    ),
  );
  assert.equal(new Set(postings.map((x) => x.event_id)).size, postings.length);
  proof.postings = postings;
  pass(
    "Ajustes: consumidor real publica asientos únicos y cuadrados de deuda, anticipos, reclasificación y depósito",
  );
  proof.success = true;
} finally {
  proof.checkedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(output, "tax-adjustments.json"),
    JSON.stringify(proof, null, 2),
  );
}
console.log(
  JSON.stringify({
    success: proof.success,
    scenarios: scenarios.length,
    requests: requests.length,
    remoteWrites: false,
  }),
);
