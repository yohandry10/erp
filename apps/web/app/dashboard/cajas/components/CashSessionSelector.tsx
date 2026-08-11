import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils'
import { useApi } from '@/hooks/use-api';
import { useCountryContext } from '@/hooks/use-country-context';

interface SesionCaja {
    id: string;
    estado: string;
    hora_apertura: string;
    hora_cierre?: string;
    monto_inicio: number;
    monto_cierre?: number;
    diferencia?: number;
    usuario?: {
        nombres?: string;
        apellidos?: string;
        nombre?: string;
        apellido?: string;
        email?: string;
    };
    caja?: {
        nombre: string;
        codigo: string;
    };
}

interface CashSessionSelectorProps {
    onSelect: (sesion: SesionCaja) => void;
    onOpen?: () => void;
    className?: string;
}

export function CashSessionSelector({ onSelect, onOpen, className = '' }: CashSessionSelectorProps) {
    const country = useCountryContext();
    const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
    const { get } = useApi();
    const [sesiones, setSesiones] = useState<SesionCaja[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cargarSesiones = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch open sessions first, then closed ones
            const response = await get('/cajas/sesiones');
            if (response?.success) {
                setSesiones(response.data || []);
            } else {
                throw new Error(response?.message || 'Error cargando sesiones');
            }
        } catch (err: any) {
            console.warn('Error cargando sesiones:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [get]);

    useEffect(() => {
        cargarSesiones();
    }, [cargarSesiones]);

    const formatearFecha = (fecha: string) => {
        return new Date(fecha).toLocaleString(country.locale || 'es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getEstadoColor = (estado: string) => {
        switch (estado) {
            case 'ABIERTA':
                return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
            case 'CERRADA':
                return 'bg-muted text-foreground border-border';
            case 'CONGELADA':
                return 'bg-primary/10 text-primary border-blue-200';
            default:
                return 'bg-muted text-foreground';
        }
    };

    const formatMonto = (valor: number | null | undefined) => {
        const num = Number(valor ?? 0);
        return Number.isFinite(num)
            ? new Intl.NumberFormat(country.locale || 'es-PE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(num)
            : '0,00';
    };

    if (loading) {
        return <div className="p-4 text-center text-muted-foreground">Cargando sesiones...</div>;
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-500 bg-destructive/10 rounded-lg">
                Error: {error}
                <button
                    onClick={cargarSesiones}
                    className="block mx-auto mt-2 text-sm text-primary hover:underline"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    const cardStyle: React.CSSProperties = {
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border-color, #e5e7eb)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-sm, 0 2px 6px rgba(0,0,0,0.06))',
        overflow: 'hidden',
    };

    const headerStyle: React.CSSProperties = {
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-color, #e5e7eb)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-subtle, #f8fafc)',
    };

    const titleStyle: React.CSSProperties = {
        fontWeight: 600,
        color: 'var(--text-primary, #1f2937)',
        margin: 0,
    };

    const buttonGhostStyle: React.CSSProperties = {
        background: 'transparent',
        border: 'none',
        color: 'hsl(var(--primary))',
        cursor: 'pointer',
        fontSize: '0.9rem',
    };

    const listStyle: React.CSSProperties = {
        maxHeight: '420px',
        overflowY: 'auto',
    };

    const rowStyle: React.CSSProperties = {
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color, #e5e7eb)',
        cursor: 'pointer',
        background: 'var(--bg-card, #fff)',
    };

    const pillStyle = (estado: string): React.CSSProperties => ({
        padding: '4px 8px',
        fontSize: '0.75rem',
        fontWeight: 600,
        borderRadius: '999px',
        border: '1px solid var(--border-color, #d1d5db)',
        background:
            estado === 'ABIERTA'
                ? 'rgba(16,185,129,0.12)'
                : estado === 'CERRADA'
                ? 'rgba(107,114,128,0.12)'
                : 'rgba(59,130,246,0.12)',
        color:
            estado === 'ABIERTA'
                ? '#047857'
                : estado === 'CERRADA'
                ? '#374151'
                : '#1d4ed8',
    });

    const labelMuted: React.CSSProperties = { color: 'var(--text-secondary, #6b7280)', fontSize: '0.9rem' };
    const smallMuted: React.CSSProperties = { color: 'var(--text-tertiary, #9ca3af)', fontSize: '0.8rem' };

    if (sesiones.length === 0) {
        return (
            <div
                className={cn(className, "p-[18px] text-center")}
            >
                <p className="text-[var(--text-secondary,_#6b7280)] mb-2">No hay sesiones recientes</p>
                <button
                    type="button"
                    onClick={onOpen}
                    disabled={!onOpen}
                    className="py-2.5 px-3.5 bg-[var(--gradient-primary,_linear-gradient(90deg,#2563eb,#1d4ed8))] text-[#fff] border-0 rounded-[0.625rem] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Abrir Nueva Caja
                </button>
            </div>
        );
    }

    return (
        <div className={cn(className, "bg-[var(--bg-card,_#fff)] border rounded-xl shadow overflow-hidden")}>
            <div className="py-3.5 px-4 border-b flex justify-between items-center bg-[var(--bg-subtle,_#f8fafc)]">
                <h3 className="font-semibold text-[var(--text-primary,_#1f2937)] m-0">Sesiones de Caja</h3>
                <button onClick={cargarSesiones} className="bg-transparent border-0 text-[hsl(var(--primary))] cursor-pointer text-sm">
                    Actualizar
                </button>
            </div>

            <div className="max-h-[420px] overflow-y-auto">
                {sesiones.map((sesion) => (
                    <div
                        key={sesion.id}
                        onClick={() => onSelect(sesion)} className="py-3.5 px-4 flex justify-between items-center border-b cursor-pointer bg-[var(--bg-card,_#fff)]"
                        onMouseEnter={(e) => ((e.currentTarget.style.background = 'var(--bg-subtle, #f8fafc)'))}
                        onMouseLeave={(e) => ((e.currentTarget.style.background = 'var(--bg-card, #fff)'))}
                    >
                        <div className="flex flex-col gap-[4px]">
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    'rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                                    sesion.estado === 'ABIERTA'
                                        ? 'bg-emerald-500/15 text-emerald-500'
                                        : 'bg-slate-500/15 text-muted-foreground',
                                )}>{sesion.estado}</span>
                                <span className="font-semibold text-[var(--text-primary,_#111827)]">
                                    {sesion.caja?.nombre || 'Caja Principal'}
                                </span>
                            </div>
                            <div className="text-[var(--text-secondary,_#6b7280)] text-sm">
                                {formatearFecha(sesion.hora_apertura)}
                                {sesion.hora_cierre && ` - ${formatearFecha(sesion.hora_cierre)}`}
                            </div>
                            <div className="text-[var(--text-tertiary,_#9ca3af)] text-[0.8rem]">
                                Por: {[
                                    sesion.usuario?.nombres || sesion.usuario?.nombre,
                                    sesion.usuario?.apellidos || sesion.usuario?.apellido,
                                ].filter(Boolean).join(' ') || sesion.usuario?.email || '—'}
                            </div>
                        </div>

                        <div className="text-right min-w-[120px]">
                            <div className="text-[0.95rem] font-semibold text-[var(--text-primary,_#111827)]">
                                Ini: {currencySymbol} {formatMonto(sesion.monto_inicio)}
                            </div>
                            {sesion.monto_cierre !== undefined && (
                                <div className="text-sm">
                                    Fin: {currencySymbol} {formatMonto(sesion.monto_cierre)}
                                </div>
                            )}
                            {sesion.diferencia !== undefined && sesion.diferencia !== 0 && (
                                <div className="text-sm font-semibold"
                                >
                                    Dif: {sesion.diferencia > 0 ? '+' : ''}{formatMonto(sesion.diferencia)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
