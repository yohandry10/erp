import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ninguna ruta nueva puede quedarse sin autorización explícita.
 *
 * `JwtAuthGuard` y `PermissionGuard` están registrados como `APP_GUARD`, así que
 * toda ruta exige sesión. Pero `PermissionGuard` deja pasar lo que no declara
 * metadatos: sin `@RequirePermission`, cualquier usuario autenticado del tenant
 * entra. Eso es correcto para la ayuda o para leer lo propio, y no lo es para
 * casi nada más.
 *
 * De las 687 rutas del API, 676 declaran guard. Esta prueba fija esa cuenta: si
 * aparece una ruta nueva sin autorización, hay que decidir a conciencia si
 * pertenece a la lista de abajo.
 *
 * Esta prueba contaba `@Public()` como autorización, que es exactamente lo
 * contrario de lo que significa: apaga el guard global. Con ese hueco tapaba
 * ocho rutas públicas —el webhook de Stripe, dos de métricas y cinco de
 * observabilidad—. Las ocho resultaron estar bien protegidas, por firma o por
 * token comprobado en el método, pero eso hay que verlo, no suponerlo.
 *
 * Nota sobre cómo se mide, que costó acertar: los decoradores de una ruta pueden
 * estar hasta una decena de líneas por debajo de ella, y una ventana corta los
 * pierde y reporta falsos positivos —la primera versión daba 90 rutas «sin
 * permiso» y eran 4—. Se recorre desde la ruta hasta la firma del método.
 */
// `@Public()` NO cuenta como autorización: es justo lo contrario, apaga el guard
// global. Contarlo era un hueco de esta misma prueba —lo habría dejado pasar una
// ruta pública sin nada más—. Ahora una ruta pública tiene que traer su propio
// guard, o estar enumerada abajo con el motivo.
const AUTORIZACION =
  /RequirePermission|SkipAuth|SuperAdminGuard|WorkerAuthGuard|ApiKeyGuard|HealthTokenGuard|InternalGuard/;

function rutasSinAutorizacion(): string[] {
  const raiz = join(__dirname, '..', '..', '..');
  const archivos = execFileSync('git', ['ls-files', 'src'], { cwd: raiz, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.controller.ts'));

  const sin: string[] = [];
  for (const rel of archivos) {
    const lineas = readFileSync(join(raiz, rel), 'utf8').split(/\r?\n/);
    const iClase = lineas.findIndex((x) => /export class/.test(x));
    const guardDeClase = lineas
      .slice(0, iClase < 0 ? 0 : iClase)
      .some((x) => AUTORIZACION.test(x));

    for (let i = 0; i < lineas.length; i += 1) {
      if (!/^\s*@(Get|Post|Put|Delete|Patch)\(/.test(lineas[i])) continue;
      if (guardDeClase) continue;

      // Desde la ruta hasta la firma del método: ahí viven sus decoradores.
      const ventana: string[] = [];
      for (let j = i; j < lineas.length && j < i + 30; j += 1) {
        ventana.push(lineas[j]);
        if (j > i && /async \w+\(|^\s{2}\w+\(/.test(lineas[j])) break;
      }
      if (!AUTORIZACION.test(ventana.join(' '))) sin.push(`${rel.replace('src/', '')}:${i + 1}`);
    }
  }
  return sin.sort();
}

describe('autorización de rutas HTTP', () => {
  it('sólo estas rutas se conforman con estar autenticadas', () => {
    expect(rutasSinAutorizacion()).toEqual([
      // Tasas y moneda del propio tenant: datos operativos de sólo lectura que
      // Ventas/POS necesitan para calcular; TenantGuard mantiene el aislamiento.
      'modules/configuracion/configuracion-fiscal.controller.ts:24',
      // Contexto de configuración del propio tenant de quien pregunta.
      'modules/configuracion/configuration-context.controller.ts:29',
      'modules/configuracion/configuration-context.controller.ts:66',
      // Webhook de Stripe. Tiene que ser público —Stripe no manda un JWT— y lo
      // autentica `verifyWebhookSignature` sobre el cuerpo crudo, que es el
      // mecanismo correcto. Además está limitado por `@Throttle` y devuelve 400 si
      // Stripe no está configurado.
      'modules/demo/webhook.controller.ts:17',
      // Buscador de ayuda: contenido de documentación, igual para todos.
      'modules/help/help.controller.ts:11',
      'modules/help/help.controller.ts:45',
      // Métricas y observabilidad. Se autentican con METRICS_TOKEN comprobado en el
      // propio método, no con un guard, porque los recolectores no llevan sesión.
      // Fallan cerradas en producción: sin METRICS_TOKEN configurado devuelven 401.
      'modules/metrics/metrics.controller.ts:20',
      'modules/metrics/metrics.controller.ts:34',
      'shared/observability/observability.controller.ts:16',
      'shared/observability/observability.controller.ts:30',
      'shared/observability/observability.controller.ts:55',
      'shared/observability/observability.controller.ts:78',
      'shared/observability/observability.controller.ts:90',
    ]);
  });

  it('los guards globales cubren autenticación y permisos', () => {
    const raiz = join(__dirname, '..', '..', '..');
    const appModule = readFileSync(join(raiz, 'src/app.module.ts'), 'utf8');
    expect(appModule).toContain('useClass: JwtAuthGuard');
    expect(appModule).toContain('useClass: PermissionGuard');
  });
});
