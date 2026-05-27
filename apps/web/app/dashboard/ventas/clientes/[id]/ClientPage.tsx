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
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando cliente...</p>
        </div>
      </div>
    )
  }

  if (!cliente) {
    return null
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => router.push('/dashboard/ventas/clientes')} className="inline-flex items-center gap-2 py-2.5 px-4 text-[0.875rem] font-medium text-[var(--primary-700)] bg-[rgba(255,_255,_255,_0.8)] border cursor-pointer transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <button
            onClick={() => router.push(`/dashboard/ventas/clientes/${clienteId}/editar`)}
            className="refresh-btn"
          >
            <Edit size={16} />
            Editar
          </button>
        </div>
        <div>
          <h1 className="dashboard-title">{cliente.razon_social}</h1>
          {cliente.nombre_comercial && (
            <p className="dashboard-subtitle">{cliente.nombre_comercial}</p>
          )}
        </div>
      </div>

      {/* Information Card */}
      <div className="activity-card mb-8">
        <h2 className="text-6 font-semibold mb-6 text-[var(--primary-900)]">
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
            <p className="text-4 text-[var(--primary-900)]">{cliente.documento_tipo}</p>
          </div>

          <div>
            <label className="text-[0.875rem] font-medium text-[var(--primary-600)] block mb-2">
              Número de Documento
            </label>
            <p className="text-4 font-semibold text-[var(--primary-900)]">
              {cliente.numero_documento}
            </p>
          </div>

          {cliente.direccion && (
            <div>
              <label className="text-[0.875rem] font-medium text-[var(--primary-600)] flex items-center gap-2 mb-2">
                <MapPin size={16} />
                Dirección
              </label>
              <p className="text-4 text-[var(--primary-900)]">{cliente.direccion}</p>
            </div>
          )}

          {cliente.email && (
            <div>
              <label className="text-[0.875rem] font-medium text-[var(--primary-600)] flex items-center gap-2 mb-2">
                <Mail size={16} />
                Email
              </label>
              <p className="text-4 text-[var(--primary-900)]">{cliente.email}</p>
            </div>
          )}

          {cliente.telefono && (
            <div>
              <label className="text-[0.875rem] font-medium text-[var(--primary-600)] flex items-center gap-2 mb-2">
                <Phone size={16} />
                Teléfono
              </label>
              <p className="text-4 text-[var(--primary-900)]">{cliente.telefono}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

