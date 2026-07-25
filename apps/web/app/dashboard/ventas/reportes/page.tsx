'use client'

import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Calendar,
  Clock,
  Download,
  DollarSign,
  FileText,
  GitMerge,
  Package,
  ShieldAlert,
  TrendingUp,
  Users
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import VentasPorClienteReport from '@/components/ventas/reportes/VentasPorClienteReport'
import CotizacionesPendientesReport from '@/components/ventas/reportes/CotizacionesPendientesReport'
import PedidosPorEstadoReport from '@/components/ventas/reportes/PedidosPorEstadoReport'
import ProductosMasVendidosReport from '@/components/ventas/reportes/ProductosMasVendidosReport'
import TopClientesReport from '@/components/ventas/reportes/TopClientesReport'
import LeadTimeReport from '@/components/ventas/reportes/LeadTimeReport'
import PipelineReport from '@/components/ventas/reportes/PipelineReport'
import FillRateReport from '@/components/ventas/reportes/FillRateReport'
import AgingCxcReport from '@/components/ventas/reportes/AgingCxcReport'
import SunatMetricsReport from '@/components/ventas/reportes/SunatMetricsReport'
import ResumenVentasReport from '@/components/ventas/reportes/ResumenVentasReport'
import { useCountryContext } from '@/hooks/use-country-context'

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  vendedor?: string
  cliente?: string
  estado?: string
}

export default function ReportesPage() {
  const country = useCountryContext()
  const isPeru = country.paisCodigo === 'PE'
  const [filters, setFilters] = useState<ReportFilters>({
    fechaDesde: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    fechaHasta: format(new Date(), 'yyyy-MM-dd')
  })

  const [activeTab, setActiveTab] = useState('resumen-ventas')

  useEffect(() => {
    if (!isPeru && activeTab === 'sunat') {
      setActiveTab('resumen-ventas')
    }
  }, [isPeru, activeTab])

  const handleFilterChange = (field: keyof ReportFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleExportReport = async (reportType: string) => {
    alert('📥 Exportando reporte... (Funcionalidad próximamente)')
  }

  const tabs = [
    { id: 'resumen-ventas', label: 'Resumen Ventas', icon: FileText },
    { id: 'ventas-cliente', label: 'Ventas por Cliente', icon: Users },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
    { id: 'pedidos-estado', label: 'Pedidos', icon: BarChart3 },
    { id: 'productos', label: 'Productos', icon: Package },
    { id: 'top-clientes', label: 'Top Clientes', icon: TrendingUp },
    { id: 'lead-time', label: 'Lead Time', icon: DollarSign },
    { id: 'pipeline', label: 'Pipeline', icon: GitMerge },
    { id: 'fill-rate', label: 'Fill-rate & OTIF', icon: Activity },
    { id: 'aging', label: 'Aging CxC', icon: Clock },
    { id: 'sunat', label: 'SUNAT KPIs', icon: ShieldAlert }
  ].filter((tab) => isPeru || tab.id !== 'sunat')

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Reportes y Estadísticas</h1>
          <p className="mt-2 text-base text-muted-foreground">Analiza el desempeño de ventas y toma decisiones informadas</p>
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => handleExportReport(activeTab)}
        >
          <Download size={20} />
          Exportar
        </button>
      </div>

      {/* Global Filters */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="m-0 text-lg font-bold text-foreground">
            <Calendar size={20} className="mr-2" />
            Filtros Globales
          </h2>
        </div>
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
            <div>
              <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Fecha Desde
              </label>
              <input
                type="date"
                value={filters.fechaDesde}
                onChange={(e) => handleFilterChange('fechaDesde', e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>

            <div>
              <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Fecha Hasta
              </label>
              <input
                type="date"
                value={filters.fechaHasta}
                onChange={(e) => handleFilterChange('fechaHasta', e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>

            <div>
              <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Cliente (opcional)
              </label>
              <input
                type="text"
                placeholder="Filtrar por cliente..."
                value={filters.cliente || ''}
                onChange={(e) => handleFilterChange('cliente', e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              />
            </div>

            <div>
              <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                Estado (opcional)
              </label>
              <select
                value={filters.estado || ''}
                onChange={(e) => handleFilterChange('estado', e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="CONFIRMADO">Confirmado</option>
                <option value="FACTURADO">Facturado</option>
                <option value="COMPLETADO">Completado</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Reports Tabs */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        {/* Tab Navigation */}
        <div
          data-testid="sales-report-tabs"
          className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"
          role="tablist"
          aria-label="Secciones de reportes de ventas"
        >
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`report-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-center text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 leading-tight">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div id={`report-panel-${activeTab}`} role="tabpanel">
          {activeTab === 'ventas-cliente' && <VentasPorClienteReport filters={filters} />}
          {activeTab === 'resumen-ventas' && <ResumenVentasReport filters={filters} />}
          {activeTab === 'cotizaciones' && <CotizacionesPendientesReport filters={filters} />}
          {activeTab === 'pedidos-estado' && <PedidosPorEstadoReport filters={filters} />}
          {activeTab === 'productos' && <ProductosMasVendidosReport filters={filters} />}
          {activeTab === 'top-clientes' && <TopClientesReport filters={filters} />}
          {activeTab === 'lead-time' && <LeadTimeReport filters={filters} />}
          {activeTab === 'pipeline' && <PipelineReport filters={filters} />}
          {activeTab === 'fill-rate' && <FillRateReport filters={filters} />}
          {activeTab === 'aging' && <AgingCxcReport filters={filters} />}
          {activeTab === 'sunat' && <SunatMetricsReport filters={filters} />}
        </div>
      </div>
    </div>
  )
}
