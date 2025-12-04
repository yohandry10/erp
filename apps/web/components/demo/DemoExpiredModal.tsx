'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface DemoExpiredModalProps {
  open: boolean;
  onClose: () => void;
}

export function DemoExpiredModal({ open, onClose }: DemoExpiredModalProps) {
  const router = useRouter();

  // Prevenir scroll cuando el modal está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  if (!open) return null;

  const handleConvert = () => {
    router.push('/demo/convert');
  };

  const handleNewDemo = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('demo_credentials');
    router.push('/demo');
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:ventas@tuerp.com?subject=Consulta sobre cuenta real';
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      zIndex: 9999
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '2.5rem',
        maxWidth: '450px',
        width: '100%',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        position: 'relative',
        textAlign: 'center'
      }}>
        {/* Icono */}
        <div style={{
          width: '80px',
          height: '80px',
          background: '#fef2f2',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
          fontSize: '2.5rem'
        }}>
          ⚠️
        </div>

        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 800,
          color: '#1e293b',
          marginBottom: '0.5rem'
        }}>
          Tu Demo ha Expirado
        </h2>

        <p style={{
          color: '#64748b',
          marginBottom: '2rem'
        }}>
          Tu período de prueba de 14 días ha finalizado. Elige una opción para continuar:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            onClick={handleConvert}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
          >
            Convertir a Cuenta Real
          </button>

          <button
            onClick={handleNewDemo}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'white',
              color: '#475569',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Iniciar Nueva Demo
          </button>

          <button
            onClick={handleContactSales}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'transparent',
              color: '#64748b',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Contactar con Ventas
          </button>
        </div>

        <p style={{
          fontSize: '0.75rem',
          color: '#94a3b8',
          marginTop: '1.5rem'
        }}>
          ¿Necesitas más tiempo? Contáctanos para una extensión especial
        </p>

        {/* Botón cerrar */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            fontSize: '1.5rem',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '0.5rem'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
