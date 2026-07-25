'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import ClienteForm from '@/components/ventas/ClienteForm'
import { ArrowLeft } from 'lucide-react'

export default function EditarClientePage() {
  const router = useRouter()
  const params = useParams()
  const { get, put } = useApi()
  const clienteId = params.id as string

  const [cliente, setCliente] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadCliente = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get(`/api/ventas/clientes/${clienteId}`)

      if (response?.id) {
        setCliente(response)
      } else {
        alert('Cliente no encontrado')
        router.push('/dashboard/ventas/clientes')
      }
    } catch (error: any) {
      alert(`Error: ${error.message || 'No se pudo cargar el cliente'}`)
      router.push('/dashboard/ventas/clientes')
    } finally {
      setLoading(false)
    }
  }, [clienteId, get, router])

  useEffect(() => {
    loadCliente()
  }, [loadCliente])

  const handleSubmit = async (data: any) => {
    try {
      const response = await put(`/api/ventas/clientes/${clienteId}`, data)

      if (response?.id) {
        alert('✅ Cliente actualizado exitosamente')
        router.push(`/dashboard/ventas/clientes/${clienteId}`)
      } else {
        throw new Error('Error al actualizar cliente')
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message || 'No se pudo actualizar el cliente'}`)
      throw error
    }
  }

  const handleCancel = () => {
    router.push(`/dashboard/ventas/clientes/${clienteId}`)
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando cliente...</p>
        </div>
      </div>
    )
  }

  if (!cliente) {
    return null
  }

  return (
    <div className="p-8 max-w-[1200px] my-0 mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleCancel} className="inline-flex items-center gap-2 py-2.5 px-4 text-[0.875rem] font-medium text-[var(--primary-700)] bg-card/80 border cursor-pointer transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
        <div>
          <h1 className="text-[2rem] font-bold text-[var(--primary-900)] m-0">Editar Cliente</h1>
          <p className="text-base text-[var(--primary-600)] mt-1 mr-0 mb-0 ml-0">{cliente.razon_social}</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="p-8 shadow border">
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

