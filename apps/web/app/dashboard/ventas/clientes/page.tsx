'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cliente, TipoCliente } from '@/types/ventas'
import { 
  Search, 
  Plus, 
  Download, 
  Upload, 
  Edit,
  Trash2,
  Eye,
  Users,
  RefreshCw
} from 'lucide-react'

export default function ClientesPage() {
  const router = useRouter()
  const { get, del } = useApi()
  
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalClientes, setTotalClientes] = useState(0)
  const itemsPerPage = 10

  const getDocumentoCliente = (cliente: Cliente) =>
    String(cliente.ruc || cliente.codigo || cliente.documento_numero || cliente.numero_documento || '-')

  const loadClientes = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (tipoFilter) params.append('tipo', tipoFilter)
      params.append('page', currentPage.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await get(`/api/ventas/clientes?${params.toString()}`)
      
      // El backend devuelve { data: [], pagination: { total, page, limit, totalPages } }
      if (response?.data) {
        setClientes(response.data || [])
        setTotalClientes(response.pagination?.total || 0)
        setTotalPages(response.pagination?.totalPages || 1)
      }
    } catch (error) {
      console.error('Error loading clientes:', error)
      alert('Error: No se pudieron cargar los clientes')
    } finally {
      setLoading(false)
    }
  }, [searchTerm, tipoFilter, currentPage, get])

  useEffect(() => {
    loadClientes()
  }, [loadClientes])

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleFilterChange = (value: string) => {
    setTipoFilter(value)
    setCurrentPage(1)
  }

  const handleDelete = async (id: string, razonSocial: string) => {
    if (!confirm(`¿Está seguro de eliminar el cliente "${razonSocial}"?`)) {
      return
    }

    try {
      await del(`/api/ventas/clientes/${id}`)
      alert('✅ Cliente eliminado correctamente')
      loadClientes()
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'No se pudo eliminar el cliente'}`)
    }
  }

  const handleExport = () => {
    alert('📥 Funcionalidad de exportación próximamente')
  }

  const handleImport = () => {
    alert('📤 Funcionalidad de importación próximamente')
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Clientes</h1>
          <p className="dashboard-subtitle">Gestiona tu base de datos de clientes</p>
        </div>
        <button 
          className="refresh-btn"
          onClick={() => router.push('/dashboard/ventas/clientes/nuevo')}
        >
          <Plus size={20} />
          Nuevo Cliente
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid ventas-stats-grid mb-8">
        <div className="stat-card">
          <div className="stat-header">
            <h3>TOTAL CLIENTES</h3>
            <span className="stat-icon stat-icon-blue">
              <Users />
            </span>
          </div>
          <div className="stat-value">{totalClientes}</div>
          <div className="stat-subtitle">Clientes registrados</div>
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
              placeholder="Buscar por RUC, DNI, nombre o razón social..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)} className="w-[100%] pt-3 pr-4 pb-3 pl-12 rounded-2 border text-[0.875rem]"
            />
          </div>

          <select
            value={tipoFilter}
            onChange={(e) => handleFilterChange(e.target.value)} className="py-3 px-4 rounded-2 border text-[0.875rem] bg-white"
          >
            <option value="">Todos los tipos</option>
            <option value={TipoCliente.PERSONA}>Persona</option>
            <option value={TipoCliente.EMPRESA}>Empresa</option>
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
            onClick={loadClientes}
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
              <p>Cargando clientes...</p>
            </div>
          ) : clientes.length === 0 ? (
            <div className="text-center p-12 text-gray-500">
              <Users size={48} className="text-gray-400" />
              <h3 className="text-[1.125rem] font-semibold mb-2">
                No hay clientes
              </h3>
              <p className="mb-6">
                {searchTerm || tipoFilter 
                  ? 'No se encontraron clientes con los filtros aplicados'
                  : 'Usa el botón "Nuevo Cliente" en la parte superior para agregar tu primer cliente'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-[100%]">
                  <thead>
                    <tr>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        RUC/DNI
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Nombre / Razón Social
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Tipo
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Email
                      </th>
                      <th className="text-left p-4 font-semibold text-3 text-gray-500">
                        Teléfono
                      </th>
                      <th className="text-right p-4 font-semibold text-3 text-gray-500">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((cliente) => (
                      <tr key={cliente.id} className="border-b">
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold">
                            {getDocumentoCliente(cliente)}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="text-[0.875rem] font-semibold text-gray-900">
                            {cliente.razon_social}
                          </div>
                          {cliente.nombre_comercial && (
                            <div className="text-3 text-gray-500">
                              {cliente.nombre_comercial}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="py-1 px-3 rounded-full text-3 font-medium">
                            {cliente.tipo}
                          </span>
                        </td>
                        <td className="p-4 text-[0.875rem] text-gray-500">
                          {cliente.email || '-'}
                        </td>
                        <td className="p-4 text-[0.875rem] text-gray-500">
                          {cliente.telefono || '-'}
                        </td>
                        <td className="p-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => router.push(`/dashboard/ventas/clientes/${cliente.id}`)} className="p-2 rounded-[6px] border-0 bg-blue-500 text-white cursor-pointer"
                              title="Ver detalle"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => router.push(`/dashboard/ventas/clientes/${cliente.id}/editar`)} className="p-2 rounded-[6px] border-0 bg-[#10b981] text-white cursor-pointer"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(cliente.id, cliente.razon_social)} className="p-2 rounded-[6px] border-0 bg-red-500 text-white cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
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
                    <strong>{Math.min(currentPage * itemsPerPage, totalClientes)}</strong> de{' '}
                    <strong>{totalClientes}</strong> clientes
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
