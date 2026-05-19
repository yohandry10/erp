'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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

export default function NuevoAsientoPage() {
  const router = useRouter()
  const { get, post } = useApi()

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInitialData = useCallback(async () => {
    try {
      setLoadingData(true)
      setError(null)

      const cuentasResponse = await get('/api/contabilidad/plan-cuentas')
      if (cuentasResponse?.success && cuentasResponse.data) setCuentas(cuentasResponse.data)

      const centrosResponse = await get('/api/contabilidad/centros-costo')
      if (centrosResponse?.success && centrosResponse.data) setCentrosCosto(centrosResponse.data)
    } catch (err: any) {
      console.error('Error loading initial data:', err)
      setError(err.message || 'Error al cargar los datos iniciales')
    } finally {
      setLoadingData(false)
    }
  }, [get])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const handleSubmit = async (data: AsientoFormData) => {
    try {
      setLoading(true)
      setError(null)

      const response = await post('/api/contabilidad/asiento-contable', data)

      if (response?.success) {
        alert('Asiento contable creado exitosamente')
        router.push(`/dashboard/contabilidad/asientos/${response.data.id}`)
      } else {
        throw new Error(response?.message || 'Error al crear el asiento')
      }
    } catch (err: any) {
      console.error('Error creating asiento:', err)
      setError(err.message || 'Error al crear el asiento contable')
      alert(`Error: ${err.message || 'Error al crear el asiento contable'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    if (confirm('¿Esta seguro de cancelar? Se perderan los datos ingresados.')) {
      router.push('/dashboard/contabilidad/asientos')
    }
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
        <Card className="mx-auto max-w-[1500px] border-cyan-400/20 bg-slate-950/70 text-slate-100">
          <CardContent className="flex min-h-[180px] items-center justify-center gap-3 p-6">
            <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
            <span className="text-sm font-medium text-slate-300">Cargando datos contables...</span>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error && cuentas.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
        <Card className="mx-auto max-w-[1200px] border-cyan-400/20 bg-slate-950/70 text-slate-100">
          <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              <FileText className="h-8 w-8 text-cyan-100" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Error al cargar los datos</h3>
              <p className="mt-2 text-sm text-slate-300">{error}</p>
            </div>
            <Button onClick={loadInitialData} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-sky-950 to-slate-950 p-4 text-slate-100">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 px-5 py-4 shadow-2xl shadow-blue-950/20">
          <Button
            type="button"
            onClick={() => router.push('/dashboard/contabilidad/asientos')}
            variant="outline"
            className="mb-4 gap-2 border-cyan-400/20 bg-white/5 text-cyan-50 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a asientos
          </Button>
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-100">
              <FileText className="h-6 w-6" />
            </span>
            <div>
              <div className="mb-2 inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                ERP Journal Center
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Nuevo asiento contable manual</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Complete el asiento y confirme que debe y haber cuadren antes de guardar.
              </p>
            </div>
          </div>
        </section>

        <AsientoForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          cuentas={cuentas}
          centrosCosto={centrosCosto}
          loading={loading}
        />
      </div>
    </div>
  )
}
