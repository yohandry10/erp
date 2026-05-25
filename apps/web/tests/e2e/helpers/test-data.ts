/**
 * Helpers para generar datos de prueba VÁLIDOS para los e2e.
 *
 * El sistema valida correctamente reglas SUNAT (e.g., dígito verificador
 * de RUC peruano módulo 11). Los tests deben generar datos que pasen esas
 * validaciones porque eso es lo que un usuario real ingresa.
 *
 * Espejo del algoritmo en apps/erp-api/src/modules/compras/services/proveedores.service.ts.
 */

const RUC_FACTORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;
const RUC_PREFIJOS_VALIDOS = ['10', '15', '17', '20'] as const;

/**
 * Calcula el dígito verificador (11vo dígito) de un RUC peruano de 10 dígitos.
 * Usa módulo 11 con los factores oficiales SUNAT.
 *
 * @param tenDigits Primeros 10 dígitos del RUC (prefijo + 8 dígitos)
 * @returns Dígito verificador (0-9)
 */
function calcularDigitoVerificadorRuc(tenDigits: string): number {
  if (!/^\d{10}$/.test(tenDigits)) {
    throw new Error(`calcularDigitoVerificadorRuc: requiere 10 dígitos, recibió "${tenDigits}"`);
  }
  const digitos = tenDigits.split('').map(Number);
  const suma = RUC_FACTORES.reduce((acc, factor, i) => acc + factor * digitos[i], 0);
  const resto = 11 - (suma % 11);
  if (resto === 10) return 0;
  if (resto === 11) return 1;
  return resto;
}

/**
 * Genera un RUC peruano VÁLIDO de 11 dígitos.
 *
 * @param prefix Prefijo SUNAT (default '20' = persona jurídica). Debe ser uno de: 10, 15, 17, 20.
 * @param seed Opcional. Si se pasa, los 8 dígitos centrales serán deterministas a partir del seed.
 *             Útil para tener RUCs únicos por run pero estables dentro del run.
 *             Si no se pasa, se genera aleatorio con Date.now() + Math.random().
 * @returns RUC válido de 11 dígitos (prefix + 8 dígitos + checksum)
 *
 * @example
 *   generateValidRuc()              // '20847291663' (random cada call)
 *   generateValidRuc('20', '12345') // determinista para 'seed=12345'
 */
export function generateValidRuc(prefix: string = '20', seed?: string): string {
  if (!(RUC_PREFIJOS_VALIDOS as readonly string[]).includes(prefix)) {
    throw new Error(`generateValidRuc: prefijo "${prefix}" inválido. Debe ser uno de: ${RUC_PREFIJOS_VALIDOS.join(', ')}`);
  }

  // 8 dígitos centrales: deterministas si hay seed, aleatorios si no.
  let middle: string;
  if (seed) {
    // Hash simple del seed para distribuir entropía sin depender de crypto.
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    middle = String(hash % 100000000).padStart(8, '0');
  } else {
    const random = Math.floor(Math.random() * 100000000);
    middle = String(random).padStart(8, '0');
  }

  const tenDigits = `${prefix}${middle}`;
  const checksum = calcularDigitoVerificadorRuc(tenDigits);
  return `${tenDigits}${checksum}`;
}

/**
 * Genera un RUC válido a partir de un identificador (runId del test).
 * Garantiza unicidad razonable entre runs dado que el runId incluye timestamp.
 */
export function generateValidRucFromRunId(runId: string, prefix: string = '20'): string {
  return generateValidRuc(prefix, runId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper para flujos de APROBACIÓN con segregación de funciones
// ─────────────────────────────────────────────────────────────────────────────

import type { APIRequestContext } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';

/**
 * Descubre un user_id distinto al actualmente autenticado, dentro del mismo
 * tenant. Necesario para flujos donde la regla de negocio bloquea
 * autoaprobación (e.g., quien crea una OC ≠ quien la aprueba).
 *
 * El demo seed extendido crea un segundo user "aprobador-..." con rol ADMIN
 * justo para este caso. Si el tenant no tiene un segundo user, este helper
 * lanza un error con instrucciones claras.
 *
 * @param apiContext Playwright APIRequestContext autenticado como un user
 * @returns user_id de un OTRO user activo del mismo tenant
 */
export async function getAprobadorUserId(apiContext: APIRequestContext): Promise<string> {
  // NOTA: los e2e usan apiContext con baseURL al API directo (puerto 3002 vía
  // E2E_API_ORIGIN). NO van por el rewrite /backend del frontend. Por eso
  // los paths empiezan con /api, no /backend/api.

  // 1. quién es el user actual
  const meResp = await apiContext.get('/api/auth/profile');
  if (!meResp.ok()) {
    throw new Error(`getAprobadorUserId: /api/auth/profile fallo ${meResp.status()}: ${await meResp.text()}`);
  }
  const me = await meResp.json();
  const myId = me.id;

  // 2. listar usuarios del tenant y encontrar otro activo
  const listResp = await apiContext.get('/api/usuarios-sistema?activo=true&limit=10');
  if (!listResp.ok()) {
    throw new Error(`getAprobadorUserId: /api/usuarios-sistema fallo ${listResp.status()}: ${await listResp.text()}`);
  }
  const body = await listResp.json();
  const usuarios: Array<{ id: string; activo?: boolean }> = body.data || [];
  const other = usuarios.find((u) => u.id && u.id !== myId);
  if (!other?.id) {
    throw new Error(
      `getAprobadorUserId: no hay segundo user activo en el tenant. ` +
      `Verifica que el demo seed cree el user 'aprobador-...' (ver demo.service.ts seedSegundoUserAprobador).`,
    );
  }
  return other.id;
}

/**
 * Crea un APIRequestContext autenticado como el aprobador del demo (segundo user
 * con rol ADMIN). Necesario tras SEC-001 fix: el endpoint `/compras/ordenes/:id/aprobar`
 * ya no acepta `aprobador_id` en el body — el aprobador es siempre el JWT user.
 *
 * Requiere env vars TEST_APROBADOR_EMAIL y TEST_APROBADOR_PASSWORD. Las creds del
 * aprobador se obtienen de la respuesta de `POST /api/demo/create` (campos
 * `aprobador_email` y `aprobador_password`).
 *
 * Importante: el caller debe llamar `await aprobadorContext.dispose()` al final
 * del test para no filtrar sesiones.
 *
 * @returns APIRequestContext con Authorization: Bearer <token del aprobador>
 *          y baseURL = E2E_API_ORIGIN
 */
export async function apiContextAsAprobador(): Promise<APIRequestContext> {
  const email = process.env.TEST_APROBADOR_EMAIL;
  const password = process.env.TEST_APROBADOR_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'apiContextAsAprobador: TEST_APROBADOR_EMAIL y TEST_APROBADOR_PASSWORD son requeridas. ' +
      'Obtenerlas de la respuesta de POST /api/demo/create (campos aprobador_email y aprobador_password).',
    );
  }

  const baseURL = process.env.E2E_API_ORIGIN || 'http://localhost:3002';

  // Contexto temporal solo para hacer login.
  const loginCtx = await playwrightRequest.newContext({ baseURL });
  try {
    const loginResp = await loginCtx.post('/api/auth/login', { data: { email, password } });
    if (!loginResp.ok()) {
      throw new Error(
        `apiContextAsAprobador: login fallo ${loginResp.status()}: ${await loginResp.text()}`,
      );
    }
    const body = await loginResp.json();
    const token = body.token || body.access_token || body.data?.token;
    if (!token) {
      throw new Error(`apiContextAsAprobador: respuesta de login sin token: ${JSON.stringify(body).slice(0, 200)}`);
    }
    return playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
  } finally {
    await loginCtx.dispose();
  }
}
