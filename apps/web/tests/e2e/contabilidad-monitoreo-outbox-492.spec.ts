import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

const user = {
  id: "49200000-0000-4000-8000-000000000090",
  email: "monitor-outbox-492@erp.local",
  nombre: "Monitor",
  apellido: "Outbox",
  roles: ["ADMIN"],
  tenant_id: "49200000-0000-4000-8000-000000000091",
  is_super_admin: true,
};

const failedEventId = "49200000-0000-4000-8000-000000000011";

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
    if (line) {
      return line
        .replace(/^\s*JWT_SECRET=/, "")
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  }
  throw new Error("JWT_SECRET no está disponible para el E2E aislado 492");
}

test.describe("monitor contable outbox 492", () => {
  test("muestra failed y dead letter, reintenta por POST y conserva el snapshot si la recarga falla", async ({
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

    let degraded = false;
    let retried = false;
    const retryRequests: Array<{ method: string; eventId: string }> = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({
          status,
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
        return json({
          data: [
            "contabilidad.reportes.read",
            "contabilidad.asientos.read",
            "contabilidad.eventos.reintentar",
          ],
        });
      }

      if (/\/api\/contabilidad\/eventos\/estadisticas\/?$/.test(pathname)) {
        if (degraded) {
          return json({
            success: false,
            message: "snapshot contable incompleto en QA 492",
          });
        }
        return json({
          success: true,
          data: {
            pending: 2,
            processed: 91,
            processed_today: 7,
            failed: retried ? 0 : 1,
            dead_letter: 1,
            avg_processing_time_ms: 42,
          },
        });
      }
      if (/\/api\/contabilidad\/eventos\/fallidos\/?$/.test(pathname)) {
        return json({
          success: true,
          data: retried
            ? []
            : [
                {
                  id: "49200000-0000-4000-8000-000000000001",
                  event_id: failedEventId,
                  event_type: "CobroRegistrado",
                  error_message: "Fallo transitorio QA 492",
                  retry_count: 1,
                  status: "failed",
                  created_at: "2026-08-13T15:00:00.000Z",
                },
              ],
        });
      }
      if (/\/api\/contabilidad\/eventos\/dead-letter\/?$/.test(pathname)) {
        return json({
          success: true,
          data: [
            {
              id: "49200000-0000-4000-8000-000000000002",
              event_id: "49200000-0000-4000-8000-000000000012",
              event_type: "stock.movimiento",
              error_message: "Dead letter QA 492",
              retry_count: 3,
              status: "dead_letter",
              created_at: "2026-08-13T16:00:00.000Z",
            },
          ],
        });
      }
      if (
        /\/api\/contabilidad\/asientos\/estadisticas\/por-tipo\/?$/.test(
          pathname,
        )
      ) {
        return json({
          success: true,
          data: [{ tipo: "CobroRegistrado", cantidad: 47 }],
        });
      }

      const retryMatch = pathname.match(
        /^\/(?:backend\/)?api\/contabilidad\/eventos\/([^/]+)\/reintentar\/?$/,
      );
      if (retryMatch) {
        retryRequests.push({
          method: request.method(),
          eventId: retryMatch[1],
        });
        retried = true;
        return json({
          success: true,
          data: { eventId: retryMatch[1], reiniciado: true },
        });
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

    await page.goto("/dashboard/contabilidad/monitoreo", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Monitoreo de Eventos Contables" }),
    ).toBeVisible();
    const failedRow = page
      .getByRole("row")
      .filter({ hasText: "Fallo transitorio QA 492" });
    const deadLetterRow = page
      .getByRole("row")
      .filter({ hasText: "Dead letter QA 492" });
    await expect(failedRow).toBeVisible();
    await expect(deadLetterRow).toBeVisible();

    await failedRow.getByRole("button", { name: "Reintentar" }).click();
    await expect
      .poll(() => retryRequests)
      .toContainEqual({ method: "POST", eventId: failedEventId });
    await expect(failedRow).toHaveCount(0);
    await expect(deadLetterRow).toBeVisible();

    degraded = true;
    await page.getByRole("button", { name: "Actualizar" }).click();

    await expect(page.getByText(/Monitoreo degradado:/)).toBeVisible();
    await expect(deadLetterRow).toBeVisible();
    await expect(page.getByText("42ms", { exact: true })).toBeVisible();
  });
});
