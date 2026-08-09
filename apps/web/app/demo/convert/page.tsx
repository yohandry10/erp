'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api-fetch';

interface InstruccionesDePago {
  solicitud_id: string;
  monto: number;
  plan: string;
  datos_pago: {
    titular: string;
    banco: string;
    cuenta: string;
    cci: string;
    moneda: string;
    whatsapp: string;
    whatsappUrl: string;
    email: string;
  };
}

export default function ConvertDemoPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [checkingEligibility, setCheckingEligibility] = useState(true);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

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
  // Instrucciones de transferencia. Mientras estén puestas, la pantalla deja de
  // ser un formulario y pasa a ser "pague y espere".
  const [pago, setPago] = useState<InstruccionesDePago | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  // Que pasa con lo que el cliente probo en el demo. Se pregunta en vez de
  // decidirlo por el: hay quien viene de cargar su catalogo entero y hay quien
  // solo estuvo trasteando y quiere entrar limpio.
  const [mostrarEleccionDatos, setMostrarEleccionDatos] = useState(false);
  const [eleccionDatos, setEleccionDatos] = useState<'conservar' | 'reiniciar'>('conservar');
  const [countryCode, setCountryCode] = useState<'PE' | 'AR' | 'CO'>('PE');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    razon_social: '',
    ruc: '',
    telefono: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    void fetchApi('/api/demo/status')
      .then(async (response) => {
        if (response.status === 401) {
          window.location.replace('/login/?redirect=/demo/convert');
          return null;
        }
        if (!response.ok) {
          throw new Error('No se pudo verificar el estado de la cuenta.');
        }
        return response.json();
      })
      .then((status) => {
        if (!status) return;
        if (status.is_demo !== true) {
          window.location.replace('/dashboard/');
          return;
        }
        const code = String(status?.pais || '').toUpperCase();
        if (code === 'AR' || code === 'CO' || code === 'PE') setCountryCode(code);
        setCheckingEligibility(false);
      })
      .catch((statusError: unknown) => {
        setEligibilityError(statusError instanceof Error ? statusError.message : 'No se pudo verificar el estado de la cuenta.');
        setCheckingEligibility(false);
      });
  }, []);

  const taxDocument = countryCode === 'AR' ? 'CUIT' : countryCode === 'CO' ? 'NIT' : 'RUC';
  const fiscalAuthority = countryCode === 'AR' ? 'ARCA' : countryCode === 'CO' ? 'DIAN' : 'SUNAT';
  const taxPlaceholder = countryCode === 'AR' ? '30712345671' : countryCode === 'CO' ? '900373913-5' : '20123456786';
  const companyPlaceholder = countryCode === 'AR'
    ? 'Ej: MI EMPRESA S.A.'
    : countryCode === 'CO'
      ? 'Ej: MI EMPRESA S.A.S.'
      : 'Ej: MI EMPRESA S.A.C.';
  const phonePlaceholder = countryCode === 'AR'
    ? '+54 11 1234 5678'
    : countryCode === 'CO'
      ? '+57 300 123 4567'
      : '+51 999 999 999';
  const countryName = countryCode === 'AR' ? 'Argentina' : countryCode === 'CO' ? 'Colombia' : 'Perú';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (formData.password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Confirma la clave permanente antes de continuar.');
      return;
    }
    // El formulario ya esta validado por el navegador; antes de activar hay
    // que resolver que pasa con los datos, porque una de las dos opciones no
    // tiene vuelta atras.
    setMostrarEleccionDatos(true);
  };

  const convertir = async (conservarDatos: boolean) => {
    setMostrarEleccionDatos(false);
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetchApi('/api/demo/convert-to-real', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, conservar_datos: conservarDatos }),
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
      // Pago por transferencia: es un estado válido, no un error. Se cambia el
      // formulario por las instrucciones y la pantalla se queda esperando.
      if (data.payment_pending && data.datos_pago) {
        setPago({
          solicitud_id: data.solicitud_id,
          monto: Number(data.monto) || 0,
          plan: data.plan,
          datos_pago: data.datos_pago,
        });
        setLoading(false);
        return;
      }

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

      window.location.replace('/dashboard/');
    } catch (err: any) {
      setError(err.message || 'Error al convertir la cuenta');
      setLoading(false);
    }
  };

  // Mientras la solicitud esté pendiente se pregunta cada 15 s. En cuanto se
  // confirma el pago, el cliente entra sin tocar nada: ya eligió su correo y su
  // contraseña en el formulario, no hace falta pedírselos otra vez. Y si cerró
  // la pestaña, entra por el login normal con esas mismas credenciales.
  useEffect(() => {
    if (!pago) return;

    let cancelado = false;

    const revisar = async () => {
      try {
        const response = await fetchApi(
          `/api/demo/conversiones-pendientes/${pago.solicitud_id}/estado`,
        );
        if (!response.ok || cancelado) return;

        const { estado } = await response.json();
        if (cancelado) return;

        if (estado === 'COMPLETADA') {
          await signIn(formData.email, formData.password);
          window.location.replace('/dashboard/');
        } else if (estado !== 'PENDIENTE') {
          setPago(null);
          setError(
            'La solicitud no siguió adelante. Escríbenos y la revisamos contigo.',
          );
        }
      } catch {
        // Un fallo de red no cancela la espera: se reintenta en el siguiente turno.
      }
    };

    const temporizador = window.setInterval(revisar, 15000);
    void revisar();

    return () => {
      cancelado = true;
      window.clearInterval(temporizador);
    };
  }, [pago, formData.email, formData.password, signIn, router]);

  const copiar = async (etiqueta: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(etiqueta);
      window.setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles el número sigue visible para copiarlo a mano.
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (checkingEligibility) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div className="rounded-2xl border border-border bg-card px-6 py-5 text-center shadow">
          <p className="font-semibold">Verificando el estado de tu cuenta…</p>
          <p className="mt-1 text-sm text-muted-foreground">La conversión sólo está disponible para demos activas.</p>
        </div>
      </div>
    );
  }

  if (eligibilityError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-destructive/30 bg-card px-6 py-5 text-center shadow">
          <h1 className="text-lg font-bold">No pudimos validar la conversión</h1>
          <p className="mt-2 text-sm text-muted-foreground">{eligibilityError}</p>
          <div className="mt-5 flex justify-center gap-3">
            <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Reintentar
            </button>
            <button type="button" onClick={() => router.push('/dashboard/')} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">
              Ir al dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
      <div className="max-w-[600px] w-[100%]">
        <div className="text-center mb-8">
          <h1 className="text-[2rem] font-extrabold text-foreground mb-2">
            Convierte tu Demo a Cuenta Real
          </h1>
          <p className="text-muted-foreground">
            Acceso completo al sistema. Tú eliges qué pasa con lo que probaste.
          </p>
        </div>

        {pago ? (
          <div className="rounded-3xl p-10 shadow bg-card border border-border">
            <h2 className="text-xl font-bold text-foreground mb-2">
              Ya casi: falta la transferencia
            </h2>
            <p className="text-muted-foreground mb-6 text-[0.875rem]">
              {pago.plan}. Transfiere el monto, envíanos el comprobante por
              WhatsApp y activamos tu cuenta.
            </p>

            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 mb-6 text-center">
              <p className="text-sm text-muted-foreground">Monto a transferir</p>
              <p className="text-[2rem] font-extrabold text-primary leading-tight">
                S/ {pago.monto.toFixed(2)}
              </p>
            </div>

            <div className="rounded-2xl border border-border divide-y divide-border mb-6">
              {[
                { etiqueta: 'Titular', valor: pago.datos_pago.titular, copiable: false },
                { etiqueta: 'Banco', valor: pago.datos_pago.banco, copiable: false },
                { etiqueta: 'Tipo de cuenta', valor: pago.datos_pago.moneda, copiable: false },
                { etiqueta: 'Número de cuenta', valor: pago.datos_pago.cuenta, copiable: true },
                { etiqueta: 'CCI', valor: pago.datos_pago.cci, copiable: true },
              ].map((fila) => (
                <div key={fila.etiqueta} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{fila.etiqueta}</p>
                    <p className="font-semibold text-foreground break-all">{fila.valor}</p>
                  </div>
                  {fila.copiable && (
                    <button
                      type="button"
                      onClick={() => copiar(fila.etiqueta, fila.valor)}
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent"
                    >
                      {copiado === fila.etiqueta ? 'Copiado' : 'Copiar'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <a
              href={pago.datos_pago.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-[100%] py-4 px-8 bg-[#25D366] text-white rounded-xl text-base font-semibold shadow transition hover:brightness-95 flex items-center justify-center gap-2"
            >
              Enviar el comprobante por WhatsApp ({pago.datos_pago.whatsapp})
            </a>

            <p className="text-xs text-center text-muted-foreground mt-4">
              ¿Prefieres correo? Escríbenos a{' '}
              <a href={`mailto:${pago.datos_pago.email}`} className="text-primary font-semibold">
                {pago.datos_pago.email}
              </a>
            </p>

            <div className="mt-6 rounded-xl border border-border bg-accent/40 p-4 text-center">
              <p className="text-sm font-semibold text-foreground">
                Esperando la confirmación del pago…
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                En cuanto lo verifiquemos entrarás automáticamente. Si cierras esta
                pantalla, entra en el login normal con{' '}
                <span className="font-semibold text-foreground">{formData.email}</span> y la
                contraseña que acabas de elegir.
              </p>
            </div>
          </div>
        ) : (
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
              <label htmlFor="convert-razon-social" className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Razón Social *</label>
              <input id="convert-razon-social"
                type="text"
                name="razon_social"
                value={formData.razon_social}
                onChange={handleChange}
                placeholder={companyPlaceholder}
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
            </div>

            <div className="mb-5">
              <label htmlFor="convert-ruc" className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">{taxDocument} *</label>
              <input id="convert-ruc"
                type="text"
                name="ruc"
                value={formData.ruc}
                onChange={handleChange}
                placeholder={taxPlaceholder}
                maxLength={13}
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ingresa el {taxDocument} real de tu empresa. Se validará según {countryName}.
              </p>
            </div>

            <div className="mb-5">
              <label htmlFor="convert-email" className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Email *</label>
              <input id="convert-email"
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
              <label htmlFor="convert-password" className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Contraseña permanente *</label>
              <input id="convert-password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                autoComplete="new-password"
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Esta clave reemplazará la contraseña temporal de la demo y será la que usarás en el login.
              </p>
            </div>

            <div className="mb-5">
              <label htmlFor="convert-confirm-password" className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Confirmar contraseña permanente *</label>
              <input id="convert-confirm-password"
                type="password"
                name="confirm_password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repite la contraseña"
                minLength={8}
                autoComplete="new-password"
                required className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="convert-telefono" className="block font-semibold text-foreground/80 mb-2 text-[0.875rem]">Teléfono</label>
              <input id="convert-telefono"
                type="text"
                name="telefono"
                value={formData.telefono}
                onChange={handleChange}
                placeholder={phonePlaceholder} className="w-[100%] py-[0.875rem] px-4 rounded-xl text-base bg-card text-foreground border border-border outline-none transition focus:border-primary"
              />
            </div>

            <div className="bg-primary/10 border border-primary/20 p-5 rounded-xl mb-6">
              <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                ✓ ¿Qué incluye la cuenta real?
              </h4>
              <ul className="text-[0.875rem] text-foreground/85 list-none p-0 m-0">
                <li className="mb-1">✓ Acceso ilimitado sin expiración</li>
                <li className="mb-1">✓ Onboarding de facturación electrónica real ante {fiscalAuthority}</li>
                <li className="mb-1">✓ Soporte técnico prioritario</li>
                <li className="mb-1">✓ Eliges si conservas lo que probaste o empiezas de cero</li>
                <li>✓ Flujo para certificado y credenciales propias, sin reutilizar fixtures demo</li>
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

          {mostrarEleccionDatos && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-eleccion-datos"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            >
              <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
                <h3 id="titulo-eleccion-datos" className="text-xl font-bold text-foreground">
                  ¿Qué hacemos con lo que probaste?
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Tu cuenta y tus datos ya viven donde vivirá la cuenta real, así que
                  no hay nada que migrar. Solo decide con qué quieres empezar.
                </p>
                <div className="mt-4 rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm">
                  <p className="font-semibold text-foreground">Credenciales permanentes</p>
                  <p className="mt-1 text-muted-foreground break-all">
                    Usuario: <span className="font-semibold text-foreground">{formData.email}</span>
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Contraseña: la clave que acabas de escribir y confirmar. Por seguridad no se mostrará ni se guardará en texto plano.
                  </p>
                </div>

                <div className="mt-5 space-y-3">
                  <button
                    type="button"
                    onClick={() => setEleccionDatos('conservar')}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      eleccionDatos === 'conservar'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="font-semibold text-foreground">Conservar mis datos</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Se queda todo: productos, clientes, proveedores y los documentos
                      que hayas emitido durante la prueba.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEleccionDatos('reiniciar')}
                    className={`w-full rounded-xl border p-4 text-left transition ${
                      eleccionDatos === 'reiniciar'
                        ? 'border-destructive bg-destructive/10'
                        : 'border-border hover:border-destructive/40'
                    }`}
                  >
                    <div className="font-semibold text-foreground">Empezar de cero</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Se borran los productos, clientes, ventas y documentos de prueba.
                      Se conservan tu empresa, tus usuarios, el almacén, el plan de
                      cuentas y los métodos de pago, para que la cuenta siga siendo
                      usable desde el primer minuto.
                    </div>
                    {eleccionDatos === 'reiniciar' && (
                      <div className="mt-3 rounded-lg bg-destructive/15 px-3 py-2 text-sm font-medium text-destructive">
                        Esto no se puede deshacer.
                      </div>
                    )}
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setMostrarEleccionDatos(false)}
                    className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => convertir(eleccionDatos === 'conservar')}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold text-white transition ${
                      eleccionDatos === 'reiniciar'
                        ? 'bg-destructive hover:bg-destructive/90'
                        : 'bg-primary hover:bg-primary/90'
                    }`}
                  >
                    {eleccionDatos === 'reiniciar'
                      ? 'Borrar los datos y activar'
                      : 'Conservar los datos y activar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

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
