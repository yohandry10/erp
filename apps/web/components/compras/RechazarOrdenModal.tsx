'use client'

import { useState } from 'react'
import { XCircle, X } from 'lucide-react'

interface RechazarOrdenModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (motivoRechazo: string) => Promise<void>
  ordenNumero: string
}

export default function RechazarOrdenModal({
  isOpen,
  onClose,
  onConfirm,
  ordenNumero
}: RechazarOrdenModalProps) {
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleConfirm = async () => {
    if (!motivoRechazo.trim()) {
      setError('Debe especificar el motivo del rechazo')
      return
    }

    try {
      setLoading(true)
      setError(null)
      await onConfirm(motivoRechazo)
      setMotivoRechazo('')
      onClose()
    } catch (error) {
      console.error('Error al rechazar orden:', error)
      setError('Error al rechazar la orden. Por favor intente nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setMotivoRechazo('')
      setError(null)
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
              background: 'var(--red-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--red-600)'
            }}>
              <XCircle size={20} />
            </div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
              Rechazar Orden de Compra
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
          <div style={{
            background: 'var(--red-50)',
            border: '1px solid var(--red-200)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--red-700)', 
              margin: 0,
              lineHeight: '1.6'
            }}>
              ⚠️ Esta acción rechazará la orden de compra <strong>{ordenNumero}</strong> y cambiará su estado a ANULADA.
            </p>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: 'var(--primary-700)',
              marginBottom: '0.5rem'
            }}>
              Motivo del rechazo <span style={{ color: 'var(--red-500)' }}>*</span>
            </label>
            <textarea
              value={motivoRechazo}
              onChange={(e) => {
                setMotivoRechazo(e.target.value)
                setError(null)
              }}
              disabled={loading}
              placeholder="Especifique el motivo por el cual rechaza esta orden..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: `1px solid ${error ? 'var(--red-300)' : 'var(--primary-300)'}`,
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '100px'
              }}
            />
            {error && (
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--red-600)',
                marginTop: '0.5rem',
                margin: 0
              }}>
                {error}
              </p>
            )}
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
            disabled={loading || !motivoRechazo.trim()}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: loading || !motivoRechazo.trim() ? 'var(--red-400)' : 'var(--red-500)',
              color: 'white',
              cursor: loading || !motivoRechazo.trim() ? 'not-allowed' : 'pointer',
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
                Rechazando...
              </>
            ) : (
              <>
                <XCircle size={16} />
                Rechazar Orden
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
