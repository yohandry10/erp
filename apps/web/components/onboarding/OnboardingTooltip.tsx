'use client'

import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react'
import { TourStep } from './types'

interface OnboardingTooltipProps {
  step: TourStep
  currentIndex: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onClose: () => void
}

export function OnboardingTooltip({
  step,
  currentIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  onClose,
}: OnboardingTooltipProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const isModal = step.tipo === 'modal'
  const isFirst = currentIndex === 0
  const isLast = currentIndex === totalSteps - 1

  useEffect(() => {
    if (isModal || !step.selector) {
      setPosition({
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
      })
      return
    }

    const updatePosition = () => {
      const element = document.querySelector(step.selector!)
      if (!element) return

      const rect = element.getBoundingClientRect()
      const tooltipWidth = 320
      const tooltipHeight = 200
      const padding = 16

      let top = 0
      let left = 0

      switch (step.posicion) {
        case 'top':
          top = rect.top - tooltipHeight - padding
          left = rect.left + rect.width / 2 - tooltipWidth / 2
          break
        case 'bottom':
          top = rect.bottom + padding
          left = rect.left + rect.width / 2 - tooltipWidth / 2
          break
        case 'left':
          top = rect.top + rect.height / 2 - tooltipHeight / 2
          left = rect.left - tooltipWidth - padding
          break
        case 'right':
        default:
          top = rect.top + rect.height / 2 - tooltipHeight / 2
          left = rect.right + padding
          break
      }

      if (left < padding) left = padding
      if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - tooltipWidth - padding
      }
      if (top < padding) top = padding
      if (top + tooltipHeight > window.innerHeight - padding) {
        top = window.innerHeight - tooltipHeight - padding
      }

      setPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [step, isModal])

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 10000,
        width: '320px',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        animation: 'fadeSlideIn 0.3s ease-out',
        top: position.top,
        left: position.left,
        transform: isModal ? 'translate(-50%, -50%)' : 'none',
      }}
      role="dialog"
      aria-label={step.titulo}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#3b82f6',
              borderRadius: '50%',
            }}
          />
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Paso {currentIndex + 1} de {totalSteps}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            color: '#9ca3af',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
          }}
          aria-label="Cerrar tour"
        >
          <X style={{ width: '16px', height: '16px' }} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        <h3
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#111827',
            marginBottom: '8px',
            margin: 0,
          }}
        >
          {step.titulo}
        </h3>
        <p
          style={{
            fontSize: '14px',
            color: '#4b5563',
            lineHeight: 1.5,
            margin: '8px 0 0 0',
          }}
        >
          {step.descripcion}
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 16px 8px' }}>
        <div
          style={{
            height: '4px',
            backgroundColor: '#f1f5f9',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: '#3b82f6',
              transition: 'width 0.3s ease',
              width: `${((currentIndex + 1) / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          borderRadius: '0 0 12px 12px',
        }}
      >
        <button
          onClick={onSkip}
          style={{
            fontSize: '14px',
            color: '#64748b',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <SkipForward style={{ width: '12px', height: '12px' }} />
          Saltar
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isFirst && (
            <button
              onClick={onPrev}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#4b5563',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <ChevronLeft style={{ width: '16px', height: '16px' }} />
              Anterior
            </button>
          )}
          <button
            onClick={onNext}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 16px',
              borderRadius: '8px',
              fontSize: '14px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {isLast ? 'Finalizar' : 'Siguiente'}
            {!isLast && <ChevronRight style={{ width: '16px', height: '16px' }} />}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: ${isModal ? 'translate(-50%, -45%)' : 'translateY(-10px)'};
          }
          to {
            opacity: 1;
            transform: ${isModal ? 'translate(-50%, -50%)' : 'translateY(0)'};
          }
        }
      `}</style>
    </div>
  )
}
