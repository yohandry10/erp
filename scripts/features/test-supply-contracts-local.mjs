// F01: concurrencia con PostgreSQL real, sólo en el contenedor o clúster nativo
// efímero creado para esta feature. Nunca acepta URLs ni secretos remotos.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const [target, secondArg, thirdArg] = process.argv.slice(2);
const nativeMode = target === "--native";
const output = path.resolve(
  (nativeMode ? thirdArg : secondArg) || "artifacts/suministro-f01",
);
assert.ok(output.startsWith(path.resolve("artifacts") + path.sep));
let operationalFixture, amendmentFixture, executable, psql, native;
if (nativeMode) {
  const marker = realpathSync(secondArg);
  assert.ok(
    marker.startsWith(
      path.resolve("artifacts/suministro-f01-expediente") + path.sep,
    ),
  );
  native = JSON.parse(readFileSync(marker, "utf8"));
  assert.equal(native.ephemeral, true);
  assert.equal(native.remoteWrites, false);
  const root = realpathSync(native.root);
  assert.ok(
    root.startsWith(
      path.resolve("artifacts/suministro-f01-expediente") + path.sep,
    ),
  );
  assert.match(root, /[\\/]native-pg-[0-9]+[\\/]data$/);
  assert.ok(
    Number.isInteger(native.port) && native.port > 1024 && native.port < 65536,
  );
  assert.equal(
    readFileSync(path.join(root, "PG_VERSION"), "utf8").trim(),
    "16",
  );
  executable = "C:/Program Files/PostgreSQL/16/bin/psql.exe";
  psql = ["-h", "127.0.0.1", "-p", String(native.port)];
  operationalFixture = amendmentFixture = true;
} else {
  assert.match(target || "", /^[a-f0-9]{64}$/);
  const info = JSON.parse(
    execFileSync("docker", ["inspect", target], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000,
    }),
  )[0];
  assert.equal(info.Config.Image, "postgres:16");
  operationalFixture =
    info.Config.Labels["com.erp.feature"] === "suministro-f01-pedidos";
  amendmentFixture =
    operationalFixture ||
    info.Config.Labels["com.erp.feature"] === "suministro-f01-adendas";
  assert.ok(
    amendmentFixture ||
      info.Config.Labels["com.erp.feature"] === "suministro-f01",
  );
  assert.match(
    info.Name,
    operationalFixture
      ? /^\/erp-alk-pedidos-/
      : amendmentFixture
        ? /^\/erp-alk-adendas-/
        : /^\/erp-alk-features-/,
  );
  executable = "docker";
  psql = ["exec", "-i", target, "psql"];
}
psql.push(
  "-XqAt",
  "-U",
  "postgres",
  "-d",
  "erp_e2e",
  "-v",
  "ON_ERROR_STOP=1",
  "-v",
  "VERBOSITY=verbose",
);
const sql = (input) =>
  execFileSync(executable, psql, {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  }).trim();
if (nativeMode) {
  assert.equal(
    realpathSync(sql("SHOW data_directory;")),
    realpathSync(native.root),
  );
}
assert.equal(
  sql(
    "SELECT current_database()||'|'||current_setting('server_version_num');",
  ).split("|")[0],
  "erp_e2e",
);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => quote(JSON.stringify(value)) + "::jsonb";
const run = promisify(execFile);
const checks = [];
const report = {
  success: false,
  remoteWrites: false,
  scope: "Concurrencia real de RPCs F01 en PostgreSQL 16 efímero",
  checks,
};
mkdirSync(output, { recursive: true });
try {
  const fixture = JSON.parse(
    sql(`
    BEGIN;
    UPDATE app.deployment_environment SET environment='DEV',project_ref='localerpephemeralqax',allow_demo_data=true,configured_at=now(),updated_at=now() WHERE singleton;
    CREATE TEMP TABLE feature_fixture AS SELECT public.create_demo_tenant_ready_tx('Feature suministro local',14,'PE','f01-race-'||gen_random_uuid()::text) AS d;
    SELECT jsonb_build_object('tenant',d->>'tenant_id','actor',d->>'user_id',
      'client',(SELECT id FROM public.clientes WHERE tenant_id=(d->>'tenant_id')::uuid AND activo ORDER BY id LIMIT 1),
      'product',(SELECT id FROM public.productos WHERE tenant_id=(d->>'tenant_id')::uuid AND activo AND unidad_medida IS NOT NULL ORDER BY id LIMIT 1)) FROM feature_fixture;
    COMMIT;`),
  );
  const { tenant, actor, client, product } = fixture;
  for (const id of [tenant, actor, client, product])
    assert.match(id, /^[a-f0-9-]{36}$/);
  assert.equal(
    sql(
      "SELECT environment||'|'||project_ref FROM app.deployment_environment WHERE singleton;",
    ),
    "DEV|localerpephemeralqax",
  );
  const call = (action, id, payload, key) =>
    `public.operar_suministro_570(${quote(tenant)}::uuid,${quote(actor)}::uuid,${quote(action)},${id ? quote(id) + "::uuid" : "NULL"},${json(payload)},${quote(key)})`;
  const mutate = (action, id, payload, key) =>
    JSON.parse(
      sql(`SET ROLE service_role; SELECT ${call(action, id, payload, key)};`),
    );
  const race = async (calls) =>
    Promise.all(
      calls.map(async (callSql) => {
        try {
          const { stdout } = await run(
            executable,
            [
              ...psql,
              "-c",
              `BEGIN; SET LOCAL ROLE service_role; SELECT ${callSql}; SELECT pg_sleep(0.2); COMMIT;`,
            ],
            { encoding: "utf8", windowsHide: true, timeout: 30000 },
          );
          return { ok: true, value: JSON.parse(stdout.trim()) };
        } catch (error) {
          return {
            ok: false,
            code: String(error.stderr).match(/ERROR:\s+(\w{5}):/)?.[1],
          };
        }
      }),
    );
  const c = mutate(
    "CREAR_CONTRATO",
    null,
    {
      numero: "RACE-01",
      asunto: "Concurrencia de saldos",
      cliente_id: client,
      responsable_id: actor,
      moneda: "PEN",
      vigencia_desde: "2026-01-01",
      vigencia_hasta: "2026-12-31",
      lineas: [
        { producto_id: product, cantidad: 100, precio_unitario: 2.123456 },
      ],
    },
    "race-create-570",
  ).id;
  mutate("ACTIVAR", c, { version: 1 }, "race-activate-570");
  const line = sql(
    `SELECT id FROM public.suministro_contrato_lineas WHERE contrato_id=${quote(c)}::uuid;`,
  );
  const ocPayload = (n) => ({
    numero: `OC-RACE-${n}`,
    fecha_emision: "2026-02-01",
    lineas: [{ contrato_linea_id: line, cantidad: 60 }],
  });
  const ocRace = await race(
    [1, 2].map((n) => call("CREAR_OC", c, ocPayload(n), `race-oc-${n}-570`)),
  );
  assert.equal(ocRace.filter((r) => r.ok).length, 1);
  assert.equal(ocRace.find((r) => !r.ok)?.code, "23514");
  assert.equal(
    sql(
      `SELECT sum(cantidad) FROM public.suministro_orden_lineas WHERE contrato_id=${quote(c)}::uuid;`,
    ),
    "60.0000",
  );
  checks.push({
    scenario:
      "Dos OC simultáneas de 60 contra contrato de 100: sólo una confirma, sin cabecera huérfana",
    passed: true,
  });
  const ol = sql(
    `SELECT id FROM public.suministro_orden_lineas WHERE contrato_id=${quote(c)}::uuid;`,
  );
  const payload = {
    orden_linea_id: ol,
    cantidad: 40,
    fecha_programada: "2026-03-01",
    destino: "Almacén local",
  };
  const replay = await race(
    [1, 2, 3, 4].map(() =>
      call("PROGRAMAR", c, payload, "race-same-schedule-570"),
    ),
  );
  assert.ok(replay.every((r) => r.ok));
  assert.equal(new Set(replay.map((r) => r.value.id)).size, 1);
  assert.equal(replay.filter((r) => !r.value.idempotent).length, 1);
  checks.push({
    scenario:
      "Cuatro reintentos concurrentes confirman una sola entrega y un solo historial",
    passed: true,
  });
  const delivery = replay[0].value.id;
  const change = await race(
    [1, 2].map((n) =>
      call(
        "REPROGRAMAR",
        delivery,
        {
          version: 1,
          fecha_programada: `2026-03-${10 + n}`,
          destino: "Almacén local",
          motivo: `Cambio concurrente ${n}`,
        },
        `race-change-${n}-570`,
      ),
    ),
  );
  assert.equal(change.filter((r) => r.ok).length, 1);
  assert.equal(change.find((r) => !r.ok)?.code, "23505");
  assert.equal(
    sql(
      `SELECT fecha_original||'|'||version FROM public.suministro_entregas_programadas WHERE id=${quote(delivery)}::uuid;`,
    ),
    "2026-03-01|2",
  );
  checks.push({
    scenario:
      "Dos reprogramaciones sobre versión 1: una confirma, otra devuelve conflicto; fecha original intacta",
    passed: true,
  });
  const remaining = await race(
    [1, 2].map((n) =>
      call(
        "PROGRAMAR",
        c,
        { ...payload, cantidad: 20 },
        `race-remainder-${n}-570`,
      ),
    ),
  );
  assert.equal(remaining.filter((r) => r.ok).length, 1);
  assert.equal(remaining.find((r) => !r.ok)?.code, "23514");
  assert.equal(
    sql(
      `SELECT sum(cantidad) FROM public.suministro_entregas_programadas WHERE contrato_id=${quote(c)}::uuid AND estado='PROGRAMADA';`,
    ),
    "60.0000",
  );
  assert.equal(
    sql(
      `SELECT count(*) FROM public.suministro_historial WHERE contrato_id=${quote(c)}::uuid;`,
    ),
    "6",
  );
  checks.push({
    scenario:
      "Programaciones concurrentes consumen el remanente una sola vez y no exceden la OC",
    passed: true,
  });
  if (amendmentFixture) {
    const second = mutate(
      "CREAR_CONTRATO",
      null,
      {
        numero: "RACE-571",
        asunto: "Concurrencia de revisiones",
        cliente_id: client,
        responsable_id: actor,
        moneda: "PEN",
        vigencia_desde: "2026-01-01",
        vigencia_hasta: "2026-12-31",
        lineas: [{ producto_id: product, cantidad: 100, precio_unitario: 2 }],
      },
      "race-create-571",
    ).id;
    mutate("ACTIVAR", second, { version: 1 }, "race-activate-571");
    const secondLine = sql(
      `SELECT id FROM public.suministro_contrato_lineas WHERE contrato_id=${quote(second)}::uuid;`,
    );
    const amend = (quantity, version, reference) => ({
      version,
      referencia: reference,
      motivo: "Ajuste contractual concurrente",
      asunto: "Revisión contractual",
      vigencia_hasta: "2026-12-31",
      responsable_id: actor,
      lineas: [
        {
          id: secondLine,
          producto_id: product,
          cantidad: quantity,
          precio_unitario: 3,
        },
      ],
    });
    const allocation = (number, quantity) => ({
      numero: number,
      fecha_emision: "2026-02-01",
      lineas: [{ contrato_linea_id: secondLine, cantidad: quantity }],
    });
    const competing = await race([
      call("ADENDAR", second, amend(60, 2, "AD-RACE-1"), "race-shrink-571"),
      call("CREAR_OC", second, allocation("OC-BIG", 80), "race-allocate-571"),
    ]);
    assert.equal(competing.filter((r) => r.ok).length, 1);
    assert.equal(competing.find((r) => !r.ok)?.code, "23514");
    checks.push({
      scenario:
        "Adenda reduce a 60 mientras OC asigna 80: sólo una confirma, nunca excede contrato",
      passed: true,
    });
    const version = Number(
      sql(
        `SELECT version FROM public.suministro_contratos WHERE id=${quote(second)}::uuid;`,
      ),
    );
    const revisions = await race(
      [1, 2].map((n) =>
        call(
          "ADENDAR",
          second,
          amend(200 + n, version, `AD-SAME-${n}`),
          `race-amend-${n}-571`,
        ),
      ),
    );
    assert.equal(revisions.filter((r) => r.ok).length, 1);
    assert.equal(revisions.find((r) => !r.ok)?.code, "23505");
    checks.push({
      scenario:
        "Adendas simultáneas sobre la misma versión: una confirma y otra obtiene conflicto",
      passed: true,
    });
    const order = mutate(
      "CREAR_OC",
      second,
      allocation("OC-MOD-CANCEL", 40),
      "race-oc-change-571",
    ).id;
    const modifyCancel = await race([
      call(
        "MODIFICAR_OC",
        order,
        {
          ...allocation("OC-CHANGED", 70),
          version: 1,
          referencia: "MOD-RACE",
          motivo: "Cambio concurrente",
        },
        "race-mod-571",
      ),
      call(
        "ANULAR_OC",
        order,
        { version: 1, referencia: "AN-RACE", motivo: "Anulacion concurrente" },
        "race-cancel-571",
      ),
    ]);
    assert.equal(modifyCancel.filter((r) => r.ok).length, 1);
    assert.equal(modifyCancel.find((r) => !r.ok)?.code, "23505");
    checks.push({
      scenario:
        "Modificar y anular la misma OC simultáneamente: una confirma y otra obtiene conflicto",
      passed: true,
    });
    const order2 = mutate(
      "CREAR_OC",
      second,
      allocation("OC-CANCEL-SCHEDULE", 10),
      "race-oc-cancel-sched-571",
    ).id;
    const line2 = sql(
      `SELECT id FROM public.suministro_orden_lineas WHERE orden_cliente_id=${quote(order2)}::uuid;`,
    );
    const cancelSchedule = await race([
      call(
        "ANULAR_OC",
        order2,
        {
          version: 1,
          referencia: "AN-SCHEDULE",
          motivo: "Solicitud concurrente",
        },
        "race-cancel-schedule-571",
      ),
      call(
        "PROGRAMAR",
        second,
        {
          orden_linea_id: line2,
          cantidad: 10,
          fecha_programada: "2026-05-01",
          destino: "Almacen local",
        },
        "race-schedule-cancel-571",
      ),
    ]);
    assert.equal(cancelSchedule.filter((r) => r.ok).length, 1);
    assert.ok(
      ["23505", "23514"].includes(cancelSchedule.find((r) => !r.ok)?.code),
    );
    assert.equal(
      sql(`SELECT count(*) FROM public.suministro_entregas_programadas e JOIN public.suministro_orden_lineas ol ON ol.id=e.orden_linea_id
      JOIN public.suministro_ordenes_cliente o ON o.id=ol.orden_cliente_id WHERE o.id=${quote(order2)}::uuid AND o.estado='ANULADA' AND e.estado='PROGRAMADA';`),
      "0",
    );
    checks.push({
      scenario:
        "Anular OC y programar entrega en paralelo nunca dejan programación vigente en OC anulada",
      passed: true,
    });
  }
  if (operationalFixture) {
    const c3 = mutate(
      "CREAR_CONTRATO",
      null,
      {
        numero: "RACE-572",
        asunto: "Vinculos concurrentes",
        cliente_id: client,
        responsable_id: actor,
        moneda: "PEN",
        vigencia_desde: "2026-01-01",
        vigencia_hasta: "2026-12-31",
        lineas: [{ producto_id: product, cantidad: 200, precio_unitario: 2.5 }],
      },
      "572-concurrency-contract",
    ).id;
    mutate("ACTIVAR", c3, { version: 1 }, "572-concurrency-activate");
    const cl3 = sql(
      `SELECT id FROM public.suministro_contrato_lineas WHERE contrato_id=${quote(c3)}::uuid;`,
    );
    const oc3 = mutate(
      "CREAR_OC",
      c3,
      {
        numero: "OC572",
        fecha_emision: "2026-01-01",
        lineas: [{ contrato_linea_id: cl3, cantidad: 200 }],
      },
      "572-concurrency-oc",
    ).id;
    const ol3 = sql(
      `SELECT id FROM public.suministro_orden_lineas WHERE orden_cliente_id=${quote(oc3)}::uuid;`,
    );
    const schedule = (quantity, key) =>
      mutate(
        "PROGRAMAR",
        c3,
        {
          orden_linea_id: ol3,
          cantidad: quantity,
          fecha_programada: "2026-11-01",
          destino: "Almacen local",
        },
        key,
      ).id;
    const order = (quantity) =>
      JSON.parse(
        sql(
          `SELECT public.crear_pedido_comercial_tx(${json({ tenant_id: tenant, created_by: actor, cliente_id: client, moneda: "PEN" })},${json([{ producto_id: product, cantidad: quantity, precio_unitario: 2.5 }])});`,
        ),
      ).pedido_id;
    const link = (pedido, entrega, key) => {
      const detail = JSON.parse(
        sql(
          `SELECT public.consultar_suministro_pedidos_572(${quote(tenant)},${quote(actor)},${quote(c3)},'CANDIDATO',${quote(pedido)});`,
        ),
      );
      return `public.operar_suministro_pedidos_572(${quote(tenant)},${quote(actor)},${quote(c3)},'VINCULAR_PEDIDO',${quote(pedido)},${json({ motivo: "Vinculacion concurrente", fingerprint: detail.fingerprint, lineas: [{ pedido_detalle_id: detail.detalle[0].id, entrega_id: entrega }] })},${quote(key)})`;
    };
    const e3 = schedule(60, "572-concurrency-schedule");
    const links = await race([
      link(order(40), e3, "572-link-race-1"),
      link(order(40), e3, "572-link-race-2"),
    ]);
    assert.equal(links.filter((r) => r.ok).length, 1);
    assert.equal(links.find((r) => !r.ok)?.code, "23514");
    assert.equal(
      sql(`SELECT app.suministro_asignado_572(${quote(tenant)},${quote(e3)});`),
      "40.0000",
    );
    checks.push({
      scenario:
        "Dos pedidos de 40 contra programación de 60: sólo uno se vincula, sin vínculo huérfano",
      passed: true,
    });
    const e4 = schedule(30, "572-concurrency-cancel-schedule");
    const linkCancel = await race([
      link(order(30), e4, "572-link-cancel-race"),
      call(
        "ANULAR_ENTREGA",
        e4,
        { version: 1, motivo: "Anulacion concurrente" },
        "572-cancel-link-race",
      ),
    ]);
    assert.equal(linkCancel.filter((r) => r.ok).length, 1);
    assert.equal(linkCancel.find((r) => !r.ok)?.code, "23514");
    assert.equal(
      sql(
        `SELECT count(*) FROM public.suministro_entregas_programadas e WHERE id=${quote(e4)}::uuid AND estado='ANULADA' AND app.suministro_asignado_572(tenant_id,id)>0;`,
      ),
      "0",
    );
    checks.push({
      scenario:
        "Vincular pedido y anular programación en paralelo nunca dejan un compromiso en programación anulada",
      passed: true,
    });
    const e5 = schedule(30, "572-concurrency-edit-schedule"),
      p5 = order(30);
    const edit = `public.actualizar_pedido_comercial_pago_tx_531(${quote(p5)},${quote(tenant)},'{}'::jsonb,${json([{ producto_id: product, descripcion: "Pedido modificado", cantidad: 15, precio_unitario: 2.5 }])},NULL)`;
    const editLink = await race([link(p5, e5, "572-link-edit-race"), edit]);
    assert.equal(editLink.filter((r) => r.ok).length, 1);
    assert.ok(["23505", "23514"].includes(editLink.find((r) => !r.ok)?.code));
    checks.push({
      scenario:
        "Editar el pedido y vincular su snapshot en paralelo: uno confirma y el otro rechaza la intención obsoleta",
      passed: true,
    });
    const attachment = {
      recurso_tipo: "CONTRATO",
      recurso_id: c3,
      nombre: "Concurrente.pdf",
      mime: "application/pdf",
      bytes: 100,
      sha256: "a".repeat(64),
    };
    const reserve = `public.reservar_suministro_adjunto_573(${quote(tenant)},${quote(actor)},${quote(c3)},${json(attachment)},'573-race-reserve')`;
    const reservations = await race([reserve, reserve, reserve, reserve]);
    assert.ok(reservations.every((r) => r.ok));
    assert.equal(new Set(reservations.map((r) => r.value.id)).size, 1);
    const file = reservations[0].value;
    sql(
      `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('supply-contract-files',${quote(file.object_path)},'{"size":100}');`,
    );
    const finalize = `public.finalizar_suministro_adjunto_573(${quote(tenant)},${quote(actor)},${quote(file.id)})`;
    const finalized = await race([finalize, finalize, finalize, finalize]);
    assert.ok(finalized.every((r) => r.ok));
    assert.equal(finalized.filter((r) => !r.value.idempotent).length, 1);
    assert.equal(
      sql(
        `SELECT count(*) FROM public.suministro_historial WHERE recurso_id=${quote(file.id)}::uuid AND accion='ADJUNTAR_DOCUMENTO';`,
      ),
      "1",
    );
    checks.push({
      scenario:
        "Cuatro reservas y cuatro confirmaciones concurrentes de archivo producen un solo adjunto e historial",
      passed: true,
    });
  }
  report.success = true;
} finally {
  report.checkedAt = new Date().toISOString();
  writeFileSync(
    path.join(output, "concurrency.json"),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
