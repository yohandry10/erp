'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { CreateProveedorDto } from '@/types/compras'
import { ProveedorForm } from '@/components/compras/ProveedorForm'
import { ArrowLeft, Building2 } from 'lucide-react'

export default function NuevoProveedorPage() {
  const router = useRouter()
  const { post } = useApi()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (data: CreateProveedorDto) => {
    setIsLoading(true)
    try {
      const response = await post('/api/compras/proveedores', data)
      
      if (response?.success || response?.id) {
        alert('✅ Proveedor creado exitosamente')
        router.push('/dashboard/compras/proveedores')
      } else {
        throw new Error(response?.message || 'Error al crear el proveedor')
      }
    } catch (error: any) {
      console.error('Error creating proveedor:', error)
      alert(`❌ Error: ${error.message || 'No se pudo crear el proveedor'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (confirm('¿Está seguro de cancelar? Los cambios no guardados se perderán.')) {
      router.push('/dashboard/compras/proveedores')
    }
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/proveedores')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#6b7280',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.25rem 0'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Proveedores
          </button>
          <h1 className="dashboard-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Building2 size={28} />
            Nuevo Proveedor
          </h1>
          <p className="dashboard-subtitle">Complete la información del nuevo proveedor</p>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: 'white',
        padding: '1rem 1.5rem',
        borderRadius: '12px',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '2rem' }}>ℹ️</div>
        <div>
          <h3 style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Información Importante</h3>
          <p style={{ fontSize: '0.875rem', opacity: 0.95 }}>
            Los campos marcados con <span style={{ color: '#fbbf24' }}>*</span> son obligatorios. 
            Asegúrese de ingresar un RUC válido (11 dígitos para Perú, 9 para Colombia) y un email válido.
          </p>
        </div>
      </div>

      {/* Form */}
      <ProveedorForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isLoading}
        submitLabel="Crear Proveedor"
      />
    </div>
  )
}
