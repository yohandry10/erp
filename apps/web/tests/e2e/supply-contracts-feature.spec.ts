import { expect, test } from "@playwright/test";
import { doble, sesion, user, uuid } from "./helpers/supply-feature";

for (const mobile of [false, true]) {
  test(`Feature suministro: contrato, OC, recuperación y reprogramación ${mobile ? "móvil" : "escritorio"}`, async ({
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
    const api = await doble(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/dashboard/ventas/contratos/");
    const main = page.getByRole("main").filter({
      has: page.getByRole("heading", {
        name: "Contratos de suministro",
        exact: true,
      }),
    });
    await expect(
      main.getByRole("heading", { name: "Aún no hay contratos" }),
    ).toBeVisible();
    await main
      .getByRole("button", { name: "Nuevo contrato", exact: true })
      .click();
    await page
      .getByLabel("Número del contrato", { exact: true })
      .fill("SUP-001");
    await page
      .getByLabel("Objeto del contrato", { exact: true })
      .fill("Suministro programado local");
    for (const [label, value] of [
      ["Cliente", uuid(3)],
      ["Responsable", user.id],
      ["Producto de la línea 1", uuid(4)],
    ]) {
      await page
        .getByRole("button", {
          name: `Buscar ${label.toLowerCase()}`,
          exact: true,
        })
        .click();
      await page
        .getByLabel(`Seleccionar ${label.toLowerCase()}`, { exact: true })
        .selectOption(value);
    }
    await page.getByLabel("Vigencia desde", { exact: true }).fill("2026-01-01");
    await page.getByLabel("Vigencia hasta", { exact: true }).fill("2026-12-31");
    await page
      .getByLabel("Cantidad de la línea 1", { exact: true })
      .fill("100");
    await page
      .getByLabel("Precio sin impuestos de la línea 1", { exact: true })
      .fill("12.345678");
    await page
      .getByRole("button", { name: "Guardar borrador", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "SUP-001 · Suministro programado local",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Activar contrato", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar activación", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Registrar OC del cliente", exact: true })
      .click();
    await page.getByLabel("Número de OC", { exact: true }).fill("OC-001");
    await page
      .getByLabel("Fecha de emisión de OC", { exact: true })
      .fill("2026-10-27");
    await page.getByLabel("Cantidad OC SKU-1", { exact: true }).fill("60");
    await page
      .getByRole("button", { name: "Registrar OC", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Programar entrega", exact: true })
      .click();
    await page.getByLabel("Línea de OC", { exact: true }).selectOption(uuid(8));
    await page.getByLabel("Cantidad a programar", { exact: true }).fill("40");
    await page
      .getByLabel("Fecha programada", { exact: true })
      .fill("2026-11-10");
    await page
      .getByLabel("Destino de entrega", { exact: true })
      .fill("Almacén del cliente");
    await page
      .getByRole("button", { name: "Guardar entrega", exact: true })
      .click();
    await expect(
      page.getByText("Se perdió la confirmación de la entrega.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nuevo contrato", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar operación", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reprogramar", exact: true }),
    ).toBeVisible();
    expect(api.schedules).toHaveLength(2);
    expect(api.schedules[0]).toEqual(api.schedules[1]);
    await page
      .getByRole("button", { name: "Reprogramar", exact: true })
      .click();
    await page
      .getByLabel("Nueva fecha de entrega", { exact: true })
      .fill("2026-11-15");
    await page
      .getByLabel("Motivo", { exact: true })
      .fill("Cambio solicitado por el cliente");
    await page
      .getByRole("button", { name: "Guardar reprogramación", exact: true })
      .click();
    await expect(
      page.getByText("Fecha original: 10/11/2026", { exact: true }),
    ).toBeVisible();
    await page.getByText("Historial del contrato (5)", { exact: true }).click();
    await expect(
      page.getByText("Cambio solicitado por el cliente", { exact: true }),
    ).toBeVisible();
    await expect(
      mobile
        ? page.getByRole("list", { name: "Cantidades por producto" })
        : page.getByRole("table"),
    ).toContainText("12.345678");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`suministro-${mobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
    // Una actualización vuelve a tomar la versión de la programación que otro
    // usuario modificó; el formulario no conserva el objeto anterior en memoria.
    await page
      .getByRole("button", { name: "Reprogramar", exact: true })
      .click();
    api.externalReprogram();
    // El expediente también tiene "Actualizar" en entregas y estado de cuenta; éste es el de la lista.
    await page.getByRole("button", { name: "Actualizar", exact: true }).first().click();
    await expect(
      page.getByLabel("Nueva fecha de entrega", { exact: true }),
    ).toHaveValue("2026-11-20");
    await page
      .getByLabel("Motivo", { exact: true })
      .fill("Se confirma la nueva fecha consultada");
    await page
      .getByRole("button", { name: "Guardar reprogramación", exact: true })
      .click();
    await expect(
      page.getByText("Entrega reprogramada", { exact: true }).first(),
    ).toBeVisible();
    expect(api.reprograms.at(-1)?.version).toBe(3);
    await page
      .getByRole("button", { name: "Registrar adenda", exact: true })
      .click();
    await page
      .getByLabel("Referencia del documento de cambio", { exact: true })
      .fill("AD-001");
    await page
      .getByLabel("Motivo del cambio", { exact: true })
      .fill("Ampliación acordada con el cliente");
    await page
      .getByLabel("Nueva vigencia hasta", { exact: true })
      .fill("2027-03-31");
    await page
      .getByLabel("Cantidad adenda línea 1", { exact: true })
      .fill("120");
    await page
      .getByLabel("Precio adenda línea 1", { exact: true })
      .fill("20.123456");
    expect(
      await page.getByLabel("Cantidad adenda línea 1").getAttribute("min"),
    ).toBe("60");
    await page.screenshot({
      path: info.outputPath(`adenda-form-${mobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Confirmar adenda", exact: true })
      .click();
    await expect(
      page.getByText("Se perdió la confirmación de la adenda.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Precio adenda línea 1")).toBeDisabled();
    await page
      .getByRole("button", { name: "Reintentar operación", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Registrar adenda", exact: true }),
    ).toBeVisible();
    expect(api.revisions).toHaveLength(2);
    expect(api.revisions[0]).toEqual(api.revisions[1]);
    await expect(page.getByRole("heading", { name: /SUP-001/ })).toBeVisible();
    const orderSection = page
      .getByRole("heading", { name: "OC del cliente", exact: true })
      .locator("..");
    await expect(orderSection).toContainText("12.345678");
    await expect(
      mobile
        ? page.getByRole("list", { name: "Cantidades por producto" })
        : page.getByRole("table"),
    ).toContainText("20.123456");
    await page
      .getByRole("button", { name: "Modificar OC OC-001", exact: true })
      .click();
    await page
      .getByLabel("Referencia del documento de cambio", { exact: true })
      .fill("MOD-001");
    await page
      .getByLabel("Motivo del cambio", { exact: true })
      .fill("Reducción de cantidades solicitada");
    await page.getByLabel("Cantidad OC SKU-1", { exact: true }).fill("50");
    await page
      .getByRole("button", {
        name: "Confirmar modificación de OC",
        exact: true,
      })
      .click();
    await expect(orderSection).toContainText("50 en OC");
    await expect(orderSection).toContainText("12.345678");
    await page
      .getByRole("button", { name: "Anular OC OC-001", exact: true })
      .click();
    await expect(
      page.getByText(
        "Anule primero las entregas programadas vigentes de esta OC.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Confirmar anulación de OC",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Volver al contrato", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Anular programación", exact: true })
      .click();
    await page
      .getByLabel("Motivo", { exact: true })
      .fill("Cliente cancela la entrega programada");
    await page
      .getByRole("button", { name: "Confirmar anulación", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Anular OC OC-001", exact: true })
      .click();
    await page
      .getByLabel("Referencia del documento de cambio", { exact: true })
      .fill("AN-001");
    await page
      .getByLabel("Motivo del cambio", { exact: true })
      .fill("Cliente cancela la OC recibida");
    await page
      .getByRole("button", { name: "Confirmar anulación de OC", exact: true })
      .click();
    await expect(orderSection).toContainText("Anulada");
    await expect(
      page.getByRole("button", { name: "Modificar OC OC-001", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Programar entrega", exact: true }),
    ).toBeDisabled();
    const history = page
      .locator("details")
      .filter({ has: page.getByText(/Historial del contrato/) });
    await expect(history).toContainText("Documento: AD-001");
    await expect(history).toContainText("Documento: MOD-001");
    await expect(history).toContainText("Documento: AN-001");
    await expect(history).toContainText("precio 12.345678 → 20.123456");
    await history.locator("summary").click();
    await expect(
      history.getByText("Documento: AD-001", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`revisiones-${mobile ? "mobile" : "desktop"}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("Feature suministro: una lectura caída permite reintentar y el lector no recibe controles de escritura", async ({
  context,
  page,
}) => {
  await sesion(context, page);
  const api = await doble(page, { readOnly: true, listFailure: true });
  await page.goto("/dashboard/ventas/contratos/");
  await page.getByRole("button", { name: "Ventas", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Contratos de suministro", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/No se pudo consultar los contratos.*Pulse Actualizar/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aún no hay contratos" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nuevo contrato", exact: true }),
  ).toHaveCount(0);
  api.restoreList();
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aún no hay contratos" }),
  ).toBeVisible();
  expect(api.mutationPaths).toHaveLength(0);
});
