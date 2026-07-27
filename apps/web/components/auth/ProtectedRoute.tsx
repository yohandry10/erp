'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { customAuth } from '@/lib/auth-service'
import { useAuth } from '@/contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { loading: authLoading } = useAuth()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      try {
        if (authLoading) return

        setIsChecking(true)

        const { data } = await customAuth.getSession()
        if (!data?.session?.user) {
          if (isMounted && pathname !== '/login') {
            router.replace('/login')
          }
          return
        }

        if (!data.session || !data.session.user) {
          if (isMounted && pathname !== '/login') {
            router.replace('/login')
          }
          return
        }

        if (isMounted) {
          setIsAuthenticated(true)
        }
      } catch (error) {
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
  }, [router, pathname, authLoading])

  if (isChecking) {
    return <>{children}</>
  }

  // Si no está autenticado, no renderizar nada (ya se redirigió)
  if (!isAuthenticated) {
    return null
  }

  // Usuario autenticado, renderizar children
  return <>{children}</>
}
