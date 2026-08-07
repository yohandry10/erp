import { expect, test, type Page } from "@playwright/test";
import { SignJWT } from "jose";
import fs from "node:fs";
import path from "node:path";

const apiUser = {
  id: "theme-contract-user",
  email: "theme-contract@erp.local",
  nombre: "Theme",
  apellido: "Contract",
  roles: ["ADMIN"],
  tenant_id: "theme-contract-tenant",
  is_super_admin: false,
};

const themeBaseURL = process.env.BASE_URL || "http://localhost:3001";

async function waitForThemeRouteReady(page: Page) {
  await expect(page.locator('html[data-erp-hydrated="true"]')).toHaveCount(1, {
    timeout: 30000,
  });
  await expect(
    page.getByText("Preparando configuración fiscal del tenant..."),
  ).toBeHidden({ timeout: 30000 });
}

function readJwtSecret(): string {
  for (const envPath of [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../erp-api/.env"),
  ]) {
    if (!fs.existsSync(envPath)) continue;
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((entry) => /^\s*JWT_SECRET=/.test(entry));
    if (!line) continue;
    return line
      .replace(/^\s*JWT_SECRET=/, "")
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }

  throw new Error(
    "JWT_SECRET no está disponible para el contrato aislado de tema",
  );
}

async function createMiddlewareCookie() {
  return new SignJWT({
    tenant_id: apiUser.tenant_id,
    email: apiUser.email,
    roles: apiUser.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(apiUser.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(readJwtSecret()));
}

async function findThemeSurfaceViolations(page: Page, theme: "dark" | "light") {
  return page.locator("main").evaluate((main, activeTheme) =>
    Array.from(main.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width * rect.height < 2_000 || rect.bottom < 0) return false;
        if (element.closest('[data-testid="demo-banner"]')) return false;

        const background = getComputedStyle(element).backgroundColor;
        const match = background.match(
          /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/,
        );
        if (!match) return false;

        const [, redValue, greenValue, blueValue, alphaValue = "1"] = match;
        const channels = [redValue, greenValue, blueValue].map(Number);
        const alpha = Number(alphaValue);
        if (alpha < 0.5) return false;

        if (activeTheme === "dark") {
          return channels.every((channel) => channel >= 248);
        }

        const max = Math.max(...channels);
        const min = Math.min(...channels);
        return max <= 40 && max - min <= 20;
      })
      .slice(0, 8)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        background: getComputedStyle(element).backgroundColor,
      })), theme);
}

async function findTextContrastViolations(page: Page) {
  return page.locator("main").evaluate((main) => {
    type Rgba = [number, number, number, number];

    const parseColor = (value: string): Rgba | null => {
      const match = value.match(
        /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/,
      );
      return match
        ? [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 1)]
        : null;
    };
    const composite = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
        alpha,
      ];
    };
    const luminance = (color: Rgba) => {
      const channels = color.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const effectiveBackground = (element: HTMLElement): Rgba => {
      const ancestors: HTMLElement[] = [];
      for (let current: HTMLElement | null = element; current; current = current.parentElement) {
        ancestors.unshift(current);
      }
      return ancestors.reduce<Rgba>((result, ancestor) => {
        const color = parseColor(getComputedStyle(ancestor).backgroundColor);
        return color && color[3] > 0 ? composite(color, result) : result;
      }, [255, 255, 255, 1]);
    };

    const candidates = Array.from(
      main.querySelectorAll<HTMLElement>(
        'h1, [class*="text-white"], [class*="text-primary-foreground"], [class*="text-cyan-100"]',
      ),
    );

    return candidates
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0
          && rect.height > 0
          && (element.innerText ?? element.textContent ?? "").trim().length > 0
          && !element.closest('[data-testid="demo-banner"]');
      })
      .map((element) => {
        const style = getComputedStyle(element);
        const background = effectiveBackground(element);
        const parsedText = parseColor(style.color) ?? ([0, 0, 0, 1] as Rgba);
        const text = composite(parsedText, background);
        const light = Math.max(luminance(text), luminance(background));
        const dark = Math.min(luminance(text), luminance(background));
        const ratio = (light + 0.05) / (dark + 0.05);
        const isLarge = Number.parseFloat(style.fontSize) >= 24
          || (Number.parseFloat(style.fontSize) >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700);
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.innerText ?? element.textContent ?? "").trim().slice(0, 80),
          ratio: Number(ratio.toFixed(2)),
          required: isLarge ? 3 : 4.5,
        };
      })
      .filter(({ ratio, required }) => ratio < required)
      .slice(0, 12);
  });
}

test.describe("Contrato de tema del dashboard", () => {
  test("login público usa shadcn/Tailwind y no desborda en móvil", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "ERP Suite" })).toBeVisible();
    await expect(page.getByLabel("País operativo")).toBeVisible();
    await expect(page.getByLabel("Correo Electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar Sesión" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Acceso Demo" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("persiste la selección y limpia el atributo global fuera del dashboard", async ({
    context,
    page,
  }) => {
    test.setTimeout(720_000);
    const accessToken = await createMiddlewareCookie();
    await context.addCookies([
      {
        name: "access_token",
        value: accessToken,
        url: themeBaseURL,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (/\/api\/auth\/profile\/?$/.test(pathname)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(apiUser),
        });
      }
      if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              pais_id: 1,
              pais: "PE",
              monedaDefecto: "PEN",
              tipo_empresa: "MICRO",
              usar_flujo_logistica: false,
              gre_obligatorio: false,
              gre_automatico_habilitado: false,
            },
          }),
        });
      }
      if (/\/api\/demo\/status\/?$/.test(pathname)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_demo: true,
            is_expired: false,
            dias_restantes: 10,
            can_extend: true,
          }),
        });
      }
      if (/\/api\/cajas\/?$/.test(pathname)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: [{ id: "theme-caja", nombre: "Caja de prueba" }],
          }),
        });
      }
      if (/\/api\/pos\/sesion-caja\/?$/.test(pathname)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: null }),
        });
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.addInitScript((user) => {
      const session = JSON.stringify({ user });
      window.localStorage.setItem("erp.auth.session.snapshot", session);
      window.sessionStorage.setItem("erp.auth.session.snapshot", session);
      window.localStorage.setItem(
        "erp_onboarding_completed",
        JSON.stringify(["admin"]),
      );
      window.localStorage.setItem("selectedCountry", "1");
      if (!window.localStorage.getItem("erp-dashboard-theme")) {
        window.localStorage.setItem("erp-dashboard-theme", "dark");
      }
    }, apiUser);

    await page.goto("/dashboard/rrhh/contratos/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Verificando autenticación...")).toBeHidden({
      timeout: 30000,
    });

    const switchToLight = page.getByRole("button", {
      name: "Cambiar a tema claro",
    });
    await expect(switchToLight).toBeVisible({ timeout: 30000 });
    await expect(page.locator("html")).toHaveAttribute(
      "data-erp-theme",
      "dark",
    );
    await expect(page.locator('main[data-theme="dark"]')).toBeVisible();

    await page.goto("/dashboard/finanzas/conciliacion/", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Verificando autenticación...")).toBeHidden({
      timeout: 30000,
    });
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: /Nueva Conciliación/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: /Nueva conciliación bancaria/i,
    });
    await expect(dialog).toBeVisible();
    const dialogBackground = await dialog.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(dialogBackground).not.toBe("rgb(255, 255, 255)");
    await dialog.getByRole("button", { name: "Cerrar" }).click();

    for (const route of [
      "/dashboard/documentos/",
      "/dashboard/ventas/reportes/",
      "/dashboard/compras/recepciones/",
      "/dashboard/rrhh/planillas/",
      "/dashboard/rrhh/candidatos/",
      "/dashboard/rrhh/contratos/",
      "/dashboard/rrhh/pagos/",
      "/dashboard/contabilidad/",
      "/dashboard/contabilidad/estados/",
      "/dashboard/contabilidad/presupuestos/",
      "/dashboard/cajas/",
      "/dashboard/cpe/",
      "/dashboard/pos/",
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Verificando autenticación...")).toBeHidden({
        timeout: 30000,
      });
      await waitForThemeRouteReady(page);
      await expect(page.locator("body")).not.toContainText(
        /Application error|Internal Server Error|ChunkLoadError/i,
      );
      await expect(page.locator("html")).toHaveAttribute(
        "data-erp-theme",
        "dark",
      );

      await expect
        .poll(() => findThemeSurfaceViolations(page, "dark"), {
          message: `No debe haber islas blancas grandes en ${route}`,
          timeout: 3000,
        })
        .toEqual([]);
    }

    await page.getByRole("button", { name: /Abrir Caja Registradora/i }).click();
    await expect(page.getByRole("heading", { name: "Abrir Caja" })).toBeVisible();
    await expect(page.getByLabel(/Monto inicial/i)).toBeVisible();

    await page.goto("/dashboard/rrhh/contratos/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Verificando autenticación...")).toBeHidden({
      timeout: 30000,
    });
    await page.waitForLoadState("networkidle");

    await switchToLight.click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-erp-theme",
      "light",
    );
    await expect(page.locator('main[data-theme="light"]')).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cambiar a tema oscuro" }),
    ).toBeVisible();
    expect(await findThemeSurfaceViolations(page, "light")).toEqual([]);
    expect(await findTextContrastViolations(page)).toEqual([]);
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("erp-dashboard-theme")),
      )
      .toBe("light");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Verificando autenticación...")).toBeHidden({
      timeout: 30000,
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-erp-theme",
      "light",
    );
    await expect(
      page.getByRole("button", { name: "Cambiar a tema oscuro" }),
    ).toBeVisible();

    for (const route of [
      "/dashboard/documentos/",
      "/dashboard/ventas/reportes/",
      "/dashboard/compras/ordenes/",
      "/dashboard/compras/recepciones/",
      "/dashboard/contabilidad/asientos/",
      "/dashboard/contabilidad/",
      "/dashboard/contabilidad/estados/",
      "/dashboard/contabilidad/presupuestos/",
      "/dashboard/rrhh/planillas/",
      "/dashboard/rrhh/candidatos/",
      "/dashboard/rrhh/contratos/",
      "/dashboard/rrhh/pagos/",
      "/dashboard/cpe/",
      "/dashboard/gre/",
      "/dashboard/sire/",
      "/dashboard/finanzas/cxc/",
      "/dashboard/finanzas/cxp/",
      "/dashboard/finanzas/bancos/",
      "/dashboard/cajas/",
      "/dashboard/pos/",
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Verificando autenticación...")).toBeHidden({
        timeout: 30000,
      });
      await waitForThemeRouteReady(page);
      await expect(page.locator("html")).toHaveAttribute(
        "data-erp-theme",
        "light",
      );

      await expect
        .poll(() => findThemeSurfaceViolations(page, "light"), {
          message: `No debe haber islas oscuras neutras grandes en ${route}`,
          timeout: 15000,
        })
        .toEqual([]);
      await expect
        .poll(() => findTextContrastViolations(page), {
          message: `El texto principal debe conservar contraste AA en ${route}`,
          timeout: 15000,
        })
        .toEqual([]);
    }

    await page.goto("/dashboard/ventas/reportes/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("sales-report-tabs")).toBeVisible();
    expect(
      await page.getByTestId("sales-report-tabs").evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);

    await page.goto("/dashboard/finanzas/conciliacion/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("combobox", { name: "Filtrar por estado" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filtrar por cuenta bancaria" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/documentos/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    await expect(page.getByTestId("demo-convert-button")).toBeVisible();
    await expect(page.getByTestId("mobile-menu-button")).toBeVisible();
    const mobileLayout = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('[data-testid="mobile-menu-button"]')?.getBoundingClientRect();
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="dashboard-utility-bar"] > div:first-child button'),
      ).map((element) => element.getBoundingClientRect());
      const overlaps = menu
        ? controls.some((rect) => !(rect.right <= menu.left || rect.left >= menu.right || rect.bottom <= menu.top || rect.top >= menu.bottom))
        : true;
      return {
        overlaps,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(mobileLayout).toEqual({ overlaps: false, horizontalOverflow: false });

    await page.goto("/dashboard/rrhh/candidatos/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Nuevo Candidato" })).toBeVisible({ timeout: 30000 });
    const candidateFiltersFit = await page.evaluate(() =>
      ["filtro-estado-candidatos", "filtro-vacante-candidatos"].every((id) => {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        return Boolean(rect && rect.left >= 0 && rect.right <= window.innerWidth);
      }),
    );
    expect(candidateFiltersFit).toBe(true);
    await page.getByRole("button", { name: "Nuevo Candidato" }).click();
    const candidateDialog = page.getByRole("dialog", { name: "Nuevo Candidato" });
    await expect(candidateDialog).toBeVisible();
    expect(
      await candidateDialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
      }),
    ).toBe(true);
    await candidateDialog.getByRole("button", { name: "Cerrar" }).click();

    await page.goto("/dashboard/rrhh/contratos/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Nuevo Contrato" })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Nuevo Contrato" }).click();
    const contractDialog = page.getByRole("dialog", { name: "Nuevo contrato" });
    await expect(contractDialog).toBeVisible();
    await expect(contractDialog.getByRole("combobox", { name: "Empleado" })).toBeVisible();
    await contractDialog.getByRole("button", { name: "Cerrar" }).click();

    await page.goto("/dashboard/cajas/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Abrir Nueva Caja" })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Abrir Nueva Caja" }).click();
    const cashDialog = page.getByRole("dialog", { name: "Apertura de caja" });
    await expect(cashDialog).toBeVisible();
    expect(
      await cashDialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
      }),
    ).toBe(true);
    await cashDialog.getByRole("button", { name: "Cerrar" }).click();

    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto("/demo/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-erp-theme",
      /.+/,
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("erp-dashboard-theme")),
      )
      .toBe("light");

    await page.goto("/dashboard/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Verificando autenticación...")).toBeHidden({
      timeout: 30000,
    });
    await expect(page.locator("html")).toHaveAttribute(
      "data-erp-theme",
      "light",
    );
  });
});
