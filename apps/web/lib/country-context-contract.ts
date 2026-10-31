import { getActiveCountryByCode } from './initial-country';

export interface CountryContextData {
  id: string;
  tenantId: string;
  pais: string;
  pais_id: number;
  monedaDefecto: string;
  igvPorcentaje: number | null;
  isDemo: boolean;
  arcaPuntoVenta: number | null;
  arcaCondicionIva: string | null;
}

const invalid = () => new Error('La respuesta de configuración fiscal está incompleta o no corresponde a esta empresa.');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

/** Sólo una ausencia confirmada permite abrir el asistente; un error no es un país por defecto. */
export function readCountryContext(value: unknown, tenantId: string): CountryContextData | null {
  const response = object(value);
  if (!tenantId || response.success !== true || typeof response.requiresSetup !== 'boolean' ||
      !Object.prototype.hasOwnProperty.call(response, 'data')) throw invalid();
  if (response.data === null) {
    if (!response.requiresSetup) throw invalid();
    return null;
  }
  const data = object(response.data);
  if (typeof data.id !== 'string' || !uuid.test(data.id) || data.tenantId !== tenantId ||
      !Object.prototype.hasOwnProperty.call(data, 'pais') || !Object.prototype.hasOwnProperty.call(data, 'pais_id') ||
      (data.pais !== null && typeof data.pais !== 'string') ||
      (data.pais_id !== null && (!Number.isInteger(data.pais_id) || Number(data.pais_id) <= 0))) throw invalid();

  const code = typeof data.pais === 'string' ? data.pais.trim().toUpperCase() : '';
  const country = code ? getActiveCountryByCode(code) : null;
  if (code && !country) throw invalid();
  if (country && data.pais_id !== null && country.id !== data.pais_id) throw invalid();
  const unset = !code || data.pais_id === null;
  if (response.requiresSetup !== unset) throw invalid();
  if (unset) return null;

  if (typeof data.monedaDefecto !== 'string' || !/^[A-Z]{3}$/.test(data.monedaDefecto) ||
      (data.igvPorcentaje !== null && (typeof data.igvPorcentaje !== 'number' ||
        !Number.isFinite(data.igvPorcentaje) || data.igvPorcentaje < 0 || data.igvPorcentaje > 100)) ||
      typeof data.isDemo !== 'boolean' ||
      (data.arcaPuntoVenta !== null && (!Number.isInteger(data.arcaPuntoVenta) || Number(data.arcaPuntoVenta) < 1)) ||
      (data.arcaCondicionIva !== null && typeof data.arcaCondicionIva !== 'string')) throw invalid();
  // El backend puede cachear esta lectura por tenant. Eso no equivale a una
  // operación confirmada offline; se conserva el snapshot de contexto válido.
  return { ...(data as unknown as CountryContextData), pais: code };
}
