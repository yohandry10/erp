'use client'

import React from 'react'
import { useWizard } from '../useWizard'
import { useCountryContext } from '@/hooks/use-country-context'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2 } from 'lucide-react'
import { LogoUploader } from '@/components/configuracion/LogoUploader'

export function RucConfigStep() {
  const { state, updateConfiguration } = useWizard()
  const country = useCountryContext()

  const handleInputChange = (field: string, value: string) => {
    updateConfiguration({ [field]: value })
  }

  const handleLogoChange = (file: File | null, previewUrl: string | null) => {
    updateConfiguration({
      logoFile: file || undefined,
      logoUrl: previewUrl || undefined,
      logoBase64: previewUrl || undefined, // El previewUrl ya es base64
    })
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '8px',
      }}>
        <Building2 size={24} style={{ color: 'var(--primary-600)' }} />
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-700)',
          margin: 0,
        }}>
          Ingresa los datos de tu empresa tal como aparecen en {country.servicioFiscal}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <Label htmlFor="ruc" style={{ marginBottom: '0.5rem', display: 'block' }}>
            {country.documentoFiscal} <span style={{ color: '#ef4444' }}>*</span>
          </Label>
          <Input
            id="ruc"
            type="text"
            placeholder={country.paisCodigo === 'PE' ? 'Ej: 20123456789' : country.paisCodigo === 'CO' ? 'Ej: 900123456-7' : 'Ingrese documento fiscal'}
            value={state.configuration.ruc}
            onChange={(e) => handleInputChange('ruc', e.target.value)}
            maxLength={country.paisCodigo === 'PE' ? 11 : country.paisCodigo === 'CO' ? 12 : 20}
            style={{
              fontSize: '1rem',
            }}
          />
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--primary-500)',
            marginTop: '0.25rem',
          }}>
            {country.paisCodigo === 'PE' ? 'Debe tener 11 dígitos' : country.paisCodigo === 'CO' ? 'Formato: 9-10 dígitos + dígito de verificación' : 'Ingrese documento fiscal válido'}
          </p>
        </div>

        <div>
          <Label htmlFor="razonSocial" style={{ marginBottom: '0.5rem', display: 'block' }}>
            Razón Social <span style={{ color: '#ef4444' }}>*</span>
          </Label>
          <Input
            id="razonSocial"
            type="text"
            placeholder="Ej: EMPRESA EJEMPLO S.A.C."
            value={state.configuration.razonSocial}
            onChange={(e) => handleInputChange('razonSocial', e.target.value)}
            style={{
              fontSize: '1rem',
            }}
          />
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--primary-500)',
            marginTop: '0.25rem',
          }}>
            Nombre completo de la empresa
          </p>
        </div>

        <div>
          <Label htmlFor="direccion" style={{ marginBottom: '0.5rem', display: 'block' }}>
            Dirección Fiscal <span style={{ color: '#ef4444' }}>*</span>
          </Label>
          <Input
            id="direccion"
            type="text"
            placeholder="Ej: Av. Principal 123, Lima, Lima"
            value={state.configuration.direccion}
            onChange={(e) => handleInputChange('direccion', e.target.value)}
            style={{
              fontSize: '1rem',
            }}
          />
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--primary-500)',
            marginTop: '0.25rem',
          }}>
            Dirección registrada en SUNAT
          </p>
        </div>

        {/* Logo de la empresa */}
        <div>
          <Label style={{ marginBottom: '0.5rem', display: 'block' }}>
            Logo de la Empresa <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>(opcional)</span>
          </Label>
          <LogoUploader
            currentLogoUrl={state.configuration.logoUrl}
            onLogoChange={handleLogoChange}
            maxSizeMB={2}
          />
        </div>

      </div>

      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: 'rgba(251, 191, 36, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(251, 191, 36, 0.2)',
      }}>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--warning-700)',
          margin: 0,
          lineHeight: '1.5',
        }}>
          <strong>⚠️ Importante:</strong> Asegúrate de que los datos coincidan exactamente con
          los registrados en SUNAT para evitar rechazos en la emisión de comprobantes.
        </p>
      </div>
    </div>
  )
}
