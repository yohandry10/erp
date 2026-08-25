import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { SignJWT } from 'jose';

const user = {
  id: 'cajas-cierre-518-user',
  email: 'cajas-cierre-518@erp.local',
  nombre: 'QA',
  apellido: 'Caja',
  roles: ['ADMIN'],
  tenant_id: 'cajas-cierre-518-tenant',
  is_super_admin: true,
};

type Scenario = {
  preview: 'legal' | 'unmatched' | 'supervisor' | 'error';
  closeStatus?: number;
  supervisorsStatus?: number;
};

async function openCashClosing(
  context: BrowserContext,
  page: Page,
  scenario: Scenario,
) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de Caja');

  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret));

  await context.addCookies([{
    name: 'access_token',
    value: token,
    url: process.env.BASE_URL || 'http://localhost:3001',
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  const closeBodies: any[] = [];
  const pinBodies: any[] = [];
  const pinIdempotencyKeys: string[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user);
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({
        data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', monedaDefecto: 'PEN' },
      });
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: false, is_expired: false });
    }
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({ data: [] });
    }
    if (/\/api\/cajas\/sesiones\/?$/.test(pathname)) {
      return json({
        success: true,
        data: [{
          id: 'sesion-cierre-518',
          estado: 'ABIERTA',
          hora_apertura: '2026-08-25T13:00:00-05:00',
          monto_inicio: ['legal', 'unmatched'].includes(scenario.preview) ? 203.84 : 100,
          usuario: { nombres: 'Cajero', apellidos: 'QA' },
          caja: { nombre: 'Caja QA 518', codigo: 'CAJA-QA-518' },
        }],
      });
    }
    if (/\/api\/cajas\/cortes\/?$/.test(pathname)) {
      return json({ success: true, data: [] });
    }
    if (/\/api\/cajas\/movimientos\/sesion-cierre-518\/?$/.test(pathname)) {
      return json({ success: true, data: [] });
    }
    if (/\/api\/cajas\/validar-precierre\/sesion-cierre-518\/?$/.test(pathname)) {
      return json({ success: true, data: { valido: true, errores: [], warnings: [] } });
    }
    if (/\/api\/cajas\/saldo-esperado\/sesion-cierre-518\/?$/.test(pathname)) {
      return json({
        success: true,
        data: { saldo: ['legal', 'unmatched'].includes(scenario.preview) ? 203.84 : 100 },
      });
    }
    if (/\/api\/cajas\/validar-cierre\/sesion-cierre-518\/?$/.test(pathname)) {
      if (scenario.preview === 'error') {
        return json({ message: 'Configuración de tolerancia no disponible' }, 500);
      }
      const legal = scenario.preview === 'legal';
      const smallDifference = ['legal', 'unmatched'].includes(scenario.preview);
      return json({
        success: true,
        data: {
          saldo_teorico: smallDifference ? 203.84 : 100,
          saldo_real: smallDifference ? 203.80 : 99.90,
          diferencia: smallDifference ? -0.04 : -0.10,
          tipo_diferencia: legal ? 'REDONDEO_EFECTIVO_LEGAL' : 'FALTANTE',
          requiere_supervisor: !legal,
          requiere_justificacion: !legal,
          redondeo_efectivo_legal: legal,
          redondeo_efectivo_documentado: legal ? 0.04 : 0,
          redondeo_efectivo_cantidad: legal ? 1 : 0,
          tolerancia: 0,
        },
      });
    }
    if (/\/api\/cajas\/supervisores-gestion-pin\/?$/.test(pathname)) {
      return json({
        success: true,
        data: [{
          id: '51800000-0000-4000-8000-000000000009',
          nombre: 'Supervisor PIN QA',
          pin_registrado: false,
          pin_version: null,
          estado_pin: 'SIN_PIN',
          bloqueado_hasta: null,
        }],
      });
    }
    if (/\/api\/cajas\/supervisores\/51800000-0000-4000-8000-000000000009\/pin\/?$/.test(pathname)) {
      pinBodies.push(request.postDataJSON());
      pinIdempotencyKeys.push(request.headers()['idempotency-key'] || '');
      return json({
        success: true,
        data: {
          supervisor_id: '51800000-0000-4000-8000-000000000009',
          pin_version: 1,
        },
      });
    }
    if (/\/api\/cajas\/supervisores-autorizados\/sesion-cierre-518\/?$/.test(pathname)) {
      if (scenario.supervisorsStatus) {
        return json({ message: 'Directorio de supervisores no disponible' }, scenario.supervisorsStatus);
      }
      return json({
        success: true,
        data: [{ id: 'supervisor-518', nombre: 'Supervisor QA 518' }],
      });
    }
    if (/\/api\/cajas\/cerrar\/sesion-cierre-518\/?$/.test(pathname)) {
      closeBodies.push(request.postDataJSON());
      if (scenario.closeStatus) {
        return json(
          { message: 'PIN de supervisor inválido para este cierre' },
          scenario.closeStatus,
        );
      }
      return json({ success: true, data: { estado: 'CERRADA' } });
    }

    return json({ success: true, data: [] });
  });

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser });
    window.localStorage.setItem('erp.auth.session.snapshot', session);
    window.sessionStorage.setItem('erp.auth.session.snapshot', session);
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']));
    window.localStorage.setItem('selectedCountry', '1');
  }, user);

  await page.goto('/dashboard/cajas/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Gestión de Cajas' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByText('Caja QA 518', { exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar Caja' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cierre de caja' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmar Arqueo' })).toBeVisible();

  return { dialog, closeBodies, pinBodies, pinIdempotencyKeys, browserErrors };
}

async function countLegalRounding(dialog: Locator) {
  await dialog.getByRole('spinbutton', { name: 'Cantidad de billetes de S/ 200', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 2', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 1', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 0.5', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 0.2', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 0.1', exact: true }).fill('1');
}

async function countSupervisorDifference(dialog: Locator) {
  await dialog.getByRole('spinbutton', { name: 'Cantidad de billetes de S/ 50', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de billetes de S/ 20', exact: true }).fill('2');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 5', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 2', exact: true }).fill('2');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 0.5', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: 'Cantidad de monedas de S/ 0.2', exact: true }).fill('2');
}

test('S/ -0.04 muestra redondeo legal y cierra sin supervisor ni PIN', async ({ context, page }) => {
  const { dialog, closeBodies, browserErrors } = await openCashClosing(context, page, {
    preview: 'legal',
  });
  await countLegalRounding(dialog);
  await dialog.getByRole('button', { name: 'Confirmar Arqueo' }).click();

  await expect(dialog.getByText(/redondeo legal del pago en efectivo en Perú/i)).toBeVisible();
  await expect(dialog.getByLabel('Supervisor que autoriza')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Confirmar Cierre' }).click();
  await expect(dialog).not.toBeVisible();

  expect(closeBodies).toHaveLength(1);
  expect(closeBodies[0].monto_contado).toBe(203.8);
  expect(closeBodies[0]).not.toHaveProperty('supervisor_id');
  expect(closeBodies[0]).not.toHaveProperty('codigo_autorizacion');
  expect(browserErrors).toEqual([]);
});

test('S/ -0.04 sin evidencia documentada exige supervisor', async ({ context, page }) => {
  const { dialog, closeBodies } = await openCashClosing(context, page, {
    preview: 'unmatched',
  });
  await countLegalRounding(dialog);
  await dialog.getByRole('button', { name: 'Confirmar Arqueo' }).click();

  await expect(dialog.getByText(/redondeo legal del pago en efectivo en Perú/i)).toHaveCount(0);
  await dialog.getByRole('textbox', { name: /Justificación \/ Notas/ }).fill(
    'Diferencia pequeña sin evidencia de venta',
  );
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByLabel('Supervisor que autoriza')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmar Cierre' })).toBeDisabled();
  expect(closeBodies).toEqual([]);
});

test('administrador registra el PIN sin exponerlo de vuelta', async ({ context, page }) => {
  const { dialog, pinBodies, pinIdempotencyKeys } = await openCashClosing(context, page, { preview: 'legal' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Gestionar PIN supervisor' }).click();

  const pinDialog = page.getByRole('dialog', { name: 'PIN de supervisores' });
  await expect(pinDialog).toBeVisible();
  await pinDialog.getByLabel('PIN nuevo').fill('481590');
  await pinDialog.getByLabel('Confirmar PIN').fill('481590');
  await pinDialog.getByRole('button', { name: 'Registrar PIN' }).click();

  await expect(page.getByText('PIN registrado')).toBeVisible();
  expect(pinBodies).toEqual([{ pin: '481590' }]);
  expect(pinIdempotencyKeys).toHaveLength(1);
  expect(pinIdempotencyKeys[0]).not.toBe('');
});

test('S/ -0.10 exige justificación, supervisor/PIN y conserva el error backend', async ({ context, page }) => {
  const { dialog, closeBodies, browserErrors } = await openCashClosing(context, page, {
    preview: 'supervisor',
    closeStatus: 403,
  });
  await countSupervisorDifference(dialog);
  await dialog.getByRole('button', { name: 'Confirmar Arqueo' }).click();
  await dialog.getByRole('textbox', { name: /Justificación \/ Notas/ }).fill(
    'Diferencia revisada por supervisor',
  );
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await dialog.getByLabel('Supervisor que autoriza').selectOption('supervisor-518');
  await dialog.getByLabel('PIN del supervisor').fill('481590');
  await dialog.getByRole('button', { name: 'Confirmar Cierre' }).click();

  await expect(dialog.getByText('PIN de supervisor inválido para este cierre')).toBeVisible();
  await expect(dialog).toBeVisible();
  expect(closeBodies).toHaveLength(1);
  expect(closeBodies[0]).toEqual(expect.objectContaining({
    monto_contado: 99.9,
    notas: 'Diferencia revisada por supervisor',
    supervisor_id: 'supervisor-518',
    codigo_autorizacion: '481590',
  }));
  // El 403 simulado aparece como resource error del navegador y como el
  // console.error controlado del componente; no debe haber otro fallo JS.
  expect(browserErrors.filter((entry) =>
    !entry.includes('PIN de supervisor inválido')
    && !entry.includes('status of 403'),
  )).toEqual([]);
});

test('un fallo del preview conserva el paso de conteo y muestra la causa', async ({ context, page }) => {
  const { dialog, closeBodies, browserErrors } = await openCashClosing(context, page, {
    preview: 'error',
  });
  await countSupervisorDifference(dialog);
  await dialog.getByRole('button', { name: 'Confirmar Arqueo' }).click();

  await expect(dialog.getByText('Configuración de tolerancia no disponible')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmar Arqueo' })).toBeVisible();
  expect(closeBodies).toEqual([]);
  expect(browserErrors.length).toBeGreaterThan(0);
  expect(browserErrors.every((entry) => entry.includes('status of 500'))).toBe(true);
});

test('distingue directorio indisponible de ausencia real de supervisores', async ({ context, page }) => {
  const { dialog, closeBodies, browserErrors } = await openCashClosing(context, page, {
    preview: 'supervisor',
    supervisorsStatus: 500,
  });
  await countSupervisorDifference(dialog);
  await dialog.getByRole('button', { name: 'Confirmar Arqueo' }).click();
  await dialog.getByRole('textbox', { name: /Justificación \/ Notas/ }).fill('Revisión pendiente');
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  await expect(dialog.getByText(/No se pudo consultar a los supervisores habilitados/)).toBeVisible();
  await expect(dialog.getByText(/No hay supervisores con PIN vigente/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Confirmar Cierre' })).toBeDisabled();
  expect(closeBodies).toEqual([]);
  expect(browserErrors.length).toBeGreaterThan(0);
  expect(browserErrors.every((entry) => entry.includes('status of 500'))).toBe(true);
});

async function openPosCashClose(
  context: BrowserContext,
  page: Page,
  closeStatus = 200,
) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está disponible para el E2E aislado de Caja POS');

  const token = await new SignJWT({
    tenant_id: user.tenant_id,
    email: user.email,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(secret));

  await context.addCookies([{
    name: 'access_token',
    value: token,
    url: process.env.BASE_URL || 'http://localhost:3001',
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  const closeBodies: any[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (/\/api\/auth\/profile\/?$/.test(pathname)) return json(user);
    if (/\/api\/configuration\/context\/country\/?$/.test(pathname)) {
      return json({ data: { pais_id: 1, pais: 'PE', paisCodigo: 'PE', monedaDefecto: 'PEN' } });
    }
    if (/\/api\/demo\/status\/?$/.test(pathname)) {
      return json({ is_demo: false, is_expired: false });
    }
    if (/\/api\/usuarios-sistema\/me\/permissions\/?$/.test(pathname)) {
      return json({ data: [] });
    }
    if (/\/api\/pos\/productos\/?$/.test(pathname)) return json({ success: true, data: [] });
    if (/\/api\/pos\/configuration-status\/?$/.test(pathname)) {
      return json({ success: true, data: { isDemo: true, isComplete: true } });
    }
    if (/\/api\/configuration\/gre-thresholds\/?$/.test(pathname)) {
      return json({ success: true, data: { umbralGREAutomatico: 700 } });
    }
    if (/\/api\/pos\/(clientes|metodos-pago|ventas-recientes)\/?$/.test(pathname)) {
      return json({ success: true, data: [] });
    }
    if (/\/api\/pos\/empresa-config\/?$/.test(pathname)) {
      return json({ success: true, data: { pais: 'PE', moneda_defecto: 'PEN' } });
    }
    if (/\/api\/pos\/sesion-caja\/?$/.test(pathname)) {
      return json({
        success: true,
        data: {
          id: 'sesion-pos-518',
          caja_id: 'caja-pos-518',
          estado: 'ABIERTA',
          monto_inicio: 203.84,
          moneda: 'PEN',
        },
      });
    }
    if (/\/api\/cajas\/?$/.test(pathname)) {
      return json({ success: true, data: [{ id: 'caja-pos-518', nombre: 'Caja POS 518' }] });
    }
    if (/\/api\/cajas\/saldo-esperado\/sesion-pos-518\/?$/.test(pathname)) {
      return json({ success: true, data: { saldo: 203.84 } });
    }
    if (/\/api\/cajas\/supervisores-autorizados\/[^/]+\/?$/.test(pathname)) {
      return json({ success: true, data: [] });
    }
    if (/\/api\/cajas\/caja-pos-518\/cierre\/?$/.test(pathname)) {
      closeBodies.push(request.postDataJSON());
      if (closeStatus !== 200) {
        return json({ message: 'La diferencia requiere autorización de supervisor' }, closeStatus);
      }
      return json({ success: true, data: { estado: 'CERRADA', diferencia: -0.04 } });
    }

    return json({ success: true, data: [] });
  });

  await page.addInitScript((sessionUser) => {
    const session = JSON.stringify({ user: sessionUser });
    window.localStorage.setItem('erp.auth.session.snapshot', session);
    window.sessionStorage.setItem('erp.auth.session.snapshot', session);
    window.localStorage.setItem('erp_onboarding_completed', JSON.stringify(['admin']));
    window.localStorage.setItem('selectedCountry', '1');
  }, user);

  await page.goto('/dashboard/pos/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Operación de caja' }).click();
  await page.getByRole('menuitem', { name: /Cerrar caja/i }).click();

  const dialog = page.getByRole('dialog', { name: 'Cerrar caja' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Monto contado en caja').fill('203.80');
  return { dialog, closeBodies };
}

test('POS permite enviar el redondeo legal sin inventar una autorización', async ({ context, page }) => {
  const { dialog, closeBodies } = await openPosCashClose(context, page);

  await expect(dialog.getByRole('button', { name: 'Confirmar cierre' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(dialog).not.toBeVisible();

  expect(closeBodies).toHaveLength(1);
  expect(closeBodies[0]).toEqual(expect.objectContaining({
    sesion_id: 'sesion-pos-518',
    monto_contado: 203.8,
  }));
  expect(closeBodies[0]).not.toHaveProperty('supervisor_id');
  expect(closeBodies[0]).not.toHaveProperty('codigo_supervisor');
});

test('POS conserva abierto el cierre cuando el writer exige supervisor', async ({ context, page }) => {
  const { dialog, closeBodies } = await openPosCashClose(context, page, 403);

  await dialog.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText('La diferencia requiere autorización de supervisor').first()).toBeVisible();
  expect(closeBodies).toHaveLength(1);
});
