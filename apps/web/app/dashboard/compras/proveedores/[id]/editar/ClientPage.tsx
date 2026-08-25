'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { ProveedorForm } from '@/components/compras/ProveedorForm'
import { useApi } from '@/hooks/use-api'
import { CreateProveedorDto } from '@/types/compras'
import toast from 'react-hot-toast'

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
  suspension_retencion_cuarta_hasta?: string | null
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
        toast.success('Proveedor actualizado exitosamente')
        router.push(`/dashboard/compras/proveedores/${params.id}`)
      } else {
        toast.error(`Error: ${response.error || 'No se pudo actualizar el proveedor'}`)
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message || 'Error al actualizar el proveedor'}`)
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
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl bg-[#fef2f2]">
          <p className="text-destructive">{error || 'Proveedor no encontrado'}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/compras/proveedores')}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 mt-4"
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
          onClick={() => router.push(`/dashboard/compras/proveedores/${params.id}`)} className="inline-flex items-center gap-2 py-2 px-4 bg-transparent border rounded-lg text-foreground/85 text-[0.875rem] cursor-pointer mb-4"
        >
          <ArrowLeft size={16} />
          Volver al Detalle
        </button>

        <h1 className="text-[1.875rem] font-bold mb-2">
          Editar Proveedor
        </h1>
        <p className="text-muted-foreground text-[0.875rem]">
          Actualice la información del proveedor {proveedor.razon_social}
        </p>
      </div>

      {/* Info Banner */}
      <div
        className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8 bg-muted"
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
          dias_credito: proveedor.dias_credito,
          // Sin esto el campo saldría vacío y al guardar cualquier otro cambio
          // se retiraría la suspensión sin que nadie lo pidiera.
          suspension_retencion_cuarta_hasta:
            proveedor.suspension_retencion_cuarta_hasta || ''
        }}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={submitting}
        submitLabel="Actualizar Proveedor"
      />
    </div>
  )
}

