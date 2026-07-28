'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useApi } from '@/hooks/use-api'
import ClienteForm from '@/components/ventas/ClienteForm'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'

export default function NuevoClientePage() {
  const router = useRouter()
  // Los toasts tienen TOAST_LIMIT=1: el que emite el hook queda reemplazado por
  // el genérico de abajo y el usuario pierde el motivo real del rechazo.
  const { post } = useApi({ throwOnError: true, showErrorToast: false })

  const handleSubmit = async (data: any) => {
    try {
      const response = await post('/api/ventas/clientes', data)

      const clienteCreado = response?.data || response;

      if (clienteCreado?.id) {
        toast({
          title: 'Cliente creado',
          description: `Cliente ${data.razon_social} creado exitosamente`
        })
        router.push('/dashboard/ventas/clientes')
      } else {
        throw new Error('Error al crear cliente')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el cliente',
        variant: 'destructive'
      })
      throw error
    }
  }

  const handleCancel = () => {
    router.push('/dashboard/ventas/clientes')
  }

  return (
    <div className="p-8 max-w-[1200px] my-0 mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/ventas/clientes" className="inline-flex items-center gap-2 py-2.5 px-4 text-[0.875rem] font-medium text-[var(--primary-700)] bg-card/80 border cursor-pointer transition"
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
          Volver
        </Link>
        <div>
          <h1 className="text-[2rem] font-bold text-[var(--primary-900)] m-0">Nuevo Cliente</h1>
          <p className="text-base text-[var(--primary-600)] mt-1 mr-0 mb-0 ml-0">Registra un nuevo cliente en el sistema</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="p-8 shadow border">
        <ClienteForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel="Crear Cliente"
        />
      </div>
    </div>
  )
}
