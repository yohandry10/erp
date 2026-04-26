'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { customAuth } from '@/lib/auth-service'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      console.log('🏠 [HomePage] Verificando autenticación...')
      
      try {
        // Usar customAuth en lugar de Supabase
        const { data } = await customAuth.getSession()

        if (data.session && data.session.access_token) {
          console.log('✅ [HomePage] Usuario autenticado, redirigiendo a dashboard')
          router.push('/dashboard')
        } else {
          console.log('ℹ️ [HomePage] No hay sesión, redirigiendo a login')
          router.push('/login')
        }
      } catch (error) {
        console.error('❌ [HomePage] Error verificando autenticación:', error)
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Cargando...</p>
      </div>
    </div>
  )
}