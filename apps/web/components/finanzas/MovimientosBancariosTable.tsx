import { 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  Clock,
  Building2,
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

interface MovimientoBancario {
  id: string
  cuenta_bancaria_id: string
  tipo: 'ABONO' | 'CARGO'
  monto: number
  fecha: string
  descripcion: string
  referencia: string | null
  conciliado: boolean
  cxp_id: string | null
  proveedor_id: string | null
  proveedores?: {
    id: string
    razon_social: string
    ruc: string
  }
  created_at: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface MovimientosBancariosTableProps {
  movimientos: MovimientoBancario[]
  loading: boolean
  moneda: string
  pagination: Pagination
  onPageChange: (page: number) => void
}

export default function MovimientosBancariosTable({
  movimientos,
  loading,
  moneda,
  pagination,
  onPageChange
}: MovimientosBancariosTableProps) {
  const formatCurrency = (amount: number, currency: string = 'PEN') => {
    const curr = currency === 'USD' ? 'USD' : currency === 'EUR' ? 'EUR' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: curr,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="activity-card">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando movimientos...</p>
        </div>
      </div>
    )
  }

  if (movimientos.length === 0) {
    return (
      <div className="activity-card">
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <FileText size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            No hay movimientos
          </h3>
          <p>
            No se encontraron movimientos bancarios con los filtros aplicados
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-card">
      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontSize: '0.875rem'
        }}>
          <thead>
            <tr style={{ 
              borderBottom: '2px solid #e5e7eb',
              background: '#f9fafb'
            }}>
              <th style={{ 
                padding: '0.75rem 1rem', 
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Fecha
              </th>
              <th style={{ 
                padding: '0.75rem 1rem', 
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Tipo
              </th>
              <th style={{ 
                padding: '0.75rem 1rem', 
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Descripción
              </th>
              <th style={{ 
                padding: '0.75rem 1rem', 
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Proveedor
              </th>
              <th style={{ 
                padding: '0.75rem 1rem', 
                textAlign: 'left',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Referencia
              </th>
              <th style={{ 
                padding: '0.75rem 1rem', 
                textAlign: 'right',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Monto
              </th>
              <th style={{ 
                padding: '0.75rem 1rem', 
                textAlign: 'center',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((movimiento, index) => (
              <tr 
                key={movimiento.id}
                style={{ 
                  borderBottom: '1px solid #e5e7eb',
                  transition: 'background-color 0.15s ease',
                  background: index % 2 === 0 ? 'white' : '#f9fafb'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#f9fafb'
                }}
              >
                {/* Fecha */}
                <td style={{ padding: '1rem' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '500', 
                    color: '#111827',
                    marginBottom: '0.125rem'
                  }}>
                    {formatDate(movimiento.fecha)}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280' 
                  }}>
                    {formatDateTime(movimiento.created_at)}
                  </div>
                </td>

                {/* Tipo */}
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.375rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    background: movimiento.tipo === 'ABONO' 
                      ? 'rgba(16, 185, 129, 0.1)' 
                      : 'rgba(239, 68, 68, 0.1)',
                    color: movimiento.tipo === 'ABONO' ? '#10b981' : '#ef4444'
                  }}>
                    {movimiento.tipo === 'ABONO' ? (
                      <TrendingUp size={12} />
                    ) : (
                      <TrendingDown size={12} />
                    )}
                    {movimiento.tipo}
                  </span>
                </td>

                {/* Descripción */}
                <td style={{ padding: '1rem' }}>
                  <div style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '500', 
                    color: '#111827',
                    maxWidth: '300px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {movimiento.descripcion}
                  </div>
                </td>

                {/* Proveedor */}
                <td style={{ padding: '1rem' }}>
                  {movimiento.proveedores ? (
                    <div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        fontWeight: '500', 
                        color: '#111827',
                        marginBottom: '0.125rem'
                      }}>
                        {movimiento.proveedores.razon_social}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#6b7280',
                        fontFamily: 'monospace'
                      }}>
                        RUC: {movimiento.proveedores.ruc}
                      </div>
                    </div>
                  ) : (
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: '#9ca3af',
                      fontStyle: 'italic'
                    }}>
                      -
                    </span>
                  )}
                </td>

                {/* Referencia */}
                <td style={{ padding: '1rem' }}>
                  {movimiento.referencia ? (
                    <span style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '500', 
                      color: '#6b7280',
                      fontFamily: 'monospace'
                    }}>
                      {movimiento.referencia}
                    </span>
                  ) : (
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: '#9ca3af',
                      fontStyle: 'italic'
                    }}>
                      -
                    </span>
                  )}
                </td>

                {/* Monto */}
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <span style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '700',
                    color: movimiento.tipo === 'ABONO' ? '#10b981' : '#ef4444'
                  }}>
                    {movimiento.tipo === 'ABONO' ? '+' : '-'} {formatCurrency(movimiento.monto, moneda)}
                  </span>
                </td>

                {/* Estado Conciliación */}
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  {movimiento.conciliado ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.625rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981'
                    }}>
                      <CheckCircle size={12} />
                      Conciliado
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.625rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#f59e0b'
                    }}>
                      <Clock size={12} />
                      Pendiente
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: '1.5rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Mostrando {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} movimientos
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: pagination.page === 1 ? '#f3f4f6' : 'white',
                color: pagination.page === 1 ? '#9ca3af' : '#374151',
                cursor: pagination.page === 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>

            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              padding: '0 0.5rem'
            }}>
              <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Página {pagination.page} de {pagination.totalPages}
              </span>
            </div>

            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: pagination.page === pagination.totalPages ? '#f3f4f6' : 'white',
                color: pagination.page === pagination.totalPages ? '#9ca3af' : '#374151',
                cursor: pagination.page === pagination.totalPages ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              Siguiente
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
