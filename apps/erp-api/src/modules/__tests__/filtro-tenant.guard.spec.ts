import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Toda consulta a datos de un contribuyente lleva su `tenant_id`.
 *
 * El API habla con Postgres como `service_role`, que se salta RLS. Es decir: las
 * políticas de la base no protegen nada aquí, y el filtro de la consulta es la
 * única frontera entre los datos de dos empresas. Un `.from()` sin `tenant_id`
 * no da error, da los datos de otro.
 *
 * Las 17 excepciones de abajo se revisaron una a una y son legítimas por tres
 * razones distintas:
 *
 *  - Derivadas: la consulta filtra por un id que un `select` anterior ya acotó al
 *    tenant (`movimientos_caja` por su sesión, `detalle_asientos` por su asiento,
 *    `event_processing_log` por la fila que el propio listener acaba de crear).
 *  - Anteriores al tenant: el login no tiene tenant todavía —por eso
 *    `auth_login_attempts` se cuenta por correo, para que rotar IP no evada el
 *    bloqueo— y crear un tenant tampoco.
 *  - Transversales a propósito: los catálogos globales de `paises`, y el panel de
 *    seguridad, que agrega violaciones de RLS de todas las empresas y está detrás
 *    de `SuperAdminGuard` más el permiso `security.audit.read`.
 *
 * Cómo se mide, que costó tres intentos acertar: la lista de tablas sale del
 * esquema real y no de las migraciones, porque `002__domain_tables_skeleton.sql`
 * le pone `tenant_id` a sus 168 tablas y luego las migraciones de normalización
 * lo quitan de los catálogos; usar las migraciones daba 242 tablas y ningún
 * hallazgo. Y la ventana tiene que ser ancha por los dos lados: en un `insert` el
 * `tenant_id` va en el objeto, por encima del `.from`, y en un `select` anidado
 * el filtro puede quedar veinte líneas por debajo.
 *
 * Lo que este guardián no ve: la ventana es textual, así que una consulta sin
 * filtrar a diez líneas de un `tenantId` que no es suyo pasa desapercibida. Sirve
 * para que no se cuele una consulta nueva a ojo, no como demostración.
 *
 * Para regenerar la lista de tablas:
 *   select table_name from information_schema.columns
 *   where column_name = 'tenant_id' and table_schema = 'public' order by 1;
 */
const EXCEPCIONES = [
  'modules/auth/auth.service.ts -> auth_login_attempts',
  'modules/auth/auth.service.ts -> user_roles',
  'modules/auth/auth.service.ts -> user_sessions',
  'modules/auth/auth.service.ts -> usuarios_sistema',
  'modules/cajas/cajas.service.ts -> movimientos_caja',
  'modules/contabilidad/listeners/contabilidad-events.listener.ts -> event_processing_log',
  'modules/contabilidad/services/centros-costo.service.ts -> detalle_asientos',
  'modules/paises/paises.service.ts -> configuracion_fiscal',
  'modules/paises/paises.service.ts -> paises',
  'modules/paises/paises.service.ts -> tipos_documentos_fiscales',
  'modules/paises/paises.service.ts -> tipos_impuestos',
  'modules/paises/paises.service.ts -> usuario_configuracion',
  'modules/security/security-dashboard.service.ts -> rls_alert_history',
  'modules/security/security-dashboard.service.ts -> rls_audit_log',
  'modules/tenants/tenant-management.service.ts -> paises',
  'shared/secrets/secret-rotation.service.ts -> secret_rotation_state',
  'shared/secrets/secret-rotation.service.ts -> system_alerts',
];

const TABLAS_CON_TENANT: string[] = JSON.parse(
  readFileSync(join(__dirname, 'tablas-con-tenant-id.json'), 'utf8'),
);

function consultasSinFiltroDeTenant(): string[] {
  const raiz = join(__dirname, '..', '..', '..');
  const tablas = new Set(TABLAS_CON_TENANT);
  const archivos = execFileSync('git', ['ls-files', 'src'], { cwd: raiz, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));

  const halladas = new Set<string>();
  for (const rel of archivos) {
    const lineas = readFileSync(join(raiz, rel), 'utf8').split(/\r?\n/);
    for (let i = 0; i < lineas.length; i += 1) {
      const m = lineas[i].match(/\.from\(['"]([a-z0-9_]+)['"]\)/);
      if (!m || !tablas.has(m[1])) continue;
      const ventana = lineas.slice(Math.max(0, i - 25), i + 30).join('\n');
      if (/tenant_id|tenantId/i.test(ventana)) continue;
      halladas.add(`${rel.replace('src/', '')} -> ${m[1]}`);
    }
  }
  return [...halladas].sort();
}

describe('aislamiento entre contribuyentes', () => {
  it('sólo estas consultas prescinden del filtro de tenant', () => {
    expect(consultasSinFiltroDeTenant()).toEqual(EXCEPCIONES);
  });

  it('la lista de tablas con tenant_id no está vacía ni es sospechosamente corta', () => {
    // Control de la medición: si el fichero se queda corto, la prueba de arriba
    // pasaría en verde sin haber mirado casi nada.
    expect(TABLAS_CON_TENANT.length).toBeGreaterThan(200);
    expect(TABLAS_CON_TENANT).toContain('cpe');
    expect(TABLAS_CON_TENANT).toContain('asientos_contables');
  });
});
