import { BadRequestException } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';

describe('SucursalesService', () => {
  const buildSupabase = (handlers: Record<string, any>, rpc?: jest.Mock) => ({
    getClient: jest.fn(() => ({
      from: jest.fn((table: string) => handlers[table]),
      rpc: rpc ?? jest.fn(async () => ({ data: [], error: null })),
    })),
  });

  describe('codigoEstablecimientoDeSerie', () => {
    it('devuelve el establecimiento de la sucursal dueña de la serie', async () => {
      const seriesChain: any = {
        select: jest.fn(() => seriesChain),
        eq: jest.fn(() => seriesChain),
        limit: jest.fn(() => seriesChain),
        maybeSingle: jest.fn(async () => ({
          data: { sucursal_id: 'suc-2', sucursales: { codigo_establecimiento: '0003' } },
          error: null,
        })),
      };

      const service = new SucursalesService(
        buildSupabase({ documento_series: seriesChain }) as any,
      );

      await expect(service.codigoEstablecimientoDeSerie('tenant-1', 'F002')).resolves.toBe('0003');
      // La serie se normaliza antes de consultar: SUNAT las escribe en mayúsculas.
      expect(seriesChain.eq).toHaveBeenCalledWith('serie', 'F002');
    });

    it('cae a la casa matriz cuando la serie no tiene sucursal enganchada', async () => {
      const seriesChain: any = {
        select: jest.fn(() => seriesChain),
        eq: jest.fn(() => seriesChain),
        limit: jest.fn(() => seriesChain),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      };
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        maybeSingle: jest.fn(async () => ({
          data: { codigo_establecimiento: '0000' },
          error: null,
        })),
      };

      const service = new SucursalesService(
        buildSupabase({
          documento_series: seriesChain,
          sucursales: sucursalesChain,
        }) as any,
      );

      await expect(service.codigoEstablecimientoDeSerie('tenant-1', 'F900')).resolves.toBe('0000');
    });

    it('no consulta series cuando no le dan ninguna', async () => {
      const seriesChain: any = {
        select: jest.fn(() => seriesChain),
        eq: jest.fn(() => seriesChain),
        limit: jest.fn(() => seriesChain),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
      };
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        maybeSingle: jest.fn(async () => ({
          data: { codigo_establecimiento: '0000' },
          error: null,
        })),
      };

      const service = new SucursalesService(
        buildSupabase({
          documento_series: seriesChain,
          sucursales: sucursalesChain,
        }) as any,
      );

      await expect(service.codigoEstablecimientoDeSerie('tenant-1', '   ')).resolves.toBe('0000');
      expect(seriesChain.maybeSingle).not.toHaveBeenCalled();
    });
  });

  describe('asignarUsuario', () => {
    it('rechaza sucursales de otro contribuyente antes de tocar la asignación', async () => {
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        // Sólo una de las dos pedidas pertenece al contribuyente.
        in: jest.fn(async () => ({ data: [{ id: 'suc-1' }], error: null })),
      };
      const asignacionChain: any = {
        delete: jest.fn(() => asignacionChain),
        eq: jest.fn(() => asignacionChain),
        insert: jest.fn(async () => ({ error: null })),
      };

      const service = new SucursalesService(
        buildSupabase({
          sucursales: sucursalesChain,
          usuario_sucursales: asignacionChain,
        }) as any,
      );

      await expect(
        service.asignarUsuario('tenant-1', 'user-1', { sucursal_ids: ['suc-1', 'suc-ajena'] }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(asignacionChain.delete).not.toHaveBeenCalled();
      expect(asignacionChain.insert).not.toHaveBeenCalled();
    });

    it('una lista vacía retira la restricción y no inserta filas', async () => {
      const asignacionChain: any = {
        delete: jest.fn(() => asignacionChain),
        eq: jest.fn(() => asignacionChain),
        insert: jest.fn(async () => ({ error: null })),
      };
      // `delete().eq().eq()` ha de resolver: la cadena se espera al final.
      asignacionChain.then = (resolve: any) => resolve({ error: null });

      const service = new SucursalesService(
        buildSupabase({ usuario_sucursales: asignacionChain }) as any,
      );

      await expect(
        service.asignarUsuario('tenant-1', 'user-1', { sucursal_ids: [] }),
      ).resolves.toEqual([]);

      expect(asignacionChain.delete).toHaveBeenCalled();
      expect(asignacionChain.insert).not.toHaveBeenCalled();
    });
  });

  describe('actualizar', () => {
    it('no deja desactivar la casa matriz', async () => {
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        maybeSingle: jest.fn(async () => ({
          data: {
            id: 'suc-0',
            tenant_id: 'tenant-1',
            es_principal: true,
            codigo_establecimiento: '0000',
          },
          error: null,
        })),
        update: jest.fn(() => sucursalesChain),
        single: jest.fn(async () => ({ data: null, error: null })),
      };

      const service = new SucursalesService(
        buildSupabase({ sucursales: sucursalesChain }) as any,
      );

      await expect(
        service.actualizar('tenant-1', 'suc-0', { activo: false }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(sucursalesChain.update).not.toHaveBeenCalled();
    });

    it('ignora el codigo de establecimiento aunque venga en el cuerpo', async () => {
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        maybeSingle: jest.fn(async () => ({
          data: {
            id: 'suc-1',
            tenant_id: 'tenant-1',
            es_principal: false,
            codigo_establecimiento: '0001',
          },
          error: null,
        })),
        update: jest.fn(() => sucursalesChain),
        single: jest.fn(async () => ({
          data: { id: 'suc-1', codigo_establecimiento: '0001', nombre: 'Arequipa' },
          error: null,
        })),
      };

      const service = new SucursalesService(
        buildSupabase({ sucursales: sucursalesChain }) as any,
      );

      await service.actualizar('tenant-1', 'suc-1', {
        nombre: 'Arequipa',
        codigo_establecimiento: '0009',
      } as any);

      expect(sucursalesChain.update).toHaveBeenCalledWith({ nombre: 'Arequipa' });
    });
  });

  describe('listar', () => {
    it('restringe el listado a las sucursales que el usuario alcanza', async () => {
      const rpc = jest.fn(async () => ({
        data: [{ sucursal_id: 'suc-1' }],
        error: null,
      }));
      const sucursalesChain: any = {
        select: jest.fn(() => sucursalesChain),
        eq: jest.fn(() => sucursalesChain),
        in: jest.fn(() => sucursalesChain),
        order: jest.fn(() => sucursalesChain),
      };
      sucursalesChain.then = (resolve: any) =>
        resolve({ data: [{ id: 'suc-1' }], error: null });

      const service = new SucursalesService(
        buildSupabase({ sucursales: sucursalesChain }, rpc) as any,
      );

      await service.listar('tenant-1', 'user-1');

      expect(rpc).toHaveBeenCalledWith('sucursales_visibles', {
        p_tenant_id: 'tenant-1',
        p_usuario_sistema_id: 'user-1',
      });
      expect(sucursalesChain.in).toHaveBeenCalledWith('id', ['suc-1']);
    });
  });
});
