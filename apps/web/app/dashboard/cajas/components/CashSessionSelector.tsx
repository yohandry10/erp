import React, { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';

interface SesionCaja {
    id: string;
    estado: string;
    hora_apertura: string;
    hora_cierre?: string;
    monto_inicio: number;
    monto_cierre?: number;
    diferencia?: number;
    usuario?: {
        nombres: string;
        apellidos: string;
    };
    caja?: {
        nombre: string;
        codigo: string;
    };
}

interface CashSessionSelectorProps {
    onSelect: (sesion: SesionCaja) => void;
    className?: string;
}

export function CashSessionSelector({ onSelect, className = '' }: CashSessionSelectorProps) {
    const api = useApi();
    const [sesiones, setSesiones] = useState<SesionCaja[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        cargarSesiones();
    }, []);

    const cargarSesiones = async () => {
        try {
            setLoading(true);
            // Fetch open sessions first, then closed ones
            const response = await api.get('/cajas/sesiones');
            if (response?.success) {
                setSesiones(response.data || []);
            } else {
                throw new Error(response?.message || 'Error cargando sesiones');
            }
        } catch (err: any) {
            console.error('Error cargando sesiones:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatearFecha = (fecha: string) => {
        return new Date(fecha).toLocaleString('es-PE', {
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
                return 'bg-green-100 text-green-800 border-green-200';
            case 'CERRADA':
                return 'bg-gray-100 text-gray-800 border-gray-200';
            case 'CONGELADA':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatMonto = (valor: number | null | undefined) => {
        const num = Number(valor ?? 0);
        return Number.isFinite(num) ? num.toFixed(2) : '0.00';
    };

    if (loading) {
        return <div className="p-4 text-center text-gray-500">Cargando sesiones...</div>;
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-500 bg-red-50 rounded-lg">
                Error: {error}
                <button
                    onClick={cargarSesiones}
                    className="block mx-auto mt-2 text-sm text-blue-600 hover:underline"
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
        color: 'var(--primary, #2563eb)',
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
                className={className}
                style={{
                    ...cardStyle,
                    padding: '18px',
                    textAlign: 'center',
                    borderStyle: 'dashed',
                }}
            >
                <p style={{ color: 'var(--text-secondary, #6b7280)', marginBottom: '8px' }}>No hay sesiones recientes</p>
                <button
                    onClick={() => {/* placeholder for abrir caja */}}
                    style={{
                        padding: '10px 14px',
                        background: 'var(--gradient-primary, linear-gradient(90deg,#2563eb,#1d4ed8))',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                    }}
                >
                    Abrir Nueva Caja
                </button>
            </div>
        );
    }

    return (
        <div className={className} style={cardStyle}>
            <div style={headerStyle}>
                <h3 style={titleStyle}>Sesiones de Caja</h3>
                <button onClick={cargarSesiones} style={buttonGhostStyle}>
                    Actualizar
                </button>
            </div>

            <div style={listStyle}>
                {sesiones.map((sesion) => (
                    <div
                        key={sesion.id}
                        onClick={() => onSelect(sesion)}
                        style={rowStyle}
                        onMouseEnter={(e) => ((e.currentTarget.style.background = 'var(--bg-subtle, #f8fafc)'))}
                        onMouseLeave={(e) => ((e.currentTarget.style.background = 'var(--bg-card, #fff)'))}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={pillStyle(sesion.estado)}>{sesion.estado}</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                                    {sesion.caja?.nombre || 'Caja Principal'}
                                </span>
                            </div>
                            <div style={labelMuted}>
                                {formatearFecha(sesion.hora_apertura)}
                                {sesion.hora_cierre && ` - ${formatearFecha(sesion.hora_cierre)}`}
                            </div>
                            <div style={smallMuted}>
                                Por: {sesion.usuario?.nombres} {sesion.usuario?.apellidos}
                            </div>
                        </div>

                        <div style={{ textAlign: 'right', minWidth: '120px' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                                Ini: S/ {formatMonto(sesion.monto_inicio)}
                            </div>
                            {sesion.monto_cierre !== undefined && (
                                <div style={{ ...labelMuted, fontSize: '0.9rem' }}>
                                    Fin: S/ {formatMonto(sesion.monto_cierre)}
                                </div>
                            )}
                            {sesion.diferencia !== undefined && sesion.diferencia !== 0 && (
                                <div
                                    style={{
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        color: sesion.diferencia > 0 ? '#16a34a' : '#dc2626',
                                    }}
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
