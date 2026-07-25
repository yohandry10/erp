'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Calendar,
  Building2,
  FileText,
  RefreshCw,
  ArrowLeft,
  CheckCircle2
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface Alerta {
  presupuesto_id: string
  nivel_alerta: 'SOBREGIRO' | 'ADVERTENCIA'
  severidad: 'CRITICO' | 'ALTO'
  porcentaje_ejecutado: number
  monto_presupuestado: number
  monto_ejecutado: number
  monto_comprometido: number
  monto_disponible: number
  excedente: number
  centro_costo: {
    id: string
    codigo: string
    nombre: string
  }
  cuenta: {
    id: string
    codigo: string
    nombre: string
  }
  periodo: {
    id: string
    anio: number
    mes: number
    descripcion: string
  }
  mensaje: string
  fecha_deteccion: string
}

interface ResumenAlertas {
  total_alertas: number
  sobregiros: {
    cantidad: number
    total_excedente: number
    alertas: Alerta[]
  }
  advertencias: {
    cantidad: number
    total_en_riesgo: number
    alertas: Alerta[]
  }
  fecha_generacion: string
}

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const toArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : [])

const normalizeResumen = (raw: any): ResumenAlertas => ({
  total_alertas: toNumber(raw?.total_alertas),
  sobregiros: {
    cantidad: toNumber(raw?.sobregiros?.cantidad),
    total_excedente: toNumber(raw?.sobregiros?.total_excedente),
    alertas: toArray<Alerta>(raw?.sobregiros?.alertas),
  },
  advertencias: {
    cantidad: toNumber(raw?.advertencias?.cantidad),
    total_en_riesgo: toNumber(raw?.advertencias?.total_en_riesgo),
    alertas: toArray<Alerta>(raw?.advertencias?.alertas),
  },
  fecha_generacion: raw?.fecha_generacion || new Date().toISOString(),
})

export default function AlertasSobregirosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resumen, setResumen] = useState<ResumenAlertas | null>(null)
  const [filtroNivel, setFiltroNivel] = useState<'TODOS' | 'SOBREGIRO' | 'ADVERTENCIA'>('TODOS')
  const [error, setError] = useState<string | null>(null)
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false })

  const fetchAlertas = useCallback(async () => {
    try {
      setError(null)
      const result = await apiCall('/contabilidad/presupuestos/alertas/resumen')
      setResumen(normalizeResumen(result?.data))
    } catch (err) {
      console.error('Error fetching alertas:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiCall])

  useEffect(() => {
    fetchAlertas()
  }, [fetchAlertas])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAlertas()
  }

  const getAlertasFiltradas = (): Alerta[] => {
    if (!resumen) return []

    if (filtroNivel === 'SOBREGIRO') {
      return resumen.sobregiros?.alertas ?? []
    } else if (filtroNivel === 'ADVERTENCIA') {
      return resumen.advertencias?.alertas ?? []
    } else {
      return [...(resumen.sobregiros?.alertas ?? []), ...(resumen.advertencias?.alertas ?? [])]
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(toNumber(amount))
  }

  const getAlertColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#ef4444' : '#f59e0b'
  }

  const getAlertBgColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#fef2f2' : '#fffbeb'
  }

  const getAlertBorderColor = (nivel: string) => {
    return nivel === 'SOBREGIRO' ? '#fecaca' : '#fde68a'
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8 mb-8">
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Alertas de Sobregiro Presupuestal</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Monitoreo de presupuestos con advertencias, sobregiros y límites de ejecución.
            </p>
          </div>
        </div>
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw size={48} className="text-blue-500" />
            <p className="text-muted-foreground text-base">
              Cargando alertas de sobregiro...
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="p-8 bg-[#fef2f2] border rounded-xl text-center">
          <AlertCircle size={48} className="text-red-500" />
          <h3 className="text-destructive mb-2">Error al cargar alertas</h3>
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={handleRefresh} className="py-3 px-6 bg-red-500 text-white border-0 rounded-lg cursor-pointer text-[0.875rem] font-semibold"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const alertasFiltradas = getAlertasFiltradas()

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8 mb-8">
        <div className="flex items-center gap-4">
          <button
            aria-label="Volver a presupuestos"
            onClick={() => router.push('/dashboard/contabilidad/presupuestos')} className="p-2 bg-card border rounded-lg cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={20} className="text-muted-foreground" />
          </button>
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Alertas de Sobregiro Presupuestal</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Monitoreo de presupuestos con advertencias y sobregiros
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing} className="py-3 px-6 text-white border-0 rounded-lg text-[0.875rem] font-semibold flex items-center gap-2"
        >
          <RefreshCw
            size={16}
          />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Resumen Cards */}
      {resumen && (
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-6 mb-8">
          {/* Total Alertas */}
          <div className="p-6 bg-card rounded-xl shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-muted rounded-[0.625rem] flex items-center justify-center">
                <AlertCircle size={24} className="text-blue-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-muted-foreground m-0">
                  Total Alertas
                </p>
                <p className="text-[2rem] font-bold text-foreground m-0">
                  {resumen.total_alertas}
                </p>
              </div>
            </div>
          </div>

          {/* Sobregiros */}
          <div className="p-6 bg-card rounded-xl shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#fef2f2] rounded-[0.625rem] flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-muted-foreground m-0">
                  Sobregiros (&gt;100%)
                </p>
                <p className="text-[2rem] font-bold text-red-500 m-0">
                  {resumen.sobregiros.cantidad}
                </p>
              </div>
            </div>
            <p className="text-[0.875rem] text-destructive m-0">
              Excedente: {formatCurrency(resumen.sobregiros.total_excedente)}
            </p>
          </div>

          {/* Advertencias */}
          <div className="p-6 bg-card rounded-xl shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#fffbeb] rounded-[0.625rem] flex items-center justify-center">
                <AlertCircle size={24} className="text-amber-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-muted-foreground m-0">
                  Advertencias (&gt;90%)
                </p>
                <p className="text-[2rem] font-bold text-amber-500 m-0">
                  {resumen.advertencias.cantidad}
                </p>
              </div>
            </div>
            <p className="text-[0.875rem] text-[#92400e] m-0">
              En riesgo: {formatCurrency(resumen.advertencias.total_en_riesgo)}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-4 mb-6 flex-wrap">
        {(['TODOS', 'SOBREGIRO', 'ADVERTENCIA'] as const).map((nivel) => (
          <button
            key={nivel}
            onClick={() => setFiltroNivel(nivel)} className="py-3 px-6 rounded-lg cursor-pointer text-[0.875rem] font-semibold transition"
          >
            {nivel === 'TODOS' ? 'Todas' : nivel === 'SOBREGIRO' ? 'Sobregiros' : 'Advertencias'}
          </button>
        ))}
      </div>

      {/* Lista de Alertas */}
      {alertasFiltradas.length === 0 ? (
        <div className="p-12 bg-card rounded-xl text-center">
          <CheckCircle2 size={64} className="text-[#10b981]" />
          <h3 className="text-foreground mb-2">
            ¡No hay alertas activas!
          </h3>
          <p className="text-muted-foreground m-0">
            Todos los presupuestos están dentro de los límites normales
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {alertasFiltradas.map((alerta) => (
            <div
              key={alerta.presupuesto_id} className="p-6 rounded-xl transition"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-4 flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  {alerta.nivel_alerta === 'SOBREGIRO' ? (
                    <AlertTriangle size={32} />
                  ) : (
                    <AlertCircle size={32} />
                  )}
                  <div>
                    <div className="inline-block py-1 px-3 text-white rounded-[6px] text-xs font-bold mb-2">
                      {alerta.nivel_alerta}
                    </div>
                    <h3 className="text-[1.125rem] font-semibold text-foreground m-0">
                      {alerta.centro_costo?.nombre ?? 'Centro de costo'}
                    </h3>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[2rem] font-bold m-0 leading-[1]">
                    {toNumber(alerta.porcentaje_ejecutado).toFixed(1)}%
                  </p>
                  <p className="text-xs text-muted-foreground m-0">
                    Ejecutado
                  </p>
                </div>
              </div>

              {/* Mensaje */}
              <p className="text-[0.875rem] text-foreground/85 mt-0 mr-0 mb-4 ml-0 leading-6">
                {alerta.mensaje}
              </p>

              {/* Detalles */}
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground m-0">
                      Cuenta
                    </p>
                    <p className="text-[0.875rem] font-semibold text-foreground m-0">
                      {alerta.cuenta?.codigo ?? 'N/A'} - {alerta.cuenta?.nombre ?? 'Cuenta'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground m-0">
                      Período
                    </p>
                    <p className="text-[0.875rem] font-semibold text-foreground m-0">
                      {alerta.periodo?.descripcion ?? 'Periodo no disponible'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Montos */}
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4 p-4 bg-card rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                    Presupuestado
                  </p>
                  <p className="text-base font-semibold text-foreground m-0">
                    {formatCurrency(alerta.monto_presupuestado)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                    Ejecutado
                  </p>
                  <p className="text-base font-semibold m-0">
                    {formatCurrency(alerta.monto_ejecutado)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                    Disponible
                  </p>
                  <p className="text-base font-semibold m-0">
                    {formatCurrency(alerta.monto_disponible)}
                  </p>
                </div>
                {alerta.nivel_alerta === 'SOBREGIRO' && (
                  <div>
                    <p className="text-xs text-muted-foreground mt-0 mr-0 mb-1 ml-0">
                      Excedente
                    </p>
                    <p className="text-base font-semibold text-red-500 m-0">
                      {formatCurrency(alerta.excedente)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      {resumen && (
        <div className="mt-8 p-4 bg-muted border rounded-lg text-xs text-muted-foreground text-center">
          Última actualización: {new Date(resumen.fecha_generacion).toLocaleString('es-PE')}
        </div>
      )}
    </div>
  )
}
