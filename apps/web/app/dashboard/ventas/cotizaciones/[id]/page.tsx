'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cotizacion, EstadoCotizacion } from '@/types/ventas'
import CotizacionForm, { CotizacionFormData } from '@/components/ventas/CotizacionForm'
import ConvertirPedidoButton from '@/components/ventas/ConvertirPedidoButton'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft, Edit, FileText, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ESTADO_COLORS: Record<EstadoCotizacion, string> = {
  [EstadoCotizacion.BORRADOR]: 'bg-gray-100 text-gray-800',
  [EstadoCotizacion.ENVIADA]: 'bg-blue-100 text-blue-800',
  [EstadoCotizacion.APROBADA]: 'bg-green-100 text-green-800',
  [EstadoCotizacion.RECHAZADA]: 'bg-red-100 text-red-800',
  [EstadoCotizacion.CONVERTIDA]: 'bg-purple-100 text-purple-800',
  [EstadoCotizacion.VENCIDA]: 'bg-orange-100 text-orange-800',
}

export default function CotizacionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)

  const cotizacionId = params.id as string

  useEffect(() => {
    loadCotizacion()
  }, [cotizacionId])

  const loadCotizacion = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/cotizaciones/${cotizacionId}`)
      
      if (response?.success && response.data) {
        setCotizacion(response.data)
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo cargar la cotización',
          variant: 'destructive'
        })
        router.push('/dashboard/ventas/cotizaciones')
      }
    } catch (error) {
      console.error('Error loading cotización:', error)
      toast({
        title: 'Error',
        description: 'No se pudo cargar la cotización',
        variant: 'destructive'
      })
      router.push('/dashboard/ventas/cotizaciones')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (data: CotizacionFormData) => {
    try {
      const response = await put(`/api/ventas/cotizaciones/${cotizacionId}`, data)
      
      if (response?.success) {
        toast({
          title: 'Éxito',
          description: 'Cotización actualizada correctamente'
        })
        setIsEditing(false)
        loadCotizacion()
      } else {
        throw new Error(response?.message || 'Error al actualizar la cotización')
      }
    } catch (error: any) {
      console.error('Error updating cotización:', error)
      throw error
    }
  }

  const handleConversionSuccess = (pedidoId: string) => {
    toast({
      title: 'Éxito',
      description: 'Cotización convertida a pedido exitosamente'
    })
    router.push(`/dashboard/ventas/pedidos/${pedidoId}`)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
            <p className="text-gray-600">Cargando cotización...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!cotizacion) {
    return null
  }

  const canEdit = cotizacion.estado === EstadoCotizacion.BORRADOR
  const canConvert = cotizacion.estado === EstadoCotizacion.BORRADOR || 
                     cotizacion.estado === EstadoCotizacion.ENVIADA
  const isConverted = cotizacion.estado === EstadoCotizacion.CONVERTIDA

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">
                Cotización {cotizacion.numero}
              </h1>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                ESTADO_COLORS[cotizacion.estado]
              }`}>
                {cotizacion.estado}
              </span>
            </div>
            <p className="text-gray-600 mt-1">
              {isEditing ? 'Editando cotización' : 'Detalle de la cotización'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {!isEditing && canEdit && (
            <Button
              onClick={() => setIsEditing(true)}
              variant="outline"
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
          )}
          
          {!isEditing && canConvert && !isConverted && (
            <ConvertirPedidoButton
              cotizacionId={cotizacion.id}
              onSuccess={handleConversionSuccess}
            />
          )}
        </div>
      </div>

      {/* Converted Message */}
      {isConverted && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-900">
                Esta cotización ya fue convertida a pedido
              </p>
              <p className="text-sm text-purple-700 mt-1">
                No se puede editar ni convertir nuevamente
              </p>
            </div>
            {/* TODO: Add link to pedido when we have the pedido_id */}
          </div>
        </div>
      )}

      {/* Content */}
      {isEditing ? (
        <CotizacionForm
          cotizacion={cotizacion}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <div className="space-y-6">
          {/* Cliente Info */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Cliente</h3>
            {cotizacion.cliente ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Razón Social</p>
                  <p className="text-base font-medium text-gray-900">{cotizacion.cliente.razon_social}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Documento</p>
                  <p className="text-base font-medium text-gray-900">
                    {cotizacion.cliente.documento_tipo}: {cotizacion.cliente.documento_numero}
                  </p>
                </div>
                {cotizacion.cliente.email && (
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="text-base font-medium text-gray-900">{cotizacion.cliente.email}</p>
                  </div>
                )}
                {cotizacion.cliente.telefono && (
                  <div>
                    <p className="text-sm text-gray-600">Teléfono</p>
                    <p className="text-base font-medium text-gray-900">{cotizacion.cliente.telefono}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">Cliente no disponible</p>
            )}
          </div>

          {/* Fechas */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Fechas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Fecha de Emisión</p>
                <p className="text-base font-medium text-gray-900">{formatDate(cotizacion.fecha)}</p>
              </div>
              {cotizacion.fecha_vencimiento && (
                <div>
                  <p className="text-sm text-gray-600">Fecha de Vencimiento</p>
                  <p className="text-base font-medium text-gray-900">{formatDate(cotizacion.fecha_vencimiento)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Productos */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Productos</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Cantidad
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Precio Unit.
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {cotizacion.detalle.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.descripcion}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{item.cantidad}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {formatCurrency(item.precio_unitario)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Totales</h3>
            <div className="space-y-2 max-w-md ml-auto">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(cotizacion.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">IGV (18%):</span>
                <span className="font-medium">{formatCurrency(cotizacion.igv)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span>{formatCurrency(cotizacion.total)}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          {cotizacion.notas && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Notas</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{cotizacion.notas}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
