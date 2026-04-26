'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Home, Users, FileText, ShoppingCart, type LucideIcon } from 'lucide-react'

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

      <style jsx>{`
        .ventas-layout {
          min-height: 100vh;
          background: transparent;
        }

        .ventas-breadcrumbs {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%);
          backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid rgba(226, 232, 240, 0.5);
          padding: 1rem 2rem;
          box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
          position: sticky;
          top: 0;
          z-index: 10;
          border-radius: 0;
        }

        .breadcrumbs-nav {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          max-width: 1600px;
          margin: 0 auto;
        }

        .breadcrumb-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        :global(.breadcrumb-separator) {
          color: #94a3b8;
          flex-shrink: 0;
        }

        .breadcrumb-current {
          font-size: 0.875rem;
          font-weight: 600;
          color: #1e293b;
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          border-radius: 6px;
        }

        :global(.breadcrumb-link) {
          font-size: 0.875rem;
          font-weight: 500;
          color: #64748b;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border-radius: 6px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        :global(.breadcrumb-link:hover) {
          color: #3b82f6;
          background: rgba(59, 130, 246, 0.1);
        }

        .ventas-content {
          padding: 0;
          max-width: 1600px;
          margin: 0 auto;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .ventas-breadcrumbs {
            padding: 0.75rem 1rem;
          }

          .breadcrumbs-nav {
            gap: 0.375rem;
          }

          .breadcrumb-current,
          :global(.breadcrumb-link) {
            font-size: 0.8125rem;
            padding: 0.25rem 0.5rem;
          }

          :global(.breadcrumb-separator) {
            display: none;
          }

          .breadcrumb-item:not(:first-child)::before {
            content: '›';
            color: #94a3b8;
            margin-right: 0.375rem;
          }
        }

        @media (max-width: 480px) {
          .ventas-breadcrumbs {
            padding: 0.5rem 1rem;
          }

          .breadcrumb-current,
          :global(.breadcrumb-link) {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  )
}
