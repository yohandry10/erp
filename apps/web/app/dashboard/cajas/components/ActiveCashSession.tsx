import React from 'react';
import { cn } from '@/lib/utils'
import { CashOperationsPanel } from './CashOperationsPanel';
import { CashMovementsTable } from './CashMovementsTable';
import { useCountryContext } from '@/hooks/use-country-context';

interface SesionCaja {
    id: string;
    estado: string;
    hora_apertura: string;
    monto_inicio: number;
    usuario?: {
        nombres: string;
        apellidos: string;
    };
    caja?: {
        nombre: string;
        codigo: string;
    };
}

interface ActiveCashSessionProps {
    sesion: SesionCaja;
    onCloseSession: () => void;
    className?: string;
}

export function ActiveCashSession({ sesion, onCloseSession, className = '' }: ActiveCashSessionProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    return (
        <div className={cn(className, "flex flex-col gap-6")}>
            {/* Header */}
            <div className="rounded-2xl p-6 shadow border flex justify-between items-start relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 right-0 h-[4px]"
                />
                <div>
                    <div className="flex items-center gap-3 mb-3">
                        <h2 className="text-2xl font-bold text-foreground m-0"
                        >
                            💰 {sesion.caja?.nombre || 'Caja Principal'}
                        </h2>
                        <span className="py-1.5 px-3 text-[0.875rem] font-semibold bg-[#dcfce7] text-emerald-400 rounded-full border"
                        >
                            {sesion.estado}
                        </span>
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-col gap-1">
                        <p className="m-0">
                            Abierto por: <span className="font-semibold text-foreground">{sesion.usuario?.nombres} {sesion.usuario?.apellidos}</span>
                        </p>
                        <p className="m-0">
                            Hora apertura: <span className="font-semibold text-foreground">{new Date(sesion.hora_apertura).toLocaleString('es-PE')}</span>
                        </p>
                        <p className="m-0">
                            Monto inicial: <span className="font-bold text-emerald-400">{currencySymbol} {sesion.monto_inicio.toFixed(2)}</span>
                        </p>
                    </div>
                </div>
                <button
                    onClick={onCloseSession} className="bg-muted text-foreground/80 border py-2 px-4 rounded-lg text-[0.875rem] font-medium cursor-pointer transition"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e2e8f0';
                        e.currentTarget.style.borderColor = '#94a3b8';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                    }}
                >
                    ← Cambiar sesión
                </button>
            </div>

            {/* Operations Panel */}
            <CashOperationsPanel
                sesionId={sesion.id}
                onOperationComplete={onCloseSession}
            />

            {/* Movements Table */}
            <div className="rounded-2xl shadow border overflow-hidden relative"
            >
                <div className="absolute top-0 left-0 right-0 h-[4px]"
                />
                <div className="py-5 px-6 border-b"
                >
                    <h3 className="text-[1.125rem] font-bold text-foreground m-0"
                    >
                        📋 Movimientos del Turno
                    </h3>
                </div>
                <CashMovementsTable sesionId={sesion.id} />
            </div>
        </div>
    );
}
