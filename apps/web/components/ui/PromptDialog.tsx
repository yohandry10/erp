'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface PromptDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (value: string) => void | Promise<void>
  title: string
  message: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger' | 'warning'
  multiline?: boolean
}

export default function PromptDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default',
  multiline = false
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
    }
  }, [isOpen, defaultValue])

  if (!isOpen) return null

  const handleConfirm = async () => {
    if (!value.trim()) return

    setIsLoading(true)
    try {
      await onConfirm(value)
      onClose()
      setValue('')
    } catch (error) {
      console.error('Error en confirmación:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline && !isLoading) {
      e.preventDefault()
      handleConfirm()
    }
  }

  const getVariantClasses = () => {
    switch (variant) {
      case 'danger':
        return 'bg-gradient-to-br from-slate-700 to-slate-500 text-white'
      case 'warning':
        return 'bg-gradient-to-br from-blue-800 to-cyan-400 text-white'
      default:
        return 'bg-gradient-to-br from-blue-800 via-blue-500 to-cyan-500 text-white'
    }
  }

  return (
    <div 
      className="modal-overlay fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div 
        className="modal-content relative w-[90%] max-w-[500px] overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-br from-white/95 to-slate-50/90 p-8 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className={cn('absolute inset-x-0 top-0 h-1 rounded-t-2xl', getVariantClasses())} />

        {/* Header */}
        <div className="modal-header mb-6 flex items-center justify-between">
          <h2 className={cn('modal-title m-0 flex items-center gap-2 bg-clip-text text-2xl font-bold text-transparent', getVariantClasses())}>
            {variant === 'danger' && '⚠️'}
            {variant === 'warning' && '⚡'}
            {variant === 'default' && '✏️'}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="modal-close flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body mb-6">
          {message && (
            <p className="m-0 mb-4 whitespace-pre-line text-base leading-relaxed text-slate-700">
              {message}
            </p>
          )}

          {multiline ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              rows={4}
              autoFocus
              className="w-full resize-y rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3.5 font-sans text-base text-slate-800 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              autoFocus
              className="w-full rounded-xl border-2 border-slate-200 bg-white/80 px-4 py-3.5 text-base text-slate-800 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            />
          )}
        </div>

        {/* Actions */}
        <div className="modal-actions flex flex-wrap justify-end gap-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="modal-btn modal-btn-secondary flex min-w-[120px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-6 py-3 text-sm font-semibold text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !value.trim()}
            className={cn('modal-btn flex min-w-[120px] items-center justify-center gap-2 rounded-xl border-0 px-6 py-3 text-sm font-semibold shadow-md transition disabled:cursor-not-allowed disabled:opacity-60', getVariantClasses())}
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Procesando...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
