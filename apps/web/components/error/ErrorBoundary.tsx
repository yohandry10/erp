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
  const errorMessage = error?.message || 'Ha ocurrido un error inesperado'
  const errorStack = error?.stack || errorInfo?.componentStack || 'No hay información adicional disponible'

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
      }}
    >
      <div
        className="activity-card"
        style={{
          maxWidth: '800px',
          width: '100%',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 'var(--border-radius-xl)',
          padding: '3rem',
          boxShadow: 'var(--shadow-2xl)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Barra superior decorativa */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'var(--gradient-danger)',
            borderRadius: 'var(--border-radius-xl) var(--border-radius-xl) 0 0',
          }}
        />

        {/* Icono y título */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            marginBottom: '2rem',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'var(--gradient-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              boxShadow: 'var(--shadow-xl)',
              animation: 'glow-red 2s ease-in-out infinite alternate',
            }}
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

          <h1
            style={{
              fontSize: '2rem',
              fontWeight: '700',
              color: 'var(--red-700)',
              marginBottom: '0.5rem',
              background: 'var(--gradient-danger)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Algo salió mal
          </h1>

          <p
            style={{
              fontSize: '1rem',
              color: 'var(--primary-600)',
              fontWeight: '500',
            }}
          >
            Lo sentimos, ha ocurrido un error inesperado en la aplicación
          </p>
        </div>

        {/* Mensaje de error */}
        <div
          style={{
            background: 'var(--red-50)',
            border: '1px solid var(--red-200)',
            borderRadius: 'var(--border-radius)',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'var(--red-200)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--red-600)',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontWeight: '600',
                  color: 'var(--red-700)',
                  fontSize: '0.95rem',
                  marginBottom: '0.5rem',
                }}
              >
                {errorMessage}
              </p>
              {process.env.NODE_ENV === 'development' && (
                <details
                  style={{
                    marginTop: '1rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <summary
                    style={{
                      cursor: 'pointer',
                      color: 'var(--red-600)',
                      fontWeight: '600',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Detalles técnicos (solo en desarrollo)
                  </summary>
                  <pre
                    style={{
                      background: 'rgba(239, 68, 68, 0.05)',
                      padding: '1rem',
                      borderRadius: 'var(--border-radius)',
                      overflow: 'auto',
                      fontSize: '0.75rem',
                      color: 'var(--red-800)',
                      marginTop: '0.5rem',
                      maxHeight: '300px',
                    }}
                  >
                    {errorStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={onReset}
            className="btn-primary"
            style={{
              padding: '0.875rem 1.5rem',
              borderRadius: 'var(--border-radius)',
              fontWeight: '600',
              fontSize: '0.875rem',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'var(--gradient-primary)',
              color: 'white',
              boxShadow: 'var(--shadow-md)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
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
            className="btn-secondary"
            style={{
              padding: '0.875rem 1.5rem',
              borderRadius: 'var(--border-radius)',
              fontWeight: '600',
              fontSize: '0.875rem',
              border: '1px solid var(--primary-300)',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
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

