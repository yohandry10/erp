'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ClienteDetalle, TipoCliente } from '@/types/ventas'
import { Button } from '@/components/ui/button'
import { 
  ArrowLeft, 
  Edit, 
  Mail, 
  Phone, 
  MapPin, 
  FileText,
  ShoppingCart,
  Receipt,
  Calendar,
  TrendingUp
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function ClienteDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const clienteId = params.id as string

  const [cliente, setCliente] = useState<ClienteDetalle | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCliente()
  }, [clienteId])

  const loadCliente = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/clientes/${clienteId}`)
      
      if (response?.success) {
        setCliente(response.data)
      } else {
        throw new Error('Cliente no encontrado')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cargar el cliente',
        variant: 'destructive'
      })
      router.push('/dashboard/ventas/clientes')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMM yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  const getEstadoBadgeColor = (estado: string) => {
    const colors: Record<string, string> = {
      'BORRADOR': 'bg-gray-100 text-gray-800',
      'ENVIADA': 'bg-blue-100 text-blue-800',
      'APROBADA': 'bg-green-100 text-green-800',
      'CONVERTIDA': 'bg-purple-100 text-purple-800',
      'PENDIENTE': 'bg-yellow-100 text-yellow-800',
      'CONFIRMADO': 'bg-blue-100 text-blue-800',
      'FACTURADO': 'bg-green-100 text-green-800',
      'COMPLETADO': 'bg-green-100 text-green-800',
      'CANCELADO': 'bg-red-100 text-red-800'
    }
    return colors[estado] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando cliente...</p>
        </div>
      </div>
    )
  }

  if (!cliente) {
    return null
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/ventas/clientes')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{cliente.razon_social}</h1>
            {cliente.nombre_comercial && (
              <p className="text-gray-600 mt-1">{cliente.nombre_comercial}</p>
            )}
          </div>
        </div>
        <Button
          onClick={() => router.push(`/dashboard/ventas/clientes/${clienteId}/editar`)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Edit className="w-4 h-4 mr-2" />
          Editar
        </Button>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* General Information */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Información General</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-500">Tipo de Cliente</label>
              <div className="mt-1">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  cliente.tipo === TipoCliente.EMPRESA
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {cliente.tipo}
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Tipo de Documento</label>
              <p className="mt-1 text-gray-900">{cliente.documento_tipo}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Número de Documento</label>
              <p className="mt-1 text-gray-900 font-semibold">{cliente.documento_numero}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-500">Fecha de Registro</label>
              <p className="mt-1 text-gray-900">{formatDate(cliente.created_at)}</p>
            </div>

            {cliente.direccion && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Dirección
                </label>
                <p className="mt-1 text-gray-900">{cliente.direccion}</p>
              </div>
            )}

            {cliente.email && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </label>
                <p className="mt-1 text-gray-900">{cliente.email}</p>
              </div>
            )}

            {cliente.telefono && (
              <div>
                <label className="text-sm font-medium text-gray-500 flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Teléfono
                </label>
                <p className="mt-1 text-gray-900">{cliente.telefono}</p>
              </div>
            )}
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Estadísticas</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cotizaciones</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {cliente.estadisticas?.total_cotizaciones || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <ShoppingCart className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Pedidos</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {cliente.estadisticas?.total_pedidos || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Receipt className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Facturas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {cliente.estadisticas?.total_facturas || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Compras</p>
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(cliente.estadisticas?.total_compras || 0)}
                  </p>
                </div>
              </div>
            </div>

            {cliente.estadisticas?.ultima_compra && (
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>Última compra:</span>
                </div>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {formatDate(cliente.estadisticas.ultima_compra)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Historial de Transacciones</h2>
        
        {!cliente.historial || cliente.historial.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No hay transacciones registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cliente.historial.map((transaccion) => (
                  <tr key={transaccion.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {transaccion.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaccion.numero}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(transaccion.fecha)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        getEstadoBadgeColor(transaccion.estado)
                      }`}>
                        {transaccion.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(transaccion.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const baseUrl = transaccion.tipo === 'COTIZACION' 
                            ? '/dashboard/ventas/cotizaciones'
                            : transaccion.tipo === 'PEDIDO'
                            ? '/dashboard/ventas/pedidos'
                            : '/dashboard/cpe'
                          router.push(`${baseUrl}/${transaccion.id}`)
                        }}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
