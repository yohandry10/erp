'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { ProveedorForm } from '@/components/compras/ProveedorForm'
import { useApi } from '@/hooks/use-api'
import { CreateProveedorDto } from '@/types/compras'

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
}

export default function EditProveedorPage() {
  const params = useParams()
  const router = useRouter()
  const { get, put } = useApi()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
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

  const handleSubmit = async (data: CreateProveedorDto) => {
    try {
      setSubmitting(true)
      const response = await put(`/compras/proveedores/${params.id}`, data)

      if (response.success || response.data) {
        alert('Proveedor actualizado exitosamente')
        router.push(`/dashboard/compras/proveedores/${params.id}`)
      } else {
        alert(`Error: ${response.error || 'No se pudo actualizar el proveedor'}`)
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Error al actualizar el proveedor'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (confirm('¿Está seguro de cancelar? Los cambios no guardados se perderán.')) {
      router.push(`/dashboard/compras/proveedores/${params.id}`)
    }
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
    <div className="p-8 max-w-[1200px] my-0 mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push(`/dashboard/compras/proveedores/${params.id}`)} className="inline-flex items-center gap-2 py-2 px-4 bg-transparent border rounded-2 text-gray-700 text-[0.875rem] cursor-pointer mb-4"
        >
          <ArrowLeft size={16} />
          Volver al Detalle
        </button>

        <h1 className="text-[1.875rem] font-bold mb-2">
          Editar Proveedor
        </h1>
        <p className="text-gray-500 text-[0.875rem]">
          Actualice la información del proveedor {proveedor.razon_social}
        </p>
      </div>

      {/* Info Banner */}
      <div
        className="activity-card mb-8 bg-[#eff6ff]"
      >
        <div className="flex gap-3">
          <AlertCircle size={20} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[0.875rem] text-[#1e40af] mb-1 font-medium">
              Información importante
            </p>
            <p className="text-[0.875rem] text-[#1e40af]">
              Los cambios se aplicarán inmediatamente. Asegúrese de verificar toda la información antes de guardar.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <ProveedorForm
        initialData={{
          ruc: proveedor.ruc,
          razon_social: proveedor.razon_social,
          nombre_comercial: proveedor.nombre_comercial || '',
          direccion: proveedor.direccion || '',
          telefono: proveedor.telefono || '',
          email: proveedor.email,
          contacto: proveedor.contacto || '',
          condiciones_pago: proveedor.condiciones_pago as any,
          limite_credito: proveedor.limite_credito,
          dias_credito: proveedor.dias_credito
        }}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={submitting}
        submitLabel="Actualizar Proveedor"
      />
    </div>
  )
}
