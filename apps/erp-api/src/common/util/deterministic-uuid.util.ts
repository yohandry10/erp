import * as crypto from 'crypto';

/**
 * Deriva un UUID estable a partir de una clave lógica.
 *
 * `asientos_contables.source_event_id` es de tipo uuid y tiene un índice único
 * por (tenant_id, source_event_id): es el mecanismo de idempotencia de toda la
 * contabilidad por eventos. Los procesos que no nacen de un evento con id
 * propio — cierre anual, revaluación de moneda extranjera — necesitan una clave
 * igualmente estable, pero no pueden inventarse un uuid aleatorio sin perder la
 * idempotencia, ni pasar un texto libre sin violar el tipo de la columna.
 *
 * El valor se deriva por SHA-256 y se le fija la versión 5 y la variante RFC
 * 4122, de modo que la misma clave produce siempre el mismo uuid.
 */
export function buildDeterministicUuid(input: string): string {
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const chars = hash.slice(0, 32).split('');

  chars[12] = '5';
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);

  return [
    chars.slice(0, 8).join(''),
    chars.slice(8, 12).join(''),
    chars.slice(12, 16).join(''),
    chars.slice(16, 20).join(''),
    chars.slice(20, 32).join(''),
  ].join('-');
}
