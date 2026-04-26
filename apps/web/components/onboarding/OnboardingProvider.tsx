'use client'

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { OnboardingState, OnboardingContextValue, OnboardingTour } from './types'
import { getTourById, getTourByRole } from './tours'
import { OnboardingOverlay } from './OnboardingOverlay'
import { OnboardingSpotlight } from './OnboardingSpotlight'
import { OnboardingTooltip } from './OnboardingTooltip'
import { useTenant } from '@/contexts/TenantContext'

const STORAGE_KEY = 'erp_onboarding_completed'

const initialState: OnboardingState = {
  isActive: false,
  currentTour: null,
  currentStepIndex: 0,
  completedTours: [],
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(initialState)
  const { user } = useTenant()

  // Cargar tours completados del localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const completedTours = JSON.parse(stored)
        setState(prev => ({ ...prev, completedTours }))
      }
    } catch (error) {
      console.error('Error loading onboarding state:', error)
    }
  }, [])

  const startTour = useCallback((tourId: string) => {
    const tour = getTourById(tourId)
    if (!tour) {
      console.warn(`Tour not found: ${tourId}`)
      return
    }

    setState(prev => ({
      ...prev,
      isActive: true,
      currentTour: tour,
      currentStepIndex: 0,
    }))
  }, [])

  // Auto-iniciar tour para usuarios nuevos
  useEffect(() => {
    if (!user || state.isActive) return

    const userRole = (user.roles?.[0] || (user.is_super_admin ? 'superadmin' : 'user')).toLowerCase()
    const tour = getTourByRole(userRole)
    
    if (tour && !state.completedTours.includes(tour.id)) {
      // Pequeño delay para que la UI se cargue
      const timer = setTimeout(() => {
        startTour(tour.id)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [user, state.completedTours, state.isActive, startTour])

  const saveCompletedTours = useCallback((tours: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tours))
    } catch (error) {
      console.error('Error saving onboarding state:', error)
    }
  }, [])

  const nextStep = useCallback(() => {
    setState(prev => {
      if (!prev.currentTour) return prev

      const nextIndex = prev.currentStepIndex + 1
      
      if (nextIndex >= prev.currentTour.pasos.length) {
        // Tour completado
        const newCompletedTours = [...prev.completedTours, prev.currentTour.id]
        saveCompletedTours(newCompletedTours)
        
        return {
          ...prev,
          isActive: false,
          currentTour: null,
          currentStepIndex: 0,
          completedTours: newCompletedTours,
        }
      }

      return {
        ...prev,
        currentStepIndex: nextIndex,
      }
    })
  }, [saveCompletedTours])

  const prevStep = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStepIndex: Math.max(0, prev.currentStepIndex - 1),
    }))
  }, [])

  const skipTour = useCallback(() => {
    setState(prev => {
      if (!prev.currentTour) return prev

      const newCompletedTours = [...prev.completedTours, prev.currentTour.id]
      saveCompletedTours(newCompletedTours)

      return {
        ...prev,
        isActive: false,
        currentTour: null,
        currentStepIndex: 0,
        completedTours: newCompletedTours,
      }
    })
  }, [saveCompletedTours])

  const completeTour = useCallback(() => {
    nextStep()
  }, [nextStep])

  const resetTour = useCallback((tourId: string) => {
    setState(prev => {
      const newCompletedTours = prev.completedTours.filter(id => id !== tourId)
      saveCompletedTours(newCompletedTours)
      return {
        ...prev,
        completedTours: newCompletedTours,
      }
    })
  }, [saveCompletedTours])

  const currentStep = state.currentTour?.pasos[state.currentStepIndex]
  const isSpotlight = currentStep?.tipo === 'spotlight'

  return (
    <OnboardingContext.Provider
      value={{
        state,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        completeTour,
        resetTour,
      }}
    >
      {children}

      {/* Overlay para modales */}
      {state.isActive && currentStep?.tipo === 'modal' && (
        <OnboardingOverlay isVisible={true} />
      )}

      {/* Spotlight para elementos */}
      {state.isActive && isSpotlight && currentStep?.selector && (
        <OnboardingSpotlight
          selector={currentStep.selector}
          isVisible={true}
        />
      )}

      {/* Tooltip */}
      {state.isActive && currentStep && (
        <OnboardingTooltip
          step={currentStep}
          currentIndex={state.currentStepIndex}
          totalSteps={state.currentTour?.pasos.length || 0}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={skipTour}
          onClose={skipTour}
        />
      )}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext)
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider')
  }
  return context
}
