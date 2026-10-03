import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fetchWithLocalLoginRetry } from "./peru-local-http.mjs";
assert.equal(process.env.E2E_EPHEMERAL_LOCAL_DB, "1");
assert.equal(process.env.PGHOST, "127.0.0.1");
assert.equal(process.env.PGDATABASE, "erp_e2e");
const api = process.env.LOCAL_API_URL;
assert.equal(new URL(api).hostname, "127.0.0.1");
const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR;
const fixture = JSON.parse(
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
  requests = [],
  defects = [];
const proof = {
  success: false,
  local_only: true,
  remoteWrites: false,
  scope:
    "Series de documentos; API real, primer ADMIN no demo. Contador existente simulado localmente para probar límite; no emite documentos",
  scenarios,
  requests,
  defects,
};
let token;
async function raw(
  endpoint,
  body,
  headers = {},
  method = body === undefined ? "GET" : "PUT",
) {
  const response = await fetchWithLocalLoginRetry(api + "/api/" + endpoint, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
      "idempotency-key": randomUUID(),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const rawValue = await response.json();
  requests.push({
    method,
    endpoint: endpoint.replace(
      /[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/gi,
      ":id",
    ),
    status: response.status,
  });
  return { status: response.status, value: rawValue.data ?? rawValue };
}
async function call(
  endpoint,
  body,
  expected = body === undefined ? 200 : 200,
  headers = {},
  method,
) {
  const r = await raw(endpoint, body, headers, method);
  assert.equal(r.status, expected, endpoint + ": " + JSON.stringify(r.value));
  return r.value;
}
const pass = (scenario) => scenarios.push({ scenario, passed: true });
const hash = () =>
  sql(
    `SELECT md5(jsonb_build_object('series',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM documento_series s WHERE tenant_id=${q(fixture.tenant)}),'intents',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM configuration_operation_intents i WHERE tenant_id=${q(fixture.tenant)}),'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM audit_log a WHERE tenant_id=${q(fixture.tenant)}))::text);`,
  );
async function negative(
  label,
  body,
  expected = 400,
  headers = {},
  type = "FACTURA",
) {
  const before = hash();
  const r = await raw("configuracion/series/" + type, body, headers);
  const unchanged = hash() === before;
  if (r.status !== expected || !unchanged) {
    defects.push({
      id: label,
      expected_status: expected,
      actual_status: r.status,
      response: r.value,
      unchanged,
    });
    scenarios.push({ scenario: label, passed: false });
  } else pass(label);
}
try {
  const login = await call(
    "auth/login",
    { email: fixture.email, password: "Cliente-Local-2026-Only!" },
    201,
    {},
    "POST",
  );
  token = login.access_token;
  assert.equal(login.user.is_super_admin, false);
  const f = await call(
    "auth/login",
    {
      email: "peru-integrated-2@example.test",
      password: "Local-Peru-2026-Only!",
    },
    201,
    {},
    "POST",
  );
  const foreign = { authorization: "Bearer " + f.access_token };
  const reader = await call(
    "auth/login",
    { email: fixture.reader_email, password: "Lector-Local-2026!" },
    201,
    {},
    "POST",
  );
  const readHeaders = { authorization: "Bearer " + reader.access_token };
  const intent = { "idempotency-key": randomUUID() };
  const create = { serie: "F902", correlativo_maximo: 200, activo: true };
  const serie = await call("configuracion/series/FACTURA", create, 200, intent);
  assert.equal(serie.correlativo_actual, 0);
  const before = hash();
  const copies = await Promise.all(
    Array.from({ length: 6 }, () =>
      call("configuracion/series/FACTURA", create, 200, intent),
    ),
  );
  assert.ok(copies.every((x) => x.id === serie.id));
  assert.equal(hash(), before);
  pass("Series: seis replays concurrentes conservan ID, recibo y auditoría");
  const editKey = { "idempotency-key": randomUUID() };
  const edit = { serie: "F902", correlativo_maximo: 225, activo: false };
  const edited = await call("configuracion/series/FACTURA", edit, 200, editKey);
  assert.equal(edited.id, serie.id);
  assert.equal(edited.activo, false);
  assert.equal(edited.estado, "INACTIVO");
  assert.equal(edited.correlativo_maximo, 225);
  const persisted = sql(
    `SELECT correlativo_maximo||'|'||activo||'|'||estado FROM documento_series WHERE id=${q(serie.id)};`,
  );
  assert.equal(persisted, "225|false|INACTIVO");
  const updatedHash = hash();
  await call("configuracion/series/FACTURA", edit, 200, editKey);
  assert.equal(hash(), updatedHash);
  pass(
    "Series: edición e inactivación persistidas y replay sin doble auditoría",
  );
  const visible = await call("configuracion/series");
  assert.ok(!visible.some((x) => x.id === serie.id));
  pass(
    "Series: consulta operativa omite inactivas; recuperación administrativa requiere usar el código",
  );
  await negative(
    "series-replay-conflict",
    { ...edit, activo: true },
    409,
    editKey,
  );
  for (const [name, body] of [
    ["series-zero-maximum", { serie: "F903", correlativo_maximo: 0 }],
    [
      "series-overflow-maximum",
      { serie: "F903", correlativo_maximo: 100000000 },
    ],
    ["series-invalid-format", { serie: "F-902" }],
    ["series-negative-maximum", { serie: "F903", correlativo_maximo: -1 }],
    [
      "series-invalid-number",
      { serie: "F903", correlativo_maximo: "invalido" },
    ],
  ])
    await negative(name, body);
  await negative(
    "series-unsupported-type",
    { serie: "X901", activo: true },
    400,
    {},
    "NO_EXISTE",
  );
  await negative("series-reader-write-denied", create, 403, readHeaders);
  const other = await call("configuracion/series", undefined, 200, foreign);
  assert.ok(!other.some((x) => x.id === serie.id));
  pass("Series: otro tenant no consulta la serie propia");
  const beforeOtherTenant = hash();
  const otherCreated = await call(
    "configuracion/series/FACTURA",
    create,
    200,
    foreign,
  );
  assert.notEqual(otherCreated.id, serie.id);
  assert.equal(hash(), beforeOtherTenant);
  pass("Series: mismo código en otro tenant crea fila aislada");
  const active = await call("configuracion/series/FACTURA", {
    serie: "F902",
    correlativo_maximo: 225,
    activo: true,
  });
  assert.equal(active.id, serie.id);
  assert.equal(active.estado, "ACTIVO");
  pass("Series: reactivación conserva número y límites");
  sql(
    `UPDATE documento_series SET correlativo_actual=5 WHERE id=${q(serie.id)};`,
  );
  await negative("series-maximum-below-current", {
    serie: "F902",
    correlativo_maximo: 4,
    activo: true,
  });
  proof.success = defects.length === 0;
} finally {
  proof.checkedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(output, "series-lifecycle.json"),
    JSON.stringify(proof, null, 2),
  );
}
console.log(
  JSON.stringify({
    success: proof.success,
    scenarios: scenarios.length,
    requests: requests.length,
    defects: defects.map((x) => ({ id: x.id, status: x.actual_status })),
    remoteWrites: false,
  }),
);
