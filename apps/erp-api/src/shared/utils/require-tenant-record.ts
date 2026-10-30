import { BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

/** Establish the tenant-owned parent before interpreting an empty child collection. */
export async function requireTenantRecord(client: any, table: string, tenantId: string, id: string, subject: string): Promise<void> {
  if (!tenantId || !id) throw new BadRequestException('Se requiere la empresa y el identificador');
  try {
    const result = await client.from(table).select('id,tenant_id').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
    if (!result || result.error || result.data === undefined) {
      if (result?.error?.code === '22P02') throw new BadRequestException('El identificador no es válido');
      throw new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
    }
    if (result.data === null) throw new NotFoundException(`${subject} no encontrado`);
    if (result.data.id !== id || result.data.tenant_id !== tenantId) {
      throw new ServiceUnavailableException(`No se pudo verificar ${subject} en la empresa actual; reintente`);
    }
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException(`No se pudo consultar ${subject}; reintente`);
  }
}
