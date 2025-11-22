'use client'

import { useState, useEffect } from 'react'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <button
            onClick={() => router.push('/dashboard/ventas/clientes')}
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
      <div className="activity-card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1.5rem', color: 'var(--primary-900)' }}>
          Información General
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--primary-600)', display: 'block', marginBottom: '0.5rem' }}>
              Tipo de Cliente
            </label>
            <span style={{
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.875rem',
              fontWeight: '500',
              background: cliente.tipo === 'EMPRESA' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              color: cliente.tipo === 'EMPRESA' ? '#2563eb' : '#059669'
            }}>
              {cliente.tipo}
            </span>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--primary-600)', display: 'block', marginBottom: '0.5rem' }}>
              Tipo de Documento
            </label>
            <p style={{ fontSize: '1rem', color: 'var(--primary-900)' }}>{cliente.documento_tipo}</p>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--primary-600)', display: 'block', marginBottom: '0.5rem' }}>
              Número de Documento
            </label>
            <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-900)', fontFamily: 'monospace' }}>
              {cliente.numero_documento}
            </p>
          </div>

          {cliente.direccion && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <MapPin size={16} />
                Dirección
              </label>
              <p style={{ fontSize: '1rem', color: 'var(--primary-900)' }}>{cliente.direccion}</p>
            </div>
          )}

          {cliente.email && (
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Mail size={16} />
                Email
              </label>
              <p style={{ fontSize: '1rem', color: 'var(--primary-900)' }}>{cliente.email}</p>
            </div>
          )}

          {cliente.telefono && (
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Phone size={16} />
                Teléfono
              </label>
              <p style={{ fontSize: '1rem', color: 'var(--primary-900)' }}>{cliente.telefono}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
