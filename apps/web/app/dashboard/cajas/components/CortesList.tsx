import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils'
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/contexts/AuthContext';
import { fetchApi } from '@/lib/api-fetch';
import { useCountryContext } from '@/hooks/use-country-context';
import { useTaxConfig } from '@/hooks/useTaxConfig';

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
  const { get } = useApi();
  const { session } = useAuth();
  const country = useCountryContext();
  const { nombreImpuesto } = useTaxConfig();
  const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
  const [cortes, setCortes] = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarCortes = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await get('/cajas/cortes');
      if ((resp as any)?.success) {
        setCortes((resp as any).data || []);
      } else {
        throw new Error((resp as any)?.message || 'No se pudieron cargar los cortes');
      }
    } catch (err: any) {
      console.warn('Error cargando cortes:', err);
      setError(err.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    cargarCortes();
  }, [cargarCortes]);

  const descargarArchivo = async (corteId: string, formato: 'pdf' | 'csv') => {
    try {
      if (!session?.user) throw new Error('No hay sesión activa para descargar.');
      const res = await fetchApi(`/api/cajas/cortes/${corteId}/${formato}`);
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
    color: 'hsl(var(--primary))',
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
      <div className="p-3 text-center text-[var(--text-secondary,_#6b7280)]">
        Cargando cortes recientes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-center text-destructive bg-[#fef2f2] rounded-[0.625rem]">
        {error}
        <button
          onClick={cargarCortes} className="block"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (cortes.length === 0) {
    return (
      <div className="p-3 text-center text-[var(--text-secondary,_#6b7280)] bg-[var(--bg-card,_#fff)] rounded-[0.625rem] shadow">
        No hay cortes registrados aún.
      </div>
    );
  }

  return (
    <div id={id} className={cn(className, "bg-[var(--bg-card,_#fff)] border rounded-xl shadow mt-4 max-w-[1100px] ml-auto mr-auto overflow-hidden")}>
      <div className="py-4 px-5 border-b flex justify-between items-center bg-[var(--bg-subtle,_#f8fafc)]">
        <h3 className="text-base font-semibold text-[var(--text-primary,_#1f2937)] m-0">Cortes (cierre diario/turno)</h3>
        <button onClick={cargarCortes} className="bg-transparent border-0 text-[hsl(var(--primary))] text-sm cursor-pointer">
          Actualizar
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-[100%]">
          <thead>
            <tr>
              <th className="text-left text-xs text-[var(--text-secondary,_#6b7280)] py-2.5 px-4 border-b bg-[var(--bg-subtle,_#f8fafc)]">Fecha</th>
              <th className="text-left text-xs text-[var(--text-secondary,_#6b7280)] py-2.5 px-4 border-b bg-[var(--bg-subtle,_#f8fafc)]">Caja</th>
              <th className="text-left text-xs text-[var(--text-secondary,_#6b7280)] py-2.5 px-4 border-b bg-[var(--bg-subtle,_#f8fafc)]">Ventas</th>
              <th className="text-left text-xs text-[var(--text-secondary,_#6b7280)] py-2.5 px-4 border-b bg-[var(--bg-subtle,_#f8fafc)]">{nombreImpuesto}</th>
              <th className="text-left text-xs text-[var(--text-secondary,_#6b7280)] py-2.5 px-4 border-b bg-[var(--bg-subtle,_#f8fafc)]">Docs</th>
              <th className="text-left text-xs text-[var(--text-secondary,_#6b7280)] py-2.5 px-4 border-b bg-[var(--bg-subtle,_#f8fafc)]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cortes.map((corte) => (
              <tr key={corte.id} className="bg-[var(--bg-card,_#fff)]">
                <td>{formatearFecha(corte.fecha_corte)}</td>
                <td>{corte.caja_id ?? 'Caja'}</td>
                <td className="py-3 px-4 text-sm text-[var(--text-primary,_#111827)] border-b">{currencySymbol} {(corte.total_ventas ?? corte.resumen_fiscal?.total ?? 0).toFixed(2)}</td>
                <td>{currencySymbol} {(corte.total_impuestos ?? corte.resumen_fiscal?.igv ?? 0).toFixed(2)}</td>
                <td>{corte.total_documentos ?? corte.resumen_fiscal?.cantidad_boletas ?? 0}</td>
                <td className="flex gap-2">
                  <button
                    onClick={() => descargarArchivo(corte.id, 'pdf')} className="text-[hsl(var(--primary))]"
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => descargarArchivo(corte.id, 'csv')} className="py-[6px] px-3 rounded-lg border bg-[var(--bg-card,_#fff)] cursor-pointer text-[0.8rem]"
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
