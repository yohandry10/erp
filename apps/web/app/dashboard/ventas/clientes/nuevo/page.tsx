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
      
      // El backend devuelve directamente el cliente creado (con id)
      if (response?.id) {
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
          <ArrowLeft style={{ width: '1rem', height: '1rem' }} />
          Volver
        </button>
        <div>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: 'var(--primary-900)',
            margin: 0
          }}>Nuevo Cliente</h1>
          <p style={{
            fontSize: '1rem',
            color: 'var(--primary-600)',
            margin: '0.25rem 0 0 0'
          }}>Registra un nuevo cliente en el sistema</p>
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
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel="Crear Cliente"
        />
      </div>
    </div>
  )
}
