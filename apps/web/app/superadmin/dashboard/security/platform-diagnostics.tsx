'use client'

import { useState, type FormEvent } from 'react'
import { useApi } from '@/hooks/use-api'

type Resultado = { tipo: 'ok' | 'error'; texto: string } | null

const botonPrimario = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50'
const botonSecundario = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50'

function Mensaje({ resultado, id }: { resultado: Resultado; id: string }) {
  return (
    <p id={id} role="status" aria-live="polite" className={`min-h-5 text-sm ${resultado?.tipo === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
      {resultado?.texto ?? ''}
    </p>
  )
}

/** Confirma, en el despliegue en curso, que el correo saliente y Sentry llegan a su destino. */
export function PlatformDiagnostics() {
  // Sin reintentos: un reintento tras un timeout podría enviar dos correos.
  const { post } = useApi({ retries: 0, timeoutMs: 45000, throwOnError: true, showErrorToast: false })
  const [destinatario, setDestinatario] = useState('')
  const [enviandoCorreo, setEnviandoCorreo] = useState(false)
  const [enviandoSentry, setEnviandoSentry] = useState(false)
  const [correo, setCorreo] = useState<Resultado>(null)
  const [sentry, setSentry] = useState<Resultado>(null)

  const probarCorreo = async (event: FormEvent) => {
    event.preventDefault()
    setEnviandoCorreo(true)
    setCorreo(null)
    try {
      const respuesta = await post('/security/diagnostico/correo', { destinatario })
      const datos = respuesta?.data ?? respuesta
      setCorreo({ tipo: 'ok', texto: `Enviado a ${datos.destinatario} desde ${datos.remitente}. Confirma la llegada en la bandeja de entrada.` })
    } catch (error) {
      setCorreo({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudo enviar el correo de prueba' })
    } finally {
      setEnviandoCorreo(false)
    }
  }

  const probarSentry = async () => {
    setEnviandoSentry(true)
    setSentry(null)
    try {
      const respuesta = await post('/security/diagnostico/sentry')
      const datos = respuesta?.data ?? respuesta
      setSentry({ tipo: 'ok', texto: `Sentry recibió el evento ${datos.event_id} (${datos.tipo}, entorno ${datos.entorno}).` })
    } catch (error) {
      setSentry({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudo enviar el evento a Sentry' })
    } finally {
      setEnviandoSentry(false)
    }
  }

  return (
    <section aria-labelledby="diagnostico-titulo" className="mt-8 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-md">
      <h2 id="diagnostico-titulo" className="m-0 text-lg font-bold text-foreground">Diagnóstico de plataforma</h2>
      <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
        Comprueba en este despliegue que el correo saliente y la captura de errores llegan a su destino.
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <form onSubmit={probarCorreo} className="flex flex-col gap-3" aria-describedby="diagnostico-correo-ayuda">
          <label htmlFor="diagnostico-correo" className="text-sm font-semibold text-foreground">Correo de prueba</label>
          <input
            id="diagnostico-correo"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <p id="diagnostico-correo-ayuda" className="text-xs text-muted-foreground">
            Sólo direcciones del dominio del remitente configurado.
          </p>
          <div>
            <button type="submit" disabled={enviandoCorreo || !destinatario} className={botonPrimario}>
              {enviandoCorreo ? 'Enviando…' : 'Enviar correo de prueba'}
            </button>
          </div>
          <Mensaje resultado={correo} id="diagnostico-correo-resultado" />
        </form>

        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-sm font-semibold text-foreground">Captura de errores</h3>
          <p className="text-xs text-muted-foreground">
            Envía un evento <code>PlatformDiagnosticError</code> sin datos de negocio ni de usuarios.
          </p>
          <div>
            <button type="button" onClick={probarSentry} disabled={enviandoSentry} className={botonSecundario}>
              {enviandoSentry ? 'Enviando…' : 'Enviar evento a Sentry'}
            </button>
          </div>
          <Mensaje resultado={sentry} id="diagnostico-sentry-resultado" />
        </div>
      </div>
    </section>
  )
}
