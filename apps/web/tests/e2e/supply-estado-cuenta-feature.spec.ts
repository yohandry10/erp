import { expect, test, type Page } from "@playwright/test";
import { doble, sesion, user, uuid } from "./helpers/supply-feature";

/** Superpone al expediente F01 el estado de cuenta de F04. */
async function dobleEstadoCuenta(page: Page, options: { gestionar: boolean }) {
  const state = { base: "DESPACHO" as "DESPACHO" | "CONFORMIDAD" };
  const intents: Array<{ key: string; body: any }> = [];
  await page.route(/\/api\/usuarios-sistema\/me\/permissions\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: ["ver", ...(options.gestionar ? ["gestionar"] : [])].map((accion) => ({
          id: accion, tenant_id: user.tenant_id, modulo: "ventas", recurso: "contratos", accion,
        })),
      }),
    }),
  );
  await page.route(/\/api\/ventas\/contratos\/[^/]+\/ejecucion\/?(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, data: { programaciones: [], despachos: [], recepciones: [] } }) }),
  );
  await page.route(/\/api\/ventas\/contratos\/[^/]+\/estado-cuenta\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          moneda: "PEN",
          base_facturacion: state.base,
          version: 2,
          lineas: [{
            contrato_linea_id: uuid(6), codigo_producto: "SKU-1", descripcion: "Producto de suministro", unidad_medida: "NIU",
            contratado: 100, en_oc: 60, programado: 40, despachado: 40, aceptado: 38, facturado: 30,
            facturado_valor: 370.37, por_facturar: 8, por_facturar_valor: 98.77,
          }],
          ordenes: [{ orden_cliente_id: uuid(7), numero: "OC-001", estado: "ACTIVA", valor: 740.74, facturado_valor: 370.37, por_facturar_valor: 98.77 }],
          documentos: [
            { cxc_id: uuid(80), pedido_id: uuid(40), pedido_numero: "PV-2026-0040", documento: "F001-120", tipo_documento: "01",
              fecha_emision: "2026-10-27", fecha_vencimiento: "2026-11-26", moneda: "PEN", total: 437.04, notas_credito: 0,
              cobrado: 200, saldo: 237.04, estado: "PARCIAL", cuadra: true },
            { cxc_id: uuid(81), pedido_id: uuid(42), pedido_numero: "PV-2026-0042", documento: "F001-121", tipo_documento: "01",
              fecha_emision: "2026-10-27", fecha_vencimiento: null, moneda: "PEN", total: 100, notas_credito: 10,
              cobrado: 0, saldo: 95, estado: "PENDIENTE", cuadra: false },
          ],
          totales: [{ moneda: "PEN", facturado: 537.04, notas_credito: 10, neto: 527.04, cobrado: 200, saldo: 332.04 }],
        },
      }),
    }),
  );
  await page.route(/\/api\/ventas\/contratos\/[^/]+\/facturacion\/?$/, (route) => {
    const body = route.request().postDataJSON();
    intents.push({ key: route.request().headers()["idempotency-key"], body });
    state.base = body.base_facturacion;
    return route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, data: { id: uuid(5), contrato_id: uuid(5), accion: "CONFIGURAR_FACTURACION" } }) });
  });
  return { intents, state };
}

for (const mobile of [false, true])
  test(`Feature estado de cuenta: saldos por línea, cobranza y base de facturación ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    await doble(page, { expediente: true });
    const api = await dobleEstadoCuenta(page, { gestionar: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/ventas/contratos/", { timeout: 90000 });
    await page.getByRole("button", { name: /SUP-001.*Activo/ }).click();
    const region = page.getByRole("region", { name: "Estado de cuenta del contrato" });
    await expect(region.getByText("por despacho: un pedido se factura al completar su despacho")).toBeVisible();
    await expect(region.getByRole("cell", { name: /^8\s*PEN 98\.77$/ })).toBeVisible();
    await expect(region.getByText("No cuadra con total, notas y cobros")).toHaveCount(1);
    await expect(region.getByRole("row", { name: /Total PEN/ })).toContainText("PEN 332.04");

    await region.getByRole("button", { name: "Cambiar base de facturación" }).click();
    const form = page.getByRole("form", { name: "Base de facturación" });
    await expect(form.getByRole("button", { name: "Guardar base de facturación" })).toBeDisabled();
    await form.getByLabel("Facturar").selectOption("CONFORMIDAD");
    await form.getByLabel("Motivo del cambio").fill("El cliente paga contra acta de conformidad");
    await form.getByRole("button", { name: "Guardar base de facturación" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Base de facturación actualizada" })).toBeVisible();
    expect(api.intents).toHaveLength(1);
    expect(api.intents[0].body).toEqual({ base_facturacion: "CONFORMIDAD", version: 2, motivo: "El cliente paga contra acta de conformidad" });
    await expect(region.getByText("contra conformidad del cliente", { exact: false })).toBeVisible();
    await region.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../../artifacts/alkhofar-f04-facturacion/browser/${mobile ? "movil" : "escritorio"}-estado-cuenta.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

test("Feature estado de cuenta: sin gestión no se cambia la base", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await sesion(context, page);
  await doble(page, { expediente: true });
  const api = await dobleEstadoCuenta(page, { gestionar: false });
  await page.goto("/dashboard/ventas/contratos/", { timeout: 90000 });
  await page.getByRole("button", { name: /SUP-001.*Activo/ }).click();
  const region = page.getByRole("region", { name: "Estado de cuenta del contrato" });
  await expect(region.getByText("F001-120")).toBeVisible();
  await expect(region.getByRole("button", { name: "Cambiar base de facturación" })).toHaveCount(0);
  expect(api.intents).toHaveLength(0);
});
