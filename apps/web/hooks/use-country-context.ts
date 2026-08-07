import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api-fetch';
import {
  ACTIVE_COUNTRIES,
  INITIAL_ACTIVE_COUNTRY_CODE,
  INITIAL_ACTIVE_COUNTRY_ID,
} from '@/lib/initial-country';

interface CountryContext {
  paisId: number;
  paisCodigo: string;
  paisNombre: string;
  servicioFiscal: string;
  documentoFiscal: string;
  moneda: string;
  simboloMoneda: string;
  impuesto: string; // IGV, IVA, etc.
  impuestoRate: number;
  locale: string;
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
  locale: 'es-PE',
  requiresSetup: true,
  loading: false,
};

const INITIAL_CONTEXT: CountryContext = {
  ...EMPTY_CONTEXT,
  requiresSetup: false,
  loading: true,
};

const CONTEXT_MAP: Record<string, Omit<CountryContext, 'paisId' | 'paisCodigo' | 'loading' | 'requiresSetup'>> = {
  ...Object.fromEntries(ACTIVE_COUNTRIES.map((country) => [
    country.codigo_iso,
    {
      paisNombre: country.nombre,
      servicioFiscal: country.nombre_fiscal,
      documentoFiscal: country.documento_fiscal,
      moneda: country.moneda_codigo,
      simboloMoneda: country.moneda_simbolo,
      impuesto: `${country.impuesto_nombre} (${country.impuesto_tasa * 100}%)`,
      impuestoRate: country.impuesto_tasa,
      locale: country.locale,
    },
  ])),
};

const resolveCurrencySymbol = (currencyCode: string, fallbackSymbol: string) => {
  const normalized = currencyCode.toUpperCase();
  if (normalized === 'PEN') {
    return 'S/';
  }
  if (normalized === 'ARS') {
    return '$';
  }
  if (normalized === 'COP') {
    return '$';
  }
  return normalized || fallbackSymbol;
};

// Transforma el payload crudo del backend al CountryContext consumido por la app.
// Función pura: facilita testing y reuso en `select` de useQuery.
function buildCountryContext(empresaConfig: any): CountryContext {
  if (!empresaConfig) return EMPTY_CONTEXT;

  const paisId = empresaConfig.pais_id ? Number(empresaConfig.pais_id) : Number(INITIAL_ACTIVE_COUNTRY_ID);
  const configuredCode = typeof empresaConfig.paisCodigo === 'string'
    ? empresaConfig.paisCodigo
    : empresaConfig.pais;
  const paisCodigo = typeof configuredCode === 'string'
    ? configuredCode.toUpperCase()
    : INITIAL_ACTIVE_COUNTRY_CODE;
  const rawCurrency = empresaConfig.monedaDefecto ?? empresaConfig.moneda;
  const monedaDefecto = typeof rawCurrency === 'string'
    ? rawCurrency.toUpperCase()
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
  const res = await fetchApi('/api/configuration/context/country/');
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
    // El tenant forma parte de la identidad del dato. Sin este segmento, al
    // cerrar una demo PE y entrar a una AR en la misma pestaña React Query
    // reutilizaba durante cinco minutos el país del tenant anterior.
    queryKey: [...COUNTRY_CONTEXT_QUERY_KEY, session?.user?.tenant_id ?? 'anonymous'],
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
