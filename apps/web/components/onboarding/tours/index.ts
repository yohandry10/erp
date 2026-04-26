import { OnboardingTour } from '../types'
import { cajeroTour } from './cajero-tour'
import { vendedorTour } from './vendedor-tour'
import { adminTour } from './admin-tour'

export const tours: Record<string, OnboardingTour> = {
  cajero: cajeroTour,
  vendedor: vendedorTour,
  admin: adminTour,
}

export function getTourByRole(rol: string): OnboardingTour | null {
  const normalizedRole = rol.toLowerCase()
  
  // Mapeo de roles a tours
  if (normalizedRole.includes('cajero')) return cajeroTour
  if (normalizedRole.includes('vendedor')) return vendedorTour
  if (normalizedRole.includes('admin') || normalizedRole.includes('supervisor')) return adminTour
  
  // Default para roles no mapeados
  return adminTour
}

export function getTourById(tourId: string): OnboardingTour | null {
  return tours[tourId] || null
}

export { cajeroTour, vendedorTour, adminTour }
