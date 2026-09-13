import { randomUUID } from 'node:crypto';
import { redactSensitiveData } from './redact-sensitive';

interface IntegrationLogClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data?: unknown;
    error?: { code?: string } | null;
  }>;
}

/** Evidencia complementaria; las transacciones de negocio conservan su auditoría. */
export async function appendIntegrationLog(
  client: IntegrationLogClient,
  entry: Record<string, unknown> & { tenant_id: string },
): Promise<void> {
  const { tenant_id, id = randomUUID(), ...event } = entry;
  const payload = {
    p_tenant_id: tenant_id,
    p_event_id: id,
    p_kind: 'integration',
    p_event: redactSensitiveData({ ...event, metadata: event.metadata ?? {} }),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await client.rpc('registrar_auditoria_backend_tx', payload);
      const receipt = result?.data as { id?: unknown; idempotent?: unknown } | null;
      if (!result?.error && receipt?.id === id && typeof receipt.idempotent === 'boolean') return;
      if (result?.error && !/^(08|40001|40P01|PGRST000)/.test(result.error.code ?? '')) break;
    } catch {
      // Una respuesta perdida puede ocurrir después del commit: conservar id/payload.
    }
  }
  // No propagar mensajes del proveedor que pudieran contener datos o credenciales.
  throw new Error('INTEGRATION_LOG_WRITE_UNCONFIRMED');
}
