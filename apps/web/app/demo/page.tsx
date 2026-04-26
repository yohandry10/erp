'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DemoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const handleStartDemo = async () => {
    setLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiUrl}/demo/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias_duracion: 14 }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error creando demo');
      }

      const data = await response.json();

      // Guardar token y datos de demo
      localStorage.setItem('token', data.token);
      localStorage.setItem('demo_credentials', JSON.stringify({
        email: data.email,
        password: data.password,
        tenant_id: data.tenant_id,
      }));

      // Mostrar credenciales en la UI
      setCredentials({ email: data.email, password: data.password });
    } catch (err: any) {
      setError(err.message || 'Error al crear la demo');
      setLoading(false);
    }
  };

  const handleContinue = () => {
    router.push('/dashboard');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Si ya tenemos credenciales, mostrar pantalla de éxito
  if (credentials) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '3rem',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: '2.5rem'
          }}>
            ✓
          </div>
          
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: '#1e293b',
            marginBottom: '0.5rem'
          }}>
            ¡Demo Creada!
          </h1>
          
          <p style={{
            color: '#64748b',
            marginBottom: '2rem'
          }}>
            Guarda estas credenciales para volver a ingresar
          </p>

          <div style={{
            background: '#eff6ff',
            border: '1px solid #dbeafe',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'left'
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                Email
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <code style={{
                  flex: 1,
                  background: 'white',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#1e293b'
                }}>
                  {credentials.email}
                </code>
                <button
                  onClick={() => copyToClipboard(credentials.email)}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Copiar
                </button>
              </div>
            </div>
            
            <div>
              <label style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                Contraseña
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <code style={{
                  flex: 1,
                  background: 'white',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#1e293b'
                }}>
                  {credentials.password}
                </code>
                <button
                  onClick={() => copyToClipboard(credentials.password)}
                  style={{
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Copiar
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleContinue}
            style={{
              width: '100%',
              padding: '1rem 2rem',
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
            }}
          >
            Continuar al Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{ maxWidth: '900px', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '80px',
            height: '80px',
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: '2.5rem',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
          }}>
            ✨
          </div>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            Prueba el ERP Completo
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#64748b' }}>
            14 días gratis • Sin tarjeta de crédito • Datos pre-cargados
          </p>
        </div>

        {/* Features Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <FeatureCard icon="📊" title="Contabilidad Automatizada" description="Asientos contables generados automáticamente" />
          <FeatureCard icon="🧾" title="Facturación Electrónica" description="Facturas, boletas y notas con validación SUNAT" />
          <FeatureCard icon="📦" title="Control de Inventario" description="Kardex valorizado, múltiples almacenes" />
          <FeatureCard icon="💰" title="POS Multi-Caja" description="Punto de venta con múltiples cajas" />
          <FeatureCard icon="📈" title="Reportes Financieros" description="Balance, resultados, flujo de caja" />
          <FeatureCard icon="👥" title="Gestión de RRHH" description="Empleados, planillas, asistencias" />
        </div>

        {/* CTA Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '2.5rem',
          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
          border: '2px solid #dbeafe',
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
            ¿Listo para explorar?
          </h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
            Crearemos una empresa demo con datos realistas para que puedas probar todas las funcionalidades
          </p>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '1rem',
              borderRadius: '12px',
              marginBottom: '1rem'
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleStartDemo}
            disabled={loading}
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '1.25rem 2rem',
              background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1.125rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              margin: '0 auto'
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid white',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Creando tu empresa demo...
              </>
            ) : (
              <>✨ Iniciar Demo Ahora</>
            )}
          </button>

          <div style={{ marginTop: '1.5rem', color: '#64748b', fontSize: '0.875rem' }}>
            <p>✓ No requiere registro</p>
            <p>✓ Acceso inmediato</p>
            <p>✓ Datos de ejemplo incluidos</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '2rem', color: '#64748b', fontSize: '0.875rem' }}>
          <p>
            ¿Ya tienes una cuenta?{' '}
            <a href="/login" style={{ color: '#3b82f6', textDecoration: 'none' }}>
              Inicia sesión
            </a>
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      padding: '1.5rem',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '1rem'
    }}>
      <div style={{ fontSize: '2rem' }}>{icon}</div>
      <div>
        <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>{title}</h3>
        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>{description}</p>
      </div>
    </div>
  );
}
