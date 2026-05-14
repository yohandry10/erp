'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  FileText,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
  Zap,
  Edit3
} from 'lucide-react'

interface AsientoContable {
  id: string
  numero_asiento: string
  fecha: string
  concepto: string
  referencia?: string
  total_debe: number
  total_haber: number
  estado: 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'
  origen?: string
  source_event_id?: string
  created_at: string
}

type EstadoAsiento = 'BORRADOR' | 'CONFIRMADO' | 'ANULADO'

const ESTADOS_CONFIG: Record<EstadoAsiento, {
  label: string
  color: string
  bgColor: string
  icon: any
}> = {
  BORRADOR: {
    label: 'Borrador',
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: FileText
  },
  CONFIRMADO: {
    label: 'Confirmado',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: CheckCircle
  },
  ANULADO: {
    label: 'Anulado',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: XCircle
  }
}

export default function AsientosPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [asientos, setAsientos] = useState<AsientoContable[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [numeroAsientoSearch, setNumeroAsientoSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState<string>('TODOS')
  const [origenFilter, setOrigenFilter] = useState<string>('TODOS')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const loadAsientos = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await get('/api/contabilidad/asientos')
      
      if (response?.success && response.data) {
        setAsientos(response.data)
      } else {
        setError('No se pudieron cargar los asientos contables')
      }
    } catch (err: any) {
      console.error('Error loading asientos:', err)
      setError(err.message || 'Error al cargar los asientos contables')
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadAsientos()
  }, [loadAsientos])

  const formatCurrency = (amount: number) => {
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
    const config = ESTADOS_CONFIG[estado as EstadoAsiento]
    if (!config) return null
    
    const Icon = config.icon
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: config.color,
        color: 'white'
      }}>
        <Icon size={12} />
        {config.label}
      </span>
    )
  }

  const getOrigenBadge = (asiento: AsientoContable) => {
    const isAutomatic = asiento.source_event_id || asiento.origen
    
    if (isAutomatic) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.375rem 0.75rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: '600',
          background: '#8b5cf6',
          color: 'white'
        }}
        title={asiento.origen || 'Generado automáticamente'}
        >
          <Zap size={12} />
          Automático
        </span>
      )
    }
    
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.375rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: '#f59e0b',
        color: 'white'
      }}
      title="Creado manualmente"
      >
        <Edit3 size={12} />
        Manual
      </span>
    )
  }

  const isBalanced = (asiento: AsientoContable) => {
    return Math.abs(asiento.total_debe - asiento.total_haber) < 0.01
  }

  // Filtrar asientos
  const filteredAsientos = asientos.filter(asiento => {
    // Filtro de búsqueda por número de asiento
    if (numeroAsientoSearch) {
      const search = numeroAsientoSearch.toLowerCase()
      if (!asiento.numero_asiento.toLowerCase().includes(search)) {
        return false
      }
    }

    // Filtro de búsqueda general (concepto y referencia)
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchesSearch = 
        asiento.concepto.toLowerCase().includes(search) ||
        (asiento.referencia && asiento.referencia.toLowerCase().includes(search))
      
      if (!matchesSearch) return false
    }

    // Filtro de estado
    if (estadoFilter !== 'TODOS' && asiento.estado !== estadoFilter) {
      return false
    }

    // Filtro de origen
    if (origenFilter !== 'TODOS') {
      const isAutomatic = asiento.source_event_id || asiento.origen
      if (origenFilter === 'AUTOMATICO' && !isAutomatic) return false
      if (origenFilter === 'MANUAL' && isAutomatic) return false
    }

    // Filtro de fecha desde
    if (fechaDesde && asiento.fecha < fechaDesde) {
      return false
    }

    // Filtro de fecha hasta
    if (fechaHasta && asiento.fecha > fechaHasta) {
      return false
    }

    return true
  })

  // Estadísticas
  const stats = {
    total: asientos.length,
    automaticos: asientos.filter(a => a.source_event_id || a.origen).length,
    manuales: asientos.filter(a => !a.source_event_id && !a.origen).length,
    descuadrados: asientos.filter(a => !isBalanced(a)).length
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando asientos contables...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--primary-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-600)'
            }}>
              <FileText size={24} />
            </div>
            <h1 className="dashboard-title">Asientos Contables</h1>
          </div>
          <p className="dashboard-subtitle">
            Gestione y visualice todos los asientos contables del sistema
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={loadAsientos}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button
            onClick={() => router.push('/dashboard/contabilidad/asientos/nuevo')}
            className="primary-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <Plus size={16} />
            Nuevo Asiento Manual
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Total Asientos
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary-800)' }}>
            {stats.total}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Automáticos
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>
            {stats.automaticos}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Manuales
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
            {stats.manuales}
          </div>
        </div>

        <div className="activity-card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginBottom: '0.5rem', fontWeight: '600' }}>
            Descuadrados
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: stats.descuadrados > 0 ? '#ef4444' : '#10b981' }}>
            {stats.descuadrados}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '2px solid var(--primary-100)'
        }}>
          <Filter size={20} style={{ color: 'var(--primary-600)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
            Filtros
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Número de Asiento
            </label>
            <div style={{ position: 'relative' }}>
              <FileText size={16} style={{ 
                position: 'absolute', 
                left: '0.75rem', 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: 'var(--primary-400)'
              }} />
              <input
                type="text"
                value={numeroAsientoSearch}
                onChange={(e) => setNumeroAsientoSearch(e.target.value)}
                placeholder="Ej: ASI-2024-001"
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  border: '1px solid var(--primary-300)',
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Buscar en Concepto
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ 
                position: 'absolute', 
                left: '0.75rem', 
                top: '50%', 
                transform: 'translateY(-50%)',
                color: 'var(--primary-400)'
              }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Concepto, referencia..."
                style={{
                  width: '100%',
                  padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                  border: '1px solid var(--primary-300)',
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Estado
            </label>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="TODOS">Todos</option>
              <option value="BORRADOR">Borrador</option>
              <option value="CONFIRMADO">Confirmado</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Origen
            </label>
            <select
              value={origenFilter}
              onChange={(e) => setOrigenFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                background: 'white'
              }}
            >
              <option value="TODOS">Todos</option>
              <option value="AUTOMATICO">Automático</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}
            />
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: '600', 
              marginBottom: '0.5rem',
              color: 'var(--primary-700)'
            }}>
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--primary-300)',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}
            />
          </div>
        </div>

        {(numeroAsientoSearch || searchTerm || estadoFilter !== 'TODOS' || origenFilter !== 'TODOS' || fechaDesde || fechaHasta) && (
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setNumeroAsientoSearch('')
                setSearchTerm('')
                setEstadoFilter('TODOS')
                setOrigenFilter('TODOS')
                setFechaDesde('')
                setFechaHasta('')
              }}
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--primary-100)',
                color: 'var(--primary-700)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Lista de Asientos */}
      <div className="activity-card">
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

        {filteredAsientos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--primary-400)' }}>
            <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--primary-600)' }}>
              No hay asientos contables
            </h3>
            <p style={{ marginBottom: '1.5rem' }}>
              {asientos.length === 0 
                ? 'Aún no se han creado asientos contables'
                : 'No se encontraron asientos con los filtros aplicados'
              }
            </p>
            {asientos.length === 0 && (
              <button
                onClick={() => router.push('/dashboard/contabilidad/asientos/nuevo')}
                className="primary-btn"
              >
                <Plus size={16} />
                Crear Primer Asiento
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                    Número
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
                    Fecha
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
                    Concepto
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
                    Origen
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
                    Total
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Estado
                  </th>
                  <th style={{ 
                    textAlign: 'center', 
                    padding: '0.75rem', 
                    fontWeight: '600', 
                    fontSize: '0.75rem', 
                    textTransform: 'uppercase', 
                    color: 'var(--primary-600)',
                    letterSpacing: '0.05em'
                  }}>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAsientos.map((asiento) => (
                  <tr 
                    key={asiento.id}
                    onClick={() => router.push(`/dashboard/contabilidad/asientos/${asiento.id}`)}
                    style={{ 
                      borderBottom: '1px solid var(--primary-100)',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-50)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                        {asiento.numero_asiento}
                      </div>
                      {asiento.referencia && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary-500)', marginTop: '0.25rem' }}>
                          Ref: {asiento.referencia}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={14} style={{ color: 'var(--primary-400)' }} />
                        <span style={{ fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                          {formatDate(asiento.fecha)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: 'var(--primary-700)',
                        maxWidth: '300px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {asiento.concepto}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {getOrigenBadge(asiento)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--primary-800)' }}>
                        {formatCurrency(asiento.total_debe)}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {getEstadoBadge(asiento.estado)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {isBalanced(asiento) ? (
                        <CheckCircle size={20} style={{ color: 'var(--emerald-600)' }} />
                      ) : (
                        <AlertCircle size={20} style={{ color: 'var(--red-600)' }} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredAsientos.length > 0 && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '1rem',
            borderTop: '1px solid var(--primary-200)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', color: 'var(--primary-600)' }}>
              Mostrando {filteredAsientos.length} de {asientos.length} asientos
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
