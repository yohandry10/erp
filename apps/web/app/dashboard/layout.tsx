'use client'

import Sidebar from '../../components/layout/sidebar'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EmpresaConfigProvider } from '@/hooks/use-empresa-config'
import { customAuth } from '@/lib/auth-service'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  // Verificar autenticación al montar
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('🔍 [DashboardLayout] Verificando autenticación...')
        
        // ✅ Dar un pequeño delay para asegurar que localStorage esté sincronizado
        // Esto previene race conditions cuando se redirige desde login
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Verificar token en localStorage primero
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
        
        console.log('🔍 [DashboardLayout] Token en localStorage:', token ? 'SÍ' : 'NO')
        
        if (!token) {
          console.warn('⚠️ [DashboardLayout] No hay token, redirigiendo a login')
          // Pequeño delay antes de redirigir para evitar loops
          await new Promise(resolve => setTimeout(resolve, 100))
          router.replace('/login')
          return
        }

        // Verificar sesión con authService
        const { data } = await customAuth.getSession()
        
        if (!data.session || !data.session.access_token) {
          console.warn('⚠️ [DashboardLayout] Sesión inválida, redirigiendo a login')
          router.replace('/login')
          return
        }

        console.log('✅ [DashboardLayout] Usuario autenticado:', {
          userId: data.session.user.id,
          email: data.session.user.email,
          tenantId: data.session.user.tenant_id
        })
        setIsCheckingAuth(false)
      } catch (error) {
        console.error('❌ [DashboardLayout] Error verificando autenticación:', error)
        router.replace('/login')
      }
    }

    checkAuth()
  }, [router])

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

  // Mostrar loading mientras se verifica autenticación
  if (isCheckingAuth) {
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
          <style jsx>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    )
  }

  const getMarginLeft = () => {
    if (isMobile) return '0'
    if (isTablet) return '240px'
    return '280px'
  }

  return (
    <EmpresaConfigProvider>
      <div style={{ 
        display: 'flex', 
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden' // Prevenir scroll horizontal en el contenedor principal
      }}>
        <Sidebar />
        <main style={{ 
          flex: 1, 
          marginLeft: getMarginLeft(),
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
          minHeight: '100vh',
          transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          padding: isMobile ? '1rem' : isTablet ? '1.5rem' : '2rem',
          overflow: 'auto',
          // Corregir el cálculo del ancho para evitar overflow
          maxWidth: isMobile ? '100vw' : `calc(100vw - ${getMarginLeft()})`,
          position: 'relative'
        }}>
          {children}
        </main>
      </div>
    </EmpresaConfigProvider>
  )
}