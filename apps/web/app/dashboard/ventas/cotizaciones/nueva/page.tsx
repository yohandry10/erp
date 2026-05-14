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
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => router.back()}
          aria-label="Volver a cotizaciones"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.5rem',
            color: 'var(--primary-700)',
            background: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid var(--primary-200)',
            borderRadius: 'var(--border-radius)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
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
          <ArrowLeft style={{ width: '1.125rem', height: '1.125rem' }} />
        </button>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary-900)', margin: 0 }}>
            Nueva Cotización
          </h1>
          <p style={{ fontSize: '1rem', color: 'var(--primary-600)', margin: '0.25rem 0 0 0' }}>
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
