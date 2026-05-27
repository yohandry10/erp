'use client'

import { useState, useCallback } from 'react'

/**
 * Hook para manejo consistente de errores en componentes
 * Proporciona funciones para manejar errores de manera estándar
 */
export function useErrorHandler() {
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * Maneja errores de operaciones asíncronas
   */
  const handleError = useCallback((err: unknown, customMessage?: string) => {
    // En producción, usar mensaje genérico para no exponer detalles internos
    const genericMessage = customMessage || 'Ha ocurrido un error'
    let rawMessage = genericMessage

    if (err instanceof Error) {
      rawMessage = err.message
    } else if (typeof err === 'string') {
      rawMessage = err
    } else if (err && typeof err === 'object' && 'message' in err) {
      rawMessage = String(err.message)
    }

    const safeMessage = process.env.NODE_ENV === 'development' ? rawMessage : genericMessage
    const errorObj = err instanceof Error ? err : new Error(safeMessage)
    setError(new Error(safeMessage))

    console.error('[Error]', errorObj)

    return safeMessage
  }, [])

  /**
   * Ejecuta una función asíncrona con manejo de errores automático
   */
  const executeWithErrorHandling = useCallback(async <T,>(
    fn: () => Promise<T>,
    options?: {
      onSuccess?: (result: T) => void
      onError?: (error: Error) => void
      customErrorMessage?: string
    }
  ): Promise<T | null> => {
    try {
      setLoading(true)
      setError(null)
      const result = await fn()
      
      if (options?.onSuccess) {
        options.onSuccess(result)
      }
      
      return result
    } catch (err) {
      const errorMessage = handleError(err, options?.customErrorMessage)
      const errorObj = err instanceof Error ? err : new Error(errorMessage)
      
      if (options?.onError) {
        options.onError(errorObj)
      }
      
      return null
    } finally {
      setLoading(false)
    }
  }, [handleError])

  /**
   * Limpia el error actual
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    error,
    loading,
    handleError,
    executeWithErrorHandling,
    clearError,
    hasError: error !== null,
  }
}

/**
 * Componente para mostrar errores de manera consistente
 * Usa CSS inline y clases globales
 */
interface ErrorDisplayProps {
  error: Error | string | null
  onDismiss?: () => void
  variant?: 'inline' | 'card' | 'banner'
  showIcon?: boolean
}

export function ErrorDisplay({
  error,
  onDismiss,
  variant = 'card',
  showIcon = true,
}: ErrorDisplayProps) {
  if (!error) return null

  const errorMessage = typeof error === 'string' ? error : error.message

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 text-[var(--red-700)] text-[0.875rem] font-medium p-2"
      >
        {showIcon && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        <span>{errorMessage}</span>
        {onDismiss && (
          <button
            onClick={onDismiss} className="ml-auto border-0 cursor-pointer text-[var(--red-600)] p-1 flex items-center"
            aria-label="Cerrar error"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  if (variant === 'banner') {
    return (
      <div className="bg-[var(--gradient-danger)] text-white p-4 mb-4 flex items-center gap-3 shadow"
      >
        {showIcon && (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
        <span className="flex-[1] font-semibold">{errorMessage}</span>
        {onDismiss && (
          <button
            onClick={onDismiss} className="bg-[rgba(255,_255,_255,_0.2)] border-0 cursor-pointer text-white p-1 rounded-[4px] flex items-center"
            aria-label="Cerrar error"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  // Variant 'card' (default)
  return (
    <div
      className="activity-card bg-[var(--red-50)] border p-6 mb-6"
    >
      <div className="flex items-start gap-3"
      >
        {showIcon && (
          <div className="w-6 h-6 rounded-full bg-[var(--red-200)] flex items-center justify-center shrink-0"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--red-600)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        )}
        <div className="flex-[1]">
          <p className="m-0 font-semibold text-[var(--red-700)] text-[0.95rem]"
          >
            {errorMessage}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss} className="border-0 cursor-pointer text-[var(--red-600)] p-1 flex items-center"
            aria-label="Cerrar error"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

