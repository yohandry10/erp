'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Upload, X, Image as ImageIcon, Building2 } from 'lucide-react'

interface LogoUploaderProps {
  currentLogoUrl?: string
  onLogoChange: (file: File | null, previewUrl: string | null) => void
  maxSizeMB?: number
  acceptedFormats?: string[]
  disabled?: boolean
}

/**
 * Componente multi-tenant para subir y previsualizar logos de empresa.
 * Se puede usar en el wizard de configuración o en cualquier otra parte del sistema.
 */
export function LogoUploader({
  currentLogoUrl,
  onLogoChange,
  maxSizeMB = 2,
  acceptedFormats = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  disabled = false,
}: LogoUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxSizeBytes = maxSizeMB * 1024 * 1024

  const validateFile = (file: File): string | null => {
    if (!acceptedFormats.includes(file.type)) {
      return `Formato no válido. Usa: ${acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')}`
    }
    if (file.size > maxSizeBytes) {
      return `El archivo es muy grande. Máximo ${maxSizeMB}MB`
    }
    return null
  }

  const processFile = useCallback((file: File) => {
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setPreviewUrl(url)
      onLogoChange(file, url)
    }
    reader.readAsDataURL(file)
  }, [onLogoChange, maxSizeBytes, acceptedFormats])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleRemoveLogo = () => {
    setPreviewUrl(null)
    setError(null)
    onLogoChange(null, null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {previewUrl ? (
        // Vista con logo cargado
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={previewUrl}
              alt="Logo de la empresa"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: '#1e293b' }}>
              Logo cargado
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Este logo aparecerá en facturas, boletas y tickets
            </p>
          </div>
          {!disabled && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleClick}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <Upload size={14} />
                Cambiar
              </button>
              <button
                type="button"
                onClick={handleRemoveLogo}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <X size={14} />
                Quitar
              </button>
            </div>
          )}
        </div>
      ) : (
        // Zona de drop/upload
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            padding: '2rem',
            border: `2px dashed ${isDragging ? '#3b82f6' : '#cbd5e1'}`,
            borderRadius: '8px',
            backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : '#f8fafc',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                margin: '0 auto 0.75rem',
                backgroundColor: isDragging ? '#dbeafe' : '#e2e8f0',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isDragging ? (
                <ImageIcon size={24} style={{ color: '#3b82f6' }} />
              ) : (
                <Building2 size={24} style={{ color: '#64748b' }} />
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: '#1e293b' }}>
              {isDragging ? 'Suelta la imagen aquí' : 'Arrastra tu logo o haz clic para seleccionar'}
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              PNG, JPG, WebP o SVG • Máximo {maxSizeMB}MB
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            fontSize: '0.75rem',
            color: '#dc2626',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <p
        style={{
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: '#94a3b8',
        }}
      >
        💡 Recomendación: Usa un logo cuadrado o con fondo transparente para mejor visualización
      </p>
    </div>
  )
}

export default LogoUploader
