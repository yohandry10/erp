'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Cliente } from '@/types/ventas'
import ClienteForm from '@/components/ventas/ClienteForm'
import { toast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function EditarClientePage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  const clienteId = params.id as string

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCliente()
  }, [clienteId])

  const loadCliente = async () => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/clientes/${clienteId}`)
      
      if (response?.success) {
        setCliente(response.data)
      } else {
        throw new Error('Cliente no encontrado')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cargar el cliente',
        variant: 'destructive'
      })
      router.push('/dashboard/ventas/clientes')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (data: any) => {
    try {
      const response = await put(`/api/ventas/clientes/${clienteId}`, data)
      
      if (response?.success) {
        toast({
          title: 'Cliente actualizado',
          description: `Cliente ${data.razon_social} actualizado exitosamente`
        })
        router.push(`/dashboard/ventas/clientes/${clienteId}`)
      } else {
        throw new Error(response?.error || 'Error al actualizar cliente')
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar el cliente',
        variant: 'destructive'
      })
      throw error
    }
  }

  const handleCancel = () => {
    router.push(`/dashboard/ventas/clientes/${clienteId}`)
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando cliente...</p>
        </div>
      </div>
    )
  }

  if (!cliente) {
    return null
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
          <h1 className="text-3xl font-bold text-gray-900">Editar Cliente</h1>
          <p className="text-gray-600 mt-1">{cliente.razon_social}</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <ClienteForm
          initialData={cliente}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel="Actualizar Cliente"
        />
      </div>
    </div>
  )
}
