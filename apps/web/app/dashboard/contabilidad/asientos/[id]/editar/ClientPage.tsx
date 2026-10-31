'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, FileText, Loader2, RefreshCw } from 'lucide-react'
import AsientoForm from '@/components/contabilidad/AsientoForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Cuenta {
  id: string
  codigo: string
  nombre: string
}

interface CentroCosto {
  id: string
  nombre: string
}

interface AsientoFormData {
  fecha: string
  concepto: string
  referencia?: string
  detalles: Array<{
    cuenta_id: string
    debe: number
    haber: number
    concepto: string
    centro_costo_id?: string
  }>
}

/**
 * Edición de un asiento en BORRADOR. Un asiento confirmado es inmutable: el
 * backend rechaza el PUT y la ficha no ofrece esta ruta para esos asientos.
 */
export default function EditarAsientoPage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  const asientoId = params.id as string | undefined

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [initialData, setInitialData] = useState<AsientoFormData | null>(null)
  const [numeroAsiento, setNumeroAsiento] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInitialData = useCallback(async () => {
    if (!asientoId) return

    try {
      setLoadingData(true)
      setError(null)

      const [asientoResponse, cuentasResponse, centrosResponse] = await Promise.all([
        get(`/api/contabilidad/asientos/${asientoId}`),
        get('/api/contabilidad/plan-cuentas'),
        get('/api/contabilidad/centros-costo'),
      ])

      if (cuentasResponse?.success && cuentasResponse.data) setCuentas(cuentasResponse.data)
      if (centrosResponse?.success && centrosResponse.data) setCentrosCosto(centrosResponse.data)

      if (!asientoResponse?.success || !asientoResponse.data) {
        throw new Error('No se pudo cargar el asiento contable')
      }

      const asiento = asientoResponse.data
      if (String(asiento.estado).toUpperCase() !== 'BORRADOR') {
        throw new Error(
          `Solo se puede editar un asiento en borrador. Este asiento está ${asiento.estado}. ` +
            'Para corregir un asiento confirmado use la reversión.'
        )
      }

      setNumeroAsiento(asiento.numero_asiento ?? '')
      setInitialData({
        fecha: String(asiento.fecha).split('T')[0],
        concepto: asiento.concepto ?? '',
        referencia: asiento.referencia ?? '',
        detalles: (asiento.detalles ?? []).map((detalle: any) => ({
          cuenta_id: detalle.cuenta_id,
          debe: Number(detalle.debe) || 0,
          haber: Number(detalle.haber) || 0,
          concepto: detalle.concepto ?? '',
          centro_costo_id: detalle.centro_costo_id ?? '',
        })),
      })
    } catch (err: any) {
      console.error('Error loading asiento para edicion:', err)
      setError(err.message || 'Error al cargar el asiento contable')
    } finally {
      setLoadingData(false)
    }
  }, [asientoId, get])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const handleSubmit = async (data: AsientoFormData) => {
    try {
      setLoading(true)
      setError(null)

      const response = await put(`/api/contabilidad/asientos/${asientoId}`, data)

      if (response?.success) {
        router.push(`/dashboard/contabilidad/asientos/${asientoId}`)
      } else {
        throw new Error(response?.message || 'Error al actualizar el asiento')
      }
    } catch (err: any) {
      console.error('Error updating asiento:', err)
      setError(err.message || 'Error al actualizar el asiento contable')
    } finally {
      setLoading(false)
    }
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Cargando asiento...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && !initialData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
        <Card className="mx-auto max-w-[1200px] border-cyan-400/20 bg-card/70 text-foreground">
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">No se puede editar este asiento</h3>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => router.push(`/dashboard/contabilidad/asientos/${asientoId}`)}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-500"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al asiento
              </Button>
              <Button
                onClick={loadInitialData}
                variant="outline"
                className="gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-background p-4 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-card/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <Button
            type="button"
            onClick={() => router.push(`/dashboard/contabilidad/asientos/${asientoId}`)}
            variant="outline"
            className="mb-4 gap-2 border-cyan-400/20 bg-white/5 text-primary hover:bg-white/10 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al asiento
          </Button>
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-primary">
              <FileText className="h-6 w-6" />
            </span>
            <div>
              <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Borrador
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Editar asiento {numeroAsiento}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Los movimientos se reemplazan por completo al guardar. El asiento sigue en borrador
                hasta que lo confirme.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-primary">
            {error}
          </div>
        )}

        {initialData && (
          <AsientoForm
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/dashboard/contabilidad/asientos/${asientoId}`)}
            cuentas={cuentas}
            centrosCosto={centrosCosto}
            loading={loading}
            initialData={initialData}
            submitLabel="Guardar cambios"
          />
        )}
      </div>
    </div>
  )
}
