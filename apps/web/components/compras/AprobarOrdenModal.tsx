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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--emerald-100)] flex items-center justify-center text-[var(--emerald-600)]">
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
          <p className="text-[0.875rem] text-[var(--primary-600)] mb-6 leading-7">
            ¿Está seguro que desea aprobar la orden de compra <strong>{ordenNumero}</strong>?
          </p>

          <div>
            <label className="block text-[0.875rem] font-semibold text-[var(--primary-700)] mb-2">
              Comentarios (opcional)
            </label>
            <textarea
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              disabled={loading}
              placeholder="Agregue comentarios sobre la aprobación..."
              rows={4} className="w-[100%] p-3 border text-[0.875rem] min-h-[100px] bg-white text-[var(--primary-800)]"
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
            className="modal-btn modal-btn-success flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="loading-spinner w-4 h-4" />
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
