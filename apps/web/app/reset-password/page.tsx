'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail } from 'lucide-react'
import { buildApiUrl } from '@/lib/api-url'

// Mismo contrato que ResetPasswordDto del API: si la web acepta algo que el API
// rechaza, el usuario pierde el enlace en un 400 que no entiende.
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/
const PASSWORD_HELP =
  'Mínimo 8 caracteres, con mayúscula, minúscula, número y uno de estos símbolos: @ $ ! % * ? &. Sin tildes ni espacios.'

type ApiResult = { ok: true } | { ok: false; status: number; message: string }

async function postAuth(route: string, body: Record<string, string>): Promise<ApiResult> {
  try {
    const response = await fetch(buildApiUrl(`/api/auth/${route}/`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (response.ok) return { ok: true }
    const payload = await response.json().catch(() => ({}))
    const message = Array.isArray(payload?.message) ? payload.message[0] : payload?.message
    return { ok: false, status: response.status, message: typeof message === 'string' ? message : '' }
  } catch {
    return { ok: false, status: 0, message: '' }
  }
}

function requestErrorMessage(result: Exclude<ApiResult, { ok: true }>) {
  if (result.status === 429) return 'Demasiadas solicitudes seguidas. Espera un minuto y vuelve a intentarlo.'
  if (result.status === 503 && result.message) return result.message
  if (result.status === 400) return 'Revisa el correo: no tiene un formato válido.'
  if (result.status === 0) return 'No hay conexión con el servidor. Revisa tu red y vuelve a intentarlo.'
  return 'No pudimos procesar la solicitud. Vuelve a intentarlo en unos minutos.'
}

function confirmErrorMessage(result: Exclude<ApiResult, { ok: true }>) {
  if (result.status === 401) return 'El enlace no es válido o ya venció. Solicita uno nuevo para continuar.'
  if (result.status === 400) return result.message || PASSWORD_HELP
  if (result.status === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.'
  if (result.status === 0) return 'No hay conexión con el servidor. Revisa tu red y vuelve a intentarlo.'
  return 'No pudimos cambiar la contraseña. Vuelve a intentarlo en unos minutos.'
}

function AuthFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="theme-light-scope relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 px-4 py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <Card className="relative overflow-hidden border-border/80 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-blue-700 before:via-blue-500 before:to-cyan-400">
          <CardHeader className="px-6 pb-4 pt-10 sm:px-10">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-900/25">
              <KeyRound className="h-6 w-6" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">{title}</CardTitle>
            <CardDescription className="text-base text-foreground/75">{description}</CardDescription>
          </CardHeader>
          {children}
        </Card>
      </div>
    </div>
  )
}

function BackToLogin() {
  return (
    <Button variant="ghost" asChild className="h-11 w-full text-foreground/80">
      <Link href="/login/">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a iniciar sesión
      </Link>
    </Button>
  )
}

function FormError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  )
}

function RequestLinkForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    const result = await postAuth('password-reset/request', { email: email.trim() })
    setLoading(false)
    if (result.ok) setSent(true)
    else setError(requestErrorMessage(result))
  }

  if (sent) {
    return (
      <AuthFrame
        title="Revisa tu correo"
        description="Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva."
      >
        <CardContent className="space-y-3 px-6 sm:px-10">
          <p className="flex items-start gap-2 text-sm text-foreground/80">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            El enlace vence en 24 horas y sirve una sola vez. Si no lo ves, revisa la carpeta de spam.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 px-6 pb-10 sm:px-10">
          <Button variant="outline" className="h-11 w-full" onClick={() => setSent(false)}>
            Enviar a otro correo
          </Button>
          <BackToLogin />
        </CardFooter>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame
      title="Recupera tu contraseña"
      description="Escribe el correo con el que inicias sesión y te enviaremos un enlace para crear una nueva."
    >
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 px-6 sm:px-10">
          <div className="space-y-2">
            <Label htmlFor="reset-email" className="flex items-center gap-2 font-semibold text-foreground/85">
              <Mail className="h-4 w-4" aria-hidden="true" />
              Correo electrónico
            </Label>
            <Input
              id="reset-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="tu@empresa.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'reset-request-error' : undefined}
              className="h-12 border-border bg-card px-4 text-base text-foreground"
            />
          </div>
          {error && <FormError id="reset-request-error" message={error} />}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 px-6 pb-10 sm:px-10">
          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-500 text-base text-white shadow-lg shadow-blue-900/20 hover:from-blue-900 hover:via-blue-700 hover:to-cyan-600"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Enviar enlace
          </Button>
          <BackToLogin />
        </CardFooter>
      </form>
    </AuthFrame>
  )
}

function PasswordField({
  id, label, value, onChange, disabled, describedBy,
}: {
  id: string; label: string; value: string; onChange: (value: string) => void; disabled: boolean; describedBy?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2 font-semibold text-foreground/85">
        <Lock className="h-4 w-4" aria-hidden="true" />
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          disabled={disabled}
          aria-describedby={describedBy}
          className="h-12 border-border bg-card pl-4 pr-12 text-base text-foreground"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8 || !PASSWORD_RULE.test(password)) return setError(PASSWORD_HELP)
    if (password !== confirmation) return setError('Las dos contraseñas no coinciden.')
    setLoading(true)
    const result = await postAuth('password-reset/confirm', { email, token, newPassword: password })
    setLoading(false)
    if (result.ok) return setDone(true)
    setExpired(result.status === 401)
    setError(confirmErrorMessage(result))
  }

  if (done) {
    return (
      <AuthFrame
        title="Contraseña actualizada"
        description="Ya puedes iniciar sesión con tu contraseña nueva. Por seguridad cerramos las sesiones que tenías abiertas."
      >
        <CardFooter className="px-6 pb-10 pt-2 sm:px-10">
          <Button asChild className="h-12 w-full bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-500 text-base text-white">
            <Link href="/login/">Iniciar sesión</Link>
          </Button>
        </CardFooter>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title="Crea una contraseña nueva" description={`Para la cuenta ${email}.`}>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 px-6 sm:px-10">
          <PasswordField
            id="reset-new-password"
            label="Contraseña nueva"
            value={password}
            onChange={setPassword}
            disabled={loading}
            describedBy="reset-password-help"
          />
          <p id="reset-password-help" className="text-sm text-foreground/70">{PASSWORD_HELP}</p>
          <PasswordField
            id="reset-confirm-password"
            label="Repite la contraseña"
            value={confirmation}
            onChange={setConfirmation}
            disabled={loading}
          />
          {error && <FormError id="reset-confirm-error" message={error} />}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 px-6 pb-10 sm:px-10">
          {expired ? (
            <Button asChild className="h-12 w-full">
              <Link href="/reset-password/">Solicitar un enlace nuevo</Link>
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full bg-gradient-to-r from-blue-800 via-blue-600 to-cyan-500 text-base text-white shadow-lg shadow-blue-900/20 hover:from-blue-900 hover:via-blue-700 hover:to-cyan-600"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Guardar contraseña
            </Button>
          )}
          <BackToLogin />
        </CardFooter>
      </form>
    </AuthFrame>
  )
}

function ResetPasswordFlow() {
  const params = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const email = params.get('email')?.trim() ?? ''
  // El enlace del correo trae token y email; sin ambos se pide un enlace nuevo.
  if (/^[0-9a-f]{64}$/i.test(token) && email) return <NewPasswordForm token={token} email={email} />
  return <RequestLinkForm />
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordFlow />
    </Suspense>
  )
}
