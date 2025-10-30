'use client'

import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WizardProvider, useWizardContext } from './WizardContext'
import { WizardContainer } from './WizardContainer'
import { WelcomeStep } from './steps/WelcomeStep'
import { CompanyTypeStep } from './steps/CompanyTypeStep'
import { RucConfigStep } from './steps/RucConfigStep'
import { CertificateUploadStep } from './steps/CertificateUploadStep'
import { FiscalConfigStep } from './steps/FiscalConfigStep'
// TODO: Descomentar cuando se tenga acceso a credenciales OSE
// import { SunatConfigStep } from './steps/SunatConfigStep'
import { ValidationStep } from './steps/ValidationStep'
import { CompletionStep } from './steps/CompletionStep'

function WizardContent() {
  const { state } = useWizardContext()
  const router = useRouter()

  useEffect(() => {
    // Redirect superadmins to dashboard - they don't need wizard
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        if (user?.is_super_admin === true || user?.isSuperAdmin === true) {
          console.log('[Wizard] Superadmin detected, redirecting to dashboard')
          router.push('/dashboard')
        }
      } catch (e) {
        console.error('[Wizard] Error parsing user:', e)
      }
    }
  }, [router])

  const renderStep = () => {
    const currentStep = state.steps[state.currentStep]
    
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
      // TODO: Descomentar cuando se tenga acceso a credenciales OSE
      // case 'sunat':
      //   return <SunatConfigStep />
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
