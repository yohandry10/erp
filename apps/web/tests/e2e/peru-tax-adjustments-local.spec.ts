import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  readLocalSql as sql,
  consumeLocalAccounting,
} from "./helpers/peru-local-accounting";
const q = (id: string) => {
  expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  return "'" + id + "'::uuid";
};
const endpoint = (request: { url(): string }) =>
  new URL(request.url()).pathname.replace(/^\/backend/, "").replace(/\/$/, "");
test("Perú: anticipos, ajustes y depósito conservan intención y formulario tras respuestas perdidas", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(25000);
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!;
  const f = JSON.parse(
    fs.readFileSync(path.join(output, "tax-adjustments-fixture.json"), "utf8"),
  );
  const proof: {
    success: boolean;
    remoteWrites: boolean;
    scope: string;
    checks: Array<{ check: string; passed: boolean }>;
    unexpected_errors: string[];
    postings?: any[];
  } = {
    success: false,
    remoteWrites: false,
    scope:
      "UI real de ajustes fiscales: anticipo proveedor, detracción y depósito con respuesta perdida; no depósito bancario externo",
    checks: [],
    unexpected_errors: [],
  };
  page.on("pageerror", (error) => proof.unexpected_errors.push(error.message));
  const pass = (text: string) =>
    proof.checks.push({ check: text, passed: true });
  await context.route("**/*", (route) =>
    ["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(route.request().url()).hostname,
    )
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  try {
    await page.goto("/login/");
    await page.locator("#email").fill(f.email);
    await page.locator("#password").fill("Cliente-Local-2026-Only!");
    for (let attempt = 0; attempt < 2; attempt++) {
      const [login] = await Promise.all([
        page.waitForResponse(
          (r) =>
            endpoint(r) === "/api/auth/login" &&
            r.request().method() === "POST",
        ),
        page
          .getByRole("button", { name: "Iniciar Sesión", exact: true })
          .click(),
      ]);
      if (login.status() === 429 && attempt === 0) {
        const seconds = Number(await login.headerValue("retry-after"));
        expect(seconds).toBeGreaterThan(0);
        expect(seconds).toBeLessThanOrEqual(60);
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        continue;
      }
      expect(login.status()).toBe(201);
      await page.waitForURL("**/dashboard/**", { timeout: 25000 });
      break;
    }
    await page.goto("/dashboard/finanzas/ajustes-fiscales/");
    await expect(
      page.getByRole("heading", {
        name: "Ajustes fiscales y anticipos",
        exact: true,
      }),
    ).toBeVisible();
    const form = page.locator("form");
    await form
      .getByRole("combobox", { name: "Origen", exact: true })
      .selectOption("PROVEEDOR");
    async function lost(pathname: string, click: () => Promise<unknown>) {
      const keys: string[] = [];
      let committed: any;
      const matcher = new RegExp(
        pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/?$",
      );
      await context.route(matcher, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        keys.push(route.request().postDataJSON().idempotency_key);
        if (keys.length === 1) {
          const actual = await route.fetch();
          expect(actual.status(), await actual.text()).toBe(201);
          committed = await actual.json();
          await route.fulfill({
            status: 503,
            json: { message: "Interrupción local confirmada" },
          });
        } else await route.continue();
      });
      const [failed] = await Promise.all([
        page.waitForResponse(
          (r) =>
            endpoint(r) === pathname &&
            r.request().method() === "POST" &&
            r.status() === 503,
        ),
        click(),
      ]);
      expect(failed.status()).toBe(503);
      await expect(
        page
          .getByText("Interrupción local confirmada", { exact: false })
          .first(),
      ).toBeVisible();
      return {
        keys,
        get committed() {
          return committed?.data ?? committed;
        },
        matcher,
      };
    }
    await page
      .getByRole("button", { name: "Registrar anticipo", exact: true })
      .click();
    await form
      .getByRole("combobox", { name: "Proveedor", exact: true })
      .selectOption(f.provider_id);
    await form
      .getByRole("combobox", { name: "Cuenta bancaria", exact: true })
      .selectOption(f.bank_id);
    await form
      .getByRole("spinbutton", { name: "Monto", exact: true })
      .fill("30");
    await form
      .getByRole("textbox", { name: "Referencia", exact: true })
      .fill("UI-ANT-LOCAL");
    const bankBefore = Number(
      sql(`SELECT saldo FROM cuentas_bancarias WHERE id=${q(f.bank_id)};`),
    );
    const anticipo = await lost("/api/retenciones/anticipos", () =>
      page
        .getByRole("button", {
          name: "Registrar movimiento y anticipo",
          exact: true,
        })
        .click(),
    );
    await expect(
      form.getByRole("spinbutton", { name: "Monto", exact: true }),
    ).toHaveValue("30");
    await expect(
      form.getByRole("textbox", { name: "Referencia", exact: true }),
    ).toHaveValue("UI-ANT-LOCAL");
    expect(
      Number(
        sql(`SELECT saldo FROM cuentas_bancarias WHERE id=${q(f.bank_id)};`),
      ),
    ).toBe(bankBefore - 30);
    const [retryAdvance] = await Promise.all([
      page.waitForResponse(
        (r) =>
          endpoint(r) === "/api/retenciones/anticipos" &&
          r.status() === 201 &&
          r.request().method() === "POST",
      ),
      page
        .getByRole("button", {
          name: "Registrar movimiento y anticipo",
          exact: true,
        })
        .click(),
    ]);
    expect((await retryAdvance.json()).data.id).toBe(anticipo.committed.id);
    expect(new Set(anticipo.keys).size).toBe(1);
    await expect(
      form.getByRole("spinbutton", { name: "Monto", exact: true }),
    ).toHaveValue("");
    expect(
      Number(
        sql(`SELECT saldo FROM cuentas_bancarias WHERE id=${q(f.bank_id)};`),
      ),
    ).toBe(bankBefore - 30);
    pass("Anticipo: 503 conserva campos y retry recupera ID sin segundo cargo");
    await context.unroute(anticipo.matcher);
    await page
      .getByRole("button", { name: "Aplicar a documento", exact: true })
      .click();
    await form
      .getByRole("combobox", { name: "Origen", exact: true })
      .selectOption("PROVEEDOR");
    await form
      .getByRole("combobox", { name: "Tipo", exact: true })
      .selectOption("DETRACCION");
    await form
      .getByRole("combobox", { name: "Documento con saldo", exact: true })
      .selectOption(f.invoice_ui_id);
    await form
      .getByRole("spinbutton", { name: "Monto", exact: true })
      .fill("10");
    await form
      .getByRole("textbox", { name: "Referencia", exact: true })
      .fill("UI-DET-LOCAL");
    const ajuste = await lost("/api/retenciones/ajustes", () =>
      page
        .getByRole("button", {
          name: "Aplicar ajuste al documento",
          exact: true,
        })
        .click(),
    );
    await expect(
      form.getByRole("spinbutton", { name: "Monto", exact: true }),
    ).toHaveValue("10");
    expect(
      Number(
        sql(
          `SELECT saldo FROM cuentas_por_pagar WHERE id=${q(f.invoice_ui_id)};`,
        ),
      ),
    ).toBe(108);
    const [retryAdjustment] = await Promise.all([
      page.waitForResponse(
        (r) =>
          endpoint(r) === "/api/retenciones/ajustes" &&
          r.status() === 201 &&
          r.request().method() === "POST",
      ),
      page
        .getByRole("button", {
          name: "Aplicar ajuste al documento",
          exact: true,
        })
        .click(),
    ]);
    expect((await retryAdjustment.json()).data.id).toBe(ajuste.committed.id);
    expect(new Set(ajuste.keys).size).toBe(1);
    expect(
      Number(
        sql(
          `SELECT saldo FROM cuentas_por_pagar WHERE id=${q(f.invoice_ui_id)};`,
        ),
      ),
    ).toBe(108);
    pass(
      "Detracción: respuesta perdida y retry mantienen una reducción de deuda",
    );
    await context.unroute(ajuste.matcher);
    await page
      .getByRole("combobox", { name: "Banco para el depósito", exact: true })
      .selectOption(f.bank_id);
    const depositPath =
      "/api/retenciones/" + ajuste.committed.id + "/depositar-detraccion";
    const deposit = await lost(depositPath, () =>
      page
        .getByRole("button", { name: "Depositar detracción", exact: false })
        .click(),
    );
    expect(
      Number(
        sql(`SELECT saldo FROM cuentas_bancarias WHERE id=${q(f.bank_id)};`),
      ),
    ).toBe(bankBefore - 40);
    await Promise.all([
      page.waitForResponse(
        (r) =>
          endpoint(r) === depositPath &&
          r.status() === 201 &&
          r.request().method() === "POST",
      ),
      page
        .getByRole("button", { name: "Depositar detracción", exact: false })
        .click(),
    ]);
    expect(new Set(deposit.keys).size).toBe(1);
    await expect(
      page.getByText("No hay detracciones pendientes.", { exact: true }),
    ).toBeVisible();
    expect(
      Number(
        sql(`SELECT saldo FROM cuentas_bancarias WHERE id=${q(f.bank_id)};`),
      ),
    ).toBe(bankBefore - 40);
    pass("Depósito: retry conserva cargo único y retira pendiente");
    await page.reload();
    await expect(
      page.getByText("UI-DET-LOCAL", { exact: false }).first(),
    ).toBeVisible();
    expect(proof.unexpected_errors).toEqual([]);
    pass("Recarga conserva historial y no hubo rechazo de promesa sin manejar");
    await consumeLocalAccounting("browser-tax-adjustments-accounting");
    const entries = JSON.parse(
      sql(
        `SELECT coalesce(jsonb_agg(jsonb_build_object('event_type',e.event_type,'status',e.status,'entries',(SELECT count(*) FROM asientos_contables a WHERE a.source_event_id=e.event_id),'balanced',(SELECT bool_and(a.total_debe=a.total_haber AND a.estado='CONFIRMADO') FROM asientos_contables a WHERE a.source_event_id=e.event_id)) ORDER BY e.created_at),'[]') FROM outbox_events e WHERE tenant_id=${q(f.tenant)} AND event_type IN ('banco.movimiento.registrado','factura.proveedor.registrada','pago.proveedor.registrado','cxp.ajuste.registrado');`,
      ),
    );
    expect(entries.length).toBeGreaterThanOrEqual(13);
    for (const entry of entries) {
      expect(entry.status).toBe("completed");
      expect(entry.entries).toBe(1);
      expect(entry.balanced).toBe(true);
    }
    proof.postings = entries;
    pass(
      "Contabilidad posterior a UI: cada evento produjo un asiento confirmado y cuadrado",
    );
    proof.success = true;
  } finally {
    fs.writeFileSync(
      path.join(output, "browser-tax-adjustments.json"),
      JSON.stringify(proof, null, 2),
    );
  }
});
