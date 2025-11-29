import React, { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import { DenominationForm, Denominaciones } from './DenominationForm';

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
    const api = useApi();
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

    useEffect(() => {
        if (isOpen && sesionId) {
            iniciarCierre();
        }
    }, [isOpen, sesionId]);

    const iniciarCierre = async () => {
        setStep('VALIDATING');
        setError(null);
        setValidation(null);

        try {
            setLoading(true);
            // 1. Validar pre-cierre
            const valResponse = await api.get(`/cajas/validar-precierre/${sesionId}`);
            if (valResponse?.success) {
                setValidation(valResponse.data);

                // Si hay errores bloqueantes, quedarse en VALIDATING
                if (!valResponse.data.valido) {
                    return;
                }

                // 2. Obtener saldo esperado (para cálculo interno)
                const saldoResponse = await api.get(`/cajas/saldo-esperado/${sesionId}`);
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
    };

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

            const response = await api.post(`/cajas/cerrar/${sesionId}`, payload);

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                    <div className="absolute inset-0 bg-gray-500 opacity-75" onClick={onClose}></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
                    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 border-b pb-2">
                                    Cierre de Caja
                                </h3>

                                {error && (
                                    <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <p className="text-sm text-red-700">{error}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {step === 'VALIDATING' && (
                                    <div className="space-y-4 text-center py-8">
                                        {loading ? (
                                            <p className="text-gray-500">Validando estado de la caja...</p>
                                        ) : (
                                            validation && !validation.valido ? (
                                                <div className="text-left">
                                                    <div className="bg-red-50 p-4 rounded-md mb-4">
                                                        <h4 className="text-red-800 font-medium mb-2">No se puede cerrar la caja:</h4>
                                                        <ul className="list-disc list-inside text-red-700 text-sm">
                                                            {validation.errores.map((err, idx) => (
                                                                <li key={idx}>{err}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                    {validation.warnings.length > 0 && (
                                                        <div className="bg-yellow-50 p-4 rounded-md">
                                                            <h4 className="text-yellow-800 font-medium mb-2">Advertencias:</h4>
                                                            <ul className="list-disc list-inside text-yellow-700 text-sm">
                                                                {validation.warnings.map((warn, idx) => (
                                                                    <li key={idx}>{warn}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    <div className="mt-6 flex justify-end">
                                                        <button
                                                            onClick={onClose}
                                                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-green-600">Validación exitosa. Iniciando conteo...</p>
                                            )
                                        )}
                                    </div>
                                )}

                                {step === 'COUNT' && (
                                    <div>
                                        <div className="mb-4 bg-blue-50 p-3 rounded-md text-sm text-blue-800">
                                            Por favor realice el conteo físico del dinero en caja e ingrese las cantidades.
                                        </div>
                                        <DenominationForm onSubmit={handleCountSubmit} />
                                    </div>
                                )}

                                {step === 'JUSTIFICATION' && (
                                    <div className="space-y-4">
                                        <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200">
                                            <h4 className="text-lg font-medium text-yellow-800 mb-2">Diferencia Detectada</h4>
                                            <p className="text-yellow-700 mb-2">
                                                El monto contado (S/ {montoContado.toFixed(2)}) difiere del saldo esperado en el sistema.
                                            </p>
                                            <p className={`text-xl font-bold ${diferencia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                Diferencia: {diferencia > 0 ? '+' : ''}S/ {diferencia.toFixed(2)}
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Justificación / Notas (Obligatorio)
                                            </label>
                                            <textarea
                                                rows={4}
                                                className="w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                                                value={notas}
                                                onChange={(e) => setNotas(e.target.value)}
                                                placeholder="Explique la razón de la diferencia..."
                                            />
                                        </div>

                                        <div className="flex justify-end space-x-3 pt-4">
                                            <button
                                                onClick={() => setStep('COUNT')}
                                                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
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
                                        <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                                            <h4 className="text-lg font-medium text-gray-900 mb-4">Resumen de Cierre</h4>

                                            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-gray-500">Saldo Sistema</dt>
                                                    <dd className="mt-1 text-lg font-semibold text-gray-900">
                                                        S/ {montoEsperado.toFixed(2)}
                                                    </dd>
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-gray-500">Saldo Contado</dt>
                                                    <dd className="mt-1 text-lg font-bold text-blue-600">
                                                        S/ {montoContado.toFixed(2)}
                                                    </dd>
                                                </div>

                                                <div className="sm:col-span-2 border-t border-gray-200 pt-4 mt-2">
                                                    <dt className="text-sm font-medium text-gray-500">Diferencia Final</dt>
                                                    <dd className={`mt-1 text-2xl font-bold ${diferencia === 0 ? 'text-gray-900' : diferencia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {diferencia > 0 ? '+' : ''}S/ {diferencia.toFixed(2)}
                                                    </dd>
                                                </div>

                                                {notas && (
                                                    <div className="sm:col-span-2 mt-2">
                                                        <dt className="text-sm font-medium text-gray-500">Notas</dt>
                                                        <dd className="mt-1 text-sm text-gray-700 italic bg-white p-2 rounded border border-gray-200">
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
                                                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
