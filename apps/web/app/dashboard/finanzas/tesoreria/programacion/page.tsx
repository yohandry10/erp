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
      <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-3 font-medium text-white">
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
            onClick={() => router.back()} className="p-2 rounded-[6px] border bg-white cursor-pointer mb-4 inline-flex items-center gap-2"
          >
            <ChevronLeft size={16} />
            Volver
          </button>
          <h1 className="dashboard-title">Programación de Pagos</h1>
          <p className="dashboard-subtitle">Planifica los pagos a proveedores por fecha de vencimiento</p>
        </div>
        <div className="flex gap-4 items-center">
          {selectedPagos.size > 0 && (
            <button
              onClick={handlePagoMasivo} className="py-3 px-6 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer text-[0.875rem] font-semibold flex items-center gap-2"
            >
              <CreditCard size={16} />
              Pagar Seleccionados ({selectedPagos.size})
            </button>
          )}
          <button
            onClick={loadProgramacion}
            className="refresh-btn py-3 px-6"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))]">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL POR PAGAR (PEN)</h3>
          </div>
          <div className="stat-value text-6 text-red-500">
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
          <div className="stat-value text-6 text-red-500">
            {formatCurrency(totalPorPagarUSD, 'USD')}
          </div>
          <div className="stat-subtitle">
            {pagos.filter(p => p.moneda === 'USD').length} pago(s)
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>VENCIDOS</h3>
            <AlertCircle className="stat-icon text-red-500" />
          </div>
          <div className="stat-value text-red-500">
            {pagosPorUrgencia.VENCIDA}
          </div>
          <div className="stat-subtitle">
            Requieren atención inmediata
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>URGENTES</h3>
            <AlertCircle className="stat-icon text-amber-500" />
          </div>
          <div className="stat-value text-amber-500">
            {pagosPorUrgencia.HOY + pagosPorUrgencia.URGENTE}
          </div>
          <div className="stat-subtitle">
            Vencen en 0-7 días
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="activity-section">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-[1.125rem] font-semibold flex items-center gap-2">
            <Filter size={20} />
            Filtros
          </h2>
          <button
            onClick={clearFilters} className="py-2 px-4 rounded-[6px] border bg-white cursor-pointer text-[0.875rem]"
          >
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
          <div>
            <label className="block text-[0.875rem] font-medium mb-2">
              Fecha Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
            />
          </div>

          <div>
            <label className="block text-[0.875rem] font-medium mb-2">
              Fecha Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
            />
          </div>

          <div>
            <label className="block text-[0.875rem] font-medium mb-2">
              Estado
            </label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
            >
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PARCIAL">Parcial</option>
              <option value="VENCIDA">Vencida</option>
            </select>
          </div>

          <div>
            <label className="block text-[0.875rem] font-medium mb-2">
              Urgencia
            </label>
            <select
              value={urgenciaFilter}
              onChange={(e) => setUrgenciaFilter(e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
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
            <div className="text-center p-12 text-gray-500">
              <Calendar size={48} className="text-[#d1d5db]" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay pagos programados
              </h3>
              <p>No se encontraron cuentas por pagar con los filtros seleccionados</p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="p-4 w-10">
                        <input
                          type="checkbox"
                          checked={selectedPagos.size === pagos.length && pagos.length > 0}
                          onChange={handleSelectAll} className="cursor-pointer"
                        />
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Urgencia
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Proveedor
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        N° Documento
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Emisión
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Vencimiento
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
                        Total
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
                        Saldo
                      </th>
                      <th className="text-center p-4 font-semibold text-3 text-gray-500">
                        Estado
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((pago) => (
                      <tr 
                        key={pago.id} className="border-b"
                      >
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedPagos.has(pago.id)}
                            onChange={() => handleSelectPago(pago.id)} className="cursor-pointer"
                          />
                        </td>
                        <td className="p-4">
                          {getUrgenciaBadge(pago.urgencia)}
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-medium">
                            {pago.proveedor?.razon_social || 'N/A'}
                          </div>
                          <div className="text-3 text-gray-500">
                            RUC: {pago.proveedor?.ruc || 'N/A'}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold">
                            {pago.numero_documento}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem]">
                            {formatDate(pago.fecha_emision)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-medium">
                            {formatDate(pago.fecha_vencimiento)}
                          </div>
                          <div className="text-3">
                            {pago.dias_hasta_vencimiento < 0 
                              ? `Vencido hace ${Math.abs(pago.dias_hasta_vencimiento)} días`
                              : pago.dias_hasta_vencimiento === 0
                              ? 'Vence hoy'
                              : `Vence en ${pago.dias_hasta_vencimiento} días`
                            }
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="text-[0.875rem] font-semibold">
                            {formatCurrency(pago.total, pago.moneda)}
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <div className="text-[0.875rem] font-bold text-red-500">
                            {formatCurrency(pago.saldo, pago.moneda)}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className="py-1 px-3 rounded-full text-3 font-medium">
                            {pago.estado}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => router.push(`/dashboard/finanzas/cxp/${pago.id}`)} className="py-2 px-4 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer text-3 font-semibold"
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
                <div className="flex justify-between items-center mt-6 pt-6 border-t">
                  <div className="text-[0.875rem] text-gray-500">
                    Mostrando {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} de {total} pagos
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1} className="py-2 px-4 rounded-[6px] border flex items-center gap-2"
                    >
                      <ChevronLeft size={16} />
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages} className="py-2 px-4 rounded-[6px] border flex items-center gap-2"
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
