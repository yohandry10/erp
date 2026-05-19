import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login } from './helpers/auth';

const authenticatedRoutes = [
  '/dashboard',
  '/dashboard/pos',
  '/dashboard/documentos',
  '/dashboard/documentos/descargas',
  '/dashboard/contabilidad',
  '/dashboard/contabilidad/asientos',
  '/dashboard/contabilidad/asientos/nuevo',
  '/dashboard/contabilidad/centros-costo',
  '/dashboard/contabilidad/centros-costo/nuevo',
  '/dashboard/contabilidad/estados',
  '/dashboard/contabilidad/monitoreo',
  '/dashboard/contabilidad/periodos',
  '/dashboard/contabilidad/periodos/nuevo',
  '/dashboard/contabilidad/presupuestos',
  '/dashboard/contabilidad/presupuestos/alertas',
  '/dashboard/contabilidad/presupuestos/comparacion',
  '/dashboard/contabilidad/presupuestos/lista',
  '/dashboard/contabilidad/presupuestos/nuevo',
  '/dashboard/analytics',
  '/dashboard/audit-logs',
  '/dashboard/ayuda',
  '/dashboard/cajas',
  '/dashboard/compras',
  '/dashboard/compras/proveedores',
  '/dashboard/compras/proveedores/nuevo',
  '/dashboard/compras/ordenes',
  '/dashboard/compras/ordenes/nueva',
  '/dashboard/compras/cotizaciones',
  '/dashboard/compras/cotizaciones/nueva',
  '/dashboard/compras/devoluciones',
  '/dashboard/compras/devoluciones/nueva',
  '/dashboard/compras/recepciones',
  '/dashboard/compras/recepciones/nueva',
  '/dashboard/cpe',
  '/dashboard/cpe/cotizaciones',
  '/dashboard/gre',
  '/dashboard/sire',
  '/dashboard/inventario',
  '/dashboard/inventario/almacenes',
  '/dashboard/inventario/kardex',
  '/dashboard/inventario/logistica/listo-despacho',
  '/dashboard/inventario/logistica/ordenes-pendientes',
  '/dashboard/inventario/productos',
  '/dashboard/inventario/productos/nuevo',
  '/dashboard/inventario/recepciones',
  '/dashboard/finanzas/bancos',
  '/dashboard/finanzas/bancos/nueva',
  '/dashboard/finanzas/conciliacion',
  '/dashboard/finanzas/cxc',
  '/dashboard/finanzas/cxp',
  '/dashboard/finanzas/reportes',
  '/dashboard/finanzas/tesoreria',
  '/dashboard/finanzas/tesoreria/flujo-caja',
  '/dashboard/finanzas/tesoreria/lote',
  '/dashboard/finanzas/tesoreria/programacion',
  '/dashboard/rrhh',
  '/dashboard/rrhh/asistencia',
  '/dashboard/rrhh/candidatos',
  '/dashboard/rrhh/contratos',
  '/dashboard/rrhh/pagos',
  '/dashboard/rrhh/planillas',
  '/dashboard/rrhh/reportes',
  '/dashboard/usuarios',
  '/dashboard/ventas',
  '/dashboard/ventas/aprobaciones',
  '/dashboard/ventas/clientes',
  '/dashboard/ventas/clientes/nuevo',
  '/dashboard/ventas/cotizaciones',
  '/dashboard/ventas/cotizaciones/nueva',
  '/dashboard/ventas/pedidos',
  '/dashboard/ventas/pedidos/nuevo',
  '/dashboard/ventas/reportes',
  '/dashboard/wizard',
] as const;

const viewportMatrix = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'narrow', width: 390, height: 844 },
] as const;

const routeTitles: Record<(typeof authenticatedRoutes)[number], RegExp> = {
  '/dashboard': /Dashboard/i,
  '/dashboard/pos': /POS|Punto de Venta/i,
  '/dashboard/documentos': /Documentos/i,
  '/dashboard/documentos/descargas': /Descargas|Documentos/i,
  '/dashboard/contabilidad': /Contabilidad/i,
  '/dashboard/contabilidad/asientos': /Asientos/i,
  '/dashboard/contabilidad/asientos/nuevo': /Asiento|Nuevo/i,
  '/dashboard/contabilidad/centros-costo': /Centros de Costo|Centro/i,
  '/dashboard/contabilidad/centros-costo/nuevo': /Centro de Costo|Nuevo/i,
  '/dashboard/contabilidad/estados': /Estados Financieros|Balance|Resultados/i,
  '/dashboard/contabilidad/monitoreo': /Monitoreo|Contabilidad/i,
  '/dashboard/contabilidad/periodos': /Periodos|Períodos/i,
  '/dashboard/contabilidad/periodos/nuevo': /Periodo|Período|Nuevo/i,
  '/dashboard/contabilidad/presupuestos': /Presupuestos/i,
  '/dashboard/contabilidad/presupuestos/alertas': /Alertas|Presupuestos/i,
  '/dashboard/contabilidad/presupuestos/comparacion': /Comparaci[oó]n|Presupuesto/i,
  '/dashboard/contabilidad/presupuestos/lista': /Presupuestos|Lista/i,
  '/dashboard/contabilidad/presupuestos/nuevo': /Presupuesto|Nuevo/i,
  '/dashboard/analytics': /Analytics|Analítica|Analitica/i,
  '/dashboard/audit-logs': /Auditor[ií]a|Audit/i,
  '/dashboard/ayuda': /Ayuda/i,
  '/dashboard/cajas': /Cajas|Caja/i,
  '/dashboard/compras': /Compras/i,
  '/dashboard/compras/proveedores': /Proveedores/i,
  '/dashboard/compras/proveedores/nuevo': /Proveedor|Nuevo/i,
  '/dashboard/compras/ordenes': /[ÓO]rdenes|Compra/i,
  '/dashboard/compras/ordenes/nueva': /Orden|Compra|Nueva/i,
  '/dashboard/compras/cotizaciones': /Cotizaciones/i,
  '/dashboard/compras/cotizaciones/nueva': /Cotizaci[oó]n|Nueva/i,
  '/dashboard/compras/devoluciones': /Devoluciones/i,
  '/dashboard/compras/devoluciones/nueva': /Devoluci[oó]n|Nueva/i,
  '/dashboard/compras/recepciones': /Recepciones/i,
  '/dashboard/compras/recepciones/nueva': /Recepci[oó]n|Nueva/i,
  '/dashboard/cpe': /CPE|Comprobantes/i,
  '/dashboard/cpe/cotizaciones': /Cotizaciones|CPE/i,
  '/dashboard/gre': /GRE|Gu[ií]as/i,
  '/dashboard/sire': /SIRE|Reportes/i,
  '/dashboard/inventario': /Inventario/i,
  '/dashboard/inventario/almacenes': /Almacenes/i,
  '/dashboard/inventario/kardex': /Kardex/i,
  '/dashboard/inventario/logistica/listo-despacho': /Listo para Despacho|Despacho/i,
  '/dashboard/inventario/logistica/ordenes-pendientes': /[ÓO]rdenes de Preparaci[oó]n|Preparaci[oó]n/i,
  '/dashboard/inventario/productos': /Productos/i,
  '/dashboard/inventario/productos/nuevo': /Producto|Nuevo/i,
  '/dashboard/inventario/recepciones': /Recepciones/i,
  '/dashboard/finanzas/bancos': /Bancos|Cuentas Bancarias/i,
  '/dashboard/finanzas/bancos/nueva': /Cuenta Bancaria|Nueva/i,
  '/dashboard/finanzas/conciliacion': /Conciliaci[oó]n/i,
  '/dashboard/finanzas/cxc': /Cuentas por Cobrar|CxC/i,
  '/dashboard/finanzas/cxp': /Cuentas por Pagar|CxP/i,
  '/dashboard/finanzas/reportes': /Reportes|Finanzas/i,
  '/dashboard/finanzas/tesoreria': /Tesorer[ií]a/i,
  '/dashboard/finanzas/tesoreria/flujo-caja': /Flujo de Caja/i,
  '/dashboard/finanzas/tesoreria/lote': /Lote|Pago/i,
  '/dashboard/finanzas/tesoreria/programacion': /Programaci[oó]n|Pagos/i,
  '/dashboard/rrhh': /RRHH|Recursos Humanos/i,
  '/dashboard/rrhh/asistencia': /Asistencia/i,
  '/dashboard/rrhh/candidatos': /Candidatos/i,
  '/dashboard/rrhh/contratos': /Contratos/i,
  '/dashboard/rrhh/pagos': /Pagos/i,
  '/dashboard/rrhh/planillas': /Planillas/i,
  '/dashboard/rrhh/reportes': /Reportes RRHH|Recursos Humanos/i,
  '/dashboard/usuarios': /Usuarios/i,
  '/dashboard/ventas': /Ventas/i,
  '/dashboard/ventas/aprobaciones': /Aprobaciones/i,
  '/dashboard/ventas/clientes': /Clientes/i,
  '/dashboard/ventas/clientes/nuevo': /Cliente|Nuevo/i,
  '/dashboard/ventas/cotizaciones': /Cotizaciones/i,
  '/dashboard/ventas/cotizaciones/nueva': /Cotizaci[oó]n|Nueva/i,
  '/dashboard/ventas/pedidos': /Pedidos/i,
  '/dashboard/ventas/pedidos/nuevo': /Pedido|Nuevo/i,
  '/dashboard/ventas/reportes': /Reportes|Ventas/i,
  '/dashboard/wizard': /Configuraci[oó]n|Wizard|Asistente/i,
};

const routeErrorPatterns = [
  /Unhandled Runtime Error/i,
  /Application error/i,
  /Internal Server Error/i,
  /Cannot find module/i,
  /ChunkLoadError/i,
  /Hydration failed/i,
  /404\s*[:|-]?\s*(This page could not be found|Página no encontrada|Not Found)/i,
  /This page could not be found/i,
  /Página no encontrada/i,
] as const;

const permanentLoaderPattern =
  /Verificando autenticaci[oó]n|Redirigiendo|Cargando pa[ií]s configurado|Cargando datos del dashboard|Cargando\.\.\.|Loading\.\.\./i;

const safeButtonNames = [
  'Actualizar',
  'Actualizar datos',
  'Buscar',
  'Limpiar',
  'Limpiar filtros',
  'Cancelar',
  'Cerrar',
  'Volver',
  'Siguiente',
  'Anterior',
  'Saltar',
] as const;

const legitimatelyDisableableButtonNames = [
  'Anterior',
  'Siguiente',
] as const;

const stateDisabledButtonRules = [
  {
    route: '/dashboard/pos',
    name: '📋 Factura',
    titlePattern: /Factura requiere cliente con RUC/i,
  },
  {
    route: '/dashboard/gre',
    name: 'PDF',
    titlePattern: /PDF GRE no disponible/i,
  },
] as const;

const guardedButtonPattern =
  /guardar|crear|registrar|eliminar|anular|confirmar|aprobar|rechazar|pagar|cobrar|cobro|nota|reprogramar|procesar|enviar|emitir|firmar|importar|exportar|descargar|subir|generar|calcular|seleccionar|cerrar caja|abrir caja/i;

const buttonInventoryDir = path.join(__dirname, 'artifacts', 'button-inventory');
const routeStart = Number.parseInt(process.env.SMOKE_ROUTE_START || '0', 10);
const routeEnd = Number.parseInt(process.env.SMOKE_ROUTE_END || String(authenticatedRoutes.length), 10);
const selectedRoutes = authenticatedRoutes.slice(routeStart, routeEnd);

function routeToFileName(route: string): string {
  return `${route.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]+/g, '_') || 'root'}.json`;
}

test.describe('Full authenticated UI smoke', () => {
  test.beforeAll(() => {
    if (process.env.PRESERVE_BUTTON_INVENTORY !== 'true') {
      fs.rmSync(buttonInventoryDir, { recursive: true, force: true });
    }
    fs.mkdirSync(buttonInventoryDir, { recursive: true });
  });

  for (const viewport of viewportMatrix) {
    test.describe(`${viewport.name} viewport`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      for (const route of selectedRoutes) {
        test(`loads ${route} without crashing`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedResponses: string[] = [];
      const routeResponseStatuses: string[] = [];

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });
      page.on('response', (response) => {
        if (response.status() >= 500) {
          failedResponses.push(`${response.status()} ${response.url()}`);
        }
      });
      page.on('pageerror', (error) => {
        consoleErrors.push(error.message);
      });

      await login(page);

      const initialResponse = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (initialResponse) {
        routeResponseStatuses.push(`${initialResponse.status()} ${initialResponse.url()}`);
        expect(
          initialResponse.status(),
          `${route} debe cargar una ruta real, no error HTTP`,
        ).toBeLessThan(400);
      }
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).toContainText(/\S/, { timeout: 15000 });
      await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

      const bodyText = await page.locator('body').innerText({ timeout: 15000 });
      const mainText = await page.locator('main').innerText({ timeout: 15000 });
      expect(mainText.trim().length, `${route} debe renderizar contenido util en main`).toBeGreaterThan(40);
      expect(bodyText, `${route} debe mostrar un titulo real`).toMatch(routeTitles[route]);
      expect(bodyText, `${route} no debe quedarse con loaders permanentes`).not.toMatch(permanentLoaderPattern);
      for (const errorPattern of routeErrorPatterns) {
        expect(bodyText, `${route} rendered a fatal error matching ${errorPattern}`).not.toMatch(errorPattern);
      }

      const visibleButtons = page.getByRole('button').filter({ visible: true });
      const buttonCount = await visibleButtons.count();
      const routeButtonInventory: Array<{
        index: number;
        name: string;
        enabled: boolean;
        clickPolicy: 'safe-clicked-when-unique' | 'guarded-not-auto-clicked' | 'state-disabled-not-clicked';
      }> = [];

      for (let index = 0; index < buttonCount; index += 1) {
        const button = visibleButtons.nth(index);
        const buttonName = (await button.innerText().catch(() => '')).trim();
        const ariaLabel = (await button.getAttribute('aria-label').catch(() => null))?.trim();
        const title = (await button.getAttribute('title').catch(() => null))?.trim();
        const name = buttonName || ariaLabel || title || '';
        const enabled = await button.isEnabled();

        expect(
          name,
          `${route} has a visible button without accessible text/name/title at index ${index}`,
        ).toBeTruthy();

        const isGuarded = guardedButtonPattern.test(name);
        const canBeDisabledByState = legitimatelyDisableableButtonNames.includes(
          name as (typeof legitimatelyDisableableButtonNames)[number],
        );
        const hasDocumentedStateDisableRule = stateDisabledButtonRules.some((rule) =>
          rule.route === route && rule.name === name && rule.titlePattern.test(title || ''),
        );
        if (!enabled && !isGuarded && !canBeDisabledByState && !hasDocumentedStateDisableRule) {
          await expect(button, `${route} button "${name}" should be enabled`).toBeEnabled();
        }

        routeButtonInventory.push({
          index,
          name,
          enabled,
          clickPolicy: hasDocumentedStateDisableRule
            ? 'state-disabled-not-clicked'
            : safeButtonNames.includes(name as (typeof safeButtonNames)[number]) && !guardedButtonPattern.test(name)
            ? 'safe-clicked-when-unique'
            : 'guarded-not-auto-clicked',
        });
      }

      fs.writeFileSync(
        path.join(buttonInventoryDir, routeToFileName(route)),
        `${JSON.stringify({ route, buttonCount, buttons: routeButtonInventory }, null, 2)}\n`,
        'utf8',
      );

      for (const name of safeButtonNames) {
        const button = page.getByRole('button', { name, exact: true }).filter({ visible: true });
        if ((await button.count()) === 1 && (await button.isEnabled())) {
          const beforeUrl = page.url();
          try {
            await button.click({ timeout: 5000 });
          } catch (error) {
            if (page.url() !== beforeUrl || !(await button.isVisible().catch(() => false))) {
              break;
            }
            throw error;
          }
          await page.keyboard.press('Escape').catch(() => undefined);
          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
          if (page.url() !== beforeUrl) {
            break;
          }
        }
      }

      expect(failedResponses, `${route} returned server errors`).toEqual([]);
      expect(
        consoleErrors.filter((message) => !message.includes('Download the React DevTools')),
        `${route} emitted browser console/page errors`,
      ).toEqual([]);
        });
      }
    });
  }
});
