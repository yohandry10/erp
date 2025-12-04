import React, { useEffect, useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/contexts/AuthContext';

type Corte = {
  id: string;
  fecha_corte: string;
  caja_id?: string;
  total_ventas?: number;
  total_impuestos?: number;
  total_neto?: number;
  total_documentos?: number;
  resumen_fiscal?: {
    base_imponible?: number;
    igv?: number;
    total?: number;
    cantidad_boletas?: number;
    cantidad_facturas?: number;
    cantidad_notas_credito?: number;
  };
  resumen_metodos_pago?: {
    efectivo?: number;
    tarjeta?: number;
    transferencia?: number;
    otros?: number;
  };
};

interface Props {
  className?: string;
  id?: string;
}

export function CortesList({ className = '', id }: Props) {
  const api = useApi();
  const { session } = useAuth();
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargarCortes();
  }, []);

  const cargarCortes = async () => {
    try {
      setLoading(true);
      const resp = await api.get('/cajas/cortes');
      if ((resp as any)?.success) {
        setCortes((resp as any).data || []);
      } else {
        throw new Error((resp as any)?.message || 'No se pudieron cargar los cortes');
      }
    } catch (err: any) {
      console.error('Error cargando cortes:', err);
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const descargarArchivo = async (corteId: string, formato: 'pdf' | 'csv') => {
    try {
      const token = session?.access_token;
      if (!token) throw new Error('No hay sesión activa para descargar.');
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const url = `${baseUrl}/api/cajas/cortes/${corteId}/${formato}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`Error al descargar ${formato.toUpperCase()}`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `corte-${corteId}.${formato}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert(err.message || 'No se pudo descargar el archivo');
    }
  };

  const formatearFecha = (fechaIso?: string) =>
    fechaIso
      ? new Date(fechaIso).toLocaleString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card, #fff)',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '12px',
    boxShadow: 'var(--shadow-sm, 0 2px 6px rgba(0,0,0,0.06))',
    marginTop: '1rem',
    backgroundImage: 'none',
    maxWidth: '1100px',
    marginLeft: 'auto',
    marginRight: 'auto',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'var(--bg-subtle, #f8fafc)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary, #1f2937)',
    margin: 0,
  };

  const buttonGhostStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--primary, #2563eb)',
    fontSize: '0.9rem',
    cursor: 'pointer',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary, #6b7280)',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
    background: 'var(--bg-subtle, #f8fafc)',
  };

  const tdStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '0.9rem',
    color: 'var(--text-primary, #111827)',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
  };

  const actionButtonStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color, #d1d5db)',
    background: 'var(--bg-card, #fff)',
    cursor: 'pointer',
    fontSize: '0.8rem',
  };

  const mutedStyle: React.CSSProperties = {
    color: 'var(--text-secondary, #6b7280)',
  };

  if (loading) {
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Cargando cortes recientes...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: '#b91c1c', background: '#fef2f2', borderRadius: '10px' }}>
        {error}
        <button
          onClick={cargarCortes}
          style={{ ...buttonGhostStyle, display: 'block', margin: '8px auto 0' }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (cortes.length === 0) {
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary, #6b7280)', background: 'var(--bg-card, #fff)', borderRadius: '10px', boxShadow: 'var(--shadow-sm, 0 2px 6px rgba(0,0,0,0.06))' }}>
        No hay cortes registrados aún.
      </div>
    );
  }

  return (
    <div id={id} className={className} style={cardStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>Cortes (cierre diario/turno)</h3>
        <button onClick={cargarCortes} style={buttonGhostStyle}>
          Actualizar
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Caja</th>
              <th style={thStyle}>Ventas</th>
              <th style={thStyle}>IGV</th>
              <th style={thStyle}>Docs</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cortes.map((corte) => (
              <tr key={corte.id} style={{ background: 'var(--bg-card, #fff)' }}>
                <td style={{ ...tdStyle, ...mutedStyle }}>{formatearFecha(corte.fecha_corte)}</td>
                <td style={{ ...tdStyle, ...mutedStyle }}>{corte.caja_id ?? 'Caja'}</td>
                <td style={tdStyle}>S/ {(corte.total_ventas ?? corte.resumen_fiscal?.total ?? 0).toFixed(2)}</td>
                <td style={{ ...tdStyle, ...mutedStyle }}>S/ {(corte.total_impuestos ?? corte.resumen_fiscal?.igv ?? 0).toFixed(2)}</td>
                <td style={{ ...tdStyle, ...mutedStyle }}>{corte.total_documentos ?? corte.resumen_fiscal?.cantidad_boletas ?? 0}</td>
                <td style={{ ...tdStyle, display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => descargarArchivo(corte.id, 'pdf')}
                    style={{ ...actionButtonStyle, color: 'var(--primary, #2563eb)' }}
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => descargarArchivo(corte.id, 'csv')}
                    style={actionButtonStyle}
                  >
                    CSV
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
