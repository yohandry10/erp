import { expect, test, type Page } from "@playwright/test";
import { fiscalCountryFixture } from "./fixtures/fiscal-country";
import { sesion, user, uuid } from "./helpers/supply-feature";

const ALERTA = uuid(90);
const OTRO = uuid(91);

async function dobleAlertas(page: Page, options: { administra: boolean }) {
  const state = { reconocida: false, reglas: [] as any[] };
  const intents: Array<{ path: string; key?: string; body: any }> = [];
  let perderGuardado = true;
  const alerta = () => ({
    id: ALERTA, tipo: "ENTREGA_ATRASADA", titulo: "Entrega atrasada desde 10/11/2026 · contrato SUP-001", severidad: "CRITICA",
    estado: "ABIERTA", motivo_resolucion: null, fecha_objetivo: "2026-11-10", contrato_id: uuid(5),
    detalle: { producto: "SKU-1 Producto de suministro", pendiente: 12 }, created_at: "2026-11-12T13:00:00Z", escalada_at: null,
    reconocida_por_mi: state.reconocida, soy_destinatario: true,
    destinatarios: [
      { usuario_id: user.id, nombre: "Responsable Local", nivel: "INICIAL", reconocido_at: state.reconocida ? "2026-11-12T14:00:00Z" : null, correo: false },
      { usuario_id: OTRO, nombre: "Jefa de Almacén", nivel: "INICIAL", reconocido_at: null, correo: false },
    ],
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return route.abort("blockedbyclient");
    if (!url.pathname.includes("/api/")) return route.continue();
    const path = url.pathname.replace(/^.*\/api\//, "/").replace(/\/$/, "");
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    const common: Record<string, unknown> = {
      "/auth/profile": user,
      "/tenants/me": { data: { id: user.tenant_id, nombre: "Empresa local", pais: "PE", moneda: "PEN", estado: "ACTIVO" } },
      "/demo/status": { is_demo: false, is_expired: false },
      "/notifications/unread": { data: [], count: 0 },
      "/usuarios-sistema/me/permissions": {
        data: (options.administra ? ["ver", "gestionar"] : []).map((accion) => ({
          id: accion, tenant_id: user.tenant_id, modulo: "alertas", recurso: "suministro", accion,
        })),
      },
      "/configuration/context/country": fiscalCountryFixture(user.tenant_id, { pais_id: 1, pais: "PE", monedaDefecto: "PEN" }),
      "/configuration/empresa": { success: true, data: { pais: "PE", paisCodigo: "PE", razonSocial: "Empresa local", monedaDefecto: "PEN" } },
      "/configuration/status": { success: true, data: { isComplete: true, isDemo: false, completionPercentage: 100 } },
    };
    if (path in common) return json(common[path]);
    const method = route.request().method();
    if (method !== "GET") intents.push({ path, key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
    if (path === "/alertas/mias" || path === "/alertas") return json({ success: true, data: { items: [alerta()] } });
    if (path === "/alertas/reglas")
      return json({ success: true, data: { items: state.reglas, usuarios: [
        { id: user.id, nombre: "Responsable Local", email: "responsable@erp.local" },
        { id: OTRO, nombre: "Jefa de Almacén", email: "almacen@erp.local" },
      ] } });
    if (path === `/alertas/${ALERTA}/reconocer`) {
      state.reconocida = true;
      return json({ success: true, data: { id: ALERTA, reconocida: true } }, 201);
    }
    if (path.startsWith("/alertas/reglas/")) {
      const tipo = path.split("/").pop();
      const body = route.request().postDataJSON();
      const previa = state.reglas.find((r) => r.tipo === tipo);
      if (!previa) state.reglas.push({ id: uuid(95), tipo, ...body, version: 1 });
      if (perderGuardado) {
        perderGuardado = false;
        return route.abort("connectionreset");
      }
      return json({ success: true, data: { id: uuid(95), tipo, version: 1, idempotent: Boolean(previa) } });
    }
    if (path === "/alertas/evaluar") return json({ success: true, data: { creadas: 0, resueltas: 1, escaladas: 0 } }, 201);
    return json({ success: true, data: [] });
  });
  return { intents };
}

for (const mobile of [false, true])
  test(`Alertas: reconocimiento por usuario y reglas con escalamiento ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    const api = await dobleAlertas(page, { administra: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/alertas/", { timeout: 90000 });
    const mias = page.getByRole("region", { name: "Mis alertas" });
    await expect(mias.getByText("Entrega atrasada desde 10/11/2026 · contrato SUP-001")).toBeVisible();
    await expect(mias.getByText(/Responsable Local: pendiente · Jefa de Almacén: pendiente/)).toBeVisible();
    await mias.getByRole("button", { name: "Reconocer" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Alerta reconocida" })).toBeVisible();
    await expect(mias.getByText(/Responsable Local: reconocida · Jefa de Almacén: pendiente/)).toBeVisible();
    await expect(mias.getByRole("button", { name: "Reconocer" })).toHaveCount(0);

    await page.getByRole("tab", { name: "Reglas" }).click();
    const reglas = page.getByRole("region", { name: "Reglas de alerta" });
    await reglas.getByRole("listitem").filter({ hasText: "Entrega atrasada sin aceptación completa" }).getByRole("button", { name: "Configurar" }).click();
    const form = page.getByRole("form", { name: "Regla Entrega atrasada sin aceptación completa" });
    await form.getByRole("group", { name: "Destinatarios" }).getByLabel("Jefa de Almacén").check();
    await form.getByLabel("Escalar si nadie la reconoce en (días)").fill("2");
    await form.getByRole("button", { name: "Guardar regla" }).click();
    await expect(form.getByRole("alert")).toHaveText("Para escalar indique los días y a quién escalar; sin escalamiento deje ambos vacíos.");
    await form.getByRole("group", { name: "Escalar a" }).getByLabel("Responsable Local").check();
    await form.getByRole("button", { name: "Guardar regla" }).click();
    await expect(page.getByRole("button", { name: "Reintentar guardado" })).toBeVisible();
    await page.getByRole("button", { name: "Reintentar guardado" }).click();
    await expect(page.getByRole("status").filter({ hasText: "guardada" })).toBeVisible();
    const guardados = api.intents.filter((i) => i.path === "/alertas/reglas/ENTREGA_ATRASADA");
    expect(guardados).toHaveLength(2);
    expect(guardados[0].key).toBe(guardados[1].key);
    expect(guardados[0].body).toEqual({
      activa: true, dias_anticipacion: 0, dias_escalamiento: 2, destinatarios: [OTRO], escalar_a: [user.id],
      incluir_responsable: true, enviar_correo: false, version: 0,
    });
    await expect(reglas.getByText(/Activa · 1 destinatarios \+ responsable del contrato · escala a los 2 días · sin correo/)).toBeVisible();
    await page.screenshot({ path: `../../artifacts/suministro-f05-alertas/browser/${mobile ? "movil" : "escritorio"}-reglas.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

test("Alertas: sin permiso sólo se ven las propias", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await sesion(context, page);
  await dobleAlertas(page, { administra: false });
  await page.goto("/dashboard/alertas/", { timeout: 90000 });
  await expect(page.getByRole("region", { name: "Mis alertas" }).getByText("Entrega atrasada desde 10/11/2026 · contrato SUP-001")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Reglas" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Evaluar ahora" })).toHaveCount(0);
});
