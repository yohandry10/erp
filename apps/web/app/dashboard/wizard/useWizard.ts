'use client'

import { useCallback } from 'react'
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
      
      // Obtener token del localStorage (custom auth)
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      // PRIMERO: Verificar si la configuración ya está completa
      const statusResponse = await fetch(`${API_BASE_URL}/api/configuration/status`, { headers })
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        
        // Si la configuración está completa, marcar todos los pasos como completados y ir al último paso
        if (statusData.success && statusData.data?.isComplete) {
          console.log('✅ Configuration already complete, marking all steps as done')
          
          // Marcar todos los pasos como completados
          state.steps.forEach((_, index) => {
            markStepComplete(index)
          })
          
          // Ir al último paso (Completado)
          goToStep(state.steps.length - 1)
          setLoading(false)
          return
        }
      }
      
      // SEGUNDO: Si no está completa, cargar el progreso del wizard
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
        
        // Si el wizard está marcado como completado, ir al último paso
        if (progress.completado) {
          console.log('✅ Wizard marked as completed, going to final step')
          
          // Marcar todos los pasos como completados
          state.steps.forEach((_, index) => {
            markStepComplete(index)
          })
          
          // Ir al último paso
          goToStep(state.steps.length - 1)
          setLoading(false)
          return
        }
        
        // Restaurar configuración temporal si existe
        if (progress.configuracionTemporal) {
          updateConfiguration(progress.configuracionTemporal)
        }
        
        // Marcar pasos completados (backend uses 1-indexed, frontend uses 0-indexed)
        if (Array.isArray(progress.pasosCompletados)) {
          progress.pasosCompletados.forEach((stepNumber: number) => {
            const stepIndex = stepNumber - 1 // Convert from 1-indexed to 0-indexed
            if (stepIndex >= 0 && stepIndex < state.steps.length) {
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
      
      // Obtener token del localStorage (custom auth)
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
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
      
      // Obtener token del localStorage (custom auth)
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      
      if (!token) {
        throw new Error('No hay sesión activa')
      }
      
      const response = await fetch(`${API_BASE_URL}/api/configuration/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          configuration,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Error al completar la configuración')
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
    
    // Fiscal step requires regimen_tributario and series
    if (currentStepData.id === 'fiscal') {
      return !!(
        state.configuration.regimen_tributario &&
        state.configuration.serie_factura &&
        state.configuration.serie_boleta
      )
    }
    
    // TODO: Descomentar cuando se reactive el paso SUNAT
    // SUNAT step - if OSE is active, requires credentials
    // if (currentStepData.id === 'sunat') {
    //   if (state.configuration.ose_activo) {
    //     return !!(
    //       state.configuration.ose_url &&
    //       state.configuration.ose_username &&
    //       state.configuration.ose_password
    //     )
    //   }
    //   // If OSE is not active, can proceed
    //   return true
    // }
    
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
