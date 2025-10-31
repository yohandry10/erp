'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { customAuth } from '@/lib/auth-service'
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
  const router = useRouter()
  const { toast } = useToast()

  const {
    paises,
    loading: paisesLoading,
    getUserConfiguration,
    updateUserConfiguration,
    // Remover estas líneas que no existen:
    // saveUserCountryPreference,
    // createUserConfiguration,
  } = usePaises()

  // Establecer país por defecto (Perú) cuando carguen los países
  useEffect(() => {
    const list = (paises as Pais[]) || []
    if (list.length > 0 && !selectedCountry) {
      const peru = list.find((p) => p.codigo_iso === 'PE')
      if (peru) {
        setSelectedCountry(String(peru.id))
      }
    }
  }, [paises, selectedCountry])

  const handleLogin = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault()

    if (!selectedCountry) {
      toast({
        variant: 'destructive',
        title: 'País requerido',
        description: 'Por favor selecciona un país antes de continuar',
      })
      return
    }

    setLoading(true)

    try {
      // ✅ USAR CUSTOM AUTH SERVICE
      const { data, error } = await customAuth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error('🚨 Auth Error:', error)
        toast({
          variant: 'destructive',
          title: 'Error de autenticación',
          description: error.message,
        })
        return
      }

      if (data?.user) {
        console.log('✅ [LoginPage] Login exitoso, verificando token guardado...')

        // ✅ CRÍTICO: Esperar a que el token esté realmente guardado en localStorage
        // Esto previene race conditions donde el dashboard se monta antes de que el token esté disponible
        await new Promise(resolve => setTimeout(resolve, 100))

        // Verificar que el token se guardó correctamente
        const savedToken = localStorage.getItem('access_token')
        if (!savedToken) {
          console.error('❌ [LoginPage] CRÍTICO: Token no se guardó en localStorage')
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Error guardando sesión. Por favor intenta nuevamente.',
          })
          return
        }

        console.log('✅ [LoginPage] Token verificado en localStorage')

        // Guardar/crear preferencia de país del usuario
        const userId = data.user.id

        // Convertir selectedCountry a número
        const paisPreferidoId = parseInt(selectedCountry, 10)

        // TODO: Arreglar updateUserConfiguration para usar el token del localStorage
        // try {
        //   await updateUserConfiguration({
        //     pais_preferido_id: paisPreferidoId,
        //     idioma: 'es',
        //     zona_horaria: 'America/Lima'
        //   })
        // } catch (configError) {
        //   console.warn('Error guardando configuración de usuario:', configError)
        // }

        // Persistir en localStorage para uso inmediato
        if (typeof window !== 'undefined') {
          localStorage.setItem('selectedCountry', selectedCountry)
        }

        const list = (paises as Pais[]) || []
        const selectedPais = list.find((p) => String(p.id) === selectedCountry)

        toast({
          title: 'Bienvenido',
          description: `Has iniciado sesión correctamente - ${selectedPais?.nombre ?? '—'}`,
        })

        console.log('🚀 [LoginPage] Redirigiendo a dashboard...')
        router.push('/dashboard')
      }
    } catch (_err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Ocurrió un error inesperado',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    if (!selectedCountry) {
      toast({
        variant: 'destructive',
        title: 'País requerido',
        description: 'Por favor selecciona un país antes de continuar',
      })
      return
    }

    setLoading(true)

    // Simulación de login demo
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedCountry', selectedCountry)
      }
      const list = (paises as Pais[]) || []
      const selectedPais = list.find((p) => String(p.id) === selectedCountry)
      toast({
        title: 'Modo Demo',
        description: `Accediendo al sistema en modo demostración - ${selectedPais?.nombre ?? '—'}`,
      })
      router.push('/dashboard')
      setLoading(false)
    }, 1000)
  }

  const paisesList = (paises as Pais[]) || []

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
                  País / Jurisdicción Fiscal
                </Label>
                <Select
                  value={selectedCountry}
                  onValueChange={(v) => setSelectedCountry(v)}
                  disabled={paisesLoading}
                >
                  <SelectTrigger id="country" className="select-trigger">
                    <SelectValue placeholder={paisesLoading ? 'Cargando países...' : 'Selecciona un país'} />
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
                  type="email"
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
            </form>
          </CardContent>

          <CardFooter className="login-footer">
            <Button
              onClick={handleLogin}
              disabled={loading || paisesLoading || !selectedCountry}
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
              disabled={loading || paisesLoading || !selectedCountry}
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