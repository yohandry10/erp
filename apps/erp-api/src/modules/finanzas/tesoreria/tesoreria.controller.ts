import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../permissions';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { TesoreriaService } from './tesoreria.service';
import { RegistrarPagoDto, RegistrarPagoLoteDto, ListarPagosQueryDto, ProgramacionPagosQueryDto, FlujoCajaQueryDto } from './dto';

@ApiTags('Finanzas - Tesorería')
@ApiBearerAuth()
@Controller('api/finanzas/tesoreria')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TesoreriaController {
  constructor(private readonly tesoreriaService: TesoreriaService) {}

  @Post('pagos')
  @RequirePermissions('finanzas', 'tesoreria', 'gestionar')
  @ApiOperation({
    summary: 'Registrar pago a proveedor',
    description: `Registra un pago aplicado a una cuenta por pagar. El proceso incluye:
    
1. Validar que la CxP existe y no está anulada o completamente pagada
2. Validar que el monto no exceda el saldo pendiente
3. Si se especifica cuenta bancaria:
   - Validar que existe y tiene saldo suficiente
   - Validar que la moneda coincida con la CxP
   - Crear movimiento bancario (tipo CARGO)
   - Actualizar saldo de la cuenta bancaria
4. Actualizar saldo y estado de la CxP
5. Emitir evento PagoProveedorRegistrado
6. Insertar en outbox_events para procesamiento asíncrono

Estados de CxP después del pago:
- PAGADA: si el saldo llega a 0
- PARCIAL: si el saldo es menor al total pero mayor a 0
- PENDIENTE: si no cambia el estado`,
  })
  @ApiResponse({
    status: 201,
    description: 'Pago registrado exitosamente',
    schema: {
      example: {
        success: true,
        data: {
          cxp: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            proveedor_id: '123e4567-e89b-12d3-a456-426614174001',
            numero_documento: 'F001-00123',
            total: 2000.00,
            saldo: 500.00,
            estado: 'PARCIAL',
            ultimo_pago: '2025-10-25',
          },
          pago: {
            monto: 1500.00,
            fecha_pago: '2025-10-25',
            metodo_pago: 'TRANSFERENCIA',
            referencia: 'OP-2025-001234',
            cuenta_bancaria_id: '123e4567-e89b-12d3-a456-426614174002',
            saldo_anterior: 2000.00,
            saldo_nuevo: 500.00,
            estado_anterior: 'PENDIENTE',
            estado_nuevo: 'PARCIAL',
          },
          movimiento_bancario: {
            id: '123e4567-e89b-12d3-a456-426614174003',
            tipo: 'CARGO',
            monto: 1500.00,
            fecha: '2025-10-25',
            descripcion: 'Pago a proveedor ABC SAC - Doc: F001-00123',
          },
        },
        message: 'Pago registrado exitosamente',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos, monto excede saldo, saldo insuficiente en cuenta bancaria, o cuenta no permite pagos',
  })
  @ApiResponse({
    status: 404,
    description: 'Cuenta por pagar o cuenta bancaria no encontrada',
  })
  async registrarPago(
    @Body() registrarPagoDto: RegistrarPagoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.tesoreriaService.registrarPago(tenantId, registrarPagoDto, user?.id);
  }

  @Get('pagos')
  @RequirePermissions('finanzas', 'tesoreria', 'ver')
  @ApiOperation({
    summary: 'Listar pagos a proveedores',
    description: `Obtiene la lista de pagos registrados a proveedores con filtros opcionales.
    
Los pagos se obtienen de la tabla movimientos_bancarios donde tipo='CARGO' y están vinculados a una CxP.

Filtros disponibles:
- fecha_desde: Fecha inicial del rango de búsqueda
- fecha_hasta: Fecha final del rango de búsqueda
- proveedor_id: Filtrar por proveedor específico
- cuenta_bancaria_id: Filtrar por cuenta bancaria
- metodo_pago: Filtrar por método de pago (EFECTIVO, TRANSFERENCIA, CHEQUE, TARJETA)
- conciliado: Filtrar por estado de conciliación (true/false)

Ordenamiento:
- Por defecto: fecha DESC (más recientes primero)`,
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de pagos obtenida exitosamente',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            fecha: '2025-10-25',
            monto: 1500.00,
            metodo_pago: 'TRANSFERENCIA',
            referencia: 'OP-2025-001234',
            descripcion: 'Pago a proveedor ABC SAC - Doc: F001-00123',
            conciliado: false,
            cuenta_bancaria: {
              id: '123e4567-e89b-12d3-a456-426614174001',
              nombre: 'Cuenta Corriente BCP',
              banco: 'BCP',
              numero_cuenta: '1234567890',
            },
            proveedor: {
              id: '123e4567-e89b-12d3-a456-426614174002',
              razon_social: 'ABC SAC',
              ruc: '20123456789',
            },
            cxp: {
              id: '123e4567-e89b-12d3-a456-426614174003',
              numero_documento: 'F001-00123',
              total: 2000.00,
              saldo: 500.00,
              estado: 'PARCIAL',
            },
            created_at: '2025-10-25T10:30:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de consulta inválidos',
  })
  async listarPagos(
    @Query() query: ListarPagosQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.tesoreriaService.listarPagos(tenantId, query);
  }

  @Get('programacion')
  @RequirePermissions('finanzas', 'tesoreria', 'ver')
  @ApiOperation({
    summary: 'Obtener programación de pagos a proveedores',
    description: `Obtiene la lista de cuentas por pagar pendientes ordenadas por fecha de vencimiento.
    
Este endpoint es útil para planificar los pagos a proveedores y gestionar el flujo de caja.

Filtros disponibles:
- fecha_desde: Fecha inicial del rango de vencimiento
- fecha_hasta: Fecha final del rango de vencimiento
- proveedor_id: Filtrar por proveedor específico
- estado: Filtrar por estado (PENDIENTE, PARCIAL, VENCIDA)

Clasificación por urgencia:
- VENCIDA: Fecha de vencimiento ya pasó (días < 0)
- HOY: Vence hoy (días = 0)
- URGENTE: Vence en 1-7 días
- PROXIMA: Vence en 8-15 días
- NORMAL: Vence en más de 15 días

Ordenamiento:
- Por defecto: fecha_vencimiento ASC (próximos vencimientos primero)`,
  })
  @ApiResponse({
    status: 200,
    description: 'Programación de pagos obtenida exitosamente',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            numero_documento: 'F001-00123',
            fecha_emision: '2025-10-01',
            fecha_vencimiento: '2025-10-26',
            total: 2000.00,
            saldo: 2000.00,
            estado: 'PENDIENTE',
            moneda: 'PEN',
            condiciones_pago: 'CREDITO_30',
            dias_credito: 30,
            observaciones: null,
            proveedor: {
              id: '123e4567-e89b-12d3-a456-426614174001',
              razon_social: 'ABC SAC',
              ruc: '20123456789',
              nombre_comercial: 'ABC',
            },
            recepcion: {
              id: '123e4567-e89b-12d3-a456-426614174002',
              numero_recepcion: 'REC-2025-001',
              fecha_recepcion: '2025-10-01',
            },
            dias_hasta_vencimiento: 1,
            urgencia: 'URGENTE',
          },
          {
            id: '123e4567-e89b-12d3-a456-426614174003',
            numero_documento: 'F001-00124',
            fecha_emision: '2025-10-10',
            fecha_vencimiento: '2025-11-09',
            total: 3500.00,
            saldo: 1500.00,
            estado: 'PARCIAL',
            moneda: 'PEN',
            condiciones_pago: 'CREDITO_30',
            dias_credito: 30,
            observaciones: 'Pago parcial de 2000 realizado',
            proveedor: {
              id: '123e4567-e89b-12d3-a456-426614174004',
              razon_social: 'XYZ EIRL',
              ruc: '20987654321',
              nombre_comercial: 'XYZ',
            },
            recepcion: {
              id: '123e4567-e89b-12d3-a456-426614174005',
              numero_recepcion: 'REC-2025-002',
              fecha_recepcion: '2025-10-10',
            },
            dias_hasta_vencimiento: 15,
            urgencia: 'PROXIMA',
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de consulta inválidos',
  })
  async obtenerProgramacionPagos(
    @Query() query: ProgramacionPagosQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.tesoreriaService.obtenerProgramacionPagos(tenantId, query);
  }

  @Post('lote')
  @RequirePermissions('finanzas', 'tesoreria', 'gestionar')
  @ApiOperation({
    summary: 'Registrar pago masivo a proveedores',
    description: `Registra múltiples pagos a proveedores en una sola transacción. El proceso incluye:
    
1. Validar que todas las CxP existen y están en estado válido
2. Calcular el monto total del lote
3. Validar que la cuenta bancaria tiene saldo suficiente
4. Validar que todas las CxP tienen la misma moneda que la cuenta bancaria
5. Procesar cada pago en transacción:
   - Actualizar saldo y estado de cada CxP
   - Crear movimiento bancario para cada pago
   - Emitir evento PagoProveedorRegistrado para cada pago
6. Actualizar saldo de la cuenta bancaria una sola vez
7. Garantizar idempotencia por lote

Características:
- Si no se especifica monto para una CxP, se paga el saldo completo
- Todos los pagos se procesan con la misma fecha y método de pago
- Si algún pago falla, se revierten todos los cambios (transacción atómica)
- Se genera una referencia única para el lote si no se proporciona

Estados de CxP después del pago:
- PAGADA: si el saldo llega a 0
- PARCIAL: si el saldo es menor al total pero mayor a 0`,
  })
  @ApiResponse({
    status: 201,
    description: 'Lote de pagos procesado exitosamente',
    schema: {
      example: {
        success: true,
        data: {
          lote_id: 'LOTE-2025-001',
          total_pagos: 3,
          monto_total: 4500.00,
          pagos_exitosos: 3,
          pagos_fallidos: 0,
          cuenta_bancaria: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            nombre: 'Cuenta Corriente BCP',
            saldo_anterior: 10000.00,
            saldo_nuevo: 5500.00,
          },
          pagos: [
            {
              cxp_id: '123e4567-e89b-12d3-a456-426614174001',
              proveedor: 'ABC SAC',
              numero_documento: 'F001-00123',
              monto: 1500.00,
              saldo_anterior: 1500.00,
              saldo_nuevo: 0.00,
              estado_anterior: 'PENDIENTE',
              estado_nuevo: 'PAGADA',
              movimiento_bancario_id: '123e4567-e89b-12d3-a456-426614174010',
            },
            {
              cxp_id: '123e4567-e89b-12d3-a456-426614174002',
              proveedor: 'XYZ EIRL',
              numero_documento: 'F001-00124',
              monto: 2000.00,
              saldo_anterior: 3000.00,
              saldo_nuevo: 1000.00,
              estado_anterior: 'PENDIENTE',
              estado_nuevo: 'PARCIAL',
              movimiento_bancario_id: '123e4567-e89b-12d3-a456-426614174011',
            },
            {
              cxp_id: '123e4567-e89b-12d3-a456-426614174003',
              proveedor: 'DEF SAC',
              numero_documento: 'F001-00125',
              monto: 1000.00,
              saldo_anterior: 1000.00,
              saldo_nuevo: 0.00,
              estado_anterior: 'PARCIAL',
              estado_nuevo: 'PAGADA',
              movimiento_bancario_id: '123e4567-e89b-12d3-a456-426614174012',
            },
          ],
        },
        message: 'Lote de pagos procesado exitosamente',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos, saldo insuficiente en cuenta bancaria, o error en procesamiento',
  })
  @ApiResponse({
    status: 404,
    description: 'Cuenta bancaria no encontrada o alguna CxP no encontrada',
  })
  async registrarPagoLote(
    @Body() registrarPagoLoteDto: RegistrarPagoLoteDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.tesoreriaService.registrarPagoLote(tenantId, registrarPagoLoteDto, user?.id);
  }

  @Get('flujo-caja')
  @RequirePermissions('finanzas', 'tesoreria', 'ver')
  @ApiOperation({
    summary: 'Obtener proyección de flujo de caja',
    description: `Genera una proyección del flujo de caja basada en:
    
1. Saldos actuales de cuentas bancarias
2. Cuentas por pagar pendientes (egresos proyectados)
3. Cuentas por cobrar pendientes (ingresos proyectados)

La proyección muestra día por día los movimientos esperados y el saldo proyectado.

Parámetros:
- fecha_desde: Fecha inicial de la proyección (por defecto: hoy)
- fecha_hasta: Fecha final de la proyección (alternativa a dias_proyeccion)
- dias_proyeccion: Número de días a proyectar (por defecto: 90 días)
- cuenta_bancaria_id: Filtrar por cuenta bancaria específica

Alertas:
- SALDO_NEGATIVO: El saldo proyectado es negativo
- SALDO_BAJO: El saldo proyectado es menor al 20% del saldo actual

La proyección agrupa los movimientos por fecha y moneda, calculando:
- Saldo inicial del día
- Ingresos esperados (CxC)
- Egresos esperados (CxP)
- Flujo neto del día
- Saldo final del día`,
  })
  @ApiResponse({
    status: 200,
    description: 'Proyección de flujo de caja obtenida exitosamente',
    schema: {
      example: {
        success: true,
        data: {
          periodo: {
            fecha_desde: '2025-10-25',
            fecha_hasta: '2026-01-23',
            dias: 90,
          },
          cuentas_bancarias: [
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              nombre: 'Cuenta Corriente BCP',
              banco: 'BCP',
              numero_cuenta: '1234567890',
              moneda: 'PEN',
              saldo_actual: 50000.00,
            },
          ],
          resumen: [
            {
              moneda: 'PEN',
              saldo_actual: 50000.00,
              total_ingresos: 120000.00,
              total_egresos: 85000.00,
              flujo_neto: 35000.00,
              saldo_proyectado: 85000.00,
              alerta: null,
            },
          ],
          proyeccion: [
            {
              fecha: '2025-10-26',
              moneda: 'PEN',
              saldo_inicial: 50000.00,
              ingresos: 15000.00,
              egresos: 8000.00,
              flujo_neto: 7000.00,
              saldo_final: 57000.00,
              items: [
                {
                  tipo: 'INGRESO',
                  concepto: 'Cobro a cliente',
                  descripcion: 'ABC SAC - F001-00123',
                  monto: 15000.00,
                  referencia_id: '123e4567-e89b-12d3-a456-426614174001',
                },
                {
                  tipo: 'EGRESO',
                  concepto: 'Pago a proveedor',
                  descripcion: 'XYZ EIRL - F001-00456',
                  monto: 8000.00,
                  referencia_id: '123e4567-e89b-12d3-a456-426614174002',
                },
              ],
            },
            {
              fecha: '2025-10-30',
              moneda: 'PEN',
              saldo_inicial: 57000.00,
              ingresos: 0.00,
              egresos: 12000.00,
              flujo_neto: -12000.00,
              saldo_final: 45000.00,
              items: [
                {
                  tipo: 'EGRESO',
                  concepto: 'Pago a proveedor',
                  descripcion: 'DEF SAC - F001-00789',
                  monto: 12000.00,
                  referencia_id: '123e4567-e89b-12d3-a456-426614174003',
                },
              ],
            },
          ],
          estadisticas: {
            total_cxp_pendientes: 25,
            total_cxc_pendientes: 18,
            total_movimientos: 43,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de consulta inválidos',
  })
  @ApiResponse({
    status: 404,
    description: 'No se encontraron cuentas bancarias activas',
  })
  async obtenerFlujoCaja(
    @Query() query: FlujoCajaQueryDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.tesoreriaService.obtenerFlujoCaja(tenantId, query);
  }
}
