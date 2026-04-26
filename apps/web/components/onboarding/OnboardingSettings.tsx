'use client'

import { RefreshCw, Play } from 'lucide-react'
import { useOnboarding } from './OnboardingProvider'
import { tours } from './tours'

export function OnboardingSettings() {
  const { state, startTour, resetTour } = useOnboarding()
  const availableTours = Object.values(tours)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
          Tours de Aprendizaje
        </h3>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          Repite los tours interactivos para recordar cómo usar el sistema.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {availableTours.map((tour) => {
          const isCompleted = state.completedTours.includes(tour.id)

          return (
            <div
              key={tour.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                borderRadius: '8px',
                border: `1px solid ${isCompleted ? '#bbf7d0' : '#e2e8f0'}`,
                backgroundColor: isCompleted ? '#f0fdf4' : '#f8fafc',
              }}
            >
              <div>
                <p style={{ fontWeight: 500, color: '#111827', margin: 0 }}>{tour.nombre}</p>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>
                  {tour.pasos.length} pasos • Rol: {tour.rol}
                </p>
                {isCompleted && (
                  <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>
                    ✓ Completado
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {isCompleted && (
                  <button
                    onClick={() => resetTour(tour.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#4b5563',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                    }}
                    title="Resetear progreso"
                  >
                    <RefreshCw style={{ width: '16px', height: '16px' }} />
                    Resetear
                  </button>
                )}
                <button
                  onClick={() => startTour(tour.id)}
                  disabled={state.isActive}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    backgroundColor: state.isActive ? '#94a3b8' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    cursor: state.isActive ? 'not-allowed' : 'pointer',
                    opacity: state.isActive ? 0.5 : 1,
                  }}
                >
                  <Play style={{ width: '16px', height: '16px' }} />
                  {isCompleted ? 'Repetir' : 'Iniciar'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {state.isActive && (
        <p
          style={{
            fontSize: '14px',
            color: '#b45309',
            backgroundColor: '#fef3c7',
            padding: '12px',
            borderRadius: '8px',
            margin: 0,
          }}
        >
          ⚠️ Ya hay un tour en progreso. Complétalo o sáltalo antes de iniciar otro.
        </p>
      )}
    </div>
  )
}
