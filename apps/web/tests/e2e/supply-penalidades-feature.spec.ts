import { expect, test, type Page } from "@playwright/test";
import { doble, sesion, user, uuid } from "./helpers/supply-feature";

const otro = uuid(77);
const grupo = uuid(60);

/** Superpone al expediente F01 las penalidades de F06 con estado propio. */
async function doblePenalidades(page: Page, options: { gestionar: boolean; aprobar: boolean }) {
  const reglaV1 = {
    id: uuid(61), grupo_id: grupo, version: 1, estado: "VIGENTE", nombre: "Mora por entrega tardía", causal: "ENTREGA_TARDIA",
    metodo: "MORA_OSCE", base_calculo: "VALOR_ENTREGA", tasa: null, importe: null, factor_f: 0.4, plazo_modo: "OC_A_ENTREGA",
    plazo_dias: null, tolerancia_dias: 2, calendario: "CALENDARIO", tope_porcentaje: 10, tope_base: "CONTRATO",
    motivo: "Cláusula décima del contrato", created_at: "2026-10-01T15:00:00Z",
  };
  const calculo = (id: number, corte: string, dias: number, monto: number, estado: string, created_by: string, version: number) => ({
    id: uuid(id), regla_id: reglaV1.id, entrega_id: uuid(9), fecha_corte: corte, moneda: "PEN", dias_atraso: dias,
    monto_calculado: monto, monto_tope: 1000, monto_estimado: monto, monto_aprobado: null, estado, version, created_by,
    created_at: `${corte}T16:00:00Z`, regla_nombre: reglaV1.nombre, regla_version: 1, fecha_programada: "2026-11-10",
    actor_nombre: created_by === user.id ? "Responsable Local" : "Analista Comercial",
    explicacion: `Entrega programada 10/11/2026 de 40 NIU a PEN 10 (base PEN 400.00). Atraso ${dias} días (excluidos 0). ` +
      `Penalidad diaria = 0.10 × 400.00 / (0.4000 × 30 días) = 3.3333; × ${dias} días = ${monto}.`,
    revisiones: estado === "EN_REVISION"
      ? [{ id: uuid(90), accion: "REVISAR", estado_nuevo: "EN_REVISION", monto_aprobado: null, comentario: "Se revisa con actas",
          actor_nombre: "Analista Comercial", created_at: "2026-10-26T17:00:00Z" }]
      : [],
  });
  const state = {
    reglas: [reglaV1] as any[],
    excepciones: [] as any[],
    calculos: [calculo(71, "2026-10-26", 5, 16.67, "EN_REVISION", otro, 2), calculo(70, "2026-10-25", 8, 26.67, "ESTIMADO", user.id, 1)],
  };
  const intents: Array<{ path: string; key: string; body: any }> = [];
  await page.route(/\/api\/usuarios-sistema\/me\/permissions\/?(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          ["contratos", "ver"],
          ["penalidades", "ver"],
          ...(options.gestionar ? [["penalidades", "gestionar"]] : []),
          ...(options.aprobar ? [["penalidades", "aprobar"]] : []),
        ].map(([recurso, accion]) => ({ id: `${recurso}.${accion}`, tenant_id: user.tenant_id, modulo: "ventas", recurso, accion })),
      }),
    }),
  );
  await page.route(/\/api\/ventas\/contratos\/[^/]+\/(ejecucion|estado-cuenta)\/?(\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
      programaciones: [], despachos: [], recepciones: [], moneda: "PEN", base_facturacion: "DESPACHO",
      lineas: [], ordenes: [], documentos: [], totales: [],
    } }) }),
  );
  await page.route(/\/api\/ventas\/contratos\/[^/]+\/penalidades(\/[^?]*)?\/?(\?.*)?$/, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/\/$/, "");
    if (req.method() === "GET") {
      // Como en la base: sólo el último corte (71) cuenta como exposición pendiente.
      const pendiente = state.calculos.filter((c) => !["APROBADO", "DESCARTADO"].includes(c.estado) && c.id === uuid(71));
      const aprobado = state.calculos.filter((c) => c.estado === "APROBADO");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
        ...state,
        resumen: [{ moneda: "PEN", estimado: pendiente.reduce((s, c) => s + c.monto_estimado, 0) || null,
          aprobado: aprobado.reduce((s, c) => s + Number(c.monto_aprobado), 0) || null }],
      } }) });
    }
    const body = req.postDataJSON();
    intents.push({ path: path.split("/penalidades")[1], key: req.headers()["idempotency-key"], body });
    let accion = "CALCULAR";
    if (path.endsWith("/reglas")) {
      accion = "GUARDAR_REGLA";
      state.reglas = state.reglas.map((r) => (r.grupo_id === body.grupo_id ? { ...r, estado: "REEMPLAZADA" } : r));
      state.reglas.unshift({ ...reglaV1, ...body, id: uuid(62), version: (body.version ?? 0) + 1, estado: "VIGENTE",
        created_at: "2026-10-27T15:00:00Z" });
    } else if (path.endsWith("/excepciones")) {
      accion = "REGISTRAR_EXCEPCION";
      state.excepciones.push({ id: uuid(63), grupo_id: null, referencia: null, ...body });
    } else if (path.endsWith("/revisar")) {
      accion = "REVISAR_CALCULO";
      state.calculos = state.calculos.map((c) => (path.includes(c.id)
        ? { ...c, estado: "APROBADO", monto_aprobado: body.monto_aprobado, version: c.version + 1 } : c));
    }
    return route.fulfill({ status: 201, contentType: "application/json",
      body: JSON.stringify({ success: true, data: { id: uuid(64), contrato_id: uuid(5), accion } }) });
  });
  return { intents, state };
}

for (const mobile of [false, true])
  test(`Feature penalidades: regla versionada, días excluidos, corte y aprobación separada ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    await doble(page, { expediente: true });
    const api = await doblePenalidades(page, { gestionar: true, aprobar: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/ventas/contratos/", { timeout: 90000 });
    await page.getByRole("button", { name: /SUP-001.*Activo/ }).click();
    const region = page.getByRole("region", { name: "Penalidades del contrato" });
    await expect(region.getByText("No genera asientos, notas de crédito ni descuentos", { exact: false })).toBeVisible();
    await expect(region.getByText("Pendiente de decisión (PEN)")).toBeVisible();
    await expect(region.getByText("Mora 0.10 × base / (F 0.4 × días de la OC a la entrega)", { exact: false })).toBeVisible();
    await expect(region.getByText("Corte anterior")).toHaveCount(1);

    // Nueva versión: parte de la vigente y la reemplaza sin tocar lo calculado.
    await region.getByRole("button", { name: "Nueva versión" }).click();
    const reglaForm = page.getByRole("form", { name: "Nueva versión de Mora por entrega tardía" });
    await expect(reglaForm.getByLabel("Factor F")).toHaveValue("0.4");
    await reglaForm.getByLabel("Factor F").fill("0.25");
    await reglaForm.getByLabel("Motivo de la nueva versión (adenda, cláusula)").fill("Adenda 1: plazo mayor a 60 días");
    await reglaForm.getByRole("button", { name: "Guardar versión 2" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Regla de penalidad guardada" })).toBeVisible();
    expect(api.intents[0]).toMatchObject({
      path: "/reglas",
      body: { grupo_id: grupo, version: 1, metodo: "MORA_OSCE", factor_f: 0.25, plazo_modo: "OC_A_ENTREGA", tolerancia_dias: 2,
        tope_porcentaje: 10, tope_base: "CONTRATO", motivo: "Adenda 1: plazo mayor a 60 días" },
    });
    expect(api.intents[0].key).toMatch(/^suministro:/);
    await expect(region.getByRole("paragraph").filter({ hasText: "Mora por entrega tardía · versión 2" })).toBeVisible();
    await expect(region.getByText("Versiones anteriores (1)")).toBeVisible();

    await region.getByRole("button", { name: "Excluir días" }).click();
    const excForm = page.getByRole("form", { name: "Excluir días de una entrega" });
    await excForm.getByLabel("Días excluidos").fill("3");
    await excForm.getByLabel("Motivo").fill("Ampliación aprobada por el cliente");
    await excForm.getByLabel("Documento de sustento (opcional)").fill("CARTA-12");
    await excForm.getByRole("button", { name: "Registrar días excluidos" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Días excluidos registrados" })).toBeVisible();
    expect(api.intents[1]).toMatchObject({
      path: "/excepciones",
      body: { entrega_id: uuid(9), dias_excluidos: 3, motivo: "Ampliación aprobada por el cliente", referencia: "CARTA-12" },
    });
    await expect(region.getByText("3 días")).toBeVisible();

    const ayer = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
    await region.getByLabel("Fecha de corte").fill(ayer);
    await region.getByRole("button", { name: "Calcular al corte" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Penalidades calculadas" })).toBeVisible();
    expect(api.intents[2]).toMatchObject({ path: "/calcular", body: { fecha_corte: ayer } });

    // El cálculo propio no se aprueba; el de otra persona sí, hasta el estimado.
    const filas = region.getByRole("button", { name: "Ver cálculo y revisiones" });
    await filas.nth(1).click();
    await expect(region.getByText("0.10 × 400.00 / (0.4000 × 30 días) = 3.3333; × 8 días = 26.67", { exact: false })).toBeVisible();
    await expect(region.getByText("Usted registró este cálculo: otra persona debe aprobarlo.")).toBeVisible();
    await expect(region.getByRole("option", { name: "Aprobar monto" })).toHaveAttribute("disabled", "");
    await region.getByRole("button", { name: "Ocultar detalle" }).click();
    await filas.first().click();
    await expect(region.getByText("Se revisa con actas", { exact: false })).toBeVisible();
    const revision = region.getByRole("form", { name: "Revisar cálculo" });
    await revision.getByLabel("Decisión").selectOption("APROBAR");
    await revision.getByLabel(/Monto aprobado/).fill("20");
    await expect(revision.getByRole("alert")).toHaveText("El monto aprobado va de 0 al estimado.");
    await expect(revision.getByRole("button", { name: "Registrar decisión" })).toBeDisabled();
    await revision.getByLabel(/Monto aprobado/).fill("16.67");
    await revision.getByLabel("Comentario").fill("Conforme con la cláusula décima");
    await revision.getByRole("button", { name: "Registrar decisión" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Decisión sobre la penalidad registrada" })).toBeVisible();
    expect(api.intents[3]).toMatchObject({
      path: `/calculos/${uuid(71)}/revisar`,
      body: { version: 2, accion: "APROBAR", monto_aprobado: 16.67, comentario: "Conforme con la cláusula décima" },
    });
    await expect(region.getByText("Aprobado (PEN)")).toBeVisible();
    await expect(region.getByRole("cell", { name: /^Aprobado\s*PEN 16\.67$/ })).toBeVisible();
    expect(api.intents).toHaveLength(4);
    await region.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../../artifacts/suministro-f06-penalidades/browser/${mobile ? "movil" : "escritorio"}-penalidades.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

test("Feature penalidades: sólo lectura no configura, calcula ni aprueba", async ({ context, page }) => {
  page.setDefaultTimeout(30000);
  await sesion(context, page);
  await doble(page, { expediente: true });
  const api = await doblePenalidades(page, { gestionar: false, aprobar: false });
  await page.goto("/dashboard/ventas/contratos/", { timeout: 90000 });
  await page.getByRole("button", { name: /SUP-001.*Activo/ }).click();
  const region = page.getByRole("region", { name: "Penalidades del contrato" });
  await expect(region.getByRole("paragraph").filter({ hasText: "Mora por entrega tardía · versión 1" })).toBeVisible();
  for (const name of ["Agregar regla", "Nueva versión", "Anular", "Excluir días", "Calcular al corte"])
    await expect(region.getByRole("button", { name, exact: true })).toHaveCount(0);
  await region.getByRole("button", { name: "Ver cálculo y revisiones" }).first().click();
  await expect(region.getByRole("form", { name: "Revisar cálculo" })).toHaveCount(0);
  expect(api.intents).toHaveLength(0);
});
