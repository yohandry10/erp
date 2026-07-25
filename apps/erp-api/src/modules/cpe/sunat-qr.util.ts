export interface SunatQrInput {
  ruc_emisor?: unknown;
  tipo_documento?: unknown;
  serie?: unknown;
  numero?: unknown;
  total_igv?: unknown;
  total_venta?: unknown;
  fecha_emision?: unknown;
  created_at?: unknown;
  tipo_documento_receptor?: unknown;
  documento_receptor?: unknown;
  valor_resumen?: unknown;
  hash_firma?: unknown;
  hash?: unknown;
  hash_code?: unknown;
  codigo_hash?: unknown;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function formatAmount(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
}

function formatIssueDate(value: unknown, fallback?: unknown): string {
  const raw = clean(value || fallback);
  if (!raw) return '';

  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return raw.slice(0, 10);
}

export function buildSunatQrContent(data: SunatQrInput): string {
  return [
    clean(data.ruc_emisor),
    clean(data.tipo_documento),
    clean(data.serie),
    clean(data.numero),
    formatAmount(data.total_igv),
    formatAmount(data.total_venta),
    formatIssueDate(data.fecha_emision, data.created_at),
    clean(data.tipo_documento_receptor),
    clean(data.documento_receptor),
    clean(data.valor_resumen ?? data.hash_firma ?? data.hash ?? data.hash_code ?? data.codigo_hash),
  ].join('|');
}

export async function buildSunatQrDataUrl(data: SunatQrInput): Promise<string> {
  const QRCode = await import('qrcode');

  return QRCode.toDataURL(buildSunatQrContent(data), {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 200,
    margin: 1,
  });
}
