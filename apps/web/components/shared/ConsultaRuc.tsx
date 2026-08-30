'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'

/**
 * Consulta datos públicos auxiliares de un RUC mientras se teclea. La fuente
 * actual no es un servicio oficial de SUNAT y la respuesta no se presenta como
 * certificación.
 *
 * Dice tres cosas que antes no se sabían: si el contribuyente existe, si está
 * de baja y si está **habido**. Lo último importa de verdad — una compra a un
 * proveedor no habido arrastra problemas de crédito fiscal.
 *
 * Avisa, no impide. Un contador puede tener razones para registrar a un
 * proveedor no habido, y bloquearlo a mitad de un asiento sería peor que el
 * problema: lo que no puede es enterarse tres meses después.
 *
 * Y distingue «no se pudo comprobar» de «no existe». Si la fuente no responde no
 * se dice nada, porque de un silencio no se concluye nada sobre nadie.
 */

export interface ContribuyenteConsultado {
  ruc: string
  razonSocial: string | null
  estado: string | null
  condicion: string | null
  direccion: string | null
  ubigeo: string | null
  consultadoEn: string
  fuente: string
  desdeCache: boolean
}

interface ConsultaRucProps {
  ruc: string
  /** Se llama al encontrar el contribuyente, para rellenar el formulario. */
  onEncontrado?: (dato: ContribuyenteConsultado) => void
  /** Etiqueta del documento según el país: RUC, CUIT, NIT. */
  documentoLabel?: string
  /** Sólo Perú tiene padrón consultable; en otros países no se muestra nada. */
  activo?: boolean
}

export function ConsultaRuc({
  ruc,
  onEncontrado,
  documentoLabel = 'RUC',
  activo = true,
}: ConsultaRucProps) {
  const { get } = useApi({ showErrorToast: false, retries: 0, timeoutMs: 12000 })
  const [consultando, setConsultando] = useState(false)
  const [dato, setDato] = useState<ContribuyenteConsultado | null>(null)
  const [sinRespuesta, setSinRespuesta] = useState(false)
  // El último RUC consultado, para no repetir la llamada en cada tecla.
  const ultimoConsultado = useRef<string | null>(null)

  const numero = String(ruc || '').replace(/\D/g, '')
  const completo = /^\d{11}$/.test(numero)

  const consultar = useCallback(
    async (valor: string) => {
      setConsultando(true)
      setSinRespuesta(false)
      try {
        const respuesta = await get(`/api/contabilidad/padron-ruc/${valor}`)
        const encontrado: ContribuyenteConsultado | null = respuesta?.data ?? null
        setDato(encontrado)
        if (encontrado) onEncontrado?.(encontrado)
        else setSinRespuesta(true)
      } catch {
        // No se pudo comprobar. No es lo mismo que «no existe», así que no se
        // muestra nada: un aviso falso sobre un contribuyente es peor que
        // ninguno.
        setDato(null)
        setSinRespuesta(true)
      } finally {
        setConsultando(false)
      }
    },
    [get, onEncontrado],
  )

  useEffect(() => {
    if (!activo || !completo) {
      setDato(null)
      setSinRespuesta(false)
      ultimoConsultado.current = null
      return
    }
    if (ultimoConsultado.current === numero) return
    ultimoConsultado.current = numero
    void consultar(numero)
  }, [activo, completo, numero, consultar])

  if (!activo || !completo) return null

  if (consultando) {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Consultando datos públicos del {documentoLabel}…
      </p>
    )
  }

  if (sinRespuesta || !dato) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        No se pudo comprobar este {documentoLabel} en la fuente auxiliar. Puede continuar.
      </p>
    )
  }

  const activoEnPadron = (dato.estado ?? '').toUpperCase() === 'ACTIVO'
  const habido = (dato.condicion ?? '').toUpperCase() === 'HABIDO'
  const todoBien = activoEnPadron && habido

  return (
    <div
      className={`mt-2 rounded-lg border p-3 text-xs ${
        todoBien
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-400/40 bg-amber-400/5 text-amber-700 dark:text-amber-300'
      }`}
    >
      <p className="flex items-start gap-2 font-semibold">
        {todoBien ? (
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span>{dato.razonSocial || 'Contribuyente encontrado'}</span>
      </p>

      <p className="mt-1 pl-5 font-normal">
        {dato.estado ?? 'estado desconocido'} · {dato.condicion ?? 'condición desconocida'}
        {dato.direccion ? ` · ${dato.direccion}` : ''}
      </p>
      <p className="mt-1 pl-5 text-[0.68rem] opacity-80">
        Consulta auxiliar {dato.desdeCache ? 'desde caché' : `vía ${dato.fuente}`}; confirma en SUNAT antes de una decisión fiscal.
      </p>

      {!habido && (
        <p className="mt-2 pl-5 font-normal">
          Un proveedor <strong>no habido</strong> compromete el crédito fiscal de sus compras.
          Puede registrarlo igual, pero conviene saberlo antes.
        </p>
      )}
      {!activoEnPadron && (
        <p className="mt-1 pl-5 font-normal">
          La fuente consultada lo reporta de <strong>baja</strong>; confirma el estado en SUNAT antes de aceptar comprobantes.
        </p>
      )}
    </div>
  )
}
