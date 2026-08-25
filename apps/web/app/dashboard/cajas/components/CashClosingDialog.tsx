import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { DenominationForm, Denominaciones } from './DenominationForm';
import { CashDialogFrame } from './CashDialogFrame';
import { useCountryContext } from '@/hooks/use-country-context';

interface CashClosingDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    sesionId: string;
}

interface PreCloseValidation {
    valido: boolean;
    errores: string[];
    warnings: string[];
}

interface ClosePreview {
    saldo_teorico: number;
    saldo_real: number;
    diferencia: number;
    tipo_diferencia: 'SOBRANTE' | 'FALTANTE' | 'CUADRADO' | 'REDONDEO_EFECTIVO_LEGAL';
    requiere_supervisor: boolean;
    requiere_justificacion: boolean;
    redondeo_efectivo_legal: boolean;
    redondeo_efectivo_documentado: number;
    redondeo_efectivo_cantidad: number;
    tolerancia: number;
}

export function CashClosingDialog({ isOpen, onClose, onSuccess, sesionId }: CashClosingDialogProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    // Este flujo necesita el mensaje autoritativo del backend (PIN, permiso,
    // sesión o configuración). El modo por defecto del hook convierte errores
    // en `null`, lo que antes reemplazaba todo por "Error al cerrar caja".
    const { get, post } = useApi({ throwOnError: true });
    const [step, setStep] = useState<'VALIDATING' | 'COUNT' | 'REVIEW' | 'JUSTIFICATION' | 'CONFIRM'>('VALIDATING');
    const [validation, setValidation] = useState<PreCloseValidation | null>(null);
    const [denominaciones, setDenominaciones] = useState<Denominaciones>({ billetes: {}, monedas: {} });
    const [montoContado, setMontoContado] = useState<number>(0);
    const [montoEsperado, setMontoEsperado] = useState<number>(0);
    const [diferencia, setDiferencia] = useState<number>(0);
    const [notas, setNotas] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<ClosePreview | null>(null);
    const [supervisores, setSupervisores] = useState<Array<{ id: string; nombre: string }>>([]);
    const [supervisoresError, setSupervisoresError] = useState<string | null>(null);
    const [supervisorId, setSupervisorId] = useState('');
    const [codigoSupervisor, setCodigoSupervisor] = useState('');

    const iniciarCierre = useCallback(async () => {
        setStep('VALIDATING');
        setError(null);
        setValidation(null);
        setPreview(null);
        setSupervisores([]);
        setSupervisoresError(null);
        setSupervisorId('');
        setCodigoSupervisor('');
        setDenominaciones({ billetes: {}, monedas: {} });
        setMontoContado(0);
        setDiferencia(0);
        setNotas('');

        try {
            setLoading(true);
            // 1. Validar pre-cierre
            const valResponse = await get(`/cajas/validar-precierre/${sesionId}`);
            if (valResponse?.success) {
                setValidation(valResponse.data);

                // Si hay errores bloqueantes, quedarse en VALIDATING
                if (!valResponse.data.valido) {
                    return;
                }

                // 2. Obtener saldo esperado (para cálculo interno)
                const saldoResponse = await get(`/cajas/saldo-esperado/${sesionId}`);
                if (saldoResponse?.success) {
                    setMontoEsperado(saldoResponse.data.saldo);
                    setStep('COUNT');
                }
            }
        } catch (err: any) {
            setError('Error iniciando proceso de cierre');
        } finally {
            setLoading(false);
        }
    }, [get, sesionId]);

    useEffect(() => {
        if (isOpen && sesionId) {
            iniciarCierre();
        }
    }, [iniciarCierre, isOpen, sesionId]);

    const handleCountSubmit = async (denom: Denominaciones, total: number) => {
        setDenominaciones(denom);
        setMontoContado(total);
        setSupervisorId('');
        setCodigoSupervisor('');
        setSupervisoresError(null);
        setError(null);

        try {
            setLoading(true);
            const response = await post(`/cajas/validar-cierre/${sesionId}`, {
                monto_contado: total,
                denominaciones: denom,
            });
            if (!response?.success || !response.data) {
                throw new Error(response?.message || 'No se pudo validar el arqueo');
            }

            const result = response.data as ClosePreview;
            setPreview(result);
            setMontoEsperado(Number(result.saldo_teorico));
            setDiferencia(Number(result.diferencia));

            if (result.requiere_supervisor) {
                try {
                    const supervisoresResponse = await get(
                        `/cajas/supervisores-autorizados/${encodeURIComponent(sesionId)}`,
                    );
                    const lista = supervisoresResponse?.data ?? supervisoresResponse;
                    setSupervisoresError(null);
                    setSupervisores(Array.isArray(lista) ? lista : []);
                } catch {
                    setSupervisores([]);
                    setSupervisoresError(
                        'No se pudo consultar a los supervisores habilitados. Reintente antes de cerrar.',
                    );
                }
            } else {
                setSupervisores([]);
            }

            setStep(result.requiere_justificacion ? 'JUSTIFICATION' : 'REVIEW');
        } catch (err: any) {
            setError(err?.message || 'No se pudo validar el arqueo');
            setStep('COUNT');
        } finally {
            setLoading(false);
        }
    };

    const handleJustificationSubmit = () => {
        if (!notas.trim()) {
            setError('Debe ingresar una justificación para la diferencia');
            return;
        }
        setError(null);
        setStep('REVIEW');
    };

    const handleCloseSession = async () => {
        try {
            setLoading(true);
            setError(null);

            const payload = {
                monto_contado: montoContado,
                denominaciones: denominaciones,
                notas: notas,
                ...(preview?.requiere_supervisor && supervisorId
                    ? { supervisor_id: supervisorId }
                    : {}),
                ...(preview?.requiere_supervisor && codigoSupervisor
                    ? { codigo_autorizacion: codigoSupervisor }
                    : {}),
            };

            const response = await post(`/cajas/cerrar/${sesionId}`, payload);

            if (response?.success) {
                onSuccess();
                onClose();
            } else {
                throw new Error(response?.message || 'Error al cerrar caja');
            }
        } catch (err: any) {
            console.error('Error cerrando caja:', err);
            setError(err.message || 'Error desconocido al cerrar caja');
        } finally {
            setLoading(false);
        }
    };

    return (
        <CashDialogFrame
            isOpen={isOpen}
            onClose={onClose}
            preventClose={loading}
            title="Cierre de caja"
            description="Valide, cuente y confirme el efectivo final de la sesión."
            className="sm:max-w-4xl"
        >
            <div className="w-full text-left">

                                {error && (
                                    <div className="mb-4 bg-destructive/10 border-l-4 border-red-400 p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <p className="text-sm text-destructive">{error}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {step === 'VALIDATING' && (
                                    <div className="space-y-4 text-center py-8">
                                        {loading ? (
                                            <p className="text-muted-foreground">Validando estado de la caja...</p>
                                        ) : (
                                            validation && !validation.valido ? (
                                                <div className="text-left">
                                                    <div className="bg-destructive/10 p-4 rounded-md mb-4">
                                                        <h4 className="text-destructive font-medium mb-2">No se puede cerrar la caja:</h4>
                                                        <ul className="list-disc list-inside text-destructive text-sm">
                                                            {validation.errores.map((err, idx) => (
                                                                <li key={idx}>{err}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    {validation.warnings.length > 0 && (
                                                        <div className="bg-amber-500/10 p-4 rounded-md">
                                                            <h4 className="text-amber-400 font-medium mb-2">Advertencias:</h4>
                                                            <ul className="list-disc list-inside text-amber-400 text-sm">
                                                                {validation.warnings.map((warn, idx) => (
                                                                    <li key={idx}>{warn}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    <div className="mt-6 flex justify-end">
                                                        <button
                                                            onClick={onClose}
                                                            className="px-4 py-2 bg-muted text-foreground rounded-md hover:bg-gray-300"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-emerald-400">Validación exitosa. Iniciando conteo...</p>
                                            )
                                        )}
                                    </div>
                                )}

                                {step === 'COUNT' && (
                                    <div>
                                        <div className="mb-4 bg-primary/10 p-3 rounded-md text-sm text-primary">
                                            Por favor realice el conteo físico del dinero en caja e ingrese las cantidades.
                                        </div>
                                        <DenominationForm
                                            initialValues={denominaciones}
                                            onSubmit={handleCountSubmit}
                                            readOnly={loading}
                                        />
                                    </div>
                                )}

                                {step === 'JUSTIFICATION' && (
                                    <div className="space-y-4">
                                        <div className="bg-amber-500/10 p-4 rounded-md border border-yellow-200">
                                            <h4 className="text-lg font-medium text-amber-400 mb-2">Diferencia Detectada</h4>
                                            <p className="text-amber-400 mb-2">
                                                El monto contado ({currencySymbol} {montoContado.toFixed(2)}) difiere del saldo esperado en el sistema.
                                            </p>
                                            <p className={`text-xl font-bold ${diferencia > 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                                                Diferencia: {diferencia > 0 ? '+' : ''}{currencySymbol} {diferencia.toFixed(2)}
                                            </p>
                                            {preview?.requiere_supervisor ? (
                                                <p className="mt-2 text-sm text-amber-300">
                                                    Supera la tolerancia configurada de {currencySymbol} {preview.tolerancia.toFixed(2)}. El backend exige autorización de supervisor.
                                                </p>
                                            ) : null}
                                        </div>

                                        <div>
                                            <label htmlFor="cashclosingdialog-justificacion-notas-obligatorio" className="block text-sm font-medium text-foreground/85 mb-1">
                                                Justificación / Notas (Obligatorio)
                                            </label>
                                            <textarea id="cashclosingdialog-justificacion-notas-obligatorio"
                                                rows={4}
                                                className="w-full border border-border rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                                value={notas}
                                                onChange={(e) => setNotas(e.target.value)}
                                                placeholder="Explique la razón de la diferencia..."
                                            />
                                        </div>

                                        <div className="flex justify-end space-x-3 pt-4">
                                            <button
                                                onClick={() => setStep('COUNT')}
                                                className="px-4 py-2 border border-border rounded-md text-foreground/85 hover:bg-muted/30"
                                            >
                                                Recontar
                                            </button>
                                            <button
                                                onClick={handleJustificationSubmit}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                            >
                                                Continuar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 'REVIEW' && (
                                    <div className="space-y-6">
                                        <div className="bg-muted/30 p-6 rounded-lg border border-border">
                                            <h4 className="text-lg font-medium text-foreground mb-4">Resumen de Cierre</h4>

                                            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-muted-foreground">Saldo Sistema</dt>
                                                    <dd className="mt-1 text-lg font-semibold text-foreground">
                                                        {currencySymbol} {montoEsperado.toFixed(2)}
                                                    </dd>
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-muted-foreground">Saldo Contado</dt>
                                                    <dd className="mt-1 text-lg font-bold text-primary">
                                                        {currencySymbol} {montoContado.toFixed(2)}
                                                    </dd>
                                                </div>

                                                <div className="sm:col-span-2 border-t border-border pt-4 mt-2">
                                                    <dt className="text-sm font-medium text-muted-foreground">Diferencia Final</dt>
                                                    <dd className={`mt-1 text-2xl font-bold ${diferencia === 0 ? 'text-foreground' : diferencia > 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                                                        {diferencia > 0 ? '+' : ''}{currencySymbol} {diferencia.toFixed(2)}
                                                    </dd>
                                                </div>

                                                {notas && (
                                                    <div className="sm:col-span-2 mt-2">
                                                        <dt className="text-sm font-medium text-muted-foreground">Notas</dt>
                                                        <dd className="mt-1 text-sm text-foreground/85 italic bg-card p-2 rounded border border-border">
                                                            {notas}
                                                        </dd>
                                                    </div>
                                                )}
                                            </dl>
                                        </div>

                                        {preview?.redondeo_efectivo_legal ? (
                                            <div className="rounded-md border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-200">
                                                La diferencia corresponde al redondeo legal del pago en efectivo en Perú y coincide con {preview.redondeo_efectivo_cantidad} ajuste(s) documentado(s) por un total de S/ {Number(preview.redondeo_efectivo_documentado || 0).toFixed(2)}. Se conservará como redondeo, no como faltante, y no requiere supervisor.
                                            </div>
                                        ) : null}

                                        {preview?.requiere_supervisor ? (
                                            <div className="space-y-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-4">
                                                <p className="text-sm text-amber-200">
                                                    Este arqueo no puede cerrarse sin un supervisor con PIN vigente.
                                                </p>
                                                <div>
                                                    <label htmlFor="cashclosingdialog-supervisor" className="mb-1 block text-sm font-medium text-foreground/85">
                                                        Supervisor que autoriza
                                                    </label>
                                                    <select
                                                        id="cashclosingdialog-supervisor"
                                                        value={supervisorId}
                                                        onChange={(event) => setSupervisorId(event.target.value)}
                                                        className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                                                    >
                                                        <option value="">Seleccione un supervisor…</option>
                                                        {supervisores.map((supervisor) => (
                                                            <option key={supervisor.id} value={supervisor.id}>{supervisor.nombre}</option>
                                                        ))}
                                                    </select>
                                                    {supervisoresError ? (
                                                        <p className="mt-1 text-xs text-destructive">
                                                            {supervisoresError}
                                                        </p>
                                                    ) : supervisores.length === 0 ? (
                                                        <p className="mt-1 text-xs text-muted-foreground">
                                                            No hay supervisores con PIN vigente; este cierre debe quedar pendiente hasta registrarlo.
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <div>
                                                    <label htmlFor="cashclosingdialog-pin" className="mb-1 block text-sm font-medium text-foreground/85">
                                                        PIN del supervisor
                                                    </label>
                                                    <input
                                                        id="cashclosingdialog-pin"
                                                        type="password"
                                                        inputMode="numeric"
                                                        autoComplete="off"
                                                        maxLength={6}
                                                        value={codigoSupervisor}
                                                        onChange={(event) => setCodigoSupervisor(event.target.value.replace(/[^0-9]/g, ''))}
                                                        className="h-11 w-full rounded-md border border-border bg-background px-3 tracking-[0.4em]"
                                                        placeholder="6 dígitos"
                                                    />
                                                </div>
                                            </div>
                                        ) : null}

                                        <div className="flex justify-end space-x-3">
                                            <button
                                                type="button"
                                                onClick={() => setStep('COUNT')}
                                                className="px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground/85 hover:bg-muted/30"
                                                disabled={loading}
                                            >
                                                Volver a contar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleCloseSession}
                                                disabled={loading || !preview || (preview.requiere_supervisor && (!supervisorId || codigoSupervisor.length !== 6))}
                                                className="px-6 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                            >
                                                {loading ? 'Cerrando...' : 'Confirmar Cierre'}
                                            </button>
                                        </div>
                                    </div>
                                )}
            </div>
        </CashDialogFrame>
    );
}
