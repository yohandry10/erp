'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
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
  X
} from 'lucide-react'

const menuItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: Building2
  },
  {
    title: 'POS',
    href: '/dashboard/pos',
    icon: ShoppingCart
  },
  {
    title: 'Documentos',
    href: '/dashboard/documentos',
    icon: FileText
  },
  {
    title: 'Contabilidad',
    href: '/dashboard/contabilidad',
    icon: FileText
  },
  {
    title: 'Analytics',
    href: '/dashboard/analytics',
    icon: Download
  },
  {
    title: 'Inventario',
    href: '/dashboard/inventario',
    icon: Package
  },
  {
    title: 'CPE',
    href: '/dashboard/cpe',
    icon: FileText
  },
  {
    title: 'GRE',
    href: '/dashboard/gre',
    icon: Truck
  },
  {
    title: 'Reportes SIRE',
    href: '/dashboard/sire',
    icon: Download
  },
  {
    title: 'Compras',
    href: '/dashboard/compras',
    icon: ShoppingCart
  },
  {
    title: 'Cotizaciones',
    href: '/dashboard/cotizaciones',
    icon: FileSpreadsheet
  },
  {
    title: 'Usuarios',
    href: '/dashboard/usuarios',
    icon: Users
  },
  {
    title: 'RRHH',
    href: '/dashboard/rrhh',
    icon: Users
  },
  {
    title: 'Configuración',
    href: '/dashboard/configuracion',
    icon: Settings
  }
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()
  const { toast } = useToast()
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
      const { error } = await supabase.auth.signOut()
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
          padding: isTablet ? '0 1.5rem 1.5rem 1.5rem' : '0 2rem 2rem 2rem', 
          borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
          flexShrink: 0
        }}>
          <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <Building2 size={isTablet ? 28 : 32} style={{ marginRight: '0.75rem', color: '#3b82f6', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ 
                fontSize: isTablet ? '1.25rem' : '1.5rem', 
                fontWeight: '800', 
                margin: 0, 
                background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.025em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                CABIMAS ERP
              </h1>
              <p style={{ 
                fontSize: isTablet ? '0.75rem' : '0.8rem', 
                color: '#64748b', 
                margin: 0, 
                fontWeight: '500',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                Sistema Empresarial
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav style={{ 
          padding: isTablet ? '1.5rem 0.75rem' : '2rem 1rem',
          flex: 1,
          overflowY: 'auto'
        }}>
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            
            return (
              <Link
                key={item.href}
                href={item.href}
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
                onClick={() => isMobile && setIsOpen(false)}
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
          })}
        </nav>

        {/* User Section */}
        <div style={{ 
          padding: isTablet ? '0.75rem' : '1rem', 
          borderTop: '1px solid rgba(203, 213, 225, 0.3)',
          flexShrink: 0
        }}>
          <div style={{ 
            padding: isTablet ? '0.75rem' : '1rem', 
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(14, 165, 233, 0.05) 100%)', 
            borderRadius: '12px', 
            marginBottom: isTablet ? '0.75rem' : '1rem',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <div style={{ 
              fontSize: isTablet ? '0.85rem' : '0.9rem', 
              fontWeight: '700', 
              color: '#1e293b',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>Admin Kame</div>
            <div style={{ 
              fontSize: isTablet ? '0.75rem' : '0.8rem', 
              color: '#64748b', 
              fontWeight: '500',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>admin@kame.demo</div>
          </div>
          
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