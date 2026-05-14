'use client'

import Link from 'next/link'
import { CheckSquare, FileText, ShoppingCart, Users, BarChart3 } from 'lucide-react'

const sections = [
  {
    href: '/dashboard/ventas/clientes',
    title: 'Clientes',
    description: 'Directorio comercial, datos fiscales y crédito.',
    icon: Users,
  },
  {
    href: '/dashboard/ventas/cotizaciones',
    title: 'Cotizaciones',
    description: 'Propuestas comerciales y conversión a pedidos.',
    icon: FileText,
  },
  {
    href: '/dashboard/ventas/pedidos',
    title: 'Pedidos',
    description: 'Seguimiento operativo de pedidos de venta.',
    icon: ShoppingCart,
  },
  {
    href: '/dashboard/ventas/aprobaciones',
    title: 'Aprobaciones',
    description: 'Pedidos retenidos por crédito, descuento o reglas.',
    icon: CheckSquare,
  },
  {
    href: '/dashboard/ventas/reportes',
    title: 'Reportes',
    description: 'Indicadores comerciales, pipeline y análisis.',
    icon: BarChart3,
  },
]

export default function VentasPage() {
  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Ventas</h1>
          <p className="dashboard-subtitle">
            Acceso operativo a clientes, cotizaciones, pedidos, aprobaciones y reportes comerciales
          </p>
        </div>
      </div>

      <div className="activity-section">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sections.map((section) => {
            const Icon = section.icon

            return (
              <Link
                key={section.href}
                href={section.href}
                className="activity-card"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem' }}>
                      {section.title}
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
                      {section.description}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
