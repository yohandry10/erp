/**
 * Resuelve la tasa de IGV/IVA que la pantalla debe usar y exhibir.
 *
 * Existe porque había dos fuentes para el mismo número. La RPC de venta
 * recalcula el impuesto con `empresas.igv_porcentaje` --la tasa del tenant, la
 * que se fija en el asistente inicial-- mientras que el navegador usaba una
 * constante por país. Mientras coincidieran no se notaba; en cuanto no, el POS
 * exhibía y cobraba un total y registraba otro: con la empresa al 10 % el cajero
 * cobraba S/ 118,00 y la venta quedaba grabada en S/ 110,00, con el ticket
 * rotulado «IGV (18%)» junto a un importe calculado al 10 %.
 *
 * Sin dependencias a propósito: así se puede ejercitar con
 * `node tests/impuestos/verify-tasa-impuesto.mjs`.
 */

/** Tasa en tanto por uno (0.18), que es como la consumen los cálculos. */
export function resolverTasaImpuesto(
  /** `igv_porcentaje` del tenant, en porcentaje (18), o nada si no está. */
  porcentajeDelTenant: unknown,
  /** Constante del país, en tanto por uno (0.18). Se usa si no hay tenant. */
  tasaDelPais: number,
): number {
  // `Number(null)` y `Number('')` valen 0, no NaN. Sin este filtro un tenant sin
  // tasa guardada exhibiría un 0 % --y no cobraría impuesto en pantalla-- mientras
  // el servidor aplica el 18 % de su `coalesce`. Hay que distinguir «no hay dato»
  // de un 0 escrito a propósito, que es legítimo (Ley de Amazonía).
  const esNumeroUtil =
    typeof porcentajeDelTenant === 'number' ||
    (typeof porcentajeDelTenant === 'string' && porcentajeDelTenant.trim() !== '');
  if (!esNumeroUtil) return tasaDelPais;

  const porcentaje = Number(porcentajeDelTenant);

  // Un valor no numérico o fuera de rango tampoco puede secuestrar el cálculo:
  // se cae a la constante del país, que es lo que había antes.
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return tasaDelPais;
  }

  return porcentaje / 100;
}

/**
 * Rótulo derivado de la misma tasa que el cálculo.
 *
 * Se separa el nombre del paréntesis de la constante (`"IGV (18%)"`) y se vuelve
 * a componer con la tasa efectiva, para que no pueda decir 18 % sobre un importe
 * del 10 %.
 */
export function etiquetaImpuesto(nombreConPorcentaje: string, tasa: number): string {
  const nombre = nombreConPorcentaje.replace(/\s*\(.*\)\s*$/, '');
  const porcentaje = Math.round(tasa * 10000) / 100;
  return `${nombre} (${porcentaje}%)`;
}
