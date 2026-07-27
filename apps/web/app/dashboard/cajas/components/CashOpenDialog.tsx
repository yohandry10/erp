import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { DenominationForm, Denominaciones } from './DenominationForm';
import { CashDialogFrame } from './CashDialogFrame';

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
    const { get, post } = useApi();
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
            const response = await get('/cajas');
            if (response?.success) {
                // `estado` describe si la caja (registradora) está habilitada
                // ('ACTIVO'/'INACTIVO'), no si hay una sesión abierta. Filtrar por
                // 'CERRADA' dejaba el diálogo vacío en tenants nuevos, cuya caja
                // se siembra como 'ACTIVO'. El backend rechaza abrir una sesión si
                // ya hay una abierta, así que basta con excluir cajas deshabilitadas.
                const cajasDisponibles = (response.data as Caja[]).filter(
                    (c) => String(c.estado).toUpperCase() !== 'INACTIVO',
                );
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
    }, [get]);

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

            // El backend expone POST /cajas/:id/apertura con AbrirCajaDto
            // (ValidationPipe estricto: sólo campos whitelisted). El id va en la
            // URL y el arqueo en `denominaciones_apertura`.
            const payload = {
                monto_inicio: montoInicio,
                denominaciones_apertura: denominaciones,
            };

            const response = await post(`/cajas/${selectedCajaId}/apertura`, payload);

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

    return (
        <CashDialogFrame
            isOpen={isOpen}
            onClose={onClose}
            preventClose={loading}
            title="Apertura de caja"
            description="Seleccione la caja y registre el efectivo inicial de la sesión."
            className="sm:max-w-3xl"
        >
            <div className="w-full text-left">

                                {error && (
                                    <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-4">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-destructive" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <p className="text-sm text-destructive">{error}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {step === 'SELECT_CAJA' && (
                                    <div className="space-y-4">
                                        <p className="text-sm text-muted-foreground">Seleccione la caja que desea abrir:</p>
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            {cajas.map((caja) => (
                                                <div
                                                    key={caja.id}
                                                    onClick={() => {
                                                        setSelectedCajaId(caja.id);
                                                        setStep('AMOUNT');
                                                    }}
                                                    className="relative rounded-lg border border-border bg-card px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 cursor-pointer"
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <span className="absolute inset-0" aria-hidden="true" />
                                                        <p className="text-sm font-medium text-foreground">{caja.nombre}</p>
                                                        <p className="text-sm text-muted-foreground truncate">{caja.codigo}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {cajas.length === 0 && !loading && (
                                            <p className="text-center text-muted-foreground py-4">No hay cajas disponibles para abrir.</p>
                                        )}
                                    </div>
                                )}

                                {step === 'AMOUNT' && (
                                    <div>
                                        <p className="text-sm text-muted-foreground mb-4">Ingrese el detalle del efectivo inicial:</p>
                                        <DenominationForm onSubmit={handleDenominationSubmit} />
                                        <div className="mt-4 flex justify-start">
                                            <button
                                                type="button"
                                                onClick={() => setStep('SELECT_CAJA')}
                                                className="text-sm text-foreground/80 hover:text-foreground underline"
                                            >
                                                Volver a selección de caja
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {step === 'CONFIRM' && (
                                    <div className="space-y-6">
                                        <div className="bg-primary/10 border border-primary/20 p-4 rounded-md">
                                            <h4 className="text-sm font-medium text-primary mb-2">Resumen de Apertura</h4>
                                            <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-muted-foreground">Caja</dt>
                                                    <dd className="mt-1 text-sm text-foreground">
                                                        {cajas.find(c => c.id === selectedCajaId)?.nombre}
                                                    </dd>
                                                </div>
                                                <div className="sm:col-span-1">
                                                    <dt className="text-sm font-medium text-muted-foreground">Monto Inicial</dt>
                                                    <dd className="mt-1 text-2xl font-bold text-primary">
                                                        S/ {montoInicio.toFixed(2)}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </div>

                                        <p className="text-sm text-muted-foreground">
                                            Al confirmar, se iniciará una nueva sesión y se registrará este monto como saldo inicial.
                                        </p>

                                        <div className="flex justify-end space-x-3">
                                            <button
                                                type="button"
                                                onClick={() => setStep('AMOUNT')}
                                                className="px-4 py-2 border border-border rounded-md text-sm font-medium text-foreground/85 hover:bg-muted/30"
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
        </CashDialogFrame>
    );
}
