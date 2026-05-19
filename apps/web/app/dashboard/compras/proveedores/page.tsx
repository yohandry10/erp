'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Proveedor } from '@/types/compras'
import { 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Edit,
  Trash2,
  Eye,
  Building2,
  RefreshCw,
  Filter
} from 'lucide-react'

export default function ProveedoresPage() {
  const router = useRouter()
  const { get, del } = useApi()
  
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activoFilter, setActivoFilter] = useState<string>('')
  const [condicionesPagoFilter, setCondicionesPagoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProveedores, setTotalProveedores] = useState(0)
  const loadRequestIdRef = useRef(0)
  const itemsPerPage = 10

  const loadProveedores = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (searchTerm) params.append('search', searchTerm)
      if (activoFilter !== '') params.append('activo', activoFilter)
      if (condicionesPagoFilter) params.append('condiciones_pago', condicionesPagoFilter)
      
      // Calculate offset for pagination
      const offset = (currentPage - 1) * itemsPerPage
      params.append('limit', itemsPerPage.toString())
      params.append('offset', offset.toString())

      const response = await get(`/api/compras/proveedores?${params.toString()}`)

      if (requestId !== loadRequestIdRef.current) {
        return
      }
      
      if (response?.success) {
        const data = response.data || []
        setProveedores(data)
        setTotalProveedores(response.count || data.length)
        setTotalPages(Math.ceil((response.count || data.length) / itemsPerPage))
      }
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return
      }
      console.error('Error loading proveedores:', error)
      alert('Error: No se pudieron cargar los proveedores')
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [searchTerm, activoFilter, condicionesPagoFilter, currentPage, get])

  useEffect(() => {
    loadProveedores()
  }, [loadProveedores])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleActivoFilterChange = (value: string) => {
    setActivoFilter(value)
    setCurrentPage(1)
  }

  const handleCondicionesPagoFilterChange = (value: string) => {
    setCondicionesPagoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async (id: string, razonSocial: string) => {
    if (!confirm(`¿Está seguro de desactivar el proveedor "${razonSocial}"?`)) {
      return
    }

    try {
      await del(`/api/compras/proveedores/${id}`)
      alert('✅ Proveedor desactivado correctamente')
      loadProveedores()
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'No se pudo desactivar el proveedor'}`)
    }
  }

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  const handleImport = () => {
    alert('📤 Funcionalidad de importación próximamente')
  }

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
    }).format(amount)
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Proveedores</h1>
          <p className="dashboard-subtitle">Gestiona tu red de proveedores estratégicos</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={() => router.push('/dashboard/compras/proveedores/nuevo')}
        >
          <Plus size={20} />
          Nuevo Proveedor
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL PROVEEDORES</h3>
            <Building2 className="stat-icon text-blue-500" />
          </div>
          <div className="stat-value">{totalProveedores}</div>
          <div className="stat-subtitle">Proveedores registrados</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>ACTIVOS</h3>
            <span className="stat-icon text-6">✅</span>
          </div>
          <div className="stat-value">
            {proveedores.filter(p => p.activo).length}
          </div>
          <div className="stat-subtitle">Proveedores activos</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h3>INACTIVOS</h3>
            <span className="stat-icon text-6">⏸️</span>
          </div>
          <div className="stat-value">
            {proveedores.filter(p => !p.activo).length}
          </div>
          <div className="stat-subtitle">Proveedores inactivos</div>
        </div>
      </div>

      {/* Filters */}
      <div className="activity-section">
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex-[1] min-w-[300px] relative">
            <Search 
              size={20} className="absolute left-4 top-[50%] -translate-y-1/2 text-gray-400" 
            />
            <input
              type="text"
              placeholder="Buscar por RUC, razón social o nombre comercial..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-2 border text-[0.875rem]"
            />
          </div>

          <select
            value={activoFilter}
            onChange={(e) => handleActivoFilterChange(e.target.value)} className="py-3 px-4 rounded-2 border text-[0.875rem] bg-white min-w-[150px]"
          >
            <option value="">Todos los estados</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>

          <select
            value={condicionesPagoFilter}
            onChange={(e) => handleCondicionesPagoFilterChange(e.target.value)} className="py-3 px-4 rounded-2 border text-[0.875rem] bg-white min-w-[180px]"
          >
            <option value="">Todas las condiciones</option>
            <option value="CONTADO">Contado</option>
            <option value="CREDITO_7">Crédito 7 días</option>
            <option value="CREDITO_15">Crédito 15 días</option>
            <option value="CREDITO_30">Crédito 30 días</option>
            <option value="CREDITO_45">Crédito 45 días</option>
            <option value="CREDITO_60">Crédito 60 días</option>
            <option value="CREDITO_90">Crédito 90 días</option>
          </select>

          <button
            onClick={handleImport} className="py-3 px-4 rounded-2 border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Upload size={16} />
            Importar
          </button>

          <button
            onClick={handleExport} className="py-3 px-4 rounded-2 border bg-white cursor-pointer flex items-center gap-2 text-[0.875rem] font-medium"
          >
            <Download size={16} />
            Exportar
          </button>

          <button
            onClick={loadProveedores}
            className="refresh-btn py-3 px-4"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        {/* Table */}
        <div className="activity-card">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <p>Cargando proveedores...</p>
            </div>
          ) : proveedores.length === 0 ? (
            <div className="text-center p-12 text-gray-500">
              <Building2 size={48} className="text-gray-400" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay proveedores
              </h3>
              <p className="mb-6">
                {searchTerm || activoFilter || condicionesPagoFilter
                  ? 'No se encontraron proveedores con los filtros aplicados'
                  : 'Comienza agregando tu primer proveedor'}
              </p>
              {!searchTerm && !activoFilter && !condicionesPagoFilter && (
                <button
                  onClick={() => router.push('/dashboard/compras/proveedores/nuevo')}
                  className="refresh-btn"
                >
                  <Plus size={16} />
                  Crear Primer Proveedor
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        RUC
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Razón Social
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Contacto
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Condiciones
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
                        Límite Crédito
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
                    {proveedores.map((proveedor) => (
                      <tr key={proveedor.id} className="border-b">
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold">
                            {proveedor.ruc}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold text-gray-900">
                            {proveedor.razon_social}
                          </div>
                          {proveedor.nombre_comercial && (
                            <div className="text-3 text-gray-500">
                              {proveedor.nombre_comercial}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] text-gray-700">
                            {proveedor.contacto || '-'}
                          </div>
                          {proveedor.email && (
                            <div className="text-3 text-gray-500">
                              {proveedor.email}
                            </div>
                          )}
                          {proveedor.telefono && (
                            <div className="text-3 text-gray-500">
                              📞 {proveedor.telefono}
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-[0.875rem] text-gray-500">
                          {proveedor.condiciones_pago ? (
                            <span className="py-1 px-3 rounded-full text-3 font-medium">
                              {proveedor.condiciones_pago.replace('CREDITO_', 'Crédito ')}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="p-4 text-right text-[0.875rem] font-semibold text-gray-700">
                          {formatCurrency(proveedor.limite_credito)}
                        </td>
                        <td className="p-4 text-center">
                          <span className="py-1 px-3 rounded-full text-3 font-medium">
                            {proveedor.activo ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/compras/proveedores/${proveedor.id}`)} className="p-2 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => router.push(`/dashboard/compras/proveedores/${proveedor.id}/editar`)} className="p-2 rounded-[6px] border-0 bg-[#10b981] text-white cursor-pointer"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            {proveedor.activo && (
                              <button
                                onClick={() => handleDelete(proveedor.id, proveedor.razon_social)} className="p-2 rounded-[6px] border-0 bg-red-500 text-white cursor-pointer"
                                title="Desactivar"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t flex justify-between items-center">
                  <div className="text-[0.875rem] text-gray-700">
                    Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> a{' '}
                    <strong>{Math.min(currentPage * itemsPerPage, totalProveedores)}</strong> de{' '}
                    <strong>{totalProveedores}</strong> proveedores
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1} className="py-2 px-4 rounded-[6px] border text-[0.875rem]"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)} className="py-2 px-4 rounded-[6px] border cursor-pointer text-[0.875rem] min-w-10"
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages} className="py-2 px-4 rounded-[6px] border text-[0.875rem]"
                    >
                      Siguiente
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
