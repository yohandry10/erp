/**
 * Alcance por sucursal: el conjunto de tablas que llevan `sucursal_id` y a las
 * que, por tanto, hay que aplicarles el filtro del usuario.
 *
 * Es una lista escrita a mano a propósito, no una introspección en el arranque:
 * el arranque no debe depender de una consulta al catálogo, y una lista visible
 * se revisa en el diff. Lo que impide que se quede obsoleta es el verificador
 * `504`, que compara este conjunto con las tablas que de verdad llevan la
 * columna y falla nombrando la que falte. Si añades `sucursal_id` a una tabla
 * nueva, el verificador te manda aquí.
 */
export const TABLAS_CON_SUCURSAL: ReadonlySet<string> = new Set([
  // 503: la estructura
  'documento_series',
  'almacenes',
  'cajas',
  'ventas',
  // 504: donde ocurre la operación
  'ventas_pos',
  'sesiones_caja',
  'movimientos_inventario',
  'cpe',
  'documentos',
  // vistas que exponen la columna
  'cpe_documentos',
  'stock_por_sucursal',
]);

/**
 * `null` significa alcance total, que es el estado de todo usuario sin
 * asignaciones: la oficina central. Un array vacío nunca es un valor válido
 * —sería un usuario que no ve nada— y se trata como alcance total.
 */
export type AlcanceSucursal = string[] | null;

export function alcanceRestringido(alcance: AlcanceSucursal | undefined): alcance is string[] {
  return Array.isArray(alcance) && alcance.length > 0;
}
