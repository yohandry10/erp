'use client'

import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { OCWizard } from '@/components/compras/OCWizard'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

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
        toast.success('✅ Orden de compra creada exitosamente')
        router.push('/dashboard/compras/ordenes')
      } else {
        throw new Error(response?.message || 'Error al crear la orden de compra')
      }
    } catch (error: any) {
      console.error('❌ Error creando orden de compra:', error)
      toast.error(`Error: ${error.message || 'No se pudo crear la orden de compra'}`)
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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/ordenes')} className="flex items-center gap-2 py-2 px-4 rounded-lg border bg-card cursor-pointer mb-4 text-[0.875rem] font-medium"
          >
            <ArrowLeft size={16} />
            Volver a Órdenes de Compra
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Nueva Orden de Compra</h1>
          <p className="mt-2 text-base text-muted-foreground">Complete el formulario para crear una nueva orden de compra</p>
        </div>
      </div>

      {/* Wizard */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <OCWizard
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
