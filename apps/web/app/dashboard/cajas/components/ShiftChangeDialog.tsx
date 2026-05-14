import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { DenominationForm, Denominaciones } from './DenominationForm';

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

export function ShiftChangeDialog({ isOpen, onClose, onSuccess, sesionId }: ShiftChangeDialogProps) {
    const api = useApi();
    const [step, setStep] = useState<'USER_SELECT' | 'COUNT' | 'SIGNATURES' | 'CONFIRM'>('USER_SELECT');
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [cambioId, setCambioId] = useState<string>('');
    const [denominaciones, setDenominaciones] = useState<Denominaciones>({ billetes: {}, monedas: {} });
    const [montoContado, setMontoContado] = useState<number>(0);
    const [saldoSistema, setSaldoSistema] = useState<number>(0);
    const [diferencia, setDiferencia] = useState<number>(0);
    const [firmaSaliente, setFirmaSaliente] = useState('');
    const [firmaEntrante, setFirmaEntrante] = useState('');
    const [fotoArqueo, setFotoArqueo] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cargarUsuarios = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch users (cajeros)
            const response = await api.get('/usuarios?rol=CAJERO'); // Adjust endpoint as needed
            if (response?.success) {
                setUsers(response.data || []);
            }
        } catch (err: any) {
            console.error('Error cargando usuarios:', err);
            // Mock users if API fails for demo
            setUsers([
                { id: 'u2', nombres: 'Juan', apellidos: 'Perez' },
                { id: 'u3', nombres: 'Maria', apellidos: 'Gomez' },
            ]);
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (isOpen) {
            cargarUsuarios();
            setStep('USER_SELECT');
            setError(null);
            setCambioId('');
            setFotoArqueo('');
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
            const response = await api.post(`/cajas/cambio-turno/iniciar/${sesionId}`, {
                usuario_entrante_id: selectedUserId
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
        setStep('SIGNATURES');
    };

    const handleSignaturesSubmit = async () => {
        if (!firmaSaliente || !firmaEntrante) {
            setError('Ambas firmas son requeridas');
            return;
        }
        if (!fotoArqueo.trim()) {
            setError('Debe ingresar la URL de la foto del arqueo');
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
                firma_saliente: firmaSaliente,
                firma_entrante: firmaEntrante,
                foto_arqueo: fotoArqueo,
            };

            const response = await api.post(`/cajas/cambio-turno/completar/${cambioId}`, payload);

            if (response?.success) {
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
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 border-b pb-2">
                            Cambio de Turno
                        </h3>

                        {error && (
                            <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        {step === 'USER_SELECT' && (
                            <div className="space-y-4">
                                <p className="text-sm text-gray-500">Seleccione el usuario que recibirá la caja:</p>
                                <select
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
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
                                <div className="mb-4 bg-blue-50 p-3 rounded-md text-sm text-blue-800">
                                    Realice el arqueo para entregar la caja.
                                </div>
                                <DenominationForm onSubmit={handleCountSubmit} />
                            </div>
                        )}

                        {step === 'SIGNATURES' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Firma Usuario Saliente</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-md p-2"
                                            placeholder="Ingrese su contraseña/PIN"
                                            value={firmaSaliente}
                                            onChange={(e) => setFirmaSaliente(e.target.value)}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Simulación de firma digital</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Firma Usuario Entrante</label>
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-md p-2"
                                            placeholder="Ingrese su contraseña/PIN"
                                            value={firmaEntrante}
                                            onChange={(e) => setFirmaEntrante(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">URL Foto Arqueo</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 rounded-md p-2"
                                        placeholder="https://..."
                                        value={fotoArqueo}
                                        onChange={(e) => setFotoArqueo(e.target.value)}
                                    />
                                </div>

                                <div className="bg-gray-50 p-4 rounded-md">
                                    <dl className="grid grid-cols-2 gap-4">
                                        <div>
                                            <dt className="text-sm font-medium text-gray-500">Saldo Sistema</dt>
                                            <dd className="text-lg font-semibold">S/ {saldoSistema.toFixed(2)}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-sm font-medium text-gray-500">Saldo Contado</dt>
                                            <dd className="text-lg font-semibold text-blue-600">S/ {montoContado.toFixed(2)}</dd>
                                        </div>
                                        <div className="col-span-2 border-t pt-2">
                                            <dt className="text-sm font-medium text-gray-500">Diferencia</dt>
                                            <dd className={`text-xl font-bold ${diferencia === 0 ? 'text-gray-900' : diferencia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {diferencia > 0 ? '+' : ''}S/ {diferencia.toFixed(2)}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <button
                                        onClick={() => setStep('COUNT')}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700"
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
                                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-lg leading-6 font-medium text-gray-900">Confirmar Cambio de Turno</h3>
                                <p className="mt-2 text-sm text-gray-500">
                                    Se cerrará su sesión y se abrirá una nueva para el usuario entrante con el saldo contado.
                                </p>
                                <div className="mt-6 flex justify-center space-x-3">
                                    <button
                                        onClick={() => setStep('SIGNATURES')}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700"
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
                    </div>
                </div>
            </div>
        </div>
    );
}
