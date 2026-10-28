import { expect, test, type Page } from "@playwright/test";
import { doble, sesion, user } from "./helpers/supply-feature";

const CONTRATOS = [
  "id_origen_contrato,numero,cliente_codigo,asunto,moneda,vigencia_desde,vigencia_hasta,id_origen_linea,producto_codigo,cantidad_original,cantidad_ejecutada,precio_unitario",
  "C-100,LP-12,CLI-45,Suministro anual,PEN,2026-01-01,2026-12-31,1,MED-001,1000,600,12.50",
].join("\n");
const PRODUCTOS = "id_origen_producto,codigo,nombre\nP-1,MED-001,Amoxicilina 500 mg";
const CONTROL = { contratos: { registros: 1, lineas: 1, cantidad: 400, valor: 5000 } };
const conciliacion = (cuadra: boolean) => ({
  cuadra,
  entidades: [{ entidad: "contratos", origen: CONTROL.contratos, erp: { ...CONTROL.contratos, cantidad: cuadra ? 400 : 380 },
    diferencias: cuadra ? {} : { cantidad: -20 }, cuadra }],
  cruces: { bancos_vs_apertura: { bancos: 18750, apertura: cuadra ? 18750 : 18000, cuadra, cuentas: [
    { cuenta_contable: "104101", cuentas_bancarias: 1, bancos: 15000, apertura: 15000, cuadra: true },
    { cuenta_contable: "104102", cuentas_bancarias: 1, bancos: 3750, apertura: cuadra ? 3750 : 3000, cuadra },
  ] } },
});
const LOTE = { id: "58200000-aaaa-4000-8000-000000000001", descripcion: "Extracto FOX al 31-10", fecha_corte: "2026-10-31", estado: "COMPLETO",
  tablas: { KARDEX: 26, CLIENTES: 2 }, cerrado_en: "2026-10-31T23:00:00Z", motivo_descarte: null };
const fila = (id: number, tabla: string, clave: string, datos: Record<string, unknown>) => ({ id, tabla, clave, fila: datos, huella: "x" });

async function dobleMigracion(page: Page, permisos: string[][]) {
  const llamadas: Array<{ path: string; body: any; query?: Record<string, string> }> = [];
  await page.route(/\/api\/usuarios-sistema\/me\/permissions\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [["migration", "__global__", "templates"], ...permisos]
          .map(([modulo, recurso, accion]) => ({ id: `${modulo}.${recurso}.${accion}`, tenant_id: user.tenant_id, modulo, recurso, accion })),
      }),
    }),
  );
  await page.route(/\/api\/migration\/.+/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/backend/, "").replace(/\/$/, "");
    if (req.method() === "GET" && path.endsWith("/fox/archivo")) {
      const query = Object.fromEntries(url.searchParams);
      llamadas.push({ path, body: null, query });
      const todas = query.texto
        ? [fila(9, "KARDEX", "9", { FECHA: "2019-03-02", CODART: "MED-001", GLOSA: "Salida a hospital", _borrado: true })]
        : Array.from({ length: 28 }, (_, i) => i < 2
          ? fila(i + 1, "CLIENTES", String(i + 1), { CODCLI: `CLI-${i}`, RAZON: "Hospital Regional", CLAVE: "[REDACTADO]" })
          : fila(i + 1, "KARDEX", String(i - 1), { FECHA: "2019-03-01", CODART: "MED-001", CANT: i, GLOSA: "Ingreso" }));
      const pagina = Number(query.pagina ?? 1), limite = Number(query.limite ?? 25);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
        lotes: [LOTE], lote_id: LOTE.id, tablas: [{ tabla: "CLIENTES", filas: 2 }, { tabla: "KARDEX", filas: 26 }],
        total: todas.length, pagina, limite, filas: todas.slice((pagina - 1) * limite, pagina * limite),
      } }) });
    }
    if (req.method() === "GET")
      return route.fulfill({ status: 200, contentType: "text/csv", body: CONTRATOS.split("\n")[0] + "\n" });
    const body = req.postDataJSON();
    llamadas.push({ path, body });
    if (path.endsWith("/fox/ensayo"))
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: {
        ensayo: true, errores: 1,
        registros: [{ entidad: "CONTRATO", id_origen: "C-100", fila: 2, ok: true, accion: "CREATED" },
          { entidad: "PRODUCTO", id_origen: "P-1", fila: 2, ok: true, accion: "ADOPTED" },
          { entidad: "STOCK", id_origen: "stock:MED-2:x", fila: 3, ok: false, error: "El producto controla lotes: indique lote y vencimiento" }],
        conciliacion: conciliacion(true),
        errores_archivo: [],
      } }) });
    if (path.endsWith("/fox/conciliacion"))
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: conciliacion(false) }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
      runId: body.dryRun ? null : "58000000-aaaa-4000-8000-000000000001",
      status: body.dryRun ? "dry_run" : "completed",
      result: { totalRows: 1, okRows: 1, errorRows: 0, skippedRows: 0, created: path.includes("/fox/") ? 0 : 1,
        updated: path.includes("/fox/") ? 1 : 0, errors: [] },
    }) });
  });
  return llamadas;
}

const TODO = [["migration", "fox", "import"], ["migration", "validar", "read"], ["migration", "archivo", "read"]];
const archivo = (name: string, contenido: string, mimeType = "text/csv") => ({ name, mimeType, buffer: Buffer.from(contenido, "utf8") });

for (const mobile of [false, true])
  test(`Feature migración FOX: ensayo integral, importación en orden, conciliación y archivo íntegro ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    await doble(page);
    const llamadas = await dobleMigracion(page, TODO);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/migracion-fox/", { timeout: 90000 });
    await expect(page.getByRole("heading", { name: "Migración desde FOX" })).toBeVisible();

    const ensayo = page.getByRole("region", { name: "Ensayo completo" });
    await ensayo.getByLabel("Productos").setInputFiles(archivo("productos.csv", PRODUCTOS));
    await ensayo.getByLabel("Contratos y líneas").setInputFiles(archivo("contratos_suministro.csv", CONTRATOS));
    await ensayo.getByLabel("Stock inicial con lotes").setInputFiles(archivo("stock_inicial.csv", "external_id_producto\nMED-2"));
    // Con stock la fecha de corte es obligatoria.
    await expect(ensayo.getByRole("button", { name: "Ensayar migración" })).toBeDisabled();
    await ensayo.getByLabel("Fecha de corte").fill("2026-10-31");
    await ensayo.getByLabel("Totales de control (control.json)").setInputFiles(archivo("control.json", JSON.stringify(CONTROL), "application/json"));
    await ensayo.getByRole("button", { name: "Ensayar migración" }).click();
    await expect(ensayo.getByRole("status").filter({ hasText: "1 errores en 3 registros." })).toBeVisible();
    await expect(ensayo.getByRole("status").filter({ hasText: "Conciliación: cuadra con el extracto." })).toBeVisible();
    await expect(ensayo.getByRole("status").filter({ hasText: "cuadran en moneda local" })).toBeVisible();
    await expect(ensayo.getByRole("row", { name: /STOCK.*indique lote y vencimiento/ })).toBeVisible();
    const ensayado = llamadas.filter((l) => l.path === "/api/migration/fox/ensayo");
    expect(ensayado).toHaveLength(1);
    expect(Buffer.from(ensayado[0].body.contratos, "base64").toString("utf8")).toBe(CONTRATOS);
    expect(Buffer.from(ensayado[0].body.productos, "base64").toString("utf8")).toBe(PRODUCTOS);
    expect(ensayado[0].body).toMatchObject({ fechaCorte: "2026-10-31", control: CONTROL });
    expect(ensayado[0].body.oc).toBeUndefined();

    const importar = page.getByRole("region", { name: "Importar" });
    await importar.getByLabel("Tipo").selectOption("contratos");
    await importar.getByLabel("Archivo CSV").setInputFiles(archivo("contratos_suministro.csv", CONTRATOS));
    await importar.getByRole("button", { name: "Ensayar este archivo" }).click();
    await expect(importar.getByRole("status").filter({ hasText: "Ensayo: 1 filas correctas" })).toBeVisible();
    await importar.getByRole("button", { name: "Importar" }).click();
    await expect(importar.getByRole("status").filter({ hasText: "Importación completa: 1 filas correctas" })).toContainText("Lote 58000000.");
    await importar.getByLabel("Tipo").selectOption("productos");
    await importar.getByLabel("Archivo CSV").setInputFiles(archivo("productos.csv", PRODUCTOS));
    await importar.getByRole("button", { name: "Importar" }).click();
    await expect(importar.getByRole("status").filter({ hasText: "1 enlazadas a registros existentes" })).toBeVisible();
    // Un archivo de saldos exige su fecha de corte antes de enviar.
    await importar.getByLabel("Tipo").selectOption("cxc");
    await expect(importar.getByRole("button", { name: "Importar" })).toBeDisabled();
    expect(llamadas.filter((l) => l.path.endsWith("/import")).map((l) => [l.path, l.body.dryRun, l.body.filename])).toEqual([
      ["/api/migration/contratos-suministro/import", true, "contratos_suministro.csv"],
      ["/api/migration/contratos-suministro/import", false, "contratos_suministro.csv"],
      ["/api/migration/fox/productos/import", false, "productos.csv"],
    ]);

    const conciliar = page.getByRole("region", { name: "Conciliación" });
    await conciliar.getByLabel("Totales de control (control.json)").setInputFiles(archivo("control.json", JSON.stringify(CONTROL), "application/json"));
    await conciliar.getByRole("button", { name: "Conciliar" }).click();
    await expect(conciliar.getByRole("status").filter({ hasText: "hay diferencias" })).toBeVisible();
    await expect(conciliar.getByRole("row", { name: /contratos cantidad 400 380 -20/ })).toBeVisible();
    await expect(conciliar.getByRole("status").filter({ hasText: "no cuadran; revise el saldo o el tipo de cambio" })).toBeVisible();
    await expect(conciliar.getByRole("row", { name: /104102 1 3750 3000/ })).toBeVisible();
    expect(llamadas.filter((l) => l.path.endsWith("/fox/conciliacion")).at(-1)?.body).toEqual({ control: CONTROL });

    const archivoIntegro = page.getByRole("region", { name: "Archivo íntegro" });
    await expect(archivoIntegro.getByRole("status").filter({ hasText: "28 filas · página 1 de 2" })).toBeVisible();
    const filas = archivoIntegro.getByRole("list", { name: "Filas del archivo" }).getByRole("listitem");
    await expect(filas).toHaveCount(25);
    await expect(filas.first()).toContainText("[REDACTADO]");
    await archivoIntegro.getByRole("button", { name: "Siguiente" }).click();
    await expect(archivoIntegro.getByRole("status").filter({ hasText: "página 2 de 2" })).toBeVisible();
    await expect(filas).toHaveCount(3);
    await archivoIntegro.getByLabel("Buscar texto").fill('"salida a hospital"');
    await archivoIntegro.getByRole("button", { name: "Buscar" }).click();
    await expect(archivoIntegro.getByRole("status").filter({ hasText: "1 filas · página 1 de 1" })).toBeVisible();
    await expect(filas.first()).toContainText("Borrado en FOX");
    const consultas = llamadas.filter((l) => l.path.endsWith("/fox/archivo")).map((l) => l.query);
    expect(consultas.at(-1)).toMatchObject({ texto: '"salida a hospital"', pagina: "1", limite: "25" });
    expect(consultas.some((q) => q?.pagina === "2")).toBe(true);
    await page.screenshot({ path: `../../artifacts/alkhofar-fox-integral/browser/${mobile ? "movil" : "escritorio"}-migracion-fox.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

test("Feature migración FOX: sin permiso de validar no se concilia", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await sesion(context, page);
  await doble(page);
  await dobleMigracion(page, [["migration", "fox", "import"]]);
  await page.goto("/dashboard/migracion-fox/", { timeout: 90000 });
  await expect(page.getByRole("region", { name: "Ensayo completo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Conciliación" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Archivo íntegro" })).toHaveCount(0);
});

test("Feature migración FOX: auditoría sólo consulta el archivo íntegro", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await sesion(context, page);
  await doble(page);
  await dobleMigracion(page, [["migration", "archivo", "read"]]);
  await page.goto("/dashboard/migracion-fox/", { timeout: 90000 });
  await expect(page.getByRole("region", { name: "Archivo íntegro" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ensayo completo" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Importar" })).toHaveCount(0);
});
