'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { Download, AlertCircle, Building2, CreditCard, PiggyBank, FileText } from 'lucide-react'
import { ActivosVsPasivosChart } from './ActivosVsPasivosChart'
import { exportToExcel, formatCurrencyForExcel } from '@/lib/excel-export'
import { exportBalanceGeneralToPDF } from '@/lib/pdf-export'

interface BalanceGeneralData {
  activos: {
    corrientes: {
      efectivo: number
      cuentas_por_cobrar: number
      inventarios: number
      otros_activos: number
      total_corrientes: number
    }
    no_corrientes: {
      activos_fijos: number
      depreciacion_acumulada: number
      activos_fijos_neto: number
      otros_activos: number
      total_no_corrientes: number
    }
    total_activos: number
  }
  pasivos: {
    corrientes: {
      cuentas_por_pagar: number
      tributos_por_pagar: number
      remuneraciones_por_pagar: number
      otros_pasivos: number
      total_corrientes: number
    }
    no_corrientes: {
      deudas_largo_plazo: number
      otros_pasivos: number
      total_no_corrientes: number
    }
    total_pasivos: number
  }
  patrimonio: {
    capital: number
    resultados_acumulados: number
    resultado_ejercicio: number
    total_patrimonio: number
  }
}

interface BalanceGeneralProps {
  anio: number
  mes: number
  showComparison?: boolean
}

export function BalanceGeneral({ anio, mes, showComparison = false }: BalanceGeneralProps) {
  const { get } = useApi()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<BalanceGeneralData | null>(null)
  const [previousData, setPreviousData] = useState<BalanceGeneralData | null>(null)

  const getPreviousPeriod = useCallback(() => {
    if (mes === 1) {
      return { anio: anio - 1, mes: 12 }
    }
    return { anio, mes: mes - 1 }
  }, [anio, mes])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await get(`/api/contabilidad/estados/balance-general?anio=${anio}&mes=${mes}`)
      
      if (response?.success && response.data) {
        setData(response.data)
      } else {
        setError('No se pudieron cargar los datos')
      }

      // Cargar datos del período anterior si showComparison está activado
      if (showComparison) {
        const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()
        const prevResponse = await get(`/api/contabilidad/estados/balance-general?anio=${prevAnio}&mes=${prevMes}`)
        
        if (prevResponse?.success && prevResponse.data) {
          setPreviousData(prevResponse.data)
        } else {
          setPreviousData(null)
        }
      } else {
        setPreviousData(null)
      }
    } catch (err: any) {
      console.error('Error loading balance general:', err)
      setError(err.message || 'Error al cargar el balance general')
    } finally {
      setLoading(false)
    }
  }, [anio, get, getPreviousPeriod, mes, showComparison])

  useEffect(() => {
    loadData()
  }, [loadData])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 2
    }).format(amount)
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
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    const exportData = [
      { Concepto: 'ACTIVOS', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'Activos Corrientes', Monto: '' },
      { Concepto: '  Efectivo y Equivalentes', Monto: formatCurrencyForExcel(data.activos.corrientes.efectivo) },
      { Concepto: '  Cuentas por Cobrar', Monto: formatCurrencyForExcel(data.activos.corrientes.cuentas_por_cobrar) },
      { Concepto: '  Inventarios', Monto: formatCurrencyForExcel(data.activos.corrientes.inventarios) },
      { Concepto: '  Otros Activos', Monto: formatCurrencyForExcel(data.activos.corrientes.otros_activos) },
      { Concepto: 'Total Activos Corrientes', Monto: formatCurrencyForExcel(data.activos.corrientes.total_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'Activos No Corrientes', Monto: '' },
      { Concepto: '  Activos Fijos', Monto: formatCurrencyForExcel(data.activos.no_corrientes.activos_fijos) },
      { Concepto: '  (-) Depreciación Acumulada', Monto: `(${formatCurrencyForExcel(data.activos.no_corrientes.depreciacion_acumulada)})` },
      { Concepto: '  Otros Activos', Monto: formatCurrencyForExcel(data.activos.no_corrientes.otros_activos) },
      { Concepto: 'Total Activos No Corrientes', Monto: formatCurrencyForExcel(data.activos.no_corrientes.total_no_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'TOTAL ACTIVOS', Monto: formatCurrencyForExcel(data.activos.total_activos) },
      { Concepto: '', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'PASIVOS', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'Pasivos Corrientes', Monto: '' },
      { Concepto: '  Cuentas por Pagar', Monto: formatCurrencyForExcel(data.pasivos.corrientes.cuentas_por_pagar) },
      { Concepto: '  Tributos por Pagar', Monto: formatCurrencyForExcel(data.pasivos.corrientes.tributos_por_pagar) },
      { Concepto: '  Remuneraciones por Pagar', Monto: formatCurrencyForExcel(data.pasivos.corrientes.remuneraciones_por_pagar) },
      { Concepto: '  Otros Pasivos', Monto: formatCurrencyForExcel(data.pasivos.corrientes.otros_pasivos) },
      { Concepto: 'Total Pasivos Corrientes', Monto: formatCurrencyForExcel(data.pasivos.corrientes.total_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'Pasivos No Corrientes', Monto: '' },
      { Concepto: '  Deudas a Largo Plazo', Monto: formatCurrencyForExcel(data.pasivos.no_corrientes.deudas_largo_plazo) },
      { Concepto: '  Otros Pasivos', Monto: formatCurrencyForExcel(data.pasivos.no_corrientes.otros_pasivos) },
      { Concepto: 'Total Pasivos No Corrientes', Monto: formatCurrencyForExcel(data.pasivos.no_corrientes.total_no_corrientes) },
      { Concepto: '', Monto: '' },
      { Concepto: 'TOTAL PASIVOS', Monto: formatCurrencyForExcel(data.pasivos.total_pasivos) },
      { Concepto: '', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: 'PATRIMONIO', Monto: '' },
      { Concepto: '', Monto: '' },
      { Concepto: '  Capital', Monto: formatCurrencyForExcel(data.patrimonio.capital) },
      { Concepto: '  Resultados Acumulados', Monto: formatCurrencyForExcel(data.patrimonio.resultados_acumulados) },
      { Concepto: '  Resultado del Ejercicio', Monto: formatCurrencyForExcel(data.patrimonio.resultado_ejercicio) },
      { Concepto: 'TOTAL PATRIMONIO', Monto: formatCurrencyForExcel(data.patrimonio.total_patrimonio) },
      { Concepto: '', Monto: '' },
      { Concepto: 'TOTAL PASIVOS + PATRIMONIO', Monto: formatCurrencyForExcel(data.pasivos.total_pasivos + data.patrimonio.total_patrimonio) }
    ]

    exportToExcel(
      [
        {
          name: 'Balance General',
          data: exportData,
          columns: [
            { header: 'Concepto', key: 'Concepto', width: 40 },
            { header: 'Monto', key: 'Monto', width: 20 }
          ]
        }
      ],
      `Balance_General_${anio}_${String(mes).padStart(2, '0')}.xlsx`
    )
  }

  const handleExportPDF = () => {
    if (!data) {
      alert('No hay datos para exportar')
      return
    }

    exportBalanceGeneralToPDF(data, anio, mes)
  }

  if (loading) {
    return (
      <div className="activity-card">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando Balance General...</p>
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

  const isBalanced = Math.abs(data.activos.total_activos - (data.pasivos.total_pasivos + data.patrimonio.total_patrimonio)) < 0.01
  const { anio: prevAnio, mes: prevMes } = getPreviousPeriod()

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
            Balance General
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
            ⚠️ El balance no está cuadrado. Activos ≠ Pasivos + Patrimonio
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

      {/* Balance General Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* ACTIVOS */}
        <div>
          <div style={{ 
            padding: '1rem', 
            background: 'var(--emerald-100)', 
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <Building2 size={20} style={{ color: 'var(--emerald-700)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--emerald-800)', margin: 0 }}>
              ACTIVOS
            </h3>
          </div>
          
          <div style={{ border: '1px solid var(--primary-200)', borderTop: 'none', padding: '1rem' }}>
            {/* Activos Corrientes */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '700', 
                color: 'var(--primary-700)',
                marginBottom: '0.75rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid var(--primary-200)'
              }}>
                Activos Corrientes
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Efectivo y Equivalentes</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.activos.corrientes.efectivo)}
                  {showComparison && previousData && renderVariation(data.activos.corrientes.efectivo, previousData.activos.corrientes.efectivo)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Cuentas por Cobrar</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.activos.corrientes.cuentas_por_cobrar)}
                  {showComparison && previousData && renderVariation(data.activos.corrientes.cuentas_por_cobrar, previousData.activos.corrientes.cuentas_por_cobrar)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Inventarios</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.activos.corrientes.inventarios)}
                  {showComparison && previousData && renderVariation(data.activos.corrientes.inventarios, previousData.activos.corrientes.inventarios)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Otros Activos</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.activos.corrientes.otros_activos)}
                  {showComparison && previousData && renderVariation(data.activos.corrientes.otros_activos, previousData.activos.corrientes.otros_activos)}
                </span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.75rem 0',
                marginTop: '0.5rem',
                borderTop: '1px solid var(--primary-300)',
                fontWeight: '700'
              }}>
                <span style={{ color: 'var(--emerald-700)' }}>Total Activos Corrientes</span>
                <span style={{ color: 'var(--emerald-700)' }}>
                  {formatCurrency(data.activos.corrientes.total_corrientes)}
                  {showComparison && previousData && renderVariation(data.activos.corrientes.total_corrientes, previousData.activos.corrientes.total_corrientes)}
                </span>
              </div>
            </div>

            {/* Activos No Corrientes */}
            <div>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '700', 
                color: 'var(--primary-700)',
                marginBottom: '0.75rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid var(--primary-200)'
              }}>
                Activos No Corrientes
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Activos Fijos</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.activos.no_corrientes.activos_fijos)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>(-) Depreciación Acumulada</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--red-600)' }}>
                  ({formatCurrency(data.activos.no_corrientes.depreciacion_acumulada)})
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Otros Activos</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.activos.no_corrientes.otros_activos)}
                </span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.75rem 0',
                marginTop: '0.5rem',
                borderTop: '1px solid var(--primary-300)',
                fontWeight: '700'
              }}>
                <span style={{ color: 'var(--emerald-700)' }}>Total Activos No Corrientes</span>
                <span style={{ color: 'var(--emerald-700)' }}>
                  {formatCurrency(data.activos.no_corrientes.total_no_corrientes)}
                </span>
              </div>
            </div>

            {/* Total Activos */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '1rem',
              marginTop: '1rem',
              background: 'var(--emerald-100)',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '1.125rem'
            }}>
              <span style={{ color: 'var(--emerald-800)' }}>TOTAL ACTIVOS</span>
              <span style={{ color: 'var(--emerald-800)' }}>
                {formatCurrency(data.activos.total_activos)}
              </span>
            </div>
          </div>
        </div>

        {/* PASIVOS Y PATRIMONIO */}
        <div>
          {/* PASIVOS */}
          <div style={{ 
            padding: '1rem', 
            background: 'var(--red-100)', 
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <CreditCard size={20} style={{ color: 'var(--red-700)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--red-800)', margin: 0 }}>
              PASIVOS
            </h3>
          </div>
          
          <div style={{ border: '1px solid var(--primary-200)', borderTop: 'none', padding: '1rem' }}>
            {/* Pasivos Corrientes */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '700', 
                color: 'var(--primary-700)',
                marginBottom: '0.75rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid var(--primary-200)'
              }}>
                Pasivos Corrientes
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Cuentas por Pagar</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.pasivos.corrientes.cuentas_por_pagar)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Tributos por Pagar</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.pasivos.corrientes.tributos_por_pagar)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Remuneraciones por Pagar</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.pasivos.corrientes.remuneraciones_por_pagar)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Otros Pasivos</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.pasivos.corrientes.otros_pasivos)}
                </span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.75rem 0',
                marginTop: '0.5rem',
                borderTop: '1px solid var(--primary-300)',
                fontWeight: '700'
              }}>
                <span style={{ color: 'var(--red-700)' }}>Total Pasivos Corrientes</span>
                <span style={{ color: 'var(--red-700)' }}>
                  {formatCurrency(data.pasivos.corrientes.total_corrientes)}
                </span>
              </div>
            </div>

            {/* Pasivos No Corrientes */}
            <div>
              <div style={{ 
                fontSize: '0.875rem', 
                fontWeight: '700', 
                color: 'var(--primary-700)',
                marginBottom: '0.75rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid var(--primary-200)'
              }}>
                Pasivos No Corrientes
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Deudas a Largo Plazo</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.pasivos.no_corrientes.deudas_largo_plazo)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Otros Pasivos</span>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                  {formatCurrency(data.pasivos.no_corrientes.otros_pasivos)}
                </span>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.75rem 0',
                marginTop: '0.5rem',
                borderTop: '1px solid var(--primary-300)',
                fontWeight: '700'
              }}>
                <span style={{ color: 'var(--red-700)' }}>Total Pasivos No Corrientes</span>
                <span style={{ color: 'var(--red-700)' }}>
                  {formatCurrency(data.pasivos.no_corrientes.total_no_corrientes)}
                </span>
              </div>
            </div>

            {/* Total Pasivos */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '1rem',
              marginTop: '1rem',
              background: 'var(--red-100)',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '1.125rem'
            }}>
              <span style={{ color: 'var(--red-800)' }}>TOTAL PASIVOS</span>
              <span style={{ color: 'var(--red-800)' }}>
                {formatCurrency(data.pasivos.total_pasivos)}
              </span>
            </div>
          </div>

          {/* PATRIMONIO */}
          <div style={{ 
            padding: '1rem', 
            background: 'var(--blue-100)', 
            borderRadius: '8px 8px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginTop: '1.5rem'
          }}>
            <PiggyBank size={20} style={{ color: 'var(--blue-700)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--blue-800)', margin: 0 }}>
              PATRIMONIO
            </h3>
          </div>
          
          <div style={{ border: '1px solid var(--primary-200)', borderTop: 'none', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Capital</span>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                {formatCurrency(data.patrimonio.capital)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Resultados Acumulados</span>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                {formatCurrency(data.patrimonio.resultados_acumulados)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.5rem 1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>Resultado del Ejercicio</span>
              <span style={{ fontSize: '0.875rem', fontWeight: '600', color: data.patrimonio.resultado_ejercicio >= 0 ? 'var(--emerald-600)' : 'var(--red-600)' }}>
                {formatCurrency(data.patrimonio.resultado_ejercicio)}
              </span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '1rem',
              marginTop: '1rem',
              background: 'var(--blue-100)',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '1.125rem'
            }}>
              <span style={{ color: 'var(--blue-800)' }}>TOTAL PATRIMONIO</span>
              <span style={{ color: 'var(--blue-800)' }}>
                {formatCurrency(data.patrimonio.total_patrimonio)}
              </span>
            </div>
          </div>

          {/* Total Pasivos + Patrimonio */}
          <div style={{ 
            padding: '1rem', 
            background: 'var(--primary-100)', 
            borderRadius: '8px',
            marginTop: '1rem',
            fontWeight: '700',
            fontSize: '1.125rem'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between'
            }}>
              <span style={{ color: 'var(--primary-800)' }}>TOTAL PASIVOS + PATRIMONIO</span>
              <span style={{ color: 'var(--primary-800)' }}>
                {formatCurrency(data.pasivos.total_pasivos + data.patrimonio.total_patrimonio)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico: Activos vs Pasivos y Patrimonio */}
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
          Distribución: Activos, Pasivos y Patrimonio
        </h3>
        <ActivosVsPasivosChart 
          activos={data.activos.total_activos}
          pasivos={data.pasivos.total_pasivos}
          patrimonio={data.patrimonio.total_patrimonio}
        />
      </div>

      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '1rem',
        marginTop: '2rem'
      }}>
        <div style={{ 
          padding: '1rem', 
          background: 'var(--emerald-50)', 
          borderRadius: '8px',
          textAlign: 'center',
          border: '2px solid var(--emerald-200)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--emerald-700)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Activos
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--emerald-800)' }}>
            {formatCurrency(data.activos.total_activos)}
          </div>
        </div>
        <div style={{ 
          padding: '1rem', 
          background: 'var(--red-50)', 
          borderRadius: '8px',
          textAlign: 'center',
          border: '2px solid var(--red-200)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--red-700)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Pasivos
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--red-800)' }}>
            {formatCurrency(data.pasivos.total_pasivos)}
          </div>
        </div>
        <div style={{ 
          padding: '1rem', 
          background: 'var(--blue-50)', 
          borderRadius: '8px',
          textAlign: 'center',
          border: '2px solid var(--blue-200)'
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--blue-700)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Patrimonio
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--blue-800)' }}>
            {formatCurrency(data.patrimonio.total_patrimonio)}
          </div>
        </div>
        <div style={{ 
          padding: '1rem', 
          background: isBalanced ? 'var(--emerald-50)' : 'var(--red-50)', 
          borderRadius: '8px',
          textAlign: 'center',
          border: `2px solid ${isBalanced ? 'var(--emerald-200)' : 'var(--red-200)'}`
        }}>
          <div style={{ 
            fontSize: '0.75rem', 
            color: isBalanced ? 'var(--emerald-700)' : 'var(--red-700)', 
            marginBottom: '0.5rem', 
            fontWeight: '600' 
          }}>
            Estado
          </div>
          <div style={{ 
            fontSize: '1rem', 
            fontWeight: '700', 
            color: isBalanced ? 'var(--emerald-800)' : 'var(--red-800)' 
          }}>
            {isBalanced ? '✓ Cuadrado' : '✗ Descuadrado'}
          </div>
        </div>
      </div>
    </div>
  )
}
