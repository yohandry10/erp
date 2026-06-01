'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildApiUrl } from '@/lib/api-url';

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
      const response = await fetch(buildApiUrl('/api/demo/convert-to-real'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
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
    <div className="flex items-center justify-center p-8">
      <div className="max-w-[600px] w-[100%]">
        <div className="text-center mb-8">
          <h1 className="text-8 font-extrabold text-slate-800 mb-2">
            Convierte tu Demo a Cuenta Real
          </h1>
          <p className="text-slate-500">
            Mantén todos tus datos y obtén acceso completo al sistema
          </p>
        </div>

        <div className="rounded-6 p-10 shadow">
          <h2 className="text-5 font-bold text-slate-800 mb-2">
            Información de tu Empresa
          </h2>
          <p className="text-slate-500 mb-6 text-[0.875rem]">
            Completa los datos para activar tu cuenta permanente
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-[#fef2f2] border text-red-600 p-4 rounded-3 mb-6">
                {error}
              </div>
            )}

            <div className="mb-5">
              <label className="block font-semibold text-slate-600 mb-2 text-[0.875rem]">Razón Social *</label>
              <input
                type="text"
                name="razon_social"
                value={formData.razon_social}
                onChange={handleChange}
                placeholder="Ej: MI EMPRESA SAC"
                required className="w-[100%] py-[0.875rem] px-4 rounded-3 text-4 bg-white text-slate-800 transition"
              />
            </div>

            <div className="mb-5">
              <label className="block font-semibold text-slate-600 mb-2 text-[0.875rem]">RUC *</label>
              <input
                type="text"
                name="ruc"
                value={formData.ruc}
                onChange={handleChange}
                placeholder="20123456789"
                maxLength={11}
                required className="w-[100%] py-[0.875rem] px-4 rounded-3 text-4 bg-white text-slate-800 transition"
              />
              <p className="text-3 text-slate-500 mt-1">
                Ingresa el RUC real de tu empresa
              </p>
            </div>

            <div className="mb-5">
              <label className="block font-semibold text-slate-600 mb-2 text-[0.875rem]">Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="tu@email.com"
                required className="w-[100%] py-[0.875rem] px-4 rounded-3 text-4 bg-white text-slate-800 transition"
              />
              <p className="text-3 text-slate-500 mt-1">
                Este será tu email de acceso al sistema
              </p>
            </div>

            <div className="mb-5">
              <label className="block font-semibold text-slate-600 mb-2 text-[0.875rem]">Contraseña *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required className="w-[100%] py-[0.875rem] px-4 rounded-3 text-4 bg-white text-slate-800 transition"
              />
            </div>

            <div className="mb-6">
              <label className="block font-semibold text-slate-600 mb-2 text-[0.875rem]">Teléfono</label>
              <input
                type="text"
                name="telefono"
                value={formData.telefono}
                onChange={handleChange}
                placeholder="+51 999 999 999" className="w-[100%] py-[0.875rem] px-4 rounded-3 text-4 bg-white text-slate-800 transition"
              />
            </div>

            <div className="bg-[#eff6ff] border p-5 rounded-3 mb-6">
              <h4 className="font-semibold text-[#1e40af] mb-3 flex items-center gap-2">
                ✓ ¿Qué incluye la cuenta real?
              </h4>
              <ul className="text-[0.875rem] text-[#1e40af] list-none p-0 m-0">
                <li className="mb-1">✓ Acceso ilimitado sin expiración</li>
                <li className="mb-1">✓ Facturación electrónica real a SUNAT</li>
                <li className="mb-1">✓ Soporte técnico prioritario</li>
                <li className="mb-1">✓ Todos tus datos demo se mantienen</li>
                <li>✓ Certificado digital propio</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={loading} className="w-[100%] py-4 px-8 text-white border-0 rounded-3 text-4 font-semibold shadow flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 rounded-full" />
                  Convirtiendo cuenta...
                </>
              ) : (
                'Activar Cuenta Completa'
              )}
            </button>

            <p className="text-3 text-center text-slate-500 mt-4">
              Al activar tu cuenta, aceptas nuestros términos y condiciones
            </p>
          </form>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/dashboard')} className="bg-transparent text-slate-500 border-0 py-3 px-6 cursor-pointer text-[0.875rem]"
          >
            ← Volver al dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
