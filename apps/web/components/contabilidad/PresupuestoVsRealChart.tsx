'use client'

import { useState, useEffect } from 'react'
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

export default function PresupuestoVsRealChart({ periodoId, centroId }: PresupuestoVsRealChartProps) {
  const [data, setData] = useState<ComparacionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCentros, setExpandedCentros] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchComparacion()
    
    // Auto-expand the specified centro if provided
    if (centroId && data) {
      setExpandedCentros(new Set([centroId]))
    }
  }, [periodoId, centroId])

  const fetchComparacion = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/contabilidad/presupuestos/comparacion/${periodoId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Error al obtener la comparación')
      }

      const result = await response.json()
      setData(result.data)
    } catch (err) {
      console.error('Error fetching comparación:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

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
    }).format(amount)
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
        <span style={{ marginLeft: '0.75rem', color: '#6b7280' }}>Cargando comparación...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        padding: '2rem',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '12px',
        color: '#991b1b'
      }}>
        <p style={{ margin: 0, fontWeight: '600' }}>Error al cargar la comparación</p>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{
        padding: '2rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        textAlign: 'center',
        color: '#6b7280'
      }}>
        <p style={{ margin: 0 }}>No hay datos disponibles para este período</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header con información del período */}
      <div style={{
        background: 'white',
        padding: '1.5rem',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
              Comparación Presupuesto vs Real
            </h2>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280' }}>
              Período: {data.periodo.descripcion} ({data.periodo.estado})
            </p>
          </div>
          <button
            onClick={handleExportToExcel}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid #10b981',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
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
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>
            Total Presupuestado
          </p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
            {formatCurrency(data.resumen_global.total_presupuestado)}
          </p>
        </div>

        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>
            Total Ejecutado
          </p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
            {formatCurrency(data.resumen_global.total_ejecutado)}
          </p>
          <div style={{ 
            marginTop: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.875rem',
            color: data.resumen_global.porcentaje_ejecucion > 100 ? '#ef4444' : '#10b981'
          }}>
            {data.resumen_global.porcentaje_ejecucion > 100 ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
            {data.resumen_global.porcentaje_ejecucion.toFixed(2)}%
          </div>
        </div>

        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>
            Total Disponible
          </p>
          <p style={{ 
            margin: '0.5rem 0 0 0', 
            fontSize: '1.5rem', 
            fontWeight: '700',
            color: data.resumen_global.total_disponible < 0 ? '#ef4444' : '#111827'
          }}>
            {formatCurrency(data.resumen_global.total_disponible)}
          </p>
        </div>

        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>
            Alertas
          </p>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
              <span>{data.resumen_global.alertas.sobregiros}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
              <span>{data.resumen_global.alertas.advertencias}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              <span>{data.resumen_global.alertas.normales}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de Ejecución por Centro */}
      {data.centros_costo.length > 0 && (
        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ 
            margin: '0 0 1.5rem 0', 
            fontSize: '1.125rem', 
            fontWeight: '600', 
            color: '#111827' 
          }}>
            Ejecución Presupuestal por Centro de Costo
          </h3>
          <PresupuestoEjecucionPorCentroChart centros={data.centros_costo} />
        </div>
      )}

      {/* Detalle por Centro de Costo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {data.centros_costo.map((centro) => {
          const isExpanded = expandedCentros.has(centro.centro_costo.id)
          
          return (
            <div
              key={centro.centro_costo.id}
              style={{
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'hidden'
              }}
            >
              {/* Header del Centro de Costo */}
              <button
                onClick={() => toggleCentro(centro.centro_costo.id)}
                style={{
                  width: '100%',
                  padding: '1.5rem',
                  background: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
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
                  <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    <span>Presupuestado: {formatCurrency(centro.totales.presupuestado)}</span>
                    <span>Ejecutado: {formatCurrency(centro.totales.ejecutado)}</span>
                    <span>Disponible: {formatCurrency(centro.totales.disponible)}</span>
                    <span style={{ 
                      color: centro.totales.porcentaje_ejecucion > 100 ? '#ef4444' : '#10b981',
                      fontWeight: '600'
                    }}>
                      {centro.totales.porcentaje_ejecucion.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div style={{
                  padding: '0.5rem',
                  borderRadius: '4px',
                  background: '#f3f4f6',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease'
                }}>
                  ▼
                </div>
              </button>

              {/* Detalle de Cuentas */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #e5e7eb' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                          Cuenta
                        </th>
                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                          Presupuestado
                        </th>
                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                          Ejecutado
                        </th>
                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                          Disponible
                        </th>
                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                          % Ejecución
                        </th>
                        <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {centro.cuentas.map((cuenta, idx) => (
                        <tr 
                          key={idx}
                          style={{ 
                            borderTop: '1px solid #f3f4f6',
                            background: idx % 2 === 0 ? 'white' : '#fafafa'
                          }}
                        >
                          <td style={{ padding: '1rem 1.5rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                              {cuenta.cuenta.codigo}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                              {cuenta.cuenta.nombre}
                            </div>
                          </td>
                          <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {formatCurrency(cuenta.monto_presupuestado)}
                          </td>
                          <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {formatCurrency(cuenta.monto_ejecutado)}
                          </td>
                          <td style={{ 
                            padding: '1rem 1.5rem', 
                            textAlign: 'right', 
                            fontSize: '0.875rem',
                            color: cuenta.monto_disponible < 0 ? '#ef4444' : '#111827',
                            fontWeight: cuenta.monto_disponible < 0 ? '600' : 'normal'
                          }}>
                            {formatCurrency(cuenta.monto_disponible)}
                          </td>
                          <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <div style={{
                                flex: 1,
                                maxWidth: '100px',
                                height: '8px',
                                background: '#e5e7eb',
                                borderRadius: '4px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${Math.min(cuenta.porcentaje_ejecutado, 100)}%`,
                                  height: '100%',
                                  background: getEjecucionColor(cuenta.porcentaje_ejecutado),
                                  transition: 'width 0.3s ease'
                                }} />
                              </div>
                              <span style={{ 
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                color: getEjecucionColor(cuenta.porcentaje_ejecutado),
                                minWidth: '60px',
                                textAlign: 'right'
                              }}>
                                {cuenta.porcentaje_ejecutado.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
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
        <div style={{
          padding: '3rem',
          background: 'white',
          borderRadius: '12px',
          textAlign: 'center',
          color: '#6b7280'
        }}>
          <p style={{ margin: 0, fontSize: '1rem' }}>
            No hay presupuestos configurados para este período
          </p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>
            Configure presupuestos por centro de costo para ver la comparación
          </p>
        </div>
      )}
    </div>
  )
}
