import { useState, useEffect } from 'react';
import { useApi } from './use-api';

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

/**
 * Hook para obtener el contexto del país del tenant actual
 * Detecta automáticamente el país y retorna textos dinámicos
 */
export function useCountryContext(): CountryContext {
  const [context, setContext] = useState<CountryContext>(INITIAL_CONTEXT);
  const api = useApi();

  useEffect(() => {
    loadCountryContext();
  }, []);

  const loadCountryContext = async () => {
    try {
      // Obtener configuración de la empresa que incluye país
      const response = await api.get('/api/configuration/context/country');
      const empresaConfig = response?.data ?? response;
      
      if (empresaConfig) {
        const paisId = empresaConfig.pais_id ? Number(empresaConfig.pais_id) : 0;
        const paisCodigo = typeof empresaConfig.pais === 'string'
          ? empresaConfig.pais.toUpperCase()
          : '';
        const monedaDefecto = typeof empresaConfig.monedaDefecto === 'string'
          ? empresaConfig.monedaDefecto.toUpperCase()
          : '';

        if (!paisId || !paisCodigo) {
          setContext(EMPTY_CONTEXT);
          return;
        }

        const countryData = CONTEXT_MAP[paisCodigo];
        if (!countryData) {
          setContext({
            ...EMPTY_CONTEXT,
            paisId,
            paisCodigo,
          });
          return;
        }

        const resolvedMoneda = monedaDefecto || countryData.moneda;
        const resolvedSymbol = resolveCurrencySymbol(resolvedMoneda, countryData.simboloMoneda);

        setContext({
          paisId,
          paisCodigo,
          ...countryData,
          moneda: resolvedMoneda,
          simboloMoneda: resolvedSymbol,
          requiresSetup: false,
          loading: false,
        });
      } else {
        setContext(EMPTY_CONTEXT);
      }
    } catch (error) {
      console.error('Error loading country context:', error);
      setContext(EMPTY_CONTEXT);
    }
  };

  return context;
}
