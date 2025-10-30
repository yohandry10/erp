'use client'

import { useState } from 'react'
import { CheckCircle, X } from 'lucide-react'

interface AprobarOrdenModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (comentarios?: string) => Promise<void>
  ordenNumero: string
}

export default function AprobarOrdenModal({
  isOpen,
  onClose,
  onConfirm,
  ordenNumero
}: AprobarOrdenModalProps) {
  const [comentarios, setComentarios] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleConfirm = async () => {
    try {
      setLoading(true)
      await onConfirm(comentarios || undefined)
      setComentarios('')
      onClose()
    } catch (error) {
      console.error('Error al aprobar orden:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setComentarios('')
      onClose()
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '500px',
        width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid var(--primary-200)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--emerald-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald-600)'
            }}>
              <CheckCircle size={20} />
            </div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
              Aprobar Orden de Compra
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: 'var(--primary-400)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem' }}>
          <p style={{ 
            fontSize: '0.875rem', 
            color: 'var(--primary-600)', 
            marginBottom: '1.5rem',
            lineHeight: '1.6'
          }}>
            ¿Está seguro que desea aprobar la orden de compra <strong>{ordenNumero}</strong>?
          </p>

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
            }}>
              Comentarios (opcional)
            </label>
            <textarea
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              disabled={loading}
              placeholder="Agregue comentarios sobre la aprobación..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--primary-300)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '100px'
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid var(--primary-200)',
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={handleClose}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: '1px solid var(--primary-300)',
              background: 'white',
              color: 'var(--primary-700)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: loading ? 'var(--emerald-400)' : 'var(--emerald-500)',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease'
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid white',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite'
                }} />
                Aprobando...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Aprobar Orden
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
