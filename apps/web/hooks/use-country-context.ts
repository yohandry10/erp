import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface CountryContext {
  paisId: number;
  paisCodigo: string;
  paisNombre: string;
  servicioFiscal: string; // SUNAT, DIAN, etc.
  documentoFiscal: string; // RUC, NIT, etc.
  moneda: string;
  simboloMoneda: string;
  impuesto: string; // IGV, IVA, etc.
  impuestoRate: number;
  requiresSetup: boolean;
  loading: boolean;
}

const EMPTY_CONTEXT: CountryContext = {
  paisId: 0,
  paisCodigo: '',
  paisNombre: '',
  servicioFiscal: '',
  documentoFiscal: '',
  moneda: '',
  simboloMoneda: '',
  impuesto: '',
  impuestoRate: 0,
  requiresSetup: true,
  loading: false,
};

const INITIAL_CONTEXT: CountryContext = {
  ...EMPTY_CONTEXT,
  requiresSetup: false,
  loading: true,
};

const CONTEXT_MAP: Record<string, Omit<CountryContext, 'paisId' | 'paisCodigo' | 'loading' | 'requiresSetup'>> = {
  'PE': {
    paisNombre: 'Perú',
    servicioFiscal: 'SUNAT',
    documentoFiscal: 'RUC',
    moneda: 'PEN',
    simboloMoneda: 'S/',
    impuesto: 'IGV (18%)',
    impuestoRate: 0.18,
  },
  'CO': {
    paisNombre: 'Colombia',
    servicioFiscal: 'DIAN',
    documentoFiscal: 'NIT',
    moneda: 'COP',
    simboloMoneda: 'COP',
    impuesto: 'IVA (19%)',
    impuestoRate: 0.19,
  },
  'CL': {
    paisNombre: 'Chile',
    servicioFiscal: 'SII',
    documentoFiscal: 'RUT',
    moneda: 'CLP',
    simboloMoneda: 'CLP',
    impuesto: 'IVA (19%)',
    impuestoRate: 0.19,
  },
  'MX': {
    paisNombre: 'México',
    servicioFiscal: 'SAT',
    documentoFiscal: 'RFC',
    moneda: 'MXN',
    simboloMoneda: 'MXN',
    impuesto: 'IVA (16%)',
    impuestoRate: 0.16,
  },
  'EC': {
    paisNombre: 'Ecuador',
    servicioFiscal: 'SRI',
    documentoFiscal: 'RUC',
    moneda: 'USD',
    simboloMoneda: 'USD',
    impuesto: 'IVA (12%)',
    impuestoRate: 0.12,
  },
};

const resolveCurrencySymbol = (currencyCode: string, fallbackSymbol: string) => {
  const normalized = currencyCode.toUpperCase();
  if (normalized === 'PEN') {
    return 'S/';
  }
  return normalized || fallbackSymbol;
};

// Transforma el payload crudo del backend al CountryContext consumido por la app.
// Función pura: facilita testing y reuso en `select` de useQuery.
function buildCountryContext(empresaConfig: any): CountryContext {
  if (!empresaConfig) return EMPTY_CONTEXT;

  const paisId = empresaConfig.pais_id ? Number(empresaConfig.pais_id) : 0;
  const paisCodigo = typeof empresaConfig.pais === 'string'
    ? empresaConfig.pais.toUpperCase()
    : '';
  const monedaDefecto = typeof empresaConfig.monedaDefecto === 'string'
    ? empresaConfig.monedaDefecto.toUpperCase()
    : '';

  if (!paisId || !paisCodigo) return EMPTY_CONTEXT;

  const countryData = CONTEXT_MAP[paisCodigo];
  if (!countryData) {
    return { ...EMPTY_CONTEXT, paisId, paisCodigo };
  }

  const resolvedMoneda = monedaDefecto || countryData.moneda;
  return {
    paisId,
    paisCodigo,
    ...countryData,
    moneda: resolvedMoneda,
    simboloMoneda: resolveCurrencySymbol(resolvedMoneda, countryData.simboloMoneda),
    requiresSetup: false,
    loading: false,
  };
}

async function fetchCountryContext(): Promise<any> {
  // /backend es el rewrite hacia el API (puerto 3002 en dev/local).
  // El trailing slash es necesario por next.config.js trailingSlash: true.
  const res = await fetch('/backend/api/configuration/context/country/', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return null;
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  return json?.data ?? json;
}

export const COUNTRY_CONTEXT_QUERY_KEY = ['configuration', 'context', 'country'] as const;

/**
 * Hook para obtener el contexto del país del tenant actual.
 * Cacheado con TanStack Query: el endpoint tarda ~2.6s contra Supabase y los
 * datos no cambian entre clicks, así que se comparte una única respuesta
 * entre todos los componentes que llaman a este hook durante la sesión.
 */
export function useCountryContext(): CountryContext {
  const { session } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: COUNTRY_CONTEXT_QUERY_KEY,
    queryFn: fetchCountryContext,
    select: buildCountryContext,
    enabled: !!session, // no llamar si aún no hay sesión hidratada
    staleTime: 5 * 60 * 1000, // 5 min: el país del tenant no cambia con frecuencia
    gcTime: 30 * 60 * 1000,   // 30 min en cache antes de garbage collect
    retry: 1,
  });

  if (isLoading) return INITIAL_CONTEXT;
  return data ?? EMPTY_CONTEXT;
}
