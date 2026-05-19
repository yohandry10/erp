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
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.5)] flex items-center justify-center z-[1000] p-4">
      <div className="bg-white rounded-3 max-w-[500px] w-[100%] shadow">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2.5 bg-[var(--red-100)] flex items-center justify-center text-[var(--red-600)]">
              <XCircle size={20} />
            </div>
            <h2 className="text-[1.125rem] font-bold text-[var(--primary-800)] m-0">
              Rechazar Orden de Compra
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading} className="p-2 rounded-2 border-0 bg-transparent text-[var(--primary-400)] flex items-center justify-center transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="bg-[var(--red-50)] border rounded-2 p-4 mb-6">
            <p className="text-[0.875rem] text-[var(--red-700)] m-0 leading-7">
              ⚠️ Esta acción rechazará la orden de compra <strong>{ordenNumero}</strong> y cambiará su estado a ANULADA.
            </p>
          </div>

          <div>
            <label className="block text-[0.875rem] font-semibold text-[var(--primary-700)] mb-2">
              Motivo del rechazo <span className="text-[var(--red-500)]">*</span>
            </label>
            <textarea
              value={motivoRechazo}
              onChange={(e) => {
                setMotivoRechazo(e.target.value)
                setError(null)
              }}
              disabled={loading}
              placeholder="Especifique el motivo por el cual rechaza esta orden..."
              rows={4} className="w-[100%] p-3 rounded-2 text-[0.875rem] min-h-[100px]"
            />
            {error && (
              <p className="text-3 text-[var(--red-600)] mt-2 m-0">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex gap-3 justify-end">
          <button
            onClick={handleClose}
            disabled={loading} className="py-3 px-6 rounded-2 border bg-white text-[var(--primary-700)] text-[0.875rem] font-semibold transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !motivoRechazo.trim()} className="py-3 px-6 rounded-2 border-0 text-white text-[0.875rem] font-semibold flex items-center gap-2 transition"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 rounded-full" />
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
    </div>
  )
}
