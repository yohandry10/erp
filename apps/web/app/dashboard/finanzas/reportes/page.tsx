'use client'

import { useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  FileText,
  Download,
  Calendar,
  TrendingDown
} from 'lucide-react'
import AgingCxpChart from '@/components/finanzas/AgingCxpChart'
import MovimientosBancariosReport from '@/components/finanzas/MovimientosBancariosReport'
import ConciliacionesPendientesReport from '@/components/finanzas/ConciliacionesPendientesReport'
import ProveedoresMayorDeudaReport from '@/components/finanzas/ProveedoresMayorDeudaReport'
import FlujoCajaChart from '@/components/finanzas/FlujoCajaChart'

type ReportType = 'aging-cxp' | 'flujo-caja' | 'movimientos' | 'conciliaciones' | 'proveedores-deuda'

export default function ReportesFinanzasPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType>('aging-cxp')
  const [proveedorFilter, setProveedorFilter] = useState<string>('')

  const reports = [
    {
      id: 'aging-cxp' as ReportType,
      title: 'Aging de Cuentas por Pagar',
      description: 'Antigüedad de deudas por rangos: 0-30, 31-60, 61-90, +90 días',
      icon: BarChart3,
      color: '#3b82f6',
      available: true
    },
    {
      id: 'proveedores-deuda' as ReportType,
      title: 'Proveedores con Mayor Deuda',
      description: 'Ranking de proveedores por deuda pendiente',
      icon: TrendingDown,
      color: '#ef4444',
      available: true
    },
    {
      id: 'movimientos' as ReportType,
      title: 'Movimientos Bancarios',
      description: 'Reporte de movimientos bancarios por período',
      icon: FileText,
      color: '#f59e0b',
      available: true
    },
    {
      id: 'conciliaciones' as ReportType,
      title: 'Conciliaciones Pendientes',
      description: 'Estado de conciliaciones bancarias',
      icon: Calendar,
      color: '#8b5cf6',
      available: true
    },
    {
      id: 'flujo-caja' as ReportType,
      title: 'Flujo de Caja Proyectado',
      description: 'Proyección de ingresos y egresos futuros',
      icon: TrendingUp,
      color: '#10b981',
      available: true
    }
  ]

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Reportes Financieros</h1>
          <p className="mt-2 text-base text-muted-foreground">Análisis y reportes del módulo de finanzas</p>
        </div>
        <button
          onClick={handleExport} className="py-3 px-6 rounded-lg border bg-card cursor-pointer flex items-center gap-2 text-[0.875rem] font-semibold text-foreground/85 transition"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f9fafb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'white'
          }}
        >
          <Download size={16} />
          Exportar Reporte
        </button>
      </div>

      {/* Report Selection Grid */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-4 mb-8">
        {reports.map((report) => {
          const Icon = report.icon
          const isSelected = selectedReport === report.id

          return (
            <button
              key={report.id}
              onClick={() => report.available && setSelectedReport(report.id)}
              disabled={!report.available} className="p-6 rounded-xl text-left transition relative"
              onMouseEnter={(e) => {
                if (report.available && !isSelected) {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={(e) => {
                if (report.available && !isSelected) {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }
              }}
            >
              {!report.available && (
                <div className="absolute top-3 right-3 py-1 px-2 rounded-[4px] bg-gray-500 text-white text-[0.625rem] font-semibold">
                  Próximamente
                </div>
              )}

              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 rounded-lg flex items-center justify-center">
                  <Icon size={24} />
                </div>
                <h3 className="text-base font-semibold text-foreground m-0">
                  {report.title}
                </h3>
              </div>

              <p className="text-[0.875rem] text-muted-foreground m-0 leading-6">
                {report.description}
              </p>
            </button>
          )
        })}
      </div>

      {/* Report Content */}
      <div>
        {selectedReport === 'aging-cxp' && (
          <AgingCxpChart proveedorId={proveedorFilter || undefined} />
        )}

        {selectedReport === 'proveedores-deuda' && (
          <ProveedoresMayorDeudaReport limite={20} />
        )}

        {selectedReport === 'movimientos' && (
          <MovimientosBancariosReport />
        )}

        {selectedReport === 'conciliaciones' && (
          <ConciliacionesPendientesReport />
        )}

        {selectedReport === 'flujo-caja' && (
          <FlujoCajaChart diasProyeccion={90} />
        )}
      </div>
    </div>
  )
}
