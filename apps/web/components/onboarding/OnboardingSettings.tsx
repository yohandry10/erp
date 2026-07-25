'use client'

import { RefreshCw, Play } from 'lucide-react'
import { useOnboarding } from './OnboardingProvider'
import { tours } from './tours'

export function OnboardingSettings() {
  const { state, startTour, resetTour } = useOnboarding()
  const availableTours = Object.values(tours)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[18px] font-semibold text-foreground mb-[4px]">
          Tours de Aprendizaje
        </h3>
        <p className="text-sm text-muted-foreground m-0">
          Repite los tours interactivos para recordar cómo usar el sistema.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {availableTours.map((tour) => {
          const isCompleted = state.completedTours.includes(tour.id)

          return (
            <div
              key={tour.id} className="flex items-center justify-between p-4 rounded-lg"
            >
              <div>
                <p className="font-medium text-foreground m-0">{tour.nombre}</p>
                <p className="text-sm text-muted-foreground mt-[4px] mr-0 mb-0 ml-0">
                  {tour.pasos.length} pasos • Rol: {tour.rol}
                </p>
                {isCompleted && (
                  <span className="text-xs text-[#16a34a] font-medium">
                    ✓ Completado
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                {isCompleted && (
                  <button
                    onClick={() => resetTour(tour.id)} className="flex items-center gap-[4px] py-[6px] px-3 rounded-lg text-sm text-[#4b5563] bg-card border cursor-pointer"
                    title="Resetear progreso"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Resetear
                  </button>
                )}
                <button
                  onClick={() => startTour(tour.id)}
                  disabled={state.isActive} className="flex items-center gap-[4px] py-[6px] px-3 rounded-lg text-sm text-white border-0"
                >
                  <Play className="w-4 h-4" />
                  {isCompleted ? 'Repetir' : 'Iniciar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {state.isActive && (
        <p className="text-sm text-[#b45309] bg-[#fef3c7] p-3 rounded-lg m-0"
        >
          ⚠️ Ya hay un tour en progreso. Complétalo o sáltalo antes de iniciar otro.
        </p>
      )}
    </div>
  )
}
