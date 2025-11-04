/**
 * Hook para obtener la configuración fiscal del tenant
 * Consulta la tasa de IGV/IVA desde configuracion_fiscal
 */
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/hooks/use-api'

export interface TaxConfig {
  tasa_igv: number
  moneda_principal: string
  pais_id: number
  impuesto_principal_nombre: string
  impuesto_principal_porcentaje: number
}

export function useTaxConfig() {
  const api = useApi()

  const { data, isLoading, error } = useQuery({
    queryKey: ['tax-config'],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: TaxConfig }>('/api/configuracion-fiscal')
      return response.data
    },
    staleTime: 1000 * 60 * 60, // Cache por 1 hora (la configuración fiscal no cambia frecuentemente)
    cacheTime: 1000 * 60 * 60 * 24, // Mantener en cache por 24 horas
  })

  /**
   * Calcula los impuestos para un subtotal dado
   */
  const calcularImpuestos = (subtotal: number) => {
    const tasaIgv = data?.impuesto_principal_porcentaje ?? data?.tasa_igv ?? 0.18
    const igv = subtotal * tasaIgv
    const total = subtotal + igv

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      igv: Math.round(igv * 100) / 100,
      total: Math.round(total * 100) / 100,
      tasaIgv,
    }
  }

  /**
   * Obtiene solo la tasa de IGV/IVA
   */
  const getTasaIgv = () => {
    return data?.impuesto_principal_porcentaje ?? data?.tasa_igv ?? 0.18
  }

  /**
   * Obtiene el nombre del impuesto (IGV, IVA, etc.)
   */
  const getNombreImpuesto = () => {
    return data?.impuesto_principal_nombre ?? 'IGV'
  }

  return {
    taxConfig: data,
    isLoading,
    error,
    calcularImpuestos,
    getTasaIgv,
    getNombreImpuesto,
    tasaIgv: getTasaIgv(), // Atajo para acceso directo
    nombreImpuesto: getNombreImpuesto(),
  }
}
