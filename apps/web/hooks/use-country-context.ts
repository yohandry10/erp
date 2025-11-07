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
  loading: boolean;
}

const DEFAULT_CONTEXT: CountryContext = {
  paisId: 1,
  paisCodigo: 'PE',
  paisNombre: 'Perú',
  servicioFiscal: 'SUNAT',
  documentoFiscal: 'RUC',
  moneda: 'PEN',
  simboloMoneda: 'S/',
  impuesto: 'IGV',
  loading: true,
};

/**
 * Hook para obtener el contexto del país del tenant actual
 * Detecta automáticamente el país y retorna textos dinámicos
 */
export function useCountryContext(): CountryContext {
  const [context, setContext] = useState<CountryContext>(DEFAULT_CONTEXT);
  const api = useApi();

  useEffect(() => {
    loadCountryContext();
  }, []);

  const loadCountryContext = async () => {
    try {
      // Obtener configuración de la empresa que incluye país
      const response = await api.get('/api/configuracion/empresa');
      
      if (response?.data) {
        const paisId = response.data.pais_id || 1;
        const paisCodigo = response.data.pais || 'PE';
        
        // Mapear según país
        const contextMap: Record<string, Partial<CountryContext>> = {
          'PE': {
            paisId: 1,
            paisCodigo: 'PE',
            paisNombre: 'Perú',
            servicioFiscal: 'SUNAT',
            documentoFiscal: 'RUC',
            moneda: 'PEN',
            simboloMoneda: 'S/',
            impuesto: 'IGV (18%)',
          },
          'CO': {
            paisId: 2,
            paisCodigo: 'CO',
            paisNombre: 'Colombia',
            servicioFiscal: 'DIAN',
            documentoFiscal: 'NIT',
            moneda: 'COP',
            simboloMoneda: '$',
            impuesto: 'IVA (19%)',
          },
          'CL': {
            paisId: 3,
            paisCodigo: 'CL',
            paisNombre: 'Chile',
            servicioFiscal: 'SII',
            documentoFiscal: 'RUT',
            moneda: 'CLP',
            simboloMoneda: '$',
            impuesto: 'IVA (19%)',
          },
          'MX': {
            paisId: 4,
            paisCodigo: 'MX',
            paisNombre: 'México',
            servicioFiscal: 'SAT',
            documentoFiscal: 'RFC',
            moneda: 'MXN',
            simboloMoneda: '$',
            impuesto: 'IVA (16%)',
          },
          'EC': {
            paisId: 5,
            paisCodigo: 'EC',
            paisNombre: 'Ecuador',
            servicioFiscal: 'SRI',
            documentoFiscal: 'RUC',
            moneda: 'USD',
            simboloMoneda: '$',
            impuesto: 'IVA (12%)',
          },
        };

        const countryData = contextMap[paisCodigo.toUpperCase()] || contextMap['PE'];
        
        setContext({
          ...countryData,
          loading: false,
        } as CountryContext);
      } else {
        setContext({ ...DEFAULT_CONTEXT, loading: false });
      }
    } catch (error) {
      console.error('Error loading country context:', error);
      setContext({ ...DEFAULT_CONTEXT, loading: false });
    }
  };

  return context;
}
