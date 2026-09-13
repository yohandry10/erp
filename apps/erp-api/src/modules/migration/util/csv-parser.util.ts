export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  totalLines: number;
}

export interface ParsedCsvError {
  rowIndex: number;
  field?: string;
  message: string;
}

const MAX_FIELD_LEN = 4096;

export class CsvFormatError extends Error {}

export function parseCsv(content: string): ParsedCsv {
  const records: string[][] = [];
  let columns: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  const fail = (message: string): never => { throw new CsvFormatError(`Registro ${records.length + 1}: ${message}`); };
  const finishField = () => {
    columns.push(field.trim());
    field = '';
    closedQuote = false;
  };
  const finishRecord = () => {
    finishField();
    if (columns.some((value) => value !== '')) records.push(columns);
    columns = [];
  };
  const input = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
    } else if (char === ',') finishField();
    else if (char === '\n') finishRecord();
    else if (char === '"') {
      if (field.length || closedQuote) fail('comillas inesperadas en el campo');
      quoted = true;
    } else if (closedQuote) {
      if (!/^[ \t]$/.test(char)) fail('contenido después del cierre de comillas');
    } else field += char;
    if (field.length > MAX_FIELD_LEN) fail(`el campo supera ${MAX_FIELD_LEN} caracteres; no se truncará`);
  }
  if (quoted) fail('comillas sin cerrar');
  if (field || columns.length || closedQuote) finishRecord();
  if (!records.length) return { headers: [], rows: [], totalLines: 0 };
  const headers = records[0].map((header) => header.toLowerCase().trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new CsvFormatError('Encabezados vacíos o duplicados');
  }
  const rows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new CsvFormatError(`Registro ${index + 2}: se esperaban ${headers.length} columnas y se recibieron ${values.length}`);
    }
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
  return { headers, rows, totalLines: rows.length };
}

export function validateHeaders(headers: string[], required: string[]): string[] {
  return required.filter((h) => !headers.includes(h)).map((h) => `Falta columna obligatoria: ${h}`);
}

export function toNumber(raw: string | undefined | null, fallback = 0): number {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).replace(/,/g, '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function toBoolean(raw: string | undefined | null, fallback = false): boolean {
  if (raw == null) return fallback;
  const v = String(raw).trim().toLowerCase();
  if (v === '') return fallback;
  if (['true', '1', 'si', 'sí', 'yes', 'y'].includes(v)) return true;
  if (['false', '0', 'no', 'n'].includes(v)) return false;
  return fallback;
}

export function toDateOrNull(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  // Acepta YYYY-MM-DD o ISO completo
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function nonEmpty(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}
