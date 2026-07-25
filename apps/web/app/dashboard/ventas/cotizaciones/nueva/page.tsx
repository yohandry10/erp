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
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          aria-label="Volver a cotizaciones" className="inline-flex items-center justify-center p-2 text-[var(--primary-700)] bg-card/80 border cursor-pointer transition"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--primary-50)'
            e.currentTarget.style.borderColor = 'var(--primary-300)'
            e.currentTarget.style.transform = 'translateX(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'
            e.currentTarget.style.borderColor = 'var(--primary-200)'
            e.currentTarget.style.transform = 'translateX(0)'
          }}
        >
          <ArrowLeft className="w-[1.125rem] h-[1.125rem]" />
        </button>
        <div>
          <h1 className="text-[2rem] font-bold text-[var(--primary-900)] m-0">
            Nueva Cotización
          </h1>
          <p className="text-base text-[var(--primary-600)] mt-1 mr-0 mb-0 ml-0">
            Crea una nueva cotización de venta
          </p>
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
