'use client'

import React, { useState, useRef } from 'react'
import { useWizard } from '../useWizard'
import { useCountryContext } from '@/hooks/use-country-context'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, Eye, EyeOff, AlertCircle, FileCheck, CheckCircle } from 'lucide-react'

export function CertificateUploadStep() {
  const { state, updateConfiguration } = useWizard()
  const country = useCountryContext()
  const servicioFiscal = country.servicioFiscal || 'SUNAT'
  const [showPassword, setShowPassword] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFileFormat = (file: File): boolean => {
    const validExtensions = ['.pfx', '.p12']
    const fileName = file.name.toLowerCase()
    const isValid = validExtensions.some(ext => fileName.endsWith(ext))
    
    if (!isValid) {
      setValidationError('El archivo debe ser un certificado digital (.pfx o .p12)')
      return false
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setValidationError('El archivo no debe superar los 5MB')
      return false
    }
    
    setValidationError(null)
    return true
  }

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = () => {
        const base64 = reader.result as string
        // Remove data URL prefix
        const base64Data = base64.split(',')[1]
        resolve(base64Data)
      }
      
      reader.onerror = () => {
        reject(new Error('Error al leer el archivo'))
      }
      
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setValidationError(null)

    // Validate file format
    if (!validateFileFormat(file)) {
      return
    }

    try {
      setIsUploading(true)
      setUploadProgress(0)

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 100)

      // Convert to base64
      const base64Data = await convertFileToBase64(file)
      
      clearInterval(progressInterval)
      setUploadProgress(100)

      // Update configuration
      updateConfiguration({
        certificateFile: file,
        certificateBase64: base64Data,
      })

      // Certificate loaded successfully
      console.log(`Certificado "${file.name}" cargado correctamente`)
      
    } catch (error) {
      console.error('Error uploading certificate:', error)
      setValidationError(error instanceof Error ? error.message : 'Error al cargar el certificado')
    } finally {
      setIsUploading(false)
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  const handlePasswordChange = (password: string) => {
    updateConfiguration({ certificatePassword: password })
  }

  return (
    <div className="py-4 px-0">
      <div className="flex items-center gap-3 mb-6 p-4 bg-[rgba(139,_92,_246,_0.1)] rounded-lg">
        <FileCheck size={24} className="text-[var(--primary-600)]" />
        <p className="text-[0.875rem] text-[var(--primary-700)] m-0">
          Carga tu certificado digital para firmar comprobantes electrónicos
        </p>
      </div>

      <div className="flex items-start gap-3 mb-6 p-4 bg-[rgba(251,_191,_36,_0.12)] rounded-lg border">
        <AlertCircle size={20} className="text-[#d97706] mt-[2px] shrink-0" />
        <div>
          <p className="text-[0.875rem] font-semibold text-[#78350f] m-0">
            Importante sobre el certificado
          </p>
          <p className="text-[0.875rem] text-[#92400e] mt-1.5 mr-0 mb-0 ml-0 leading-6">
            Nosotros usamos tu certificado solo para firmar el XML de tus comprobantes. El certificado lo
            proporciona el cliente (autoridad fiscal, OSE/proveedor o entidad certificadora). No emitimos ni
            generamos certificados. Si tu OSE firma por ti, cargarás el certificado que ellos indiquen o el que
            tu empresa ya usa. Se almacena cifrado y no se comparte con {servicioFiscal}; solo se usa para la firma.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* File Upload */}
        <div>
          <Label className="mb-2 block">
            Certificado Digital <span className="text-red-500">*</span>
          </Label>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".pfx,.p12"
            onChange={handleFileSelect} className="hidden"
          />
          
          <div
            onClick={() => fileInputRef.current?.click()} className="rounded-lg p-8 text-center cursor-pointer transition"
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-500)'
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary-300)'
              e.currentTarget.style.backgroundColor = state.configuration.certificateFile
                ? 'rgba(16, 185, 129, 0.05)'
                : 'rgba(255, 255, 255, 0.5)'
            }}
          >
            {state.configuration.certificateFile ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle size={48} className="text-[var(--success-600)]" />
                <p className="text-base font-semibold text-[var(--success-700)] m-0">
                  {state.configuration.certificateFile.name}
                </p>
                <p className="text-[0.875rem] text-[var(--primary-600)] m-0">
                  Haz clic para cambiar el archivo
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={48} className="text-[var(--primary-400)]" />
                <p className="text-base font-semibold text-[var(--primary-700)] m-0">
                  Haz clic para seleccionar tu certificado
                </p>
                <p className="text-[0.875rem] text-[var(--primary-500)] m-0">
                  Archivos .pfx o .p12 (máx. 5MB)
                </p>
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-4">
              <div className="w-[100%] h-2 bg-[rgba(0,_0,_0,_0.1)] rounded-full overflow-hidden">
                <div className="h-[100%] bg-[var(--primary-600)] rounded-full transition" />
              </div>
              <p className="text-xs text-[var(--primary-600)] mt-1 text-center">
                Cargando... {uploadProgress}%
              </p>
            </div>
          )}

          {validationError && (
            <div className="mt-2 flex items-center gap-2 text-destructive text-[0.875rem]">
              <AlertCircle size={16} />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Password Input */}
        <div>
          <Label htmlFor="certificatePassword" className="mb-2 block">
            Contraseña del Certificado <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              id="certificatePassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="Ingresa la contraseña"
              value={state.configuration.certificatePassword || ''}
              onChange={(e) => handlePasswordChange(e.target.value)} className="text-base pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[50%] -translate-y-1/2 border-0 cursor-pointer text-[var(--primary-500)] p-1 flex items-center"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <p className="text-xs text-[var(--primary-500)] mt-1">
            La contraseña que usaste al crear el certificado
          </p>
        </div>

      </div>

      <div className="mt-8 p-4 bg-[rgba(59,_130,_246,_0.1)] rounded-lg border">
        <p className="text-[0.875rem] text-[var(--primary-700)] m-0 leading-6">
          <strong>🔒 Seguridad:</strong> Tu certificado se almacena de forma encriptada y segura.
          Solo se usa para firmar tus comprobantes electrónicos.
        </p>
      </div>
    </div>
  )
}
