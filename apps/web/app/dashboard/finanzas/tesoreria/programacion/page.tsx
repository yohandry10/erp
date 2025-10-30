'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download
} from 'lucide-react'

interface Proveedor {
  id: string
  razon_social: string
  ruc: string
  nombre_comercial?: string
}

interface Recepcion {
  id: string
  numero_recepcion: string
  fecha_recepcion: string
}

interface PagoProximo {
  id: string
  numero_documento: string
  fecha_emision: string
  fecha_vencimiento: string
  total: number
  saldo: number
  estado: string
  moneda: string
  condiciones_pago: string
  dias_credito: number
  observaciones: string | null
  proveedor: Proveedor
  recepcion: Recepcion | null
  dias_hasta_vencimiento: number
  urgencia: string
}

const URGENCIA_CONFIG = {
  VENCIDA: {
    label: 'Vencida',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
  },
  HOY: {
    label: 'Vence Hoy',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  URGENTE: {
    label: 'Urgente (1-7 días)',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
  },
  PROXIMA: {
    label: 'Próxima (8-15 días)',
    color: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
  },
  NORMAL: {
    label: 'Normal (>15 días)',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
  },
}

export default function ProgramacionPagosPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [pagos, setPagos] = useState<PagoProximo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPagos, setSelectedPagos] = useState<Set<string>>(new Set())
  
  // Filtros
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [estado, setEstado] = useState('')
  const [urgenciaFilter, setUrgenciaFilter] = useState('')
  
  // Paginación
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50)

  const loadProgramacion = useCallback(async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams()
      if (fechaDesde) params.append('fecha_desde', fechaDesde)
      if (fechaHasta) params.append('fecha_hasta', fechaHasta)
      if (estado) params.append('estado', estado)
      params.append('page', page.toString())
      params.append('limit', limit.toString())

      const response = await get(`/api/finanzas/tesoreria/programacion?${params.toString()}`)
      
      if (response?.success) {
        let data = response.data || []
        
        // Filtrar por urgencia si está seleccionado
        if (urgenciaFilter) {
          data = data.filter((p: PagoProximo) => p.urgencia === urgenciaFilter)
        }
        
        setPagos(data)
        setTotal(response.total || 0)
      }
    } catch (error) {
      console.error('Error loading programación:', error)
    } finally {
      setLoading(false)
    }
  }, [get, fechaDesde, fechaHasta, estado, urgenciaFilter, page, limit])

  useEffect(() => {
    loadProgramacion()
  }, [loadProgramacion])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getUrgenciaBadge = (urgencia: string) => {
    const config = URGENCIA_CONFIG[urgencia as keyof typeof URGENCIA_CONFIG]
    if (!config) return null
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '500',
        background: config.color,
        color: 'white'
      }}>
        {config.label}
      </span>
    )
  }

  const handleSelectPago = (pagoId: string) => {
    const newSelected = new Set(selectedPagos)
    if (newSelected.has(pagoId)) {
      newSelected.delete(pagoId)
    } else {
      newSelected.add(pagoId)
    }
    setSelectedPagos(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedPagos.size === pagos.length) {
      setSelectedPagos(new Set())
    } else {
      setSelectedPagos(new Set(pagos.map(p => p.id)))
    }
  }

  const handlePagoMasivo = () => {
    if (selectedPagos.size === 0) {
      alert('Selecciona al menos un pago')
      return
    }
    
    // Navegar a página de pago masivo con los IDs seleccionados
    const ids = Array.from(selectedPagos).join(',')
    router.push(`/dashboard/finanzas/tesoreria/lote?cxp_ids=${ids}`)
  }

  const clearFilters = () => {
    setFechaDesde('')
    setFechaHasta('')
    setEstado('')
    setUrgenciaFilter('')
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)

  // Estadísticas
  const totalPorPagarPEN = pagos
    .filter(p => p.moneda === 'PEN')
    .reduce((sum, p) => sum + p.saldo, 0)

  const totalPorPagarUSD = pagos
    .filter(p => p.moneda === 'USD')
    .reduce((sum, p) => sum + p.saldo, 0)

  const pagosPorUrgencia = {
    VENCIDA: pagos.filter(p => p.urgencia === 'VENCIDA').length,
    HOY: pagos.filter(p => p.urgencia === 'HOY').length,
    URGENTE: pagos.filter(p => p.urgencia === 'URGENTE').length,
    PROXIMA: pagos.filter(p => p.urgencia === 'PROXIMA').length,
    NORMAL: pagos.filter(p => p.urgencia === 'NORMAL').length,
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.back()}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              marginBottom: '1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <ChevronLeft size={16} />
            Volver
          </button>
          <h1 className="dashboard-title">Programación de Pagos</h1>
          <p className="dashboard-subtitle">Planifica los pagos a proveedores por fecha de vencimiento</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {selectedPagos.size > 0 && (
            <button
              onClick={handlePagoMasivo}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <CreditCard size={16} />
              Pagar Seleccionados ({selectedPagos.size})
            </button>
          )}
          <button
            onClick={loadProgramacion}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL POR PAGAR (PEN)</h3>
          </div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: '#ef4444' }}>
            {formatCurrency(totalPorPagarPEN, 'PEN')}
          </div>
          <div className="stat-subtitle">
            {pagos.filter(p => p.moneda === 'PEN').length} pago(s)
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL POR PAGAR (USD)</h3>
          </div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: '#ef4444' }}>
            {formatCurrency(totalPorPagarUSD, 'USD')}
          </div>
          <div className="stat-subtitle">
            {pagos.filter(p => p.moneda === 'USD').length} pago(s)
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VENCIDOS</h3>
            <AlertCircle className="stat-icon" style={{ color: '#ef4444' }} />
          </div>
          <div className="stat-value" style={{ color: '#ef4444' }}>
            {pagosPorUrgencia.VENCIDA}
          </div>
          <div className="stat-subtitle">
            Requieren atención inmediata
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>URGENTES</h3>
            <AlertCircle className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>
            {pagosPorUrgencia.HOY + pagosPorUrgencia.URGENTE}
          </div>
          <div className="stat-subtitle">
            Vencen en 0-7 días
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="activity-section">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={20} />
            Filtros
          </h2>
          <button
            onClick={clearFilters}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Limpiar Filtros
          </button>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem' 
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              Estado
            </label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            >
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PARCIAL">Parcial</option>
              <option value="VENCIDA">Vencida</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              Urgencia
            </label>
            <select
              value={urgenciaFilter}
              onChange={(e) => setUrgenciaFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            >
              <option value="">Todas</option>
              <option value="VENCIDA">Vencida</option>
              <option value="HOY">Vence Hoy</option>
              <option value="URGENTE">Urgente (1-7 días)</option>
              <option value="PROXIMA">Próxima (8-15 días)</option>
              <option value="NORMAL">Normal (&gt;15 días)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de Pagos */}
      <div className="activity-section">
        <div className="activity-card">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Cargando programación de pagos...</p>
            </div>
          ) : pagos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <Calendar size={48} style={{ margin: '0 auto 1rem', color: '#d1d5db' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                No hay pagos programados
              </h3>
              <p>No se encontraron cuentas por pagar con los filtros seleccionados</p>
            </div>
          ) : (
            <>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                      <th style={{ padding: '1rem', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPagos.size === pagos.length && pagos.length > 0}
                          onChange={handleSelectAll}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Urgencia
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Proveedor
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        N° Documento
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Emisión
                      </th>
                      <th style={{ textAlign: 'left', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Vencimiento
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Total
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Saldo
                      </th>
                      <th style={{ textAlign: 'center', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Estado
                      </th>
                      <th style={{ textAlign: 'right', padding: '1rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((pago) => (
                      <tr 
                        key={pago.id} 
                        style={{ 
                          borderBottom: '1px solid rgba(0,0,0,0.05)',
                          background: selectedPagos.has(pago.id) ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '1rem' }}>
                          <input
                            type="checkbox"
                            checked={selectedPagos.has(pago.id)}
                            onChange={() => handleSelectPago(pago.id)}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {getUrgenciaBadge(pago.urgencia)}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                            {pago.proveedor?.razon_social || 'N/A'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            RUC: {pago.proveedor?.ruc || 'N/A'}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', fontFamily: 'monospace' }}>
                            {pago.numero_documento}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem' }}>
                            {formatDate(pago.fecha_emision)}
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                            {formatDate(pago.fecha_vencimiento)}
                          </div>
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: pago.dias_hasta_vencimiento < 0 ? '#ef4444' : '#6b7280'
                          }}>
                            {pago.dias_hasta_vencimiento < 0 
                              ? `Vencido hace ${Math.abs(pago.dias_hasta_vencimiento)} días`
                              : pago.dias_hasta_vencimiento === 0
                              ? 'Vence hoy'
                              : `Vence en ${pago.dias_hasta_vencimiento} días`
                            }
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>
                            {formatCurrency(pago.total, pago.moneda)}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#ef4444' }}>
                            {formatCurrency(pago.saldo, pago.moneda)}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            background: pago.estado === 'PENDIENTE' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: pago.estado === 'PENDIENTE' ? '#f59e0b' : '#ef4444'
                          }}>
                            {pago.estado}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => router.push(`/dashboard/finanzas/cxp/${pago.id}`)}
                            style={{
                              padding: '0.5rem 1rem',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#3b82f6',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}
                          >
                            Ver Detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginTop: '1.5rem',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid rgba(0,0,0,0.1)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    Mostrando {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} de {total} pagos
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: page === 1 ? '#f3f4f6' : 'white',
                        cursor: page === 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <ChevronLeft size={16} />
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: page === totalPages ? '#f3f4f6' : 'white',
                        cursor: page === totalPages ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      Siguiente
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
