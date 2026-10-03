import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { readLocalSql } from "./helpers/peru-local-accounting";

async function loginLocal(page: Page, email: string, password: string) {
  await page.goto("/login/");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  for (let attempt = 0; attempt < 2; attempt++) {
    const responsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname
          .replace(/\/$/, "")
          .endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Iniciar Sesión", exact: true })
      .click();
    const response = await responsePromise;
    if (response.status() === 429 && attempt === 0) {
      const seconds = Number((await response.headerValue("retry-after")) || 60);
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(60);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    expect(response.status()).toBe(201);
    await page.waitForURL("**/dashboard/**", { timeout: 25000 });
    return;
  }
}

async function localOnly(context: BrowserContext) {
  if (process.env.E2E_EPHEMERAL_LOCAL_DB !== "1")
    throw new Error("Requiere base local efímera");
  await context.route("**/*", (route) =>
    ["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(route.request().url()).hostname,
    )
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
}

test("Perú: sucursales recupera alta, edición, baja y asignación perdidas y respeta el alcance del lector", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(25000);
  await localOnly(context);
  const output = process.env.LOCAL_INTEGRATED_OUTPUT_DIR!;
  const fixture = JSON.parse(
    await fs.readFile(
      path.join(output, "configuration-admin-fixture.json"),
      "utf8",
    ),
  );
  for (const id of [fixture.tenant, fixture.reader_id, fixture.branch_id])
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  const tenant = `'${fixture.tenant}'::uuid`;
  const reader = `'${fixture.reader_id}'::uuid`;
  const scriptErrors: string[] = [];
  const keys: Record<string, (string | undefined)[]> = {
    create: [],
    edit: [],
    deactivate: [],
    assign: [],
  };
  const lose: Record<string, boolean> = {
    create: true,
    edit: true,
    deactivate: true,
    assign: true,
  };
  let branchId = "";
  let success = false;
  const assertSameIntent = (operation: string) => {
    expect(keys[operation].length).toBe(2);
    expect(keys[operation][0]).toBeTruthy();
    expect(keys[operation][1]).toBe(keys[operation][0]);
  };
  page.on("pageerror", (error) => scriptErrors.push(error.message));
  await page.route(
    /\/api\/sucursales(?:\/[^?]+)?\/?(?:\?.*)?$/,
    async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname.replace(/^\/backend/, "").replace(/\/$/, "");
      const payload =
        request.method() === "PUT" ? request.postDataJSON() : undefined;
      const operation =
        request.method() === "POST" && pathname === "/api/sucursales"
          ? "create"
          : request.method() === "PUT" &&
              pathname === `/api/sucursales/${branchId}` &&
              payload?.nombre
            ? "edit"
            : request.method() === "DELETE" &&
                pathname === `/api/sucursales/${branchId}`
              ? "deactivate"
              : request.method() === "PUT" &&
                  pathname ===
                    `/api/sucursales/usuarios/${fixture.reader_id}` &&
                  payload?.sucursal_ids?.includes(branchId)
                ? "assign"
                : null;
      if (!operation) return route.continue();
      keys[operation].push(request.headers()["idempotency-key"]);
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(
        operation === "create" ? 201 : 200,
      );
      if (operation === "create") branchId = (await response.json()).data.id;
      if (lose[operation])
        return route.fulfill({
          status: 503,
          json: { message: "Respuesta local perdida después del commit" },
        });
      return route.fulfill({ response });
    },
  );
  try {
    await loginLocal(page, fixture.email, "Cliente-Local-2026-Only!");
    await page.goto("/dashboard/configuracion/sucursales/");
    await page
      .getByRole("button", { name: "Nuevo establecimiento", exact: true })
      .click();
    const name = page.getByLabel("Nombre", { exact: true });
    await name.fill("Anexo UI perdido");
    await page
      .getByLabel("Dirección", { exact: true })
      .fill("Dirección local UI");
    const save = page.getByRole("button", { name: "Guardar", exact: true });
    await save.click();
    await expect(
      page.getByText("No se pudo guardar el establecimiento.", { exact: true }),
    ).toBeVisible();
    await expect(name).toHaveValue("Anexo UI perdido");
    expect(
      readLocalSql(
        `SELECT count(*) FROM sucursales WHERE tenant_id=${tenant} AND nombre='Anexo UI perdido';`,
      ),
    ).toBe("1");
    lose.create = false;
    await save.click();
    await expect(name).toHaveCount(0);
    assertSameIntent("create");
    await page
      .getByRole("button", {
        name: "Editar establecimiento Anexo UI perdido",
        exact: true,
      })
      .click();
    await name.fill("Anexo UI editado");
    await page.getByLabel("Teléfono", { exact: true }).fill("555-LOCAL");
    await save.click();
    await expect(
      page.getByText("No se pudo guardar el establecimiento.", { exact: true }),
    ).toBeVisible();
    await expect(name).toHaveValue("Anexo UI editado");
    expect(
      readLocalSql(
        `SELECT nombre FROM sucursales WHERE id='${branchId}'::uuid;`,
      ),
    ).toBe("Anexo UI editado");
    lose.edit = false;
    await save.click();
    await expect(name).toHaveCount(0);
    assertSameIntent("edit");
    const deactivate = page.getByRole("button", {
      name: "Desactivar establecimiento Anexo UI editado",
      exact: true,
    });
    await deactivate.click();
    await expect(
      page.getByText("No se pudo cambiar el estado del establecimiento.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      readLocalSql(
        `SELECT activo FROM sucursales WHERE id='${branchId}'::uuid;`,
      ),
    ).toBe("f");
    lose.deactivate = false;
    await deactivate.click();
    const reactivate = page.getByRole("button", {
      name: "Reactivar establecimiento Anexo UI editado",
      exact: true,
    });
    await expect(reactivate).toBeVisible();
    assertSameIntent("deactivate");
    await page.reload();
    await expect(reactivate).toBeVisible();
    await reactivate.click();
    await expect(deactivate).toBeVisible();
    expect(
      readLocalSql(
        `SELECT activo FROM sucursales WHERE id='${branchId}'::uuid;`,
      ),
    ).toBe("t");
    const assignName = `Asignar Anexo UI editado a ${fixture.reader_email}`;
    const assign = page.getByRole("button", { name: assignName, exact: true });
    await assign.click();
    await expect(
      page.getByText("No se pudo guardar la asignación.", { exact: true }),
    ).toBeVisible();
    await expect(assign).toHaveAttribute("aria-pressed", "false");
    expect(
      readLocalSql(
        `SELECT count(*) FROM usuario_sucursales WHERE tenant_id=${tenant} AND usuario_sistema_id=${reader};`,
      ),
    ).toBe("2");
    lose.assign = false;
    await assign.click();
    const unassign = page.getByRole("button", {
      name: `Quitar Anexo UI editado a ${fixture.reader_email}`,
      exact: true,
    });
    await expect(unassign).toHaveAttribute("aria-pressed", "true");
    assertSameIntent("assign");
    await page.reload();
    await expect(unassign).toBeVisible();
    await unassign.click();
    await expect(assign).toBeVisible();
    expect(
      readLocalSql(
        `SELECT count(*) FROM usuario_sucursales WHERE tenant_id=${tenant} AND usuario_sistema_id=${reader};`,
      ),
    ).toBe("1");
    for (const operation of Object.keys(keys)) {
      expect(
        readLocalSql(
          `SELECT count(*) FROM configuration_operation_intents WHERE tenant_id=${tenant} AND idempotency_key='${keys[operation][0]}' AND operation LIKE 'SUCURSAL_%';`,
        ),
      ).toBe("1");
      expect(
        readLocalSql(
          `SELECT count(*) FROM audit_log WHERE tenant_id=${tenant} AND metadata->>'source'='sucursales_560' AND metadata->>'idempotency_key'='${keys[operation][0]}';`,
        ),
      ).toBe("1");
    }
    const readerContext = await browser.newContext({
      baseURL: process.env.LOCAL_WEB_URL,
    });
    try {
      await localOnly(readerContext);
      const readerPage = await readerContext.newPage();
      await loginLocal(readerPage, fixture.reader_email, "Lector-Local-2026!");
      await readerPage.goto("/dashboard/configuracion/sucursales/");
      await expect(
        readerPage.getByText("Anexo editado", { exact: true }).first(),
      ).toBeVisible();
      await expect(
        readerPage.getByText("Anexo UI editado", { exact: true }),
      ).toHaveCount(0);
      await expect(
        readerPage.getByRole("button", {
          name: "Nuevo establecimiento",
          exact: true,
        }),
      ).toHaveCount(0);
      expect(
        (await readerPage.request.get(`/backend/api/sucursales/${branchId}/`)).status(),
      ).toBe(404);
      expect(
        (
          await readerPage.request.put(`/backend/api/sucursales/${branchId}/`, {
            data: { nombre: "No autorizado" },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await readerContext.close();
    }
    expect(
      readLocalSql(
        `SELECT count(*) FROM sucursales WHERE tenant_id=${tenant} AND nombre='Anexo UI editado';`,
      ),
    ).toBe("1");
    expect(scriptErrors).toEqual([]);
    success = true;
  } finally {
    await fs.writeFile(
      path.join(output, "browser-configuration-admin.json"),
      JSON.stringify(
        {
          success,
          remoteWrites: false,
          scope:
            "CRUD de anexo, recuperación de cuatro respuestas perdidas, inactivos/recarga, asignación y lector; un recibo y auditoría por intención; sin parámetros fiscales externos",
          operations: Object.fromEntries(
            Object.entries(keys).map(([operation, values]) => [
              operation,
              {
                requests: values.length,
                same_intent:
                  values.length === 2 && !!values[0] && values[0] === values[1],
              },
            ]),
          ),
          scriptErrors,
        },
        null,
        2,
      ),
    );
  }
});
