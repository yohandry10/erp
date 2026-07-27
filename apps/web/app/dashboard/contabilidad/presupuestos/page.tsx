'use client'

import { useRouter } from 'next/navigation'
import {
  BarChart3,
  TrendingUp,
  FileText,
  PlusCircle,
  AlertTriangle,
  Lightbulb
} from 'lucide-react'

export default function PresupuestosPage() {
  const router = useRouter()

  const sections = [
    {
      id: 'comparacion',
      title: 'Comparación Presupuesto vs Real',
      description: 'Análisis comparativo de presupuestos ejecutados por centro de costo',
      icon: BarChart3,
      color: '#3b82f6',
      available: true,
      path: '/dashboard/contabilidad/presupuestos/comparacion'
    },
    {
      id: 'lista',
      title: 'Gestión de Presupuestos',
      description: 'Crear, editar y administrar presupuestos por centro de costo',
      icon: FileText,
      color: '#10b981',
      available: true,
      path: '/dashboard/contabilidad/presupuestos/lista'
    },
    {
      id: 'alertas',
      title: 'Alertas de Sobregiro',
      description: 'Monitoreo de presupuestos con advertencias y sobregiros',
      icon: AlertTriangle,
      color: '#ef4444',
      available: true,
      path: '/dashboard/contabilidad/presupuestos/alertas'
    },
    {
      id: 'nuevo',
      title: 'Crear Presupuesto',
      description: 'Configurar nuevo presupuesto para un centro de costo',
      icon: PlusCircle,
      color: '#8b5cf6',
      available: true,
      path: '/dashboard/contabilidad/presupuestos/nuevo'
    }
  ]

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Presupuestos</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Gestión y análisis de presupuestos por centro de costo
          </p>
        </div>
      </div>

      {/* Sections Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(300px,_1fr))] gap-6">
        {sections.map((section) => {
          const Icon = section.icon

          return (
            <button
              key={section.id}
              onClick={() => section.available && router.push(section.path)}
              disabled={!section.available} className="p-8 rounded-xl bg-card text-left transition shadow relative"
              onMouseEnter={(e) => {
                if (section.available) {
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.borderColor = section.color
                }
              }}
              onMouseLeave={(e) => {
                if (section.available) {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.borderColor = 'transparent'
                }
              }}
            >
              {!section.available && (
                <div className="absolute top-4 right-4 py-1 px-3 rounded-full bg-gray-500 text-white text-xs font-semibold">
                  Próximamente
                </div>
              )}

              <div className="flex items-start gap-4 mb-4">
                <div className="p-4 rounded-xl flex items-center justify-center shrink-0">
                  <Icon size={28} />
                </div>
                <div className="flex-[1]">
                  <h3 className="text-[1.125rem] font-semibold text-foreground mt-0 mr-0 mb-2 ml-0">
                    {section.title}
                  </h3>
                  <p className="text-[0.875rem] text-muted-foreground m-0 leading-6">
                    {section.description}
                  </p>
                </div>
              </div>

              {section.available && (
                <div className="flex items-center gap-2 text-[0.875rem] font-semibold mt-4">
                  Ver más
                  <span className="text-xl">→</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Info Box */}
      <div className="mt-8 rounded-xl border border-primary/20 bg-primary/10 p-6">
        <h4 className="m-0 mb-2 flex items-center gap-2 text-base font-semibold text-foreground">
          <Lightbulb className="size-5 text-primary" aria-hidden="true" /> Acerca de los Presupuestos
        </h4>
        <p className="m-0 text-sm leading-7 text-muted-foreground">
          Los presupuestos permiten planificar y controlar los gastos por centro de costo y cuenta contable.
          El sistema calcula automáticamente la ejecución presupuestal basándose en los asientos contables
          generados y emite alertas cuando se supera el 90% de ejecución o cuando hay sobregiros.
        </p>
      </div>
    </div>
  )
}
