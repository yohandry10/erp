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
    <div className="fixed z-[10000] w-[320px] bg-card rounded-xl shadow"
      role="dialog"
      aria-label={step.titulo}
    >
      {/* Header */}
      <div className="flex items-center justify-between py-3 px-4 border-b"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"
          />
          <span className="text-xs text-muted-foreground">
            Paso {currentIndex + 1} de {totalSteps}
          </span>
        </div>
        <button
          onClick={onClose} className="text-muted-foreground border-0 cursor-pointer p-[4px] flex items-center justify-center rounded-[4px]"
          aria-label="Cerrar tour"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-[18px] font-semibold text-foreground mb-2 m-0"
        >
          {step.titulo}
        </h3>
        <p className="text-sm text-[#4b5563] leading-6 mt-2 mr-0 mb-0 ml-0"
        >
          {step.descripcion}
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-[4px] bg-muted rounded-full overflow-hidden"
        >
          <div className="h-[100%] bg-blue-500 transition"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between py-3 px-4 border-t bg-muted/30"
      >
        <button
          onClick={onSkip} className="text-sm text-muted-foreground border-0 cursor-pointer flex items-center gap-[4px]"
        >
          <SkipForward className="w-3 h-3" />
          Saltar
        </button>

        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onPrev} className="flex items-center gap-[4px] py-[6px] px-3 rounded-lg text-sm text-[#4b5563] border-0 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
          )}
          <button
            onClick={onNext} className="flex items-center gap-[4px] py-[6px] px-4 rounded-lg text-sm bg-blue-600 text-white border-0 cursor-pointer"
          >
            {isLast ? 'Finalizar' : 'Siguiente'}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
