'use client'

import Sidebar from '../../components/layout/sidebar'
import { useState, useEffect } from 'react'
import { EmpresaConfigProvider } from '@/hooks/use-empresa-config'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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