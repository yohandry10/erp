import { expect, test, type Page } from "@playwright/test";
import { doble, sesion, user, uuid } from "./helpers/supply-feature";

const contrato = uuid(5);
const corte = uuid(500);
const vivo = { id: null, fecha_corte: "2026-10-27", origen: "EN_VIVO", generado_en: "2026-10-27T20:00:00Z", hash: "b".repeat(64), filas: {} };
const registrado = { ...vivo, id: corte, origen: "EXPORTACION", generado_por_nombre: "Responsable Local", hash: "c".repeat(64) };
const datasets = {
  contratos: [{ contrato_id: contrato, contrato_numero: "SUP-001", cliente_id: uuid(3), cliente: "Cliente local", moneda: "PEN",
    orden_cliente_id: uuid(7), oc_numero: "OC-001", oc_fecha: "2026-08-28", cantidad_oc: 80, programado: 70, despachado: 40,
    aceptado: 40, valor_oc: 1000, facturado_valor: 0, por_facturar_valor: 400 }],
  entregas: [
    { entrega_id: uuid(9), contrato_id: contrato, contrato_numero: "SUP-001", cliente_id: uuid(3), cliente: "Cliente local",
      oc_numero: "OC-001", codigo_producto: "SKU-1", descripcion: "Producto de suministro", destino: "Hospital",
      fecha_original: "2026-09-27", fecha_programada: "2026-09-27", cantidad: 40, despachado: 40, aceptado: 40, rechazado: 0,
      fecha_cumplimiento: "2026-09-26", cumplimiento: "A_TIEMPO_COMPLETA", dias_atraso: 0, pedidos: "PV-0040", recepciones: "1" },
    { entrega_id: uuid(10), contrato_id: contrato, contrato_numero: "SUP-001", cliente_id: uuid(3), cliente: "Cliente local",
      oc_numero: "OC-001", codigo_producto: "SKU-1", descripcion: "Producto de suministro", destino: "Hospital",
      fecha_original: "2026-10-17", fecha_programada: "2026-10-17", cantidad: 20, despachado: 0, aceptado: 0, rechazado: 0,
      fecha_cumplimiento: null, cumplimiento: "ATRASADA", dias_atraso: 10, pedidos: null, recepciones: null },
    { entrega_id: uuid(11), contrato_id: contrato, contrato_numero: "SUP-001", cliente_id: uuid(3), cliente: "Cliente local",
      oc_numero: "OC-001", codigo_producto: "SKU-2", descripcion: "Medicamento", destino: "Hospital",
      fecha_original: "2026-11-06", fecha_programada: "2026-11-06", cantidad: 10, despachado: 0, aceptado: 0, rechazado: 0,
      fecha_cumplimiento: null, cumplimiento: "EN_PLAZO", dias_atraso: 0, pedidos: null, recepciones: null },
  ],
  stock: [{ producto_id: uuid(30), codigo_producto: "SKU-2", descripcion: "Medicamento", unidad_medida: "NIU", stock_fisico: 8,
    stock_vencido: 3, stock_utilizable: 5, stock_reservado: 0, pendiente_30_dias: 10, pendiente_total: 10, cobertura_pct: 50,
    estado: "SIN_COBERTURA", contrato_ids: [contrato], cliente_ids: [uuid(3)] }],
  cobranza: [{ cxc_id: uuid(80), pedido_id: uuid(40), pedido_numero: "PV-0040", documento: "F001-120", fecha_emision: "2026-09-26",
    fecha_vencimiento: "2026-10-22", moneda: "PEN", total: 472, notas_credito: 0, cobrado: 0, saldo: 472, cuadra: true,
    contrato_id: contrato, contrato_numero: "SUP-001", cliente_id: uuid(3), cliente: "Cliente local", dias_vencido: 5, situacion: "VENCIDO" }],
};
const resumen = {
  cumplimiento: { ordenes: 1, cantidad_oc: 80, aceptado: 40, porcentaje: 50 },
  entregas: { exigibles: 2, a_tiempo_completas: 1, tardias: 0, atrasadas: 1, en_plazo: 1, porcentaje: 50, dias_atraso_promedio: 10 },
  stock: { productos: 1, sin_cobertura: 1 },
  facturacion: [{ moneda: "PEN", facturado: 0, por_facturar: 400 }],
  cobranza: [{ moneda: "PEN", documentos: 1, saldo: 472, vencido: 472 }],
};

async function dobleTablero(page: Page, options: { exportar: boolean; bi: boolean }) {
  const consultas: URLSearchParams[] = [];
  const intents: Array<{ path: string; key: string; body: any }> = [];
  const credenciales: any[] = [];
  let registrados: any[] = [];
  await page.route(/\/api\/usuarios-sistema\/me\/permissions\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          ["ventas", "contratos", "ver"],
          ["reports", "suministro", "read"],
          ...(options.exportar ? [["reports", "suministro", "export"]] : []),
          ...(options.bi ? [["integraciones", "bi", "gestionar"]] : []),
        ].map(([modulo, recurso, accion]) => ({ id: `${modulo}.${recurso}.${accion}`, tenant_id: user.tenant_id, modulo, recurso, accion })),
      }),
    }),
  );
  await page.route(/\/api\/reportes\/suministro\/?(\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    consultas.push(params);
    const filtrado = params.get("contrato_id") && params.get("contrato_id") !== contrato;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
      corte: params.get("corte_id") ? registrado : vivo,
      filtros: {},
      datasets: filtrado ? { contratos: [], entregas: [], stock: [], cobranza: [] } : datasets,
      resumen,
      ocultos: ["vencimientos", "penalidades"],
      cortes: registrados,
    } }) });
  });
  await page.route(/\/api\/reportes\/suministro\/cortes\/?$/, (route) => {
    intents.push({ path: "cortes", key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
    registrados = [registrado];
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: registrado }) });
  });
  await page.route(/\/api\/reportes\/suministro\/cortes\/[^/]+\/excel\/?(\?.*)?$/, (route) => {
    intents.push({ path: new URL(route.request().url()).pathname + new URL(route.request().url()).search, key: "", body: null });
    return route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="tablero_suministro_2026-10-27_57000000.xlsx"',
        "x-corte-hash": registrado.hash,
        "access-control-expose-headers": "content-disposition, x-corte-hash",
      },
      body: Buffer.from("PK-libro-de-prueba"),
    });
  });
  await page.route(/\/api\/integraciones\/bi\/credenciales(\/[^?]*)?\/?(\?.*)?$/, (route) => {
    const req = route.request();
    if (req.method() === "GET")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
        visibles: ["contratos", "entregas", "stock", "cobranza"], credenciales,
        accesos: [{ id: 1, credencial: "Power BI gerencia", dataset: "entregas", corte_id: corte, resultado: "OK", filas: 3,
          hash: registrado.hash, created_at: "2026-10-27T21:00:00Z" }],
      } }) });
    const body = req.postDataJSON();
    const path = new URL(req.url()).pathname.replace(/\/$/, "");
    intents.push({ path, key: req.headers()["idempotency-key"], body });
    if (path.endsWith("/revocar")) {
      credenciales[0] = { ...credenciales[0], estado: "REVOCADA", motivo_revocacion: body.motivo, revocado_en: "2026-10-27T22:00:00Z" };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: { id: uuid(600) } }) });
    }
    credenciales.unshift({ id: uuid(600), nombre: body.nombre, prefijo: "0a1b2c3d", datasets: body.datasets, expira_en: body.expira_en,
      created_at: "2026-10-27T21:00:00Z", creado_por_nombre: "Responsable Local", revocado_en: null, motivo_revocacion: null,
      ultimo_uso_en: null, estado: "ACTIVA" });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: {
      id: uuid(600), nombre: body.nombre, idempotent: false, token: `erpbi_0a1b2c3d_${"Z".repeat(43)}` } }) });
  });
  return { consultas, intents };
}

for (const mobile of [false, true])
  test(`Feature tablero: indicadores con su detalle, corte exportado y Power BI ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    await doble(page, { expediente: true });
    const api = await dobleTablero(page, { exportar: true, bi: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/tablero-suministro/", { timeout: 90000 });
    const indicadores = page.getByRole("region", { name: "Indicadores" });
    await expect(indicadores.getByRole("button", { name: /Entregas a tiempo y completas\s*50 %/ })).toBeVisible();
    await expect(indicadores.getByRole("button", { name: /Saldo por cobrar\s*PEN 472\.00/ })).toBeVisible();
    await expect(indicadores.getByRole("button", { name: /Lotes vencidos/ })).toHaveCount(0);
    await expect(page.getByText("Sin permiso para ver: Vencimientos, Penalidades.")).toBeVisible();

    // Cada ficha abre el detalle que la explica, y cada fila lleva a su documento.
    const detalle = page.getByRole("region", { name: "Detalle del indicador" });
    await indicadores.getByRole("button", { name: /Entregas atrasadas/ }).click();
    await expect(detalle.getByText("1 de 3 filas")).toBeVisible();
    await expect(detalle.getByRole("row", { name: /Atrasada/ })).toContainText("10 días");
    await expect(detalle.getByRole("link", { name: "Abrir expediente" })).toHaveAttribute("href", `/dashboard/ventas/contratos/?contrato=${contrato}`);
    await detalle.getByRole("button", { name: "Atrasadas · quitar filtro" }).click();
    await expect(detalle.getByText("3 de 3 filas")).toBeVisible();
    await indicadores.getByRole("button", { name: /Productos sin cobertura/ }).click();
    await expect(detalle.getByRole("link", { name: "Ver lotes" })).toHaveAttribute("href", `/dashboard/inventario/lotes/?producto=${uuid(30)}`);

    await page.getByLabel("Contrato").selectOption(contrato);
    await expect.poll(() => api.consultas.at(-1)?.get("contrato_id")).toBe(contrato);

    // Exportar registra un corte, descarga su Excel con los mismos filtros y deja el corte a la vista.
    const descarga = page.waitForEvent("download");
    await page.getByRole("button", { name: "Registrar corte y exportar" }).click();
    expect((await descarga).suggestedFilename()).toBe("tablero_suministro_2026-10-27_57000000.xlsx");
    await expect(page.getByRole("status").filter({ hasText: "Excel descargado del corte con hash cccccccccccc" })).toBeVisible();
    expect(api.intents[0]).toMatchObject({ path: "cortes", body: {} });
    expect(api.intents[0].key).toMatch(/^tablero:/);
    expect(api.intents[1].path).toBe(`/backend/api/reportes/suministro/cortes/${corte}/excel/?contrato_id=${contrato}`);
    await expect.poll(() => api.consultas.at(-1)?.get("corte_id")).toBe(corte);
    await expect(page.getByText(/Corte del 27\/10\/2026 · Exportación por Responsable Local/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Exportar este corte" })).toBeVisible();

    // Power BI: el token aparece una vez, con la consulta lista para pegar.
    const bi = page.getByRole("region", { name: "Power BI" });
    await bi.getByRole("button", { name: "Crear credencial" }).click();
    const form = page.getByRole("form", { name: "Nueva credencial de Power BI" });
    await form.getByLabel("Nombre (para quién o qué informe)").fill("Power BI gerencia");
    await form.getByLabel("Contratos y OC").uncheck();
    await form.getByLabel("Cobertura de stock").uncheck();
    await form.getByRole("button", { name: "Crear credencial" }).click();
    const emitido = page.getByRole("region", { name: "Token emitido" });
    await expect(emitido.getByText(`erpbi_0a1b2c3d_${"Z".repeat(43)}`, { exact: true })).toBeVisible();
    await expect(emitido.locator("pre")).toContainText('/api/bi/v1/suministro/entregas/?corte=ultimo", [Headers = [Authorization = "Bearer erpbi_0a1b2c3d_');
    expect(api.intents[2]).toMatchObject({ path: "/backend/api/integraciones/bi/credenciales", body: { nombre: "Power BI gerencia", datasets: ["entregas", "cobranza"] } });
    await expect(bi.getByText("Entregas, Cobranza")).toBeVisible();
    await emitido.getByRole("button", { name: "Ya lo guardé" }).click();
    await expect(emitido).toHaveCount(0);
    await bi.getByRole("button", { name: "Revocar" }).click();
    await page.getByRole("form", { name: "Revocar Power BI gerencia" }).getByLabel("Motivo").fill("Rotación trimestral");
    await page.getByRole("button", { name: "Revocar credencial" }).click();
    await expect(bi.getByText("Revocada: Rotación trimestral", { exact: false })).toBeVisible();
    expect(api.intents[3]).toMatchObject({ path: `/backend/api/integraciones/bi/credenciales/${uuid(600)}/revocar`, body: { motivo: "Rotación trimestral" } });
    await bi.getByText("Últimas lecturas (1)").click();
    await expect(bi.getByRole("row", { name: /Power BI gerencia.*Leído/ })).toBeVisible();
    await page.screenshot({ path: `../../artifacts/suministro-f07-tableros/browser/${mobile ? "movil" : "escritorio"}-tablero.png`, fullPage: true });

    // La fila lleva al expediente del contrato.
    await indicadores.getByRole("button", { name: /Entregas atrasadas/ }).click();
    await detalle.getByRole("link", { name: "Abrir expediente" }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/ventas/contratos/?\\?contrato=${contrato}`));
    await expect(page.getByRole("heading", { name: /SUP-001 · Suministro programado local/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

test("Feature tablero: sólo lectura no exporta ni gestiona Power BI", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await sesion(context, page);
  await doble(page, { expediente: true });
  const api = await dobleTablero(page, { exportar: false, bi: false });
  await page.goto("/dashboard/tablero-suministro/", { timeout: 90000 });
  await expect(page.getByRole("region", { name: "Indicadores" }).getByRole("button", { name: /Cumplimiento de OC\s*50 %/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /exportar/i })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Power BI" })).toHaveCount(0);
  expect(api.intents).toHaveLength(0);
});
