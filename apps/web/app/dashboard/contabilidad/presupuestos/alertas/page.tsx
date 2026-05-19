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
      setResumen(result?.data || null)
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
      return resumen.sobregiros.alertas
    } else if (filtroNivel === 'ADVERTENCIA') {
      return resumen.advertencias.alertas
    } else {
      return [...resumen.sobregiros.alertas, ...resumen.advertencias.alertas]
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
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
      <div className="dashboard-container">
        <div className="dashboard-header mb-8">
          <div>
            <h1 className="dashboard-title">Alertas de Sobregiro Presupuestal</h1>
            <p className="dashboard-subtitle">
              Monitoreo de presupuestos con advertencias, sobregiros y límites de ejecución.
            </p>
          </div>
        </div>
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <RefreshCw size={48} className="text-blue-500" />
            <p className="text-gray-500 text-4">
              Cargando alertas de sobregiro...
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="p-8 bg-[#fef2f2] border rounded-3 text-center">
          <AlertCircle size={48} className="text-red-500" />
          <h3 className="text-red-800 mb-2">Error al cargar alertas</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh} className="py-3 px-6 bg-red-500 text-white border-0 rounded-2 cursor-pointer text-[0.875rem] font-semibold"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const alertasFiltradas = getAlertasFiltradas()

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header mb-8">
        <div className="flex items-center gap-4">
          <button
            aria-label="Volver a presupuestos"
            onClick={() => router.push('/dashboard/contabilidad/presupuestos')} className="p-2 bg-white border rounded-2 cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <div>
            <h1 className="dashboard-title">Alertas de Sobregiro Presupuestal</h1>
            <p className="dashboard-subtitle">
              Monitoreo de presupuestos con advertencias y sobregiros
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing} className="py-3 px-6 text-white border-0 rounded-2 text-[0.875rem] font-semibold flex items-center gap-2"
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
          <div className="p-6 bg-white rounded-3 shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#eff6ff] rounded-2.5 flex items-center justify-center">
                <AlertCircle size={24} className="text-blue-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-gray-500 m-0">
                  Total Alertas
                </p>
                <p className="text-8 font-bold text-gray-900 m-0">
                  {resumen.total_alertas}
                </p>
              </div>
            </div>
          </div>

          {/* Sobregiros */}
          <div className="p-6 bg-white rounded-3 shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#fef2f2] rounded-2.5 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-gray-500 m-0">
                  Sobregiros (&gt;100%)
                </p>
                <p className="text-8 font-bold text-red-500 m-0">
                  {resumen.sobregiros.cantidad}
                </p>
              </div>
            </div>
            <p className="text-[0.875rem] text-red-800 m-0">
              Excedente: {formatCurrency(resumen.sobregiros.total_excedente)}
            </p>
          </div>

          {/* Advertencias */}
          <div className="p-6 bg-white rounded-3 shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-[#fffbeb] rounded-2.5 flex items-center justify-center">
                <AlertCircle size={24} className="text-amber-500" />
              </div>
              <div>
                <p className="text-[0.875rem] text-gray-500 m-0">
                  Advertencias (&gt;90%)
                </p>
                <p className="text-8 font-bold text-amber-500 m-0">
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
            onClick={() => setFiltroNivel(nivel)} className="py-3 px-6 rounded-2 cursor-pointer text-[0.875rem] font-semibold transition"
          >
            {nivel === 'TODOS' ? 'Todas' : nivel === 'SOBREGIRO' ? 'Sobregiros' : 'Advertencias'}
          </button>
        ))}
      </div>

      {/* Lista de Alertas */}
      {alertasFiltradas.length === 0 ? (
        <div className="p-12 bg-white rounded-3 text-center">
          <CheckCircle2 size={64} className="text-[#10b981]" />
          <h3 className="text-gray-900 mb-2">
            ¡No hay alertas activas!
          </h3>
          <p className="text-gray-500 m-0">
            Todos los presupuestos están dentro de los límites normales
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {alertasFiltradas.map((alerta) => (
            <div
              key={alerta.presupuesto_id} className="p-6 rounded-3 transition"
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
                    <div className="inline-block py-1 px-3 text-white rounded-[6px] text-3 font-bold mb-2">
                      {alerta.nivel_alerta}
                    </div>
                    <h3 className="text-[1.125rem] font-semibold text-gray-900 m-0">
                      {alerta.centro_costo.nombre}
                    </h3>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-8 font-bold m-0 leading-[1]">
                    {alerta.porcentaje_ejecutado.toFixed(1)}%
                  </p>
                  <p className="text-3 text-gray-500 m-0">
                    Ejecutado
                  </p>
                </div>
              </div>

              {/* Mensaje */}
              <p className="text-[0.875rem] text-gray-700 mt-0 mr-0 mb-4 ml-0 leading-6">
                {alerta.mensaje}
              </p>

              {/* Detalles */}
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  <div>
                    <p className="text-3 text-gray-500 m-0">
                      Cuenta
                    </p>
                    <p className="text-[0.875rem] font-semibold text-gray-900 m-0">
                      {alerta.cuenta.codigo} - {alerta.cuenta.nombre}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-gray-500" />
                  <div>
                    <p className="text-3 text-gray-500 m-0">
                      Período
                    </p>
                    <p className="text-[0.875rem] font-semibold text-gray-900 m-0">
                      {alerta.periodo.descripcion}
                    </p>
                  </div>
                </div>
              </div>

              {/* Montos */}
              <div className="grid grid-cols-[repeat(auto-fit,_minmax(150px,_1fr))] gap-4 p-4 bg-white rounded-2">
                <div>
                  <p className="text-3 text-gray-500 mt-0 mr-0 mb-1 ml-0">
                    Presupuestado
                  </p>
                  <p className="text-4 font-semibold text-gray-900 m-0">
                    {formatCurrency(alerta.monto_presupuestado)}
                  </p>
                </div>
                <div>
                  <p className="text-3 text-gray-500 mt-0 mr-0 mb-1 ml-0">
                    Ejecutado
                  </p>
                  <p className="text-4 font-semibold m-0">
                    {formatCurrency(alerta.monto_ejecutado)}
                  </p>
                </div>
                <div>
                  <p className="text-3 text-gray-500 mt-0 mr-0 mb-1 ml-0">
                    Disponible
                  </p>
                  <p className="text-4 font-semibold m-0">
                    {formatCurrency(alerta.monto_disponible)}
                  </p>
                </div>
                {alerta.nivel_alerta === 'SOBREGIRO' && (
                  <div>
                    <p className="text-3 text-gray-500 mt-0 mr-0 mb-1 ml-0">
                      Excedente
                    </p>
                    <p className="text-4 font-semibold text-red-500 m-0">
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
        <div className="mt-8 p-4 bg-[#f9fafb] border rounded-2 text-3 text-gray-500 text-center">
          Última actualización: {new Date(resumen.fecha_generacion).toLocaleString('es-PE')}
        </div>
      )}
    </div>
  )
}
