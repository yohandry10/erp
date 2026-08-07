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
    <div className="py-4 px-0">
      <div className="flex items-center gap-3 mb-6 p-4 bg-[rgba(59,_130,_246,_0.1)] rounded-lg">
        <Building2 size={24} className="text-[var(--primary-600)]" />
        <p className="text-[0.875rem] text-[var(--primary-700)] m-0">
          Ingresa los datos de tu empresa tal como aparecen en {country.servicioFiscal}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <Label htmlFor="ruc" className="mb-2 block">
            {country.documentoFiscal} <span className="text-red-500">*</span>
          </Label>
          <Input
            id="ruc"
            type="text"
            placeholder={country.paisCodigo === 'AR'
              ? 'Ej: 30710158229'
              : country.paisCodigo === 'CO'
                ? 'Ej: 900123456-8'
                : 'Ej: 20123456789'}
            value={state.configuration.ruc}
            onChange={(e) => handleInputChange('ruc', e.target.value)}
            maxLength={11} className="text-base"
          />
          <p className="text-xs text-[var(--primary-500)] mt-1">
            {country.paisCodigo === 'CO'
              ? 'Ingresa el NIT con su dígito de verificación.'
              : 'Debe tener 11 dígitos.'}
          </p>
        </div>

        <div>
          <Label htmlFor="razonSocial" className="mb-2 block">
            Razón Social <span className="text-red-500">*</span>
          </Label>
          <Input
            id="razonSocial"
            type="text"
            placeholder={country.paisCodigo === 'AR'
              ? 'Ej: EMPRESA EJEMPLO S.A.'
              : country.paisCodigo === 'CO'
                ? 'Ej: EMPRESA EJEMPLO S.A.S.'
                : 'Ej: EMPRESA EJEMPLO S.A.C.'}
            value={state.configuration.razonSocial}
            onChange={(e) => handleInputChange('razonSocial', e.target.value)} className="text-base"
          />
          <p className="text-xs text-[var(--primary-500)] mt-1">
            Nombre completo de la empresa
          </p>
        </div>

        <div>
          <Label htmlFor="direccion" className="mb-2 block">
            Dirección Fiscal <span className="text-red-500">*</span>
          </Label>
          <Input
            id="direccion"
            type="text"
            placeholder={country.paisCodigo === 'AR'
              ? 'Ej: Av. Corrientes 1234, CABA'
              : country.paisCodigo === 'CO'
                ? 'Ej: Carrera 7 # 72-41, Bogotá D.C.'
                : 'Ej: Av. Principal 123, Lima, Lima'}
            value={state.configuration.direccion}
            onChange={(e) => handleInputChange('direccion', e.target.value)} className="text-base"
          />
          <p className="text-xs text-[var(--primary-500)] mt-1">
            Dirección registrada en {country.servicioFiscal}
          </p>
        </div>

        {country.paisCodigo === 'PE' && (
          <>
            <div>
              <Label htmlFor="ubigeo" className="mb-2 block">
                Ubigeo del domicilio fiscal <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ubigeo"
                type="text"
                inputMode="numeric"
                placeholder="Ej: 150101"
                value={state.configuration.ubigeo}
                onChange={(e) => handleInputChange('ubigeo', e.target.value.replace(/\D/g, '').slice(0, 6))}
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                className="text-base"
              />
              <p className="text-xs text-[var(--primary-500)] mt-1">
                Código INEI de 6 dígitos requerido para emitir guías de remisión.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="departamento" className="mb-2 block">Departamento</Label>
                <Input
                  id="departamento"
                  value={state.configuration.departamento || ''}
                  onChange={(e) => handleInputChange('departamento', e.target.value)}
                  placeholder="Lima"
                />
              </div>
              <div>
                <Label htmlFor="provincia" className="mb-2 block">Provincia</Label>
                <Input
                  id="provincia"
                  value={state.configuration.provincia || ''}
                  onChange={(e) => handleInputChange('provincia', e.target.value)}
                  placeholder="Lima"
                />
              </div>
              <div>
                <Label htmlFor="distrito" className="mb-2 block">Distrito</Label>
                <Input
                  id="distrito"
                  value={state.configuration.distrito || ''}
                  onChange={(e) => handleInputChange('distrito', e.target.value)}
                  placeholder="Lima"
                />
              </div>
            </div>
          </>
        )}

        {/* Logo de la empresa */}
        <div>
          <Label className="mb-2 block">
            Logo de la Empresa <span className="text-muted-foreground font-normal">(opcional)</span>
          </Label>
          <LogoUploader
            currentLogoUrl={state.configuration.logoUrl}
            onLogoChange={handleLogoChange}
            maxSizeMB={2}
          />
        </div>

      </div>

      <div className="mt-8 p-4 bg-[rgba(251,_191,_36,_0.1)] rounded-lg border">
        <p className="text-[0.875rem] text-[var(--warning-700)] m-0 leading-6">
          <strong>⚠️ Importante:</strong> Asegúrate de que los datos coincidan exactamente con
          los registrados en {country.servicioFiscal} para evitar rechazos en la emisión de comprobantes.
        </p>
      </div>
    </div>
  )
}
