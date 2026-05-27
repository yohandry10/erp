'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { WizardProvider, useWizardContext } from './WizardContext'
import { WizardContainer } from './WizardContainer'
import { WelcomeStep } from './steps/WelcomeStep'
import { CompanyTypeStep } from './steps/CompanyTypeStep'
import { RucConfigStep } from './steps/RucConfigStep'
import { CertificateUploadStep } from './steps/CertificateUploadStep'
import { FiscalConfigStep } from './steps/FiscalConfigStep'
import { SunatConfigStep } from './steps/SunatConfigStep'
import { ValidationStep } from './steps/ValidationStep'
import { CompletionStep } from './steps/CompletionStep'
import { ConfigurationSummaryStep } from './steps/ConfigurationSummaryStep'

function WizardContent() {
  const { state } = useWizardContext()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    // Solo los super-admins de plataforma se saltan el wizard (no necesitan
    // configurar un tenant porque administran todos). Leemos del AuthContext
    // (fuente de verdad ligada a la cookie HttpOnly), NO de localStorage:
    // nada en el código actual escribe localStorage.user, así que el check
    // anterior era código muerto y, si quedaba basura legacy, podía mandar
    // a /dashboard a usuarios demo que sí necesitan el wizard.
    if (authLoading) return
    if (user?.is_super_admin === true) {
      router.replace('/dashboard')
    }
  }, [authLoading, user, router])

  const renderStep = () => {
    const currentStep = state.steps[state.currentStep]
    
    // Si el wizard ya está completado (hasPersistedConfiguration = true),
    // mostrar el resumen de configuración en lugar del paso de completion
    if (state.hasPersistedConfiguration && currentStep.id === 'completion') {
      return <ConfigurationSummaryStep />
    }
    
    switch (currentStep.id) {
      case 'welcome':
        return <WelcomeStep />
      case 'company-type':
        return <CompanyTypeStep />
      case 'ruc':
        return <RucConfigStep />
      case 'certificate':
        return <CertificateUploadStep />
      case 'fiscal':
        return <FiscalConfigStep />
      case 'sunat':
        return <SunatConfigStep />
      case 'validation':
        return <ValidationStep />
      case 'completion':
        return <CompletionStep />
      default:
        return <div>Paso no encontrado</div>
    }
  }

  return (
    <WizardContainer>
      {renderStep()}
    </WizardContainer>
  )
}

export default function WizardPage() {
  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  )
}
