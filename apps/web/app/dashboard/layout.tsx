'use client'

import Sidebar from '../../components/layout/sidebar'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { EmpresaConfigProvider } from '@/hooks/use-empresa-config'
import { useAuth } from '@/contexts/AuthContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { session, loading: authLoading } = useAuth()
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)

  // ✅ SOLUCIÓN: Usar AuthContext en lugar de verificación manual
  useEffect(() => {
    // Esperar a que AuthContext termine de cargar
    if (authLoading) {
      console.log('⏳ [DashboardLayout] Esperando AuthContext...')
      return
    }

    // Si no hay sesión, redirigir a login
    if (!session) {
      console.warn('⚠️ [DashboardLayout] No hay sesión, redirigiendo a login')
      router.replace('/login')
      return
    }

    console.log('✅ [DashboardLayout] Usuario autenticado:', {
      userId: session.user.id,
      email: session.user.email,
      tenantId: session.user.tenant_id
    })
  }, [session, authLoading, router])

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

  // ✅ Mostrar loading mientras AuthContext carga o no hay sesión
  if (authLoading || !session) {
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
            {authLoading ? 'Verificando autenticación...' : 'Redirigiendo...'}
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