'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/contexts/TenantContext'
import { cn } from '@/lib/utils'

interface ConfigurationBannerProps {
  missingItems: string[]
  completionPercentage: number
}

export function ConfigurationBanner({ missingItems, completionPercentage }: ConfigurationBannerProps) {
  const router = useRouter()
  const { tenant } = useTenant()
  const [isDismissed, setIsDismissed] = useState(false)
  
  const isComplete = completionPercentage === 100
  const storageKey = `config-banner-dismissed-${tenant?.id || 'default'}`

  // Cargar estado de localStorage al montar
  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey)
    if (dismissed === 'true') {
      setIsDismissed(true)
    }
  }, [storageKey])

  if (isDismissed) {
    return null
  }

  const handleAction = () => {
    router.push('/dashboard/wizard')
  }

  return (
    <div
      className={cn(
        'relative mb-6 flex items-center gap-4 rounded-xl border py-4 pl-6 pr-12 shadow-md',
        isComplete ? 'border-cyan-200 bg-cyan-50' : 'border-blue-200 bg-blue-50',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          isComplete ? 'bg-cyan-100 text-cyan-700' : 'bg-blue-100 text-blue-700',
        )}
      >
        {isComplete ? (
          <Check className="h-6 w-6" />
        ) : (
          <AlertTriangle className="h-6 w-6" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4 className={cn('mb-1 text-base font-semibold', isComplete ? 'text-cyan-800' : 'text-blue-900')}>
          {isComplete ? 'Configuración Completada' : `Configuración Incompleta (${completionPercentage}% completado)`}
        </h4>
        <p className={cn('m-0 text-sm', isComplete ? 'text-cyan-800' : 'text-blue-900')}>
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
          // Guardar en localStorage que el usuario cerró el banner
          localStorage.setItem(storageKey, 'true')
          setIsDismissed(true)
        }}
        className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-transparent p-1 text-slate-500 transition hover:bg-slate-500/10 hover:text-slate-800"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
