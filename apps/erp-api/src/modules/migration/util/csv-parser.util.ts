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

function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else if (ch === '"' && cur.length === 0) {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols.map((c) => c.trim());
}

export function parseCsv(content: string): ParsedCsv {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], totalLines: 0 };
  }
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => c === '')) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const v = cols[idx] ?? '';
      row[h] = v.length > MAX_FIELD_LEN ? v.slice(0, MAX_FIELD_LEN) : v;
    });
    rows.push(row);
  }
  return { headers, rows, totalLines: lines.length - 1 };
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
