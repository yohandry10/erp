'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { customAuth } from '@/lib/auth-service'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await customAuth.getSession()

        if (data.session?.user) {
          router.push('/dashboard')
        } else {
          router.push('/login')
        }
      } catch (error) {
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-foreground/80">Cargando...</p>
      </div>
    </div>
  )
}
