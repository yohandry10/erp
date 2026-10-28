import { expect, test, type Page } from "@playwright/test";
import { doble, sesion, user } from "./helpers/supply-feature";

const CONTRATOS = [
  "id_origen_contrato,numero,cliente_codigo,asunto,moneda,vigencia_desde,vigencia_hasta,id_origen_linea,producto_codigo,cantidad_original,cantidad_ejecutada,precio_unitario",
  "C-100,LP-12,CLI-45,Suministro anual,PEN,2026-01-01,2026-12-31,1,MED-001,1000,600,12.50",
].join("\n");
const CONTROL = { contratos: { registros: 1, lineas: 1, cantidad: 400, valor: 5000 } };
const conciliacion = (cuadra: boolean) => ({
  cuadra,
  entidades: [{ entidad: "contratos", origen: CONTROL.contratos, erp: { ...CONTROL.contratos, cantidad: cuadra ? 400 : 380 },
    diferencias: cuadra ? {} : { cantidad: -20 }, cuadra }],
});

async function dobleMigracion(page: Page, options: { validar: boolean }) {
  const llamadas: Array<{ path: string; body: any }> = [];
  await page.route(/\/api\/usuarios-sistema\/me\/permissions\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [["migration", "suministro", "import"], ["migration", "__global__", "templates"],
          ...(options.validar ? [["migration", "validar", "read"]] : [])]
          .map(([modulo, recurso, accion]) => ({ id: `${modulo}.${recurso}.${accion}`, tenant_id: user.tenant_id, modulo, recurso, accion })),
      }),
    }),
  );
  await page.route(/\/api\/migration\/.+/, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/backend/, "").replace(/\/$/, "");
    if (req.method() === "GET")
      return route.fulfill({ status: 200, contentType: "text/csv", body: CONTRATOS.split("\n")[0] + "\n" });
    const body = req.postDataJSON();
    llamadas.push({ path, body });
    if (path.endsWith("/fox/ensayo"))
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: {
        ensayo: true, errores: 1,
        registros: [{ entidad: "CONTRATO", id_origen: "C-100", fila: 2, ok: true, accion: "CREATED" },
          { entidad: "STOCK", id_origen: "stock:MED-2:x", fila: 3, ok: false, error: "MIGRATION_STOCK_LOT_REQUIRED" }],
        conciliacion: conciliacion(true),
        errores_archivo: [],
      } }) });
    if (path.endsWith("/fox/conciliacion"))
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: conciliacion(false) }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
      runId: body.dryRun ? null : "58000000-aaaa-4000-8000-000000000001",
      status: body.dryRun ? "dry_run" : "completed",
      result: { totalRows: 1, okRows: 1, errorRows: 0, skippedRows: 0, created: 1, updated: 0, errors: [] },
    }) });
  });
  return llamadas;
}

const archivo = (name: string, contenido: string, mimeType = "text/csv") => ({ name, mimeType, buffer: Buffer.from(contenido, "utf8") });

for (const mobile of [false, true])
  test(`Feature migración FOX: ensayo sin escritura, importación en orden y conciliación ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    await doble(page);
    const llamadas = await dobleMigracion(page, { validar: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/migracion-fox/", { timeout: 90000 });
    await expect(page.getByRole("heading", { name: "Migración desde FOX" })).toBeVisible();

    const ensayo = page.getByRole("region", { name: "Ensayo completo" });
    await ensayo.getByLabel("Contratos y líneas").setInputFiles(archivo("contratos_suministro.csv", CONTRATOS));
    await ensayo.getByLabel("Stock inicial con lotes").setInputFiles(archivo("stock_inicial.csv", "external_id_producto\nMED-2"));
    await expect(ensayo.getByRole("button", { name: "Ensayar migración" })).toBeDisabled();
    await ensayo.getByLabel("Fecha de corte del stock").fill("2026-10-31");
    await ensayo.getByLabel("Totales de control (control.json)").setInputFiles(archivo("control.json", JSON.stringify(CONTROL), "application/json"));
    await ensayo.getByRole("button", { name: "Ensayar migración" }).click();
    await expect(ensayo.getByRole("status").filter({ hasText: "1 errores en 2 registros." })).toBeVisible();
    await expect(ensayo.getByRole("status").filter({ hasText: "Conciliación: cuadra con el extracto." })).toBeVisible();
    await expect(ensayo.getByRole("row", { name: /STOCK.*MIGRATION_STOCK_LOT_REQUIRED/ })).toBeVisible();
    expect(llamadas[0].path).toBe("/api/migration/fox/ensayo");
    expect(Buffer.from(llamadas[0].body.contratos, "base64").toString("utf8")).toBe(CONTRATOS);
    expect(llamadas[0].body).toMatchObject({ fechaCorte: "2026-10-31", control: CONTROL });
    expect(llamadas[0].body.oc).toBeUndefined();

    const importar = page.getByRole("region", { name: "Importar" });
    await importar.getByLabel("Archivo CSV").setInputFiles(archivo("contratos_suministro.csv", CONTRATOS));
    await importar.getByRole("button", { name: "Ensayar este archivo" }).click();
    await expect(importar.getByRole("status").filter({ hasText: "Ensayo: 1 filas correctas" })).toBeVisible();
    await importar.getByRole("button", { name: "Importar" }).click();
    await expect(importar.getByRole("status").filter({ hasText: "Importación completa: 1 filas correctas" })).toContainText("Lote 58000000.");
    expect(llamadas.slice(1).map((l) => [l.path, l.body.dryRun, l.body.filename])).toEqual([
      ["/api/migration/contratos-suministro/import", true, "contratos_suministro.csv"],
      ["/api/migration/contratos-suministro/import", false, "contratos_suministro.csv"],
    ]);

    const conciliar = page.getByRole("region", { name: "Conciliación" });
    await conciliar.getByLabel("Totales de control (control.json)").setInputFiles(archivo("control.json", JSON.stringify(CONTROL), "application/json"));
    await conciliar.getByRole("button", { name: "Conciliar" }).click();
    await expect(conciliar.getByRole("status").filter({ hasText: "hay diferencias" })).toBeVisible();
    await expect(conciliar.getByRole("row", { name: /contratos cantidad 400 380 -20/ })).toBeVisible();
    expect(llamadas.at(-1)).toEqual({ path: "/api/migration/fox/conciliacion", body: { control: CONTROL } });
    await page.screenshot({ path: `../../artifacts/alkhofar-f08-fox/browser/${mobile ? "movil" : "escritorio"}-migracion-fox.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

test("Feature migración FOX: sin permiso de validar no se concilia", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await sesion(context, page);
  await doble(page);
  await dobleMigracion(page, { validar: false });
  await page.goto("/dashboard/migracion-fox/", { timeout: 90000 });
  await expect(page.getByRole("region", { name: "Ensayo completo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Conciliación" })).toHaveCount(0);
});
