'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  Plus, 
  RefreshCw,
  PackageX,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Eye,
  Filter,
  X
} from 'lucide-react'

interface Devolucion {
  id: string
  numero: string
  recepcion_id?: string
  orden_id: string
  proveedor_id: string
  fecha_devolucion: string
  estado: 'PENDIENTE' | 'EMITIDA' | 'ANULADA'
  motivo: string
  subtotal: number
  igv: number
  total: number
  observaciones?: string
  emitido_por?: string
  emitido_at?: string
  created_at: string
  orden?: {
    id: string
    numero: string
  }
  proveedor?: {
    id: string
    razon_social: string
    ruc: string
  }
  recepcion?: {
    id: string
    numero: string
  }
}

export default function DevolucionesPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    estado: '',
    proveedor_id: '',
    fecha_desde: '',
    fecha_hasta: ''
  })
  const [showFilters, setShowFilters] = useState(false)

  const loadDevoluciones = useCallback(async () => {
    try {
      setLoading(true)
      
      const params = new URLSearchParams()
      if (filtros.estado) params.append('estado', filtros.estado)
      if (filtros.proveedor_id) params.append('proveedor_id', filtros.proveedor_id)
      if (filtros.fecha_desde) params.append('fecha_desde', filtros.fecha_desde)
      if (filtros.fecha_hasta) params.append('fecha_hasta', filtros.fecha_hasta)
      
      const queryString = params.toString()
      const url = `/api/compras/devoluciones${queryString ? `?${queryString}` : ''}`
      
      const response = await get(url)
      const devolucionesData = Array.isArray(response) ? response : response?.data
      
      if (Array.isArray(devolucionesData)) {
        setDevoluciones(devolucionesData)
      }
    } catch (error) {
      console.error('Error loading devoluciones:', error)
      alert('Error: No se pudieron cargar las devoluciones')
    } finally {
      setLoading(false)
    }
  }, [get, filtros])

  useEffect(() => {
    loadDevoluciones()
  }, [loadDevoluciones])

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getEstadoBadge = (estado: string) => {
    const styles = {
      PENDIENTE: { bg: 'var(--amber-100)', color: 'var(--amber-800)', icon: Clock },
      EMITIDA: { bg: 'var(--emerald-100)', color: 'var(--emerald-800)', icon: CheckCircle },
      ANULADA: { bg: 'var(--red-100)', color: 'var(--red-800)', icon: XCircle }
    }
    
    const style = styles[estado as keyof typeof styles] || styles.PENDIENTE
    const Icon = style.icon
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '600',
        backgroundColor: style.bg,
        color: style.color
      }}>
        <Icon size={14} />
        {estado}
      </span>
    )
  }

  const estadisticas = {
    total: devoluciones.length,
    pendientes: devoluciones.filter(d => d.estado === 'PENDIENTE').length,
    emitidas: devoluciones.filter(d => d.estado === 'EMITIDA').length,
    anuladas: devoluciones.filter(d => d.estado === 'ANULADA').length
  }

  const hasActiveFilters = filtros.estado || filtros.proveedor_id || filtros.fecha_desde || filtros.fecha_hasta

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
            Devoluciones a Proveedor
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Gestión de devoluciones de mercancía
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              backgroundColor: showFilters ? 'var(--primary-50)' : 'white',
              color: showFilters ? 'var(--primary-700)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            <Filter size={18} />
            Filtros
            {hasActiveFilters && (
              <span style={{
                backgroundColor: 'var(--primary-600)',
                color: 'white',
                borderRadius: '10px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {[filtros.estado, filtros.proveedor_id, filtros.fecha_desde, filtros.fecha_hasta]
                  .filter(Boolean).length}
              </span>
            )}
          </button>
          
          <button
            onClick={loadDevoluciones}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              backgroundColor: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: loading ? 0.6 : 1
            }}
          >
            <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
          
          <button
            onClick={() => router.push('/dashboard/compras/devoluciones/nueva')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: 'var(--primary-600)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            <Plus size={18} />
            Nueva Devolución
          </button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                Estado
              </label>
              <select
                value={filtros.estado}
                onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EMITIDA">Emitida</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                Fecha Desde
              </label>
              <input
                type="date"
                value={filtros.fecha_desde}
                onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '500' }}>
                Fecha Hasta
              </label>
              <input
                type="date"
                value={filtros.fecha_hasta}
                onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => setFiltros({ estado: '', proveedor_id: '', fecha_desde: '', fecha_hasta: '' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: 'var(--red-50)',
                color: 'var(--red-700)',
                border: '1px solid var(--red-200)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500'
              }}
            >
              <X size={14} />
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Estadísticas */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: 'white',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--blue-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PackageX size={24} style={{ color: 'var(--blue-600)' }} />
            </div>
            <div>
              <p style={{ fontSize: '24px', fontWeight: '700', marginBottom: '2px' }}>
                {estadisticas.total}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Total Devoluciones
              </p>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--amber-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={24} style={{ color: 'var(--amber-600)' }} />
            </div>
            <div>
              <p style={{ fontSize: '24px', fontWeight: '700', marginBottom: '2px' }}>
                {estadisticas.pendientes}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Pendientes
              </p>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--emerald-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle size={24} style={{ color: 'var(--emerald-600)' }} />
            </div>
            <div>
              <p style={{ fontSize: '24px', fontWeight: '700', marginBottom: '2px' }}>
                {estadisticas.emitidas}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Emitidas
              </p>
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--red-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <XCircle size={24} style={{ color: 'var(--red-600)' }} />
            </div>
            <div>
              <p style={{ fontSize: '24px', fontWeight: '700', marginBottom: '2px' }}>
                {estadisticas.anuladas}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Anuladas
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Cargando devoluciones...
          </div>
        ) : devoluciones.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <PackageX size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
              No hay devoluciones registradas
            </p>
            <button
              onClick={() => router.push('/dashboard/compras/devoluciones/nueva')}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--primary-600)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Crear primera devolución
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--gray-50)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  NÚMERO
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  PROVEEDOR
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  ORDEN COMPRA
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  RECEPCIÓN
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  FECHA
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  MOTIVO
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  TOTAL
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  ESTADO
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody>
              {devoluciones.map((devolucion) => (
                <tr 
                  key={devolucion.id}
                  style={{ 
                    borderBottom: '1px solid var(--border-color)',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-50)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600' }}>
                    {devolucion.numero}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px' }}>
                    <div>
                      <div style={{ fontWeight: '500' }}>{devolucion.proveedor?.razon_social || '-'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        RUC: {devolucion.proveedor?.ruc || '-'}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px' }}>
                    {devolucion.orden?.numero || '-'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px' }}>
                    {devolucion.recepcion?.numero || '-'}
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px' }}>
                    {formatDate(devolucion.fecha_devolucion)}
                  </td>
                  <td style={{ padding: '16px', fontSize: '13px', maxWidth: '200px' }}>
                    <div style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis', 
                      whiteSpace: 'nowrap',
                      color: 'var(--text-secondary)'
                    }}>
                      {devolucion.motivo}
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontSize: '14px', fontWeight: '600', textAlign: 'right' }}>
                    {formatCurrency(devolucion.total)}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    {getEstadoBadge(devolucion.estado)}
                  </td>
                  <td style={{ padding: '16px', textAlign: 'center' }}>
                    <button
                      onClick={() => router.push(`/dashboard/compras/devoluciones/${devolucion.id}`)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--primary-50)',
                        color: 'var(--primary-700)',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Eye size={14} />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
