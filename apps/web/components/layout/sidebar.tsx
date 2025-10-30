'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { customAuth } from '@/lib/auth-service'
import { useToast } from '@/components/ui/use-toast'
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
  DollarSign
} from 'lucide-react'

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
  },
  {
    title: 'POS',
    href: '/dashboard/pos',
    icon: ShoppingCart,
    permission: {
      modulo: 'ventas',
      accion: 'read',
      recurso: 'pos'
    }
  },
  {
    title: 'Documentos',
    href: '/dashboard/documentos',
    icon: FileText,
    permission: {
      modulo: 'documentos',
      accion: 'read',
      recurso: 'documentos'
    }
  },
  {
    title: 'Contabilidad',
    href: '/dashboard/contabilidad',
    icon: FileText,
    permission: {
      modulo: 'contabilidad',
      accion: 'read',
      recurso: 'libros'
    }
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: Download,
    permission: {
      modulo: 'reportes',
      accion: 'read',
      recurso: 'analytics'
    }
  },
  {
    title: 'Inventario',
    href: '/dashboard/inventario',
    icon: Package,
    permission: {
      modulo: 'inventario',
      accion: 'read',
      recurso: 'productos'
    }
  },
  {
    title: 'CPE',
    href: '/dashboard/cpe',
    icon: FileText,
    permission: {
      modulo: 'cpe',
      accion: 'read',
      recurso: 'comprobantes'
    }
  },
  {
    title: 'GRE',
    href: '/dashboard/gre',
    icon: Truck,
    permission: {
      modulo: 'gre',
      accion: 'read',
      recurso: 'guias'
    }
  },
  {
    title: 'Reportes SIRE',
    href: '/dashboard/sire',
    icon: Download,
    permission: {
      modulo: 'sire',
      accion: 'read',
      recurso: 'reportes'
    }
  },
  {
    title: 'Compras',
    href: '/dashboard/compras',
    icon: ShoppingCart,
    permission: {
      modulo: 'compras',
      accion: 'read',
      recurso: 'ordenes'
    }
  },
  {
    title: 'Ventas',
    icon: FileSpreadsheet,
    permission: {
      modulo: 'ventas',
      accion: 'read',
      recurso: 'cotizaciones'
    },
    submenu: [
      {
        title: 'Clientes',
        href: '/dashboard/ventas/clientes',
        icon: Users,
        permission: {
          modulo: 'ventas',
          accion: 'read',
          recurso: 'clientes'
        }
      },
      {
        title: 'Cotizaciones',
        href: '/dashboard/ventas/cotizaciones',
        icon: FileSpreadsheet,
        permission: {
          modulo: 'ventas',
          accion: 'read',
          recurso: 'cotizaciones'
        }
      },
      {
        title: 'Pedidos',
        href: '/dashboard/ventas/pedidos',
        icon: ShoppingCart,
        permission: {
          modulo: 'ventas',
          accion: 'read',
          recurso: 'pedidos'
        }
      },
      {
        title: 'Aprobaciones',
        href: '/dashboard/ventas/aprobaciones',
        icon: CheckCircle,
        permission: {
          modulo: 'ventas',
          accion: 'ver',
          recurso: 'aprobaciones'
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
      modulo: 'admin',
      accion: 'read',
      recurso: 'usuarios'
    }
  },
  {
    title: 'RRHH',
    href: '/dashboard/rrhh',
    icon: Users,
    permission: {
      modulo: 'rrhh',
      accion: 'read',
      recurso: 'empleados'
    }
  },
  {
    title: 'Configuración',
    href: '/dashboard/wizard',
    icon: Settings,
    permission: {
      modulo: 'admin',
      accion: 'read',
      recurso: 'configuracion'
    }
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
  const { isSuperAdmin } = useTenant()
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

  // Check permission if required
  const { hasPermission, loading } = item.permission
    ? usePermission(item.permission.modulo, item.permission.accion, item.permission.recurso)
    : { hasPermission: true, loading: false }

  // Filter super-admin only items
  if (item.superAdminOnly && !isSuperAdmin) {
    return null
  }

  // Filter items based on permissions (super-admins bypass this)
  if (item.permission && !isSuperAdmin && !loading && !hasPermission) {
    return null
  }

  // Show loading state for items being checked
  if (loading && item.permission) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: isTablet ? '0.75rem 1rem' : '1rem 1.5rem',
          margin: '0.25rem 0',
          borderRadius: '12px',
          color: '#94a3b8',
          fontSize: isTablet ? '0.85rem' : '0.9rem',
          minHeight: '44px',
          opacity: 0.5,
        }}
      >
        <Icon size={isTablet ? 18 : 20} style={{ marginRight: isTablet ? '0.5rem' : '0.75rem', flexShrink: 0 }} />
        <span style={{ 
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0
        }}>
          {item.title}
        </span>
      </div>
    )
  }

  // If item has submenu, render as expandable
  if (item.submenu) {
    return (
      <div style={{ margin: '0.25rem 0' }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: isTablet ? '0.75rem 1rem' : '1rem 1.5rem',
            borderRadius: '12px',
            textDecoration: 'none',
            color: isSubmenuActive ? 'white' : '#475569',
            fontWeight: isSubmenuActive ? '700' : '600',
            fontSize: isTablet ? '0.85rem' : '0.9rem',
            transition: 'all 0.3s ease',
            background: isSubmenuActive ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)' : 'transparent',
            boxShadow: isSubmenuActive ? '0 8px 16px rgba(59, 130, 246, 0.3)' : 'none',
            border: 'none',
            cursor: 'pointer',
            minHeight: '44px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <Icon size={isTablet ? 18 : 20} style={{ marginRight: isTablet ? '0.5rem' : '0.75rem', flexShrink: 0 }} />
            <span style={{ 
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0
            }}>
              {item.title}
            </span>
          </div>
          {isExpanded ? (
            <ChevronDown size={16} style={{ flexShrink: 0, marginLeft: '0.5rem' }} />
          ) : (
            <ChevronRight size={16} style={{ flexShrink: 0, marginLeft: '0.5rem' }} />
          )}
        </button>
        
        {isExpanded && (
          <div style={{ 
            marginLeft: isTablet ? '1rem' : '1.5rem',
            marginTop: '0.25rem'
          }}>
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

  // Regular menu item with link
  return (
    <Link
      key={item.href}
      href={item.href!}
      className={`nav-item ${isActive ? 'active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: isTablet ? '0.75rem 1rem' : '1rem 1.5rem',
        margin: '0.25rem 0',
        borderRadius: '12px',
        textDecoration: 'none',
        color: isActive ? 'white' : '#475569',
        fontWeight: isActive ? '700' : '600',
        fontSize: isTablet ? '0.85rem' : '0.9rem',
        transition: 'all 0.3s ease',
        background: isActive ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)' : 'transparent',
        boxShadow: isActive ? '0 8px 16px rgba(59, 130, 246, 0.3)' : 'none',
        transform: isActive ? 'translateY(-1px)' : 'none',
        border: isActive ? 'none' : '1px solid transparent',
        minHeight: '44px'
      }}
      onClick={onClose}
    >
      <Icon size={isTablet ? 18 : 20} style={{ marginRight: isTablet ? '0.5rem' : '0.75rem', flexShrink: 0 }} />
      <span style={{ 
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: 0
      }}>
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
  const posEnabled = process.env.NEXT_PUBLIC_FEATURE_POS_ENABLED === 'true'
  const rrhhEnabled = process.env.NEXT_PUBLIC_FEATURE_RRHH_ENABLED === 'true'

  const filteredMenuItems = menuItems
    .filter((item) => {
      // HARDENING: ocultar módulos deshabilitados por feature flags en el menú.
      if (!posEnabled && item.href === '/dashboard/pos') return false
      if (!rrhhEnabled && item.href === '/dashboard/rrhh') return false
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

  const sidebarWidth = isMobile ? '280px' : isTablet ? '240px' : '280px'

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          top: '1rem',
          left: '1rem',
          zIndex: 1002,
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '12px',
          padding: '0.75rem',
          cursor: 'pointer',
          display: isMobile ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
          transition: 'all 0.3s ease'
        }}
      >
        {isOpen ? <X size={20} style={{ color: '#475569' }} /> : <Menu size={20} style={{ color: '#475569' }} />}
      </button>

      {/* Sidebar */}
      <aside 
        className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          height: '100vh',
          width: sidebarWidth,
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.3)',
          padding: isTablet ? '1.5rem 0' : '2rem 0',
          overflowY: 'auto',
          overflowX: 'hidden',
          zIndex: 1001,
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Logo */}
        <div style={{ 
          padding: isTablet ? '1rem 1.5rem' : '1.5rem 2rem', 
          borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
          flexShrink: 0
        }}>
          <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img 
              src="/logo.png" 
              alt="NEON SYSTEM" 
              style={{ 
                width: isTablet ? '140px' : '180px',
                height: 'auto',
                objectFit: 'contain'
              }} 
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav style={{ 
          padding: isTablet ? '1.5rem 0.75rem' : '2rem 1rem',
          flex: 1,
          overflowY: 'auto'
        }}>
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
        <div style={{ 
          padding: isTablet ? '0.75rem' : '1rem', 
          borderTop: '1px solid rgba(203, 213, 225, 0.3)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: isTablet ? '0.75rem' : '1rem'
        }}>
          {/* User Info Card */}
          <div style={{ 
            padding: isTablet ? '0.75rem' : '1rem', 
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(14, 165, 233, 0.05) 100%)', 
            borderRadius: '12px',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <div style={{ 
              fontSize: isTablet ? '0.85rem' : '0.9rem', 
              fontWeight: '700', 
              color: '#1e293b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>{user?.nombre || 'Usuario'}</div>
            <div style={{ 
              fontSize: isTablet ? '0.75rem' : '0.8rem', 
              color: '#64748b', 
              fontWeight: '500',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>{user?.email || ''}</div>
          </div>
          
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: isTablet ? '0.5rem' : '0.75rem 1rem',
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: isTablet ? '0.85rem' : '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              minHeight: '44px'
            }}
          >
            <LogOut size={isTablet ? 16 : 18} style={{ marginRight: isTablet ? '0.25rem' : '0.5rem' }} />
            <span style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
