import { expect, test } from "@playwright/test";
import { doble, sesion } from "./helpers/supply-feature";

for (const mobile of [false, true])
  test(`Feature capacitación: ciclo de suministro por función y fichas de pantallas ${mobile ? "móvil" : "escritorio"}`, async ({ context, page }) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(30000);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await sesion(context, page);
    await page.addInitScript((theme) => localStorage.setItem("erp-dashboard-theme", theme), mobile ? "dark" : "light");
    await doble(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/ayuda/", { timeout: 90000 });

    const perfiles = page.getByRole("tablist", { name: "Perfiles" });
    await expect(perfiles.getByRole("tab")).toHaveText([
      "Responsable de suministro", "Almacén", "Finanzas", "Gerencia", "Administrador",
    ]);
    const panel = page.getByRole("tabpanel", { name: "Responsable de suministro" });
    await expect(panel.getByRole("listitem")).toHaveCount(7);
    await expect(panel.getByText("Perfil del sistema: SUMINISTRO")).toBeVisible();
    await perfiles.getByRole("tab", { name: "Almacén" }).click();
    const almacen = page.getByRole("tabpanel", { name: "Almacén" });
    await expect(almacen.getByRole("listitem").first()).toContainText("Recibir mercadería con lote y vencimiento");
    await expect(almacen.getByRole("link", { name: "Lotes" })).toHaveAttribute("href", /\/dashboard\/inventario\/lotes\/?$/);
    await perfiles.getByRole("tab", { name: "Gerencia" }).click();
    await expect(page.getByRole("tabpanel", { name: "Gerencia" })).toContainText("calculadas por otra persona");

    const fichas = page.getByTestId("module-guide-entry");
    for (const titulo of ["Contratos de suministro", "Lotes y vencimientos", "Alertas de suministro", "Tablero de suministro", "Migración desde otro sistema"])
      await expect(fichas.filter({ hasText: titulo })).toHaveCount(1);
    await fichas.filter({ hasText: "Tablero de suministro" }).click();
    await expect(page.getByText("Excel y Power BI leen el mismo corte que la pantalla, por eso cuadran")).toBeVisible();
    await page.screenshot({ path: `../../artifacts/suministro-f10-implantacion/browser/${mobile ? "movil" : "escritorio"}-capacitacion.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
