'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { customAuth, Session, User } from '@/lib/auth-service'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('🔄 [AuthContext] Inicializando...')
    loadSession()
  }, [])

  const loadSession = async () => {
    try {
      console.log('🔄 [AuthContext] Cargando sesión...')
      const { data, error } = await customAuth.getSession()
      
      if (error) {
        console.error('❌ [AuthContext] Error cargando sesión:', error)
        setSession(null)
        setUser(null)
      } else if (data?.session) {
        console.log('✅ [AuthContext] Sesión cargada:', {
          userId: data.session.user.id,
          email: data.session.user.email,
          hasToken: !!data.session.access_token
        })
        setSession(data.session)
        setUser(data.session.user)
      } else {
        console.log('ℹ️ [AuthContext] No hay sesión activa')
        setSession(null)
        setUser(null)
      }
    } catch (error) {
      console.error('❌ [AuthContext] Error inesperado:', error)
      setSession(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    console.log('🔐 [AuthContext] Iniciando login...')
    const { data, error } = await customAuth.signInWithPassword({ email, password })
    
    if (error) {
      console.error('❌ [AuthContext] Error en login:', error)
      throw error
    }
    
    if (data?.session) {
      console.log('✅ [AuthContext] Login exitoso')
      setSession(data.session)
      setUser(data.user)
    } else {
      throw new Error('No se recibió sesión del servidor')
    }
  }

  const signOut = async () => {
    console.log('🚪 [AuthContext] Cerrando sesión...')
    await customAuth.signOut()
    setSession(null)
    setUser(null)
    console.log('✅ [AuthContext] Sesión cerrada')
  }

  const refreshSession = async () => {
    console.log('🔄 [AuthContext] Refrescando sesión...')
    await loadSession()
  }

  const value = {
    session,
    user,
    loading,
    signIn,
    signOut,
    refreshSession
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
