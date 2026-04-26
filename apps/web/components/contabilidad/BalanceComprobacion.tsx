'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { Download, AlertCircle, TrendingUp, TrendingDown, FileText } from 'lucide-react'
import { exportToExcel, formatCurrencyForExcel } from '@/lib/excel-export'
import { exportBalanceComprobacionToPDF } from '@/lib/pdf-export'

interface BalanceComprobacionItem {
  cuenta: string
  nombre: string
  saldo_inicial: number
  debe: number
  haber: number
  saldo_final: number
}

interface BalanceComprobacionProps {
  anio: number
  mes: number
  showComparison?: boolean
}

export function BalanceComprobacion({ anio, mes, showComparison = false }: BalanceComprobacionProps) {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BalanceComprobacionItem[]>([])
  const [previousData, setPreviousData] = useState<BalanceComprobacionItem[]>([])

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
      
      const response = await get(`/api/contabilidad/estados/balance-comprobacion?anio=${anio}&mes=${mes}`)
      
      if (response?.success && response.data) {
        setData(response.data)
      } else {
        setError('No se pudieron cargar los datos')
      }

      // Cargar datos del período anterior si showComparison está activado
      if (showComparison) {
        const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()
        const prevResponse = await get(`/api/contabilidad/estados/balance-comprobacion?anio=${prevAnio}&mes=${prevMes}`)
        
        if (prevResponse?.success && prevResponse.data) {
          setPreviousData(prevResponse.data)
        } else {
          setPreviousData([])
        }
      } else {
        setPreviousData([])
      }
    } catch (err: any) {
      console.error('Error loading balance comprobacion:', err)
      setError(err.message || 'Error al cargar el balance de comprobación')
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

  const getPreviousItemValue = (cuenta: string, field: 'saldo_final'): number => {
    const prevItem = previousData.find(item => item.cuenta === cuenta)
    return prevItem ? prevItem[field] : 0
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
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: '0.25rem',
        fontSize: '0.7rem',
        color: isPositive ? 'var(--emerald-600)' : 'var(--red-600)',
        fontWeight: '600',
        marginLeft: '0.5rem'
      }}>
        {isPositive ? '↑' : '↓'}
        {Math.abs(percentage).toFixed(1)}%
      </div>
    )
  }

  const handleExportExcel = () => {
    if (data.length === 0) {
      alert('No hay datos para exportar')
      return
    }

    const exportData = data.map(item => ({
      Cuenta: item.cuenta,
      Nombre: item.nombre,
      'Saldo Inicial': formatCurrencyForExcel(item.saldo_inicial),
      Debe: formatCurrencyForExcel(item.debe),
      Haber: formatCurrencyForExcel(item.haber),
      'Saldo Final': formatCurrencyForExcel(item.saldo_final)
    }))

    // Agregar fila de totales
    exportData.push({
      Cuenta: '',
      Nombre: 'TOTALES',
      'Saldo Inicial': formatCurrencyForExcel(totales.saldo_inicial),
      Debe: formatCurrencyForExcel(totales.debe),
      Haber: formatCurrencyForExcel(totales.haber),
      'Saldo Final': formatCurrencyForExcel(totales.saldo_final)
    })

    exportToExcel(
      [
        {
          name: 'Balance de Comprobación',
          data: exportData,
          columns: [
            { header: 'Cuenta', key: 'Cuenta', width: 12 },
            { header: 'Nombre', key: 'Nombre', width: 35 },
            { header: 'Saldo Inicial', key: 'Saldo Inicial', width: 18 },
            { header: 'Debe', key: 'Debe', width: 18 },
            { header: 'Haber', key: 'Haber', width: 18 },
            { header: 'Saldo Final', key: 'Saldo Final', width: 18 }
          ]
        }
      ],
      `Balance_Comprobacion_${anio}_${String(mes).padStart(2, '0')}.xlsx`
    )
  }

  const handleExportPDF = () => {
    if (data.length === 0) {
      alert('No hay datos para exportar')
      return
    }

    exportBalanceComprobacionToPDF(data, anio, mes, totales)
  }

  // Calcular totales
  const totales = data.reduce((acc, item) => ({
    saldo_inicial: acc.saldo_inicial + item.saldo_inicial,
    debe: acc.debe + item.debe,
    haber: acc.haber + item.haber,
    saldo_final: acc.saldo_final + item.saldo_final
  }), { saldo_inicial: 0, debe: 0, haber: 0, saldo_final: 0 })

  const isBalanced = Math.abs(totales.debe - totales.haber) < 0.01
  const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()

  if (loading) {
    return (
      <div className="activity-card">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando Balance de Comprobación...</p>
        </div>
      </div>
    )
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
            Balance de Comprobación
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

      {/* Balance Status */}
      {!isBalanced && (
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
            ⚠️ El balance no está cuadrado. Diferencia: {formatCurrency(Math.abs(totales.debe - totales.haber))}
          </p>
        </div>
      )}

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

      {/* Table */}
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--primary-400)' }}>
          <p>No hay datos disponibles para el período seleccionado</p>
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--primary-200)' }}>
                <th style={{ 
                  textAlign: 'left', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: 'var(--primary-600)',
                  letterSpacing: '0.05em'
                }}>
                  Cuenta
                </th>
                <th style={{ 
                  textAlign: 'left', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: 'var(--primary-600)',
                  letterSpacing: '0.05em'
                }}>
                  Nombre
                </th>
                <th style={{ 
                  textAlign: 'right', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: 'var(--primary-600)',
                  letterSpacing: '0.05em'
                }}>
                  Saldo Inicial
                </th>
                <th style={{ 
                  textAlign: 'right', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: 'var(--primary-600)',
                  letterSpacing: '0.05em'
                }}>
                  Debe
                </th>
                <th style={{ 
                  textAlign: 'right', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: 'var(--primary-600)',
                  letterSpacing: '0.05em'
                }}>
                  Haber
                </th>
                <th style={{ 
                  textAlign: 'right', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: 'var(--primary-600)',
                  letterSpacing: '0.05em'
                }}>
                  Saldo Final
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr 
                  key={index}
                  style={{ 
                    borderBottom: '1px solid var(--primary-100)',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-50)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '0.75rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                    {item.cuenta}
                  </td>
                  <td style={{ padding: '0.75rem', color: 'var(--primary-700)' }}>
                    {item.nombre}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--primary-700)' }}>
                    {formatCurrency(item.saldo_inicial)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--emerald-600)', fontWeight: '600' }}>
                    {formatCurrency(item.debe)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--red-600)', fontWeight: '600' }}>
                    {formatCurrency(item.haber)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: 'var(--primary-800)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      {item.saldo_final > 0 ? (
                        <TrendingUp size={14} style={{ color: 'var(--emerald-600)' }} />
                      ) : item.saldo_final < 0 ? (
                        <TrendingDown size={14} style={{ color: 'var(--red-600)' }} />
                      ) : null}
                      {formatCurrency(item.saldo_final)}
                      {showComparison && previousData.length > 0 && renderVariation(item.saldo_final, getPreviousItemValue(item.cuenta, 'saldo_final'))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ 
                borderTop: '2px solid var(--primary-300)',
                background: 'var(--primary-50)',
                fontWeight: '700'
              }}>
                <td colSpan={2} style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--primary-800)' }}>
                  TOTALES
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--primary-800)' }}>
                  {formatCurrency(totales.saldo_inicial)}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--emerald-700)' }}>
                  {formatCurrency(totales.debe)}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--red-700)' }}>
                  {formatCurrency(totales.haber)}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--primary-800)' }}>
                  {formatCurrency(totales.saldo_final)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Summary */}
      {data.length > 0 && (
        <div style={{ 
          marginTop: '1.5rem', 
          padding: '1rem',
          background: isBalanced ? 'var(--emerald-50)' : 'var(--red-50)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <p style={{ fontSize: '0.875rem', color: 'var(--primary-700)', margin: 0 }}>
              Total de cuentas: <strong>{data.length}</strong>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ 
              fontSize: '0.875rem', 
              color: isBalanced ? 'var(--emerald-700)' : 'var(--red-700)', 
              margin: 0,
              fontWeight: '600'
            }}>
              {isBalanced ? '✓ Balance cuadrado' : '✗ Balance descuadrado'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
