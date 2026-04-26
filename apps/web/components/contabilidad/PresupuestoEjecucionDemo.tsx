'use client'

import PresupuestoEjecucionIndicator from './PresupuestoEjecucionIndicator'
import PresupuestoEjecucionCard from './PresupuestoEjecucionCard'

/**
 * Demo component showing all visual indicator variations
 * This component demonstrates the different ways to display budget execution status
 */
export default function PresupuestoEjecucionDemo() {
  const ejemplos = [
    { porcentaje: 45, label: 'Normal (45%)' },
    { porcentaje: 75, label: 'Normal (75%)' },
    { porcentaje: 92, label: 'Advertencia (92%)' },
    { porcentaje: 105, label: 'Sobregiro (105%)' }
  ]

  return (
    <div style={{ padding: '2rem', background: '#f9fafb' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '2rem', color: '#111827' }}>
        Indicadores de Ejecución Presupuestal
      </h2>

      {/* Badge Indicators */}
      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          1. Badges (Etiquetas)
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {ejemplos.map((ejemplo, idx) => (
            <div key={idx} style={{ 
              background: 'white', 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                {ejemplo.label}
              </p>
              <PresupuestoEjecucionIndicator
                porcentajeEjecutado={ejemplo.porcentaje}
                size="md"
                showLabel={true}
                showPercentage={false}
                showProgressBar={false}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Progress Bars with Percentage */}
      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          2. Barras de Progreso con Porcentaje
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {ejemplos.map((ejemplo, idx) => (
            <div key={idx} style={{ 
              background: 'white', 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              minWidth: '150px'
            }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                {ejemplo.label}
              </p>
              <PresupuestoEjecucionIndicator
                porcentajeEjecutado={ejemplo.porcentaje}
                size="md"
                showLabel={false}
                showPercentage={true}
                showProgressBar={true}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Complete Indicators */}
      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          3. Indicadores Completos (Badge + Porcentaje + Barra)
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {ejemplos.map((ejemplo, idx) => (
            <div key={idx} style={{ 
              background: 'white', 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              minWidth: '150px'
            }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                {ejemplo.label}
              </p>
              <PresupuestoEjecucionIndicator
                porcentajeEjecutado={ejemplo.porcentaje}
                size="md"
                showLabel={true}
                showPercentage={true}
                showProgressBar={true}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Size Variations */}
      <div style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          4. Variaciones de Tamaño
        </h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {['sm', 'md', 'lg'].map((size) => (
            <div key={size} style={{ 
              background: 'white', 
              padding: '1rem', 
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                Tamaño: {size}
              </p>
              <PresupuestoEjecucionIndicator
                porcentajeEjecutado={92}
                size={size as 'sm' | 'md' | 'lg'}
                showLabel={true}
                showPercentage={true}
                showProgressBar={true}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Card Examples */}
      <div>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          5. Tarjetas de Presupuesto
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <PresupuestoEjecucionCard
            titulo="Administración"
            subtitulo="CC-001"
            montoPresupuestado={100000}
            montoEjecutado={45000}
            montoDisponible={55000}
            porcentajeEjecutado={45}
          />
          <PresupuestoEjecucionCard
            titulo="Ventas"
            subtitulo="CC-002"
            montoPresupuestado={150000}
            montoEjecutado={138000}
            montoDisponible={12000}
            porcentajeEjecutado={92}
          />
          <PresupuestoEjecucionCard
            titulo="Producción"
            subtitulo="CC-003"
            montoPresupuestado={200000}
            montoEjecutado={210000}
            montoDisponible={-10000}
            porcentajeEjecutado={105}
          />
        </div>
      </div>

      {/* Color Legend */}
      <div style={{ 
        marginTop: '3rem', 
        padding: '1.5rem', 
        background: 'white', 
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
          Leyenda de Colores
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              borderRadius: '4px', 
              background: '#10b981' 
            }} />
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                Verde - Normal
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
                0% - 89.9% ejecutado
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              borderRadius: '4px', 
              background: '#f59e0b' 
            }} />
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                Amarillo - Advertencia
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
                90% - 99.9% ejecutado
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '24px', 
              height: '24px', 
              borderRadius: '4px', 
              background: '#ef4444' 
            }} />
            <div>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                Rojo - Sobregiro
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
                100% o más ejecutado
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
