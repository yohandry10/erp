/**
 * Escapa caracteres HTML peligrosos para prevenir XSS en email templates.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Valida y escapa URLs para uso en atributos href.
 * Solo permite protocolos http/https/mailto.
 */
export function escapeUrl(url: string): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return '';
}
