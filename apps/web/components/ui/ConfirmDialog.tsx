'use client'

import { useState } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger' | 'warning'
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'default'
}: ConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  const handleConfirm = async () => {
    setIsLoading(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      console.error('Error en confirmación:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getButtonStyle = () => {
    switch (variant) {
      case 'danger':
        return {
          background: 'var(--gradient-danger)',
          color: 'white'
        }
      case 'warning':
        return {
          background: 'var(--gradient-warning)',
          color: 'white'
        }
      default:
        return {
          background: 'var(--gradient-primary)',
          color: 'white'
        }
    }
  }

  return (
    <div 
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 1000,
        animation: 'modal-overlay-enter 0.3s ease-out'
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: 'var(--border-radius-xl)',
          padding: '2rem',
          width: '90%',
          maxWidth: '500px',
          boxShadow: 'var(--shadow-2xl)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          animation: 'modal-content-enter 0.3s ease-out',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Header bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: variant === 'danger' ? 'var(--gradient-danger)' : 
                      variant === 'warning' ? 'var(--gradient-warning)' : 
                      'var(--gradient-primary)',
          borderRadius: 'var(--border-radius-xl) var(--border-radius-xl) 0 0'
        }} />

        {/* Header */}
        <div className="modal-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 className="modal-title" style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            background: variant === 'danger' ? 'var(--gradient-danger)' : 
                       variant === 'warning' ? 'var(--gradient-warning)' : 
                       'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {variant === 'danger' && '⚠️'}
            {variant === 'warning' && '⚡'}
            {variant === 'default' && '❓'}
            {title}
          </h2>
          <button
            onClick={onClose}
            className="modal-close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--primary-500)',
              padding: '0.5rem',
              borderRadius: '50%',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{
          marginBottom: '1.5rem'
        }}>
          <p style={{
            color: 'var(--primary-700)',
            fontSize: '1rem',
            lineHeight: '1.6',
            margin: 0,
            whiteSpace: 'pre-line'
          }}>
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="modal-actions" style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="modal-btn modal-btn-secondary"
            style={{
              padding: '0.75rem 1.5rem',
              border: '1px solid var(--primary-300)',
              borderRadius: 'var(--border-radius)',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              minWidth: '120px',
              justifyContent: 'center',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="modal-btn"
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: 'var(--border-radius)',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              minWidth: '120px',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)',
              opacity: isLoading ? 0.6 : 1,
              ...getButtonStyle()
            }}
          >
            {isLoading ? (
              <>
                <span style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
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
