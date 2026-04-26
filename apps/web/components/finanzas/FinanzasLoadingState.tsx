'use client'

interface FinanzasLoadingStateProps {
  message?: string
}

/**
 * Componente de estado de carga consistente para Finanzas
 * Proporciona visualización uniforme durante la carga de datos
 */
export default function FinanzasLoadingState({
  message = 'Cargando datos...'
}: FinanzasLoadingStateProps) {
  return (
    <div className="loading">
      <div className="loading-spinner"></div>
      <p>{message}</p>
    </div>
  )
}
