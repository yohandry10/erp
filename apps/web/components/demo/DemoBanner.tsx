'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DemoStatus {
  is_demo: boolean;
  is_expired: boolean;
  dias_restantes: number;
  can_extend: boolean;
}

export function DemoBanner() {
  const router = useRouter();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemoStatus();
  }, []);

  const fetchDemoStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiUrl}/api/demo/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error fetching demo status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const response = await fetch(`${apiUrl}/api/demo/extend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dias_extension: 7 }),
      });

      if (response.ok) {
        await fetchDemoStatus();
      }
    } catch (error) {
      console.error('Error extending demo:', error);
    }
  };

  const handleConvert = () => {
    router.push('/demo/convert');
  };

  if (loading || !status || !status.is_demo || dismissed) {
    return null;
  }

  const getBannerColor = () => {
    if (status.is_expired) return 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
    if (status.dias_restantes <= 3) return 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)';
    return 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)';
  };

  const getMessage = () => {
    if (status.is_expired) {
      return '⚠️ Tu demo ha expirado';
    }
    if (status.dias_restantes === 1) {
      return '⏰ Tu demo expira mañana';
    }
    return `⏰ Modo Demo - Expira en ${status.dias_restantes} días`;
  };

  return (
    <div style={{
      background: getBannerColor(),
      color: 'white',
      padding: '0.75rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      flexWrap: 'wrap',
      gap: '0.75rem',
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontWeight: 500 }}>{getMessage()}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {status.can_extend && !status.is_expired && (
          <button
            onClick={handleExtend}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            Extender 7 días
          </button>
        )}

        <button
          onClick={handleConvert}
          style={{
            background: 'white',
            color: '#2563eb',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600
          }}
        >
          Convertir a cuenta real
        </button>

        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            color: 'white',
            border: 'none',
            padding: '0.5rem',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
