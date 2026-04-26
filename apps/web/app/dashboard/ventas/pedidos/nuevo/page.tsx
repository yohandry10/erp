'use client'

import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import PedidoForm, { type PedidoFormData } from '@/components/ventas/PedidoForm'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NuevoPedidoPage() {
  const router = useRouter()
  const { post } = useApi()

  const handleSubmit = async (data: PedidoFormData) => {
    try {
      const response = await post('/ventas/pedidos', data)
      
      if (response?.success) {
        toast({
          title: 'Pedido creado',
          description: `El pedido ${response.data.numero} ha sido creado exitosamente`,
        })
        
        // Redirect to pedido detail
        router.push(`/dashboard/ventas/pedidos/${response.data.id}`)
      } else {
        throw new Error(response?.message || 'Error al crear el pedido')
      }
    } catch (error: any) {
      console.error('Error creating pedido:', error)
      throw error
    }
  }

  const handleCancel = () => {
    router.push('/dashboard/ventas/pedidos')
  }

  return (
    <div className="dashboard-container">
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={handleCancel}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            fontWeight: '500',
            color: 'var(--primary-700)',
            background: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid var(--primary-200)',
            borderRadius: 'var(--border-radius)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '1rem'
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
          <ArrowLeft style={{ width: '1rem', height: '1rem' }} />
          Volver a Pedidos
        </button>
        
        <div>
          <h1 className="dashboard-title">Nuevo Pedido de Venta</h1>
          <p className="dashboard-subtitle">
            Crea un nuevo pedido de venta para un cliente
          </p>
        </div>
      </div>

      <PedidoForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    </div>
  )
}
