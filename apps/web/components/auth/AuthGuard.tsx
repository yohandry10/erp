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

  // Mostrar loading mientras se verifica la sesión
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f4f6',
          borderTop: '4px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Verificando sesión...
        </p>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
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
