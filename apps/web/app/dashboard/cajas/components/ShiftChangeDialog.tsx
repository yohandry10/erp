import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { DenominationForm, Denominaciones } from './DenominationForm';
import { CashDialogFrame } from './CashDialogFrame';
import { useCountryContext } from '@/hooks/use-country-context';

interface ShiftChangeDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    sesionId: string;
}

interface User {
    id: string;
    nombres: string;
    apellidos: string;
}

interface AccountingOption {
    id: string;
    codigo: string;
    nombre: string;
    aplicable_a?: { gasto?: boolean; ingreso?: boolean };
}

export function ShiftChangeDialog({ isOpen, onClose, onSuccess, sesionId }: ShiftChangeDialogProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    const { get, post } = useApi();
    const [step, setStep] = useState<'USER_SELECT' | 'COUNT' | 'SIGNATURES' | 'CONFIRM'>('USER_SELECT');
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [cambioId, setCambioId] = useState<string>('');
    const [denominaciones, setDenominaciones] = useState<Denominaciones>({ billetes: {}, monedas: {} });
    const [montoContado, setMontoContado] = useState<number>(0);
    const [saldoSistema, setSaldoSistema] = useState<number>(0);
    const [diferencia, setDiferencia] = useState<number>(0);
    const [confirmacionSaliente, setConfirmacionSaliente] = useState('');
    const [confirmacionEntrante, setConfirmacionEntrante] = useState('');
    const [fotoArqueo, setFotoArqueo] = useState('');
    const [cuentaDiferenciaId, setCuentaDiferenciaId] = useState('');
    const [cuentas, setCuentas] = useState<AccountingOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const startKey = useRef('');
    const completeKey = useRef('');
    const cancelKey = useRef('');

    const operationKey = useCallback((ref: React.MutableRefObject<string>, prefix: string) => {
        if (!ref.current) {
            ref.current = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        return ref.current;
    }, []);

    const cargarUsuarios = useCallback(async () => {
        try {
            setLoading(true);
            const [usersResponse, accountingResponse] = await Promise.all([
                get('/usuarios?rol=CAJERO'),
                get('/cajas/opciones-contables'),
            ]);
            if (!usersResponse?.success || !accountingResponse?.success) {
                throw new Error('No se pudieron cargar usuarios y cuentas del cambio de turno');
            }
            setUsers(usersResponse.data || []);
            setCuentas(accountingResponse.data?.cuentas || []);
        } catch (err: any) {
            console.error('Error cargando usuarios:', err);
            setUsers([]);
            setCuentas([]);
            setError(err.message || 'No se pudieron cargar datos reales del cambio de turno');
        } finally {
            setLoading(false);
        }
    }, [get]);

    useEffect(() => {
        if (isOpen) {
            cargarUsuarios();
            setStep('USER_SELECT');
            setError(null);
            setCambioId('');
            setSelectedUserId('');
            setFotoArqueo('');
            setConfirmacionSaliente('');
            setConfirmacionEntrante('');
            setCuentaDiferenciaId('');
            startKey.current = '';
            completeKey.current = '';
            cancelKey.current = '';
        }
    }, [cargarUsuarios, isOpen]);

    const handleUserSelect = async () => {
        if (!selectedUserId) {
            setError('Seleccione el usuario entrante');
            return;
        }

        try {
            setLoading(true);
            // Iniciar cambio de turno (congelar caja)
            const response = await post(`/cajas/cambio-turno/iniciar/${sesionId}`, {
                usuario_entrante_id: selectedUserId
            }, {
                headers: { 'Idempotency-Key': operationKey(startKey, 'cash-shift-start') },
            });

            if (response?.success) {
                setCambioId(response.data.id);
                setSaldoSistema(response.data.saldo_sistema);
                setStep('COUNT');
                setError(null);
            } else {
                throw new Error(response?.message || 'Error iniciando cambio de turno');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCountSubmit = (denom: Denominaciones, total: number) => {
        setDenominaciones(denom);
        setMontoContado(total);
        setDiferencia(total - saldoSistema);
        setCuentaDiferenciaId('');
        completeKey.current = '';
        setStep('SIGNATURES');
    };

    const handleSignaturesSubmit = async () => {
        if (!confirmacionSaliente || !confirmacionEntrante) {
            setError('Ambas confirmaciones internas son requeridas');
            return;
        }
        if (!fotoArqueo.trim()) {
            setError('Debe ingresar la URL de la foto del arqueo');
            return;
        }
        if (Math.abs(diferencia) >= 0.01 && !cuentaDiferenciaId) {
            setError('Seleccione la cuenta contable para la diferencia del arqueo');
            return;
        }

        setStep('CONFIRM');
    };

    const handleConfirm = async () => {
        try {
            setLoading(true);
            const payload = {
                monto_contado: montoContado,
                denominaciones,
                confirmacion_saliente: confirmacionSaliente,
                confirmacion_entrante: confirmacionEntrante,
                foto_arqueo: fotoArqueo,
                cuenta_diferencia_id: Math.abs(diferencia) >= 0.01 ? cuentaDiferenciaId : undefined,
            };

            const response = await post(`/cajas/cambio-turno/completar/${cambioId}`, payload, {
                headers: { 'Idempotency-Key': operationKey(completeKey, 'cash-shift-complete') },
            });

            if (response?.success) {
                setCambioId('');
                onSuccess();
                onClose();
            } else {
                throw new Error(response?.message || 'Error completando cambio de turno');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = async () => {
        if (!cambioId) {
            onClose();
            return;
        }

        try {
            setLoading(true);
            const response = await post(`/cajas/cambio-turno/cancelar/${cambioId}`, {
                razon: 'Cancelado por el usuario desde el asistente',
            }, {
                headers: { 'Idempotency-Key': operationKey(cancelKey, 'cash-shift-cancel') },
            });
            if (!response?.success) {
                throw new Error(response?.message || 'No se pudo cancelar el cambio de turno');
            }
            setCambioId('');
            onClose();
        } catch (err: any) {
            setError(
                err.message || 'No se pudo descongelar la caja; reintente la cancelación antes de cerrar',
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <CashDialogFrame
            isOpen={isOpen}
            onClose={() => { void handleClose(); }}
            preventClose={loading}
            title="Cambio de turno"
            description="Transfiera la sesión de caja a otro usuario con un conteo verificado."
            className="sm:max-w-3xl"
        >
            <div className="w-full text-left">

                        {error && (
                            <div className="mb-4 bg-destructive/10 border-l-4 border-red-400 p-4">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>
                        )}

                        {step === 'USER_SELECT' && (
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">Seleccione el usuario que recibirá la caja:</p>
                                <select
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-border focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                    value={selectedUserId}
                                    onChange={(e) => {
                                        setSelectedUserId(e.target.value);
                                        startKey.current = '';
                                    }}
                                >
                                    <option value="">Seleccione un usuario...</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.nombres} {user.apellidos}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex justify-end mt-4">
                                    <button
                                        onClick={handleUserSelect}
                                        disabled={loading}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {loading ? 'Iniciando...' : 'Continuar'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 'COUNT' && (
                            <div>
                                <div className="mb-4 bg-primary/10 p-3 rounded-md text-sm text-primary">
                                    Realice el arqueo para entregar la caja.
                                </div>
                                <DenominationForm onSubmit={handleCountSubmit} />
                            </div>
                        )}

                        {step === 'SIGNATURES' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-foreground/85 mb-2">Confirmación del usuario saliente</label>
                                        <input
                                            type="password"
                                            autoComplete="new-password"
                                            className="w-full border border-border rounded-md p-2"
                                            placeholder="Código de confirmación interno"
                                            value={confirmacionSaliente}
                                            onChange={(e) => {
                                                setConfirmacionSaliente(e.target.value);
                                                completeKey.current = '';
                                            }}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Se guarda sólo un hash de evidencia operativa; no es una firma legal.
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-foreground/85 mb-2">Confirmación del usuario entrante</label>
                                        <input
                                            type="password"
                                            autoComplete="new-password"
                                            className="w-full border border-border rounded-md p-2"
                                            placeholder="Código de confirmación interno"
                                            value={confirmacionEntrante}
                                            onChange={(e) => {
                                                setConfirmacionEntrante(e.target.value);
                                                completeKey.current = '';
                                            }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground/85 mb-2">URL Foto Arqueo</label>
                                    <input
                                        type="text"
                                        className="w-full border border-border rounded-md p-2"
                                        placeholder="https://..."
                                            value={fotoArqueo}
                                            onChange={(e) => {
                                                setFotoArqueo(e.target.value);
                                                completeKey.current = '';
                                            }}
                                    />
                                </div>

                                {Math.abs(diferencia) >= 0.01 && (
                                    <div>
                                        <label className="block text-sm font-medium text-foreground/85 mb-2">
                                            Cuenta de {diferencia > 0 ? 'ingreso por sobrante' : 'gasto por faltante'}
                                        </label>
                                        <select
                                            aria-label="Cuenta contable de diferencia de turno"
                                            className="w-full rounded-md border border-border p-2 text-sm"
                                            value={cuentaDiferenciaId}
                                            onChange={(e) => {
                                                setCuentaDiferenciaId(e.target.value);
                                                completeKey.current = '';
                                            }}
                                        >
                                            <option value="">Seleccione una cuenta...</option>
                                            {cuentas
                                                .filter((cuenta) => diferencia > 0
                                                    ? cuenta.aplicable_a?.ingreso
                                                    : cuenta.aplicable_a?.gasto)
                                                .map((cuenta) => (
                                                    <option key={cuenta.id} value={cuenta.id}>
                                                        {cuenta.codigo} · {cuenta.nombre}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                )}

                                <div className="bg-muted/30 p-4 rounded-md">
                                    <dl className="grid grid-cols-2 gap-4">
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Saldo Sistema</dt>
                                            <dd className="text-lg font-semibold">{currencySymbol} {saldoSistema.toFixed(2)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-sm font-medium text-muted-foreground">Saldo Contado</dt>
                                            <dd className="text-lg font-semibold text-primary">{currencySymbol} {montoContado.toFixed(2)}</dd>
                                        </div>
                                        <div className="col-span-2 border-t pt-2">
                                            <dt className="text-sm font-medium text-muted-foreground">Diferencia</dt>
                                            <dd className={`text-xl font-bold ${diferencia === 0 ? 'text-foreground' : diferencia > 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                                                {diferencia > 0 ? '+' : ''}{currencySymbol} {diferencia.toFixed(2)}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <button
                                        onClick={() => setStep('COUNT')}
                                        className="px-4 py-2 border border-border rounded-md text-foreground/85"
                                    >
                                        Volver a contar
                                    </button>
                                    <button
                                        onClick={handleSignaturesSubmit}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                    >
                                        Continuar
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 'CONFIRM' && (
                            <div className="text-center py-6">
                                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-500/10 mb-4">
                                    <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-lg leading-6 font-medium text-foreground">Confirmar Cambio de Turno</h3>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Se transferirá la responsabilidad de la misma sesión al usuario entrante. Sólo la diferencia del arqueo generará movimiento y asiento.
                                </p>
                                <div className="mt-6 flex justify-center space-x-3">
                                    <button
                                        onClick={() => setStep('SIGNATURES')}
                                        className="px-4 py-2 border border-border rounded-md text-foreground/85"
                                        disabled={loading}
                                    >
                                        Atrás
                                    </button>
                                    <button
                                        onClick={handleConfirm}
                                        disabled={loading}
                                        className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {loading ? 'Procesando...' : 'Confirmar y Salir'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {cambioId && step !== 'USER_SELECT' && (
                            <div className="mt-6 border-t border-border pt-4 text-left">
                                <button
                                    type="button"
                                    onClick={() => { void handleClose(); }}
                                    disabled={loading}
                                    className="text-sm font-medium text-destructive hover:underline disabled:opacity-50"
                                >
                                    Cancelar cambio y descongelar caja
                                </button>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    El diálogo sólo se cerrará cuando la cancelación quede confirmada por el servidor.
                                </p>
                            </div>
                        )}
            </div>
        </CashDialogFrame>
    );
}
