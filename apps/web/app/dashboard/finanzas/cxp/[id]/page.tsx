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
        <div className="text-center p-12">
          <XCircle size={48} className="text-red-500" />
          <h3>Cuenta por pagar no encontrada</h3>
          <button 
            onClick={() => router.push('/dashboard/finanzas/cxp')} 
            className="refresh-btn mt-4"
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
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/dashboard/finanzas/cxp')} className="p-2 rounded-2 border bg-white cursor-pointer"
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
            onClick={() => setShowPagoModal(true)} className="py-3 px-6 rounded-2 border-0 bg-[#10b981] text-white cursor-pointer text-[0.875rem] font-semibold flex items-center gap-2 transition shadow"
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

      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL</h3>
            <FileText className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value text-6">
            {formatCurrency(cxp.total, cxp.moneda)}
          </div>
          <div className="stat-subtitle">Monto original</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>PAGADO</h3>
            <CheckCircle className="stat-icon text-[#10b981]" />
          </div>
          <div className="stat-value text-6 text-[#10b981]">
            {formatCurrency(totalPagado, cxp.moneda)}
          </div>
          <div className="stat-subtitle">
            {totalPagado > 0 ? `${((totalPagado / cxp.total) * 100).toFixed(1)}% del total` : 'Sin pagos'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>SALDO</h3>
            <DollarSign className="stat-icon" />
          </div>
          <div className="stat-value text-6">
            {formatCurrency(cxp.saldo, cxp.moneda)}
          </div>
          <div className="stat-subtitle">Por pagar</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VENCIMIENTO</h3>
            <Calendar className="stat-icon text-amber-500" />
          </div>
          <div className="stat-value text-[1.125rem]">
            {formatDate(cxp.fecha_vencimiento)}
          </div>
          <div className="stat-subtitle">Fecha límite</div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,_minmax(400px,_1fr))] gap-6">
        <div className="activity-section">
          <h3 className="text-[1.125rem] font-semibold mb-4 flex items-center gap-2">
            <FileText size={20} />
            Información del Documento
          </h3>
          <div className="activity-card">
            <div className="grid gap-4">
              <div>
                <div className="text-3 text-gray-500 mb-1">
                  Número de Documento
                </div>
                <div className="text-4 font-semibold">
                  {cxp.numero_documento}
                </div>
              </div>

              <div>
                <div className="text-3 text-gray-500 mb-1">
                  Tipo de Documento
                </div>
                <div className="text-[0.875rem] font-medium">
                  {cxp.tipo_documento}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1fr] gap-4">
                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    Fecha de Emisión
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {formatDate(cxp.fecha_emision)}
                  </div>
                </div>

                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    Fecha de Vencimiento
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {formatDate(cxp.fecha_vencimiento)}
                  </div>
                </div>
              </div>

              {cxp.condiciones_pago && (
                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    Condiciones de Pago
                  </div>
                  <div className="text-[0.875rem] font-medium">
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
            <h3 className="text-[1.125rem] font-semibold mb-4 flex items-center gap-2">
              <Building2 size={20} />
              Proveedor
            </h3>
            <div className="activity-card">
              <div className="grid gap-4">
                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    Razón Social
                  </div>
                  <div className="text-4 font-semibold">
                    {cxp.proveedor.razon_social}
                  </div>
                </div>

                <div>
                  <div className="text-3 text-gray-500 mb-1">
                    RUC
                  </div>
                  <div className="text-[0.875rem] font-medium">
                    {cxp.proveedor.ruc}
                  </div>
                </div>

                {cxp.proveedor.email && (
                  <div>
                    <div className="text-3 text-gray-500 mb-1">
                      Email
                    </div>
                    <div className="text-[0.875rem] font-medium">
                      {cxp.proveedor.email}
                    </div>
                  </div>
                )}

                {cxp.proveedor.telefono && (
                  <div>
                    <div className="text-3 text-gray-500 mb-1">
                      Teléfono
                    </div>
                    <div className="text-[0.875rem] font-medium">
                      {cxp.proveedor.telefono}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="activity-section mt-6">
        <h3 className="text-[1.125rem] font-semibold mb-4 flex items-center gap-2">
          <History size={20} />
          Historial de Pagos
        </h3>
        <div className="activity-card">
          {loadingPagos ? (
            <div className="text-center p-8 text-gray-500">
              <div className="loading-spinner"></div>
              <p>Cargando historial de pagos...</p>
            </div>
          ) : pagos.length === 0 ? (
            <div className="text-center p-8 text-gray-500">
              <CreditCard size={48} className="text-gray-400" />
              <p>No hay pagos registrados para esta cuenta</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-[100%]">
                <thead>
                  <tr>
                    <th className="text-left p-3 font-semibold text-3 text-gray-500">
                      Fecha
                    </th>
                    <th className="text-left p-3 font-semibold text-3 text-gray-500">
                      Cuenta Bancaria
                    </th>
                    <th className="text-left p-3 font-semibold text-3 text-gray-500">
                      Referencia
                    </th>
                    <th className="text-left p-3 font-semibold text-3 text-gray-500">
                      Método
                    </th>
                    <th className="text-center p-3 font-semibold text-3 text-gray-500">
                      Estado
                    </th>
                    <th className="text-right p-3 font-semibold text-3 text-gray-500">
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((pago: any) => (
                    <tr key={pago.id} className="border-b">
                      <td className="p-3 text-[0.875rem]">
                        {formatDate(pago.fecha)}
                      </td>
                      <td className="p-3 text-[0.875rem]">
                        {pago.cuenta_bancaria ? (
                          <div>
                            <div className="font-medium">{pago.cuenta_bancaria.banco}</div>
                            <div className="text-3 text-gray-500">
                              {pago.cuenta_bancaria.numero_cuenta}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3 text-[0.875rem]">
                        {pago.referencia || '-'}
                      </td>
                      <td className="p-3 text-[0.875rem]">
                        <span className="py-1 px-2 rounded-[4px] text-3 font-medium bg-[#e0f2fe] text-[#0369a1]">
                          {pago.metodo_pago || 'N/A'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {pago.conciliado ? (
                          <span className="inline-flex items-center gap-1 py-1 px-2 rounded-[4px] text-3 font-medium bg-[#dcfce7] text-green-700">
                            <CheckCircle size={12} />
                            Conciliado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 py-1 px-2 rounded-[4px] text-3 font-medium bg-[#fef3c7] text-[#92400e]">
                            <Clock size={12} />
                            Pendiente
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right text-[0.875rem] font-bold text-[#10b981]">
                        {formatCurrency(pago.monto, cxp.moneda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[rgba(16,_185,_129,_0.05)]">
                    <td colSpan={5} className="p-3 text-[0.875rem] font-semibold">
                      Total Pagado
                    </td>
                    <td className="p-3 text-right text-4 font-bold text-[#10b981]">
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
