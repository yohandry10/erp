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
                className="activity-card block p-5"
              >
                <div className="flex items-start gap-[0.875rem]">
                  <div className="bg-[rgba(59,_130,_246,_0.1)] text-blue-600 flex items-center justify-center shrink-0"
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <h2 className="text-4 font-bold">
                      {section.title}
                    </h2>
                    <p className="text-[0.875rem] text-slate-500 m-0">
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
