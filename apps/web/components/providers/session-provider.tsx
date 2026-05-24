'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { customAuth, Session } from '@/lib/auth-service'

type SessionContextType = {
  session: Session | null
  loading: boolean
  error?: string | null
}

const SessionContext = createContext<SessionContextType>({
  session: null,
  loading: true,
  error: null,
})

export function SessionProvider({
  children,
  session: initialSession,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  const [session, setSession] = useState<Session | null>(initialSession)
  // AuthProvider es la fuente de verdad para el estado de sesión; este provider
  // solo refleja cambios. Iniciamos en false para que componentes que dependan de
  // useSession() no se queden en estado de carga indefinido en rutas públicas.
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      // AuthProvider (mismo singleton authService) ya dispara getSession() en el árbol.
      // Aquí solo nos suscribimos a los cambios para evitar una segunda llamada a
      // /auth/profile que produce un 401 duplicado en consola cuando no hay cookie.
      const { data: { subscription } } = customAuth.onAuthStateChange((event, session) => {
        setSession(session)
        setLoading(false)
        setError(null)
      })

      return () => subscription.unsubscribe()
    } catch (err) {
      setError('Error de conexión con el sistema de autenticación')
      setLoading(false)
    }
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading, error }}>
      {children}
    </SessionContext.Provider>
  )
}

export const useSession = () => {
  const context = useContext(SessionContext)
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}
