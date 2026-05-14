import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { DenominationForm, Denominaciones } from './DenominationForm';

interface CashOpenDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface Caja {
    id: string;
    nombre: string;
    codigo: string;
    estado: string;
}

export function CashOpenDialog({ isOpen, onClose, onSuccess }: CashOpenDialogProps) {
    const api = useApi();
    const [step, setStep] = useState<'SELECT_CAJA' | 'AMOUNT' | 'CONFIRM'>('SELECT_CAJA');
    const [cajas, setCajas] = useState<Caja[]>([]);
    const [selectedCajaId, setSelectedCajaId] = useState<string>('');
    const [montoInicio, setMontoInicio] = useState<number>(0);
    const [denominaciones, setDenominaciones] = useState<Denominaciones>({ billetes: {}, monedas: {} });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cargarCajas = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/cajas');
            if (response?.success) {
                // Filter only closed boxes or available ones
                const cajasDisponibles = response.data.filter((c: Caja) => c.estado === 'CERRADA');
                setCajas(cajasDisponibles);
                if (cajasDisponibles.length === 1) {
                    setSelectedCajaId(cajasDisponibles[0].id);
                    setStep('AMOUNT');
                }
            }
        } catch (err: any) {
            setError('Error cargando cajas disponibles');
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (isOpen) {
            cargarCajas();
            setStep('SELECT_CAJA');
            setMontoInicio(0);
            setDenominaciones({ billetes: {}, monedas: {} });
            setError(null);
        }
    }, [cargarCajas, isOpen]);

    const handleDenominationSubmit = (denom: Denominaciones, total: number) => {
        setDenominaciones(denom);
        setMontoInicio(total);
        setStep('CONFIRM');
    };

    const handleOpenSession = async () => {
        try {
            setLoading(true);
            setError(null);

            const payload = {
                caja_id: selectedCajaId,
                monto_inicio: montoInicio,
                denominaciones: denominaciones,
            };

            const response = await api.post('/cajas/abrir', payload);

            if (response?.success) {
                onSuccess();
                onClose();
            } else {
                throw new Error(response?.message || 'Error al abrir caja');
            }
        } catch (err: any) {
            console.error('Error abriendo caja:', err);
            setError(err.message || 'Error desconocido al abrir caja');
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

                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
                    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                    Apertura de Caja
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

                                {step === 'SELECT_CAJA' && (
                                    <div className="space-y-4">
                                        <p className="text-sm text-gray-500">Seleccione la caja que desea abrir:</p>
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            {cajas.map((caja) => (
                                                <div
                                                    key={caja.id}
                                                    onClick={() => {
                                                        setSelectedCajaId(caja.id);
                                                        setStep('AMOUNT');
                                                    }}
                                                    className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 cursor-pointer"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <span className="absolute inset-0" aria-hidden="true" />
                                                        <p className="text-sm font-medium text-gray-900">{caja.nombre}</p>
                                                        <p className="text-sm text-gray-500 truncate">{caja.codigo}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {cajas.length === 0 && !loading && (
                                            <p className="text-center text-gray-500 py-4">No hay cajas disponibles para abrir.</p>
                                        )}
                                    </div>
                                )}

                                {step === 'AMOUNT' && (
                                    <div>
                                        <p className="text-sm text-gray-500 mb-4">Ingrese el detalle del efectivo inicial:</p>
                                        <DenominationForm onSubmit={handleDenominationSubmit} />
                                        <div className="mt-4 flex justify-start">
                                            <button
                                                type="button"
                                                onClick={() => setStep('SELECT_CAJA')}
                                                className="text-sm text-gray-600 hover:text-gray-900 underline"
                                            >
                                                Volver a selección de caja
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 'CONFIRM' && (
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 p-4 rounded-md">
                                            <h4 className="text-sm font-medium text-blue-800 mb-2">Resumen de Apertura</h4>
                                            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-gray-500">Caja</dt>
                                                    <dd className="mt-1 text-sm text-gray-900">
                                                        {cajas.find(c => c.id === selectedCajaId)?.nombre}
                                                    </dd>
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-gray-500">Monto Inicial</dt>
                                                    <dd className="mt-1 text-2xl font-bold text-blue-600">
                                                        S/ {montoInicio.toFixed(2)}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </div>

                                        <p className="text-sm text-gray-500">
                                            Al confirmar, se iniciará una nueva sesión y se registrará este monto como saldo inicial.
                                        </p>

                                        <div className="flex justify-end space-x-3">
                                            <button
                                                type="button"
                                                onClick={() => setStep('AMOUNT')}
                                                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                                disabled={loading}
                                            >
                                                Corregir Monto
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleOpenSession}
                                                disabled={loading}
                                                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                                            >
                                                {loading ? 'Abriendo...' : 'Confirmar Apertura'}
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
