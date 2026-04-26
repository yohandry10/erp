'use client'

import { useState } from 'react'
import { CheckCircle, X } from 'lucide-react'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'

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
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--border-radius)',
              background: 'var(--emerald-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald-600)'
            }}>
              <CheckCircle size={20} />
            </div>
            <h2 className="modal-title">
              Aprobar Orden de Compra
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="modal-close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
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
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--primary-300)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
                resize: 'vertical',
                minHeight: '100px',
                background: 'white',
                color: 'var(--primary-800)'
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-actions">
          <button
            onClick={handleClose}
            disabled={loading}
            className="modal-btn modal-btn-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="modal-btn modal-btn-success"
            style={{
              background: loading ? 'var(--emerald-400)' : 'var(--emerald-500)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {loading ? (
              <>
                <div className="loading-spinner" style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid white',
                  borderTopColor: 'transparent'
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
    </div>
  )
}
