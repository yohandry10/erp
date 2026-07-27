'use client'

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react'
import { useApi } from './use-api'

export type TipoEmpresa = 'MICRO' | 'PEQUEÑA' | 'MEDIANA' | 'GRANDE'

export interface EmpresaConfig {
  id?: string
  ruc?: string
  razonSocial?: string
  nombreComercial?: string
  direccion?: string
  telefono?: string
  email?: string
  sitioWeb?: string
  representanteLegal?: string
  regimen?: string
  igvPorcentaje?: number
  tipo_empresa: TipoEmpresa
  usar_flujo_logistica: boolean
  gre_obligatorio: boolean
  gre_automatico_habilitado: boolean
  umbral_gre_automatico: number
}

interface EmpresaConfigContextValue {
  config: EmpresaConfig | null
  loading: boolean
  error: string | null
  refreshConfig: () => Promise<void>
  isFlujologistica: boolean
  isGreObligatorio: boolean
  isGreAutomatico: boolean
  umbralGre: number
}

const EmpresaConfigContext = createContext<EmpresaConfigContextValue | undefined>(undefined)

const defaultConfig: EmpresaConfig = {
  tipo_empresa: 'MICRO',
  usar_flujo_logistica: false,
  gre_obligatorio: false,
  gre_automatico_habilitado: false,
  umbral_gre_automatico: 700,
}

function normalizeEmpresaConfig(response: any): EmpresaConfig {
  const data = response?.data ?? response ?? {}

  return {
    id: data.id,
    ruc: data.ruc,
    razonSocial: data.razonSocial,
    nombreComercial: data.nombreComercial,
    direccion: data.direccion,
    telefono: data.telefono,
    email: data.email,
    sitioWeb: data.sitioWeb,
    representanteLegal: data.representanteLegal,
    regimen: data.regimen,
    igvPorcentaje: data.igvPorcentaje,
    tipo_empresa: data.tipo_empresa || defaultConfig.tipo_empresa,
    usar_flujo_logistica: data.usar_flujo_logistica !== undefined
      ? data.usar_flujo_logistica
      : defaultConfig.usar_flujo_logistica,
    gre_obligatorio: data.gre_obligatorio !== undefined
      ? data.gre_obligatorio
      : defaultConfig.gre_obligatorio,
    gre_automatico_habilitado: data.gre_automatico_habilitado !== undefined
      ? data.gre_automatico_habilitado
      : defaultConfig.gre_automatico_habilitado,
    umbral_gre_automatico: data.umbral_gre_automatico || defaultConfig.umbral_gre_automatico,
  }
}

export function EmpresaConfigProvider({ children }: { children: ReactNode }) {
  const { get } = useApi()
  const [config, setConfig] = useState<EmpresaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await get('/api/configuration/context/country')

      if (response) {
        setConfig(normalizeEmpresaConfig(response))
      } else {
        setConfig(defaultConfig)
      }
    } catch (err) {
      console.error('Error loading empresa config:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar configuración')
      setConfig(defaultConfig)
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const refreshConfig = useCallback(async () => {
    await loadConfig()
  }, [loadConfig])

  const contextValue: EmpresaConfigContextValue = {
    config,
    loading,
    error,
    refreshConfig,
    isFlujologistica: config?.usar_flujo_logistica || false,
    isGreObligatorio: config?.gre_obligatorio || false,
    isGreAutomatico: config?.gre_automatico_habilitado !== false,
    umbralGre: config?.umbral_gre_automatico || 700,
  }

  return (
    <EmpresaConfigContext.Provider value={contextValue}>
      {children}
    </EmpresaConfigContext.Provider>
  )
}

export function useEmpresaConfig() {
  const context = useContext(EmpresaConfigContext)
  if (context === undefined) {
    throw new Error('useEmpresaConfig must be used within an EmpresaConfigProvider')
  }
  return context
}

export function useEmpresaConfigStandalone() {
  const { get } = useApi()
  const [config, setConfig] = useState<EmpresaConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await get('/api/configuration/context/country')

      if (response) {
        setConfig(normalizeEmpresaConfig(response))
      } else {
        setConfig(defaultConfig)
      }
    } catch (err) {
      console.error('Error loading empresa config:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar configuración')
      setConfig(defaultConfig)
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  return {
    config,
    loading,
    error,
    refreshConfig: loadConfig,
    isFlujologistica: config?.usar_flujo_logistica || false,
    isGreObligatorio: config?.gre_obligatorio || false,
    isGreAutomatico: config?.gre_automatico_habilitado !== false,
    umbralGre: config?.umbral_gre_automatico || 700,
  }
}
