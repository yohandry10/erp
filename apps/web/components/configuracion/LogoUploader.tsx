'use client'

import Image from 'next/image'
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

  const validateFile = useCallback((file: File): string | null => {
    if (!acceptedFormats.includes(file.type)) {
      return `Formato no válido. Usa: ${acceptedFormats.map(f => f.split('/')[1].toUpperCase()).join(', ')}`
    }
    if (file.size > maxSizeBytes) {
      return `El archivo es muy grande. Máximo ${maxSizeMB}MB`
    }
    return null
  }, [acceptedFormats, maxSizeBytes, maxSizeMB])

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
  }, [onLogoChange, validateFile])

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
    <div className="w-[100%]">
      <input
        ref={fileInputRef}
        aria-label="Archivo de logo"
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={handleFileSelect} className="hidden"
        disabled={disabled}
      />

      {previewUrl ? (
        // Vista con logo cargado
        <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border"
        >
          <div className="w-[80px] h-[80px] rounded-lg overflow-hidden bg-card border flex items-center justify-center"
          >
            <Image
              src={previewUrl}
              alt="Logo de la empresa"
              width={80}
              height={80}
              unoptimized className="max-w-[100%] max-h-[100%] object-contain"
            />
          </div>
          <div className="flex-[1]">
            <p className="m-0 text-[0.875rem] font-medium text-foreground">
              Logo cargado
            </p>
            <p className="text-xs text-muted-foreground">
              Este logo aparecerá en facturas, boletas y tickets
            </p>
          </div>
          {!disabled && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClick} className="py-2 px-3 text-xs bg-blue-500 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-1"
              >
                <Upload size={14} />
                Cambiar
              </button>
              <button
                type="button"
                onClick={handleRemoveLogo} className="py-2 px-3 text-xs bg-[#fee2e2] text-destructive border-0 rounded-[6px] cursor-pointer flex items-center gap-1"
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
          onDrop={handleDrop} className="p-8 rounded-lg transition"
        >
          <div className="text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center"
            >
              {isDragging ? (
                <ImageIcon size={24} className="text-blue-500" />
              ) : (
                <Building2 size={24} className="text-muted-foreground" />
              )}
            </div>
            <p className="m-0 text-[0.875rem] font-medium text-foreground">
              {isDragging ? 'Suelta la imagen aquí' : 'Arrastra tu logo o haz clic para seleccionar'}
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, WebP o SVG • Máximo {maxSizeMB}MB
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 py-2 px-3 bg-[#fef2f2] border rounded-[6px] text-xs text-destructive"
        >
          ⚠️ {error}
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground"
      >
        💡 Recomendación: Usa un logo cuadrado o con fondo transparente para mejor visualización
      </p>
    </div>
  )
}

export default LogoUploader
