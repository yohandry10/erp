'use client'

import React from 'react'
import { useWizard } from '../useWizard'
import { Rocket, Shield, FileCheck, CheckCircle } from 'lucide-react'

export function WelcomeStep() {
  // No auto-save on welcome step - let user click "Siguiente" to proceed
  // This avoids API calls on initial load that could cause issues

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem',
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 1.5rem',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Rocket size={40} style={{ color: 'white' }} />
        </div>
        
        <h3 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: 'var(--primary-900)',
          marginBottom: '0.75rem',
        }}>
          ¡Bienvenido al Asistente de Configuración!
        </h3>
        
        <p style={{
          fontSize: '1rem',
          color: 'var(--primary-600)',
          maxWidth: '600px',
          margin: '0 auto',
          lineHeight: '1.6',
        }}>
          Este asistente te guiará paso a paso para configurar tu sistema y comenzar a emitir
          comprobantes electrónicos de forma rápida y segura.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gap: '1rem',
        marginTop: '2rem',
      }}>
        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '1.25rem',
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
          borderRadius: '12px',
          border: '1px solid rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--primary-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <FileCheck size={24} style={{ color: 'var(--primary-600)' }} />
          </div>
          <div>
            <h4 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--primary-900)',
              marginBottom: '0.25rem',
            }}>
              Configuración de Datos Empresariales
            </h4>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--primary-600)',
              lineHeight: '1.5',
            }}>
              Ingresarás los datos de tu empresa (RUC, razón social, dirección) necesarios
              para la emisión de comprobantes.
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '1.25rem',
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
          borderRadius: '12px',
          border: '1px solid rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--success-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Shield size={24} style={{ color: 'var(--success-600)' }} />
          </div>
          <div>
            <h4 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--primary-900)',
              marginBottom: '0.25rem',
            }}>
              Carga de Certificado Digital
            </h4>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--primary-600)',
              lineHeight: '1.5',
            }}>
              Cargarás tu certificado digital SUNAT (archivo .pfx o .p12) que permite
              firmar electrónicamente tus comprobantes.
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '1.25rem',
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
          borderRadius: '12px',
          border: '1px solid rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'var(--warning-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CheckCircle size={24} style={{ color: 'var(--warning-600)' }} />
          </div>
          <div>
            <h4 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--primary-900)',
              marginBottom: '0.25rem',
            }}>
              Validación y Verificación
            </h4>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--primary-600)',
              lineHeight: '1.5',
            }}>
              El sistema verificará que toda tu configuración esté correcta y lista
              para comenzar a operar.
            </p>
          </div>
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
          <strong>💡 Consejo:</strong> Ten a mano tu certificado digital y los datos de tu empresa.
          El proceso tomará aproximadamente 5 minutos.
        </p>
      </div>
    </div>
  )
}
