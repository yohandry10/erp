'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { CheckSquare, ChevronRight, FileText, Home, ShoppingCart, Users, type LucideIcon } from 'lucide-react'

interface Breadcrumb {
  label: string
  href: string
  icon?: LucideIcon
}

export default function VentasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Generate breadcrumbs from pathname
  const generateBreadcrumbs = (): Breadcrumb[] => {
    const paths = pathname.split('/').filter(Boolean)
    const breadcrumbs: Breadcrumb[] = [
      { label: 'Dashboard', href: '/dashboard', icon: Home }
    ]

    let currentPath = ''
    paths.forEach((path) => {
      currentPath += `/${path}`
      
      // Skip the first 'dashboard' segment as it's already in breadcrumbs
      if (path === 'dashboard') return

      // Format the label and assign icons
      let label = path.charAt(0).toUpperCase() + path.slice(1)
      let icon: Breadcrumb['icon'] = undefined
      
      // Special formatting for known paths
      if (path === 'ventas') {
        label = 'Ventas'
        icon = ShoppingCart
      }
      if (path === 'clientes') {
        label = 'Clientes'
        icon = Users
      }
      if (path === 'cotizaciones') {
        label = 'Cotizaciones'
        icon = FileText
      }
      if (path === 'pedidos') {
        label = 'Pedidos'
        icon = ShoppingCart
      }
      if (path === 'aprobaciones') {
        label = 'Aprobaciones'
        icon = CheckSquare
      }
      if (path === 'nuevo') label = 'Nuevo'
      
      // Handle dynamic routes (IDs)
      if (path.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        label = 'Detalle'
      }
      
      breadcrumbs.push({
        label,
        href: currentPath,
        icon
      })
    })

    return breadcrumbs
  }

  const breadcrumbs = generateBreadcrumbs()

  return (
    <div className="ventas-layout">
      {/* Breadcrumbs */}
      <div className="ventas-breadcrumbs">
        <nav className="breadcrumbs-nav">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1
            const Icon = crumb.icon

            return (
              <div key={crumb.href} className="breadcrumb-item">
                {index > 0 && (
                  <ChevronRight size={16} className="breadcrumb-separator" />
                )}
                {isLast ? (
                  <span className="breadcrumb-current">
                    {Icon && <Icon size={16} />}
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className="breadcrumb-link">
                    {Icon && <Icon size={16} />}
                    {crumb.label}
                  </Link>
                )}
              </div>
            )
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="ventas-content">
        {children}
      </div>
    </div>
  )
}
