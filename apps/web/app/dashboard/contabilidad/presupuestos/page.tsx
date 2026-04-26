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
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem'
      }}>
        {sections.map((section) => {
          const Icon = section.icon
          
          return (
            <button
              key={section.id}
              onClick={() => section.available && router.push(section.path)}
              disabled={!section.available}
              style={{
                padding: '2rem',
                borderRadius: '12px',
                border: '2px solid transparent',
                background: 'white',
                cursor: section.available ? 'pointer' : 'not-allowed',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                opacity: section.available ? 1 : 0.6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                position: 'relative'
              }}
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
                <div style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  background: '#6b7280',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  textTransform: 'uppercase'
                }}>
                  Próximamente
                </div>
              )}
              
              <div style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  background: `${section.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Icon size={28} style={{ color: section.color }} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: '600', 
                    color: '#111827',
                    margin: '0 0 0.5rem 0'
                  }}>
                    {section.title}
                  </h3>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280',
                    margin: 0,
                    lineHeight: '1.5'
                  }}>
                    {section.description}
                  </p>
                </div>
              </div>

              {section.available && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: section.color,
                  marginTop: '1rem'
                }}>
                  Ver más
                  <span style={{ fontSize: '1.25rem' }}>→</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Info Box */}
      <div style={{
        marginTop: '2rem',
        padding: '1.5rem',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '12px'
      }}>
        <h4 style={{ 
          margin: '0 0 0.5rem 0', 
          fontSize: '1rem', 
          fontWeight: '600', 
          color: '#1e40af' 
        }}>
          💡 Acerca de los Presupuestos
        </h4>
        <p style={{ 
          margin: 0, 
          fontSize: '0.875rem', 
          color: '#1e40af',
          lineHeight: '1.6'
        }}>
          Los presupuestos permiten planificar y controlar los gastos por centro de costo y cuenta contable.
          El sistema calcula automáticamente la ejecución presupuestal basándose en los asientos contables
          generados y emite alertas cuando se supera el 90% de ejecución o cuando hay sobregiros.
        </p>
      </div>
    </div>
  )
}
