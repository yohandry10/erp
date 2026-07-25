'use client';

import React, { useState } from 'react';
import { Info, Unlock, WalletCards } from 'lucide-react';
import { CashSessionSelector } from './components/CashSessionSelector';
import { ActiveCashSession } from './components/ActiveCashSession';
import { CashOpenDialog } from './components/CashOpenDialog';
import { CortesList } from './components/CortesList';
import { useToast } from '@/components/ui/use-toast';

export default function CashManagementPage() {
    const { toast } = useToast();
    const [sesionActiva, setSesionActiva] = useState<any | null>(null);
    const [showOpenDialog, setShowOpenDialog] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleSessionSelect = (sesion: any) => {
        setSesionActiva(sesion);
    };

    const handleCloseSessionView = () => {
        setSesionActiva(null);
        setRefreshKey(prev => prev + 1);
    };

    const handleOpenSuccess = () => {
        setRefreshKey(prev => prev + 1);
        toast({
            title: 'Caja abierta',
            description: 'La sesión de caja se ha iniciado correctamente.',
        });
    };

    return (
        <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8"
        >
            {/* Header */}
            <div className="rounded-3xl p-8 mb-8 shadow border flex justify-between items-center flex-wrap gap-4 relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 right-0 h-[6px]"
                />
                <div>
                    <h1 className="text-[2.5rem] font-black m-0"
                    >
                        <span className="inline-flex items-center gap-3"><WalletCards className="size-8 text-primary" aria-hidden="true" /> Gestión de Cajas</span>
                    </h1>
                    <p className="text-base text-foreground/80 font-medium mt-2"
                    >
                        Administración de turnos, movimientos y cierres
                    </p>
                </div>
                {!sesionActiva && (
                    <button
                        onClick={() => setShowOpenDialog(true)} className="flex cursor-pointer items-center gap-2 rounded-xl border border-primary bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow transition hover:bg-primary/90 sm:px-8 sm:py-4"
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                            e.currentTarget.style.boxShadow = '0 25px 50px -12px rgb(0 0 0 / 0.25)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)';
                        }}
                    >
                        <Unlock className="size-5" aria-hidden="true" /> Abrir Nueva Caja
                    </button>
                )}
            </div>

            {!sesionActiva ? (
                <div className="flex flex-col gap-6">
                    <CashSessionSelector
                        key={refreshKey}
                        onSelect={handleSessionSelect}
                    />

                    <CortesList id="cortes" />

                    {/* Info Card */}
                    <div className="border rounded-xl p-5 flex items-start gap-4 shadow"
                    >
                        <div className="shrink-0 w-10 h-10 rounded-[0.625rem] flex items-center justify-center bg-primary"
                        >
                            <Info className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div>
                            <h4 className="text-base font-bold text-primary m-0 mb-2"
                            >
                                Información
                            </h4>
                            <p className="text-sm text-foreground/80 m-0 leading-7"
                            >
                                Seleccione una sesión activa para ver detalles, registrar movimientos o realizar el cierre.
                                Si no hay sesiones abiertas, puede iniciar una nueva con el botón &quot;Abrir Nueva Caja&quot;.
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <ActiveCashSession
                    sesion={sesionActiva}
                    onCloseSession={handleCloseSessionView}
                />
            )}

            <CashOpenDialog
                isOpen={showOpenDialog}
                onClose={() => setShowOpenDialog(false)}
                onSuccess={handleOpenSuccess}
            />
        </div>
    );
}
