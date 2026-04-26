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
  const [loading, setLoading] = useState(!initialSession)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      console.log('🔐 [SessionProvider] Inicializando...')
      
      // Cargar sesión inicial
      customAuth.getSession().then(({ data }) => {
        console.log('🔐 [SessionProvider] Sesión inicial:', data.session ? 'Autenticado' : 'No autenticado')
        setSession(data.session)
        setLoading(false)
      })
      
      // Escuchar cambios en la autenticación
      const { data: { subscription } } = customAuth.onAuthStateChange((event, session) => {
        console.log('🔐 [SessionProvider] Cambio de autenticación:', event, session ? 'Autenticado' : 'No autenticado')
        setSession(session)
        setLoading(false)
        setError(null)
      })

      return () => subscription.unsubscribe()
    } catch (err) {
      console.error('❌ [SessionProvider] Error initializing auth:', err)
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