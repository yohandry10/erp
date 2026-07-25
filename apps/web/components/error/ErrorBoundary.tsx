'use client'

import React, { Component, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * Error Boundary Global para capturar errores de React
 * Implementa manejo de errores consistente en toda la aplicación
 */
export class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Guardar información del error
    this.setState({
      errorInfo,
    })

    // Llamar callback si existe
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // Log del error para debugging
    console.error('🚨 Error capturado por Error Boundary:', error)
    console.error('📍 Información del error:', errorInfo)

    // Opcional: Enviar error a servicio de monitoreo
    // Ejemplo: trackError(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // Si hay un fallback personalizado, usarlo
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Renderizar componente de error estándar
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
        />
      )
    }

    return this.props.children
  }
}

/**
 * Componente de error estándar con diseño consistente
 * Usa CSS inline y clases globales de globals.css
 */
interface ErrorFallbackProps {
  error: Error | null
  errorInfo: React.ErrorInfo | null
  onReset: () => void
}

export function ErrorFallback({ error, errorInfo, onReset }: ErrorFallbackProps) {
  const errorMessage = process.env.NODE_ENV === 'development'
    ? (error?.message || 'Ha ocurrido un error inesperado')
    : 'Ha ocurrido un error inesperado'
  const errorStack = error?.stack || errorInfo?.componentStack || 'No hay información adicional disponible'

  return (
    <div className="flex items-center justify-center p-8"
    >
      <div
        className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl max-w-[800px] w-[100%] p-12 shadow border relative overflow-hidden"
      >
        {/* Barra superior decorativa */}
        <div className="absolute top-0 left-0 right-0 h-[4px] bg-[var(--gradient-danger)]"
        />

        {/* Icono y título */}
        <div className="flex flex-col items-center text-center mb-8"
        >
          <div className="w-[80px] h-[80px] rounded-full bg-[var(--gradient-danger)] flex items-center justify-center mb-6 shadow"
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1 className="text-[2rem] font-bold text-[var(--red-700)] mb-2 bg-[var(--gradient-danger)]"
          >
            Algo salió mal
          </h1>

          <p className="text-base text-[var(--primary-600)] font-medium"
          >
            Lo sentimos, ha ocurrido un error inesperado en la aplicación
          </p>
        </div>

        {/* Mensaje de error */}
        <div className="bg-[var(--red-50)] border p-6 mb-8"
        >
          <div className="flex items-start gap-3"
          >
            <div className="w-5 h-5 rounded-full bg-[var(--red-200)] flex items-center justify-center shrink-0 mt-[2px]"
            >
              <div className="w-2 h-2 rounded-full bg-[var(--red-600)]"
              />
            </div>
            <div className="flex-[1]">
              <p className="m-0 font-semibold text-[var(--red-700)] text-[0.95rem] mb-2"
              >
                {errorMessage}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-4 text-[0.875rem]"
                >
                  <summary className="cursor-pointer text-[var(--red-600)] font-semibold mb-2"
                  >
                    Detalles técnicos (solo en desarrollo)
                  </summary>
                  <pre className="bg-destructive/5 p-4 overflow-auto text-xs text-[var(--red-800)] mt-2 max-h-[300px]"
                  >
                    {errorStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-4 justify-center flex-wrap"
        >
          <button
            onClick={onReset}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-[0.875rem] px-6 font-semibold text-[0.875rem] border-0 cursor-pointer transition bg-[var(--gradient-primary)] text-white shadow inline-flex items-center gap-2"
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
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
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Intentar de nuevo
          </button>

          <button
            onClick={() => window.location.href = '/'}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold leading-5 text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 py-[0.875rem] px-6 font-semibold text-[0.875rem] border cursor-pointer transition bg-[var(--primary-100)] text-[var(--primary-700)] inline-flex items-center gap-2"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--primary-200)'
              e.currentTarget.style.borderColor = 'var(--primary-400)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--primary-100)'
              e.currentTarget.style.borderColor = 'var(--primary-300)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
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
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  )
}

export default GlobalErrorBoundary

