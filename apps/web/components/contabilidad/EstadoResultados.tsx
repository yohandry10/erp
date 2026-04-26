'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { Download, AlertCircle, TrendingUp, TrendingDown, DollarSign, FileText } from 'lucide-react'
import { IngresosVsGastosChart } from './IngresosVsGastosChart'
import { exportToExcel, formatCurrencyForExcel, formatPercentageForExcel } from '@/lib/excel-export'
import { exportEstadoResultadosToPDF } from '@/lib/pdf-export'

interface EstadoResultadosData {
  ingresos: {
    ventas: number
    otros_ingresos: number
    total_ingresos: number
  }
  costos: {
    costo_ventas: number
    utilidad_bruta: number
  }
  gastos: {
    gastos_administrativos: number
    gastos_ventas: number
    gastos_financieros: number
    total_gastos: number
  }
  utilidad_neta: number
}

interface EstadoResultadosProps {
  anio: number
  mes: number
  showComparison?: boolean
}

export function EstadoResultados({ anio, mes, showComparison = false }: EstadoResultadosProps) {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<EstadoResultadosData | null>(null)
  const [previousData, setPreviousData] = useState<EstadoResultadosData | null>(null)

  useEffect(() => {
    loadData()
  }, [anio, mes, showComparison])

  const getPreviousPeriod = () => {
    if (mes === 1) {
      return { anio: anio - 1, mes: 12 }
    }
    return { anio, mes: mes - 1 }
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await get(`/api/contabilidad/estados/estado-resultados?anio=${anio}&mes=${mes}`)
      
      if (response?.success && response.data) {
        setData(response.data)
      } else {
        setError('No se pudieron cargar los datos')
      }

      // Cargar datos del período anterior si showComparison está activado
      if (showComparison) {
        const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()
        const prevResponse = await get(`/api/contabilidad/estados/estado-resultados?anio=${prevAnio}&mes=${prevMes}`)
        
        if (prevResponse?.success && prevResponse.data) {
          setPreviousData(prevResponse.data)
        } else {
          setPreviousData(null)
        }
      } else {
        setPreviousData(null)
      }
    } catch (err: any) {
      console.error('Error loading estado resultados:', err)
      setError(err.message || 'Error al cargar el estado de resultados')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const formatPercentage = (value: number, total: number) => {
    if (total === 0) return '0.00%'
    return ((value / total) * 100).toFixed(2) + '%'
  }

  const calculateVariation = (current: number, previous: number) => {
    if (previous === 0) return { absolute: current, percentage: current > 0 ? 100 : 0 }
    const absolute = current - previous
    const percentage = ((absolute / Math.abs(previous)) * 100)
    return { absolute, percentage }
  }

  const renderVariation = (current: number, previous: number) => {
    const { absolute, percentage } = calculateVariation(current, previous)
    const isPositive = absolute >= 0
    
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem',
        fontSize: '0.75rem',
        color: isPositive ? 'var(--emerald-600)' : 'var(--red-600)',
        fontWeight: '600'
      }}>
        {isPositive ? '↑' : '↓'}
        {formatCurrency(Math.abs(absolute))} ({Math.abs(percentage).toFixed(1)}%)
      </div>
    )
  }

  const handleExportExcel = () => {
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    const margenBruto = data.ingresos.total_ingresos > 0 
      ? (data.costos.utilidad_bruta / data.ingresos.total_ingresos) * 100 
      : 0
    const margenNeto = data.ingresos.total_ingresos > 0 
      ? (data.utilidad_neta / data.ingresos.total_ingresos) * 100 
      : 0

    const exportData = [
      { Concepto: 'INGRESOS', Monto: '', Porcentaje: '' },
      { Concepto: 'Ventas', Monto: formatCurrencyForExcel(data.ingresos.ventas), Porcentaje: '' },
      { Concepto: 'Otros Ingresos', Monto: formatCurrencyForExcel(data.ingresos.otros_ingresos), Porcentaje: '' },
      { Concepto: 'Total Ingresos', Monto: formatCurrencyForExcel(data.ingresos.total_ingresos), Porcentaje: '100.00%' },
      { Concepto: '', Monto: '', Porcentaje: '' },
      { Concepto: 'COSTOS', Monto: '', Porcentaje: '' },
      { Concepto: 'Costo de Ventas', Monto: `(${formatCurrencyForExcel(data.costos.costo_ventas)})`, Porcentaje: formatPercentageForExcel((data.costos.costo_ventas / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Utilidad Bruta', Monto: formatCurrencyForExcel(data.costos.utilidad_bruta), Porcentaje: formatPercentageForExcel(margenBruto) },
      { Concepto: '', Monto: '', Porcentaje: '' },
      { Concepto: 'GASTOS OPERATIVOS', Monto: '', Porcentaje: '' },
      { Concepto: 'Gastos Administrativos', Monto: `(${formatCurrencyForExcel(data.gastos.gastos_administrativos)})`, Porcentaje: formatPercentageForExcel((data.gastos.gastos_administrativos / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Gastos de Ventas', Monto: `(${formatCurrencyForExcel(data.gastos.gastos_ventas)})`, Porcentaje: formatPercentageForExcel((data.gastos.gastos_ventas / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Gastos Financieros', Monto: `(${formatCurrencyForExcel(data.gastos.gastos_financieros)})`, Porcentaje: formatPercentageForExcel((data.gastos.gastos_financieros / data.ingresos.total_ingresos) * 100) },
      { Concepto: 'Total Gastos', Monto: `(${formatCurrencyForExcel(data.gastos.total_gastos)})`, Porcentaje: formatPercentageForExcel((data.gastos.total_gastos / data.ingresos.total_ingresos) * 100) },
      { Concepto: '', Monto: '', Porcentaje: '' },
      { Concepto: 'UTILIDAD NETA', Monto: formatCurrencyForExcel(data.utilidad_neta), Porcentaje: formatPercentageForExcel(margenNeto) }
    ]

    exportToExcel(
      [
        {
          name: 'Estado de Resultados',
          data: exportData,
          columns: [
            { header: 'Concepto', key: 'Concepto', width: 35 },
            { header: 'Monto', key: 'Monto', width: 20 },
            { header: '% sobre Ingresos', key: 'Porcentaje', width: 18 }
          ]
        }
      ],
      `Estado_Resultados_${anio}_${String(mes).padStart(2, '0')}.xlsx`
    )
  }

  const handleExportPDF = () => {
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    exportEstadoResultadosToPDF(data, anio, mes)
  }

  if (loading) {
    return (
      <div className="activity-card">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando Estado de Resultados...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="activity-card">
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--primary-400)' }}>
          <p>No hay datos disponibles para el período seleccionado</p>
        </div>
      </div>
    )
  }

  const margenBruto = data.ingresos.total_ingresos > 0 
    ? (data.costos.utilidad_bruta / data.ingresos.total_ingresos) * 100 
    : 0
  const margenNeto = data.ingresos.total_ingresos > 0 
    ? (data.utilidad_neta / data.ingresos.total_ingresos) * 100 
    : 0

  const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()

  const renderRow = (label: string, current: number, isNegative: boolean = false) => {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', alignItems: 'center' }}>
        <span style={{ color: 'var(--primary-700)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontWeight: '600', color: isNegative ? 'var(--red-600)' : 'var(--primary-800)' }}>
            {isNegative ? `(${formatCurrency(current)})` : formatCurrency(current)}
          </span>
          {showComparison && previousData && (
            <div style={{ minWidth: '150px', textAlign: 'right' }}>
              {renderVariation(current, getPreviousValue(label))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const getPreviousValue = (label: string): number => {
    if (!previousData) return 0
    
    switch (label) {
      case 'Ventas': return previousData.ingresos.ventas
      case 'Otros Ingresos': return previousData.ingresos.otros_ingresos
      case 'Total Ingresos': return previousData.ingresos.total_ingresos
      case 'Costo de Ventas': return previousData.costos.costo_ventas
      case 'Utilidad Bruta': return previousData.costos.utilidad_bruta
      case 'Gastos Administrativos': return previousData.gastos.gastos_administrativos
      case 'Gastos de Ventas': return previousData.gastos.gastos_ventas
      case 'Gastos Financieros': return previousData.gastos.gastos_financieros
      case 'Total Gastos': return previousData.gastos.total_gastos
      case 'Utilidad Neta': return previousData.utilidad_neta
      default: return 0
    }
  }

  return (
    <div className="activity-card">
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid var(--primary-100)'
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Estado de Resultados (P&L)
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', marginTop: '0.25rem' }}>
            Período: {anio} - {String(mes).padStart(2, '0')}
            {showComparison && ` vs ${prevAnio} - ${String(prevMes).padStart(2, '0')}`}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleExportExcel}
            className="secondary-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <Download size={16} />
            Exportar a Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="secondary-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <FileText size={16} />
            Exportar a PDF
          </button>
        </div>
      </div>

      {error && (
        <div style={{ 
          padding: '1rem', 
          background: 'var(--red-50)', 
          borderRadius: '8px',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertCircle size={20} style={{ color: 'var(--red-600)' }} />
          <p style={{ fontSize: '0.875rem', color: 'var(--red-700)', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Estado de Resultados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* INGRESOS */}
        <div>
          <div style={{ 
            padding: '0.75rem 1rem', 
            background: 'var(--emerald-100)', 
            borderRadius: '8px 8px 0 0',
            fontWeight: '700',
            fontSize: '0.875rem',
            color: 'var(--emerald-800)'
          }}>
            INGRESOS
          </div>
          <div style={{ padding: '1rem', border: '1px solid var(--primary-200)', borderTop: 'none' }}>
            {renderRow('Ventas', data.ingresos.ventas)}
            {renderRow('Otros Ingresos', data.ingresos.otros_ingresos)}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '0.75rem 0',
              marginTop: '0.5rem',
              borderTop: '2px solid var(--primary-300)',
              fontWeight: '700',
              fontSize: '1rem',
              alignItems: 'center'
            }}>
              <span style={{ color: 'var(--emerald-700)' }}>Total Ingresos</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: 'var(--emerald-700)' }}>
                  {formatCurrency(data.ingresos.total_ingresos)}
                </span>
                {showComparison && previousData && (
                  <div style={{ minWidth: '150px', textAlign: 'right' }}>
                    {renderVariation(data.ingresos.total_ingresos, previousData.ingresos.total_ingresos)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* COSTOS */}
        <div>
          <div style={{ 
            padding: '0.75rem 1rem', 
            background: 'var(--amber-100)', 
            borderRadius: '8px 8px 0 0',
            fontWeight: '700',
            fontSize: '0.875rem',
            color: 'var(--amber-800)'
          }}>
            COSTOS
          </div>
          <div style={{ padding: '1rem', border: '1px solid var(--primary-200)', borderTop: 'none' }}>
            {renderRow('Costo de Ventas', data.costos.costo_ventas, true)}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '0.75rem 0',
              marginTop: '0.5rem',
              borderTop: '2px solid var(--primary-300)',
              fontWeight: '700',
              fontSize: '1rem',
              alignItems: 'center'
            }}>
              <span style={{ color: 'var(--primary-800)' }}>
                Utilidad Bruta
                <span style={{ 
                  marginLeft: '0.5rem', 
                  fontSize: '0.75rem', 
                  fontWeight: '600',
                  color: 'var(--primary-600)'
                }}>
                  ({margenBruto.toFixed(2)}%)
                </span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: data.costos.utilidad_bruta >= 0 ? 'var(--emerald-700)' : 'var(--red-700)' }}>
                  {formatCurrency(data.costos.utilidad_bruta)}
                </span>
                {showComparison && previousData && (
                  <div style={{ minWidth: '150px', textAlign: 'right' }}>
                    {renderVariation(data.costos.utilidad_bruta, previousData.costos.utilidad_bruta)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* GASTOS */}
        <div>
          <div style={{ 
            padding: '0.75rem 1rem', 
            background: 'var(--red-100)', 
            borderRadius: '8px 8px 0 0',
            fontWeight: '700',
            fontSize: '0.875rem',
            color: 'var(--red-800)'
          }}>
            GASTOS OPERATIVOS
          </div>
          <div style={{ padding: '1rem', border: '1px solid var(--primary-200)', borderTop: 'none' }}>
            {renderRow('Gastos Administrativos', data.gastos.gastos_administrativos, true)}
            {renderRow('Gastos de Ventas', data.gastos.gastos_ventas, true)}
            {renderRow('Gastos Financieros', data.gastos.gastos_financieros, true)}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '0.75rem 0',
              marginTop: '0.5rem',
              borderTop: '2px solid var(--primary-300)',
              fontWeight: '700',
              fontSize: '1rem',
              alignItems: 'center'
            }}>
              <span style={{ color: 'var(--red-700)' }}>Total Gastos</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: 'var(--red-700)' }}>
                  ({formatCurrency(data.gastos.total_gastos)})
                </span>
                {showComparison && previousData && (
                  <div style={{ minWidth: '150px', textAlign: 'right' }}>
                    {renderVariation(data.gastos.total_gastos, previousData.gastos.total_gastos)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* UTILIDAD NETA */}
        <div style={{ 
          padding: '1.5rem', 
          background: data.utilidad_neta >= 0 ? 'var(--emerald-50)' : 'var(--red-50)',
          borderRadius: '8px',
          border: `2px solid ${data.utilidad_neta >= 0 ? 'var(--emerald-300)' : 'var(--red-300)'}`
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '600', 
                color: 'var(--primary-600)',
                marginBottom: '0.5rem'
              }}>
                UTILIDAD NETA
              </div>
              <div style={{ 
                fontSize: '1.75rem', 
                fontWeight: '700', 
                color: data.utilidad_neta >= 0 ? 'var(--emerald-700)' : 'var(--red-700)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                {data.utilidad_neta >= 0 ? (
                  <TrendingUp size={32} />
                ) : (
                  <TrendingDown size={32} />
                )}
                {formatCurrency(data.utilidad_neta)}
              </div>
              {showComparison && previousData && (
                <div style={{ marginTop: '0.75rem' }}>
                  {renderVariation(data.utilidad_neta, previousData.utilidad_neta)}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '600', 
                color: 'var(--primary-600)',
                marginBottom: '0.5rem'
              }}>
                MARGEN NETO
              </div>
              <div style={{ 
                fontSize: '1.5rem', 
                fontWeight: '700', 
                color: data.utilidad_neta >= 0 ? 'var(--emerald-700)' : 'var(--red-700)'
              }}>
                {margenNeto.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico: Ingresos vs Gastos */}
        <div style={{ 
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'var(--primary-50)',
          borderRadius: '8px'
        }}>
          <h3 style={{ 
            fontSize: '1rem', 
            fontWeight: '700', 
            color: 'var(--primary-800)', 
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            Comparación: Ingresos vs Costos y Gastos
          </h3>
          <IngresosVsGastosChart 
            ingresos={data.ingresos.total_ingresos}
            costos={data.costos.costo_ventas}
            gastos={data.gastos.total_gastos}
          />
        </div>

        {/* Indicadores */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '1rem',
          marginTop: '1rem'
        }}>
          <div style={{ 
            padding: '1rem', 
            background: 'var(--primary-50)', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--primary-600)', marginBottom: '0.5rem' }}>
              Total Ingresos
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--emerald-700)' }}>
              {formatCurrency(data.ingresos.total_ingresos)}
            </div>
          </div>
          <div style={{ 
            padding: '1rem', 
            background: 'var(--primary-50)', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--primary-600)', marginBottom: '0.5rem' }}>
              Total Costos y Gastos
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--red-700)' }}>
              {formatCurrency(data.costos.costo_ventas + data.gastos.total_gastos)}
            </div>
          </div>
          <div style={{ 
            padding: '1rem', 
            background: 'var(--primary-50)', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--primary-600)', marginBottom: '0.5rem' }}>
              Margen Bruto
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--primary-800)' }}>
              {margenBruto.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
