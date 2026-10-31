import { expect, test, type Page } from "@playwright/test";
import { doble, sesion, user, uuid } from "./helpers/supply-feature";

const DESPACHO = uuid(60);
const LOTE_A = uuid(61);
const LOTE_B = uuid(62);

/** Superpone al expediente F01 la ejecución y las recepciones de F03. */
async function dobleEntregas(page: Page, options: { conformar: boolean }) {
  const recepciones: any[] = [];
  const intents: Array<{ path: string; key: string; body: any }> = [];
  const completed = new Map<string, object>();
  let perderPrimera = true;
  const recibido = (lote: string | null) =>
    recepciones
      .filter((r) => r.estado === "REGISTRADA")
      .flatMap((r) => r.lineas)
      .filter((l: any) => (l.lote_id ?? null) === lote)
      .reduce((t: number, l: any) => t + l.cantidad_recibida, 0);
  const suma = (campo: string) =>
    recepciones.filter((r) => r.estado === "REGISTRADA").flatMap((r) => r.lineas).reduce((t: number, l: any) => t + l[campo], 0);
  const ejecucion = () => ({
    programaciones: [
      {
        entrega_id: uuid(9), estado: "PROGRAMADA", fecha_original: "2026-11-10", fecha_programada: "2026-11-10",
        destino: "Almacén del cliente", cantidad_programada: 40, oc_numero: "OC-001", producto_id: uuid(4),
        codigo_producto: "SKU-1", descripcion: "Producto de suministro", unidad_medida: "NIU",
        cantidad_despachada: 30, cantidad_recibida: suma("cantidad_recibida"),
        cantidad_aceptada: suma("cantidad_aceptada"), cantidad_rechazada: suma("cantidad_rechazada"),
      },
    ],
    despachos: [
      {
        despacho_id: DESPACHO, pedido_id: uuid(40), pedido_numero: "PV-2026-0040", entrega_id: uuid(9),
        pedido_detalle_id: uuid(41), producto_id: uuid(4), producto_nombre: "Producto de suministro", producto_codigo: "SKU-1",
        fecha_despacho: "2026-10-27T15:00:00Z", cantidad: 30, cantidad_recibida: recibido(LOTE_A) + recibido(LOTE_B),
        lotes: [
          { lote_id: LOTE_A, lote: "LA-2027", fecha_vencimiento: "2027-06-30", cantidad: 20, cantidad_recibida: recibido(LOTE_A) },
          { lote_id: LOTE_B, lote: "LB-2028", fecha_vencimiento: "2028-01-31", cantidad: 10, cantidad_recibida: recibido(LOTE_B) },
        ],
      },
    ],
    recepciones: recepciones.map((r) => ({
      ...r,
      pedido_numero: "PV-2026-0040",
      actor_nombre: "Responsable Local",
      lineas: r.lineas.map((l: any) => ({
        ...l, producto_nombre: "Producto de suministro", lote: l.lote_id === LOTE_A ? "LA-2027" : "LB-2028",
      })),
    })),
  });
  // El cliente llama a /backend/api/... con barra final.
  await page.route(/\/api\/usuarios-sistema\/me\/permissions\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          ...["ver", "editar"].map((accion) => ({ id: `p-${accion}`, tenant_id: user.tenant_id, modulo: "ventas", recurso: "pedidos", accion })),
          ...["ver", ...(options.conformar ? ["conformar"] : [])].map((accion) => ({
            id: `c-${accion}`, tenant_id: user.tenant_id, modulo: "ventas", recurso: "contratos", accion,
          })),
        ],
      }),
    }),
  );
  await page.route(/\/api\/ventas\/contratos\/[^/]+\/ejecucion\/?(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: ejecucion() }) }),
  );
  await page.route(/\/api\/ventas\/contratos\/[^/]+\/recepciones(\/.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    const key = route.request().headers()["idempotency-key"];
    const body = route.request().postDataJSON();
    intents.push({ path, key, body });
    if (completed.has(key))
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { ...completed.get(key), idempotent: true } }) });
    if (path.endsWith("/recepciones")) {
      for (const l of body.lineas) {
        const tope = l.lote_id === LOTE_A ? 20 : 10;
        if (recibido(l.lote_id) + l.cantidad_recibida > tope)
          return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Lo recibido supera lo despachado de ese lote." }) });
      }
      const id = uuid(70 + recepciones.length);
      recepciones.push({ id, numero: recepciones.length + 1, ...body, estado: "REGISTRADA", version: 1, motivo_anulacion: null });
      const data = { id, contrato_id: uuid(5), accion: "REGISTRAR_RECEPCION", numero: recepciones.length };
      completed.set(key, data);
      if (perderPrimera) {
        perderPrimera = false;
        return route.abort("connectionreset");
      }
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
    }
    if (path.endsWith("/anular")) {
      const r = recepciones.find((x) => path.includes(x.id));
      r.estado = "ANULADA";
      r.version += 1;
      r.motivo_anulacion = body.motivo;
      const data = { id: r.id, contrato_id: uuid(5), accion: "ANULAR_RECEPCION" };
      completed.set(key, data);
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  return { intents, recepciones };
}

for (const mobile of [false, true])
  test(`Feature entregas: recepción por lote con rechazo y respuesta perdida ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    await doble(page, { expediente: true });
    const api = await dobleEntregas(page, { conformar: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/ventas/contratos/", { timeout: 90000 });
    await page.getByRole("button", { name: /SUP-001.*Activo/ }).click();
    const region = page.getByRole("region", { name: "Entregas y conformidades" });
    await expect(region.getByText("Marcar el seguimiento como entregado no acredita conformidad.", { exact: false })).toBeVisible();
    await expect(region.getByRole("cell", { name: "30" }).first()).toBeVisible();

    await region.getByRole("button", { name: "Registrar recepción", exact: true }).click();
    const form = page.getByRole("form", { name: "Registrar recepción del cliente" });
    await form.getByLabel("Recibió", { exact: true }).fill("María Quispe");
    await form.getByLabel("Guía de remisión").fill("T001-120");
    await form.getByLabel("PECOSA").fill("PEC-2026-88");
    await form.getByLabel("Rechazado de SKU-1 lote LA-2027").fill("2");
    await form.getByRole("button", { name: "Registrar recepción" }).click();
    await expect(form.getByRole("alert")).toHaveText("Indique el motivo de cada rechazo (mínimo 5 caracteres).");
    expect(api.intents).toHaveLength(0);
    await form.getByLabel("Motivo del rechazo de SKU-1 lote LA-2027").fill("Embalaje dañado");
    await form.getByRole("button", { name: "Registrar recepción" }).click();
    await expect(page.getByText("La operación aún no está confirmada.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Reintentar operación", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Recepción del cliente registrada" })).toBeVisible();
    expect(api.intents).toHaveLength(2);
    expect(api.intents[0].key).toBe(api.intents[1].key);
    expect(api.intents[0].body).toEqual({
      pedido_id: uuid(40),
      fecha_recepcion: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      receptor_nombre: "María Quispe",
      guia_referencia: "T001-120",
      pecosa_numero: "PEC-2026-88",
      lineas: [
        { despacho_id: DESPACHO, lote_id: LOTE_A, cantidad_recibida: 20, cantidad_aceptada: 18, cantidad_rechazada: 2, motivo_rechazo: "Embalaje dañado" },
        { despacho_id: DESPACHO, lote_id: LOTE_B, cantidad_recibida: 10, cantidad_aceptada: 10, cantidad_rechazada: 0 },
      ],
    });
    expect(api.recepciones).toHaveLength(1);
    await expect(region.getByText(/Recepción 1 · Pedido PV-2026-0040/)).toBeVisible();
    await expect(region.getByText(/rechazado 2: Embalaje dañado/)).toBeVisible();
    await expect(region.getByRole("button", { name: "Registrar recepción", exact: true })).toHaveCount(0);
    await page.screenshot({ path: `../../artifacts/suministro-f03-entregas/browser/${mobile ? "movil" : "escritorio"}-recepcion.png`, fullPage: true });

    await region.getByRole("button", { name: "Anular", exact: true }).click();
    await page.getByLabel("Motivo de la anulación").fill("Registro equivocado");
    await page.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Recepción anulada" })).toBeVisible();
    expect(api.intents.at(-1)?.body).toEqual({ version: 1, motivo: "Registro equivocado" });
    await expect(region.getByText(/Recepción 1 .* · Anulada/)).toBeVisible();
    await expect(region.getByRole("button", { name: "Registrar recepción", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

test("Feature entregas: sin permiso de conformidad sólo se consulta", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await sesion(context, page);
  await doble(page, { expediente: true });
  const api = await dobleEntregas(page, { conformar: false });
  await page.goto("/dashboard/ventas/contratos/", { timeout: 90000 });
  await page.getByRole("button", { name: /SUP-001.*Activo/ }).click();
  const region = page.getByRole("region", { name: "Entregas y conformidades" });
  await expect(region.getByText("Pedido PV-2026-0040")).toBeVisible();
  await expect(region.getByRole("button", { name: "Registrar recepción" })).toHaveCount(0);
  expect(api.intents).toHaveLength(0);
});
