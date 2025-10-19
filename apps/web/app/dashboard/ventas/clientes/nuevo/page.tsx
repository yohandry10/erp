'use client'

import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import ClienteForm from '@/components/ventas/ClienteForm'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NuevoClientePage() {
  const router = useRouter()
  const { post } = useApi()

  const handleSubmit = async (data: any) => {
    try {
      const response = await post('/api/ventas/clientes', data)
      
      if (response?.success) {
        toast({
          title: 'Cliente creado',
          description: `Cliente ${data.razon_social} creado exitosamente`
        })
        router.push('/dashboard/ventas/clientes')
      } else {
        throw new Error(response?.error || 'Error al crear cliente')
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Nuevo Cliente</h1>
          <p className="text-gray-600 mt-1">Registra un nuevo cliente en el sistema</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <ClienteForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel="Crear Cliente"
        />
      </div>
    </div>
  )
}
