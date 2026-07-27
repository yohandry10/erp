import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import {
  CreateProveedorDto,
  CreateCotizacionCompraDto,
  CreateOrdenCompraDto,
  CreateRecepcionDto,
  CreateDevolucionProveedorDto,
  AprobarOrdenCompraDto,
  RechazarOrdenCompraDto,
  CancelarOrdenCompraDto,
  RechazarCotizacionDto,
} from '../index';

describe('Compras DTOs Validation', () => {
  describe('CreateProveedorDto', () => {
    it('should validate a valid proveedor', async () => {
      const dto = plainToClass(CreateProveedorDto, {
        ruc: '20123456789',
        razon_social: 'DISTRIBUIDORA ABC S.A.C.',
        email: 'contacto@abc.com',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid RUC', async () => {
      const dto = plainToClass(CreateProveedorDto, {
        ruc: '123', // Too short
        razon_social: 'DISTRIBUIDORA ABC S.A.C.',
        email: 'contacto@abc.com',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('ruc');
    });

    it('should fail with invalid email', async () => {
      const dto = plainToClass(CreateProveedorDto, {
        ruc: '20123456789',
        razon_social: 'DISTRIBUIDORA ABC S.A.C.',
        email: 'invalid-email',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should fail with negative limite_credito', async () => {
      const dto = plainToClass(CreateProveedorDto, {
        ruc: '20123456789',
        razon_social: 'DISTRIBUIDORA ABC S.A.C.',
        email: 'contacto@abc.com',
        limite_credito: -1000,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateCotizacionCompraDto', () => {
    it('should validate a valid cotizacion', async () => {
      const dto = plainToClass(CreateCotizacionCompraDto, {
        numero: 'COT-2024-001',
        proveedor_id: '550e8400-e29b-41d4-a716-446655440001',
        detalles: [
          {
            producto_id: '550e8400-e29b-41d4-a716-446655440002',
            descripcion: 'Laptop HP',
            cantidad: 10,
            precio_unitario: 2500,
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without detalles', async () => {
      const dto = plainToClass(CreateCotizacionCompraDto, {
        numero: 'COT-2024-001',
        proveedor_id: '550e8400-e29b-41d4-a716-446655440001',
        detalles: [],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateOrdenCompraDto', () => {
    it('should validate a valid orden', async () => {
      const dto = plainToClass(CreateOrdenCompraDto, {
        numero: 'OC-2024-001',
        proveedor_id: '550e8400-e29b-41d4-a716-446655440001',
        detalles: [
          {
            producto_id: '550e8400-e29b-41d4-a716-446655440002',
            descripcion: 'Laptop HP',
            cantidad: 10,
            precio_unitario: 2500,
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('CreateRecepcionDto', () => {
    it('should validate a valid recepcion', async () => {
      const dto = plainToClass(CreateRecepcionDto, {
        orden_id: '550e8400-e29b-41d4-a716-446655440001',
        items: [
          {
            detalle_id: '550e8400-e29b-41d4-a716-446655440002',
            cantidad_recibida: 10,
            calidad: 'OK',
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('CreateDevolucionProveedorDto', () => {
    it('should validate a valid devolucion', async () => {
      const dto = plainToClass(CreateDevolucionProveedorDto, {
        recepcion_id: '550e8400-e29b-41d4-a716-446655440004',
        orden_id: '550e8400-e29b-41d4-a716-446655440001',
        proveedor_id: '550e8400-e29b-41d4-a716-446655440002',
        motivo: 'Producto defectuoso',
        items: [
          {
            producto_id: '550e8400-e29b-41d4-a716-446655440003',
            descripcion: 'Laptop HP',
            cantidad: 2,
            precio_unitario: 2500,
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('AprobarOrdenCompraDto', () => {
    it('should validate with optional fields', async () => {
      const dto = plainToClass(AprobarOrdenCompraDto, {
        comentarios: 'Aprobado según presupuesto',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate without fields', async () => {
      const dto = plainToClass(AprobarOrdenCompraDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('RechazarOrdenCompraDto', () => {
    it('should validate with required motivo', async () => {
      const dto = plainToClass(RechazarOrdenCompraDto, {
        motivo_rechazo: 'Presupuesto insuficiente',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without motivo', async () => {
      const dto = plainToClass(RechazarOrdenCompraDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('motivo_rechazo');
    });
  });

  describe('CancelarOrdenCompraDto', () => {
    it('should validate with required motivo', async () => {
      const dto = plainToClass(CancelarOrdenCompraDto, {
        motivo_cancelacion: 'Cambio en requerimientos',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without motivo', async () => {
      const dto = plainToClass(CancelarOrdenCompraDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('motivo_cancelacion');
    });
  });

  describe('RechazarCotizacionDto', () => {
    it('should validate with required motivo', async () => {
      const dto = plainToClass(RechazarCotizacionDto, {
        motivo: 'Precios no competitivos',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without motivo', async () => {
      const dto = plainToClass(RechazarCotizacionDto, {});

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('motivo');
    });
  });
});
