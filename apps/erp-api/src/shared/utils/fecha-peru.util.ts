/**
 * Fecha de calendario en horario de Perú, en formato YYYY-MM-DD.
 *
 * `new Date().toISOString()` devuelve la fecha en UTC. Con el servidor en UTC
 * —lo habitual— entre las 19:00 y las 24:00 de Lima eso ya es el día siguiente,
 * y el validador de emisión, que sí compara contra America/Lima, rechaza el
 * comprobante por tener fecha futura. Cinco horas al día en las que no se podía
 * facturar.
 *
 * 'en-CA' es el locale que formatea como YYYY-MM-DD, que es lo que espera SUNAT.
 */
export function fechaHoyEnPeru(referencia: Date = new Date()): string {
  return referencia.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

/**
 * Zona horaria del país del tenant.
 *
 * Espeja exactamente `app.zona_horaria_pais` de la migración 370, que arregló
 * este mismo problema del lado de la base. Aquella migración documenta el efecto:
 * «pasadas las 19:00 de Lima la base ya creía estar en la fecha siguiente», con
 * lo que una cuenta se marcaba vencida cinco horas antes y un documento nacía con
 * la fecha del día siguiente, empujado al periodo tributario equivocado.
 *
 * Los normalizadores de la base ya usan esa función; lo que quedó sin arreglar es
 * todo lo que se calcula en Node, que sigue resolviendo el día en UTC. Mantener
 * las dos tablas idénticas es lo que evita que la aplicación y la base discrepen
 * sobre qué día es.
 */
export function zonaHorariaDePais(pais?: string | null): string {
  switch (String(pais ?? '').trim().toUpperCase() || 'PE') {
    case 'PE': return 'America/Lima';
    case 'CO': return 'America/Bogota';
    case 'EC': return 'America/Guayaquil';
    case 'BO': return 'America/La_Paz';
    case 'CL': return 'America/Santiago';
    case 'AR': return 'America/Argentina/Buenos_Aires';
    case 'MX': return 'America/Mexico_City';
    default: return 'America/Lima';
  }
}

/**
 * Fecha de calendario del país indicado, en formato YYYY-MM-DD.
 *
 * Es la versión multi-país de `fechaHoyEnPeru`: el alcance operativo incluye
 * Colombia (UTC-5) y Argentina (UTC-3), así que fechar en UTC desplaza el día en
 * los tres países, no sólo en Perú.
 */
export function fechaHoyEnPais(pais?: string | null, referencia: Date = new Date()): string {
  return referencia.toLocaleDateString('en-CA', { timeZone: zonaHorariaDePais(pais) });
}

/**
 * Inicio y fin del día local del país, como marcas ISO en UTC.
 *
 * Filtrar `created_at` con `${hoy}T00:00:00` compara una marca local contra una
 * columna `timestamptz`: para un tenant peruano la ventana quedaba corrida cinco
 * horas y «los movimientos de hoy» abarcaban desde las 19:00 de ayer.
 */
export function rangoDelDiaEnPais(
  pais?: string | null,
  referencia: Date = new Date(),
): { desde: string; hasta: string } {
  const zona = zonaHorariaDePais(pais);
  const dia = referencia.toLocaleDateString('en-CA', { timeZone: zona });

  // El desfase de la zona en ese instante, deducido comparando la hora local con
  // la UTC. Evita depender de una tabla de offsets propia.
  const local = new Date(referencia.toLocaleString('en-US', { timeZone: zona }));
  const utc = new Date(referencia.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = local.getTime() - utc.getTime();

  const inicioLocal = new Date(`${dia}T00:00:00.000Z`).getTime() - offsetMs;
  return {
    desde: new Date(inicioLocal).toISOString(),
    hasta: new Date(inicioLocal + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Presenta la fecha de un documento en la zona del contribuyente.
 *
 * La conversion de zona solo tiene sentido sobre un **instante**. Aplicarla a
 * una fecha pura la retrasa un dia: `new Date('2026-08-28')` es medianoche UTC,
 * y en Lima --UTC-5-- eso son las 19:00 del 27. Como `cpe.fecha_emision` se
 * guarda justamente como fecha pura (`YYYY-MM-DD`, ver `resolveEmissionDate`),
 * el listado de comprobantes mostraba el dia anterior al que declara el XML:
 * comprobado el 2026-08-28 con una boleta cuyo `IssueDate` era 2026-08-28 y
 * cuya fila decia 2026-08-27.
 *
 * Una fecha pura ya esta en la zona del contribuyente --la escribio el propio
 * emisor-- asi que se devuelve tal cual. Solo se convierte lo que lleva hora.
 */
export function fechaDeDocumentoEnPais(valor: unknown, zonaHoraria: string): string {
  const texto = String(valor ?? '').trim();
  if (!texto) return '';

  // Una fecha, no un instante. Tres formas de la misma cosa:
  //   `2026-08-28`                    la fecha pelada
  //   `2026-08-28 00:00:00`           con hora, sin desfase
  //   `2026-08-28T00:00:00+00:00`     lo que devuelve PostgREST, porque
  //                                   `cpe.fecha_emision` es `timestamptz` y
  //                                   Postgres guarda la fecha como medianoche
  //
  // Medianoche **en UTC** es como se guarda aqui una fecha pura; medianoche en
  // otro huso si es un instante y se convierte. La forma con desfase se escapo
  // del primer arreglo y el listado seguia restando un dia.
  const fechaPura =
    /^(\d{4}-\d{2}-\d{2})(?:[ T]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00(?::?00)?)?)?$/.exec(texto);
  if (fechaPura) return fechaPura[1];

  const instante = new Date(texto);
  return Number.isNaN(instante.getTime())
    ? ''
    : instante.toLocaleDateString('en-CA', { timeZone: zonaHoraria });
}

