'use client'

import { Info, Upload, RefreshCw, Eye, AlertCircle, FileCheck } from 'lucide-react'

export default function ConciliacionGuide() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      borderRadius: '0.5rem',
      padding: '2rem',
      color: 'white',
      marginBottom: '2rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Info size={24} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>
          Guía Rápida: Proceso de Conciliación
        </h3>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem' 
      }}>
        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          borderRadius: '0.5rem', 
          padding: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Upload size={20} />
            <span style={{ fontWeight: '600' }}>1. Importar</span>
          </div>
          <p style={{ fontSize: '0.875rem', margin: 0, opacity: 0.9 }}>
            Sube el extracto bancario en formato CSV
          </p>
        </div>

        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          borderRadius: '0.5rem', 
          padding: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <RefreshCw size={20} />
            <span style={{ fontWeight: '600' }}>2. Auto-Match</span>
          </div>
          <p style={{ fontSize: '0.875rem', margin: 0, opacity: 0.9 }}>
            El sistema concilia automáticamente
          </p>
        </div>

        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          borderRadius: '0.5rem', 
          padding: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Eye size={20} />
            <span style={{ fontWeight: '600' }}>3. Ajustar</span>
          </div>
          <p style={{ fontSize: '0.875rem', margin: 0, opacity: 0.9 }}>
            Revisa y ajusta manualmente
          </p>
        </div>

        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          borderRadius: '0.5rem', 
          padding: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <AlertCircle size={20} />
            <span style={{ fontWeight: '600' }}>4. Revisar</span>
          </div>
          <p style={{ fontSize: '0.875rem', margin: 0, opacity: 0.9 }}>
            Verifica saldos y diferencias
          </p>
        </div>

        <div style={{ 
          background: 'rgba(255, 255, 255, 0.1)', 
          borderRadius: '0.5rem', 
          padding: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <FileCheck size={20} />
            <span style={{ fontWeight: '600' }}>5. Cerrar</span>
          </div>
          <p style={{ fontSize: '0.875rem', margin: 0, opacity: 0.9 }}>
            Finaliza la conciliación
          </p>
        </div>
      </div>

      <div style={{ 
        marginTop: '1.5rem', 
        padding: '1rem', 
        background: 'rgba(255, 255, 255, 0.15)',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
        backdropFilter: 'blur(10px)'
      }}>
        <strong>💡 Consejo:</strong> Usa el modo Wizard para una experiencia guiada paso a paso, 
        o la vista detallada para control total del proceso.
      </div>
    </div>
  )
}
