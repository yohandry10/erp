'use client'

import Image from 'next/image'
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, X, Image as ImageIcon, Building2 } from 'lucide-react'

interface LogoUploaderProps {
  currentLogoUrl?: string
  onLogoChange: (file: File | null, previewUrl: string | null) => void
  disabled?: boolean
}

const ACCEPTED_LOGO_FORMATS = ['image/png', 'image/jpeg'] as const
const MAX_LOGO_SIZE_MIB = 2
const MAX_LOGO_SIZE_BYTES = MAX_LOGO_SIZE_MIB * 1024 * 1024

/**
 * Componente multi-tenant para subir y previsualizar logos de empresa.
 * Se puede usar en el wizard de configuración o en cualquier otra parte del sistema.
 */
export function LogoUploader({
  currentLogoUrl,
  onLogoChange,
  disabled = false,
}: LogoUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPreviewUrl(currentLogoUrl || null)
  }, [currentLogoUrl])
  const validateFile = useCallback((file: File): string | null => {
    if (!ACCEPTED_LOGO_FORMATS.includes(file.type as typeof ACCEPTED_LOGO_FORMATS[number])) {
      return 'Formato no válido. Usa PNG o JPG'
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      return `El archivo es muy grande. Máximo ${MAX_LOGO_SIZE_MIB} MiB`
    }
    return null
  }, [])

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
    reader.onerror = () => {
      setError('No se pudo leer la imagen seleccionada')
    }
    reader.readAsDataURL(file)
  }, [onLogoChange, validateFile])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
    // Permite volver a elegir el mismo archivo si la carga remota falla.
    e.target.value = ''
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
    <div className="w-full">
      <input
        ref={fileInputRef}
        aria-label="Archivo de logo"
        type="file"
        accept={ACCEPTED_LOGO_FORMATS.join(',')}
        onChange={handleFileSelect} className="hidden"
        disabled={disabled}
      />

      {previewUrl ? (
        // Vista con logo cargado
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-4"
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
          <div className="min-w-40 flex-1">
            <p className="m-0 text-[0.875rem] font-medium text-foreground">
              Logo cargado
            </p>
            <p className="text-xs text-muted-foreground">
              Este logo aparecerá en facturas, boletas y tickets
            </p>
          </div>
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleClick} className="py-2 px-3 text-xs bg-blue-500 text-white border-0 rounded-[6px] cursor-pointer flex items-center gap-1"
                disabled={disabled}
              >
                <Upload size={14} />
                Cambiar
              </button>
              <button
                type="button"
                onClick={handleRemoveLogo} className="py-2 px-3 text-xs bg-[#fee2e2] text-destructive border-0 rounded-[6px] cursor-pointer flex items-center gap-1"
                disabled={disabled}
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
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={handleClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              handleClick()
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg border border-dashed p-8 transition ${
            disabled
              ? 'cursor-not-allowed opacity-60'
              : isDragging
                ? 'cursor-copy border-primary bg-primary/5'
                : 'cursor-pointer border-border bg-muted/20 hover:border-primary/60 hover:bg-muted/40'
          }`}
        >
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background"
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
              PNG o JPG • Máximo {MAX_LOGO_SIZE_MIB} MiB
            </p>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-2 rounded-[6px] border bg-[#fef2f2] px-3 py-2 text-xs text-destructive"
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
