'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Session } from '@supabase/supabase-js'

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
      const supabase = createClientComponentClient()
      
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        setSession(session)
        setLoading(false)
        setError(null)
      })

      return () => subscription.unsubscribe()
    } catch (err) {
      console.error('Error initializing auth:', err)
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