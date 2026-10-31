import { expect, test } from "@playwright/test";
import { doble, sesion, uuid } from "./helpers/supply-feature";

for (const mobile of [false, true])
  test(`Feature expediente: pedidos y adjuntos privados ${mobile ? "móvil" : "escritorio"}`, async ({
    context,
    page,
  }, info) => {
    test.setTimeout(150000);
    page.setDefaultTimeout(20000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await sesion(context, page);
    await page.addInitScript(
      (theme) => localStorage.setItem("erp-dashboard-theme", theme),
      mobile ? "dark" : "light",
    );
    const api = await doble(page, { expediente: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard/ventas/contratos/");
    await page.getByRole("button", { name: /SUP-001.*Activo/ }).click();
    const orders = page.getByRole("region", {
      name: "Pedidos operativos del contrato",
    });
    await expect(
      orders.getByText("Aún no hay pedidos vinculados.", { exact: true }),
    ).toBeVisible();
    await orders
      .getByRole("button", { name: "Vincular pedido", exact: true })
      .click();
    await orders
      .getByRole("button", { name: "Buscar pedidos", exact: true })
      .click();
    await orders
      .getByLabel("Pedido pendiente", { exact: true })
      .selectOption(uuid(40));
    await orders
      .getByLabel("Programación de la línea 1", { exact: true })
      .selectOption(uuid(9));
    await orders
      .getByLabel("Motivo del vínculo", { exact: true })
      .fill("Asignación a cronograma del cliente");
    await page.screenshot({
      path: info.outputPath(`vinculo-${mobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
    await orders
      .getByRole("button", { name: "Confirmar vínculo", exact: true })
      .click();
    await expect(
      page.getByText("Confirmación del vínculo perdida.", { exact: true }),
    ).toBeVisible();
    await expect(
      orders.getByLabel("Motivo del vínculo", { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar operación", exact: true })
      .click();
    await expect(
      orders.getByRole("link", { name: "PV-2026-0040", exact: true }),
    ).toBeVisible();
    expect(api.orderIntents).toHaveLength(2);
    expect(api.orderIntents[0]).toEqual(api.orderIntents[1]);
    await orders
      .getByRole("link", { name: "PV-2026-0040", exact: true })
      .click();
    const origin = page.getByRole("region", {
      name: "Origen contractual del pedido",
    });
    await expect(page).toHaveURL(new RegExp(`/ventas/pedidos/${uuid(40)}`), {
      timeout: 25000,
    });
    await expect(origin).toContainText("OC-001", { timeout: 25000 });
    await page.screenshot({
      path: info.outputPath(`origen-${mobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
    await origin
      .getByRole("link", { name: "Contrato SUP-001", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "SUP-001 · Suministro programado local",
        exact: true,
      }),
    ).toBeVisible();

    await orders
      .getByRole("button", { name: "Desvincular PV-2026-0040", exact: true })
      .click();
    await orders
      .getByLabel("Motivo de desvinculación", { exact: true })
      .fill("Corregir cantidades del pedido pendiente");
    await orders
      .getByRole("button", { name: "Confirmar desvinculación", exact: true })
      .click();
    await expect(
      orders.getByText("Desvinculado", { exact: true }),
    ).toBeVisible();
    const files = page.getByRole("region", { name: "Adjuntos del expediente" });
    await files
      .getByRole("button", { name: "Adjuntar documento", exact: true })
      .click();
    await files
      .getByLabel("Documento asociado", { exact: true })
      .selectOption(`OC:${uuid(7)}`);
    await files
      .getByLabel("Archivo del expediente", { exact: true })
      .setInputFiles({
        name: "Contrato.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7\nContrato privado de prueba\n%%EOF"),
      });
    await files
      .getByRole("button", { name: "Guardar adjunto", exact: true })
      .click();
    await expect(
      page.getByText("Confirmación del archivo perdida.", { exact: true }),
    ).toBeVisible();
    await expect(
      files.getByLabel("Archivo del expediente", { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar operación", exact: true })
      .click();
    await expect(
      files.getByText("Contrato.pdf", { exact: true }),
    ).toBeVisible();
    expect(api.uploads).toHaveLength(2);
    expect(api.uploads[0]).toEqual(api.uploads[1]);
    expect(api.uploads[0].file).toContain("Contrato privado de prueba");
    expect(api.uploads[0].target).toBe(uuid(7));
    await files
      .getByRole("button", {
        name: "Obtener enlace de Contrato.pdf",
        exact: true,
      })
      .click();
    await expect(
      files.getByRole("link", { name: "Descargar Contrato.pdf", exact: true }),
    ).toHaveAttribute("href", /private-download/);
    await page.screenshot({
      path: info.outputPath(`expediente-${mobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
    await files
      .getByRole("button", { name: "Retirar Contrato.pdf", exact: true })
      .click();
    await files
      .getByLabel("Motivo de retiro del archivo", { exact: true })
      .fill("Se adjuntará versión corregida del contrato");
    await files
      .getByRole("button", { name: "Confirmar retiro de adjunto", exact: true })
      .click();
    await expect(files.getByText(/OC OC-001.*Retirado/)).toBeVisible();
    await expect(
      files.getByRole("link", { name: "Descargar Contrato.pdf", exact: true }),
    ).toHaveCount(0);
    await page.locator("details summary").click();
    await expect(page.locator("details")).toContainText("Documento adjuntado");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
