'use client'

import React from 'react'
import { useCountryContext } from '@/hooks/use-country-context'
import { Rocket, Shield, FileCheck, CheckCircle } from 'lucide-react'

export function WelcomeStep() {
  const country = useCountryContext()
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const servicioFiscal = country.servicioFiscal || 'SUNAT'

  // No auto-save on welcome step - let user click "Siguiente" to proceed
  // This avoids API calls on initial load that could cause issues

  return (
    <div className="py-4 px-0">
      <div className="text-center mb-8">
        <div className="w-[80px] h-[80px] rounded-full flex items-center justify-center">
          <Rocket size={40} className="text-white" />
        </div>

        <h3 className="text-2xl font-bold text-[var(--primary-900)] mb-3">
          ¡Bienvenido al Asistente de Configuración!
        </h3>

        <p className="text-base text-[var(--primary-600)] max-w-[600px] my-0 mx-auto leading-7">
          Este asistente te guiará paso a paso para configurar tu sistema y comenzar a emitir
          comprobantes electrónicos de forma rápida y segura.
        </p>
      </div>

      <div className="grid gap-4 mt-8">
        <div className="flex gap-4 p-5 bg-card/50 rounded-xl border">
          <div className="w-12 h-12 rounded-xl bg-[var(--primary-100)] flex items-center justify-center shrink-0">
            <FileCheck size={24} className="text-[var(--primary-600)]" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-[var(--primary-900)] mb-1">
              Configuración de Datos Empresariales
            </h4>
            <p className="text-[0.875rem] text-[var(--primary-600)] leading-6">
              Ingresarás los datos de tu empresa ({documentoFiscal}, razón social, dirección) necesarios
              para la emisión de comprobantes.
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-5 bg-card/50 rounded-xl border">
          <div className="w-12 h-12 rounded-xl bg-[var(--success-100)] flex items-center justify-center shrink-0">
            <Shield size={24} className="text-[var(--success-600)]" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-[var(--primary-900)] mb-1">
              Carga de Certificado Digital
            </h4>
            <p className="text-[0.875rem] text-[var(--primary-600)] leading-6">
              Cargarás tu certificado digital emitido por {servicioFiscal} o tu proveedor autorizado
              (archivo .pfx o .p12) para firmar electrónicamente tus comprobantes.
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-5 bg-card/50 rounded-xl border">
          <div className="w-12 h-12 rounded-xl bg-[var(--warning-100)] flex items-center justify-center shrink-0">
            <CheckCircle size={24} className="text-[var(--warning-600)]" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-[var(--primary-900)] mb-1">
              Validación y Verificación
            </h4>
            <p className="text-[0.875rem] text-[var(--primary-600)] leading-6">
              El sistema verificará que toda tu configuración esté correcta y lista
              para comenzar a operar.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-[rgba(59,_130,_246,_0.1)] rounded-lg border">
        <p className="text-[0.875rem] text-[var(--primary-700)] m-0 leading-6">
          <strong>💡 Consejo:</strong> Ten a mano tu certificado digital y los datos de tu empresa.
          El proceso tomará aproximadamente 5 minutos.
        </p>
      </div>
    </div>
  )
}
