'use client'

import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, RefreshCw, Wallet } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Solicitud {
  id: string
  tenant_id: string
  razon_social: string
  ruc: string
  email: string
  telefono: string | null
  plan_id: string
  periodo: string
  monto: number
  conservar_datos: boolean
  created_at: string
}

/**
 * Clientes que pidieron pasar de demo a cuenta real y ya transfirieron. Aquí se
 * confirma el pago: al aprobar, la cuenta se activa y el cliente entra con las
 * credenciales que él mismo eligió en el formulario.
 */
export default function SolicitudesActivacion() {
  // throwOnError: sin esto useApi resuelve tambien cuando el servidor rechaza,
  // y el panel daba por aprobada o rechazada una solicitud que no se habia
  // tocado. Un fallo tiene que verse.
  const { get, post } = useApi({ showErrorToast: false, throwOnError: true })
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // Activar cobra dinero de verdad y rechazar deja al cliente esperando: las
  // dos se confirman dentro de la página, no con un diálogo del navegador.
  const [confirmando, setConfirmando] = useState<
    { id: string; accion: 'aprobar' | 'rechazar' } | null
  >(null)
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const respuesta = await get('/demo/conversiones-pendientes')
      const filas = respuesta?.data ?? respuesta
      // Si no llega una lista, algo fallo: mostrarlo. Vaciar la tabla en
      // silencio hace creer que no hay nadie esperando su cuenta.
      if (!Array.isArray(filas)) {
        throw new Error(respuesta?.message || 'El servidor no devolvió la lista de solicitudes')
      }
      setSolicitudes(filas)
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar las solicitudes')
    } finally {
      setCargando(false)
    }
  }, [get])

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aprobar = async (solicitud: Solicitud) => {
    setConfirmando(null)
    setProcesando(solicitud.id)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await post(`/demo/conversiones-pendientes/${solicitud.id}/aprobar`, {})
      if (respuesta?.success === false) {
        throw new Error(respuesta?.message || 'No se pudo activar la cuenta')
      }
      setAviso(respuesta?.message || `Cuenta de ${solicitud.razon_social} activada.`)
      await cargar()
    } catch (e: any) {
      setError(e?.message || 'No se pudo activar la cuenta')
    } finally {
      setProcesando(null)
    }
  }

  const rechazar = async (solicitud: Solicitud, motivoDado: string) => {
    const motivo = motivoDado.trim()
    if (!motivo) return

    setConfirmando(null)
    setProcesando(solicitud.id)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await post(`/demo/conversiones-pendientes/${solicitud.id}/rechazar`, {
        motivo,
      })
      if (respuesta?.success === false) {
        throw new Error(respuesta?.message || 'No se pudo rechazar la solicitud')
      }
      setAviso(respuesta?.message || `Solicitud de ${solicitud.razon_social} rechazada.`)
      await cargar()
    } catch (e: any) {
      setError(e?.message || 'No se pudo rechazar la solicitud')
    } finally {
      setProcesando(null)
    }
  }

  return (
    <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-card group-data-[erp-theme=light]/dashboard:text-foreground">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-white group-data-[erp-theme=light]/dashboard:text-foreground">
          <Wallet className="h-5 w-5 text-primary" />
          Solicitudes de activación
          {solicitudes.length > 0 && (
            <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-300">
              {solicitudes.length}
            </span>
          )}
        </CardTitle>
        <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando}>
          <RefreshCw className={`mr-2 h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            {error}
          </div>
        )}

        {aviso && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <BadgeCheck className="h-4 w-4" />
            {aviso}
          </div>
        )}

        {cargando && solicitudes.length === 0 && (
          <p className="text-sm text-muted-foreground">Cargando solicitudes...</p>
        )}

        {!cargando && solicitudes.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            No hay pagos por confirmar. Cuando un cliente pida su cuenta real, aparecerá aquí.
          </p>
        )}

        {solicitudes.map((solicitud) => (
          <div
            key={solicitud.id}
            className="rounded-2xl border border-cyan-400/15 bg-card/50 p-4 group-data-[erp-theme=light]/dashboard:border-border group-data-[erp-theme=light]/dashboard:bg-muted/30"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-white group-data-[erp-theme=light]/dashboard:text-foreground">
                  {solicitud.razon_social}
                </p>
                <p className="text-sm text-muted-foreground">
                  RUC {solicitud.ruc} · {solicitud.email}
                  {solicitud.telefono ? ` · ${solicitud.telefono}` : ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Plan {solicitud.plan_id} {solicitud.periodo} ·{' '}
                  {solicitud.conservar_datos
                    ? 'conserva sus datos de prueba'
                    : 'empieza de cero'}{' '}
                  · solicitado el{' '}
                  {new Date(solicitud.created_at).toLocaleString('es-PE', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              <p className="text-xl font-extrabold text-primary">
                S/ {Number(solicitud.monto).toFixed(2)}
              </p>
            </div>

            {confirmando?.id === solicitud.id && confirmando.accion === 'aprobar' ? (
              <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <p className="text-sm font-semibold text-foreground">
                  ¿Recibiste S/ {Number(solicitud.monto).toFixed(2)} de {solicitud.razon_social}?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Al confirmar, la cuenta queda activa y el cliente entra con {solicitud.email}.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button size="sm" onClick={() => void aprobar(solicitud)}>
                    Sí, recibí el pago
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmando(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : confirmando?.id === solicitud.id && confirmando.accion === 'rechazar' ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <label
                  htmlFor={`motivo-${solicitud.id}`}
                  className="text-sm font-semibold text-foreground"
                >
                  ¿Por qué se rechaza? El cliente necesita saber qué corregir.
                </label>
                <textarea
                  id={`motivo-${solicitud.id}`}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Ej: el comprobante no coincide con el monto"
                  className="mt-2 w-full rounded-lg border border-border bg-card p-3 text-sm text-foreground outline-none focus:border-primary"
                />
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!motivo.trim()}
                    onClick={() => void rechazar(solicitud, motivo)}
                  >
                    Rechazar solicitud
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmando(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  size="sm"
                  onClick={() => setConfirmando({ id: solicitud.id, accion: 'aprobar' })}
                  disabled={procesando === solicitud.id}
                >
                  {procesando === solicitud.id ? 'Activando...' : 'Confirmé el pago, activar'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setMotivo('')
                    setConfirmando({ id: solicitud.id, accion: 'rechazar' })
                  }}
                  disabled={procesando === solicitud.id}
                >
                  Rechazar
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
