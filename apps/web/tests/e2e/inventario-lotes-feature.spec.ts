import { expect, test, type Page } from "@playwright/test";
import { fiscalCountryFixture } from "./fixtures/fiscal-country";
import { sesion, user } from "./helpers/supply-feature";

const id = (n: number) => `57400000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PRODUCTO = id(1);
const ALMACEN = id(2);
const PEDIDO = id(3);
const HOY = "2026-10-27";

type Bucket = { lote_id: string; lote: string; vence: string; stock: number; reservado: number };
type Mov = { tipo: string; lote_id: string; cantidad: number; referencia_tipo: string; consume_reserva?: boolean };

/** Doble local con estado del API de lotes: aplica las mismas reglas visibles. */
async function dobleLotes(page: Page, options: { readOnly?: boolean } = {}) {
  const state = {
    politica: { controla_lote: false, requiere_vencimiento: true, dias_minimos_vida_util: 0, version: 0 },
    fisico: 50,
    buckets: [] as Bucket[],
    reservas: [] as Array<{ lote_id: string; cantidad: number }>,
    movs: [] as Mov[],
    operaciones: [] as Array<{ id: string; accion: string; motivo: string | null }>,
  };
  const intents: Array<{ path: string; key: string; body: any }> = [];
  const completed = new Map<string, object>();
  let perderPrimeraPolitica = true;
  const estado = (vence: string) =>
    vence < HOY ? "VENCIDO" : vence <= "2027-01-25" ? "POR_VENCER" : "VIGENTE";
  const detalle = () => {
    const stockLotes = state.buckets.reduce((t, b) => t + b.stock, 0);
    const reservado = state.buckets.reduce((t, b) => t + b.reservado, 0);
    return {
      hoy: HOY,
      producto: { id: PRODUCTO, codigo: "INS-001", nombre: "Insumo con lote", unidad_medida: "NIU", stock_actual: state.fisico, stock_reservado: reservado },
      politica: state.politica,
      almacenes: [
        {
          almacen_id: ALMACEN,
          almacen_codigo: "PRIN",
          almacen_nombre: "Almacén principal",
          stock_actual: state.fisico,
          stock_reservado: reservado,
          stock_lotes: stockLotes,
          reservado_lotes: reservado,
          stock_sin_lote: state.politica.controla_lote ? state.fisico - stockLotes : 0,
          saldos: state.buckets.map((b) => ({
            lote_id: b.lote_id,
            lote: b.lote,
            fecha_vencimiento: b.vence,
            ubicacion_id: null,
            ubicacion_codigo: null,
            ubicacion_nombre: null,
            stock_actual: b.stock,
            stock_reservado: b.reservado,
            disponible: b.stock - b.reservado,
            estado: estado(b.vence),
          })),
          reservas: state.reservas.map((r) => {
            const b = state.buckets.find((x) => x.lote_id === r.lote_id)!;
            return {
              referencia_id: PEDIDO,
              lote_id: r.lote_id,
              lote: b.lote,
              fecha_vencimiento: b.vence,
              ubicacion_id: null,
              cantidad: r.cantidad,
              pedido_numero: "PV-2026-0001",
              cliente_nombre: "Hospital local",
            };
          }),
        },
      ],
      operaciones: state.operaciones.map((o) => ({ ...o, almacen_id: ALMACEN, referencia_id: null, actor_nombre: "Responsable Local", created_at: `${HOY}T15:00:00Z` })),
    };
  };
  const movimientos = (loteId: string | null) => {
    const saldo = new Map<string, number>();
    const rows = state.movs.map((m, i) => {
      const delta = m.tipo === "SALIDA" ? -m.cantidad : ["ENTRADA", "REGULARIZACION"].includes(m.tipo) ? m.cantidad : 0;
      saldo.set(m.lote_id, (saldo.get(m.lote_id) ?? 0) + delta);
      const b = state.buckets.find((x) => x.lote_id === m.lote_id)!;
      return {
        id: id(1000 + i),
        created_at: `${HOY}T15:${String(10 + i).padStart(2, "0")}:00Z`,
        tipo: m.tipo,
        cantidad: m.cantidad,
        consume_reserva: Boolean(m.consume_reserva),
        almacen_nombre: "Almacén principal",
        lote_id: m.lote_id,
        lote: b.lote,
        fecha_vencimiento: b.vence,
        ubicacion_codigo: null,
        referencia_tipo: m.referencia_tipo,
        notas: null,
        saldo_lote: saldo.get(m.lote_id),
      };
    });
    return rows.filter((r) => !loteId || r.lote_id === loteId).reverse();
  };

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return route.abort("blockedbyclient");
    if (!url.pathname.includes("/api/")) return route.continue();
    const path = url.pathname.replace(/^.*\/api\//, "/").replace(/\/$/, "");
    const json = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    const common: Record<string, unknown> = {
      "/auth/profile": user,
      "/tenants/me": { data: { id: user.tenant_id, nombre: "Empresa de prueba local", pais: "PE", moneda: "PEN", estado: "ACTIVO" } },
      "/demo/status": { is_demo: false, is_expired: false },
      "/notifications/unread": { data: [], count: 0 },
      "/usuarios-sistema/me/permissions": {
        data: (options.readOnly ? ["read"] : ["read", "manage"]).map((accion) => ({
          id: accion,
          tenant_id: user.tenant_id,
          modulo: "inventario",
          recurso: "lotes",
          accion,
        })),
      },
      "/configuration/context/country": fiscalCountryFixture(user.tenant_id, { pais_id: 1, pais: "PE", monedaDefecto: "PEN" }),
      "/configuration/empresa": { success: true, data: { pais: "PE", paisCodigo: "PE", razonSocial: "Empresa local", monedaDefecto: "PEN" } },
      "/configuration/status": { success: true, data: { isComplete: true, isDemo: false, completionPercentage: 100 } },
    };
    if (path in common) return json(common[path]);
    if (path === `/inventario/almacenes/${ALMACEN}/ubicaciones`)
      return json({ success: true, data: [{ id: id(9), codigo: "R-A", nombre: "Rack A" }] });
    if (!path.startsWith("/inventario/lotes")) return json({ success: true, data: [] });
    const method = route.request().method();
    if (method === "GET") {
      if (path === "/inventario/lotes/productos")
        return json({
          success: true,
          data: { items: [{ id: PRODUCTO, codigo: "INS-001", nombre: "Insumo con lote", unidad_medida: "NIU", stock_actual: state.fisico, controla_lote: state.politica.controla_lote }] },
        });
      if (path === `/inventario/lotes/productos/${PRODUCTO}`) return json({ success: true, data: detalle() });
      if (path === `/inventario/lotes/productos/${PRODUCTO}/movimientos`)
        return json({ success: true, data: { items: movimientos(url.searchParams.get("lote_id")) } });
      if (path === "/inventario/lotes/por-vencer")
        return json({
          success: true,
          data: {
            items: state.buckets
              .filter((b) => b.stock > 0 && estado(b.vence) !== "VIGENTE")
              .map((b) => ({ lote_id: b.lote_id, lote: b.lote, fecha_vencimiento: b.vence, producto_id: PRODUCTO, producto_codigo: "INS-001", producto_nombre: "Insumo con lote", stock_actual: b.stock, stock_reservado: b.reservado, estado: estado(b.vence) })),
          },
        });
      return json({ message: "No encontrado" }, 404);
    }
    if (options.readOnly) return json({ message: "No tiene permiso para esta operación." }, 403);
    const key = route.request().headers()["idempotency-key"];
    const body = route.request().postDataJSON();
    intents.push({ path, key, body });
    if (!key) return json({ message: "Se requiere Idempotency-Key" }, 400);
    if (completed.has(key)) return json({ success: true, data: { ...completed.get(key), idempotent: true } });
    const done = (accion: string, motivo: string | null = null) => {
      const data = { id: id(500 + completed.size), accion, producto_id: PRODUCTO, idempotent: false };
      completed.set(key, data);
      state.operaciones.unshift({ id: data.id, accion, motivo });
      return json({ success: true, data });
    };
    if (path.endsWith("/politica")) {
      if (body.version !== state.politica.version) return json({ message: "La política de lote cambió. Actualice antes de guardar." }, 409);
      state.politica = { ...body, version: state.politica.version + 1 };
      if (perderPrimeraPolitica) {
        perderPrimeraPolitica = false;
        // La base confirmó, pero la respuesta se pierde en la red.
        completed.set(key, { id: id(499), accion: "CONFIGURAR_POLITICA", producto_id: PRODUCTO });
        state.operaciones.unshift({ id: id(499), accion: "CONFIGURAR_POLITICA", motivo: null });
        return route.abort("connectionreset");
      }
      return done("CONFIGURAR_POLITICA");
    }
    if (path.endsWith("/regularizaciones")) {
      const total = body.lineas.reduce((t: number, l: any) => t + l.cantidad, 0);
      const sinLote = state.fisico - state.buckets.reduce((t, b) => t + b.stock, 0);
      if (total > sinLote) return json({ message: "La regularización supera el stock sin lote del almacén." }, 400);
      for (const l of body.lineas) {
        const lote_id = id(100 + state.buckets.length);
        state.buckets.push({ lote_id, lote: l.lote, vence: l.fecha_vencimiento, stock: l.cantidad, reservado: 0 });
        state.movs.push({ tipo: "REGULARIZACION", lote_id, cantidad: l.cantidad, referencia_tipo: "REGULARIZAR" });
      }
      return done("REGULARIZAR", body.motivo);
    }
    if (path.endsWith("/reservas/reasignar")) {
      const actual = state.reservas.reduce((t, r) => t + r.cantidad, 0);
      const total = body.lineas.reduce((t: number, l: any) => t + l.cantidad, 0);
      if (total !== actual) return json({ message: "La reasignación debe repartir exactamente la cantidad reservada por el documento." }, 400);
      for (const r of state.reservas) {
        state.buckets.find((b) => b.lote_id === r.lote_id)!.reservado -= r.cantidad;
        state.movs.push({ tipo: "LIBERACION", lote_id: r.lote_id, cantidad: r.cantidad, referencia_tipo: "REASIGNAR_RESERVA" });
      }
      state.reservas = body.lineas.map((l: any) => ({ lote_id: l.lote_id, cantidad: l.cantidad }));
      for (const r of state.reservas) {
        state.buckets.find((b) => b.lote_id === r.lote_id)!.reservado += r.cantidad;
        state.movs.push({ tipo: "RESERVA", lote_id: r.lote_id, cantidad: r.cantidad, referencia_tipo: "REASIGNAR_RESERVA" });
      }
      return done("REASIGNAR_RESERVA", body.motivo);
    }
    return json({ message: "No encontrado" }, 404);
  });
  return {
    intents,
    state,
    /** Confirma un pedido: el writer reserva FEFO en el lote que vence primero. */
    confirmarPedido(cantidad: number) {
      const b = [...state.buckets].sort((x, y) => x.vence.localeCompare(y.vence))[0];
      b.reservado += cantidad;
      state.reservas.push({ lote_id: b.lote_id, cantidad });
      state.movs.push({ tipo: "RESERVA", lote_id: b.lote_id, cantidad, referencia_tipo: "PEDIDO" });
    },
  };
}

for (const mobile of [false, true]) {
  test(`Lotes: activación, regularización y reserva dividida entre lotes ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }, info) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(20000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    const api = await dobleLotes(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const shot = (name: string) =>
      page.screenshot({ path: `../../artifacts/suministro-f02-lotes/browser/${mobile ? "movil" : "escritorio"}-${name}.png`, fullPage: true });

    await page.goto("/dashboard/inventario/lotes/");
    const main = page.getByRole("main").filter({ has: page.getByRole("heading", { name: "Lotes y vencimientos", exact: true }) });
    await main.getByRole("button", { name: /INS-001/ }).click();
    await expect(main.getByRole("heading", { name: "INS-001 · Insumo con lote" })).toBeVisible();
    await expect(main.getByText("Este producto no distingue lotes")).toBeVisible();

    // Activación con respuesta perdida: se conserva la clave y el reintento recupera el resultado.
    await main.getByRole("button", { name: "Activar control de lote", exact: true }).click();
    await page.getByLabel("Controlar existencias por lote").check();
    await page.getByLabel("Vida útil mínima (días)").fill("30");
    await page.getByRole("button", { name: "Guardar política", exact: true }).click();
    await expect(page.getByText("La operación aún no está confirmada")).toBeVisible();
    await page.getByRole("button", { name: "Reintentar operación", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Política de lote actualizada (ya estaba registrada)" })).toBeVisible();
    const politicas = api.intents.filter((i) => i.path.endsWith("/politica"));
    expect(politicas).toHaveLength(2);
    expect(politicas[0].key).toBe(politicas[1].key);
    expect(politicas[0].body).toEqual({ controla_lote: true, requiere_vencimiento: true, dias_minimos_vida_util: 30, version: 0 });
    await expect(main.getByText("30 días al reservar o despachar")).toBeVisible();
    await expect(main.getByText("50 unidades entraron sin evidencia de lote")).toBeVisible();

    // Regularización: la validación local impide exceder el stock sin lote.
    await main.getByRole("button", { name: "Regularizar", exact: true }).click();
    const form = page.getByRole("form", { name: "Regularizar stock sin lote" });
    await form.getByLabel("Lote", { exact: true }).fill("L-2027");
    await form.getByLabel("Vence", { exact: true }).fill("2027-06-30");
    await form.getByLabel("Cantidad", { exact: true }).fill("60");
    await form.getByLabel("Motivo y evidencia").fill("Conteo físico del 27/10 con etiquetas del proveedor");
    await form.getByRole("button", { name: "Registrar regularización" }).click();
    await expect(form.getByRole("alert")).toHaveText("Solo hay 50 sin lote en este almacén.");
    expect(api.intents.filter((i) => i.path.endsWith("/regularizaciones"))).toHaveLength(0);
    await form.getByLabel("Cantidad", { exact: true }).fill("30");
    await form.getByRole("button", { name: "Agregar lote" }).click();
    await form.getByLabel("Lote", { exact: true }).nth(1).fill("L-2026");
    await form.getByLabel("Vence", { exact: true }).nth(1).fill("2026-12-15");
    await form.getByLabel("Cantidad", { exact: true }).nth(1).fill("15");
    await form.getByLabel("Ubicación").nth(1).selectOption(id(9));
    await expect(form.getByText("Total a regularizar: 45")).toBeVisible();
    await form.getByRole("button", { name: "Registrar regularización" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Stock sin lote regularizado" })).toBeVisible();
    const regularizacion = api.intents.find((i) => i.path.endsWith("/regularizaciones"))!;
    expect(regularizacion.body.lineas).toEqual([
      { lote: "L-2027", fecha_vencimiento: "2027-06-30", cantidad: 30 },
      { lote: "L-2026", fecha_vencimiento: "2026-12-15", ubicacion_id: id(9), cantidad: 15 },
    ]);
    await expect(main.getByText("5 unidades entraron sin evidencia de lote")).toBeVisible();
    await expect(main.locator("span:visible", { hasText: /^Por vencer$/ }).first()).toBeVisible();

    // Un pedido confirmado reserva FEFO; luego se divide entre dos lotes.
    api.confirmarPedido(12);
    await main.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(main.getByText("Pedido PV-2026-0001")).toBeVisible();
    await main.getByRole("button", { name: "Reasignar lotes", exact: true }).click();
    const reasignar = page.getByRole("form", { name: "Reasignar lotes de la reserva" });
    await reasignar.getByLabel("Cantidad del lote L-2026").fill("4");
    await reasignar.getByLabel("Cantidad del lote L-2027").fill("6");
    await reasignar.getByLabel("Motivo").fill("El cliente pide vencimiento largo en parte de la entrega");
    await reasignar.getByRole("button", { name: "Reasignar reserva" }).click();
    await expect(reasignar.getByRole("alert")).toHaveText("Reparta exactamente 12; lleva 10.");
    await reasignar.getByLabel("Cantidad del lote L-2027").fill("8");
    await reasignar.getByRole("button", { name: "Reasignar reserva" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Reserva reasignada entre lotes" })).toBeVisible();
    const reasignacion = api.intents.find((i) => i.path.endsWith("/reservas/reasignar"))!;
    expect(reasignacion.body).toMatchObject({ almacen_id: ALMACEN, referencia_id: PEDIDO });
    expect(reasignacion.body.lineas).toEqual([
      { lote_id: id(100), ubicacion_id: null, cantidad: 8 },
      { lote_id: id(101), ubicacion_id: null, cantidad: 4 },
    ]);
    await expect(main.getByText(/L-2027 · vence 30\/06\/2027 · 8/)).toBeVisible();
    await expect(main.getByText(/L-2026 · vence 15\/12\/2026 · 4/)).toBeVisible();

    // Kardex por lote con saldo corrido; el filtro por lote viene del saldo.
    await expect(main.getByRole("heading", { name: "Kardex por lote" })).toBeVisible();
    await main.getByRole("button", { name: mobile ? "L-2027" : "Ver kardex del lote L-2027" }).first().click();
    await expect(main.getByRole("heading", { name: "Kardex por lote · L-2027" })).toBeVisible();
    await shot("producto");

    await main.getByRole("tab", { name: "Por vencer" }).click();
    await expect(main.getByRole("cell", { name: "L-2026" })).toBeVisible();
    await expect(main.getByRole("cell", { name: "L-2027" })).toHaveCount(0);
    await shot("por-vencer");
    expect(errors).toEqual([]);
    void info;
  });
}

test("Lotes: el lector consulta sin controles de escritura", async ({ context, page }) => {
  page.setDefaultTimeout(20000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await sesion(context, page);
  const api = await dobleLotes(page, { readOnly: true });
  await page.goto("/dashboard/inventario/lotes/");
  const main = page.getByRole("main").filter({ has: page.getByRole("heading", { name: "Lotes y vencimientos", exact: true }) });
  await main.getByRole("button", { name: /INS-001/ }).click();
  await expect(main.getByRole("heading", { name: "INS-001 · Insumo con lote" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Activar control de lote" })).toHaveCount(0);
  expect(api.intents).toHaveLength(0);
});
