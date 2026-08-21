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
 * De las 687 rutas del API, 683 declaran guard. Esta prueba fija esa cuenta: si
 * aparece una ruta nueva sin autorización, hay que decidir a conciencia si
 * pertenece a la lista de abajo.
 *
 * Nota sobre cómo se mide, que costó acertar: los decoradores de una ruta pueden
 * estar hasta una decena de líneas por debajo de ella, y una ventana corta los
 * pierde y reporta falsos positivos —la primera versión daba 90 rutas «sin
 * permiso» y eran 4—. Se recorre desde la ruta hasta la firma del método.
 */
const AUTORIZACION =
  /RequirePermission|Public\(\)|SkipAuth|SuperAdminGuard|WorkerGuard|ApiKeyGuard|HealthTokenGuard|InternalGuard/;

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
      // Contexto de configuración del propio tenant de quien pregunta.
      'modules/configuracion/configuration-context.controller.ts:29',
      'modules/configuracion/configuration-context.controller.ts:66',
      // Buscador de ayuda: contenido de documentación, igual para todos.
      'modules/help/help.controller.ts:11',
      'modules/help/help.controller.ts:45',
    ]);
  });

  it('los guards globales cubren autenticación y permisos', () => {
    const raiz = join(__dirname, '..', '..', '..');
    const appModule = readFileSync(join(raiz, 'src/app.module.ts'), 'utf8');
    expect(appModule).toContain('useClass: JwtAuthGuard');
    expect(appModule).toContain('useClass: PermissionGuard');
  });
});
