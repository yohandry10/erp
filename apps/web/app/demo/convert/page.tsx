'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ConvertDemoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    razon_social: '',
    ruc: '',
    telefono: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiUrl}/api/demo/convert-to-real`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al convertir la cuenta');
      }

      const data = await response.json();

      // Actualizar token
      localStorage.setItem('token', data.token);
      localStorage.removeItem('demo_credentials');

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Error al convertir la cuenta');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const inputStyle = {
    width: '100%',
    padding: '0.875rem 1rem',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '1rem',
    background: 'white',
    color: '#1e293b',
    outline: 'none',
    transition: 'border-color 0.2s'
  };

  const labelStyle = {
    display: 'block',
    fontWeight: 600,
    color: '#475569',
    marginBottom: '0.5rem',
    fontSize: '0.875rem'
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{ maxWidth: '600px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: '#1e293b',
            marginBottom: '0.5rem'
          }}>
            Convierte tu Demo a Cuenta Real
          </h1>
          <p style={{ color: '#64748b' }}>
            Mantén todos tus datos y obtén acceso completo al sistema
          </p>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '2.5rem',
          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
            Información de tu Empresa
          </h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            Completa los datos para activar tu cuenta permanente
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '1rem',
                borderRadius: '12px',
                marginBottom: '1.5rem'
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Razón Social *</label>
              <input
                type="text"
                name="razon_social"
                value={formData.razon_social}
                onChange={handleChange}
                placeholder="Ej: MI EMPRESA SAC"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>RUC *</label>
              <input
                type="text"
                name="ruc"
                value={formData.ruc}
                onChange={handleChange}
                placeholder="20123456789"
                maxLength={11}
                required
                style={inputStyle}
              />
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Ingresa el RUC real de tu empresa
              </p>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="tu@email.com"
                required
                style={inputStyle}
              />
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Este será tu email de acceso al sistema
              </p>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Contraseña *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Teléfono</label>
              <input
                type="text"
                name="telefono"
                value={formData.telefono}
                onChange={handleChange}
                placeholder="+51 999 999 999"
                style={inputStyle}
              />
            </div>

            <div style={{
              background: '#eff6ff',
              border: '1px solid #dbeafe',
              padding: '1.25rem',
              borderRadius: '12px',
              marginBottom: '1.5rem'
            }}>
              <h4 style={{ fontWeight: 600, color: '#1e40af', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ✓ ¿Qué incluye la cuenta real?
              </h4>
              <ul style={{ fontSize: '0.875rem', color: '#1e40af', listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ marginBottom: '0.25rem' }}>✓ Acceso ilimitado sin expiración</li>
                <li style={{ marginBottom: '0.25rem' }}>✓ Facturación electrónica real a SUNAT</li>
                <li style={{ marginBottom: '0.25rem' }}>✓ Soporte técnico prioritario</li>
                <li style={{ marginBottom: '0.25rem' }}>✓ Todos tus datos demo se mantienen</li>
                <li>✓ Certificado digital propio</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '1rem 2rem',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
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
                  Convirtiendo cuenta...
                </>
              ) : (
                'Activar Cuenta Completa'
              )}
            </button>

            <p style={{ fontSize: '0.75rem', textAlign: 'center', color: '#64748b', marginTop: '1rem' }}>
              Al activar tu cuenta, aceptas nuestros términos y condiciones
            </p>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'transparent',
              color: '#64748b',
              border: 'none',
              padding: '0.75rem 1.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            ← Volver al dashboard
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
      `}</style>
    </div>
  );
}
