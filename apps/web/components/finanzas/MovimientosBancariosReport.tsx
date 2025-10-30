'use client'

import { useEffect, useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { FileText, RefreshCw, Download, Filter } from 'lucide-react'

interface MovimientoBancario {
  id: string
  cuenta_bancaria_id: string
  cuenta_nombre: string
  banco: string
  tipo: 'ABONO' | 'CARGO'
  monto: number
  moneda: string
  fecha: string
  descripcion: string
  referencia: string
  conciliado: boolean
  saldo_despues: number
}

interface MovimientosReportProps {
  fechaDesde?: string
  fechaHasta?: string
}

export default function MovimientosBancariosReport({ fechaDesde, fechaHasta }: MovimientosReportProps) {
  const { get } = useApi()
  const [movimientos, setMovimientos] = useState<MovimientoBancario[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'ABONO' | 'CARGO'>('TODOS')
  const [filtroConciliado, setFiltroConciliado] = useState<'TODOS' | 'SI' | 'NO'>('TODOS')

  const loadMovimientos = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (fechaDesde) params.append('fecha_desde', fechaDesde)
      if (fechaHasta) params.append('fecha_hasta', fechaHasta)
      
      const response = await get(`/api/finanzas/bancos/movimientos/periodo?${params.toString()}`)
      
      if (response?.success) {
        setMovimientos(response.data || [])
      }
    } catch (error) {
      console.error('Error loading movimientos:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMovimientos()
  }, [fechaDesde, fechaHasta])

  const formatCurrency = (amount: number, currency: string = 'PEN') => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  // Apply filters
  const movimientosFiltrados = movimientos.filter(mov => {
    if (filtroTipo !== 'TODOS' && mov.tipo !== filtroTipo) return false
    if (filtroConciliado === 'SI' && !mov.conciliado) return false
    if (filtroConciliado === 'NO' && mov.conciliado) return false
    return true
  })

  // Calculate totals
  const totales = movimientosFiltrados.reduce((acc, mov) => {
    const key = mov.moneda
    if (!acc[key]) {
      acc[key] = { abonos: 0, cargos: 0, neto: 0 }
    }
    if (mov.tipo === 'ABONO') {
      acc[key].abonos += mov.monto
    } else {
      acc[key].cargos += mov.monto
    }
    acc[key].neto = acc[key].abonos - acc[key].cargos
    return acc
  }, {} as Record<string, { abonos: number; cargos: number; neto: number }>)

  if (loading) {
    return (
      <div className="activity-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#6b7280' }}>Cargando movimientos bancarios...</p>
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
        borderBottom: '1px solid rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <FileText size={24} style={{ color: '#f59e0b' }} />
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
              Movimientos Bancarios por Período
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              {movimientosFiltrados.length} movimiento{movimientosFiltrados.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={loadMovimientos}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1.5rem',
        flexWrap: 'wrap'
      }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>
            Tipo
          </label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as any)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            <option value="TODOS">Todos</option>
            <option value="ABONO">Abonos</option>
            <option value="CARGO">Cargos</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>
            Conciliado
          </label>
          <select
            value={filtroConciliado}
            onChange={(e) => setFiltroConciliado(e.target.value as any)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            <option value="TODOS">Todos</option>
            <option value="SI">Conciliados</option>
            <option value="NO">Sin conciliar</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {Object.entries(totales).map(([moneda, datos]) => (
          <div key={moneda} style={{
            padding: '1rem',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: 'white'
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', opacity: 0.9 }}>
              Flujo Neto {moneda}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', marginTop: '0.5rem' }}>
              {formatCurrency(datos.neto, moneda)}
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.9 }}>
              Abonos: {formatCurrency(datos.abonos, moneda)}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
              Cargos: {formatCurrency(datos.cargos, moneda)}
            </div>
          </div>
        ))}
      </div>

      {/* Movements Table */}
      {movimientosFiltrados.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
          <p style={{ color: '#6b7280' }}>No hay movimientos en el período seleccionado</p>
        </div>
      ) : (
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                <th style={{ 
                  textAlign: 'left', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: '#6b7280' 
                }}>
                  Fecha
                </th>
                <th style={{ 
                  textAlign: 'left', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: '#6b7280' 
                }}>
                  Cuenta / Banco
                </th>
                <th style={{ 
                  textAlign: 'left', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: '#6b7280' 
                }}>
                  Descripción
                </th>
                <th style={{ 
                  textAlign: 'center', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: '#6b7280' 
                }}>
                  Tipo
                </th>
                <th style={{ 
                  textAlign: 'right', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: '#6b7280' 
                }}>
                  Monto
                </th>
                <th style={{ 
                  textAlign: 'center', 
                  padding: '0.75rem', 
                  fontWeight: '600', 
                  fontSize: '0.75rem', 
                  textTransform: 'uppercase', 
                  color: '#6b7280' 
                }}>
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map((mov) => (
                <tr key={mov.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                    {formatDate(mov.fecha)}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                      {mov.cuenta_nombre}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {mov.banco}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.875rem' }}>
                      {mov.descripcion}
                    </div>
                    {mov.referencia && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        Ref: {mov.referencia}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: mov.tipo === 'ABONO' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: mov.tipo === 'ABONO' ? '#059669' : '#dc2626'
                    }}>
                      {mov.tipo}
                    </span>
                  </td>
                  <td style={{ 
                    padding: '0.75rem', 
                    textAlign: 'right', 
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: mov.tipo === 'ABONO' ? '#059669' : '#dc2626'
                  }}>
                    {mov.tipo === 'ABONO' ? '+' : '-'}{formatCurrency(mov.monto, mov.moneda)}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: mov.conciliado ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: mov.conciliado ? '#059669' : '#d97706'
                    }}>
                      {mov.conciliado ? 'Conciliado' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
