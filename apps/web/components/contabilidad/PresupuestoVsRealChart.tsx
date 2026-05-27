'use client'

import { useState, useCallback, useEffect } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  CheckCircle,
  Loader2,
  Download
} from 'lucide-react'
import { exportToExcel, formatCurrencyForExcel, formatPercentageForExcel } from '@/lib/excel-export'
import PresupuestoEjecucionIndicator, { getEjecucionColor } from './PresupuestoEjecucionIndicator'
import PresupuestoEjecucionPorCentroChart from './PresupuestoEjecucionPorCentroChart'
import { useApi } from '@/hooks/use-api'

interface PresupuestoVsRealChartProps {
  periodoId: string
  centroId?: string
}

interface Cuenta {
  cuenta: {
    id: string
    codigo: string
    nombre: string
  }
  monto_presupuestado: number
  monto_ejecutado: number
  monto_comprometido: number
  monto_disponible: number
  porcentaje_ejecutado: number
  variacion: number
  variacion_porcentaje: number
  alerta: 'NORMAL' | 'ADVERTENCIA' | 'SOBREGIRO'
}

interface CentroCosto {
  centro_costo: {
    id: string
    codigo: string
    nombre: string
    descripcion?: string
  }
  cuentas: Cuenta[]
  totales: {
    presupuestado: number
    ejecutado: number
    comprometido: number
    disponible: number
    variacion: number
    porcentaje_ejecucion: number
    variacion_porcentaje: number
    alerta: string
  }
}

interface ComparacionData {
  periodo: {
    id: string
    anio: number
    mes: number
    estado: string
    descripcion: string
  }
  centros_costo: CentroCosto[]
  resumen_global: {
    total_presupuestado: number
    total_ejecutado: number
    total_comprometido: number
    total_disponible: number
    total_variacion: number
    porcentaje_ejecucion: number
    variacion_porcentaje: number
    total_centros: number
    total_cuentas: number
    alertas: {
      sobregiros: number
      advertencias: number
      normales: number
    }
  }
}

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizeComparacionData = (raw: any): ComparacionData => ({
  periodo: {
    id: raw?.periodo?.id || '',
    anio: toNumber(raw?.periodo?.anio) || new Date().getFullYear(),
    mes: toNumber(raw?.periodo?.mes) || new Date().getMonth() + 1,
    estado: raw?.periodo?.estado || 'N/A',
    descripcion: raw?.periodo?.descripcion || 'Periodo no disponible',
  },
  centros_costo: Array.isArray(raw?.centros_costo)
    ? raw.centros_costo.map((centro: any, index: number) => ({
        centro_costo: {
          id: centro?.centro_costo?.id || `centro-${index}`,
          codigo: centro?.centro_costo?.codigo || 'N/A',
          nombre: centro?.centro_costo?.nombre || 'Centro de costo',
          descripcion: centro?.centro_costo?.descripcion || '',
        },
        cuentas: Array.isArray(centro?.cuentas)
          ? centro.cuentas.map((cuenta: any) => ({
              cuenta: {
                id: cuenta?.cuenta?.id || '',
                codigo: cuenta?.cuenta?.codigo || 'N/A',
                nombre: cuenta?.cuenta?.nombre || 'Cuenta',
              },
              monto_presupuestado: toNumber(cuenta?.monto_presupuestado),
              monto_ejecutado: toNumber(cuenta?.monto_ejecutado),
              monto_comprometido: toNumber(cuenta?.monto_comprometido),
              monto_disponible: toNumber(cuenta?.monto_disponible),
              porcentaje_ejecutado: toNumber(cuenta?.porcentaje_ejecutado),
              variacion: toNumber(cuenta?.variacion),
              variacion_porcentaje: toNumber(cuenta?.variacion_porcentaje),
              alerta: cuenta?.alerta || 'NORMAL',
            }))
          : [],
        totales: {
          presupuestado: toNumber(centro?.totales?.presupuestado),
          ejecutado: toNumber(centro?.totales?.ejecutado),
          comprometido: toNumber(centro?.totales?.comprometido),
          disponible: toNumber(centro?.totales?.disponible),
          variacion: toNumber(centro?.totales?.variacion),
          porcentaje_ejecucion: toNumber(centro?.totales?.porcentaje_ejecucion),
          variacion_porcentaje: toNumber(centro?.totales?.variacion_porcentaje),
          alerta: centro?.totales?.alerta || 'NORMAL',
        },
      }))
    : [],
  resumen_global: {
    total_presupuestado: toNumber(raw?.resumen_global?.total_presupuestado),
    total_ejecutado: toNumber(raw?.resumen_global?.total_ejecutado),
    total_comprometido: toNumber(raw?.resumen_global?.total_comprometido),
    total_disponible: toNumber(raw?.resumen_global?.total_disponible),
    total_variacion: toNumber(raw?.resumen_global?.total_variacion),
    porcentaje_ejecucion: toNumber(raw?.resumen_global?.porcentaje_ejecucion),
    variacion_porcentaje: toNumber(raw?.resumen_global?.variacion_porcentaje),
    total_centros: toNumber(raw?.resumen_global?.total_centros),
    total_cuentas: toNumber(raw?.resumen_global?.total_cuentas),
    alertas: {
      sobregiros: toNumber(raw?.resumen_global?.alertas?.sobregiros),
      advertencias: toNumber(raw?.resumen_global?.alertas?.advertencias),
      normales: toNumber(raw?.resumen_global?.alertas?.normales),
    },
  },
})

export default function PresupuestoVsRealChart({ periodoId, centroId }: PresupuestoVsRealChartProps) {
  const [data, setData] = useState<ComparacionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCentros, setExpandedCentros] = useState<Set<string>>(new Set())
  const { apiCall } = useApi<any>({ retries: 2, timeoutMs: 12000, showErrorToast: false, throwOnError: true })

  const fetchComparacion = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await apiCall(`/contabilidad/presupuestos/comparacion/${periodoId}`)
      setData(normalizeComparacionData(result?.data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [apiCall, periodoId])

  useEffect(() => {
    fetchComparacion()
  }, [fetchComparacion])

  useEffect(() => {
    if (centroId && data) {
      setExpandedCentros(new Set([centroId]))
    }
  }, [centroId, data])

  const toggleCentro = (centroId: string) => {
    const newExpanded = new Set(expandedCentros)
    if (newExpanded.has(centroId)) {
      newExpanded.delete(centroId)
    } else {
      newExpanded.add(centroId)
    }
    setExpandedCentros(newExpanded)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2
    }).format(toNumber(amount))
  }

  const getAlertaLabel = (alerta: string) => {
    switch (alerta) {
      case 'SOBREGIRO':
        return 'Sobregiro'
      case 'ADVERTENCIA':
        return 'Advertencia'
      default:
        return 'Normal'
    }
  }

  const handleExportToExcel = () => {
    if (!data) return

    // Prepare data for export
    const sheets = []

    // Sheet 1: Resumen Global
    const resumenData = [{
      'Concepto': 'Total Presupuestado',
      'Monto': formatCurrencyForExcel(data.resumen_global.total_presupuestado)
    }, {
      'Concepto': 'Total Ejecutado',
      'Monto': formatCurrencyForExcel(data.resumen_global.total_ejecutado)
    }, {
      'Concepto': 'Total Comprometido',
      'Monto': formatCurrencyForExcel(data.resumen_global.total_comprometido)
    }, {
      'Concepto': 'Total Disponible',
      'Monto': formatCurrencyForExcel(data.resumen_global.total_disponible)
    }, {
      'Concepto': 'Total Variación',
      'Monto': formatCurrencyForExcel(data.resumen_global.total_variacion)
    }, {
      'Concepto': '% Ejecución',
      'Monto': formatPercentageForExcel(data.resumen_global.porcentaje_ejecucion)
    }, {
      'Concepto': 'Total Centros de Costo',
      'Monto': data.resumen_global.total_centros.toString()
    }, {
      'Concepto': 'Total Cuentas',
      'Monto': data.resumen_global.total_cuentas.toString()
    }, {
      'Concepto': 'Alertas - Sobregiros',
      'Monto': data.resumen_global.alertas.sobregiros.toString()
    }, {
      'Concepto': 'Alertas - Advertencias',
      'Monto': data.resumen_global.alertas.advertencias.toString()
    }, {
      'Concepto': 'Alertas - Normales',
      'Monto': data.resumen_global.alertas.normales.toString()
    }]

    sheets.push({
      name: 'Resumen Global',
      data: resumenData,
      columns: [
        { header: 'Concepto', key: 'Concepto', width: 30 },
        { header: 'Monto', key: 'Monto', width: 20 }
      ]
    })

    // Sheet 2: Detalle por Centro de Costo
    const detalleData: any[] = []
    data.centros_costo.forEach(centro => {
      centro.cuentas.forEach(cuenta => {
        detalleData.push({
          'Centro de Costo': `${centro.centro_costo.codigo} - ${centro.centro_costo.nombre}`,
          'Código Cuenta': cuenta.cuenta.codigo,
          'Nombre Cuenta': cuenta.cuenta.nombre,
          'Presupuestado': formatCurrencyForExcel(cuenta.monto_presupuestado),
          'Ejecutado': formatCurrencyForExcel(cuenta.monto_ejecutado),
          'Comprometido': formatCurrencyForExcel(cuenta.monto_comprometido),
          'Disponible': formatCurrencyForExcel(cuenta.monto_disponible),
          '% Ejecución': formatPercentageForExcel(cuenta.porcentaje_ejecutado),
          'Variación': formatCurrencyForExcel(cuenta.variacion),
          '% Variación': formatPercentageForExcel(cuenta.variacion_porcentaje),
          'Estado': getAlertaLabel(cuenta.alerta)
        })
      })
    })

    sheets.push({
      name: 'Detalle por Cuenta',
      data: detalleData,
      columns: [
        { header: 'Centro de Costo', key: 'Centro de Costo', width: 35 },
        { header: 'Código Cuenta', key: 'Código Cuenta', width: 15 },
        { header: 'Nombre Cuenta', key: 'Nombre Cuenta', width: 35 },
        { header: 'Presupuestado', key: 'Presupuestado', width: 18 },
        { header: 'Ejecutado', key: 'Ejecutado', width: 18 },
        { header: 'Comprometido', key: 'Comprometido', width: 18 },
        { header: 'Disponible', key: 'Disponible', width: 18 },
        { header: '% Ejecución', key: '% Ejecución', width: 15 },
        { header: 'Variación', key: 'Variación', width: 18 },
        { header: '% Variación', key: '% Variación', width: 15 },
        { header: 'Estado', key: 'Estado', width: 15 }
      ]
    })

    // Sheet 3: Totales por Centro de Costo
    const totalesCentrosData = data.centros_costo.map(centro => ({
      'Código': centro.centro_costo.codigo,
      'Nombre': centro.centro_costo.nombre,
      'Descripción': centro.centro_costo.descripcion || '',
      'Presupuestado': formatCurrencyForExcel(centro.totales.presupuestado),
      'Ejecutado': formatCurrencyForExcel(centro.totales.ejecutado),
      'Comprometido': formatCurrencyForExcel(centro.totales.comprometido),
      'Disponible': formatCurrencyForExcel(centro.totales.disponible),
      '% Ejecución': formatPercentageForExcel(centro.totales.porcentaje_ejecucion),
      'Variación': formatCurrencyForExcel(centro.totales.variacion),
      '% Variación': formatPercentageForExcel(centro.totales.variacion_porcentaje),
      'Estado': getAlertaLabel(centro.totales.alerta)
    }))

    sheets.push({
      name: 'Totales por Centro',
      data: totalesCentrosData,
      columns: [
        { header: 'Código', key: 'Código', width: 15 },
        { header: 'Nombre', key: 'Nombre', width: 30 },
        { header: 'Descripción', key: 'Descripción', width: 35 },
        { header: 'Presupuestado', key: 'Presupuestado', width: 18 },
        { header: 'Ejecutado', key: 'Ejecutado', width: 18 },
        { header: 'Comprometido', key: 'Comprometido', width: 18 },
        { header: 'Disponible', key: 'Disponible', width: 18 },
        { header: '% Ejecución', key: '% Ejecución', width: 15 },
        { header: 'Variación', key: 'Variación', width: 18 },
        { header: '% Variación', key: '% Variación', width: 15 },
        { header: 'Estado', key: 'Estado', width: 15 }
      ]
    })

    // Generate filename with period info
    const filename = `Presupuesto_vs_Real_${data.periodo.anio}_${String(data.periodo.mes).padStart(2, '0')}.xlsx`

    // Export to Excel
    exportToExcel(sheets, filename)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-white rounded-3 shadow">
        <Loader2 size={24} className="text-blue-500" />
        <span className="ml-3 text-gray-500">Cargando comparación...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 bg-[#fef2f2] border rounded-3 text-red-800">
        <p className="m-0 font-semibold">Error al cargar la comparación</p>
        <p className="mt-2 mr-0 mb-0 ml-0 text-[0.875rem]">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8 bg-[#f9fafb] border rounded-3 text-center text-gray-500">
        <p className="m-0">No hay datos disponibles para este período</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header con información del período */}
      <div className="bg-white p-6 rounded-3 shadow">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="m-0 text-6 font-bold text-gray-900">
              Comparación Presupuesto vs Real
            </h2>
            <p className="mt-2 mr-0 mb-0 ml-0 text-gray-500">
              Período: {data.periodo.descripcion} ({data.periodo.estado})
            </p>
          </div>
          <button
            onClick={handleExportToExcel} className="py-3 px-6 rounded-2 border bg-[#10b981] text-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-semibold transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#059669'
              e.currentTarget.style.borderColor = '#059669'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#10b981'
              e.currentTarget.style.borderColor = '#10b981'
            }}
          >
            <Download size={16} />
            Exportar a Excel
          </button>
        </div>
      </div>

      {/* Resumen Global */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
        <div className="bg-white p-6 rounded-3 shadow">
          <p className="m-0 text-[0.875rem] text-gray-500 font-semibold">
            Total Presupuestado
          </p>
          <p className="mt-2 mr-0 mb-0 ml-0 text-6 font-bold text-gray-900">
            {formatCurrency(data.resumen_global.total_presupuestado)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-3 shadow">
          <p className="m-0 text-[0.875rem] text-gray-500 font-semibold">
            Total Ejecutado
          </p>
          <p className="mt-2 mr-0 mb-0 ml-0 text-6 font-bold text-gray-900">
            {formatCurrency(data.resumen_global.total_ejecutado)}
          </p>
          <div className="mt-2 flex items-center gap-1 text-[0.875rem]">
            {data.resumen_global.porcentaje_ejecucion > 100 ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
            {data.resumen_global.porcentaje_ejecucion.toFixed(2)}%
          </div>
        </div>

        <div className="bg-white p-6 rounded-3 shadow">
          <p className="m-0 text-[0.875rem] text-gray-500 font-semibold">
            Total Disponible
          </p>
          <p className="mt-2 mr-0 mb-0 ml-0 text-6 font-bold">
            {formatCurrency(data.resumen_global.total_disponible)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-3 shadow">
          <p className="m-0 text-[0.875rem] text-gray-500 font-semibold">
            Alertas
          </p>
          <div className="mt-2 flex gap-4 text-[0.875rem]">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span>{data.resumen_global.alertas.sobregiros}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{data.resumen_global.alertas.advertencias}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span>{data.resumen_global.alertas.normales}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de Ejecución por Centro */}
      {data.centros_costo.length > 0 && (
        <div className="bg-white p-6 rounded-3 shadow">
          <h3 className="mt-0 mr-0 mb-6 ml-0 text-[1.125rem] font-semibold text-gray-900">
            Ejecución Presupuestal por Centro de Costo
          </h3>
          <PresupuestoEjecucionPorCentroChart centros={data.centros_costo} />
        </div>
      )}

      {/* Detalle por Centro de Costo */}
      <div className="flex flex-col gap-4">
        {data.centros_costo.map((centro) => {
          const isExpanded = expandedCentros.has(centro.centro_costo.id)
          
          return (
            <div
              key={centro.centro_costo.id} className="bg-white rounded-3 shadow overflow-hidden"
            >
              {/* Header del Centro de Costo */}
              <button
                onClick={() => toggleCentro(centro.centro_costo.id)} className="w-[100%] p-6 bg-white border-0 cursor-pointer flex justify-between items-center text-left"
              >
                <div className="flex-[1]">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="m-0 text-[1.125rem] font-semibold text-gray-900">
                      {centro.centro_costo.codigo} - {centro.centro_costo.nombre}
                    </h3>
                    <PresupuestoEjecucionIndicator
                      porcentajeEjecutado={centro.totales.porcentaje_ejecucion}
                      size="sm"
                      showLabel={true}
                      showPercentage={false}
                      showProgressBar={false}
                    />
                  </div>
                  <div className="flex gap-8 text-[0.875rem] text-gray-500">
                    <span>Presupuestado: {formatCurrency(centro.totales.presupuestado)}</span>
                    <span>Ejecutado: {formatCurrency(centro.totales.ejecutado)}</span>
                    <span>Disponible: {formatCurrency(centro.totales.disponible)}</span>
                    <span className="font-semibold">
                      {centro.totales.porcentaje_ejecucion.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-[4px] bg-[#f3f4f6] transition">
                  ▼
                </div>
              </button>

              {/* Detalle de Cuentas */}
              {isExpanded && (
                <div className="border-t">
                  <table className="w-[100%]">
                    <thead>
                      <tr className="bg-[#f9fafb]">
                        <th className="py-3 px-6 text-left text-3 font-semibold text-gray-500">
                          Cuenta
                        </th>
                        <th className="py-3 px-6 text-right text-3 font-semibold text-gray-500">
                          Presupuestado
                        </th>
                        <th className="py-3 px-6 text-right text-3 font-semibold text-gray-500">
                          Ejecutado
                        </th>
                        <th className="py-3 px-6 text-right text-3 font-semibold text-gray-500">
                          Disponible
                        </th>
                        <th className="py-3 px-6 text-right text-3 font-semibold text-gray-500">
                          % Ejecución
                        </th>
                        <th className="py-3 px-6 text-center text-3 font-semibold text-gray-500">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {centro.cuentas.map((cuenta, idx) => (
                        <tr 
                          key={idx} className="border-t"
                        >
                          <td className="py-4 px-6">
                            <div className="text-[0.875rem] font-semibold text-gray-900">
                              {cuenta.cuenta.codigo}
                            </div>
                            <div className="text-3 text-gray-500 mt-1">
                              {cuenta.cuenta.nombre}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right text-[0.875rem] text-gray-900">
                            {formatCurrency(cuenta.monto_presupuestado)}
                          </td>
                          <td className="py-4 px-6 text-right text-[0.875rem] text-gray-900">
                            {formatCurrency(cuenta.monto_ejecutado)}
                          </td>
                          <td className="py-4 px-6 text-right text-[0.875rem]">
                            {formatCurrency(cuenta.monto_disponible)}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="flex-[1] max-w-[100px] h-2 bg-[#e5e7eb] rounded-[4px] overflow-hidden">
                                <div className="h-[100%] transition" />
                              </div>
                              <span className="text-[0.875rem] font-semibold min-w-[60px] text-right">
                                {cuenta.porcentaje_ejecutado.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <PresupuestoEjecucionIndicator
                              porcentajeEjecutado={cuenta.porcentaje_ejecutado}
                              size="sm"
                              showLabel={true}
                              showPercentage={false}
                              showProgressBar={false}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Mensaje si no hay centros */}
      {data.centros_costo.length === 0 && (
        <div className="p-12 bg-white rounded-3 text-center text-gray-500">
          <p className="m-0 text-4">
            No hay presupuestos configurados para este período
          </p>
          <p className="mt-2 mr-0 mb-0 ml-0 text-[0.875rem]">
            Configure presupuestos por centro de costo para ver la comparación
          </p>
        </div>
      )}
    </div>
  )
}
