'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
}

/**
 * AuthGuard - Protege rutas que requieren autenticación
 * 
 * Uso:
 * <AuthGuard requireAuth={true}>
 *   <DashboardContent />
 * </AuthGuard>
 */
export function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { session, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return

    if (requireAuth && !session) {
      router.push('/login')
      return
    }

    if (!requireAuth && session && pathname === '/login') {
      router.push('/dashboard')
      return
    }
  }, [session, loading, requireAuth, router, pathname])

  if (loading) {
    // Si hay sesión cacheada (localStorage), mostrar children para evitar flash.
    // Si no hay sesión cacheada, no mostrar nada (usuario probablemente no autenticado).
    if (requireAuth && !session) {
      return null
    }
    return <>{children}</>
  }

  // Si requiere auth y no hay sesión, no renderizar nada (se redirigirá)
  if (requireAuth && !session) {
    return null
  }

  // Si NO requiere auth y HAY sesión en login, no renderizar (se redirigirá)
  if (!requireAuth && session && pathname === '/login') {
    return null
  }

  // Renderizar children si todo está OK
  return <>{children}</>
}
