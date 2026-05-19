'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Edit, Trash2, Building2, Mail, Phone, MapPin, User, CreditCard, Calendar } from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface Proveedor {
  id: string
  ruc: string
  razon_social: string
  nombre_comercial: string
  direccion: string | null
  telefono: string | null
  email: string
  contacto: string | null
  condiciones_pago: string
  limite_credito: number
  dias_credito: number
  estado: string
  activo: boolean
  created_at: string
  updated_at: string
}

export default function ProveedorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { get, del } = useApi()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const proveedorId = params.id as string | undefined

  const loadProveedor = useCallback(async () => {
    if (!proveedorId) return

    try {
      setLoading(true)
      setError(null)
      const response = await get(`/compras/proveedores/${proveedorId}`)

      if (response.success && response.data) {
        setProveedor(response.data)
      } else {
        setError('No se pudo cargar el proveedor')
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar el proveedor')
    } finally {
      setLoading(false)
    }
  }, [get, proveedorId])

  useEffect(() => {
    loadProveedor()
  }, [loadProveedor])

  const handleDelete = async () => {
    if (!confirm('¿Está seguro de desactivar este proveedor?')) {
      return
    }

    try {
      const response = await del(`/compras/proveedores/${params.id}`)

      if (response.success) {
        alert('Proveedor desactivado exitosamente')
        router.push('/dashboard/compras/proveedores')
      } else {
        alert(`Error: ${response.error || 'No se pudo desactivar el proveedor'}`)
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Error al desactivar el proveedor'}`)
    }
  }

  const getCondicionesPagoLabel = (condiciones: string) => {
    const labels: Record<string, string> = {
      'CONTADO': 'Contado',
      'CREDITO_15': 'Crédito 15 días',
      'CREDITO_30': 'Crédito 30 días',
      'CREDITO_45': 'Crédito 45 días',
      'CREDITO_60': 'Crédito 60 días',
      'CREDITO_90': 'Crédito 90 días'
    }
    return labels[condiciones] || condiciones
  }

  if (loading) {
    return (
      <div className="p-8">
        <p>Cargando...</p>
      </div>
    )
  }

  if (error || !proveedor) {
    return (
      <div className="p-8">
        <div className="activity-card bg-[#fef2f2]">
          <p className="text-red-800">{error || 'Proveedor no encontrado'}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/compras/proveedores')}
          className="refresh-btn mt-4"
        >
          <ArrowLeft size={16} />
          Volver a Proveedores
        </button>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/dashboard/compras/proveedores')} className="inline-flex items-center gap-2 py-2 px-4 bg-transparent border rounded-2 text-gray-700 text-[0.875rem] cursor-pointer mb-4"
        >
          <ArrowLeft size={16} />
          Volver a Proveedores
        </button>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-[1.875rem] font-bold mb-2">
              {proveedor.razon_social}
            </h1>
            <p className="text-gray-500 text-[0.875rem]">
              RUC: {proveedor.ruc}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/dashboard/compras/proveedores/${params.id}/editar`)}
              className="refresh-btn flex items-center gap-2"
            >
              <Edit size={16} />
              Editar
            </button>
            <button
              onClick={handleDelete} className="flex items-center gap-2 py-3 px-6 bg-red-500 text-white border-0 rounded-2 text-[0.875rem] font-medium cursor-pointer"
            >
              <Trash2 size={16} />
              Desactivar
            </button>
          </div>
        </div>
      </div>

      {/* Estado Badge */}
      <div className="mb-8">
        <span className="inline-block py-2 px-4 rounded-full text-[0.875rem] font-medium"
        >
          {proveedor.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Información Básica */}
      <div className="activity-card mb-6">
        <h3 className="text-[1.125rem] font-semibold mb-6 flex items-center gap-2">
          <Building2 size={20} />
          Información Básica
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-6">
          <div>
            <p className="text-3 text-gray-500 mb-1">RUC</p>
            <p className="text-[0.875rem] font-medium">{proveedor.ruc}</p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">Razón Social</p>
            <p className="text-[0.875rem] font-medium">{proveedor.razon_social}</p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">Nombre Comercial</p>
            <p className="text-[0.875rem] font-medium">{proveedor.nombre_comercial || '-'}</p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">
              <Mail size={12} className="mr-1" />
              Email
            </p>
            <p className="text-[0.875rem] font-medium">{proveedor.email}</p>
          </div>
        </div>
      </div>

      {/* Información de Contacto */}
      <div className="activity-card mb-6">
        <h3 className="text-[1.125rem] font-semibold mb-6 flex items-center gap-2">
          <User size={20} />
          Información de Contacto
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-6">
          <div>
            <p className="text-3 text-gray-500 mb-1">Contacto</p>
            <p className="text-[0.875rem] font-medium">{proveedor.contacto || '-'}</p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">
              <Phone size={12} className="mr-1" />
              Teléfono
            </p>
            <p className="text-[0.875rem] font-medium">{proveedor.telefono || '-'}</p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">
              <MapPin size={12} className="mr-1" />
              Dirección
            </p>
            <p className="text-[0.875rem] font-medium">{proveedor.direccion || '-'}</p>
          </div>
        </div>
      </div>

      {/* Condiciones Comerciales */}
      <div className="activity-card mb-6">
        <h3 className="text-[1.125rem] font-semibold mb-6 flex items-center gap-2">
          <CreditCard size={20} />
          Condiciones Comerciales
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-6">
          <div>
            <p className="text-3 text-gray-500 mb-1">Condiciones de Pago</p>
            <p className="text-[0.875rem] font-medium">
              {getCondicionesPagoLabel(proveedor.condiciones_pago)}
            </p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">Límite de Crédito</p>
            <p className="text-[0.875rem] font-medium">
              PEN {proveedor.limite_credito.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">Días de Crédito</p>
            <p className="text-[0.875rem] font-medium">{proveedor.dias_credito} días</p>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="activity-card">
        <h3 className="text-[1.125rem] font-semibold mb-6 flex items-center gap-2">
          <Calendar size={20} />
          Información del Sistema
        </h3>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-6">
          <div>
            <p className="text-3 text-gray-500 mb-1">Fecha de Creación</p>
            <p className="text-[0.875rem] font-medium">
              {new Date(proveedor.created_at).toLocaleString('es-PE')}
            </p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">Última Actualización</p>
            <p className="text-[0.875rem] font-medium">
              {new Date(proveedor.updated_at).toLocaleString('es-PE')}
            </p>
          </div>

          <div>
            <p className="text-3 text-gray-500 mb-1">Estado</p>
            <p className="text-[0.875rem] font-medium">{proveedor.estado}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
