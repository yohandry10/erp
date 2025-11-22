'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWizard } from '../useWizard'
import { usePosConfig } from '@/hooks/use-pos-config'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowRight, Sparkles, RotateCw } from 'lucide-react'

export function CompletionStep() {
  const router = useRouter()
  const { state, completeWizard, resetWizardProcess } = useWizard()
  const { markWizardAsCompleted, resetConfiguration } = usePosConfig()
  const [isCompleting, setIsCompleting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleComplete = async () => {
    try {
      setIsCompleting(true)
      setError(null)

      if (!state.hasPersistedConfiguration) {
        await completeWizard()
      }

      // Marcar el wizard como completado en localStorage
      console.log('✅ Marcando wizard como completado...')
      markWizardAsCompleted()
      console.log('✅ Wizard marcado como completado')

      // Redirect to dashboard and force reload to refresh configuration status
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1500)
    } catch (err) {
      console.error('Error completing wizard:', err)
      setError(err instanceof Error ? err.message : 'Error al completar la configuración')
      setIsCompleting(false)
    }
  }

  const handleReset = async () => {
    const confirmed = window.confirm('¿Seguro que deseas reiniciar la configuración? Se solicitarán nuevamente todos los datos.')
    if (!confirmed) {
      return
    }

    try {
      setIsResetting(true)
      setError(null)
      await resetWizardProcess()
      resetConfiguration()
      setIsCompleting(false)
    } catch (err) {
      console.error('Error resetting wizard:', err)
      setError(err instanceof Error ? err.message : 'Error al reiniciar la configuración')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem',
      }}>
        <div style={{
          width: '100px',
          height: '100px',
          margin: '0 auto 1.5rem',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--success-500), var(--success-700))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 40px rgba(16, 185, 129, 0.3)',
        }}>
          <CheckCircle size={60} style={{ color: 'white' }} />
        </div>

        <h3 style={{
          fontSize: '2rem',
          fontWeight: '700',
          color: 'var(--primary-900)',
          marginBottom: '0.75rem',
        }}>
          ¡Configuración Completada!
        </h3>

        <p style={{
          fontSize: '1.125rem',
          color: 'var(--primary-600)',
          maxWidth: '600px',
          margin: '0 auto',
          lineHeight: '1.6',
        }}>
          Tu sistema está listo para comenzar a emitir comprobantes electrónicos
        </p>
      </div>

      <div style={{
        display: 'grid',
        gap: '1rem',
        marginTop: '2rem',
        marginBottom: '2rem',
      }}>
        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '1.25rem',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(16, 185, 129, 0.2)',
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
            <CheckCircle size={24} style={{ color: 'var(--success-600)' }} />
          </div>
          <div>
            <h4 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--primary-900)',
              marginBottom: '0.25rem',
            }}>
              Datos Empresariales Configurados
            </h4>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--primary-600)',
              lineHeight: '1.5',
              margin: 0,
            }}>
              Tu RUC, razón social y dirección están registrados correctamente
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '1.25rem',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(16, 185, 129, 0.2)',
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
            <CheckCircle size={24} style={{ color: 'var(--success-600)' }} />
          </div>
          <div>
            <h4 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--primary-900)',
              marginBottom: '0.25rem',
            }}>
              Certificado Digital Activo
            </h4>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--primary-600)',
              lineHeight: '1.5',
              margin: 0,
            }}>
              Tu certificado SUNAT está cargado y listo para firmar documentos
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '1.25rem',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          borderRadius: '12px',
          border: '1px solid rgba(16, 185, 129, 0.2)',
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
            <CheckCircle size={24} style={{ color: 'var(--success-600)' }} />
          </div>
          <div>
            <h4 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--primary-900)',
              marginBottom: '0.25rem',
            }}>
              Validaciones Exitosas
            </h4>
            <p style={{
              fontSize: '0.875rem',
              color: 'var(--primary-600)',
              lineHeight: '1.5',
              margin: 0,
            }}>
              Toda tu configuración ha sido verificada y aprobada
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '0.875rem',
        }}>
          {error}
        </div>
      )}

        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))',
          borderRadius: '12px',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          textAlign: 'center',
        }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem',
        }}>
          <Sparkles size={20} style={{ color: 'var(--primary-600)' }} />
          <h4 style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: 'var(--primary-900)',
            margin: 0,
          }}>
            ¿Qué sigue?
          </h4>
        </div>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--primary-600)',
          lineHeight: '1.6',
          margin: '0 0 1rem 0',
        }}>
          Ahora puedes comenzar a usar el sistema para emitir facturas, boletas,
          guías de remisión y más. Explora el dashboard para conocer todas las funcionalidades.
        </p>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '1rem',
        }}>
          <Button
            onClick={handleComplete}
            disabled={isCompleting || isResetting}
            size="lg"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1rem',
              padding: '0.75rem 2rem',
            }}
          >
            {isCompleting ? (
              <>Finalizando...</>
            ) : (
              <>
                Ir al Dashboard
                <ArrowRight size={20} />
              </>
            )}
          </Button>

          <Button
            onClick={handleReset}
            disabled={isCompleting || isResetting}
            variant="outline"
            size="lg"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '1rem',
              padding: '0.75rem 2rem',
            }}
          >
            {isResetting ? (
              <>Reiniciando...</>
            ) : (
              <>
                Reiniciar configuración
                <RotateCw size={20} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
