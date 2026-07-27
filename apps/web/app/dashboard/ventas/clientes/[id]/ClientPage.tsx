'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { ArrowLeft, Edit, Mail, Phone, MapPin } from 'lucide-react'

export default function ClienteDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.push('/dashboard/ventas/clientes')} className="inline-flex items-center gap-2 py-2.5 px-4 text-[0.875rem] font-medium text-[var(--primary-700)] bg-card/80 border cursor-pointer transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <button
            onClick={() => router.push(`/dashboard/ventas/clientes/${clienteId}/editar`)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            <Edit size={16} />
            Editar
          </button>
        </div>
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">{cliente.razon_social}</h1>
          {cliente.nombre_comercial && (
            <p className="mt-2 text-base text-muted-foreground">{cliente.nombre_comercial}</p>
          )}
        </div>
      </div>

      {/* Information Card */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
        <h2 className="text-2xl font-semibold mb-6 text-[var(--primary-900)]">
          Información General
        </h2>

        <div className="grid grid-cols-[repeat(auto-fit,_minmax(250px,_1fr))] gap-6">
          <div>
            <label className="text-[0.875rem] font-medium text-[var(--primary-600)] block mb-2">
              Tipo de Cliente
            </label>
            <span className="inline-block py-1 px-3 rounded-full text-[0.875rem] font-medium">
              {cliente.tipo}
            </span>
          </div>

          <div>
            <label className="text-[0.875rem] font-medium text-[var(--primary-600)] block mb-2">
              Tipo de Documento
            </label>
            <p className="text-base text-[var(--primary-900)]">{cliente.documento_tipo}</p>
          </div>

          <div>
            <label className="text-[0.875rem] font-medium text-[var(--primary-600)] block mb-2">
              Número de Documento
            </label>
            <p className="text-base font-semibold text-[var(--primary-900)]">
              {cliente.numero_documento}
            </p>
          </div>

          {cliente.direccion && (
            <div>
              <label className="text-[0.875rem] font-medium text-[var(--primary-600)] flex items-center gap-2 mb-2">
                <MapPin size={16} />
                Dirección
              </label>
              <p className="text-base text-[var(--primary-900)]">{cliente.direccion}</p>
            </div>
          )}

          {cliente.email && (
            <div>
              <label className="text-[0.875rem] font-medium text-[var(--primary-600)] flex items-center gap-2 mb-2">
                <Mail size={16} />
                Email
              </label>
              <p className="text-base text-[var(--primary-900)]">{cliente.email}</p>
            </div>
          )}

          {cliente.telefono && (
            <div>
              <label className="text-[0.875rem] font-medium text-[var(--primary-600)] flex items-center gap-2 mb-2">
                <Phone size={16} />
                Teléfono
              </label>
              <p className="text-base text-[var(--primary-900)]">{cliente.telefono}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

