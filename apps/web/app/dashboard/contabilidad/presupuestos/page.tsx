'use client'

import { useRouter } from 'next/navigation'
import { 
  BarChart3, 
  TrendingUp, 
  FileText,
  PlusCircle,
  AlertTriangle
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
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Presupuestos</h1>
          <p className="dashboard-subtitle">
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
              disabled={!section.available} className="p-8 rounded-3 bg-white text-left transition shadow relative"
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
                <div className="absolute top-4 right-4 py-1 px-3 rounded-full bg-gray-500 text-white text-3 font-semibold">
                  Próximamente
                </div>
              )}
              
              <div className="flex items-start gap-4 mb-4">
                <div className="p-4 rounded-3 flex items-center justify-center shrink-0">
                  <Icon size={28} />
                </div>
                <div className="flex-[1]">
                  <h3 className="text-[1.125rem] font-semibold text-gray-900 mt-0 mr-0 mb-2 ml-0">
                    {section.title}
                  </h3>
                  <p className="text-[0.875rem] text-gray-500 m-0 leading-6">
                    {section.description}
                  </p>
                </div>
              </div>

              {section.available && (
                <div className="flex items-center gap-2 text-[0.875rem] font-semibold mt-4">
                  Ver más
                  <span className="text-5">→</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Info Box */}
      <div className="mt-8 p-6 bg-[#eff6ff] border rounded-3">
        <h4 className="mt-0 mr-0 mb-2 ml-0 text-4 font-semibold text-[#1e40af]">
          💡 Acerca de los Presupuestos
        </h4>
        <p className="m-0 text-[0.875rem] text-[#1e40af] leading-7">
          Los presupuestos permiten planificar y controlar los gastos por centro de costo y cuenta contable.
          El sistema calcula automáticamente la ejecución presupuestal basándose en los asientos contables
          generados y emite alertas cuando se supera el 90% de ejecución o cuando hay sobregiros.
        </p>
      </div>
    </div>
  )
}
