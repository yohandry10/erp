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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Ventas</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Acceso operativo a clientes, cotizaciones, pedidos, aprobaciones y reportes comerciales
          </p>
        </div>
      </div>

      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sections.map((section) => {
            const Icon = section.icon

            return (
              <Link
                key={section.href}
                href={section.href}
                className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl block p-5"
              >
                <div className="flex items-start gap-[0.875rem]">
                  <div className="bg-[rgba(59,_130,_246,_0.1)] text-primary flex items-center justify-center shrink-0"
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">
                      {section.title}
                    </h2>
                    <p className="text-[0.875rem] text-muted-foreground m-0">
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
