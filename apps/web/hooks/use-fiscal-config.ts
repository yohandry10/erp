import { useState, useEffect } from 'react'
import { useApi } from './use-api'
import { apiSucceeded, unwrapApiData } from '@/lib/api-contract'
import { useCountryContext } from './use-country-context'

interface FiscalConfig {
  paisCodigo: string
  paisNombre: string
  servicioFiscal: string // 'SUNAT', 'DIAN', etc.
  impuestoPrincipal: string // 'IGV', 'IVA'
  tasaImpuesto: number
  documentoIdentidad: string // 'RUC', 'NIT', etc.
  maxItemsPorDocumento: number
  montoMaximoDocumento: number
  simboloMoneda: string
}

export function useFiscalConfig() {
  const { get } = useApi()
  const country = useCountryContext()
  const [config, setConfig] = useState<FiscalConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFiscalConfig() {
      try {
        const response = await get('/cpe/fiscal-config')
        
        const config = unwrapApiData<FiscalConfig | null>(response, null)
        if (apiSucceeded(response) && config) {
          setConfig(config)
        } else {
          setConfig({
            paisCodigo: country.paisCodigo || 'PE',
            paisNombre: country.paisNombre || 'Perú',
            servicioFiscal: country.servicioFiscal || 'SUNAT',
            impuestoPrincipal: country.paisCodigo === 'PE' ? 'IGV' : 'IVA',
            tasaImpuesto: country.impuestoRate || 0.18,
            documentoIdentidad: country.documentoFiscal || 'RUC',
            maxItemsPorDocumento: country.paisCodigo === 'CO' ? 1000 : 999,
            montoMaximoDocumento: 999999999.99,
            simboloMoneda: country.simboloMoneda || 'S/',
          })
        }
      } catch (error) {
        console.error('Error loading fiscal config:', error)
        setConfig({
          paisCodigo: country.paisCodigo || 'PE',
          paisNombre: country.paisNombre || 'Perú',
          servicioFiscal: country.servicioFiscal || 'SUNAT',
          impuestoPrincipal: country.paisCodigo === 'PE' ? 'IGV' : 'IVA',
          tasaImpuesto: country.impuestoRate || 0.18,
          documentoIdentidad: country.documentoFiscal || 'RUC',
          maxItemsPorDocumento: country.paisCodigo === 'CO' ? 1000 : 999,
          montoMaximoDocumento: 999999999.99,
          simboloMoneda: country.simboloMoneda || 'S/',
        })
      } finally {
        setLoading(false)
      }
    }

    loadFiscalConfig()
  }, [
    country.documentoFiscal,
    country.impuestoRate,
    country.paisCodigo,
    country.paisNombre,
    country.servicioFiscal,
    country.simboloMoneda,
    get,
  ])

  return { config, loading }
}
