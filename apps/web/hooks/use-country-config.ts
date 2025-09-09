import { useState, useEffect } from 'react';
import { useCountryContext } from './use-country-context';
import { useApi } from './use-api';

// Actualizar interfaz para coincidir con ConfiguracionPaisDto del backend
interface CountryConfig {
  pais: {
    id: string;
    nombre: string;
    codigo_iso: string;
    codigo_fiscal: string;
    moneda_principal: string;
    zona_horaria: string;
    activo: boolean;
  };
  configuracion_fiscal: {
    id: string;
    requiere_libro_diario: boolean;
    requiere_libro_mayor: boolean;
    requiere_libro_inventarios: boolean;
    requiere_registro_compras: boolean;
    requiere_registro_ventas: boolean;
    formato_fecha: string;
    separador_decimal: string;
    separador_miles: string;
    moneda_principal: string;
    permite_multiples_monedas: boolean;
    requiere_autorizacion_sunat: boolean;
    url_webservice: string;
    activo: boolean;
  };
  tipos_documento: Array<{
    id: string;
    codigo: string;
    nombre: string;
    descripcion: string;
    longitud_minima: number;
    longitud_maxima: number;
    patron_validacion: string;
    activo: boolean;
  }>;
  tipos_impuesto: Array<{
    id: string;
    codigo: string;
    nombre: string;
    descripcion: string;
    tasa_porcentaje: number;
    es_retencion: boolean;
    activo: boolean;
  }>;
  formato_config: {
    formato_fecha: string;
    formato_hora: string;
    separador_decimal: string;
    separador_miles: string;
    simbolo_moneda: string;
    posicion_simbolo: string;
  };
  etiquetas_config: {
    documento_identidad: string;
    numero_documento: string;
    razon_social: string;
    direccion_fiscal: string;
    telefono: string;
    email: string;
  };
  reglas_validacion: {
    documento_identidad: {
      patron: string;
      mensaje_error: string;
      longitud_minima: number;
      longitud_maxima: number;
    };
    razon_social: {
      longitud_minima: number;
      longitud_maxima: number;
      caracteres_permitidos: string;
    };
  };
}

export const useCountryConfig = () => {
  const { selectedCountry } = useCountryContext();
  const { request } = useApi(); // Cambiar makeRequest por request
  const [config, setConfig] = useState<CountryConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedCountry) {
      loadCountryConfig();
    }
  }, [selectedCountry]);

  const loadCountryConfig = async () => {
    if (!selectedCountry) return;
    
    setLoading(true);
    try {
      const response = await request( // Cambiar makeRequest por request
        `/api/paises/${selectedCountry.id}/configuracion`,
        { method: 'GET' }
      );

      if (response?.success) {
        setConfig(response.data);
      }
    } catch (error) {
      console.error('Error cargando configuración del país:', error);
    } finally {
      setLoading(false);
    }
  };

  // Funciones helper actualizadas para la nueva estructura
  const getDocumentTypes = () => config?.tipos_documento || [];
  
  const getTaxTypes = () => config?.tipos_impuesto || [];
  
  const getCurrencies = () => {
    if (!config) return [];
    return [{
      code: config.pais.moneda_principal,
      name: config.pais.moneda_principal,
      symbol: config.formato_config.simbolo_moneda,
      decimals: 2
    }];
  };
  
  const getLabel = (key: string, defaultValue?: string) => {
    if (!config?.etiquetas_config) return defaultValue || key;
    return (config.etiquetas_config as any)[key] || defaultValue || key;
  };
  
  const getValidationRule = (field: string) => {
    if (!config?.reglas_validacion) return null;
    return (config.reglas_validacion as any)[field];
  };
  
  const isFieldRequired = (field: string) => {
    // Determinar campos requeridos basado en configuración fiscal
    const requiredFields = ['documento_identidad', 'razon_social'];
    if (config?.configuracion_fiscal.requiere_autorizacion_sunat) {
      requiredFields.push('direccion_fiscal');
    }
    return requiredFields.includes(field);
  };
  
  const formatCurrency = (amount: number) => {
    if (!config?.formato_config) return amount.toString();
    
    const { simbolo_moneda, separador_decimal, separador_miles, posicion_simbolo } = config.formato_config;
    
    // Formatear número con separadores
    const parts = amount.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separador_miles);
    const formattedNumber = parts.join(separador_decimal);
    
    // Posicionar símbolo de moneda
    return posicion_simbolo === 'antes' 
      ? `${simbolo_moneda}${formattedNumber}`
      : `${formattedNumber}${simbolo_moneda}`;
  };
  
  const formatDate = (date: Date, format: 'short' | 'long' | 'input' = 'short') => {
    if (!config?.formato_config) return date.toLocaleDateString();
    
    const formatString = config.formato_config.formato_fecha;
    
    // Convertir formato del backend a formato de JavaScript
    let jsFormat = formatString
      .replace('DD', date.getDate().toString().padStart(2, '0'))
      .replace('MM', (date.getMonth() + 1).toString().padStart(2, '0'))
      .replace('YYYY', date.getFullYear().toString());
    
    return jsFormat;
  };

  const formatNumber = (number: number) => {
    if (!config?.formato_config) return number.toString();
    
    const { separador_decimal, separador_miles } = config.formato_config;
    const parts = number.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separador_miles);
    return parts.join(separador_decimal);
  };

  return {
    config,
    loading,
    selectedCountry,
    getDocumentTypes,
    getTaxTypes,
    getCurrencies,
    getLabel,
    getValidationRule,
    isFieldRequired,
    formatCurrency,
    formatDate,
    formatNumber,
    reload: loadCountryConfig
  };
};