'use client'

import { useState } from 'react'
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

interface ReportFilters {
  fechaDesde: string
  fechaHasta: string
  vendedor?: string
  cliente?: string
  estado?: string
}

export default function ReportesPage() {
  const [filters, setFilters] = useState<ReportFilters>({
    fechaDesde: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    fechaHasta: format(new Date(), 'yyyy-MM-dd')
  })

  const [activeTab, setActiveTab] = useState('ventas-cliente')

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
  ]

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Reportes y Estadísticas</h1>
          <p className="dashboard-subtitle">Analiza el desempeño de ventas y toma decisiones informadas</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={() => handleExportReport(activeTab)}
        >
          <Download size={20} />
          Exportar
        </button>
      </div>

      {/* Global Filters */}
      <div className="activity-section">
        <div className="activity-header">
          <h2 className="activity-title">
            <Calendar size={20} style={{ marginRight: '0.5rem' }} />
            Filtros Globales
          </h2>
        </div>
        <div className="activity-card">
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem' 
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Fecha Desde
              </label>
              <input
                type="date"
                value={filters.fechaDesde}
                onChange={(e) => handleFilterChange('fechaDesde', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Fecha Hasta
              </label>
              <input
                type="date"
                value={filters.fechaHasta}
                onChange={(e) => handleFilterChange('fechaHasta', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Cliente (opcional)
              </label>
              <input
                type="text"
                placeholder="Filtrar por cliente..."
                value={filters.cliente || ''}
                onChange={(e) => handleFilterChange('cliente', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Estado (opcional)
              </label>
              <select
                value={filters.estado || ''}
                onChange={(e) => handleFilterChange('estado', e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
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
      <div className="activity-section">
        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          marginBottom: '1.5rem', 
          overflowX: 'auto',
          borderBottom: '2px solid #e5e7eb',
          paddingBottom: '0.5rem'
        }}>
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px 8px 0 0',
                  border: 'none',
                  background: activeTab === tab.id ? '#3b82f6' : 'transparent',
                  color: activeTab === tab.id ? 'white' : '#6b7280',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s'
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'ventas-cliente' && <VentasPorClienteReport filters={filters} />}
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
