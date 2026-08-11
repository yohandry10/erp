'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, Search, Send, ShieldCheck } from 'lucide-react'
import { useApiCall } from '@/hooks/use-api'
import { unwrapApiArray } from '@/lib/api-contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'

type TipoLote = 'RA' | 'RC'

interface CpeBajaElegible {
  id: string
  tipo: TipoLote
  tipoDocumento: '01' | '03'
  serie: string
  numero: string
  fechaEmision: string
  receptor?: string
  receptorDocumento?: string
  total: number
  moneda: string
  reversaComercialConfirmada: true
}

interface LoteFiscal {
  id: string
  tipo: TipoLote
  numero_comunicacion?: string
  numero_resumen?: string
  comprobantes_ids?: string[]
  estado: string
  motivo_baja?: string
  fecha_comunicacion?: string
  fecha_referencia?: string
  idempotency_key?: string
  ticket_sunat?: string
  codigo_respuesta?: string
  descripcion_respuesta?: string
  ultimo_error?: string
  next_retry_at?: string
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-card/75 px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const stateClass: Record<string, string> = {
  PENDIENTE: 'border-amber-300/25 bg-amber-300/10 text-amber-400 dark:text-amber-200',
  GENERADO: 'border-blue-300/25 bg-blue-300/10 text-primary dark:text-blue-200',
  ENVIADO: 'border-cyan-300/25 bg-cyan-300/10 text-primary',
  ACEPTADO: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-500 dark:text-emerald-200',
  RECHAZADO: 'border-red-300/25 bg-red-300/10 text-red-500 dark:text-red-200',
  ERROR: 'border-red-300/25 bg-red-300/10 text-red-500 dark:text-red-200',
}

function dateOnly(value?: string): string {
  return String(value ?? '').slice(0, 10)
}

function newIntentKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`
}

export default function FiscalBajaPanel({ onChanged }: { onChanged?: () => void | Promise<void> }) {
  const { toast } = useToast()
  const [tipo, setTipo] = useState<TipoLote>('RA')
  const [eligible, setEligible] = useState<CpeBajaElegible[]>([])
  const [batches, setBatches] = useState<LoteFiscal[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [motivo, setMotivo] = useState('Baja fiscal posterior a reversa comercial confirmada')
  const [working, setWorking] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const createKey = useRef<string | null>(null)
  const { get } = useApiCall<any>({ showErrorToast: false, throwOnError: true })
  const { post } = useApiCall<any>({ showErrorToast: false, throwOnError: true })

  const loadFiscal = useCallback(async () => {
    setReadError(null)
    const [eligibleResult, batchResult] = await Promise.allSettled([
      get(`/api/cpe/baja/elegibles?tipo=${tipo}`),
      get(`/api/cpe/baja/lotes?tipo=${tipo}`),
    ])
    if (eligibleResult.status === 'fulfilled') {
      setEligible(unwrapApiArray<CpeBajaElegible>(eligibleResult.value))
    } else {
      setEligible([])
      setReadError(eligibleResult.reason instanceof Error
        ? eligibleResult.reason.message
        : 'No se pudieron consultar los CPE elegibles')
    }
    if (batchResult.status === 'fulfilled') {
      setBatches(unwrapApiArray<LoteFiscal>(batchResult.value))
    } else {
      setBatches([])
      setReadError((current) => current ?? (batchResult.reason instanceof Error
        ? batchResult.reason.message
        : 'No se pudieron consultar los lotes fiscales'))
    }
  }, [get, tipo])

  useEffect(() => {
    setSelectedIds([])
    createKey.current = null
    void loadFiscal()
  }, [loadFiscal, tipo])

  const selected = useMemo(
    () => eligible.filter((cpe) => selectedIds.includes(cpe.id)),
    [eligible, selectedIds],
  )
  const selectedDates = useMemo(
    () => new Set(selected.map((cpe) => dateOnly(cpe.fechaEmision))),
    [selected],
  )

  const toggleCpe = (id: string) => {
    createKey.current = null
    setSelectedIds((current) => current.includes(id)
      ? current.filter((candidate) => candidate !== id)
      : [...current, id])
  }

  const refreshAll = async () => {
    await loadFiscal()
    await onChanged?.()
  }

  const crearLote = async () => {
    if (selected.length === 0) return
    if (tipo === 'RA' && motivo.trim().length < 3) {
      toast({ title: 'Motivo requerido', description: 'Describe la razón de la baja fiscal.', variant: 'destructive' })
      return
    }
    if (tipo === 'RC' && selectedDates.size !== 1) {
      toast({
        title: 'Fechas incompatibles',
        description: 'Un RC de baja sólo puede agrupar boletas de la misma fecha de emisión.',
        variant: 'destructive',
      })
      return
    }
    const key = createKey.current ?? newIntentKey(`document-center-${tipo.toLowerCase()}-create`)
    createKey.current = key
    setWorking('create')
    try {
      const payload = tipo === 'RA'
        ? {
            comprobantesIds: selectedIds,
            motivoBaja: motivo.trim(),
            fechaComunicacion: new Date().toISOString().slice(0, 10),
            idempotencyKey: key,
          }
        : {
            comprobantesIds: selectedIds,
            fechaReferencia: dateOnly(selected[0].fechaEmision),
            idempotencyKey: key,
          }
      await post(tipo === 'RA' ? '/api/cpe/baja/comunicacion' : '/api/cpe/baja/resumen', payload)
      createKey.current = null
      setSelectedIds([])
      toast({
        title: `${tipo} firmado`,
        description: 'El lote quedó generado con credenciales fiscales del cliente y listo para enviar.',
      })
      await refreshAll()
    } catch (error) {
      toast({
        title: `No se pudo crear ${tipo}`,
        description: error instanceof Error ? error.message : 'La intención se conserva para reintentar.',
        variant: 'destructive',
      })
      await loadFiscal()
    } finally {
      setWorking(null)
    }
  }

  const reanudarFirma = async (lote: LoteFiscal) => {
    if (!lote.idempotency_key || !Array.isArray(lote.comprobantes_ids)) return
    setWorking(`resume:${lote.id}`)
    try {
      const payload = lote.tipo === 'RA'
        ? {
            comprobantesIds: lote.comprobantes_ids,
            motivoBaja: lote.motivo_baja,
            fechaComunicacion: dateOnly(lote.fecha_comunicacion),
            idempotencyKey: lote.idempotency_key,
          }
        : {
            comprobantesIds: lote.comprobantes_ids,
            fechaReferencia: dateOnly(lote.fecha_referencia),
            idempotencyKey: lote.idempotency_key,
          }
      await post(lote.tipo === 'RA' ? '/api/cpe/baja/comunicacion' : '/api/cpe/baja/resumen', payload)
      toast({ title: `${lote.tipo} firmado`, description: 'Se reanudó la misma intención sin duplicar el lote.' })
      await refreshAll()
    } catch (error) {
      toast({ title: 'Firma pendiente', description: error instanceof Error ? error.message : 'Reintenta más tarde.', variant: 'destructive' })
      await loadFiscal()
    } finally {
      setWorking(null)
    }
  }

  const enviarLote = async (lote: LoteFiscal) => {
    setWorking(`send:${lote.id}`)
    try {
      const endpoint = lote.tipo === 'RA'
        ? `/api/cpe/baja/comunicacion/${lote.id}/enviar`
        : `/api/cpe/baja/resumen/${lote.id}/enviar`
      await post(endpoint, { idempotencyKey: `${lote.tipo.toLowerCase()}-send:${lote.id}` })
      toast({ title: `${lote.tipo} enviado`, description: 'El ticket o resultado quedó persistido de forma durable.' })
      await refreshAll()
    } catch (error) {
      toast({
        title: 'Envío no confirmado',
        description: error instanceof Error ? error.message : 'El lote conserva estado y reintento durable.',
        variant: 'destructive',
      })
      await loadFiscal()
    } finally {
      setWorking(null)
    }
  }

  const consultarLote = async (lote: LoteFiscal) => {
    setWorking(`status:${lote.id}`)
    try {
      const endpoint = lote.tipo === 'RA'
        ? `/api/cpe/baja/comunicacion/${lote.id}/estado`
        : `/api/cpe/baja/resumen/${lote.id}/estado`
      await get(endpoint)
      toast({ title: 'Ticket consultado', description: 'La respuesta fiscal quedó conciliada con el lote.' })
      await refreshAll()
    } catch (error) {
      toast({ title: 'Consulta pendiente', description: error instanceof Error ? error.message : 'Reintenta más tarde.', variant: 'destructive' })
      await loadFiscal()
    } finally {
      setWorking(null)
    }
  }

  return (
    <Card className="border-amber-300/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
      <CardHeader className="border-b border-amber-300/10 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-foreground">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
              Bajas fiscales RA / RC
            </CardTitle>
            <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
              Esta etapa sólo comunica la baja fiscal. Un comprobante aparece aquí después de que CPE/448
              cerró de forma durable la nota de crédito y la reversa de deuda, contabilidad, stock y pedido.
              RA corresponde a facturas; RC usa operación 3 para boletas. Esta pantalla no repite la reversa comercial.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={refreshAll} disabled={Boolean(working)} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${working ? 'animate-spin' : ''}`} />
            Actualizar bajas
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de baja fiscal">
          {(['RA', 'RC'] as TipoLote[]).map((candidate) => (
            <Button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={tipo === candidate}
              variant={tipo === candidate ? 'default' : 'outline'}
              onClick={() => setTipo(candidate)}
            >
              {candidate} · {candidate === 'RA' ? 'Facturas' : 'Boletas'}
            </Button>
          ))}
        </div>

        {readError && (
          <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-500 dark:text-red-200">
            {readError}. Verifica los permisos cpe.comprobantes.anular/consultar.
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="overflow-hidden rounded-2xl border border-cyan-400/15 bg-card/40">
            <div className="border-b border-cyan-400/10 px-4 py-3">
              <div className="font-semibold">CPE elegibles ({eligible.length})</div>
              <div className="text-xs text-muted-foreground">Selecciona uno o más CPE ya revertidos comercialmente.</div>
            </div>
            {eligible.length === 0 ? (
              <div className="flex min-h-36 flex-col items-center justify-center gap-2 p-5 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-7 w-7 text-cyan-300/60" />
                No hay {tipo === 'RA' ? 'facturas' : 'boletas'} pendientes de baja fiscal.
                <span className="text-xs">Si falta una, completa primero su nota de crédito y CDR en CPE.</span>
              </div>
            ) : (
              <div className="max-h-72 overflow-auto divide-y divide-cyan-400/10">
                {eligible.map((cpe) => (
                  <label key={cpe.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-cyan-400/5">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-cyan-500"
                      checked={selectedIds.includes(cpe.id)}
                      onChange={() => toggleCpe(cpe.id)}
                      aria-label={`Seleccionar ${cpe.serie}-${cpe.numero}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-semibold">{cpe.serie}-{cpe.numero}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {dateOnly(cpe.fechaEmision)} · {cpe.receptor || cpe.receptorDocumento || 'Cliente'}
                      </span>
                    </span>
                    <span className="text-right text-sm font-semibold">{cpe.moneda} {Number(cpe.total).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-cyan-400/15 bg-card/40 p-4">
            <div>
              <div className="font-semibold">Crear lote {tipo}</div>
              <div className="text-xs text-muted-foreground">{selected.length} CPE seleccionados</div>
            </div>
            {tipo === 'RA' && (
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-primary/80">Motivo fiscal</span>
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={motivo}
                  onChange={(event) => {
                    createKey.current = null
                    setMotivo(event.target.value)
                  }}
                  maxLength={500}
                />
              </label>
            )}
            {tipo === 'RC' && selectedDates.size > 1 && (
              <p className="text-xs text-amber-400 dark:text-amber-200">Selecciona boletas de una sola fecha.</p>
            )}
            <Button
              type="button"
              onClick={crearLote}
              disabled={Boolean(working) || selected.length === 0 || (tipo === 'RC' && selectedDates.size !== 1)}
              className="w-full gap-2 bg-blue-600 text-white hover:bg-blue-500"
            >
              <ShieldCheck className="h-4 w-4" />
              {working === 'create' ? 'Firmando...' : `Crear y firmar ${tipo}`}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-cyan-400/15 bg-card/40">
          <div className="border-b border-cyan-400/10 px-4 py-3">
            <div className="font-semibold">Seguimiento y reintentos {tipo}</div>
            <div className="text-xs text-muted-foreground">Los tickets y errores sobreviven recargas; un resultado aceptado/rechazado es terminal.</div>
          </div>
          {batches.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">Todavía no hay lotes {tipo}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-card/70 text-xs uppercase tracking-wide text-primary/80">
                  <tr>
                    <th className="px-4 py-3 text-left">Lote</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Ticket / diagnóstico</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-400/10">
                  {batches.map((lote) => {
                    const estado = String(lote.estado || '').toUpperCase()
                    const numero = lote.numero_comunicacion || lote.numero_resumen || lote.id
                    return (
                      <tr key={lote.id}>
                        <td className="px-4 py-3 font-mono font-semibold">{numero}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass[estado] || stateClass.PENDIENTE}`}>
                            {estado}
                          </span>
                        </td>
                        <td className="max-w-sm px-4 py-3 text-xs text-muted-foreground">
                          {lote.ticket_sunat
                            ? `Ticket ${lote.ticket_sunat}${lote.codigo_respuesta ? ` · ${lote.codigo_respuesta}` : ''}`
                            : lote.ultimo_error || lote.descripcion_respuesta || 'Sin ticket todavía'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {estado === 'PENDIENTE' && (
                            <Button type="button" size="sm" variant="outline" onClick={() => reanudarFirma(lote)} disabled={Boolean(working)} className="gap-1">
                              <RefreshCw className="h-4 w-4" /> Reanudar firma
                            </Button>
                          )}
                          {estado === 'GENERADO' && (
                            <Button type="button" size="sm" onClick={() => enviarLote(lote)} disabled={Boolean(working)} className="gap-1 bg-cyan-600 text-white hover:bg-cyan-500">
                              <Send className="h-4 w-4" /> {lote.ultimo_error ? 'Reintentar envío' : 'Enviar'}
                            </Button>
                          )}
                          {estado === 'ENVIADO' && lote.ticket_sunat && (
                            <Button type="button" size="sm" variant="outline" onClick={() => consultarLote(lote)} disabled={Boolean(working)} className="gap-1">
                              <Search className="h-4 w-4" /> Consultar ticket
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
