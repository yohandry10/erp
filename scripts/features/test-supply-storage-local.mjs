// Sólo acepta el contenedor creado para F01. Reemplaza el catálogo Storage
// mínimo de esa base efímera por Storage oficial; nunca carga .env ni URLs remotas.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import http from "node:http";
import path from "node:path";

const [pg, outputArg] = process.argv.slice(2);
assert.match(pg || "", /^[a-f0-9]{64}$/);
const output = path.resolve(outputArg || "artifacts/suministro-f01-expediente");
assert.ok(output.startsWith(path.resolve("artifacts") + path.sep));
mkdirSync(output, { recursive: true });
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
  }).trim();
const info = JSON.parse(docker(["inspect", pg]))[0];
assert.equal(info.Config.Image, "postgres:16");
assert.equal(info.Config.Labels["com.erp.feature"], "suministro-f01-pedidos");
assert.match(info.Name, /^\/erp-alk-pedidos-/);
assert.equal(info.NetworkSettings.Ports["5432/tcp"][0].HostIp, "127.0.0.1");
const sql = (s) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      pg,
      "psql",
      "-XqAt",
      "-U",
      "postgres",
      "-d",
      "erp_e2e",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: s, encoding: "utf8", windowsHide: true },
  ).trim();
assert.equal(sql("SELECT current_database();"), "erp_e2e");
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const id = Date.now() + "-" + process.pid,
  network = "erp-alk-file-" + id,
  created = [];
let networkId, server;
const secret = "local-supply-storage-only-never-production-573";
const jwt = (role) => {
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const p =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({ role, exp: Math.floor(Date.now() / 1000) + 1800 });
  return p + "." + createHmac("sha256", secret).update(p).digest("base64url");
};
const checks = [];
const report = { success: false, remoteWrites: false, checks };
const ready = async (url) => {
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await r.body?.cancel();
      if (r.status < 500) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Servicio local no inició");
};
const start = (name, image, environment, port) => {
  const container = docker([
    "run",
    "--detach",
    "--name",
    name,
    "--label",
    "com.erp.feature=suministro-f01-storage",
    "--network",
    network,
    "--publish",
    `127.0.0.1::${port}`,
    ...environment.flatMap((e) => ["--env", e]),
    image,
  ]);
  assert.match(container, /^[a-f0-9]{64}$/);
  created.push(container);
  const i = JSON.parse(docker(["inspect", container]))[0];
  return {
    container,
    origin:
      "http://127.0.0.1:" + i.NetworkSettings.Ports[`${port}/tcp`][0].HostPort,
  };
};
try {
  const fixture = JSON.parse(
    sql(`BEGIN; UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
 CREATE TEMP TABLE supply_storage_fixture AS SELECT public.create_demo_tenant_ready_tx('Storage supply local',14,'PE','573-storage-'||gen_random_uuid()::text) AS d;
 SELECT jsonb_build_object('tenant',d->>'tenant_id','actor',d->>'user_id','client',(SELECT id FROM public.clientes WHERE tenant_id=(d->>'tenant_id')::uuid AND activo ORDER BY id LIMIT 1),'product',(SELECT id FROM public.productos WHERE tenant_id=(d->>'tenant_id')::uuid AND activo AND unidad_medida IS NOT NULL ORDER BY id LIMIT 1)) FROM supply_storage_fixture; COMMIT;`),
  );
  const { tenant, actor, client, product } = fixture;
  assert.equal(
    sql(
      "SELECT environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;",
    ),
    "DEV|localerpephemeralqax",
  );
  networkId = docker([
    "network",
    "create",
    "--label",
    "com.erp.feature=suministro-f01-storage",
    network,
  ]);
  docker(["network", "connect", "--alias", "supply-pg", network, pg]);
  // Es la base vacía de pruebas propia, identificada y comprobada arriba. No
  // contiene archivos productivos; las fixtures anteriores quedan en artefactos.
  sql("DROP SCHEMA storage CASCADE; CREATE SCHEMA storage;");
  const rest = start(
    network + "-rest",
    "postgrest/postgrest@sha256:85258123312dc496ad4c2ed832154a65e9746f84df0d6d09b44229ff9230c08e",
    [
      "PGRST_DB_URI=postgres://postgres@supply-pg:5432/erp_e2e",
      "PGRST_DB_ANON_ROLE=anon",
      "PGRST_DB_SCHEMAS=public",
      `PGRST_JWT_SECRET=${secret}`,
      "GHCRTS=-N2",
    ],
    3000,
  );
  await ready(rest.origin);
  const storage = start(
    network + "-storage",
    "supabase/storage-api@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85",
    [
      "ANON_KEY=" + jwt("anon"),
      "SERVICE_KEY=" + jwt("service_role"),
      "AUTH_JWT_SECRET=" + secret,
      "DATABASE_URL=postgres://postgres@supply-pg:5432/erp_e2e",
      `POSTGREST_URL=http://${network}-rest:3000`,
      "STORAGE_BACKEND=file",
      "FILE_STORAGE_BACKEND_PATH=/var/lib/storage",
      "TENANT_ID=local-supply-only",
      "REGION=local",
      "GLOBAL_S3_BUCKET=local-ephemeral",
      "FILE_SIZE_LIMIT=10485760",
      "ENABLE_IMAGE_TRANSFORMATION=false",
    ],
    5000,
  );
  await ready(storage.origin + "/status");
  sql(
    "GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role; GRANT ALL ON ALL FUNCTIONS IN SCHEMA storage TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;",
  );
  const migration = readFileSync(
    "supabase/migrations/573__supply_private_attachments.sql",
    "utf8",
  );
  sql(
    migration.slice(
      0,
      migration.indexOf("CREATE TABLE public.suministro_adjuntos"),
    ) + "COMMIT;",
  );
  server = http.createServer((incoming, outgoing) => {
    const parsed = new URL(incoming.url, "http://127.0.0.1");
    const isStorage = parsed.pathname.startsWith("/storage/v1/");
    const target = new URL(isStorage ? storage.origin : rest.origin);
    const suffix = isStorage
      ? parsed.pathname.slice("/storage/v1".length)
      : parsed.pathname.replace(/^\/rest\/v1(?=\/)/, "");
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: target.port,
        path: suffix + parsed.search,
        method: incoming.method,
        headers: { ...incoming.headers, host: target.host },
      },
      (r) => {
        outgoing.writeHead(r.statusCode, r.headers);
        r.pipe(outgoing);
      },
    );
    request.on("error", () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(request);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const require = createRequire(path.resolve("apps/erp-api/package.json"));
  const { createClient } = require("@supabase/supabase-js");
  const {
    ExpedienteService,
  } = require("./dist/src/modules/ventas/contratos/expediente.service.js");
  let loseConfirmation = true;
  const clientApi = createClient(origin, jwt("service_role"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, options) => {
        assert.equal(new URL(url).hostname, "127.0.0.1");
        const response = await fetch(url, options);
        if (
          loseConfirmation &&
          String(url).includes("/rpc/finalizar_suministro_adjunto_573") &&
          response.ok
        ) {
          loseConfirmation = false;
          await response.body?.cancel();
          return new Response(
            JSON.stringify({
              code: "08006",
              message: "Local response intentionally lost",
            }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }
        return response;
      },
    },
  });
  const contract = await clientApi.rpc("operar_suministro_570", {
    p_tenant_id: tenant,
    p_actor_id: actor,
    p_accion: "CREAR_CONTRATO",
    p_id: null,
    p_payload: {
      numero: "STORAGE-573",
      asunto: "Expediente Storage real",
      cliente_id: client,
      responsable_id: actor,
      moneda: "PEN",
      vigencia_desde: "2026-01-01",
      vigencia_hasta: "2027-12-31",
      lineas: [{ producto_id: product, cantidad: 1, precio_unitario: 2.5 }],
    },
    p_idempotency_key: "storage-contract-573",
  });
  assert.ifError(contract.error);
  const contractId = contract.data.id;
  const service = new ExpedienteService({ getClient: () => clientApi });
  const buffer = Buffer.from("%PDF-1.7\nPrivate supply contract\n%%EOF");
  const file = {
    buffer,
    mimetype: "application/pdf",
    originalname: "Contrato.pdf",
    size: buffer.length,
  };
  const target = { recurso_tipo: "CONTRATO", recurso_id: contractId };
  await assert.rejects(() =>
    service.upload(
      tenant,
      actor,
      contractId,
      target,
      "storage-upload-573",
      file,
    ),
  );
  const recovered = await service.upload(
    tenant,
    actor,
    contractId,
    target,
    "storage-upload-573",
    file,
  );
  assert.ok(recovered.data.idempotent);
  const fileId = recovered.data.id;
  assert.equal(
    sql(
      `SELECT count(*) FROM public.suministro_adjuntos WHERE contrato_id=${quote(contractId)}::uuid;`,
    ),
    "1",
  );
  checks.push({
    scenario:
      "Servicio real con respuesta final perdida recupera un solo archivo e historial",
    passed: true,
  });
  const signed = await service.download(tenant, actor, contractId, fileId);
  const signedUrl = new URL(signed.data.url);
  assert.equal(signedUrl.hostname, "127.0.0.1");
  const downloaded = await fetch(signedUrl);
  assert.equal(downloaded.status, 200);
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    createHash("sha256").update(buffer).digest("hex"),
  );
  const objectPath = `${tenant}/${contractId}/${fileId}`;
  const publicRead = await fetch(
    storage.origin + "/object/public/supply-contract-files/" + objectPath,
  );
  assert.notEqual(publicRead.status, 200);
  await publicRead.body?.cancel();
  const anonymous = createClient(origin, jwt("anon"), {
    auth: { persistSession: false },
  });
  const direct = await anonymous.storage
    .from("supply-contract-files")
    .download(objectPath);
  assert.ok(direct.error);
  checks.push({
    scenario:
      "Descarga firmada entrega bytes exactos; bucket público y rol anon no pueden leer",
    passed: true,
  });
  // Objeto presente con reserva aún pendiente: el servicio debe comprobar la
  // huella y finalizar, sin sobrescribir el archivo.
  const reserved = await clientApi.rpc("reservar_suministro_adjunto_573", {
    p_tenant_id: tenant,
    p_actor_id: actor,
    p_contrato_id: contractId,
    p_payload: {
      ...target,
      nombre: file.originalname,
      mime: file.mimetype,
      bytes: file.size,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    },
    p_idempotency_key: "storage-pending-573",
  });
  assert.ifError(reserved.error);
  const stored = await clientApi.storage
    .from("supply-contract-files")
    .upload(reserved.data.object_path, buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
  assert.ifError(stored.error);
  await service.upload(
    tenant,
    actor,
    contractId,
    target,
    "storage-pending-573",
    file,
  );
  checks.push({
    scenario:
      "Subida interrumpida antes de finalizar verifica objeto ya existente y completa el adjunto",
    passed: true,
  });
  await service.retirar(
    tenant,
    actor,
    contractId,
    fileId,
    "Documento reemplazado",
    "storage-retire-573",
  );
  await assert.rejects(() =>
    service.download(tenant, actor, contractId, fileId),
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM storage.objects WHERE bucket_id='supply-contract-files' AND name=${quote(objectPath)};`,
    ),
    "1",
  );
  checks.push({
    scenario:
      "Retirar bloquea nuevos enlaces y conserva el objeto privado y su historial",
    passed: true,
  });
  report.success = true;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const container of created.reverse()) {
    const i = JSON.parse(docker(["inspect", container]))[0];
    assert.equal(i.Config.Labels["com.erp.feature"], "suministro-f01-storage");
    docker(["rm", "--force", "--volumes", container]);
  }
  if (networkId) {
    docker(["network", "disconnect", network, pg]);
    docker(["network", "rm", networkId]);
  }
  report.checkedAt = new Date().toISOString();
  writeFileSync(
    path.join(output, "storage-real.json"),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
