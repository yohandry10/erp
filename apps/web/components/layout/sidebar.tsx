'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { customAuth } from '@/lib/auth-service'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  Building2,
  FileText,
  Truck,
  Download,
  Package,
  ShoppingCart,
  FileSpreadsheet,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  DollarSign,
  HelpCircle
} from 'lucide-react'
import { useCountryContext } from '@/hooks/use-country-context'

interface MenuItem {
  title: string
  href?: string
  icon: any
  superAdminOnly?: boolean
  permission?: {
    modulo: string
    accion: string
    recurso: string
  }
  submenu?: MenuItem[]
}

// Permisos basados en la estructura de la BD (modulo, accion, recurso)
// Acciones en español: ver, crear, editar, eliminar, aprobar, etc.
const menuItems: MenuItem[] = [
  {
    title: 'Super Admin',
    href: '/superadmin/dashboard',
    icon: Shield,
    superAdminOnly: true
  },
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard
    // Dashboard visible para todos los usuarios autenticados
  },
  {
    title: 'POS',
    href: '/dashboard/pos',
    icon: ShoppingCart,
    permission: {
      modulo: 'pos',
      accion: 'ver',
      recurso: 'caja'
    }
  },
  {
    title: 'Documentos',
    href: '/dashboard/documentos',
    icon: FileText,
    permission: {
      modulo: 'documentos',
      accion: 'ver',
      recurso: 'facturas'
    }
  },
  {
    title: 'Contabilidad',
    href: '/dashboard/contabilidad',
    icon: FileText,
    permission: {
      modulo: 'contabilidad',
      accion: 'ver',
      recurso: 'asientos'
    }
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: Download,
    permission: {
      modulo: 'reportes',
      accion: 'ver',
      recurso: 'dashboard'
    }
  },
  {
    title: 'Inventario',
    icon: Package,
    permission: {
      modulo: 'inventario',
      accion: 'ver',
      recurso: 'productos'
    },
    submenu: [
      {
        title: 'Resumen',
        href: '/dashboard/inventario',
        icon: Package,
        permission: {
          modulo: 'inventario',
          accion: 'ver',
          recurso: 'productos'
        }
      },
      {
        title: 'Almacenes',
        href: '/dashboard/inventario/almacenes',
        icon: Building2,
        permission: {
          modulo: 'inventario',
          accion: 'ver',
          recurso: 'almacenes'
        }
      },
      {
        title: 'Recepciones',
        href: '/dashboard/inventario/recepciones',
        icon: Truck,
        permission: {
          modulo: 'inventario',
          accion: 'ver',
          recurso: 'recepciones'
        }
      },
      {
        title: 'Kardex',
        href: '/dashboard/inventario/kardex',
        icon: FileSpreadsheet,
        permission: {
          modulo: 'inventario',
          accion: 'ver',
          recurso: 'kardex'
        }
      },
      {
        title: 'Órdenes de Preparación',
        href: '/dashboard/inventario/logistica/ordenes-pendientes',
        icon: Package,
        permission: {
          modulo: 'logistica',
          accion: 'ver',
          recurso: 'ordenes_preparacion'
        }
      },
      {
        title: 'Listo para Despacho',
        href: '/dashboard/inventario/logistica/listo-despacho',
        icon: Truck,
        permission: {
          modulo: 'logistica',
          accion: 'ver',
          recurso: 'despachos'
        }
      }
    ]
  },
  {
    title: 'CPE',
    href: '/dashboard/cpe',
    icon: FileText,
    permission: {
      modulo: 'documentos',
      accion: 'ver',
      recurso: 'facturas'
    }
  },
  {
    title: 'GRE',
    href: '/dashboard/gre',
    icon: Truck,
    permission: {
      modulo: 'logistica',
      accion: 'ver',
      recurso: 'gre'
    }
  },
  {
    title: 'Reportes SIRE',
    href: '/dashboard/sire',
    icon: Download,
    permission: {
      modulo: 'reportes',
      accion: 'ver',
      recurso: 'ventas'
    }
  },
  {
    title: 'Compras',
    href: '/dashboard/compras',
    icon: ShoppingCart,
    permission: {
      modulo: 'compras',
      accion: 'ver',
      recurso: 'ordenes'
    }
  },
  {
    title: 'Ventas',
    icon: FileSpreadsheet,
    permission: {
      modulo: 'ventas',
      accion: 'ver',
      recurso: 'cotizaciones'
    },
    submenu: [
      {
        title: 'Clientes',
        href: '/dashboard/ventas/clientes',
        icon: Users,
        permission: {
          modulo: 'ventas',
          accion: 'ver',
          recurso: 'clientes'
        }
      },
      {
        title: 'Cotizaciones',
        href: '/dashboard/ventas/cotizaciones',
        icon: FileSpreadsheet,
        permission: {
          modulo: 'ventas',
          accion: 'ver',
          recurso: 'cotizaciones'
        }
      },
      {
        title: 'Pedidos',
        href: '/dashboard/ventas/pedidos',
        icon: ShoppingCart,
        permission: {
          modulo: 'ventas',
          accion: 'ver',
          recurso: 'pedidos'
        }
      },
      {
        title: 'Aprobaciones',
        href: '/dashboard/ventas/aprobaciones',
        icon: CheckCircle,
        permission: {
          modulo: 'ventas',
          accion: 'aprobar',
          recurso: 'pedidos'
        }
      }
    ]
  },
  {
    title: 'Finanzas',
    icon: DollarSign,
    permission: {
      modulo: 'finanzas',
      accion: 'ver',
      recurso: 'cxc'
    },
    submenu: [
      {
        title: 'Cuentas por Cobrar',
        href: '/dashboard/finanzas/cxc',
        icon: DollarSign,
        permission: {
          modulo: 'finanzas',
          accion: 'ver',
          recurso: 'cxc'
        }
      }
    ]
  },
  {
    title: 'Usuarios',
    href: '/dashboard/usuarios',
    icon: Users,
    permission: {
      modulo: 'configuracion',
      accion: 'ver',
      recurso: 'usuarios'
    }
  },
  {
    title: 'RRHH',
    href: '/dashboard/rrhh',
    icon: Users,
    permission: {
      modulo: 'rrhh',
      accion: 'ver',
      recurso: 'empleados'
    }
  },
  {
    title: 'Configuración',
    href: '/dashboard/wizard',
    icon: Settings,
    permission: {
      modulo: 'configuracion',
      accion: 'ver',
      recurso: 'empresa'
    }
  },
  {
    title: 'Auditoría',
    href: '/dashboard/audit-logs',
    icon: Shield,
    permission: {
      modulo: 'configuracion',
      accion: 'ver',
      recurso: 'usuarios'
    }
  },
  {
    title: 'Ayuda',
    href: '/dashboard/ayuda',
    icon: HelpCircle
    // Ayuda visible para todos
  }
]

import { useTenant } from '@/contexts/TenantContext'
import { usePermission } from '@/hooks/use-permission'

// Component to render a single menu item with permission check
function MenuItem({ item, pathname, isTablet, isMobile, onClose }: {
  item: MenuItem
  pathname: string
  isTablet: boolean
  isMobile: boolean
  onClose: () => void
}) {
  const { isSuperAdmin, user } = useTenant()
  const Icon = item.icon

  // Check if any submenu item is active
  const isSubmenuActive = item.submenu?.some(subItem => pathname === subItem.href) || false
  const isActive = pathname === item.href || isSubmenuActive

  // Initialize expanded state based on whether submenu is active
  const [isExpanded, setIsExpanded] = useState(isSubmenuActive)

  // Update expanded state when pathname changes and submenu becomes active
  useEffect(() => {
    if (isSubmenuActive) {
      setIsExpanded(true)
    }
  }, [isSubmenuActive])

  // El Admin del tenant tiene acceso a todo el menú
  // Los roles vienen del JWT como array de strings: ['ADMIN', 'VENDEDOR', etc]
  const userRoles: string[] = user?.roles || []
  const isAdmin = userRoles.includes('ADMIN')

  // Si es Admin o SuperAdmin, mostrar todo sin verificar permisos
  const bypassPermissions = isSuperAdmin || isAdmin

  // Check permission if required (only for items WITHOUT submenu)
  // Always call hook to maintain stable hook order per Rules of Hooks.
  const permissionResult = usePermission(
    item.permission?.modulo ?? '',
    item.permission?.accion ?? '',
    item.permission?.recurso ?? '',
  )
  const shouldCheckPermission = !!item.permission && !item.submenu
  const hasPermission = bypassPermissions || !shouldCheckPermission ? true : permissionResult.hasPermission
  const loading = bypassPermissions || !shouldCheckPermission ? false : permissionResult.loading

  // Filter super-admin only items
  if (item.superAdminOnly && !isSuperAdmin) {
    return null
  }

  // For items WITHOUT submenu, filter based on permissions
  // Admin/SuperAdmin users bypass permission checks
  if (!item.submenu && item.permission && !bypassPermissions && !loading && !hasPermission) {
    return null
  }

  // For items WITH submenu, always show the parent
  // The submenu items will handle their own permission checks
  // If all submenu items are hidden, the parent will still show (acceptable UX)

  // Show loading state for items being checked
  if (loading && item.permission) {
    return (
      <div className={cn('my-1 flex min-h-11 items-center rounded-xl text-slate-400 opacity-50 group-data-[erp-theme=light]/dashboard:text-slate-500', isTablet ? 'px-4 py-3 text-[0.85rem]' : 'px-6 py-4 text-sm')}>
        <Icon className={cn('shrink-0', isTablet ? 'mr-2 h-[18px] w-[18px]' : 'mr-3 h-5 w-5')} />
        <span className="min-w-0 truncate whitespace-nowrap">
          {item.title}
        </span>
      </div>
    )
  }

  // If item has submenu, render as expandable
  if (item.submenu) {
    return (
      <div className="my-1">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex min-h-11 w-full items-center justify-between rounded-xl border border-transparent transition duration-300',
            isTablet ? 'px-4 py-3 text-[0.85rem]' : 'px-6 py-4 text-sm',
            isSubmenuActive
              ? 'bg-gradient-to-br from-cyan-500 to-blue-600 font-bold text-white shadow-[0_18px_40px_rgba(8,145,178,0.25)]'
              : 'font-semibold text-slate-300 hover:border-cyan-300/20 hover:bg-cyan-400/10 hover:text-cyan-50 group-data-[erp-theme=light]/dashboard:text-slate-600 group-data-[erp-theme=light]/dashboard:hover:border-blue-200 group-data-[erp-theme=light]/dashboard:hover:bg-blue-50 group-data-[erp-theme=light]/dashboard:hover:text-blue-700',
          )}
        >
          <div className="flex min-w-0 flex-1 items-center">
            <Icon className={cn('shrink-0', isTablet ? 'mr-2 h-[18px] w-[18px]' : 'mr-3 h-5 w-5')} />
            <span className="min-w-0 truncate whitespace-nowrap">
              {item.title}
            </span>
          </div>
          {isExpanded ? (
            <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="ml-2 h-4 w-4 shrink-0" />
          )}
        </button>

        {isExpanded && (
          <div className={cn('mt-1', isTablet ? 'ml-4' : 'ml-6')}>
            {item.submenu.map((subItem) => (
              <MenuItem
                key={subItem.href}
                item={subItem}
                pathname={pathname}
                isTablet={isTablet}
                isMobile={isMobile}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Generar data-tour basado en el título del item
  const getDataTour = (title: string): string => {
    const tourMap: Record<string, string> = {
      'Dashboard': 'menu-dashboard',
      'POS': 'menu-pos',
      'Ventas': 'menu-ventas',
      'Clientes': 'menu-clientes',
      'Cotizaciones': 'menu-cotizaciones',
      'Pedidos': 'menu-pedidos',
      'Inventario': 'menu-inventario',
      'Finanzas': 'menu-finanzas',
      'Configuración': 'menu-configuracion',
      'Usuarios': 'menu-usuarios',
      'Reportes SIRE': 'menu-reportes',
      'Analytics': 'menu-reportes',
      'Compras': 'menu-compras',
      'RRHH': 'menu-rrhh',
      'Contabilidad': 'menu-contabilidad',
    }
    return tourMap[title] || `menu-${title.toLowerCase().replace(/\s+/g, '-')}`
  }

  // Regular menu item with link
  return (
    <Link
      key={item.href}
      href={item.href!}
      className={cn(
        'nav-item my-1 flex min-h-11 items-center rounded-xl border transition duration-300',
        isTablet ? 'px-4 py-3 text-[0.85rem]' : 'px-6 py-4 text-sm',
        isActive
          ? 'active -translate-y-px border-transparent bg-gradient-to-br from-cyan-500 to-blue-600 font-bold text-white shadow-[0_18px_40px_rgba(8,145,178,0.25)]'
          : 'border-transparent font-semibold text-slate-300 hover:border-cyan-300/20 hover:bg-cyan-400/10 hover:text-cyan-50 group-data-[erp-theme=light]/dashboard:text-slate-600 group-data-[erp-theme=light]/dashboard:hover:border-blue-200 group-data-[erp-theme=light]/dashboard:hover:bg-blue-50 group-data-[erp-theme=light]/dashboard:hover:text-blue-700',
      )}
      data-tour={getDataTour(item.title)}
      onClick={onClose}
    >
      <Icon className={cn('shrink-0', isTablet ? 'mr-2 h-[18px] w-[18px]' : 'mr-3 h-5 w-5')} />
      <span className="min-w-0 truncate whitespace-nowrap">
        {item.title}
      </span>
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const { isSuperAdmin, user } = useTenant()
  const country = useCountryContext()
  const isPeru = country.paisCodigo === 'PE'
  const posEnabled = process.env.NEXT_PUBLIC_FEATURE_POS_ENABLED === 'true'
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true'
  const inventarioEnabled =
    process.env.NEXT_PUBLIC_FEATURE_INVENTARIO_ENABLED === undefined
      ? true
      : process.env.NEXT_PUBLIC_FEATURE_INVENTARIO_ENABLED === 'true'

  const filteredMenuItems = menuItems
    .filter((item) => {
      // HARDENING: ocultar módulos deshabilitados por feature flags en el menú.
      if (!posEnabled && item.href === '/dashboard/pos') return false
      if (!rrhhEnabled && item.href === '/dashboard/rrhh') return false
      if (!inventarioEnabled && item.title === 'Inventario') return false
      if (!isPeru && (item.href === '/dashboard/sire' || item.title === 'Reportes SIRE')) return false
      return true
    })
    .map((item) => {
      if (!rrhhEnabled && item.submenu) {
        return {
          ...item,
          submenu: item.submenu?.filter((subItem) => !subItem.href?.startsWith('/dashboard/rrhh'))
        }
      }
      return item
    })

  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)

  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth
      setIsMobile(width < 768)
      setIsTablet(width >= 768 && width < 1024)
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  // Cerrar sidebar automáticamente en mobile cuando se redimensiona
  useEffect(() => {
    if (!isMobile) {
      setIsOpen(false)
    }
  }, [isMobile])

  const handleLogout = async () => {
    try {
      const { error } = await customAuth.signOut()
      if (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo cerrar sesión",
        })
      } else {
        toast({
          title: "Sesión cerrada",
          description: "Has cerrado sesión exitosamente",
        })
        router.push('/login')
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error inesperado",
      })
    }
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        className={cn(
          'mobile-menu-btn fixed left-4 top-4 z-[1002] hidden cursor-pointer items-center justify-center rounded-xl border border-cyan-300/20 bg-slate-950/95 p-3 text-sky-100 shadow-lg backdrop-blur-xl transition duration-300 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:bg-white/95 group-data-[erp-theme=light]/dashboard:text-blue-800',
          isMobile && 'flex',
        )}
        aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
        title={isOpen ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'sidebar fixed left-0 top-0 z-[1001] h-screen w-[280px] overflow-x-hidden overflow-y-auto border-r border-cyan-300/15 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 shadow-[24px_0_70px_rgba(2,8,23,0.5)] backdrop-blur-xl transition-transform duration-300 ease-out [-webkit-overflow-scrolling:touch] group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:from-white group-data-[erp-theme=light]/dashboard:via-slate-50 group-data-[erp-theme=light]/dashboard:to-slate-100 group-data-[erp-theme=light]/dashboard:shadow-[24px_0_70px_rgba(15,23,42,0.12)]',
          isTablet ? 'py-6 md:w-[240px] lg:w-[280px]' : 'py-8',
          isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0',
          isOpen && 'sidebar-open',
        )}
      >
        {/* Logo */}
        <div className={cn('shrink-0 border-b border-slate-400/15 group-data-[erp-theme=light]/dashboard:border-slate-200', isTablet ? 'px-5 py-4' : 'p-6')}>
          <Link
            href="/dashboard"
            className={cn(
              'flex items-center gap-3 rounded-[18px] border border-cyan-300/20 bg-gradient-to-br from-sky-950/75 to-slate-900/65 no-underline shadow-[0_18px_45px_rgba(8,145,178,0.12)] group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:from-white group-data-[erp-theme=light]/dashboard:to-blue-50',
              isTablet ? 'p-3' : 'p-3.5',
            )}
          >
            <span className={cn('grid place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 font-black tracking-normal text-cyan-50 shadow-[0_16px_35px_rgba(37,99,235,0.35)]', isTablet ? 'h-11 w-11 text-lg' : 'h-[50px] w-[50px] text-[1.35rem]')}>
              N
            </span>
            <span className="min-w-0">
              <span className={cn('block font-black leading-none tracking-[0.08em] text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950', isTablet ? 'text-[0.95rem]' : 'text-[1.05rem]')}>
                NEON
              </span>
              <span className={cn('mt-1 block font-bold leading-none tracking-[0.2em] text-cyan-300 group-data-[erp-theme=light]/dashboard:text-blue-600', isTablet ? 'text-[0.62rem]' : 'text-[0.68rem]')}>
                ERP SUITE
              </span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto', isTablet ? 'px-3 py-6' : 'px-4 py-8')}>
          {filteredMenuItems.map((item) => (
            <MenuItem
              key={item.href || item.title}
              item={item}
              pathname={pathname}
              isTablet={isTablet}
              isMobile={isMobile}
              onClose={() => isMobile && setIsOpen(false)}
            />
          ))}
        </nav>

        {/* User Section */}
        <div className={cn('flex shrink-0 flex-col border-t border-slate-400/15', isTablet ? 'gap-3 p-3' : 'gap-4 p-4')}>
          {/* User Info Card */}
          <div className={cn('rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 to-blue-500/10 group-data-[erp-theme=light]/dashboard:border-blue-100 group-data-[erp-theme=light]/dashboard:from-blue-50 group-data-[erp-theme=light]/dashboard:to-white', isTablet ? 'p-3' : 'p-4')}>
            <div className={cn('truncate whitespace-nowrap font-bold text-sky-100 group-data-[erp-theme=light]/dashboard:text-slate-950', isTablet ? 'text-[0.85rem]' : 'text-sm')}>{user?.nombre || 'Usuario'}</div>
            <div className={cn('truncate whitespace-nowrap font-medium text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-500', isTablet ? 'text-xs' : 'text-[0.8rem]')}>{user?.email || ''}</div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className={cn('flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-500/40 bg-transparent font-semibold text-slate-300 transition duration-300 hover:border-cyan-300/30 hover:bg-cyan-400/10 hover:text-cyan-50 group-data-[erp-theme=light]/dashboard:border-slate-200 group-data-[erp-theme=light]/dashboard:text-slate-600 group-data-[erp-theme=light]/dashboard:hover:border-blue-200 group-data-[erp-theme=light]/dashboard:hover:bg-blue-50 group-data-[erp-theme=light]/dashboard:hover:text-blue-700', isTablet ? 'p-2 text-[0.85rem]' : 'px-4 py-3 text-sm')}
          >
            <LogOut className={cn('shrink-0', isTablet ? 'mr-1 h-4 w-4' : 'mr-2 h-[18px] w-[18px]')} />
            <span className="truncate whitespace-nowrap">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-[1000] bg-slate-900/80 backdrop-blur"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
