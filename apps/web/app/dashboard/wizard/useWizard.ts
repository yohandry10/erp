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
    setPersistedConfiguration,
    resetWizardState,
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
        
        // VALIDACIÓN ESTRICTA: Solo marcar como completo si TODOS los campos críticos existen
        const isReallyComplete = statusData.success && 
          statusData.data?.isComplete === true &&
          statusData.data?.certificate?.exists === true &&
          statusData.data?.certificate?.isValid === true &&
          statusData.data?.ruc?.isConfigured === true &&
          (!statusData.data?.ruc?.missingFields || statusData.data.ruc.missingFields.length === 0)
        
        if (isReallyComplete) {
          console.log('✅ Configuration already complete - showing summary view')
          
          // Marcar todos los pasos como completados
          state.steps.forEach((_, index) => {
            markStepComplete(index)
          })
          
          // Ir al paso de resumen (último paso + 1 = modo resumen)
          // Usamos un flag especial para indicar que estamos en modo resumen
          setPersistedConfiguration(true)
          
          // Ir al último paso (completion) que ahora mostrará el resumen
          goToStep(state.steps.length - 1)
          
          setLoading(false)
          return
        } else if (statusData.success && statusData.data?.isComplete === true) {
          // Si dice que está completo pero faltan validaciones, resetear
          console.warn('⚠️ Configuration marked as complete but validations failed, resetting wizard')
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
        
        // Restaurar configuración temporal si existe
        if (progress.configuracionTemporal) {
          updateConfiguration(progress.configuracionTemporal)
        }
        
        // Restaurar pasos completados
        if (Array.isArray(progress.pasosCompletados) && progress.pasosCompletados.length > 0) {
          progress.pasosCompletados.forEach((stepNumber: number) => {
            const stepIndex = stepNumber - 1
            if (stepIndex >= 0 && stepIndex < state.steps.length) {
              markStepComplete(stepIndex)
            }
          })
          
          // Si el paso de validación (paso 6, índice 5) está completado, ir al último paso
          if (progress.pasosCompletados.includes(6)) {
            console.log('✅ Validation step completed - going to final step')
            goToStep(state.steps.length - 1)
            setLoading(false)
            return
          }
        }
        
        // Ir al paso actual guardado
        if (progress.pasoActual !== undefined && progress.pasoActual > 0) {
          goToStep(progress.pasoActual - 1)
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

  const saveStepProgress = async (stepId: string, stepData: any, options?: { silent?: boolean }) => {
    const showLoader = !options?.silent
    try {
      if (showLoader) {
        setLoading(true)
      }
      
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
      if (showLoader) {
        setLoading(false)
      }
    }
  }

  const validateCertificate = async () => {
    const { certificateBase64, certificatePassword, certificateFile } = state.configuration

    try {

      const errors: string[] = []
      const warnings: string[] = []

      if (!certificateBase64) {
        errors.push('No se ha cargado un certificado digital')
      }

      if (certificatePassword === undefined || certificatePassword === null || certificatePassword === '') {
        errors.push('La contraseña del certificado es requerida')
      }

      if (certificateFile) {
        const fileName = certificateFile.name?.toLowerCase() || ''
        if (fileName && !fileName.endsWith('.pfx') && !fileName.endsWith('.p12')) {
          errors.push('El archivo debe ser un certificado .pfx o .p12')
        }
      }

      if (errors.length > 0) {
        updateValidationResults({
          certificate: {
            isValid: false,
            errors,
            warnings,
          }
        })
        throw new Error(errors.join('. '))
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
      if (!token) {
        throw new Error('No hay sesión activa')
      }

      const response = await fetch(`${API_BASE_URL}/api/configuration/wizard/validate-certificate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          certificateBase64,
          certificatePassword,
        }),
      })

      const responseData = await response.json().catch(() => ({}))

      if (!response.ok || !responseData.success) {
        const message = responseData.message || 'Certificado inválido'
        updateValidationResults({
          certificate: {
            isValid: false,
            errors: [message],
            warnings: [],
          }
        })
        throw new Error(message)
      }

      const certificateData = responseData.data || {}
      const validTo = certificateData.validTo ? new Date(certificateData.validTo) : undefined
      const validFrom = certificateData.validFrom ? new Date(certificateData.validFrom) : undefined

      const serverWarnings: string[] = []
      if (certificateData.daysUntilExpiration !== undefined && certificateData.daysUntilExpiration <= 30) {
        serverWarnings.push(`El certificado vencerá en ${certificateData.daysUntilExpiration} días`)
      }

      updateValidationResults({
        certificate: {
          isValid: true,
          errors: [],
          warnings: serverWarnings,
          expiresAt: validTo,
          validFrom,
          daysUntilExpiration: certificateData.daysUntilExpiration,
          subject: certificateData.subject,
          issuer: certificateData.issuer,
          serialNumber: certificateData.serialNumber,
        }
      })

      return {
        success: true,
        data: {
          isValid: true,
          certificate: {
            subject: certificateData.subject,
            issuer: certificateData.issuer,
            serialNumber: certificateData.serialNumber,
            validFrom,
            validTo,
            daysUntilExpiration: certificateData.daysUntilExpiration,
          },
          warnings: serverWarnings,
        },
      }
    } catch (error) {
      console.error('Error validating certificate:', error)
      setError(error instanceof Error ? error.message : 'Error al validar certificado')
      throw error
    }
  }

  const validateRuc = useCallback(async () => {
    const { ruc, razonSocial, direccion } = state.configuration
    
    try {
      
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
    }
  }, [state.configuration, updateValidationResults, setError])

  const completeWizard = useCallback(async (options?: { silent?: boolean }) => {
    if (state.hasPersistedConfiguration) {
      return { success: true, alreadyPersisted: true }
    }

    const showLoader = !options?.silent
    const configuration = state.configuration
    
    try {
      if (showLoader) {
        setLoading(true)
      }
      
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
      setPersistedConfiguration(true)
      return data
    } catch (error) {
      console.error('Error completing wizard:', error)
      setError(error instanceof Error ? error.message : 'Error al completar')
      throw error
    } finally {
      if (showLoader) {
        setLoading(false)
      }
    }
  }, [state.configuration, state.hasPersistedConfiguration, setLoading, setError, setPersistedConfiguration])

  const resetWizardProcess = useCallback(async () => {
    try {
      setLoading(true)

      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

      if (!token) {
        throw new Error('No hay sesión activa')
      }

      const response = await fetch(`${API_BASE_URL}/api/configuration/wizard/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Error al reiniciar la configuración')
      }

      resetWizardState()
      goToStep(0)

      return data
    } catch (error) {
      console.error('Error resetting wizard:', error)
      setError(error instanceof Error ? error.message : 'Error al reiniciar la configuración')
      throw error
    } finally {
      setLoading(false)
    }
  }, [goToStep, resetWizardState, setLoading, setError])

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
    resetWizardProcess,
    canGoNext,
  }
}
