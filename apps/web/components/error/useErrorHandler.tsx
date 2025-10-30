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
    let errorMessage = customMessage || 'Ha ocurrido un error'
    
    if (err instanceof Error) {
      errorMessage = err.message
    } else if (typeof err === 'string') {
      errorMessage = err
    } else if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = String(err.message)
    }

    const errorObj = err instanceof Error ? err : new Error(errorMessage)
    setError(errorObj)

    // Log del error
    console.error('🚨 Error manejado:', errorObj)

    return errorMessage
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--red-700)',
          fontSize: '0.875rem',
          fontWeight: '500',
          padding: '0.5rem',
        }}
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
            onClick={onDismiss}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--red-600)',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
            }}
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
      <div
        style={{
          background: 'var(--gradient-danger)',
          color: 'white',
          padding: '1rem',
          borderRadius: 'var(--border-radius)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: 'var(--shadow-md)',
        }}
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
        <span style={{ flex: 1, fontWeight: '600' }}>{errorMessage}</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
              padding: '0.25rem',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
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
      className="activity-card"
      style={{
        background: 'var(--red-50)',
        border: '1px solid var(--red-200)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
        }}
      >
        {showIcon && (
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--red-200)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
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
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontWeight: '600',
              color: 'var(--red-700)',
              fontSize: '0.95rem',
            }}
          >
            {errorMessage}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--red-600)',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
            }}
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

