'use client'

import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import CotizacionForm, { CotizacionFormData } from '@/components/ventas/CotizacionForm'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NuevaCotizacionPage() {
  const router = useRouter()
  const { post } = useApi()

  const handleSubmit = async (data: CotizacionFormData) => {
    try {
      const response = await post('/api/ventas/cotizaciones', data)
      
      if (response?.success) {
        toast({
          title: 'Éxito',
          description: 'Cotización creada correctamente'
        })
        
        // Redirect to detail page
        if (response.data?.id) {
          router.push(`/dashboard/ventas/cotizaciones/${response.data.id}`)
        } else {
          router.push('/dashboard/ventas/cotizaciones')
        }
      } else {
        throw new Error(response?.message || 'Error al crear la cotización')
      }
    } catch (error: any) {
      console.error('Error creating cotización:', error)
      throw error
    }
  }

  const handleCancel = () => {
    router.push('/dashboard/ventas/cotizaciones')
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
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
          <h1 className="text-3xl font-bold text-gray-900">Nueva Cotización</h1>
          <p className="text-gray-600 mt-1">Crea una nueva cotización de venta</p>
        </div>
      </div>

      {/* Form */}
      <CotizacionForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  )
}
