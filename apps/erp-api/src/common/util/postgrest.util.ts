/**
 * Sanitiza un input de búsqueda libre para uso dentro de filtros PostgREST
 * tipo `.or(\`col.ilike.%${value}%,...\`)` o similares.
 *
 * El supabase-js no parametriza el contenido de `.or()` ni de `.filter()`
 * cuando se pasa como template literal; cualquier coma, punto, paréntesis,
 * porcentaje o comilla en el input puede:
 *   - romper la separación de filtros (`,`)
 *   - confundir el parser de expresiones (`(`, `)`, `:`, `*`)
 *   - inyectar wildcards no deseados dentro de `ilike` (`%`)
 *   - alterar el operador (`.`)
 *
 * Estrategia: whitelist conservadora. Solo se preservan letras (con acentos),
 * dígitos, espacio, guión y guión bajo. Resto se reemplaza por espacio.
 * Se aplica además un límite duro de longitud para evitar DoS por payload
 * grande en filtros que no paginan.
 *
 * Nota: este helper NO es para SQL crudo (Supabase parametriza `.eq`, `.in`,
 * etc. de forma segura). Es estrictamente para el contenido de strings que
 * van interpolados dentro de la sintaxis PostgREST en `.or` / `.filter`.
 */
export function sanitizePostgrestSearch(input: string | null | undefined, maxLen = 100): string {
  if (input == null) return '';
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return '';
  // Allowlist: letras (incl. acentos latinos), dígitos, espacio, guión, guión bajo.
  const cleaned = trimmed.replace(/[^A-Za-z0-9 \-_À-ſ]/g, ' ');
  // Colapsar espacios múltiples introducidos por el replace.
  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  return collapsed.slice(0, maxLen);
}
