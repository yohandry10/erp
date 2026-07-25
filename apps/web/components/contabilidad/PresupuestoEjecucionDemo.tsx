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
    <div className="p-8 bg-muted">
      <h2 className="text-2xl font-bold mb-8 text-foreground">
        Indicadores de Ejecución Presupuestal
      </h2>

      {/* Badge Indicators */}
      <div className="mb-12">
        <h3 className="text-[1.125rem] font-semibold mb-4 text-foreground/85">
          1. Badges (Etiquetas)
        </h3>
        <div className="flex gap-4 flex-wrap">
          {ejemplos.map((ejemplo, idx) => (
            <div key={idx} className="bg-card p-4 rounded-lg shadow">
              <p className="mt-0 mr-0 mb-2 ml-0 text-[0.875rem] text-muted-foreground">
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
      <div className="mb-12">
        <h3 className="text-[1.125rem] font-semibold mb-4 text-foreground/85">
          2. Barras de Progreso con Porcentaje
        </h3>
        <div className="flex gap-4 flex-wrap">
          {ejemplos.map((ejemplo, idx) => (
            <div key={idx} className="bg-card p-4 rounded-lg shadow min-w-[150px]">
              <p className="mt-0 mr-0 mb-2 ml-0 text-[0.875rem] text-muted-foreground">
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
      <div className="mb-12">
        <h3 className="text-[1.125rem] font-semibold mb-4 text-foreground/85">
          3. Indicadores Completos (Badge + Porcentaje + Barra)
        </h3>
        <div className="flex gap-4 flex-wrap">
          {ejemplos.map((ejemplo, idx) => (
            <div key={idx} className="bg-card p-4 rounded-lg shadow min-w-[150px]">
              <p className="mt-0 mr-0 mb-2 ml-0 text-[0.875rem] text-muted-foreground">
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
      <div className="mb-12">
        <h3 className="text-[1.125rem] font-semibold mb-4 text-foreground/85">
          4. Variaciones de Tamaño
        </h3>
        <div className="flex gap-4 items-start flex-wrap">
          {['sm', 'md', 'lg'].map((size) => (
            <div key={size} className="bg-card p-4 rounded-lg shadow">
              <p className="mt-0 mr-0 mb-2 ml-0 text-[0.875rem] text-muted-foreground">
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
        <h3 className="text-[1.125rem] font-semibold mb-4 text-foreground/85">
          5. Tarjetas de Presupuesto
        </h3>
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(300px,_1fr))] gap-4">
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
      <div className="mt-12 p-6 bg-card rounded-lg shadow">
        <h3 className="text-[1.125rem] font-semibold mb-4 text-foreground/85">
          Leyenda de Colores
        </h3>
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-[4px] bg-[#10b981]" />
            <div>
              <p className="m-0 text-[0.875rem] font-semibold text-foreground">
                Verde - Normal
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                0% - 89.9% ejecutado
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-[4px] bg-amber-500" />
            <div>
              <p className="m-0 text-[0.875rem] font-semibold text-foreground">
                Amarillo - Advertencia
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                90% - 99.9% ejecutado
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-[4px] bg-red-500" />
            <div>
              <p className="m-0 text-[0.875rem] font-semibold text-foreground">
                Rojo - Sobregiro
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                100% o más ejecutado
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
