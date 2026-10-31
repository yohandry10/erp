'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext'
import { fetchApi } from '@/lib/api-fetch';
import { isOfflineCachedResponse } from '@/lib/offline-store';

interface DemoStatus {
  is_demo: boolean;
  is_expired?: boolean;
  expires_at?: string;
  created_at?: string;
  dias_restantes?: number;
  can_extend?: boolean;
  conversion_attempted?: boolean;
}

export function useDemoStatus() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth()
  const generation = useRef(0)

  const fetchStatus = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      if (!session?.user) {
        setError('Sesión no disponible');
        return;
      }

      const response = await fetchApi('/api/demo/status');

      if (generation.current !== current) return;
      if (response.ok && !isOfflineCachedResponse(response)) {
        const data = await response.json();
        if (!data || typeof data.is_demo !== 'boolean' || (data.is_demo === true &&
            (typeof data.is_expired !== 'boolean' || typeof data.dias_restantes !== 'number' ||
             !Number.isFinite(data.dias_restantes) || data.dias_restantes < 0 ||
             typeof data.expires_at !== 'string' || !Number.isFinite(Date.parse(data.expires_at))))) {
          throw new Error('Estado de empresa incompleto');
        }
        if (generation.current !== current) return;
        setStatus(data);
        setError(null);
      } else if (response.status === 401) {
        // Token inválido o expirado
        setError('Sesión expirada');
      } else {
        setError('Error al obtener estado de demo');
      }
    } catch (err) {
      if (generation.current === current) setError('No se pudo verificar el estado de la empresa');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    fetchStatus();
    return () => { generation.current += 1 };
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    // Fail closed: sólo una respuesta válida puede acreditar que la cuenta es
    // real. Mientras el estado falta, se recarga o falla, los consumidores no
    // deben habilitar credenciales ni acciones fiscales externas.
    isDemoTenant: status?.is_demo ?? true,
    isExpired: status?.is_expired || false,
    diasRestantes: status?.dias_restantes || 0,
    canExtend: status?.can_extend || false,
    refetch: fetchStatus,
  };
}
