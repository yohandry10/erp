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
      <div style={{ padding: '2rem' }}>
        <p>Cargando...</p>
      </div>
    )
  }

  if (error || !proveedor) {
    return (
      <div style={{ padding: '2rem' }}>
        <div className="activity-card" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <p style={{ color: '#991b1b' }}>{error || 'Proveedor no encontrado'}</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/compras/proveedores')}
          className="refresh-btn"
          style={{ marginTop: '1rem' }}
        >
          <ArrowLeft size={16} />
          Volver a Proveedores
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => router.push(`/dashboard/compras/proveedores/${params.id}`)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            color: '#374151',
            fontSize: '0.875rem',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          <ArrowLeft size={16} />
          Volver al Detalle
        </button>

        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', marginBottom: '0.5rem' }}>
          Editar Proveedor
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Actualice la información del proveedor {proveedor.razon_social}
        </p>
      </div>

      {/* Info Banner */}
      <div
        className="activity-card"
        style={{
          marginBottom: '2rem',
          background: '#eff6ff',
          borderColor: '#bfdbfe'
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <AlertCircle size={20} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '0.125rem' }} />
          <div>
            <p style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.25rem', fontWeight: '500' }}>
              Información importante
            </p>
            <p style={{ fontSize: '0.875rem', color: '#1e40af' }}>
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
