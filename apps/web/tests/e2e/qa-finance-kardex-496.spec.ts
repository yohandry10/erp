import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

const user = {
  id: "49600000-0000-4000-8000-000000000090",
  email: "qa-finance-kardex-496@erp.local",
  nombre: "QA",
  apellido: "Finanzas",
  roles: ["ADMIN"],
  tenant_id: "49600000-0000-4000-8000-000000000091",
  is_super_admin: true,
};

function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  for (const envPath of [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../erp-api/.env"),
  ]) {
    if (!fs.existsSync(envPath)) continue;
    const contents = fs.readFileSync(envPath, "utf8");
    const line = contents
      .split(/\r?\n/)
      .find((entry) => /^\s*JWT_SECRET=/.test(entry));
    if (line)
      return line
        .replace(/^\s*JWT_SECRET=/, "")
        .trim()
        .replace(/^['"]|['"]$/g, "");
  }
  throw new Error("JWT_SECRET no está disponible para el E2E aislado 496");
}

async function installSession(context: BrowserContext, page: Page) {
  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(jwtSecret()));

  await context.addCookies([
    {
      name: "access_token",
      value: token,
      url: process.env.BASE_URL || "http://localhost:3001",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser });
    window.localStorage.setItem("erp.auth.session.snapshot", session);
    window.sessionStorage.setItem("erp.auth.session.snapshot", session);
    window.localStorage.setItem(
      "erp_onboarding_completed",
      JSON.stringify(["admin"]),
    );
    window.localStorage.setItem("selectedCountry", "1");
  }, user);
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function fulfillCommonApi(route: Route) {
  const pathname = new URL(route.request().url()).pathname;
  if (/\/api\/auth\/profile\/?$/.test(pathname)) {
    await fulfillJson(route, user);
    return true;
  }
  if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
    await fulfillJson(route, {
      data: {
        pais_id: 1,
        pais: "PE",
        paisCodigo: "PE",
        moneda: "PEN",
        monedaDefecto: "PEN",
        locale: "es-PE",
        timezone: "America/Lima",
      },
    });
    return true;
  }
  if (/\/api\/demo\/status\/?$/.test(pathname)) {
    await fulfillJson(route, { is_demo: false, is_expired: false });
    return true;
  }
  if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
    await fulfillJson(route, {
      data: [
        "inventario.kardex.read",
        "rrhh.liquidaciones.read",
        "rrhh.liquidaciones.pay",
        "rrhh.cts.read",
      ],
    });
    return true;
  }
  return false;
}

test.describe("QA visual financiera y Kardex 496", () => {
  test.use({ timezoneId: "Asia/Tokyo" });

  test("Kardex no mezcla unidades, usa fecha tenant y no presenta subtotales incompletos como saldo", async ({
    context,
    page,
  }, testInfo) => {
    await installSession(context, page);
    await page.route("**/api/**", async (route) => {
      if (await fulfillCommonApi(route)) return;
      const pathname = new URL(route.request().url()).pathname;
      if (/\/api\/inventario\/almacenes\/?$/.test(pathname)) {
        return fulfillJson(route, {
          success: true,
          data: [{ id: "almacen-496", nombre: "Principal" }],
        });
      }
      if (/\/api\/inventario\/productos\/?$/.test(pathname)) {
        return fulfillJson(route, {
          success: true,
          data: [
            { id: "producto-niu-496", nombre: "Pieza", codigo: "P-1" },
            { id: "producto-kgm-496", nombre: "Insumo", codigo: "K-1" },
          ],
        });
      }
      if (/\/api\/inventario\/kardex\/?$/.test(pathname)) {
        return fulfillJson(route, {
          success: true,
          data: [
            {
              id: "movimiento-niu-496",
              tipo: "ENTRADA",
              sentido: "ENTRADA",
              fecha: "2026-08-13T02:30:00.000Z",
              fechaLocal: "2026-08-12",
              documento: "ING-496-1",
              cantidad: 7,
              cantidadFirmada: 7,
              costoUnitario: 10,
              valorTotal: 70,
              valorFirmado: 70,
              moneda: "PEN",
              monedaBase: "PEN",
              tipoCambio: 1,
              valorTotalBase: 70,
              valorFirmadoBase: 70,
              saldoCantidadPosterior: 7,
              saldoValorizadoBasePosterior: 70,
              saldoMonedaBase: "PEN",
              valuacionEstado: "VALORIZADO",
              producto: {
                id: "producto-niu-496",
                nombre: "Pieza",
                codigo: "P-1",
                unidadMedida: "NIU",
              },
              almacen: { id: "almacen-496", nombre: "Principal" },
            },
            {
              id: "movimiento-kgm-496",
              tipo: "ENTRADA",
              sentido: "ENTRADA",
              fecha: "2026-08-13T03:00:00.000Z",
              fechaLocal: "2026-08-12",
              documento: "ING-496-2",
              cantidad: 3,
              cantidadFirmada: 3,
              costoUnitario: null,
              valorTotal: null,
              valorFirmado: null,
              moneda: "PEN",
              monedaBase: "PEN",
              tipoCambio: 1,
              valorTotalBase: null,
              valorFirmadoBase: null,
              saldoCantidadPosterior: 3,
              saldoValorizadoBasePosterior: null,
              saldoMonedaBase: "PEN",
              valuacionEstado: "PENDIENTE_COSTO",
              producto: {
                id: "producto-kgm-496",
                nombre: "Insumo",
                codigo: "K-1",
                unidadMedida: "KGM",
              },
              almacen: { id: "almacen-496", nombre: "Principal" },
            },
          ],
          resumen: {
            totalMovimientos: 2,
            totalEntradas: null,
            totalSalidas: null,
            totalAjustes: null,
            totalDevoluciones: null,
            valorEntradasBase: null,
            valorSalidasBase: null,
            saldoCantidad: null,
            saldoValorizadoBase: null,
            saldoInicialCantidad: null,
            movimientoNetoCantidad: null,
            saldoInicialValorizadoBase: null,
            movimientoNetoValorizadoBase: null,
            monedaBase: "PEN",
            pendientesValorizacion: 1,
            pendientesSentido: 0,
            pendientesSaldoValorizacion: 1,
            pendientesSaldoSentido: 0,
            multiplesMonedasBase: false,
            cantidadAgregable: false,
            productosEnSaldo: 2,
            unidadesEnSaldo: 2,
            movimientosSinUnidad: 0,
            resumenConfiable: false,
            valorPorMoneda: { PEN: 70 },
            valorBasePorMoneda: { PEN: 70 },
          },
        });
      }
      return fulfillJson(route, { success: true, data: [] });
    });

    await page.goto("/dashboard/inventario/kardex/", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Kardex valorizado" }),
    ).toBeVisible();
    await expect(page.getByText("Valoración incompleta.")).toBeVisible();
    await expect(page.getByText("Saldo físico por producto")).toBeVisible();
    await expect(
      page.getByText(
        /2 productos \/ 2 unidad\(es\): no se suman cantidades heterogéneas/i,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /^\+7[.,]00 NIU$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /^\+3[.,]00 KGM$/ }),
    ).toBeVisible();
    await expect(page.getByText("12/08/2026")).toHaveCount(2);
    await expect(
      page.getByText("Saldo valorizado por moneda origen:"),
    ).toHaveCount(0);

    await page.screenshot({
      path: testInfo.outputPath("kardex-496-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("kardex-496-mobile.png"),
      fullPage: true,
    });
  });

  test("Liquidaciones ofrece sólo transferencia y exige evidencia bancaria", async ({
    context,
    page,
  }, testInfo) => {
    await installSession(context, page);
    await page.route("**/api/**", async (route) => {
      if (await fulfillCommonApi(route)) return;
      const pathname = new URL(route.request().url()).pathname;
      if (/\/api\/rrhh\/empleados\/?$/.test(pathname))
        return fulfillJson(route, { data: [] });
      if (/\/api\/rrhh\/liquidaciones\/?$/.test(pathname)) {
        return fulfillJson(route, {
          data: [
            {
              id: "49600000-0000-4000-8000-000000000001",
              id_empleado: "49600000-0000-4000-8000-000000000002",
              fecha_terminacion: "2026-08-12",
              pais_codigo: "PE",
              moneda: "PEN",
              total_liquidacion: 1250,
              estado: "APROBADA",
              empleados: { nombres: "Ana", apellidos: "Control" },
            },
          ],
        });
      }
      if (/\/api\/rrhh\/cts\/depositos\/?$/.test(pathname))
        return fulfillJson(route, { data: [] });
      if (/\/api\/finanzas\/bancos\/cuentas\/?$/.test(pathname)) {
        return fulfillJson(route, {
          data: [
            {
              id: "49600000-0000-4000-8000-000000000003",
              banco: "Banco QA",
              moneda: "PEN",
              activa: true,
              estado: "ACTIVO",
            },
          ],
        });
      }
      return fulfillJson(route, { data: [] });
    });

    await page.goto("/dashboard/rrhh/liquidaciones/", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Liquidaciones y CTS" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Preparar pago" }).click();
    const method = page.locator('input[value="Transferencia bancaria"]');
    await expect(method).toBeVisible();
    await expect(method).toBeDisabled();
    await expect(
      page.getByText(/pago en efectivo permanece deshabilitado/i),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /efectivo/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Registrar pago" }),
    ).toBeDisabled();

    await page.screenshot({
      path: testInfo.outputPath("liquidacion-transferencia-496-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("liquidacion-transferencia-496-mobile.png"),
      fullPage: true,
    });
  });

  test("editar precio de producto legacy conserva su unidad sin regularizar", async ({
    context,
    page,
  }) => {
    await installSession(context, page);
    let updatePayload: Record<string, unknown> | null = null;
    const productId = "49600000-0000-4000-8000-000000000010";

    await page.route("**/api/**", async (route) => {
      if (await fulfillCommonApi(route)) return;
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (/\/api\/inventario\/categorias\/?$/.test(pathname)) {
        return fulfillJson(route, {
          success: true,
          data: [
            { id: "49600000-0000-4000-8000-000000000011", nombre: "Legacy" },
          ],
        });
      }
      const normalizedPath = pathname.replace(/\/$/, "");
      const isProductPath = normalizedPath.endsWith(
        `/inventario/productos/${productId}`,
      );
      if (isProductPath && request.method() === "GET") {
        return fulfillJson(route, {
          success: true,
          data: {
            id: productId,
            codigo: "LEG-496",
            nombre: "Producto histórico",
            marca: null,
            unidad_medida: null,
            categoria: "Legacy",
            precio_venta: 100,
            precio_compra: 80,
            stock_minimo: 1,
            impuesto: 18,
            afectacion_igv: "10",
            imagen_url: null,
          },
        });
      }
      if (isProductPath && request.method() === "PUT") {
        updatePayload = request.postDataJSON();
        return fulfillJson(route, { success: true, data: { id: productId } });
      }
      if (/\/api\/inventario\/productos\/?$/.test(pathname)) {
        return fulfillJson(route, { success: true, data: [] });
      }
      return fulfillJson(route, { success: true, data: [] });
    });

    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(`/dashboard/inventario/productos/${productId}/editar/`, {
      waitUntil: "domcontentloaded",
    });

    const unitSelect = page.getByLabel("Unidad de medida");
    await expect(unitSelect).toHaveValue("");
    await expect(
      page.getByText(/Sin regularizar no se presume NIU/i),
    ).toBeVisible();
    await page.getByLabel(/Precio de Venta/).fill("120");
    await page.getByRole("button", { name: "Guardar Cambios" }).click();

    await expect.poll(() => updatePayload).not.toBeNull();
    expect(updatePayload).not.toHaveProperty("unidad_medida");
    expect(updatePayload).toMatchObject({ precio_venta: 120 });
  });
});
