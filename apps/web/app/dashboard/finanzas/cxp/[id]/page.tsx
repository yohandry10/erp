'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  ArrowLeft, FileText, Calendar, DollarSign, Building2,
  Clock, CheckCircle, XCircle, CreditCard, History
} from 'lucide-react'
import { PagoProveedorModal } from '@/components/finanzas'

export default function CxpDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const id = params?.id as string
  
  const [cxp, setCxp] = useState<any>(null)
  const [pagos, setPagos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [showPagoModal, setShowPagoModal] = useState(false)

  const loadCxp = useCallback(async () => {
    if (!id) return

    try {
      setLoading(true)
      const response = await get(`/api/finanzas/cxp/${id}`)
      if (response?.success) setCxp(response.data)
    } catch (error) {
      console.error('Error loading cuenta por pagar:', error)
      alert('Error: No se pudo cargar la cuenta por pagar')
    } finally {
      setLoading(false)
    }
  }, [get, id])

  const loadPagos = useCallback(async () => {
    if (!id) return

    try {
      setLoadingPagos(true)
      const response = await get(`/api/finanzas/cxp/${id}/pagos`)
      if (response?.success) setPagos(response.data || [])
    } catch (error) {
      console.error('Error loading pagos:', error)
    } finally {
      setLoadingPagos(false)
    }
  }, [get, id])

  useEffect(() => {
    loadCxp()
    loadPagos()
  }, [loadCxp, loadPagos])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: moneda === 'USD' ? 'USD' : 'PEN',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  }

  const handlePagoSuccess = () => {
    loadCxp()
    loadPagos()
  }

  const canApplyPayment = cxp && cxp.estado !== 'PAGADA' && cxp.estado !== 'ANULADA' && cxp.saldo > 0

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando cuenta por pagar...</p>
        </div>
      </div>
    )
  }

  if (!cxp) {
    return (
      <div className="dashboard-container">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <XCircle size={48} style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
          <h3>Cuenta por pagar no encontrada</h3>
          <button 
            onClick={() => router.push('/dashboard/finanzas/cxp')} 
            className="refresh-btn" 
            style={{ marginTop: '1rem' }}
          >
            <ArrowLeft size={16} /> Volver a la lista
          </button>
        </div>
      </div>
    )
  }

  const totalPagado = cxp.total - cxp.saldo

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button 
            onClick={() => router.push('/dashboard/finanzas/cxp')} 
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="dashboard-title">Cuenta por Pagar</h1>
            <p className="dashboard-subtitle">{cxp.numero_documento}</p>
          </div>
        </div>
        {canApplyPayment && (
          <button
            onClick={() => setShowPagoModal(true)}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#059669'
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#10b981'
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.2)'
            }}
          >
            <DollarSign size={18} />
            Aplicar Pago
          </button>
        )}
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL</h3>
            <FileText className="stat-icon" style={{ color: '#3b82f6' }} />
          </div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {formatCurrency(cxp.total, cxp.moneda)}
          </div>
          <div className="stat-subtitle">Monto original</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>PAGADO</h3>
            <CheckCircle className="stat-icon" style={{ color: '#10b981' }} />
          </div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: '#10b981' }}>
            {formatCurrency(totalPagado, cxp.moneda)}
          </div>
          <div className="stat-subtitle">
            {totalPagado > 0 ? `${((totalPagado / cxp.total) * 100).toFixed(1)}% del total` : 'Sin pagos'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>SALDO</h3>
            <DollarSign className="stat-icon" style={{ color: cxp.saldo > 0 ? '#ef4444' : '#10b981' }} />
          </div>
          <div className="stat-value" style={{ fontSize: '1.5rem', color: cxp.saldo > 0 ? '#ef4444' : '#10b981' }}>
            {formatCurrency(cxp.saldo, cxp.moneda)}
          </div>
          <div className="stat-subtitle">Por pagar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VENCIMIENTO</h3>
            <Calendar className="stat-icon" style={{ color: '#f59e0b' }} />
          </div>
          <div className="stat-value" style={{ fontSize: '1.125rem' }}>
            {formatDate(cxp.fecha_vencimiento)}
          </div>
          <div className="stat-subtitle">Fecha límite</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        <div className="activity-section">
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} />
            Información del Documento
          </h3>
          <div className="activity-card">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Número de Documento
                </div>
                <div style={{ fontSize: '1rem', fontWeight: '600', fontFamily: 'monospace' }}>
                  {cxp.numero_documento}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  Tipo de Documento
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                  {cxp.tipo_documento}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Fecha de Emisión
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {formatDate(cxp.fecha_emision)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Fecha de Vencimiento
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {formatDate(cxp.fecha_vencimiento)}
                  </div>
                </div>
              </div>

              {cxp.condiciones_pago && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Condiciones de Pago
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                    {cxp.condiciones_pago}
                    {cxp.dias_credito && ` (${cxp.dias_credito} días)`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {cxp.proveedor && (
          <div className="activity-section">
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={20} />
              Proveedor
            </h3>
            <div className="activity-card">
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Razón Social
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: '600' }}>
                    {cxp.proveedor.razon_social}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    RUC
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', fontFamily: 'monospace' }}>
                    {cxp.proveedor.ruc}
                  </div>
                </div>

                {cxp.proveedor.email && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      Email
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                      {cxp.proveedor.email}
                    </div>
                  </div>
                )}

                {cxp.proveedor.telefono && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      Teléfono
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                      {cxp.proveedor.telefono}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="activity-section" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <History size={20} />
          Historial de Pagos
        </h3>
        <div className="activity-card">
          {loadingPagos ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
              <p>Cargando historial de pagos...</p>
            </div>
          ) : pagos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              <CreditCard size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
              <p>No hay pagos registrados para esta cuenta</p>
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Fecha
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Cuenta Bancaria
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Referencia
                    </th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Método
                    </th>
                    <th style={{ textAlign: 'center', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Estado
                    </th>
                    <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280' }}>
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((pago: any) => (
                    <tr key={pago.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                        {formatDate(pago.fecha)}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                        {pago.cuenta_bancaria ? (
                          <div>
                            <div style={{ fontWeight: '500' }}>{pago.cuenta_bancaria.banco}</div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace' }}>
                              {pago.cuenta_bancaria.numero_cuenta}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                        {pago.referencia || '-'}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          background: '#e0f2fe',
                          color: '#0369a1'
                        }}>
                          {pago.metodo_pago || 'N/A'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {pago.conciliado ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            background: '#dcfce7',
                            color: '#15803d'
                          }}>
                            <CheckCircle size={12} />
                            Conciliado
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            background: '#fef3c7',
                            color: '#92400e'
                          }}>
                            <Clock size={12} />
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '700', color: '#10b981' }}>
                        {formatCurrency(pago.monto, cxp.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(0,0,0,0.1)', background: 'rgba(16, 185, 129, 0.05)' }}>
                    <td colSpan={5} style={{ padding: '0.75rem', fontSize: '0.875rem', fontWeight: '600' }}>
                      Total Pagado
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '1rem', fontWeight: '700', color: '#10b981' }}>
                      {formatCurrency(totalPagado, cxp.moneda)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Pago Modal */}
      {cxp && (
        <PagoProveedorModal
          isOpen={showPagoModal}
          onClose={() => setShowPagoModal(false)}
          cxpId={cxp.id}
          cxpNumero={cxp.numero_documento}
          saldoPendiente={cxp.saldo}
          moneda={cxp.moneda}
          onPagoSuccess={handlePagoSuccess}
        />
      )}
    </div>
  )
}
