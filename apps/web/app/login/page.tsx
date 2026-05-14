'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Building2, Loader2, Globe, Lock, Mail } from 'lucide-react'
import { usePaises } from '@/hooks/use-paises'

type Pais = {
  id: string | number
  nombre: string
  codigo_fiscal?: string
  codigo_iso?: string
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [countryLoadExpired, setCountryLoadExpired] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const { signIn, session, loading: authLoading } = useAuth()

  const {
    paises,
    loading: paisesLoading,
    getUserConfiguration,
    updateUserConfiguration,
    // Remover estas líneas que no existen:
    // saveUserCountryPreference,
    // createUserConfiguration,
  } = usePaises()

  useEffect(() => {
    if (!paisesLoading) {
      setCountryLoadExpired(false)
      return
    }

    const timeoutId = window.setTimeout(() => setCountryLoadExpired(true), 10000)
    return () => window.clearTimeout(timeoutId)
  }, [paisesLoading])

  useEffect(() => {
    if (!authLoading && session) {
      router.replace('/dashboard')
    }
  }, [authLoading, session, router])

  useEffect(() => {
    const list = (paises as Pais[]) || []
    if (list.length > 0 && !selectedCountry) {
      if (typeof window !== 'undefined') {
        const storedCountry = window.localStorage.getItem('selectedCountry')
        if (storedCountry && list.some((p) => String(p.id) === storedCountry)) {
          setSelectedCountry(storedCountry)
        }
      }
    }
  }, [paises, selectedCountry])

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()

    setLoading(true)

    try {
      // ✅ SOLUCIÓN: Usar signIn del contexto (maneja la sesión automáticamente)
      await signIn(email, password)

      console.log('✅ [LoginPage] Login exitoso')

      // Persistir país seleccionado en localStorage
      if (typeof window !== 'undefined') {
        if (selectedCountry) {
          localStorage.setItem('selectedCountry', selectedCountry)
        } else {
          localStorage.removeItem('selectedCountry')
        }
      }

      const list = (paises as Pais[]) || []
      const selectedPais = list.find((p) => String(p.id) === selectedCountry)

      toast({
        title: 'Bienvenido',
        description: selectedPais
          ? `Has iniciado sesión correctamente - ${selectedPais.nombre}`
          : 'Has iniciado sesión correctamente',
      })

      console.log('🚀 [LoginPage] Redirigiendo a dashboard...')
      router.push('/dashboard')
    } catch (error) {
      console.error('🚨 Auth Error:', error)
      toast({
        variant: 'destructive',
        title: 'Error de autenticación',
        description: error instanceof Error ? error.message : 'Ocurrió un error inesperado',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    setLoading(true)

    // Simulación de login demo
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        if (selectedCountry) {
          localStorage.setItem('selectedCountry', selectedCountry)
        } else {
          localStorage.removeItem('selectedCountry')
        }
      }
      const list = (paises as Pais[]) || []
      const selectedPais = list.find((p) => String(p.id) === selectedCountry)
      toast({
        title: 'Modo Demo',
        description: selectedPais
          ? `Accediendo al sistema en modo demostración - ${selectedPais.nombre}`
          : 'Accediendo al sistema en modo demostración',
      })
      router.push('/dashboard')
      setLoading(false)
    }, 1000)
  }

  const paisesList = (paises as Pais[]) || []
  const showCountryLoading = paisesLoading && !countryLoadExpired

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="login-gradient-1"></div>
        <div className="login-gradient-2"></div>
        <div className="login-gradient-3"></div>
      </div>

      <div className="login-card-wrapper">
        <Card className="login-card">
          <CardHeader className="login-header">
            <div className="login-logo">
              <div className="logo-icon">
                <Building2 size={32} />
              </div>
              <div className="logo-text">
                <CardTitle className="login-title">ERP Suite</CardTitle>
                <CardDescription className="login-subtitle">
                  Sistema Empresarial Integrado
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="login-content">
            <form onSubmit={handleLogin} className="login-form">
              {/* Selector de País */}
              <div className="form-group">
                <Label htmlFor="country" className="form-label">
                  <Globe size={16} />
                  País (preferencia de interfaz)
                </Label>
                <Select
                  value={selectedCountry}
                  onValueChange={(v) => setSelectedCountry(v)}
                  disabled={showCountryLoading}
                >
                  <SelectTrigger id="country" className="select-trigger">
                    <SelectValue placeholder={showCountryLoading ? 'Cargando países...' : 'Selecciona un país'} />
                  </SelectTrigger>
                  <SelectContent className="select-content">
                    {paisesList.map((pais) => (
                      <SelectItem key={String(pais.id)} value={String(pais.id)} className="select-item">
                        <div className="country-option">
                          <span className="country-name">{pais.nombre}</span>
                          {pais.codigo_fiscal && (
                            <span className="country-code">({pais.codigo_fiscal})</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="form-group">
                <Label htmlFor="email" className="form-label">
                  <Mail size={16} />
                  Correo Electrónico
                </Label>
                <Input
                  id="email"
                  type="text"
                  inputMode="email"
                  placeholder="tu@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <Label htmlFor="password" className="form-label">
                  <Lock size={16} />
                  Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="form-input"
                />
              </div>

              <button type="submit" style={{ display: 'none' }} aria-hidden="true" />
            </form>
          </CardContent>

          <CardFooter className="login-footer">
            <Button
              type="submit"
              onClick={handleLogin}
              disabled={loading}
              className="login-button primary"
            >
              {loading && <Loader2 className="button-spinner" />}
              Iniciar Sesión
            </Button>

            <div className="divider">
              <span className="divider-text">O continúa con</span>
            </div>

            <Button
              variant="outline"
              onClick={handleDemoLogin}
              disabled={loading}
              className="login-button demo"
            >
              {loading && <Loader2 className="button-spinner" />}
              Acceso Demo
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
