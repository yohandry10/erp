'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { customAuth } from '@/lib/auth-service'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      try {
        setIsChecking(true)
        
        // Verificar si hay token en localStorage directamente
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
        
        if (!token) {
          console.warn('⚠️ [ProtectedRoute] No hay token, redirigiendo a login')
          if (isMounted && pathname !== '/login') {
            router.replace('/login')
          }
          return
        }

        // Verificar sesión con el servicio de auth
        const { data } = await customAuth.getSession()
        
        if (!data.session || !data.session.access_token) {
          console.warn('⚠️ [ProtectedRoute] Sesión inválida, redirigiendo a login')
          if (isMounted && pathname !== '/login') {
            router.replace('/login')
          }
          return
        }

        console.log('✅ [ProtectedRoute] Usuario autenticado:', {
          userId: data.session.user.id,
          email: data.session.user.email,
          hasToken: !!data.session.access_token
        })
        
        if (isMounted) {
          setIsAuthenticated(true)
        }
      } catch (error) {
        console.error('❌ [ProtectedRoute] Error verificando autenticación:', error)
        if (isMounted && pathname !== '/login') {
          router.replace('/login')
        }
      } finally {
        if (isMounted) {
          setIsChecking(false)
        }
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [router, pathname])

  // Mostrar loading solo si está verificando
  if (isChecking) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #e2e8f0',
            borderTop: '4px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p style={{ color: '#64748b', fontSize: '1.1rem' }}>
            Verificando autenticación...
          </p>
        </div>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Si no está autenticado, no renderizar nada (ya se redirigió)
  if (!isAuthenticated) {
    return null
  }

  // Usuario autenticado, renderizar children
  return <>{children}</>
}
