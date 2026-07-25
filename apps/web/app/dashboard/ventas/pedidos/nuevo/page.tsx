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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="mb-6">
        <button
          onClick={handleCancel} className="inline-flex items-center gap-2 py-2.5 px-4 text-[0.875rem] font-medium text-[var(--primary-700)] bg-card/80 border cursor-pointer transition mb-4"
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
          <ArrowLeft className="w-4 h-4" />
          Volver a Pedidos
        </button>

        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Nuevo Pedido de Venta</h1>
          <p className="mt-2 text-base text-muted-foreground">
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
