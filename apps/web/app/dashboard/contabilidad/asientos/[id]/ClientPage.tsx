'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { AlertCircle, ArrowLeft, Calendar, CheckCircle, Download, FileText, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DetalleAsiento {
  id: string
  cuenta_id: string
  cuenta_codigo: string
  cuenta_nombre: string
  debe: number
  haber: number
  concepto: string
  centro_costo_id?: string
  centro_costo_nombre?: string
}

interface AsientoContable {
  id: string
  tenant_id: string
  numero_asiento: string
  fecha: string
  concepto: string
  referencia?: string
  total_debe: number
  total_haber: number
  estado: 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'
  origen?: string
  source_event_id?: string
  created_at: string
  updated_at: string
  detalles?: DetalleAsiento[]
}

type EstadoAsiento = 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'

const ESTADOS_CONFIG: Record<EstadoAsiento, { label: string; icon: typeof FileText }> = {
  BORRADOR: { label: 'Borrador', icon: FileText },
  CONFIRMADO: { label: 'Confirmado', icon: CheckCircle },
  ANULADO: { label: 'Anulado', icon: XCircle },
}

export default function AsientoDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const asientoId = params.id as string | undefined

  const [asiento, setAsiento] = useState<AsientoContable | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAsiento = useCallback(async () => {
    if (!asientoId) return

    try {
      setLoading(true)
      setError(null)
      const response = await get(`/api/contabilidad/asientos/${asientoId}`)

      if (response?.success && response.data) {
        setAsiento(response.data)
      } else {
        setError('No se pudo cargar el asiento contable')
      }
    } catch (err: any) {
      console.error('Error loading asiento:', err)
      setError(err.message || 'Error al cargar el asiento contable')
    } finally {
      setLoading(false)
    }
  }, [asientoId, get])

  useEffect(() => {
    loadAsiento()
  }, [loadAsiento])

  const formatCurrency = (amount: number | undefined) =>
    new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount || 0)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS_CONFIG[estado as EstadoAsiento]
    if (!config) return null
    const Icon = config.icon

    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
        <Icon className="h-4 w-4" />
        {config.label}
      </span>
    )
  }

  const isBalanced = () => {
    if (!asiento) return false
    return Math.abs(asiento.total_debe - asiento.total_haber) < 0.01
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Cargando asiento contable...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !asiento) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1200px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              <AlertCircle className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Error al cargar el asiento</h3>
              <p className="mt-2 text-sm text-muted-foreground">{error || 'Asiento no encontrado'}</p>
            </div>
            <Button
              onClick={() => router.push('/dashboard/contabilidad/asientos')}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a asientos
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const difference = Math.abs(asiento.total_debe - asiento.total_haber)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Button
                type="button"
                onClick={() => router.push('/dashboard/contabilidad/asientos')}
                variant="outline"
                className="mb-4 gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a asientos
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Asiento {asiento.numero_asiento}</h1>
                {getEstadoBadge(asiento.estado)}
                {!isBalanced() && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                    <AlertCircle className="h-4 w-4" />
                    Descuadrado
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Creado el {formatDate(asiento.created_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={loadAsiento}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button
                type="button"
                onClick={() => alert('Funcionalidad de descarga proximamente')}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
              >
                <Download className="h-4 w-4" />
                Descargar PDF
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                  <FileText className="h-5 w-5 text-primary" />
                  Informacion del asiento
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Numero', asiento.numero_asiento],
                  ['Fecha', formatDate(asiento.fecha)],
                  ['Referencia', asiento.referencia || 'Sin referencia'],
                  ['Origen', asiento.origen || (asiento.source_event_id ? 'Automático' : 'Manual')],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-cyan-400/15 bg-card/70 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">{label}</div>
                    <div className="mt-2 break-words text-sm font-semibold text-foreground">{value}</div>
                  </div>
                ))}
                <div className="rounded-xl border border-cyan-400/15 bg-card/70 p-4 md:col-span-2 xl:col-span-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Concepto</div>
                  <p className="mt-2 text-sm leading-6 text-foreground/90">{asiento.concepto}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-400/20 bg-card/70 text-foreground shadow-xl shadow-blue-950/20">
              <CardHeader className="flex-row items-center justify-between border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                  <FileText className="h-5 w-5 text-primary" />
                  Detalle debe / haber
                </CardTitle>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-primary">
                  {isBalanced() ? 'Balanceado' : 'Descuadrado'}
                </span>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse">
                    <thead className="bg-cyan-400/10">
                      <tr className="border-b border-cyan-400/15 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                        <th className="px-4 py-3">Cuenta</th>
                        <th className="px-4 py-3">Concepto</th>
                        <th className="px-4 py-3">Centro</th>
                        <th className="px-4 py-3 text-right">Debe</th>
                        <th className="px-4 py-3 text-right">Haber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asiento.detalles && asiento.detalles.length > 0 ? (
                        asiento.detalles.map((detalle, index) => (
                          <tr key={detalle.id || index} className="border-b border-cyan-400/10 text-sm text-foreground/90">
                            <td className="px-4 py-3">
                              <div className="text-xs font-semibold text-primary/80">{detalle.cuenta_codigo}</div>
                              <div className="mt-1 font-semibold text-foreground">{detalle.cuenta_nombre}</div>
                            </td>
                            <td className="px-4 py-3">{detalle.concepto}</td>
                            <td className="px-4 py-3">{detalle.centro_costo_nombre || '-'}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">
                              {detalle.debe > 0 ? formatCurrency(detalle.debe) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-primary dark:text-blue-200">
                              {detalle.haber > 0 ? formatCurrency(detalle.haber) : '-'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No hay detalles en este asiento
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-card/80">
                      <tr className="border-t border-cyan-400/15 text-sm font-bold text-foreground">
                        <td colSpan={3} className="px-4 py-4">
                          Totales
                        </td>
                        <td className="px-4 py-4 text-right text-primary">{formatCurrency(asiento.total_debe)}</td>
                        <td className="px-4 py-4 text-right text-primary dark:text-blue-200">{formatCurrency(asiento.total_haber)}</td>
                      </tr>
                      {!isBalanced() && (
                        <tr className="border-t border-cyan-400/15 text-sm font-bold text-primary">
                          <td colSpan={3} className="px-4 py-4">
                            Diferencia
                          </td>
                          <td colSpan={2} className="px-4 py-4 text-right">
                            {formatCurrency(difference)}
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="border-cyan-400/20 bg-card/75 text-foreground shadow-xl shadow-blue-950/20">
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className="text-base text-foreground">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {[
                  ['Total debe', formatCurrency(asiento.total_debe)],
                  ['Total haber', formatCurrency(asiento.total_haber)],
                  ['Diferencia', formatCurrency(difference)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-xl border border-cyan-400/15 bg-card/70 p-3">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="font-bold text-foreground">{value}</span>
                  </div>
                ))}
                <div className="flex items-start gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/10 p-3">
                  {isBalanced() ? (
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  )}
                  <p className="text-sm font-medium text-primary">
                    {isBalanced() ? 'El asiento esta balanceado correctamente.' : 'El asiento esta descuadrado.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-400/20 bg-card/75 text-foreground shadow-xl shadow-blue-950/20">
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                  <Calendar className="h-5 w-5 text-primary" />
                  Metadatos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                <div className="rounded-xl border border-cyan-400/15 bg-card/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Estado</div>
                  <div className="mt-2">{getEstadoBadge(asiento.estado)}</div>
                </div>
                <div className="rounded-xl border border-cyan-400/15 bg-card/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Fecha de creacion</div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{formatDate(asiento.created_at)}</div>
                </div>
                <div className="rounded-xl border border-cyan-400/15 bg-card/70 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Ultima actualizacion</div>
                  <div className="mt-2 text-sm font-semibold text-foreground">{formatDate(asiento.updated_at)}</div>
                </div>
                {asiento.source_event_id && (
                  <div className="rounded-xl border border-cyan-400/15 bg-card/70 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Evento origen</div>
                    <div className="mt-2 break-all font-mono text-xs text-foreground/90">{asiento.source_event_id}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </div>
  )
}

