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
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Reportes Financieros</h1>
          <p className="dashboard-subtitle">Análisis y reportes del módulo de finanzas</p>
        </div>
        <button
          onClick={handleExport}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: '#374151',
            transition: 'all 0.2s ease'
          }}
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
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {reports.map((report) => {
          const Icon = report.icon
          const isSelected = selectedReport === report.id
          
          return (
            <button
              key={report.id}
              onClick={() => report.available && setSelectedReport(report.id)}
              disabled={!report.available}
              style={{
                padding: '1.5rem',
                borderRadius: '12px',
                border: isSelected ? `2px solid ${report.color}` : '2px solid transparent',
                background: isSelected ? `${report.color}10` : 'white',
                cursor: report.available ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                opacity: report.available ? 1 : 0.5,
                boxShadow: isSelected 
                  ? `0 4px 12px ${report.color}30` 
                  : '0 1px 3px rgba(0,0,0,0.1)',
                position: 'relative'
              }}
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
                <div style={{
                  position: 'absolute',
                  top: '0.75rem',
                  right: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  background: '#6b7280',
                  color: 'white',
                  fontSize: '0.625rem',
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>
                  Próximamente
                </div>
              )}
              
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                marginBottom: '0.75rem'
              }}>
                <div style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: `${report.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={24} style={{ color: report.color }} />
                </div>
                <h3 style={{ 
                  fontSize: '1rem', 
                  fontWeight: '600', 
                  color: '#111827',
                  margin: 0
                }}>
                  {report.title}
                </h3>
              </div>
              
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#6b7280',
                margin: 0,
                lineHeight: '1.5'
              }}>
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
