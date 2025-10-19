'use client'

import React from 'react'
import { WizardProvider, useWizardContext } from './WizardContext'
import { WizardContainer } from './WizardContainer'
import { WelcomeStep } from './steps/WelcomeStep'
import { CompanyTypeStep } from './steps/CompanyTypeStep'
import { RucConfigStep } from './steps/RucConfigStep'
import { CertificateUploadStep } from './steps/CertificateUploadStep'
import { ValidationStep } from './steps/ValidationStep'
import { CompletionStep } from './steps/CompletionStep'

function WizardContent() {
  const { state } = useWizardContext()

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
