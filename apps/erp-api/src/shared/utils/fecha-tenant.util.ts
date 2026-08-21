import { fechaHoyEnPais, rangoDelDiaEnPais } from './fecha-peru.util';

/**
 * Fecha local del tenant, resuelta desde el país de su `empresa_config`.
 *
 * La migración 370 arregló esto del lado de la base con `app.hoy_tenant`, pero esa
 * función vive en el esquema `app` y PostgREST no la alcanza, así que todo lo que
 * se calcula en Node seguía resolviendo el día en UTC. Con el servidor en UTC y
 * los países del alcance operativo entre UTC-5 y UTC-3, eso desplaza el día:
 * pasadas las 19:00 de Lima el sistema ya cree estar en la fecha siguiente. La
 * propia 370 lo describe: una cuenta se marcaba vencida cinco horas antes y un
 * documento nacía con la fecha del día siguiente, empujado al periodo tributario
 * equivocado.
 *
 * Se resuelve con una función y no con un servicio inyectable a propósito: los
 * puntos afectados viven en siete módulos distintos y ya tienen el cliente a mano;
 * cablear una dependencia en cada uno sería más superficie que el arreglo.
 *
 * El país cambia con muy baja frecuencia, así que se cachea unos minutos. Ante
 * cualquier fallo se cae a la zona de Lima, que es lo mismo que hace
 * `app.zona_horaria_pais`: nunca devuelve nulo.
 */

const TTL_MS = 5 * 60 * 1000;
const cachePais = new Map<string, { pais: string; expira: number }>();

/** Limpia la caché de países. Para pruebas y para un cambio de configuración. */
export function limpiarCachePaisTenant(tenantId?: string): void {
  if (tenantId) cachePais.delete(tenantId);
  else cachePais.clear();
}

/**
 * País del tenant, cacheado. Se exporta porque hay presentaciones que necesitan la
 * zona horaria y no sólo la fecha de hoy: por ejemplo formatear la fecha de cada
 * comprobante de un listado, donde pedir la fecha actual no sirve de nada.
 */
export async function paisDelTenant(client: any, tenantId?: string | null): Promise<string> {
  const clave = String(tenantId ?? '').trim();
  if (!clave || !client) return 'PE';

  const enCache = cachePais.get(clave);
  if (enCache && enCache.expira > Date.now()) return enCache.pais;

  try {
    const { data } = await client
      .from('empresa_config')
      .select('pais')
      .eq('tenant_id', clave)
      .maybeSingle();

    const pais = String(data?.pais ?? '').trim().toUpperCase() || 'PE';
    cachePais.set(clave, { pais, expira: Date.now() + TTL_MS });
    return pais;
  } catch {
    // Igual que `app.zona_horaria_pais`: ante lo desconocido, Lima. Aquí no se
    // falla cerrado porque una fecha es un dato de presentación y de filtro, no
    // una autorización; detener la operación sería peor que usar el día de Lima.
    return 'PE';
  }
}

/**
 * Año y mes contables a los que pertenece una fecha, para este contribuyente.
 *
 * `fecha.getFullYear()` y `fecha.getMonth()` resuelven en la zona del servidor, que
 * en Render es UTC. Como `asientos_contables.fecha` es `timestamptz` y hereda el
 * instante del documento de origen, un comprobante emitido a las 19:30 de Lima se
 * guarda ya en el día siguiente UTC: de los 179 asientos de producción, 23 tienen
 * un día distinto en UTC que en Lima. Hoy ninguno cruza un cambio de mes, pero el
 * que lo cruce se valida contra el periodo equivocado, y ése es el que importa:
 * puede colarse en un periodo cerrado, o quedarse fuera de uno abierto.
 *
 * La distinción que hay que respetar es la misma que resuelve `parseDateLocal` en
 * el frontend: **una fecha de calendario no es un instante**. Un valor a
 * medianoche UTC exacta viene de una columna `date` o de una cadena `YYYY-MM-DD`,
 * y convertirlo a la zona del contribuyente lo retrasaría un día sin motivo. Sólo
 * se convierte lo que lleva hora.
 */
export async function periodoContableDelTenant(
  client: any,
  tenantId: string | null | undefined,
  fecha: Date,
): Promise<{ anio: number; mes: number }> {
  const esFechaDeCalendario =
    fecha.getUTCHours() === 0 &&
    fecha.getUTCMinutes() === 0 &&
    fecha.getUTCSeconds() === 0 &&
    fecha.getUTCMilliseconds() === 0;

  if (esFechaDeCalendario) {
    return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 };
  }

  const [anio, mes] = fechaHoyEnPais(await paisDelTenant(client, tenantId), fecha)
    .split('-')
    .map(Number);
  return { anio, mes };
}

/** Fecha de calendario del tenant en formato YYYY-MM-DD. */
export async function fechaHoyDelTenant(
  client: any,
  tenantId?: string | null,
  referencia: Date = new Date(),
): Promise<string> {
  return fechaHoyEnPais(await paisDelTenant(client, tenantId), referencia);
}

/**
 * Inicio y fin del día local del tenant como marcas ISO en UTC, para filtrar
 * columnas `timestamptz` sin que la ventana quede corrida.
 */
export async function rangoDelDiaDelTenant(
  client: any,
  tenantId?: string | null,
  referencia: Date = new Date(),
): Promise<{ desde: string; hasta: string }> {
  return rangoDelDiaEnPais(await paisDelTenant(client, tenantId), referencia);
}
