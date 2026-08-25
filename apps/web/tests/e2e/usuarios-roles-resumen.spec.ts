import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

const user = {
  id: "roles-summary-user",
  email: "roles-summary@erp.local",
  nombre: "QA",
  apellido: "Roles",
  roles: ["ADMIN"],
  tenant_id: "roles-summary-tenant",
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
  throw new Error("JWT_SECRET no está disponible para el E2E aislado de roles");
}

test("roles resume permisos y sólo expande el detalle bajo demanda", async ({
  context,
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

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

  const permissions = Array.from(
    { length: 10 },
    (_, index) => `modulo.recurso.permiso_${index + 1}`,
  );
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
    if (/\/api\/demo\/status\/?$/.test(pathname))
      return json({ is_demo: true, is_expired: false });
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname))
      return json({ data: [] });
    if (/\/api\/usuarios-sistema\/roles\/?$/.test(pathname)) {
      return json({
        success: true,
        data: [
          {
            id: "admin-demo-role",
            nombre: "ADMIN_DEMO",
            descripcion: "Administrador operativo del tenant demo",
            usuariosCount: 1,
            permisos: permissions,
          },
        ],
      });
    }
    if (/\/api\/usuarios-sistema\/stats\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          totalUsuarios: 1,
          usuariosActivos: 1,
          usuariosInactivos: 0,
          totalRoles: 1,
        },
      });
    }
    if (/\/api\/usuarios-sistema\/?$/.test(pathname))
      return json({ success: true, data: [] });
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

  await page.goto("/dashboard/usuarios/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Gestión de Usuarios" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(permissions[5], { exact: true })).toBeVisible();
  await expect(page.getByText(permissions[6], { exact: true })).toHaveCount(0);

  const expand = page.getByRole("button", { name: "Ver 4 permisos más" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.click();
  await expect(page.getByText(permissions[9], { exact: true })).toBeVisible();

  const collapse = page.getByRole("button", { name: "Mostrar menos" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(page.getByText(permissions[6], { exact: true })).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
