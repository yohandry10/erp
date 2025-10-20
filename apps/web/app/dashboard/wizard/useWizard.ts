'use client'

import { useCallback } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useWizardContext } from './WizardContext'
import { WizardConfiguration } from './types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export function useWizard() {
  const {
    state,
    goToStep,
    nextStep,
    previousStep,
    updateConfiguration,
    updateValidationResults,
    markStepComplete,
    setLoading,
    setError,
  } = useWizardContext()

  const loadProgress = async () => {
    try {
      setLoading(true)
      
      // Obtener token de sesión de Supabase
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      const response = await fetch(`${API_BASE_URL}/api/configuration/wizard/progress`, { headers })
      
      if (!response.ok) {
        // Si no hay progreso guardado, simplemente continuar
        console.log('No previous wizard progress found, starting fresh')
        setLoading(false)
        return
      }

      const data = await response.json()
      
      if (data.success && data.data) {
        const progress = data.data
        
        // Restaurar configuración temporal si existe
        if (progress.configuracionTemporal) {
          updateConfiguration(progress.configuracionTemporal)
        }
        
        // Marcar pasos completados (backend uses 1-indexed, frontend uses 0-indexed)
        if (Array.isArray(progress.pasosCompletados)) {
          progress.pasosCompletados.forEach((stepNumber: number) => {
            const stepIndex = stepNumber - 1 // Convert from 1-indexed to 0-indexed
            if (stepIndex >= 0 && stepIndex < 5) { // 5 steps total
              markStepComplete(stepIndex)
            }
          })
        }
        
        // Ir al paso actual (backend uses 1-indexed, frontend uses 0-indexed)
        if (progress.pasoActual !== undefined && progress.pasoActual > 0) {
          goToStep(progress.pasoActual - 1) // Convert from 1-indexed to 0-indexed
        }
      }
    } catch (error) {
      console.error('Error loading wizard progress:', error)
      // Don't set error on initial load failure - just log it
      console.warn('Could not load wizard progress, starting fresh')
    } finally {
      setLoading(false)
    }
  }

  const saveStepProgress = async (stepId: string, stepData: any) => {
    try {
      setLoading(true)
      
      // Obtener token de sesión
      const supabase = createClientComponentClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      
      // Backend expects pasoActual to be 1-indexed (1, 2, 3...), not 0-indexed
      const pasoActual = state.currentStep + 1
      
      const response = await fetch(`${API_BASE_URL}/api/configuration/wizard/step`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          pasoActual,
          configuracionTemporal: {
            stepId,
            ...stepData,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Error al guardar el progreso')
      }

      const data = await response.json()
      
      if (data.success) {
        markStepComplete(state.currentStep)
      }
      
      return data
    } catch (error) {
      console.error('Error saving step progress:', error)
      setError(error instanceof Error ? error.message : 'Error al guardar')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const validateCertificate = async () => {
    try {
      setLoading(true)
      
      // Validate locally first (don't need backend for basic validation)
      const errors: string[] = []
      const warnings: string[] = []
      let isValid = true
      
      if (!state.configuration.certificateBase64) {
        errors.push('No se ha cargado un certificado digital')
        isValid = false
      }
      
      if (!state.configuration.certificatePassword) {
        errors.push('No se ha configurado la contraseña del certificado')
        isValid = false
      }
      
      if (state.configuration.certificateFile) {
        const fileName = state.configuration.certificateFile.name?.toLowerCase() || ''
        if (fileName && !fileName.endsWith('.pfx') && !fileName.endsWith('.p12')) {
          errors.push('El archivo debe ser un certificado .pfx o .p12')
          isValid = false
        }
      }
      
      updateValidationResults({
        certificate: {
          isValid,
          errors,
          warnings,
        }
      })
      
      return { success: true, data: { isValid, errors, warnings } }
    } catch (error) {
      console.error('Error validating certificate:', error)
      setError(error instanceof Error ? error.message : 'Error al validar certificado')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const validateRuc = useCallback(async () => {
    const { ruc, razonSocial, direccion } = state.configuration
    
    try {
      setLoading(true)
      
      // Validate locally (don't need backend for basic validation)
      const errors: string[] = []
      const missingFields: string[] = []
      let isValid = true
      
      if (!ruc) {
        missingFields.push('RUC')
        isValid = false
      } else if (ruc.length !== 11) {
        errors.push('El RUC debe tener 11 dígitos')
        isValid = false
      }
      
      if (!razonSocial) {
        missingFields.push('Razón Social')
        isValid = false
      }
      
      if (!direccion) {
        missingFields.push('Dirección Fiscal')
        isValid = false
      }
      
      updateValidationResults({
        ruc: {
          isValid,
          errors,
          missingFields,
        }
      })
      
      return { success: true, data: { isValid, errors, missingFields } }
    } catch (error) {
      console.error('Error validating RUC:', error)
      setError(error instanceof Error ? error.message : 'Error al validar RUC')
      throw error
    } finally {
      setLoading(false)
    }
  }, [state.configuration, updateValidationResults, setLoading, setError])

  const completeWizard = useCallback(async () => {
    const configuration = state.configuration
    
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE_URL}/api/configuration/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configuration,
        }),
      })

      if (!response.ok) {
        throw new Error('Error al completar la configuración')
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error completing wizard:', error)
      setError(error instanceof Error ? error.message : 'Error al completar')
      throw error
    } finally {
      setLoading(false)
    }
  }, [state.configuration, setLoading, setError])

  const canGoNext = useCallback(() => {
    const currentStepData = state.steps[state.currentStep]
    
    // Welcome step can always proceed
    if (currentStepData.id === 'welcome') {
      return true
    }
    
    // Company type step requires tipo_empresa selection
    if (currentStepData.id === 'company-type') {
      return !!state.configuration.tipo_empresa
    }
    
    // RUC step requires all fields
    if (currentStepData.id === 'ruc') {
      return !!(
        state.configuration.ruc &&
        state.configuration.razonSocial &&
        state.configuration.direccion
      )
    }
    
    // Certificate step requires file and password
    if (currentStepData.id === 'certificate') {
      return !!(
        state.configuration.certificateBase64 &&
        state.configuration.certificatePassword
      )
    }
    
    // Validation step requires successful validations
    if (currentStepData.id === 'validation') {
      return !!(
        state.validationResults.certificate?.isValid &&
        state.validationResults.ruc?.isValid
      )
    }
    
    return currentStepData.isComplete
  }, [state])

  return {
    state,
    goToStep,
    nextStep,
    previousStep,
    updateConfiguration,
    loadProgress,
    saveStepProgress,
    validateCertificate,
    validateRuc,
    completeWizard,
    canGoNext,
  }
}
