/**
 * Hook para obtener la configuración fiscal del tenant
 * Consulta la tasa de IGV/IVA desde configuracion_fiscal
 */
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/hooks/use-api'
import { apiSucceeded, unwrapApiData } from '@/lib/api-contract'
import { useCountryContext } from './use-country-context'
import { multiplicarMoneda, redondearMoneda } from '@/lib/format-utils'

export interface TaxConfig {
  tasa_igv: number
  moneda_principal: string
  pais_id: number
  impuesto_principal_nombre: string
  impuesto_principal_porcentaje: number
}

export function useTaxConfig() {
  const api = useApi()
  const country = useCountryContext()

  const { data, isLoading, error } = useQuery({
    queryFn: async () => {
      const response = await api.get('/api/configuracion-fiscal')
      const config = unwrapApiData<TaxConfig | null>(response, null)
      if (apiSucceeded(response) && config) {
        return config
      }
      // Respaldo para que la pantalla pueda dibujarse sin la configuración fiscal.
      // Sale del catálogo de países, que trae la tasa legal de cada uno; con `||`
      // una tasa 0 —contexto de país sin resolver, donde `impuestoRate` vale 0— se
      // convertía en el 18 % peruano. Con `??` sólo sustituye lo que falta de
      // verdad. El importe del documento lo fija el servidor; esto es lo que ve el
      // usuario mientras tanto.
      return {
        tasa_igv: country.impuestoRate ?? 0,
        moneda_principal: country.moneda || '',
        pais_id: country.paisId,
        impuesto_principal_nombre: country.impuesto || '',
        impuesto_principal_porcentaje: country.impuestoRate ?? 0,
      } as TaxConfig
    },
    enabled: Boolean(country.paisId),
    queryKey: ['tax-config', country.paisId],
    staleTime: 1000 * 60 * 60, // Cache por 1 hora (la configuración fiscal no cambia frecuentemente)
    gcTime: 1000 * 60 * 60 * 24, // Mantener en cache por 24 horas (antes era cacheTime)
  })

  /**
   * Calcula los impuestos para un subtotal dado
   */
  const calcularImpuestos = (subtotal: number) => {
    const tasaIgv = data?.impuesto_principal_porcentaje ?? data?.tasa_igv ?? country.impuestoRate ?? 0
    // `Math.round(subtotal * tasaIgv * 100) / 100` deja un céntimo de menos en 810
    // de cada 200 000 bases al 18 %: 1,25 debe dar 0,23 y daba 0,22.
    const igv = multiplicarMoneda(subtotal, tasaIgv)

    return {
      subtotal: redondearMoneda(subtotal),
      igv,
      total: redondearMoneda(subtotal + igv),
      tasaIgv,
    }
  }

  /**
   * Obtiene solo la tasa de IGV/IVA
   */
  const getTasaIgv = () => {
    return data?.impuesto_principal_porcentaje ?? data?.tasa_igv ?? country.impuestoRate ?? 0
  }

  /**
   * Obtiene el nombre del impuesto (IGV, IVA, etc.)
   */
  const getNombreImpuesto = () => {
    const rawName = data?.impuesto_principal_nombre
      ?? country.impuesto
      ?? (country.paisCodigo === 'PE' ? 'IGV' : 'IVA')
    // El contexto de país usa etiquetas completas como `IGV (18%)`, mientras
    // las pantallas que consumen este hook añaden la tasa por separado. Se
    // normaliza aquí para no terminar mostrando `IGV (18%) (18%)` cuando el
    // endpoint fiscal todavía no respondió o usa el fallback de país.
    return rawName.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\)\s*$/u, '').trim()
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
