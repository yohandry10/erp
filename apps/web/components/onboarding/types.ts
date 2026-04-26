'use client'

export type TourStepType = 'modal' | 'spotlight'
export type SpotlightPosition = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  id: string
  tipo: TourStepType
  titulo: string
  descripcion: string
  // Para tipo 'spotlight'
  selector?: string
  posicion?: SpotlightPosition
  // Para tipo 'modal'
  imagen?: string
}

export interface OnboardingTour {
  id: string
  nombre: string
  rol: string
  pasos: TourStep[]
}

export interface OnboardingState {
  isActive: boolean
  currentTour: OnboardingTour | null
  currentStepIndex: number
  completedTours: string[]
}

export interface OnboardingContextValue {
  state: OnboardingState
  startTour: (tourId: string) => void
  nextStep: () => void
  prevStep: () => void
  skipTour: () => void
  completeTour: () => void
  resetTour: (tourId: string) => void
}
