'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api-fetch';

export default function ConvertDemoPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  // Esta página vive fuera del layout del dashboard, así que no hereda el tema.
  // Replicamos el contrato: fijar data-erp-theme en <html> para que los tokens
  // (bg-card, foreground, etc.) resuelvan al tema activo y no queden en claro.
  useEffect(() => {
    const stored = window.localStorage.getItem('erp-dashboard-theme');
    document.documentElement.dataset.erpTheme = stored === 'light' ? 'light' : 'dark';
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);

    try {
      const response = await fetchApi('/api/demo/convert-to-real', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al convertir la cuenta');
      }

      const data = await response.json();
      if (data.payment_url) {
        window.location.assign(data.payment_url);
        return;
      }
      // Pago pendiente (sin pasarela configurada): es un estado válido, no un
      // error. Se muestra como aviso informativo en lugar de la caja roja.
      if (!data.token) {
        setNotice(
          data.instrucciones ||
            'Tu solicitud quedó registrada y está pendiente de confirmación de pago. Te contactaremos para completar la activación.',
        );
        setLoading(false);
        return;
      }

      // El backend ya cambió las credenciales; un login normal establece la cookie
      // HttpOnly sin copiar el JWT devuelto a Web Storage.
      await signIn(formData.email, formData.password);

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

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="max-w-[600px] w-[100%]">
        <div className="text-center mb-8">
          <h1 className="text-[2rem] font-extrabold text-foreground mb-2">
            Convierte tu Demo a Cuenta Real
          </h1>
          <p className="text-muted-foreground">
            Mantén todos tus datos y obtén acceso completo al sistema
          </p>
        </div>

        <div className="rounded-3xl p-10 shadow bg-card border border-border">
          <h2 className="text-xl font-bold text-foreground mb-2">
            Información de tu Empresa
          </h2>
          <p className="text-muted-foreground mb-6 text-[0.875rem]">
            Completa los datos para activar tu cuenta permanente
          </p>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive p-4 rounded-xl mb-6">
                {error}
              </div>
            )}

            {notice && (
              <div className="bg-primary/10 border border-primary/30 text-foreground p-4 rounded-xl mb-6">
                <p className="font-semibold text-primary mb-1">Solicitud registrada</p>
                <p className="text-sm text-foreground/85">{notice}</p>
              </div>
            )}

            <div className="mb-5">
              <label className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Razón Social *</label>
              <input
                type="text"
                name="razon_social"
                value={formData.razon_social}
                onChange={handleChange}
                placeholder="Ej: MI EMPRESA SAC"
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
            </div>

            <div className="mb-5">
              <label className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">RUC *</label>
              <input
                type="text"
                name="ruc"
                value={formData.ruc}
                onChange={handleChange}
                placeholder="20123456789"
                maxLength={11}
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ingresa el RUC real de tu empresa
              </p>
            </div>

            <div className="mb-5">
              <label className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="tu@email.com"
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Este será tu email de acceso al sistema
              </p>
            </div>

            <div className="mb-5">
              <label className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Contraseña *</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
            </div>

            <div className="mb-6">
              <label className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Teléfono</label>
              <input
                type="text"
                name="telefono"
                value={formData.telefono}
                onChange={handleChange}
                placeholder="+51 999 999 999" className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
            </div>

            <div className="bg-primary/10 border border-primary/20 p-5 rounded-xl mb-6">
              <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                ✓ ¿Qué incluye la cuenta real?
              </h4>
              <ul className="text-[0.875rem] text-foreground/85 list-none p-0 m-0">
                <li className="mb-1">✓ Acceso ilimitado sin expiración</li>
                <li className="mb-1">✓ Facturación electrónica real a SUNAT</li>
                <li className="mb-1">✓ Soporte técnico prioritario</li>
                <li className="mb-1">✓ Todos tus datos demo se mantienen</li>
                <li>✓ Certificado digital propio</li>
              </ul>
            </div>

            <button
              type="submit"
              disabled={loading} className="w-[100%] py-4 px-8 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 border-0 rounded-xl text-base font-semibold shadow cursor-pointer transition flex items-center justify-center gap-2"
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

            <p className="text-xs text-center text-muted-foreground mt-4">
              Al activar tu cuenta, aceptas nuestros términos y condiciones
            </p>
          </form>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/dashboard')} className="bg-transparent text-muted-foreground border-0 py-3 px-6 cursor-pointer text-[0.875rem]"
          >
            ← Volver al dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
