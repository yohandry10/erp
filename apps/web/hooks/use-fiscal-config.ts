import { useState, useEffect } from 'react'
import { useApi } from './use-api'

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
  const [config, setConfig] = useState<FiscalConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFiscalConfig() {
      try {
        const response = await get('/cpe/fiscal-config')
        
        if (response.success && response.data) {
          setConfig(response.data)
        } else {
          // Default to Peru if no config
          setConfig({
            paisCodigo: 'PE',
            paisNombre: 'Perú',
            servicioFiscal: 'SUNAT',
            impuestoPrincipal: 'IGV',
            tasaImpuesto: 0.18,
            documentoIdentidad: 'RUC',
            maxItemsPorDocumento: 999,
            montoMaximoDocumento: 999999999.99,
            simboloMoneda: 'S/',
          })
        }
      } catch (error) {
        console.error('Error loading fiscal config:', error)
        // Default to Peru on error
        setConfig({
          paisCodigo: 'PE',
          paisNombre: 'Perú',
          servicioFiscal: 'SUNAT',
          impuestoPrincipal: 'IGV',
          tasaImpuesto: 0.18,
          documentoIdentidad: 'RUC',
          maxItemsPorDocumento: 999,
          montoMaximoDocumento: 999999999.99,
          simboloMoneda: 'S/',
        })
      } finally {
        setLoading(false)
      }
    }

    loadFiscalConfig()
  }, [])

  return { config, loading }
}
