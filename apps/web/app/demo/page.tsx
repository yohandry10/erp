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
      const response = await fetch(`${apiUrl}/api/demo/create`, {
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
      <div className="flex items-center justify-center p-8">
        <div className="rounded-6 p-12 max-w-[500px] w-[100%] shadow text-center">
          <div className="w-[80px] h-[80px] rounded-full flex items-center justify-center text-10">
            ✓
          </div>
          
          <h1 className="text-8 font-extrabold text-slate-800 mb-2">
            ¡Demo Creada!
          </h1>
          
          <p className="text-slate-500 mb-8">
            Guarda estas credenciales para volver a ingresar
          </p>

          <div className="bg-[#eff6ff] border rounded-3 p-6 mb-6 text-left">
            <div className="mb-4">
              <label className="text-3 text-slate-500 font-semibold">
                Email
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-[1] bg-white p-2 rounded-[6px] text-[0.875rem] text-slate-800">
                  {credentials.email}
                </code>
                <button
                  onClick={() => copyToClipboard(credentials.email)} className="bg-blue-500 text-white border-0 py-2 px-3 rounded-[6px] cursor-pointer text-3"
                >
                  Copiar
                </button>
              </div>
            </div>
            
            <div>
              <label className="text-3 text-slate-500 font-semibold">
                Contraseña
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-[1] bg-white p-2 rounded-[6px] text-[0.875rem] text-slate-800">
                  {credentials.password}
                </code>
                <button
                  onClick={() => copyToClipboard(credentials.password)} className="bg-blue-500 text-white border-0 py-2 px-3 rounded-[6px] cursor-pointer text-3"
                >
                  Copiar
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleContinue} className="w-[100%] py-4 px-8 text-white border-0 rounded-3 text-4 font-semibold cursor-pointer shadow"
          >
            Continuar al Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      <div className="max-w-[900px] w-[100%]">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-[80px] h-[80px] rounded-5 flex items-center justify-center text-10 shadow">
            ✨
          </div>
          <h1 className="text-10 font-black mb-2">
            Prueba el ERP Completo
          </h1>
          <p className="text-5 text-slate-500">
            14 días gratis • Sin tarjeta de crédito • Datos pre-cargados
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(280px,_1fr))] gap-4 mb-8">
          <FeatureCard icon="📊" title="Contabilidad Automatizada" description="Asientos contables generados automáticamente" />
          <FeatureCard icon="🧾" title="Facturación Electrónica" description="Facturas, boletas y notas con validación SUNAT" />
          <FeatureCard icon="📦" title="Control de Inventario" description="Kardex valorizado, múltiples almacenes" />
          <FeatureCard icon="💰" title="POS Multi-Caja" description="Punto de venta con múltiples cajas" />
          <FeatureCard icon="📈" title="Reportes Financieros" description="Balance, resultados, flujo de caja" />
          <FeatureCard icon="👥" title="Gestión de RRHH" description="Empleados, planillas, asistencias" />
        </div>

        {/* CTA Card */}
        <div className="rounded-6 p-10 shadow text-center">
          <h2 className="text-6 font-bold text-slate-800 mb-2">
            ¿Listo para explorar?
          </h2>
          <p className="text-slate-500 mb-6">
            Crearemos una empresa demo con datos realistas para que puedas probar todas las funcionalidades
          </p>

          {error && (
            <div className="bg-[#fef2f2] border text-red-600 p-4 rounded-3 mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleStartDemo}
            disabled={loading} className="w-[100%] max-w-[400px] py-5 px-8 text-white border-0 rounded-3 text-[1.125rem] font-semibold shadow flex items-center justify-center gap-2 my-0 mx-auto"
          >
            {loading ? (
              <>
                <span className="w-5 h-5 rounded-full" />
                Creando tu empresa demo...
              </>
            ) : (
              <>✨ Iniciar Demo Ahora</>
            )}
          </button>

          <div className="mt-6 text-slate-500 text-[0.875rem]">
            <p>✓ No requiere registro</p>
            <p>✓ Acceso inmediato</p>
            <p>✓ Datos de ejemplo incluidos</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-500 text-[0.875rem]">
          <p>
            ¿Ya tienes una cuenta?{' '}
            <a href="/login" className="text-blue-500">
              Inicia sesión
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="rounded-4 p-6 shadow border flex items-start gap-4">
      <div className="text-8">{icon}</div>
      <div>
        <h3 className="font-semibold text-slate-800 mb-1">{title}</h3>
        <p className="text-[0.875rem] text-slate-500">{description}</p>
      </div>
    </div>
  );
}
