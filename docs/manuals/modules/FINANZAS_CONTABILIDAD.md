# Documentación Técnica Exhaustiva: Finanzas y Contabilidad

Este documento detalla los flujos financieros, gestión de tesorería, motor contable automatizado, y módulos de cuentas por cobrar/pagar del ERP.

---

## 1. Módulo de Cajas (Tesorería) (`/src/modules/cajas`)

Gestiona el flujo de efectivo físico, sesiones de caja, arqueos y cierres con integridad criptográfica.

### 1.1. Arquitectura de Servicios

| Servicio | Archivo | Responsabilidad | Tamaño |
| :--- | :--- | :--- | :--- |
| **CajasService** | `cajas.service.ts` | Orquestador principal | 33KB |
| **CashClosingService** | `cash-closing.service.ts` | Cierre con hash SHA-256 | 19KB |
| **CashShiftChangesService** | `cash-shift-changes.service.ts` | Cambios de turno | 20KB |
| **CashReconciliationService** | `cash-reconciliation.service.ts` | Arqueo y conciliación | 11KB |
| **CashWithdrawalsService** | `cash-withdrawals.service.ts` | Retiros de efectivo | 15KB |
| **CashFraudDetectionService** | `cash-fraud-detection.service.ts` | Detección de fraude | 18KB |
| **CashAuditService** | `cash-audit.service.ts` | Auditoría de eventos | 12KB |
| **CashAuthorizationService** | `cash-authorization.service.ts` | Autorizaciones supervisor | 10KB |

### 1.2. Ciclo de Vida de Sesiones

```
┌────────────┐
│   NINGUNA  │ (Caja sin sesión activa)
└─────┬──────┘
      │ abrirCaja()
      ▼
┌────────────┐                    ┌─────────────────┐
│  ABIERTA   │◄───────────────────│ EN_CAMBIO_TURNO │
└─────┬──────┘ completarCambio()  └────────┬────────┘
      │                                    │
      ├─────────────────┬──────────────────┤
      │                 │                  │
 cerrarCaja()    iniciarCambioTurno()  cerrarAdmin()
      │                 │                  │
      ▼                 ▼                  ▼
┌────────────┐   ┌─────────────────┐  ┌───────────────┐
│  CERRADA   │   │ EN_CAMBIO_TURNO │  │ CERRADA_ADMIN │
└────────────┘   └─────────────────┘  └───────────────┘
```

### 1.3. Apertura de Caja con Validaciones

```typescript
async abrirCaja(tenantId: string, cajaId: string, dto: AbrirCajaDto, userId?: string) {
  // VALIDACIÓN 1: Caja existe y está activa
  const caja = await this.obtenerCaja(cajaId, tenantId);
  if (!caja || !caja.activa) {
    throw new BadRequestException('Caja no existe o está inactiva');
  }
  
  // VALIDACIÓN 2: No hay sesión abierta para esta caja
  const sesionExistente = await this.buscarSesionAbierta(cajaId, tenantId);
  if (sesionExistente) {
    throw new ConflictException(
      `Caja ya tiene sesión abierta por ${sesionExistente.cajero.nombre}`
    );
  }
  
  // VALIDACIÓN 3: Usuario no tiene otra caja abierta
  const otraSesion = await this.buscarSesionPorUsuario(userId, tenantId);
  if (otraSesion) {
    throw new ConflictException(
      `Usuario ya tiene abierta la caja ${otraSesion.caja.nombre}`
    );
  }
  
  // VALIDACIÓN 4: Monto de apertura en rango permitido
  const config = await this.configuracionService.obtenerConfiguracion(tenantId);
  if (dto.monto_inicial > config.monto_maximo_apertura) {
    // Requiere autorización de supervisor
    if (!dto.supervisor_id || !dto.razon_autorizacion) {
      throw new BadRequestException(
        `Monto ${dto.monto_inicial} excede máximo ${config.monto_maximo_apertura}. Requiere supervisor.`
      );
    }
    await this.autorizacionesService.validarAutorizacion(dto.supervisor_id, 'APERTURA_EXCEDIDA');
  }
  
  // Crear sesión
  const sesion = await this.insertarSesion({
    tenant_id: tenantId,
    caja_id: cajaId,
    cajero_id: userId,
    estado: 'ABIERTA',
    monto_inicio: dto.monto_inicial,
    hora_apertura: new Date(),
    dispositivo: dto.dispositivo,
    ip_address: dto.ip_address,
    geolocalizacion: dto.geolocalizacion,
    denominaciones_apertura: dto.denominaciones_apertura,
    foto_apertura: dto.foto_apertura,
    user_agent: dto.user_agent
  });
  
  // Registrar en auditoría
  await this.auditService.registrar({
    tipo: 'APERTURA_CAJA',
    entidad: 'sesion_caja',
    entidad_id: sesion.id,
    usuario_id: userId,
    metadata: { monto: dto.monto_inicial, caja: caja.nombre }
  });
  
  return sesion;
}
```

### 1.4. Cierre de Caja con Integridad Criptográfica

```typescript
interface DatosCierre {
  monto_contado: number;
  denominaciones: {
    billetes: { [denominacion: string]: number };
    monedas: { [denominacion: string]: number };
  };
  notas?: string;
}

async cerrarCaja(
  sesionId: string,
  datos: DatosCierre,
  userId: string,
  tenantId: string,
  supervisorId?: string
): Promise<SesionCajaCerrada> {
  // 1. Validar pre-cierre
  const validacion = await this.validarPrecierre(sesionId, tenantId);
  if (!validacion.valido) {
    throw new BadRequestException({
      code: 'PRECIERRE_INVALIDO',
      errores: validacion.errores,
      warnings: validacion.warnings
    });
  }
  
  // 2. Obtener sesión y movimientos
  const sesion = await this.obtenerSesion(sesionId, tenantId);
  const movimientos = await this.movementsService.obtenerMovimientos(sesionId);
  
  // 3. Calcular saldo esperado
  const saldoEsperado = await this.reconciliationService.calcularSaldoEsperado(
    sesion.monto_inicio,
    movimientos
  );
  
  // 4. Calcular diferencia
  const diferencia = datos.monto_contado - saldoEsperado;
  
  // 5. Si diferencia excede tolerancia, requerir supervisor
  const config = await this.configuracionService.obtenerConfiguracion(tenantId);
  if (Math.abs(diferencia) > config.tolerancia_diferencia_caja) {
    if (!supervisorId) {
      throw new BadRequestException({
        code: 'REQUIERE_SUPERVISOR',
        diferencia,
        esperado: saldoEsperado,
        contado: datos.monto_contado
      });
    }
    await this.authService.validarAutorizacion(supervisorId, 'CIERRE_CON_DIFERENCIA');
  }
  
  // 6. Calcular hash de integridad (SHA-256)
  const hashIntegridad = this.calcularHashIntegridad(sesion, movimientos, datos);
  
  // 7. Cerrar sesión (inmutable después de esto)
  const sesionCerrada = await this.actualizarSesion(sesionId, {
    estado: 'CERRADA',
    monto_cierre: datos.monto_contado,
    monto_esperado: saldoEsperado,
    diferencia,
    hash_integridad: hashIntegridad,
    hora_cierre: new Date(),
    denominaciones_cierre: datos.denominaciones,
    cerrado_por: userId,
    supervisor_cierre: supervisorId,
    notas_cierre: datos.notas
  });
  
  // 8. Registrar en auditoría
  await this.auditService.registrar({
    tipo: 'CIERRE_CAJA',
    sesion_id: sesionId,
    metadata: { diferencia, hash: hashIntegridad }
  });
  
  return sesionCerrada;
}
```

### 1.5. Cálculo de Hash de Integridad

```typescript
calcularHashIntegridad(sesion: any, movimientos: MovimientoCaja[], cierre: DatosCierre): string {
  // Estructura determinista para el hash
  const dataParaHash = {
    sesion_id: sesion.id,
    apertura: {
      monto: sesion.monto_inicio,
      hora: sesion.hora_apertura,
      denominaciones: sesion.denominaciones_apertura
    },
    movimientos: movimientos
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(m => ({
        id: m.id,
        tipo: m.tipo,
        monto: m.monto,
        referencia: m.referencia_id,
        created_at: m.created_at
      })),
    cierre: {
      monto_contado: cierre.monto_contado,
      denominaciones: cierre.denominaciones
    },
    timestamp: new Date().toISOString()
  };
  
  // SHA-256 del JSON serializado
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(dataParaHash))
    .digest('hex');
}

// Verificación posterior
async verificarIntegridad(sesionId: string, tenantId: string): Promise<boolean> {
  const sesion = await this.obtenerSesionCerrada(sesionId, tenantId);
  const movimientos = await this.movementsService.obtenerMovimientos(sesionId);
  
  const hashRecalculado = this.calcularHashIntegridad(
    sesion,
    movimientos,
    {
      monto_contado: sesion.monto_cierre,
      denominaciones: sesion.denominaciones_cierre
    }
  );
  
  return hashRecalculado === sesion.hash_integridad;
}
```

### 1.6. Cambio de Turno

```typescript
interface FirmasDigitales {
  firma_saliente: string;  // Base64 de imagen de firma
  firma_entrante: string;
}

async iniciarCambioTurno(
  tenantId: string,
  sesionId: string,
  usuarioSalienteId: string,
  usuarioEntranteId: string
): Promise<{ cambioId: string }> {
  const sesion = await this.obtenerSesion(sesionId, tenantId);
  
  // Validar que el usuario saliente es el cajero actual
  if (sesion.cajero_id !== usuarioSalienteId) {
    throw new BadRequestException('Solo el cajero actual puede iniciar cambio de turno');
  }
  
  // Marcar sesión como EN_CAMBIO_TURNO (bloquea nuevas ventas)
  await this.actualizarSesion(sesionId, { estado: 'EN_CAMBIO_TURNO' });
  
  // Crear registro de cambio
  const cambio = await this.insertarCambioTurno({
    sesion_id: sesionId,
    usuario_saliente_id: usuarioSalienteId,
    usuario_entrante_id: usuarioEntranteId,
    estado: 'PENDIENTE',
    iniciado_en: new Date()
  });
  
  return { cambioId: cambio.id };
}

async completarCambioTurno(
  tenantId: string,
  cambioId: string,
  saldoContado: number,
  denominaciones: any,
  fotoArqueo: string,
  firmas: FirmasDigitales
): Promise<void> {
  const cambio = await this.obtenerCambioTurno(cambioId, tenantId);
  const sesion = await this.obtenerSesion(cambio.sesion_id, tenantId);
  
  // Calcular diferencia
  const saldoEsperado = await this.calcularSaldoEsperado(cambio.sesion_id);
  const diferencia = saldoContado - saldoEsperado;
  
  // Registrar arqueo intermedio
  await this.insertarArqueoIntermedio({
    sesion_id: cambio.sesion_id,
    cambio_turno_id: cambioId,
    saldo_contado: saldoContado,
    saldo_esperado: saldoEsperado,
    diferencia,
    denominaciones,
    foto_arqueo: fotoArqueo,
    firma_saliente: firmas.firma_saliente,
    firma_entrante: firmas.firma_entrante
  });
  
  // Actualizar sesión con nuevo cajero
  await this.actualizarSesion(cambio.sesion_id, {
    cajero_id: cambio.usuario_entrante_id,
    estado: 'ABIERTA',
    ultimo_cambio_turno: new Date()
  });
  
  // Completar cambio de turno
  await this.actualizarCambioTurno(cambioId, {
    estado: 'COMPLETADO',
    completado_en: new Date(),
    saldo_verificado: saldoContado
  });
}
```

### 1.7. Cierre Administrativo (Sesiones Colgadas)

```typescript
async cerrarSesionAdministrativa(
  tenantId: string,
  sesionId: string,
  razonCierre: string,
  userId: string
): Promise<void> {
  const sesion = await this.obtenerSesion(sesionId, tenantId);
  
  // Solo sesiones ABIERTA o EN_CAMBIO_TURNO
  if (!['ABIERTA', 'EN_CAMBIO_TURNO'].includes(sesion.estado)) {
    throw new BadRequestException('Sesión no está en estado que permita cierre administrativo');
  }
  
  // Calcular saldo teórico (no hay conteo real)
  const movimientos = await this.movementsService.obtenerMovimientos(sesionId);
  const saldoTeorico = this.calcularSaldoTeorico(sesion.monto_inicio, movimientos);
  
  // Cerrar con flag administrativo
  await this.actualizarSesion(sesionId, {
    estado: 'CERRADA',
    monto_cierre: saldoTeorico, // Usamos teórico
    monto_esperado: saldoTeorico,
    diferencia: 0, // Sin arqueo real
    hora_cierre: new Date(),
    cierre_administrativo: true,
    razon_cierre_admin: razonCierre,
    admin_cierre_id: userId
  });
  
  // Auditoría especial
  await this.auditService.registrar({
    tipo: 'CIERRE_ADMINISTRATIVO',
    sesion_id: sesionId,
    usuario_id: userId,
    severity: 'WARNING',
    metadata: { razon: razonCierre, cajero_original: sesion.cajero_id }
  });
}
```

---

## 2. Módulo de Cuentas por Cobrar (CxC) (`/src/modules/finanzas/cxc`)

Gestiona la deuda de clientes con creación automática desde facturación y manejo de tributos.

### 2.1. Arquitectura

```typescript
@Injectable()
export class CxcService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventBus: EventBusService,
    private readonly auditService: AuditService,
    private readonly retencionesValidation: RetencionesValidationService,
  ) {}
}
```

### 2.2. Creación Automática desde Factura

```typescript
async crearCuentaPorCobrarDesdeFactura(evento: FacturaEmitidaEvent): Promise<void> {
  const idempotencyKey = `factura:${evento.tenant_id}:${evento.factura_id}`;
  
  // Verificar idempotencia
  const yaExiste = await this.verificarIdempotencia(idempotencyKey);
  if (yaExiste) {
    this.logger.log(`CxC ya creada para factura ${evento.factura_id}`);
    return;
  }
  
  // Obtener configuración y cliente
  const config = await this.obtenerConfiguracionEmpresa(evento.tenant_id);
  const cliente = await this.obtenerCliente(evento.cliente_id, evento.tenant_id);
  
  // Calcular ajustes tributarios
  const ajustes = this.calcularAjustesDesdeEvento(evento, cliente, config);
  
  // Validar cuadre tributario
  const validacion = await this.retencionesValidation.validar({
    total: evento.total,
    retencion: ajustes.retencion,
    detraccion: ajustes.detraccion,
    percepcion: ajustes.percepcion,
    anticipo: ajustes.anticipo
  });
  
  if (!validacion.valido) {
    throw new Error(`Cuadre tributario inválido: ${validacion.errores.join(', ')}`);
  }
  
  // Calcular monto pendiente inicial
  const montoPendienteInicial = new Decimal(evento.total)
    .minus(ajustes.retencion)
    .minus(ajustes.detraccion)
    .minus(ajustes.anticipo)
    .plus(ajustes.percepcion)
    .toNumber();
  
  // Crear cuenta por cobrar
  const cxc = await this.insertarCxc({
    tenant_id: evento.tenant_id,
    cliente_id: evento.cliente_id,
    documento_id: evento.documento_id,
    cpe_id: evento.cpe_id,
    tipo_documento: this.mapTipoDocumentoDesdeCpe(evento.tipo_documento),
    serie: evento.serie,
    numero: evento.numero,
    fecha_emision: evento.fecha_emision,
    fecha_vencimiento: this.calcularVencimiento(evento.fecha_emision, cliente.dias_credito || config.dias_vencimiento_defecto),
    moneda: evento.moneda,
    monto_total: evento.total,
    monto_pendiente: montoPendienteInicial,
    ajustes: {
      retencion: ajustes.retencion,
      detraccion: ajustes.detraccion,
      percepcion: ajustes.percepcion,
      anticipo: ajustes.anticipo
    },
    estado: montoPendienteInicial === 0 ? 'CANCELADO' : 'PENDIENTE'
  });
  
  // Crear movimientos iniciales por tributos
  if (ajustes.retencion > 0) {
    await this.crearPagoInterno(cxc.id, evento.tenant_id, {
      tipo: 'RETENCION',
      monto: ajustes.retencion,
      descripcion: 'Retención IGV (3%)'
    });
  }
  
  if (ajustes.detraccion > 0) {
    await this.crearPagoInterno(cxc.id, evento.tenant_id, {
      tipo: 'DETRACCION',
      monto: ajustes.detraccion,
      descripcion: `Detracción SPOT (${config.detraccion_tasa * 100}%)`
    });
  }
  
  // Registrar idempotencia
  await this.registrarIdempotencia(idempotencyKey, cxc.id);
  
  // Auditoría
  await this.auditService.registrar({
    tipo: 'CXC_CREADA',
    entidad: 'cuentas_por_cobrar',
    entidad_id: cxc.id,
    metadata: { monto: evento.total, cliente: cliente.razon_social }
  });
}
```

### 2.3. Cálculo de Ajustes Tributarios

```typescript
calcularAjustesDesdeEvento(
  evento: FacturaEmitidaEvent,
  cliente: any,
  config: any
): { retencion: number; percepcion: number; detraccion: number; anticipo: number } {
  let retencion = 0;
  let percepcion = 0;
  let detraccion = 0;
  let anticipo = 0;
  
  // RETENCIÓN: Si cliente es agente de retención
  if (cliente.sujeto_retencion && config.aplicar_retencion) {
    retencion = this.round2(evento.total * (config.retencion_tasa || 0.03));
  }
  
  // DETRACCIÓN: Si servicio está sujeto a SPOT
  if (evento.sujeto_detraccion && config.aplicar_detraccion) {
    detraccion = this.round2(evento.total * (config.detraccion_tasa || 0.12));
  }
  
  // PERCEPCIÓN: Solo para ventas de combustibles y similares
  if (evento.tipo_percepcion && config.aplicar_percepcion) {
    percepcion = this.round2(evento.total * (config.percepcion_tasa || 0.02));
  }
  
  // ANTICIPO: Si hay anticipos registrados del cliente
  if (evento.anticipo_aplicado) {
    anticipo = evento.anticipo_aplicado;
  }
  
  return { retencion, percepcion, detraccion, anticipo };
}

// Redondeo preciso a 2 decimales
round2(value: number): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
```

### 2.4. Registro de Pagos

```typescript
async registrarPago(
  tenantId: string,
  cuentaId: string,
  dto: RegistrarPagoCxcDto,
  userId?: string
): Promise<{ success: boolean; data: any }> {
  const cuenta = await this.obtenerCuentaPorCobrar(tenantId, cuentaId);
  
  // Validación: No pagar más de lo pendiente
  if (dto.monto > cuenta.monto_pendiente) {
    throw new BadRequestException(
      `Monto ${dto.monto} excede pendiente ${cuenta.monto_pendiente}`
    );
  }
  
  // Validación de cuenta bancaria (si aplica)
  if (dto.cuenta_bancaria_id) {
    const cuentaBanco = await this.validarCuentaBancaria(
      dto.cuenta_bancaria_id,
      dto.moneda || cuenta.moneda,
      tenantId
    );
    
    if (cuentaBanco.moneda !== cuenta.moneda && !dto.tipo_cambio) {
      throw new BadRequestException('Se requiere tipo de cambio para monedas diferentes');
    }
  }
  
  // Iniciar transacción
  const idempotencyKey = `cxc.cobro:${tenantId}:${dto.referencia_pago || uuidv4()}`;
  
  // Verificar idempotencia
  if (await this.verificarIdempotencia(idempotencyKey)) {
    return { success: true, data: { mensaje: 'Pago ya registrado' } };
  }
  
  // Registrar pago
  const pago = await this.insertarPago({
    cuenta_id: cuentaId,
    tenant_id: tenantId,
    tipo: dto.tipo_pago, // 'EFECTIVO', 'TRANSFERENCIA', 'CHEQUE'
    monto: dto.monto,
    fecha_pago: dto.fecha_pago || new Date(),
    cuenta_bancaria_id: dto.cuenta_bancaria_id,
    numero_operacion: dto.numero_operacion,
    notas: dto.notas,
    registrado_por: userId
  });
  
  // Actualizar saldo de cuenta bancaria (si aplica)
  if (dto.cuenta_bancaria_id) {
    await this.actualizarSaldoBancario(dto.cuenta_bancaria_id, dto.monto, 'ABONO');
  }
  
  // Actualizar monto pendiente de CxC
  const nuevoPendiente = this.round2(cuenta.monto_pendiente - dto.monto);
  const nuevoEstado = nuevoPendiente === 0 ? 'CANCELADO' : 
                      nuevoPendiente < cuenta.monto_total ? 'PARCIAL' : 'PENDIENTE';
  
  await this.actualizarCxc(cuentaId, {
    monto_pendiente: nuevoPendiente,
    estado: nuevoEstado,
    ultimo_pago: new Date()
  });
  
  // Emitir evento para contabilidad
  await this.eventBus.emit('cxc.cobro.registrado', {
    tenant_id: tenantId,
    cuenta_id: cuentaId,
    pago_id: pago.id,
    monto: dto.monto,
    cuenta_bancaria_id: dto.cuenta_bancaria_id
  });
  
  // Registrar idempotencia
  await this.registrarIdempotencia(idempotencyKey, pago.id);
  
  return { success: true, data: pago };
}
```

### 2.5. Reprogramación de Vencimientos

```typescript
async reprogramarCuentaPorCobrar(
  tenantId: string,
  cuentaId: string,
  dto: ReprogramarCxcDto,
  userId?: string
): Promise<{ success: boolean; data: any }> {
  const cuenta = await this.obtenerCuentaPorCobrar(tenantId, cuentaId);
  
  // Solo cuentas pendientes o parciales
  if (!['PENDIENTE', 'PARCIAL', 'VENCIDO'].includes(cuenta.estado)) {
    throw new BadRequestException('Solo se pueden reprogramar cuentas pendientes');
  }
  
  // Guardar fecha original para auditoría
  const fechaOriginal = cuenta.fecha_vencimiento;
  
  // Actualizar vencimiento
  await this.actualizarCxc(cuentaId, {
    fecha_vencimiento: dto.nueva_fecha_vencimiento,
    estado: new Date(dto.nueva_fecha_vencimiento) >= new Date() ? 'PENDIENTE' : cuenta.estado,
    notas_reprogramacion: dto.motivo
  });
  
  // Auditoría
  await this.auditService.registrar({
    tipo: 'CXC_REPROGRAMADA',
    entidad: 'cuentas_por_cobrar',
    entidad_id: cuentaId,
    usuario_id: userId,
    metadata: {
      fecha_original: fechaOriginal,
      fecha_nueva: dto.nueva_fecha_vencimiento,
      motivo: dto.motivo
    }
  });
  
  return { success: true, data: await this.obtenerCuentaPorCobrar(tenantId, cuentaId) };
}
```

---

## 3. Módulo de Cuentas por Pagar (CxP) (`/src/modules/finanzas/cxp`)

### 3.1. Creación de CxP desde Recepción

```typescript
async crearCuentaPorPagar(
  tenantId: string,
  dto: CrearCxpDto,
  userId?: string
): Promise<{ success: boolean; data: any }> {
  // Calcular fecha de vencimiento según condiciones de pago
  const diasCredito = this.obtenerDiasCreditoPorCondicion(dto.condiciones_pago);
  const fechaVencimiento = this.calcularFechaVencimiento(dto.fecha_emision, diasCredito);
  
  // Calcular ajustes tributarios
  let montoNeto = dto.total;
  
  if (dto.sujeto_retencion) {
    const retencion = this.round2(dto.total * 0.03);
    montoNeto = this.round2(montoNeto - retencion);
  }
  
  if (dto.sujeto_detraccion) {
    const detraccion = this.round2(dto.total * dto.tasa_detraccion);
    montoNeto = this.round2(montoNeto - detraccion);
  }
  
  // Crear CxP
  const cxp = await this.insertarCxp({
    tenant_id: tenantId,
    proveedor_id: dto.proveedor_id,
    recepcion_id: dto.recepcion_id,
    orden_compra_id: dto.orden_compra_id,
    tipo_documento: dto.tipo_documento,
    serie: dto.serie,
    numero: dto.numero,
    fecha_emision: dto.fecha_emision,
    fecha_vencimiento: fechaVencimiento,
    condiciones_pago: dto.condiciones_pago,
    moneda: dto.moneda,
    monto_total: dto.total,
    monto_pendiente: montoNeto,
    ajustes: {
      retencion: dto.sujeto_retencion ? this.round2(dto.total * 0.03) : 0,
      detraccion: dto.sujeto_detraccion ? this.round2(dto.total * dto.tasa_detraccion) : 0
    },
    estado: 'PENDIENTE',
    created_by: userId
  });
  
  return { success: true, data: cxp };
}

obtenerDiasCreditoPorCondicion(condicion: string): number {
  const condiciones: Record<string, number> = {
    'CONTADO': 0,
    'CREDITO_7': 7,
    'CREDITO_15': 15,
    'CREDITO_30': 30,
    'CREDITO_45': 45,
    'CREDITO_60': 60,
    'CREDITO_90': 90
  };
  return condiciones[condicion] || 30;
}
```

### 3.2. Aging Report (Antigüedad de Saldos)

```typescript
async obtenerAgingCxp(
  tenantId: string,
  proveedorId?: string
): Promise<{ success: boolean; data: any }> {
  const hoy = new Date();
  
  let query = this.supabase
    .from('cuentas_por_pagar')
    .select(`
      id, proveedor_id, monto_total, monto_pendiente, fecha_vencimiento, moneda,
      proveedores!inner(razon_social, ruc)
    `)
    .eq('tenant_id', tenantId)
    .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDO']);
  
  if (proveedorId) {
    query = query.eq('proveedor_id', proveedorId);
  }
  
  const { data: cuentas } = await query;
  
  // Clasificar por antigüedad
  const aging = {
    corriente: { count: 0, monto: 0 },      // No vencido
    '1-30': { count: 0, monto: 0 },         // 1-30 días vencido
    '31-60': { count: 0, monto: 0 },        // 31-60 días
    '61-90': { count: 0, monto: 0 },        // 61-90 días
    'mas_90': { count: 0, monto: 0 },       // Más de 90 días
    total: { count: 0, monto: 0 }
  };
  
  for (const cuenta of cuentas) {
    const diasVencido = this.calcularDiasVencido(cuenta.fecha_vencimiento, hoy);
    const bucket = this.clasificarBucket(diasVencido);
    
    aging[bucket].count++;
    aging[bucket].monto += cuenta.monto_pendiente;
    aging.total.count++;
    aging.total.monto += cuenta.monto_pendiente;
  }
  
  return { success: true, data: aging };
}

clasificarBucket(diasVencido: number): string {
  if (diasVencido <= 0) return 'corriente';
  if (diasVencido <= 30) return '1-30';
  if (diasVencido <= 60) return '31-60';
  if (diasVencido <= 90) return '61-90';
  return 'mas_90';
}
```

---

## 4. Módulo de Bancos (`/src/modules/finanzas/bancos`)

### 4.1. Movimientos Bancarios con Control de Sobregiro

```typescript
async crearMovimientoBancario(
  tenantId: string,
  dto: CrearMovimientoBancarioDto,
  userId?: string
): Promise<{ success: boolean; data: any }> {
  // Obtener cuenta bancaria con saldo actual
  const cuenta = await this.obtenerCuentaBancaria(tenantId, dto.cuenta_bancaria_id);
  
  // Validación de sobregiro (si es CARGO)
  if (dto.tipo === 'CARGO') {
    const nuevoSaldo = this.round2(cuenta.saldo_actual - dto.monto);
    
    if (nuevoSaldo < 0 && !cuenta.permite_sobregiro) {
      throw new BadRequestException({
        code: 'SALDO_INSUFICIENTE',
        saldo_actual: cuenta.saldo_actual,
        monto_cargo: dto.monto,
        saldo_resultante: nuevoSaldo
      });
    }
    
    if (nuevoSaldo < 0 && cuenta.permite_sobregiro) {
      if (Math.abs(nuevoSaldo) > cuenta.limite_sobregiro) {
        throw new BadRequestException({
          code: 'EXCEDE_LIMITE_SOBREGIRO',
          limite: cuenta.limite_sobregiro,
          exceso: Math.abs(nuevoSaldo) - cuenta.limite_sobregiro
        });
      }
    }
  }
  
  // Calcular nuevo saldo
  const nuevoSaldo = dto.tipo === 'ABONO'
    ? this.round2(cuenta.saldo_actual + dto.monto)
    : this.round2(cuenta.saldo_actual - dto.monto);
  
  // Crear movimiento
  const movimiento = await this.insertarMovimiento({
    tenant_id: tenantId,
    cuenta_bancaria_id: dto.cuenta_bancaria_id,
    tipo: dto.tipo,
    concepto: dto.concepto,
    monto: dto.monto,
    saldo_anterior: cuenta.saldo_actual,
    saldo_posterior: nuevoSaldo,
    fecha_movimiento: dto.fecha_movimiento || new Date(),
    numero_operacion: dto.numero_operacion,
    referencia: dto.referencia,
    notas: dto.notas,
    created_by: userId
  });
  
  // Actualizar saldo de la cuenta
  await this.actualizarSaldoCuenta(dto.cuenta_bancaria_id, nuevoSaldo);
  
  // Emitir evento para contabilidad
  await this.eventBus.emit('banco.movimiento', {
    tenant_id: tenantId,
    cuenta_id: dto.cuenta_bancaria_id,
    tipo: dto.tipo,
    monto: dto.monto,
    movimiento_id: movimiento.id
  });
  
  return { success: true, data: movimiento };
}
```

### 4.2. Saldos Consolidados

```typescript
async obtenerSaldosConsolidados(tenantId: string): Promise<{ success: boolean; data: any }> {
  const { data: cuentas } = await this.supabase
    .from('cuentas_bancarias')
    .select('id, nombre, banco, numero_cuenta, moneda, saldo_actual, tipo_cuenta')
    .eq('tenant_id', tenantId)
    .eq('activa', true);
  
  // Agrupar por moneda
  const consolidado: Record<string, { 
    cuentas: number; 
    saldo_total: number; 
    detalle: any[] 
  }> = {};
  
  for (const cuenta of cuentas) {
    if (!consolidado[cuenta.moneda]) {
      consolidado[cuenta.moneda] = { cuentas: 0, saldo_total: 0, detalle: [] };
    }
    
    consolidado[cuenta.moneda].cuentas++;
    consolidado[cuenta.moneda].saldo_total = this.round2(
      consolidado[cuenta.moneda].saldo_total + cuenta.saldo_actual
    );
    consolidado[cuenta.moneda].detalle.push({
      banco: cuenta.banco,
      numero: cuenta.numero_cuenta,
      saldo: cuenta.saldo_actual
    });
  }
  
  return { success: true, data: consolidado };
}
```

---

## 5. Módulo de Contabilidad (`/src/modules/contabilidad`)

Motor contable automatizado que transforma eventos operativos en asientos de partida doble.

### 5.1. Generador de Asientos

```typescript
@Injectable()
export class AsientosGeneratorService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly periodosService: PeriodosService,
    private readonly planCuentasService: PlanCuentasService
  ) {}

  async generarAsiento(
    tenantId: string,
    fecha: Date,
    concepto: string,
    detalles: DetalleAsiento[],
    referencia?: string,
    sourceEventId?: string
  ): Promise<AsientoContable> {
    // 1. Validar período abierto
    await this.periodosService.validarPeriodoAbierto(tenantId, fecha);
    
    // 2. Validar cuadre contable
    const totalDebe = detalles.reduce((sum, d) => sum + d.debe, 0);
    const totalHaber = detalles.reduce((sum, d) => sum + d.haber, 0);
    
    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      throw new Error(`Asiento descuadrado: Debe=${totalDebe}, Haber=${totalHaber}`);
    }
    
    // 3. Verificar idempotencia (si hay sourceEventId)
    if (sourceEventId) {
      const existente = await this.buscarAsientoPorEvento(tenantId, sourceEventId);
      if (existente) {
        return existente;
      }
    }
    
    // 4. Generar número de asiento
    const numeroAsiento = await this.generarNumeroAsiento(tenantId, fecha);
    
    // 5. Crear asiento con detalles
    const asiento = await this.insertarAsiento({
      tenant_id: tenantId,
      numero_asiento: numeroAsiento,
      fecha: fecha.toISOString().split('T')[0],
      concepto,
      referencia,
      total_debe: this.round2(totalDebe),
      total_haber: this.round2(totalHaber),
      estado: 'REGISTRADO',
      source_event_id: sourceEventId
    });
    
    // 6. Insertar líneas de detalle
    for (const detalle of detalles) {
      await this.insertarDetalleAsiento({
        asiento_id: asiento.id,
        cuenta_id: detalle.cuenta_id,
        debe: this.round2(detalle.debe),
        haber: this.round2(detalle.haber),
        concepto: detalle.concepto,
        centro_costo_id: detalle.centro_costo_id
      });
    }
    
    return asiento;
  }
}
```

### 5.2. Listener de Eventos Contables

```typescript
@OnEvent('documento.fiscal.generado')
async handleDocumentoFiscalGenerado(evento: DocumentoFiscalGeneradoEvent) {
  try {
    // Determinar tipo de asiento
    if (evento.tipo_documento === '01' || evento.tipo_documento === '03') {
      await this.generarAsientoVenta(evento);
    } else if (evento.tipo_documento === '07') {
      await this.generarAsientoNotaCredito(evento);
    }
    
    // Marcar evento como procesado
    await this.marcarEventoComoProcesado(evento.event_id);
    
  } catch (error) {
    // Marcar como fallido para reintento
    await this.marcarEventoComoFallido(evento.event_id, error.message);
    throw error;
  }
}

async generarAsientoVenta(evento: any): Promise<AsientoContable> {
  const cuentas = await this.planCuentasService.buscarCuentas(evento.tenant_id, [
    { codigo: '12' },  // Clientes
    { codigo: '40' },  // Tributos por pagar
    { codigo: '70' }   // Ventas
  ]);
  
  const detalles: DetalleAsiento[] = [
    // DEBE: 12 Clientes por el total
    {
      cuenta_id: cuentas['12'].id,
      debe: evento.total,
      haber: 0,
      concepto: `Cliente: ${evento.cliente_nombre}`
    },
    // HABER: 70 Ventas por la base
    {
      cuenta_id: cuentas['70'].id,
      debe: 0,
      haber: evento.subtotal,
      concepto: 'Venta de mercaderías'
    },
    // HABER: 40 IGV por el impuesto
    {
      cuenta_id: cuentas['40'].id,
      debe: 0,
      haber: evento.igv,
      concepto: 'IGV por pagar'
    }
  ];
  
  return this.generarAsiento(
    evento.tenant_id,
    new Date(evento.fecha_emision),
    `Venta ${evento.serie}-${evento.numero}`,
    detalles,
    `CPE:${evento.cpe_id}`,
    evento.event_id
  );
}
```

### 5.3. Gestión de Períodos Contables

```typescript
@Injectable()
export class PeriodosService {
  async validarPeriodoAbierto(tenantId: string, fecha: Date): Promise<void> {
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth() + 1;
    
    const periodo = await this.obtenerPeriodo(tenantId, anio, mes);
    
    if (!periodo) {
      // Auto-crear período si no existe
      await this.crearPeriodo(tenantId, anio, mes);
      return;
    }
    
    if (periodo.estado === 'CERRADO') {
      throw new BadRequestException(
        `Período ${mes}/${anio} está cerrado. No se permiten nuevos asientos.`
      );
    }
    
    if (periodo.estado === 'BLOQUEADO') {
      throw new BadRequestException(
        `Período ${mes}/${anio} está bloqueado. Contacte al administrador.`
      );
    }
  }

  async cerrarPeriodo(
    tenantId: string,
    anio: number,
    mes: number,
    usuarioId: string
  ): Promise<PeriodoContable> {
    // 1. Validar que todos los asientos cuadren
    const validacionAsientos = await this.validarAsientosCuadran(tenantId, anio, mes);
    if (!validacionAsientos.valido) {
      throw new BadRequestException({
        code: 'ASIENTOS_DESCUADRADOS',
        asientos: validacionAsientos.asientosDescuadrados
      });
    }
    
    // 2. Validar que no haya eventos pendientes
    const validacionEventos = await this.validarEventosPendientes(tenantId, anio, mes);
    if (!validacionEventos.valido) {
      throw new BadRequestException({
        code: 'EVENTOS_PENDIENTES',
        cantidad: validacionEventos.eventosPendientes
      });
    }
    
    // 3. Refrescar estados financieros
    await this.estadosFinancierosService.refrescarEstadosFinancieros(tenantId, anio, mes);
    
    // 4. Cerrar período
    return this.actualizarPeriodo(tenantId, anio, mes, {
      estado: 'CERRADO',
      fecha_cierre: new Date(),
      cerrado_por: usuarioId
    });
  }
}
```

### 5.4. Estados Financieros

```typescript
async getEstadoResultados(
  tenantId: string,
  anio: number,
  mes: number
): Promise<EstadoResultados> {
  // Obtener saldos de cuentas de resultado
  const { data: saldos } = await this.supabase.rpc('calcular_saldos_resultado', {
    p_tenant_id: tenantId,
    p_anio: anio,
    p_mes: mes
  });
  
  return {
    ingresos: {
      ventas: saldos.ventas_70 || 0,
      otros_ingresos: saldos.otros_75 || 0,
      total_ingresos: (saldos.ventas_70 || 0) + (saldos.otros_75 || 0)
    },
    costos: {
      costo_ventas: saldos.costo_69 || 0,
      total_costos: saldos.costo_69 || 0
    },
    gastos: {
      gastos_administrativos: saldos.gastos_94 || 0,
      gastos_ventas: saldos.gastos_95 || 0,
      gastos_financieros: saldos.gastos_97 || 0,
      total_gastos: (saldos.gastos_94 || 0) + (saldos.gastos_95 || 0) + (saldos.gastos_97 || 0)
    },
    utilidad_neta: this.calcularUtilidadNeta(saldos)
  };
}

async getBalanceGeneral(
  tenantId: string,
  anio: number,
  mes: number
): Promise<BalanceGeneral> {
  const { data: saldos } = await this.supabase.rpc('calcular_saldos_balance', {
    p_tenant_id: tenantId,
    p_anio: anio,
    p_mes: mes
  });
  
  return {
    activos: {
      corrientes: {
        efectivo: saldos.efectivo_10 || 0,
        cuentas_por_cobrar: saldos.cxc_12 || 0,
        inventarios: saldos.inventario_20 || 0,
        total_corrientes: this.sumarActivos(saldos, 'corriente')
      },
      no_corrientes: {
        inmuebles: saldos.inmuebles_33 || 0,
        depreciacion: saldos.depreciacion_39 || 0,
        total_no_corrientes: this.sumarActivos(saldos, 'no_corriente')
      }
    },
    pasivos: {
      corrientes: {
        proveedores: saldos.proveedores_42 || 0,
        tributos_por_pagar: saldos.tributos_40 || 0,
        total_corrientes: this.sumarPasivos(saldos, 'corriente')
      }
    },
    patrimonio: {
      capital: saldos.capital_50 || 0,
      resultados_acumulados: saldos.resultados_59 || 0,
      resultado_ejercicio: saldos.resultado_ejercicio || 0,
      total_patrimonio: this.sumarPatrimonio(saldos)
    }
  };
}
```

---

## 6. Módulo de Tesorería (`/src/modules/finanzas/tesoreria`)

### 6.1. Programación de Pagos

```typescript
async obtenerProgramacionPagos(
  tenantId: string,
  query: ProgramacionPagosQueryDto
): Promise<{ success: boolean; data: any[] }> {
  const desde = query.fecha_desde || new Date().toISOString().split('T')[0];
  const hasta = query.fecha_hasta || this.addDays(new Date(), 30).toISOString().split('T')[0];
  
  // Obtener CxP vencidas y próximas a vencer
  const { data: cxps } = await this.supabase
    .from('cuentas_por_pagar')
    .select(`
      id, proveedor_id, monto_pendiente, fecha_vencimiento, moneda,
      proveedores!inner(razon_social, cuenta_bancaria)
    `)
    .eq('tenant_id', tenantId)
    .in('estado', ['PENDIENTE', 'PARCIAL', 'VENCIDO'])
    .gte('fecha_vencimiento', desde)
    .lte('fecha_vencimiento', hasta)
    .order('fecha_vencimiento');
  
  // Agrupar por semana
  const programacion = this.agruparPorSemana(cxps);
  
  // Calcular flujo de caja proyectado
  const saldoBancario = await this.obtenerSaldoTotalBancos(tenantId);
  
  return {
    success: true,
    data: {
      saldo_inicial: saldoBancario,
      programacion,
      saldo_proyectado: this.calcularSaldoProyectado(saldoBancario, programacion)
    }
  };
}
```

### 6.2. Flujo de Caja

```typescript
async obtenerFlujoCaja(
  tenantId: string,
  query: FlujoCajaQueryDto
): Promise<{ success: boolean; data: any }> {
  const { data: ingresos } = await this.supabase
    .from('movimientos_bancarios')
    .select('monto, fecha_movimiento')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'ABONO')
    .gte('fecha_movimiento', query.fecha_desde)
    .lte('fecha_movimiento', query.fecha_hasta);
  
  const { data: egresos } = await this.supabase
    .from('movimientos_bancarios')
    .select('monto, fecha_movimiento')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'CARGO')
    .gte('fecha_movimiento', query.fecha_desde)
    .lte('fecha_movimiento', query.fecha_hasta);
  
  const totalIngresos = ingresos.reduce((sum, m) => sum + m.monto, 0);
  const totalEgresos = egresos.reduce((sum, m) => sum + m.monto, 0);
  
  return {
    success: true,
    data: {
      periodo: { desde: query.fecha_desde, hasta: query.fecha_hasta },
      ingresos: {
        total: this.round2(totalIngresos),
        detalle: ingresos
      },
      egresos: {
        total: this.round2(totalEgresos),
        detalle: egresos
      },
      flujo_neto: this.round2(totalIngresos - totalEgresos)
    }
  };
}
```

---

## 7. Patrón Outbox para Resiliencia

### 7.1. Arquitectura de Eventos Fallidos

```typescript
@Injectable()
export class OutboxEventsService {
  // Reintentar eventos fallidos
  async reiniciarEventoFallido(eventId: string): Promise<boolean> {
    const { data: evento } = await this.supabase
      .from('outbox_events')
      .select('*')
      .eq('id', eventId)
      .single();
    
    if (!evento || !['failed', 'dead_letter'].includes(evento.status)) {
      return false;
    }
    
    // Resetear para reprocesamiento
    await this.supabase
      .from('outbox_events')
      .update({
        status: 'pending',
        retry_count: 0,
        error_message: null,
        updated_at: new Date()
      })
      .eq('id', eventId);
    
    return true;
  }

  // Estadísticas de eventos fallidos
  async obtenerEstadisticasEventosFallidos(tenantId?: string): Promise<{
    total_fallidos: number;
    total_dead_letter: number;
    por_tipo: Record<string, number>;
  }> {
    let query = this.supabase
      .from('outbox_events')
      .select('status, event_type')
      .in('status', ['failed', 'dead_letter']);
    
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    
    const { data } = await query;
    
    return {
      total_fallidos: data.filter(e => e.status === 'failed').length,
      total_dead_letter: data.filter(e => e.status === 'dead_letter').length,
      por_tipo: data.reduce((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}
```

### 7.2. Política de Reintentos

```
┌─────────────────┐
│ Evento Emitido  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐    Error    ┌─────────────────┐
│    pending      │────────────▶│     failed      │
└────────┬────────┘             └────────┬────────┘
         │                               │
    Éxito│                          Retry│ (max 3)
         │                               │
         ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│   processed     │             │  dead_letter    │
└─────────────────┘             └─────────────────┘
                                         │
                                    Alerta + Log
                                    integration_logs
```

**Backoff Exponencial:**
- Reintento 1: 30 segundos
- Reintento 2: 2 minutos
- Reintento 3: 10 minutos
- Dead Letter: Alertar y registrar en `integration_logs`
