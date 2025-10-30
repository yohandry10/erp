'use client'

import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { OCWizard } from '@/components/compras/OCWizard'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

export default function NuevaOrdenCompraPage() {
  const router = useRouter()
  const { post } = useApi()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (data: any) => {
    try {
      setIsLoading(true)
      console.log('📤 Enviando orden de compra:', data)
      
      const response = await post('/api/compras/ordenes', data)
      
      if (response?.success) {
        alert('✅ Orden de compra creada exitosamente')
        router.push('/dashboard/compras/ordenes')
      } else {
        throw new Error(response?.message || 'Error al crear la orden de compra')
      }
    } catch (error: any) {
      console.error('❌ Error creando orden de compra:', error)
      alert(`Error: ${error.message || 'No se pudo crear la orden de compra'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (confirm('¿Está seguro de cancelar? Se perderán los datos ingresados.')) {
      router.push('/dashboard/compras/ordenes')
    }
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/ordenes')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={16} />
            Volver a Órdenes de Compra
          </button>
          <h1 className="dashboard-title">Nueva Orden de Compra</h1>
          <p className="dashboard-subtitle">Complete el formulario para crear una nueva orden de compra</p>
        </div>
      </div>

      {/* Wizard */}
      <div className="activity-section">
        <OCWizard
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
