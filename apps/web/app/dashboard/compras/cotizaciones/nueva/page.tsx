'use client'

import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { CotizacionCompraWizard } from '@/components/compras/CotizacionCompraWizard'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

export default function NuevaCotizacionPage() {
  const router = useRouter()
  const { post } = useApi()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (data: any) => {
    try {
      setIsLoading(true)
      console.log('📤 Enviando cotización:', data)
      
      const response = await post('/api/compras/cotizaciones', data)
      
      if (response?.success) {
        alert('✅ Cotización creada exitosamente')
        router.push('/dashboard/compras/cotizaciones')
      } else {
        throw new Error(response?.message || 'Error al crear la cotización')
      }
    } catch (error: any) {
      console.error('❌ Error creando cotización:', error)
      alert(`Error: ${error.message || 'No se pudo crear la cotización'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (confirm('¿Está seguro de cancelar? Se perderán los datos ingresados.')) {
      router.push('/dashboard/compras/cotizaciones')
    }
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/cotizaciones')} className="flex items-center gap-2 py-2 px-4 rounded-2 border bg-white cursor-pointer mb-4 text-[0.875rem] font-medium"
          >
            <ArrowLeft size={16} />
            Volver a Cotizaciones
          </button>
          <h1 className="dashboard-title">Nueva Cotización de Compra</h1>
          <p className="dashboard-subtitle">Complete el formulario para crear una nueva cotización</p>
        </div>
      </div>

      {/* Wizard */}
      <div className="activity-section">
        <CotizacionCompraWizard
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
