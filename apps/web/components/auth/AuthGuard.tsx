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
    // No hacer nada mientras está cargando
    if (loading) {
      console.log('⏳ [AuthGuard] Cargando sesión...')
      return
    }

    // Si requiere auth y no hay sesión, redirigir a login
    if (requireAuth && !session) {
      console.log('🔒 [AuthGuard] Ruta protegida sin sesión, redirigiendo a login')
      console.log('🔒 [AuthGuard] Ruta actual:', pathname)
      router.push('/login')
      return
    }

    // Si NO requiere auth y HAY sesión, redirigir a dashboard (ej: página de login)
    if (!requireAuth && session && pathname === '/login') {
      console.log('✅ [AuthGuard] Usuario ya autenticado en página de login, redirigiendo a dashboard')
      router.push('/dashboard')
      return
    }

    console.log('✅ [AuthGuard] Acceso permitido:', {
      requireAuth,
      hasSession: !!session,
      pathname
    })
  }, [session, loading, requireAuth, router, pathname])

  if (loading) {
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
