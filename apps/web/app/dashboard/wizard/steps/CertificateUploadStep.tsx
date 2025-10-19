'use client'

import React, { useState, useRef } from 'react'
import { useWizard } from '../useWizard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Upload, Eye, EyeOff, AlertCircle, FileCheck, CheckCircle } from 'lucide-react'

export function CertificateUploadStep() {
  const { state, updateConfiguration } = useWizard()
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
    <div style={{ padding: '1rem 0' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: '8px',
      }}>
        <FileCheck size={24} style={{ color: 'var(--primary-600)' }} />
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-700)',
          margin: 0,
        }}>
          Carga tu certificado digital SUNAT para firmar comprobantes electrónicos
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* File Upload */}
        <div>
          <Label style={{ marginBottom: '0.5rem', display: 'block' }}>
            Certificado Digital <span style={{ color: '#ef4444' }}>*</span>
          </Label>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".pfx,.p12"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--primary-300)',
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: state.configuration.certificateFile
                ? 'rgba(16, 185, 129, 0.05)'
                : 'rgba(255, 255, 255, 0.5)',
              transition: 'all 0.2s',
            }}
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={48} style={{ color: 'var(--success-600)' }} />
                <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--success-700)', margin: 0 }}>
                  {state.configuration.certificateFile.name}
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--primary-600)', margin: 0 }}>
                  Haz clic para cambiar el archivo
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={48} style={{ color: 'var(--primary-400)' }} />
                <p style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--primary-700)', margin: 0 }}>
                  Haz clic para seleccionar tu certificado
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--primary-500)', margin: 0 }}>
                  Archivos .pfx o .p12 (máx. 5MB)
                </p>
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && uploadProgress > 0 && uploadProgress < 100 && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                borderRadius: '9999px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: 'var(--primary-600)',
                  borderRadius: '9999px',
                  transition: 'width 0.3s ease',
                  width: `${uploadProgress}%`,
                }} />
              </div>
              <p style={{
                fontSize: '0.75rem',
                color: 'var(--primary-600)',
                marginTop: '0.25rem',
                textAlign: 'center',
              }}>
                Cargando... {uploadProgress}%
              </p>
            </div>
          )}

          {validationError && (
            <div style={{
              marginTop: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#dc2626',
              fontSize: '0.875rem',
            }}>
              <AlertCircle size={16} />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Password Input */}
        <div>
          <Label htmlFor="certificatePassword" style={{ marginBottom: '0.5rem', display: 'block' }}>
            Contraseña del Certificado <span style={{ color: '#ef4444' }}>*</span>
          </Label>
          <div style={{ position: 'relative' }}>
            <Input
              id="certificatePassword"
              type={showPassword ? 'text' : 'password'}
              placeholder="Ingresa la contraseña"
              value={state.configuration.certificatePassword || ''}
              onChange={(e) => handlePasswordChange(e.target.value)}
              style={{
                fontSize: '1rem',
                paddingRight: '3rem',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--primary-500)',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--primary-500)',
            marginTop: '0.25rem',
          }}>
            La contraseña que usaste al crear el certificado
          </p>
        </div>

      </div>

      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-700)',
          margin: 0,
          lineHeight: '1.5',
        }}>
          <strong>🔒 Seguridad:</strong> Tu certificado se almacena de forma encriptada y segura.
          Solo se usa para firmar tus comprobantes electrónicos.
        </p>
      </div>
    </div>
  )
}
