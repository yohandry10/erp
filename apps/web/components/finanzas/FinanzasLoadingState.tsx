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
    <div className="flex min-h-48 items-center justify-center">
      <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
      <p>{message}</p>
    </div>
  )
}
