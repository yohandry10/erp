'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ConfigurationBannerProps {
  missingItems: string[]
  completionPercentage: number
}

export function ConfigurationBanner({ missingItems, completionPercentage }: ConfigurationBannerProps) {
  const router = useRouter()
  const [isDismissed, setIsDismissed] = useState(false)
  
  const isComplete = completionPercentage === 100

  if (isDismissed) {
    return null
  }

  const handleAction = () => {
    router.push('/dashboard/wizard')
  }

  return (
    <div style={{
      position: 'relative',
      marginBottom: '1.5rem',
      padding: '1rem 1.5rem',
      paddingRight: '3rem',
      backgroundColor: isComplete ? '#f0fdf4' : '#eff6ff',
      border: `1px solid ${isComplete ? '#86efac' : '#93c5fd'}`,
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        backgroundColor: isComplete ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isComplete ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ) : (
          <AlertTriangle size={24} style={{ color: '#2563eb' }} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{
          fontSize: '1rem',
          fontWeight: '600',
          color: isComplete ? '#15803d' : '#1e40af',
          marginBottom: '0.25rem',
        }}>
          {isComplete ? 'Configuración Completada' : `Configuración Incompleta (${completionPercentage}% completado)`}
        </h4>
        <p style={{
          fontSize: '0.875rem',
          color: isComplete ? '#15803d' : '#1e40af',
          margin: 0,
        }}>
          {isComplete ? (
            <>Tu sistema está listo para usar. Puedes editar la configuración cuando lo necesites</>
          ) : missingItems.length > 0 ? (
            <>Faltan: {missingItems.join(', ')}</>
          ) : (
            <>Completa la configuración para comenzar a usar todas las funcionalidades</>
          )}
        </p>
      </div>

      <button
        className={isComplete ? "btn btn-secondary" : "btn btn-primary"}
        onClick={handleAction}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexShrink: 0,
          whiteSpace: 'nowrap'
        }}
      >
        {isComplete ? (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Editar Configuración
          </>
        ) : (
          <>
            Completar Configuración
            <ArrowRight size={18} />
          </>
        )}
      </button>

      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDismissed(true)
        }}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#64748b',
          padding: '0.25rem',
          display: 'flex',
          alignItems: 'center',
          borderRadius: '4px',
          transition: 'all 0.2s',
          width: '24px',
          height: '24px',
          justifyContent: 'center'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(100, 116, 139, 0.1)'
          e.currentTarget.style.color = '#1e293b'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = '#64748b'
        }}
        aria-label="Cerrar"
      >
        <X size={16} />
      </button>
    </div>
  )
}
