'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useCountryContext } from '@/hooks/use-country-context'
import { 
  Building2, 
  FileText, 
  Truck, 
  Download, 
  Package,
  ShoppingCart,
  FileSpreadsheet,
  LogOut,
  Menu,
  X
} from 'lucide-react'

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Building2,
  },
  {
    name: 'CPE',
    href: '/dashboard/cpe',
    icon: FileText,
  },
  {
    name: 'GRE',
    href: '/dashboard/gre',
    icon: Truck,
  },
  {
    name: 'SIRE',
    href: '/dashboard/sire',
    icon: Download,
  },
  {
    name: 'Inventario',
    href: '/dashboard/inventario',
    icon: Package,
  },
  {
    name: 'Compras',
    href: '/dashboard/compras',
    icon: ShoppingCart,
  },
  {
    name: 'Cotizaciones',
    href: '/dashboard/cotizaciones',
    icon: FileSpreadsheet,
  },
]

export function DashboardNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()
  const { toast } = useToast()
  const country = useCountryContext()
  const isPeru = country.paisCodigo === 'PE'
  const visibleNavigation = navigation.filter((item) => isPeru || item.href !== '/dashboard/sire')

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

  return (
    <>
      <nav className="border-b border-white/30 bg-white/90 shadow-lg backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-8">
          <div className="flex h-16 justify-between">
            <div className="flex items-center">
              {/* Logo */}
              <div className="flex shrink-0 items-center">
                <Building2 className="h-8 w-8 text-[var(--blue-600)]" />
                <span className="ml-3 text-xl font-extrabold text-[var(--blue-700)]">
                  ERP Suite
                </span>
              </div>

              {/* Desktop Navigation */}
              <div className="ml-8 hidden gap-2 sm:flex">
                {visibleNavigation.map((item) => {
                  const isActive = pathname === item.href || 
                    (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`inline-flex items-center rounded-t-md border-b-2 px-6 py-3 text-sm font-semibold transition ${
                        isActive
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-blue-700'
                      }`}
                    >
                      <item.icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Desktop Logout */}
            <div className="ml-8 hidden items-center sm:flex">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout} className="inline-flex items-center"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar Sesión
              </Button>
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center sm:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="border-t border-white/30 bg-white/95 backdrop-blur-xl sm:hidden">
            <div className="flex flex-col gap-2 py-4">
              {visibleNavigation.map((item) => {
                const isActive = pathname === item.href || 
                  (item.href !== '/dashboard' && pathname.startsWith(item.href))
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`block border-l-4 px-6 py-4 text-base font-semibold transition ${
                      isActive
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-transparent text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </div>
                  </Link>
                )
              })}
              
              {/* Mobile Logout */}
              <button
                onClick={handleLogout} className="w-full cursor-pointer border-0 bg-transparent px-6 py-4 text-left text-base font-semibold text-slate-600"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="w-5 h-5" />
                  Cerrar Sesión
                </div>
              </button>
            </div>
          </div>
        )}
      </nav>
    </>
  )
} 
