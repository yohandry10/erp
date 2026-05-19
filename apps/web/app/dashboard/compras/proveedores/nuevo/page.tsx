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
    router.push('/dashboard/compras/proveedores')
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/proveedores')} className="inline-flex items-center gap-2 text-gray-500 text-[0.875rem] mb-2 border-0 cursor-pointer py-1 px-0"
          >
            <ArrowLeft size={16} />
            Volver a Proveedores
          </button>
          <h1 className="dashboard-title flex items-center gap-3">
            <Building2 size={28} />
            Nuevo Proveedor
          </h1>
          <p className="dashboard-subtitle">Complete la información del nuevo proveedor</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="text-white py-4 px-6 rounded-3 mb-8 flex items-center gap-4">
        <div className="text-8">ℹ️</div>
        <div>
          <h3 className="font-semibold mb-1">Información Importante</h3>
          <p className="text-[0.875rem] opacity-[0.95]">
            Los campos marcados con <span className="text-[#fbbf24]">*</span> son obligatorios. 
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
