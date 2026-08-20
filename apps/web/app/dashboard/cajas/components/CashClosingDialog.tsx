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

export function CashClosingDialog({ isOpen, onClose, onSuccess, sesionId }: CashClosingDialogProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    const { get, post } = useApi();
    const [step, setStep] = useState<'VALIDATING' | 'COUNT' | 'REVIEW' | 'JUSTIFICATION' | 'CONFIRM'>('VALIDATING');
    const [validation, setValidation] = useState<PreCloseValidation | null>(null);
    const [denominaciones, setDenominaciones] = useState<Denominaciones>({ billetes: {}, monedas: {} });
    const [montoContado, setMontoContado] = useState<number>(0);
    const [montoEsperado, setMontoEsperado] = useState<number>(0);
    const [diferencia, setDiferencia] = useState<number>(0);
    const [notas, setNotas] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Configuración (idealmente vendría del backend)
    const TOLERANCIA = 10;

    const iniciarCierre = useCallback(async () => {
        setStep('VALIDATING');
        setError(null);
        setValidation(null);

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

    const handleCountSubmit = (denom: Denominaciones, total: number) => {
        setDenominaciones(denom);
        setMontoContado(total);
        const diff = total - montoEsperado;
        setDiferencia(diff);

        if (Math.abs(diff) > TOLERANCIA) {
            setStep('JUSTIFICATION');
        } else {
            setStep('REVIEW');
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
                // supervisor_id y codigo se agregarían aquí si fuera necesario
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
                                        <DenominationForm onSubmit={handleCountSubmit} />
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
                                                disabled={loading}
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
