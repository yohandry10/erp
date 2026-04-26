'use client'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    loadCliente()
  }, [clienteId])

  const loadCliente = async () => {
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
  }

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
    <div style={{
      padding: '2rem',
      maxWidth: '1200px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
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
            transition: 'all 0.2s ease'
          }}
        >
          <ArrowLeft style={{ width: '1rem', height: '1rem' }} />
          Volver
        </button>
        <div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: 'var(--primary-900)',
            margin: 0
          }}>Editar Cliente</h1>
          <p style={{
            fontSize: '1rem',
            color: 'var(--primary-600)',
            margin: '0.25rem 0 0 0'
          }}>{cliente.razon_social}</p>
        </div>
      </div>

      {/* Form Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: 'var(--border-radius-lg)',
        padding: '2rem',
        boxShadow: 'var(--shadow-xl)',
        border: '1px solid rgba(255, 255, 255, 0.3)'
      }}>
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
