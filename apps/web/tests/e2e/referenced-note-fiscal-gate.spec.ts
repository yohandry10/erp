import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

const user = {
  id: "49400000-0000-4000-8000-000000000090",
  email: "fiscal-gate-494@erp.local",
  nombre: "Fiscal",
  apellido: "Gate",
  roles: ["ADMIN"],
  tenant_id: "49400000-0000-4000-8000-000000000091",
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
  throw new Error("JWT_SECRET no está disponible para el E2E aislado 494");
}

test.describe("NC/ND referenciada con gate fiscal 494", () => {
  test("explica que el borrador es neutro y que sólo el CDR aceptado aplica el efecto", async ({
    context,
    page,
  }) => {
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

    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const json = (body: unknown) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user);
      if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
        return json({
          data: {
            pais_id: 1,
            pais: "PE",
            paisCodigo: "PE",
            monedaDefecto: "PEN",
          },
        });
      }
      if (/\/api\/demo\/status\/?$/.test(pathname)) {
        return json({ is_demo: false, is_expired: false });
      }
      if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
        return json({ data: ["cpe.read", "cpe.create"] });
      }
      if (/\/api\/cpe\/notas-referenciadas\/origenes\/?$/.test(pathname)) {
        return json({
          success: true,
          data: [
            {
              id: "49400000-0000-4000-8000-000000000001",
              tipo_documento: "FACTURA",
              serie: "F494",
              numero: "00000001",
              receptor_razon_social: "Cliente QA 494",
              moneda: "PEN",
              total: 118,
              cpe: {
                id: "49400000-0000-4000-8000-000000000002",
                estado: "ACEPTADO",
              },
            },
          ],
        });
      }
      if (/\/api\/cpe\/stats\/?$/.test(pathname)) {
        return json({
          success: true,
          data: {
            cpeEmitidosHoy: 0,
            cpeDelMes: 0,
            montoFacturado: 0,
            rechazados: 0,
          },
        });
      }
      if (/\/api\/cpe\/comprobantes\/?$/.test(pathname)) {
        return json({ success: true, data: [] });
      }
      return json({ success: true, data: [] });
    });

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

    await page.goto("/dashboard/cpe", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Nueva NC / ND" }).click();

    await expect(
      page.getByRole("heading", { name: "Nueva nota referenciada" }),
    ).toBeVisible();
    await expect(page.getByTestId("referenced-note-type").locator("option")).toHaveText([
      "Nota de crédito (07)",
      "Nota de débito (08)",
    ]);
    await expect(
      page.getByText(/no modifica CxC, saldo a favor ni contabilidad/i),
    ).toBeVisible();
    await expect(
      page.getByText(
        /una sola vez cuando SUNAT\/OSE acepte la nota y entregue el CDR/i,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/un rechazo queda sin efecto financiero/i),
    ).toBeVisible();
  });
});
