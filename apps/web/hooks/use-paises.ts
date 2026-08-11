'use client'

import { useState, useEffect } from 'react'
import { useApi } from './use-api'
import { apiSucceeded, unwrapApiArray, unwrapApiData } from '@/lib/api-contract'
import { fetchApi } from '@/lib/api-fetch'
import {
  ACTIVE_COUNTRIES,
  INITIAL_ACTIVE_COUNTRY_ID,
  isActiveCountryId,
  keepInitialActiveCountry,
} from '@/lib/initial-country'

// Interfaces actualizadas para coincidir con la API
export interface Pais {
  id: number
  codigo_iso: string
  nombre: string
  nombre_fiscal: string
  moneda_codigo: string
  moneda_simbolo: string
  activo: boolean
}

export interface ConfiguracionFiscal {
  id: number
  pais_id: number
  impuesto_principal_nombre: string
  impuesto_principal_porcentaje: number
  documento_identidad_empresa: string
  longitud_documento_empresa: number
  formato_fecha?: string
  separador_decimal?: string
  separador_miles?: string
}

export interface UsuarioConfiguracion {
  id: string
  usuario_id: string
  pais_preferido_id?: number
  idioma?: string
  zona_horaria?: string
}

export function usePaises() {
  const [paises, setPaises] = useState<Pais[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { get, put, request } = useApi()

  // Cargar países desde la API real
  const loadPaises = async (signal?: AbortSignal) => {
    const requestController = new AbortController()
    const timeoutId = window.setTimeout(() => requestController.abort(), 10000)
    const abortFromParent = () => requestController.abort()
    signal?.addEventListener('abort', abortFromParent, { once: true })

    try {
      setLoading(true)
      setError(null)

      // Endpoint público del API: login debe cargar países antes de tener sesión.
      const response = await fetchApi('/api/paises/', {
        method: 'GET',
        signal: requestController.signal,
      })

      if (response.ok) {
        const data = await response.json()
        const paises = unwrapApiArray<Pais>(data)
        if (apiSucceeded(data) && paises.length > 0) {
          setPaises(keepInitialActiveCountry(paises))
        } else {
          throw new Error('Error al obtener países')
        }
      } else {
        throw new Error(`Error ${response.status}: ${response.statusText}`)
      }
    } catch (err) {
      if (signal?.aborted) {
        return
      }
      setError('Error de conexión con el servidor')
      if (process.env.NODE_ENV !== 'production') {
        const detail = err instanceof Error ? err.message : String(err)
        console.info('[usePaises] Usando fallback local de países:', detail)
      }

      // Fallback local del alcance activo: Perú/SUNAT y Argentina/ARCA.
      setPaises([...ACTIVE_COUNTRIES] as Pais[])
    } finally {
      window.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', abortFromParent)
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  // Obtener configuración fiscal por código de país
  const getConfiguracionFiscal = async (codigoPais: string): Promise<ConfiguracionFiscal | null> => {
    try {
      const response = await get(`/api/paises/${codigoPais}/configuracion-fiscal`)
      return apiSucceeded(response) ? unwrapApiData<ConfiguracionFiscal | null>(response, null) : null
    } catch (err) {
      console.error('Error getting fiscal configuration:', err)
      return null
    }
  }

  // Obtener configuración del usuario (ENVÍA x-country-id)
  const getUserConfiguration = async (): Promise<UsuarioConfiguracion | null> => {
    try {
      let countryId: string | null = INITIAL_ACTIVE_COUNTRY_ID
      if (typeof window !== 'undefined') {
        const storedCountryId = window.localStorage.getItem('selectedCountry')
        countryId = isActiveCountryId(storedCountryId) ? storedCountryId : INITIAL_ACTIVE_COUNTRY_ID
      }

      const headers: Record<string, string> = {}
      if (countryId && /^\d+$/.test(countryId)) {
        headers['x-country-id'] = countryId
      }

      const response = await request('/api/paises/usuario/configuracion', {
        method: 'GET',
        headers,
      })

      return apiSucceeded(response) ? unwrapApiData<UsuarioConfiguracion | null>(response, null) : null
    } catch (err) {
      console.error('Error getting user configuration:', err)
      return null
    }
  }

  // Actualizar configuración del usuario
  const updateUserConfiguration = async (configuracion: Partial<UsuarioConfiguracion>) => {
    try {
      const intentStorageKey = 'country-preference-intent'
      let idempotencyKey = window.sessionStorage.getItem(intentStorageKey)
      if (!idempotencyKey) {
        idempotencyKey = `country-preference-${window.crypto.randomUUID()}`
        window.sessionStorage.setItem(intentStorageKey, idempotencyKey)
      }
      const response = await put('/api/paises/usuario/configuracion', {
        ...configuracion,
        pais_preferido_id: configuracion.pais_preferido_id &&
          isActiveCountryId(configuracion.pais_preferido_id)
          ? Number(configuracion.pais_preferido_id)
          : Number(INITIAL_ACTIVE_COUNTRY_ID),
      }, { headers: { 'Idempotency-Key': idempotencyKey } })
      const succeeded = apiSucceeded(response)
      if (succeeded) window.sessionStorage.removeItem(intentStorageKey)
      return succeeded
    } catch (err) {
      console.error('Error updating user configuration:', err)
      return false
    }
  }

  // Validar documento empresarial
  const validateDocument = async (codigoPais: string, documento: string) => {
    try {
      const response = await get(`/api/paises/${codigoPais}/validar-documento/${documento}`)
      return apiSucceeded(response) ? unwrapApiData(response, null) : null
    } catch (err) {
      console.error('Error validating document:', err)
      return null
    }
  }

  // Obtener libros contables requeridos
  const getLibrosRequeridos = async (codigoPais: string) => {
    try {
      const response = await get(`/api/paises/${codigoPais}/libros-requeridos`)
      return apiSucceeded(response) ? unwrapApiData(response, null) : null
    } catch (err) {
      console.error('Error getting required books:', err)
      return null
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    loadPaises(controller.signal)
    return () => controller.abort()
  }, [])

  return {
    paises,
    loading,
    error,
    loadPaises,
    getConfiguracionFiscal,
    getUserConfiguration,
    updateUserConfiguration,
    validateDocument,
    getLibrosRequeridos
  }
}
