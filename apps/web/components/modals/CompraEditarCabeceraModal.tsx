'use client'

import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TipoDocumento = 'cotizacion' | 'orden'

interface CompraEditarCabeceraModalProps {
  tipo: TipoDocumento
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  documento: any
}

/**
 * Edición de la cabecera de una cotización u orden de compra en BORRADOR.
 *
 * Los dos writers atómicos (`actualizar_cotizacion_compra_tx` y
 * `actualizar_orden_compra_tx`) aceptan payload parcial, sólo tocan el detalle
 * si viene la clave `detalles`, y rechazan cualquier documento que no esté en
 * BORRADOR. Este modal cubre únicamente la cabecera: cambiar líneas exige el
 * selector de productos del formulario de alta, que es otra pantalla.
 *
 * Un modal para los dos porque el contrato es el mismo salvo dos campos;
 * separarlo duplicaría el formulario entero para eso.
 */
export default function CompraEditarCabeceraModal({
  tipo,
  isOpen,
  onClose,
  onSuccess,
  documento,
}: CompraEditarCabeceraModalProps) {
  // El error del writer (período duplicado, documento fuera de borrador) es lo
  // que el usuario necesita leer: se muestra dentro del modal en vez de en un
  // toast que aparece detrás de él.
  const { put } = useApi({ throwOnError: true, showErrorToast: false })
  const esOrden = tipo === 'orden'
  const [fecha, setFecha] = useState('')
  const [validezDias, setValidezDias] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [condicionesPago, setCondicionesPago] = useState('')
  const [diasCredito, setDiasCredito] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setError('')
    setObservaciones(String(documento?.observaciones ?? ''))
    if (esOrden) {
      setFecha(String(documento?.fecha_orden ?? '').slice(0, 10))
      setFechaEntrega(String(documento?.fecha_entrega_esperada ?? '').slice(0, 10))
      setCondicionesPago(String(documento?.condiciones_pago ?? 'CONTADO'))
      setDiasCredito(String(documento?.dias_credito ?? 0))
    } else {
      setFecha(String(documento?.fecha_cotizacion ?? '').slice(0, 10))
      setValidezDias(String(documento?.validez_dias ?? 30))
    }
  }, [isOpen, documento, esOrden])

  const handleGuardar = async () => {
    if (!documento?.id) return

    const cambios: Record<string, unknown> = {}
    const original = (valor: unknown) => String(valor ?? '')

    if (observaciones.trim() !== original(documento?.observaciones).trim()) {
      cambios.observaciones = observaciones.trim()
    }

    if (esOrden) {
      if (fecha && fecha !== original(documento?.fecha_orden).slice(0, 10)) {
        cambios.fecha_orden = fecha
      }
      if (
        fechaEntrega &&
        fechaEntrega !== original(documento?.fecha_entrega_esperada).slice(0, 10)
      ) {
        cambios.fecha_entrega_esperada = fechaEntrega
      }
      if (condicionesPago.trim() !== original(documento?.condiciones_pago ?? 'CONTADO')) {
        cambios.condiciones_pago = condicionesPago.trim()
      }
      const dias = Number(diasCredito)
      if (!Number.isInteger(dias) || dias < 0 || dias > 3650) {
        setError('Los días de crédito deben ser un entero entre 0 y 3650.')
        return
      }
      if (dias !== Number(documento?.dias_credito ?? 0)) cambios.dias_credito = dias
      if (fecha && fechaEntrega && fechaEntrega < fecha) {
        setError('La fecha de entrega no puede ser anterior a la de la orden.')
        return
      }
    } else {
      if (fecha && fecha !== original(documento?.fecha_cotizacion).slice(0, 10)) {
        cambios.fecha_cotizacion = fecha
      }
      const validez = Number(validezDias)
      if (!Number.isInteger(validez) || validez < 1 || validez > 3650) {
        setError('La validez debe ser un entero entre 1 y 3650 días.')
        return
      }
      if (validez !== Number(documento?.validez_dias ?? 0)) cambios.validez_dias = validez
    }

    if (Object.keys(cambios).length === 0) {
      setError('No hay cambios que guardar.')
      return
    }

    try {
      setGuardando(true)
      setError('')
      const recurso = esOrden ? 'ordenes' : 'cotizaciones'
      const response = await put(`/api/compras/${recurso}/${documento.id}`, cambios)
      if (!response?.success) {
        throw new Error(response?.message || 'No se pudo guardar el documento')
      }
      onSuccess()
      onClose()
    } catch (updateError: any) {
      console.error('Error editando documento de compra:', updateError)
      setError(updateError?.message || 'No se pudo guardar el documento')
    } finally {
      setGuardando(false)
    }
  }

  if (!isOpen) return null

  const titulo = esOrden
    ? `Editar orden ${documento?.numero ?? ''}`
    : `Editar cotización ${documento?.numero ?? ''}`

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] border-border bg-card p-0 text-card-foreground sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Se edita la cabecera mientras el documento está en borrador. Para
            cambiar productos o cantidades, use el detalle del documento.
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">
              {esOrden ? 'Fecha de la orden' : 'Fecha de la cotización'}
            </span>
            <input
              type="date"
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              disabled={guardando}
              className="rounded-md border border-input bg-background px-3 py-2 font-normal"
            />
          </label>

          {esOrden ? (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">Entrega esperada</span>
                <input
                  type="date"
                  value={fechaEntrega}
                  onChange={(event) => setFechaEntrega(event.target.value)}
                  disabled={guardando}
                  className="rounded-md border border-input bg-background px-3 py-2 font-normal"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Condiciones de pago</span>
                  <select
                    value={condicionesPago}
                    onChange={(event) => setCondicionesPago(event.target.value)}
                    disabled={guardando}
                    className="rounded-md border border-input bg-background px-3 py-2 font-normal"
                  >
                    <option value="CONTADO">Contado</option>
                    <option value="CREDITO">Crédito</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-foreground">Días de crédito</span>
                  <input
                    type="number"
                    min={0}
                    max={3650}
                    value={diasCredito}
                    onChange={(event) => setDiasCredito(event.target.value)}
                    disabled={guardando}
                    className="rounded-md border border-input bg-background px-3 py-2 font-normal"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Validez (días)</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={validezDias}
                onChange={(event) => setValidezDias(event.target.value)}
                disabled={guardando}
                className="rounded-md border border-input bg-background px-3 py-2 font-normal"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Observaciones</span>
            <textarea
              value={observaciones}
              onChange={(event) => setObservaciones(event.target.value)}
              disabled={guardando}
              rows={3}
              className="rounded-md border border-input bg-background px-3 py-2 font-normal"
            />
          </label>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
