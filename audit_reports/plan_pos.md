Plan de Implementación: Operaciones de Caja POS (Modular)
Contexto
Problema: El sistema actual tiene gaps críticos en operaciones de caja (identificados en audit Q11-Q24):

❌ NO existe tabla movimientos_caja para trazabilidad de transacciones
❌ NO hay sistema de denominaciones (billetes/monedas)
❌ NO hay hash de integridad criptográfica
❌ NO hay módulo de retiros con aprobación
❌ NO hay detección de fraude
❌ NO hay cambios de turno formales
❌ NO hay reportes de cierre estructurados
Restricción Crítica:

⚠️ NO AGREGAR MÁS CÓDIGO A ARCHIVOS GRANDES

apps/erp-api/src/modules/pos/pos.service.ts
 → 1284 líneas (límite: 600)
apps/web/app/dashboard/pos/page.tsx
 → 1942 líneas (límite: 600)
Solución: Crear servicios y componentes especializados en archivos separados

User Review Required
WARNING

Breaking Changes Potenciales

Se agregará campo hash_integridad a tabla sesiones_caja (requiere migración)
Se creará nueva tabla movimientos_caja (puede afectar performance si hay muchos movimientos)
Se implementará validación estricta de concurrencia por usuario (puede rechazar aperturas que antes eran permitidas)
Se requerirá aprobación de supervisor para retiros > $500 (nuevo flujo de autorización)
IMPORTANT

Decisiones de Diseño Requeridas

Tolerancia de diferencia en cierre: ¿Cuál es el monto aceptable? (propuesta: $10)
Retención de auditoría: ¿7 años para cumplimiento fiscal? (propuesta: SÍ)
Denominaciones: ¿Configurables por país o fijas PEN? (propuesta: PEN fijo inicialmente)
Nivel de seguridad: ¿Requiere PIN de supervisor o solo login? (propuesta: PIN adicional de 6 dígitos)
Proposed Changes
Componente 1: Sistema de Trazabilidad de Movimientos
[NEW] Database Migration
Ubicación: supabase/migrations/XXX__cash_operations_complete.sql (~250 líneas)

Crear tabla movimientos_caja con estructura completa:

CREATE TABLE movimientos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id),
  secuencia INT NOT NULL,
  tipo_movimiento VARCHAR(30) NOT NULL, -- VENTA, RETIRO, INGRESO, AJUSTE, CAMBIO_TURNO
  monto NUMERIC(18,2) NOT NULL,
  saldo_anterior NUMERIC(18,2) NOT NULL,
  saldo_nuevo NUMERIC(18,2) NOT NULL,
  referencia_documento VARCHAR(50), -- venta_pos_id, nc_id, etc
  referencia_tipo VARCHAR(30),
  motivo TEXT,
  usuario_id uuid,
  supervisor_id uuid,
 timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  metadata JSONB,
  tenant_id uuid NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_secuencia_por_sesion UNIQUE(sesion_caja_id, secuencia),
  CONSTRAINT saldo_cuadrado CHECK (saldo_anterior + monto = saldo_nuevo)
);
-- Índices para performance
CREATE INDEX idx_movimientos_caja_sesion ON movimientos_caja(sesion_caja_id, secuencia);
CREATE INDEX idx_movimientos_caja_tipo ON movimientos_caja(tenant_id, tipo_movimiento);
CREATE INDEX idx_movimientos_caja_timestamp ON movimientos_caja(tenant_id, timestamp DESC);
-- Trigger para inmutabilidad post-cierre
CREATE OR REPLACE FUNCTION prevent_cash_movement_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'No se permite modificar movimientos de caja. Son inmutables.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER no_modification_cash_movements
BEFORE UPDATE OR DELETE ON movimientos_caja
FOR EACH ROW EXECUTE FUNCTION prevent_cash_movement_modification();
Agregar campos a sesiones_caja:

ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS hash_integridad VARCHAR(64);
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS denominaciones_apertura JSONB;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS denominaciones_cierre JSONB;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS supervisor_apertura_id uuid;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS supervisor_cierre_id uuid;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS razon_autorizacion TEXT;
Crear tabla retiros_caja:

CREATE TABLE retiros_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id),
  movimiento_caja_id uuid REFERENCES movimientos_caja(id),
  monto NUMERIC(18,2) NOT NULL,
  motivo VARCHAR(50) NOT NULL, -- DEPOSITO_BANCARIO, COMPRA_EMERGENCIA, OTRO
  motivo_detalle TEXT,
  autorizado_por uuid,
  codigo_autorizacion VARCHAR(10),
  foto_comprobante TEXT,
  estado_conciliacion VARCHAR(20) DEFAULT 'PENDIENTE',
  fecha_conciliacion TIMESTAMPTZ,
  banco_destino VARCHAR(100),
  numero_operacion VARCHAR(50),
  tenant_id uuid NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
Crear tabla cambios_turno:

CREATE TABLE cambios_turno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id),
  usuario_saliente_id uuid NOT NULL,
  usuario_entrante_id uuid NOT NULL,
  saldo_sistema NUMERIC(18,2) NOT NULL,
  saldo_contado NUMERIC(18,2) NOT NULL,
  diferencia NUMERIC(18,2) GENERATED ALWAYS AS (saldo_contado - saldo_sistema) STORED,
  denominaciones JSONB,
  foto_arqueo TEXT,
  firma_digital_saliente TEXT,
  firma_digital_entrante TEXT,
  timestamp_inicio TIMESTAMPTZ NOT NULL,
  timestamp_fin TIMESTAMPTZ,
  estado VARCHAR(20) DEFAULT 'EN_PROCESO',
  tenant_id uuid NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
[NEW] Backend Service: Cash Movements
Ubicación: apps/erp-api/src/modules/cajas/services/cash-movements.service.ts (~200 líneas)

Responsabilidades:

Registrar movimientos de caja con secuencia consecutiva
Validar cuadre matemático (saldo_anterior + monto = saldo_nuevo)
Calcular saldo en tiempo real
Generar alertas si hay gaps en secuencia
@Injectable()
export class CashMovementsService {
  async registrarMovimiento(
    sesionId: string,
    tipo: TipoMovimiento,
    monto: number,
    metadata: MovimientoMetadata
  ): Promise<MovimientoCaja> {
    // 1. Obtener último movimiento y secuencia
    // 2. Calcular saldo_nuevo = saldo_anterior + monto
    // 3. Insertar con validación de constraint
    // 4. Retornar movimiento creado
  }
  async obtenerMovimientos(sesionId: string): Promise<MovimientoCaja[]> {
    // Devolver todos los movimientos ordenados por secuencia
  }
  async validarIntegridad(sesionId: string): Promise<ValidationResult> {
    // Verificar que no haya gaps en secuencia
    // Verificar cuadre matemático
    // Devolver ok o lista de errores
  }
}
[NEW] Backend Service: Cash Withdrawals
Ubicación: apps/erp-api/src/modules/cajas/services/cash-withdrawals.service.ts (~150 líneas)

Responsabilidades:

Validar retiros con monto máximo configurable
Requerir aprobación de supervisor si monto > límite
Registrar foto de comprobante
Actualizar estado de conciliación bancaria
@Injectable()
export class CashWithdrawalsService {
  async solicitarRetiro(
    sesionId: string,
    monto: number,
    motivo: MotivoRetiro,
    metadata: RetiroMetadata
  ): Promise<RetiroCaja> {
    // 1. Validar monto vs límite (config)
    // 2. Si > límite, requiere supervisorId y código
    // 3. Validar saldo >= monto + saldo_minimo_operativo
    // 4. Crear retiro + movimiento_caja
    // 5. Retornar retiro creado
  }
  async aprobarRetiro(retiroId: string, supervisorId: string, codigo: string) {
    // Validar código de supervisor
    // Cambiar estado a APROBADO
  }
  async conciliarRetiro(retiroId: string, datosBank: BankReconciliationData) {
    // Actualizar con número de operación bancaria
    // Cambiar estado a CONCILIADO
  }
}
Componente 2: Sistema de Denominaciones y Arqueo
[NEW] Backend Service: Cash Reconciliation
Ubicación: apps/erp-api/src/modules/cajas/services/cash-reconciliation.service.ts (~180 líneas)

Responsabilidades:

Validar cuadre de denominaciones
Calcular diferencias (sobrantes/faltantes)
Aplicar tolerancia configurable
Generar alertas si diferencia > tolerancia
export interface Denominaciones {
  billetes: { [denominacion: number]: number }; // { 200: 5, 100: 10, ... }
  monedas: { [denominacion: number]: number };  // { 5: 20, 2: 50, ... }
}
@Injectable()
export class CashReconciliationService {
  calcularTotalDenominaciones(denom: Denominaciones): number {
    // SUM(cantidad * denominacion)
  }
  validarApertura(
    montoDeclarado: number,
    denominaciones: Denominaciones
  ): { valido: boolean; diferencia: number } {
    const total = this.calcularTotalDenominaciones(denominaciones);
    return {
      valido: total === montoDeclarado,
      diferencia: total - montoDeclarado
    };
  }
  validarCierre(
    sesionId: string,
    montoContado: number,
    denominaciones: Denominaciones
  ): Promise<CierreValidation> {
    // 1. Calcular saldo_teorico (apertura + movimientos netos)
    // 2. Validar denominaciones vs montoContado
    // 3. Calcular diferencia = montoContado - saldo_teorico
    // 4. Comparar con tolerancia
    // 5. Retornar resultado con clasificación (sobrante/faltante)
  }
}
[NEW] Frontend Component: Denomination Form
Ubicación: apps/web/app/dashboard/cajas/components/DenominationForm.tsx (~150 líneas)

Componente reutilizable para captura de denominaciones:

interface DenominationFormProps {
  onSubmit: (denom: Denominaciones) => void;
  initialValues?: Denominaciones;
  readonly?: boolean;
}
export function DenominationForm({ onSubmit, initialValues, readonly }: DenominationFormProps) {
  // Formulario con inputs para:
  // - Billetes: 200, 100, 50, 20, 10
  // - Monedas: 5, 2, 1, 0.50, 0.20, 0.10
  // - Cálculo automático del total
  // - Validación de números enteros para cantidad
  // - Botón de submit con total calculado
}
Componente 3: Detección de Fraude y Auditoría
[NEW] Backend Service: Cash Fraud Detection
Ubicación: apps/erp-api/src/modules/cajas/services/cash-fraud-detection.service.ts (~220 líneas)

Responsabilidades:

Detectar ajustes manuales sospechosos
Identificar gaps en timestamps
Validar patrones de diferencias por usuario
Generar alertas automáticas
@Injectable()
export class CashFraudDetectionService {
  async detectarAnomalias(sesionId: string): Promise<Anomalia[]> {
    const anomalias: Anomalia[] = [];
    
    // 1. Detectar ajustes manuales > 2 por turno
    const ajustes = await this.contarAjustesManuales(sesionId);
    if (ajustes > 2) {
      anomalias.push({
        tipo: 'AJUSTES_EXCESIVOS',
        severidad: 'ALTA',
        detalles: `${ajustes} ajustes manuales detectados`
      });
    }
    // 2. Detectar gaps en timestamps (movimientos fuera de orden)
    const gapsTimestamp = await this.detectarGapsTimestamp(sesionId);
    if (gapsTimestamp.length > 0) {
      anomalias.push({
        tipo: 'TIMESTAMP_SOSPECHOSO',
        severidad: 'CRÍTICA',
        detalles: `Movimientos fuera de secuencia temporal`
      });
    }
    // 3. Validar diferencias recurrentes por usuario
    const patronDiferencias = await this.analizarPatronDiferencias(userId);
    if (patronDiferencias.faltantes > 3) {
      anomalias.push({
        tipo: 'PATRON_FALTANTES',
        severidad: 'MEDIA',
        detalles: `Usuario con ${patronDiferencias.faltantes} faltantes en últimos 30 días`
      });
    }
    return anomalias;
  }
  async recalcularSaldoEsperado(sesionId: string): Promise<number> {
    // SELECT apertura + SUM(movimientos netos)
    // Comparar con saldo_nuevo del último movimiento
  }
}
[NEW] Backend Service: Cash Audit
Ubicación: apps/erp-api/src/modules/cajas/services/cash-audit.service.ts (~180 líneas)

Responsabilidades:

Registrar accesos a funciones sensibles
Almacenar eventos específicos de caja
Mantener retención de 7 años
Bloquear modificaciones retroactivas
export enum CashAuditEvent {
  CONSULTA_SALDO = 'CONSULTA_SALDO',
  INTENTO_CIERRE_FALLIDO = 'INTENTO_CIERRE_FALLIDO',
  APERTURA_FORZOSA = 'APERTURA_FORZOSA',
  MODIFICACION_CONFIGURACION = 'MODIFICACION_CONFIGURACION',
  ACCESO_REPORTES = 'ACCESO_REPORTES',
  RETIRO_AUTORIZADO = 'RETIRO_AUTORIZADO',
  RETIRO_RECHAZADO = 'RETIRO_RECHAZADO'
}
@Injectable()
export class CashAuditService {
  async registrarEvento(
    evento: CashAuditEvent,
    sesionId: string,
    userId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    await this.auditRepo.insert({
      evento,
      sesion_caja_id: sesionId,
      usuario_id: userId,
      ip_address: metadata.ip,
      user_agent: metadata.userAgent,
      parametros: metadata,
      timestamp: new Date()
    });
  }
  async consultarEventos(
    filtros: AuditFilters
  ): Promise<AuditEvent[]> {
    // Consultar eventos con retención de 7 años
  }
}
Componente 4: Cambios de Turno
[NEW] Backend Service: Cash Shift Changes
Ubicación: apps/erp-api/src/modules/cajas/services/cash-shift-changes.service.ts (~200 líneas)

Responsabilidades:

Gestionar cambios de turno con arqueo intermedio
Congelar transacciones temporalmente
Capturar firmas digitales de ambos usuarios
Registrar foto del dinero transferido
@Injectable()
export class CashShiftChangesService {
  async iniciarCambioTurno(
    sesionId: string,
    usuarioSalienteId: string,
    usuarioEntranteId: string
  ): Promise<CambioTurno> {
    // 1. Validar sesión abierta
    // 2. Congelar nuevas transacciones (flag en sesion)
    // 3. Calcular saldo actual del sistema
    // 4. Crear registro de cambio de turno
    // 5. Retornar para que frontend capture arqueo
  }
  async completarCambioTurno(
    cambioId: string,
    saldoContado: number,
    denominaciones: Denominaciones,
    fotoArqueo: string,
    firmas: { saliente: string; entrante: string }
  ): Promise<void> {
    // 1. Validar denominaciones vs saldo contado
    // 2. Calcular diferencia vs saldo sistema
    // 3. Si diferencia > tolerancia, registrar alerta
    // 4. Guardar firmas digitales y foto
    // 5. Descongelar transacciones
    // 6. Completar cambio de turno
  }
}
[NEW] Frontend Component: Shift Change Dialog
Ubicación: apps/web/app/dashboard/cajas/components/ShiftChangeDialog.tsx (~250 líneas)

Componente para flujo de cambio de turno:

export function ShiftChangeDialog({ sesionId, onComplete }: Props) {
  // Wizard de 4 pasos:
  // 1. Confirmación de usuarios (saliente + entrante)
  // 2. Arqueo de denominaciones (DenominationForm)
  // 3. Captura de foto del efectivo
  // 4. Firmas digitales (canvas o PIN)
  
  // Mostrar diferencia en tiempo real
  // Alertar si diferencia > tolerancia
}
Componente 5: Cierre de Caja con Integridad Criptográfica
[NEW] Backend Service: Cash Closing & Integrity
Ubicación: apps/erp-api/src/modules/cajas/services/cash-closing.service.ts (~280 líneas)

Responsabilidades:

Validar pre-cierre (transacciones pendientes)
Calcular hash SHA-256 de integridad
Bloquear modificaciones post-cierre
Generar reporte PDF
@Injectable()
export class CashClosingService {
  async validarPrecierre(sesionId: string): Promise<PreCloseValidation> {
    // 1. Verificar ventas pendientes (estado != COMPLETADA)
    // 2. Validar secuencia consecutiva de movimientos
    // 3. Recalcular saldo esperado
    // 4. Retornar ok o errores
  }
  async cerrarCaja(
    sesionId: string,
    montoContado: number,
    denominaciones: Denominaciones,
    notas: string,
    supervisorId?: string
  ): Promise<SesionCaja> {
    // 1. Validar pre-cierre
    // 2. Validar denominaciones vs montoContado
    // 3. Calcular diferencia
    // 4. Si > tolerancia, requiere supervisor
    // 5. Calcular hash de integridad
    // 6. UPDATE sesion con estado CERRADA
    // 7. Generar reporte PDF
    // 8. Retornar sesión cerrada
  }
  private calcularHashIntegridad(sesion: SesionCaja, movimientos: MovimientoCaja[]): string {
    const data = [
      sesion.id,
      sesion.monto_inicio,
      ...movimientos.map(m => `${m.secuencia}:${m.monto}`),
      sesion.monto_cierre,
      sesion.hora_cierre
    ].join('|');
    
    return createHash('sha256').update(data).digest('hex');
  }
  async verificarIntegridad(sesionId: string): Promise<boolean> {
    const sesion = await this.obtenerSesion(sesionId);
    const movimientos = await this.movimientosService.obtenerMovimientos(sesionId);
    const hashCalculado = this.calcularHashIntegridad(sesion, movimientos);
    
    return hashCalculado === sesion.hash_integridad;
  }
}
[NEW] Backend Service: Cash Reports
Ubicación: apps/erp-api/src/modules/cajas/services/cash-reports.service.ts (~320 líneas)

Responsabilidades:

Generar PDF de cierre con formato estructurado
Incluir firmas digitales y QR
Desglosar por método de pago
Resumen fiscal (IGV, base imponible)
@Injectable()
export class CashReportsService {
  async generarReporteCierre(sesionId: string): Promise<Buffer> {
    const sesion = await this.obtenerSesionCompleta(sesionId);
    const movimientos = await this.movimientosService.obtenerMovimientos(sesionId);
    const ventas = await this.obtenerVentasPorMetodoPago(sesionId);
    
    const pdf = new PDFDocument();
    
    // ENCABEZADO
    pdf.fontSize(16).text('REPORTE DE CIERRE DE CAJA');
    pdf.fontSize(10).text(`Sesión: ${sesion.id}`);
    pdf.text(`Fecha: ${sesion.fecha_apertura} - ${sesion.fecha_cierre}`);
    pdf.text(`Cajero: ${sesion.usuario_apertura}`);
    
    // SECCIÓN 1: APERTURA
    pdf.fontSize(12).text('1. APERTURA');
    pdf.fontSize(10).text(`Monto inicial: S/ ${sesion.monto_inicio}`);
    pdf.text(`Hora apertura: ${sesion.fecha_apertura}`);
    if (sesion.denominaciones_apertura) {
      this.imprimirDenominaciones(pdf, sesion.denominaciones_apertura);
    }
    
    // SECCIÓN 2: MOVIMIENTOS DEL TURNO
    pdf.fontSize(12).text('2. MOVIMIENTOS DEL TURNO');
    pdf.text(`Ventas efectivo: S/ ${ventas.efectivo} (${ventas.cantidad_efectivo} ventas)`);
    pdf.text(`Ventas tarjeta: S/ ${ventas.tarjeta} (${ventas.cantidad_tarjeta} ventas)`);
    pdf.text(`Retiros: S/ ${this.calcularRetiros(movimientos)}`);
    
    // SECCIÓN 3: ARQUEO FINAL
    pdf.fontSize(12).text('3. ARQUEO FINAL');
    pdf.text(`Saldo teórico: S/ ${sesion.monto_esperado}`);
    pdf.text(`Saldo real: S/ ${sesion.monto_contado}`);
    pdf.text(`Diferencia: S/ ${sesion.diferencia}`);
    if (sesion.denominaciones_cierre) {
      this.imprimirDenominaciones(pdf, sesion.denominaciones_cierre);
    }
    
    // SECCIÓN 4: RESUMEN FISCAL
    pdf.fontSize(12).text('4. RESUMEN FISCAL');
    const resumen = await this.calcularResumenFiscal(sesionId);
    pdf.text(`Base imponible: S/ ${resumen.base_imponible}`);
    pdf.text(`IGV (18%): S/ ${resumen.igv}`);
    pdf.text(`Total: S/ ${resumen.total}`);
    pdf.text(`Boletas emitidas: ${resumen.cantidad_boletas}`);
    pdf.text(`Facturas emitidas: ${resumen.cantidad_facturas}`);
    
    // FIRMAS
    pdf.text(`Firma cajero: ________________________`);
    pdf.text(`Firma supervisor: ________________________`);
    
    // QR
    const qr = await QRCode.toDataURL(sesion.id);
    pdf.image(qr, { width: 80 });
    
    return pdf.outputBuffer();
  }
}
[NEW] Frontend Component: Cash Closing Dialog
Ubicación: apps/web/app/dashboard/cajas/components/CashClosingDialog.tsx (~280 líneas)

Diálogo para cierre con:

Validación pre-cierre
Arqueo de denominaciones
Cálculo automático de diferencia
Vista previa del reporte
Justificación si diferencia > tolerancia
PIN de supervisor si requerido
export function CashClosingDialog({ sesionId, onClose }: Props) {
  const [step, setStep] = useState<ClosingStep>('VALIDATING');
  
  // Paso 1: Validación pre-cierre
  useEffect(() => {
    validarPrecierre(sesionId).then(result => {
      if (result.errores.length > 0) {
        setErrors(result.errores);
      } else {
        setStep('ARQUEO');
      }
    });
  }, []);
  
  // Paso 2: Arqueo de denominaciones
  const handleDenominationsSubmit = (denom: Denominaciones) => {
    const total = calcularTotal(denom);
    const diferencia = total - saldoEsperado;
    
    if (Math.abs(diferencia) > TOLERANCIA) {
      setStep('JUSTIFICACION');
    } else {
      setStep('RESUMEN');
    }
  };
  
  // Paso 3: Justificación (si aplica)
  // Paso 4: Resumen y confirmación
  // Paso 5: PIN supervisor (si aplica)
  // Paso 6: Cierre exitoso - descargar PDF
}
Componente 6: Validación de Concurrencia y Autorizaciones
[MODIFY] Cajas Service - Solo Routing
Ubicación: 
apps/erp-api/src/modules/cajas/cajas.service.ts

NO agregar más código. Solo modificar 
abrirCaja()
 para delegar:

async abrirCaja(...) {
  // Delegar validaciones a servicios especializados
  await this.concurrencyValidator.validarConcurrencia(userId, terminalId);
  await this.authorizationService.validarMontoApertura(monto, userId);
  
  const denominacionesValidas = await this.reconciliationService.validarApertura(
    monto,
    dto.denominaciones
  );
  
  if (!denominacionesValidas) {
    throw new BadRequestException('Denominaciones no cuadran');
  }
  
  // Resto del código existente...
}
[NEW] Backend Service: Cash Concurrency Validator
Ubicación: apps/erp-api/src/modules/cajas/services/cash-concurrency.service.ts (~120 líneas)

@Injectable()
export class CashConcurrencyService {
  async validarConcurrencia(userId: string, terminalId: string, tenantId: string): Promise<void> {
    // Validar que usuario no tenga otra caja abierta
    const cajaUsuario = await this.sesionesRepo.findOne({
      where: { usuario_id: userId, estado: 'ABIERTA', tenant_id: tenantId }
    });
    
    if (cajaUsuario) {
      throw new BadRequestException(
        `Ya tiene caja #${cajaUsuario.caja_id} abierta. Debe cerrarla primero.`
      );
    }
    
    // Validar que terminal no tenga caja abierta (ya existe en código actual)
  }
  async permitirCierreAdministrativo(
    sesionId: string,
    adminId: string,
    razon: string
  ): Promise<void> {
    // Forzar cierre de sesión colgada
    // Requiere rol ADMIN
    // Registrar en auditoría
  }
}
[NEW] Backend Service: Cash Authorization
Ubicación: apps/erp-api/src/modules/cajas/services/cash-authorization.service.ts (~150 líneas)

@Injectable()
export class CashAuthorizationService {
  async validarMontoApertura(
    monto: number,
    userId: string,
    supervisorId?: string,
    codigoAutorizacion?: string
  ): Promise<void> {
    const config = await this.obtenerConfiguracion();
    
    if (monto < config.monto_apertura_min || monto > config.monto_apertura_max) {
      if (!supervisorId || !codigoAutorizacion) {
        throw new BadRequestException(
          `Monto fuera de rango (${config.monto_apertura_min} - ${config.monto_apertura_max}). Requiere autorización de supervisor.`
        );
      }
      
      await this.validarCodigoSupervisor(supervisorId, codigoAutorizacion);
      
      // Registrar autorización especial
      await this.autorizacionesRepo.insert({
        tipo: 'APERTURA_ATIPICA',
        usuario_id: userId,
        supervisor_id: supervisorId,
        monto,
        razon: `Monto fuera de rango estándar`,
        timestamp: new Date()
      });
    }
  }
  private async validarCodigoSupervisor(supervisorId: string, codigo: string): Promise<void> {
    // Validar que supervisor tenga rol adecuado
    // Validar código PIN de 6 dígitos
    // Opcional: implementar rate limiting para evitar brute force
  }
}
Componente 7: Frontend - Integración Modular
[NEW] Frontend Page: Cash Management
Ubicación: apps/web/app/dashboard/cajas/page.tsx (~350 líneas)

Nueva página dedicada para operaciones de caja (separada del POS):

export default function CashManagementPage() {
  const [sesiones, setSesiones] = useState<SesionCaja[]>([]);
  const [sesionActiva, setSesionActiva] = useState<SesionCaja | null>(null);
  
  return (
    <div className="p-6">
      <h1>Gestión de Cajas</h1>
      
      {!sesionActiva ? (
        <CashSessionSelector onSelect={setSesionActiva} />
      ) : (
        <ActiveCashSession sesion={sesionActiva}>
          <CashOperationsPanel sesion={sesionActiva} />
          <CashMovementsTable sesion={sesionActiva} />
          <CashActions sesion={sesionActiva} />
        </ActiveCashSession>
      )}
    </div>
  );
}
[NEW] Frontend Components (Componentes pequeños y reutilizables)
Ubicación: apps/web/app/dashboard/cajas/components/

CashOpenDialog.tsx (~180 líneas)

Formulario de apertura con denominaciones
Validación de monto vs configuración
PIN de supervisor si aplican
CashMovementsTable.tsx (~120 líneas)

Tabla de movimientos de la sesión actual
Columnas: secuencia, tipo, monto, saldo, timestamp
Indicador de integridad (verde si cuadra)
CashWithdrawalDialog.tsx (~200 líneas)

Formulario de retiro
Selección de motivo
Upload de foto de comprobante
PIN de supervisor si > límite
CashOperationsPanel.tsx (~150 líneas)

Botones de acciones rápidas:
Registrar ingreso
Solicitar retiro
Cambio de turno
Cierre de caja
Saldo actual en tiempo real
CashIntegrityBadge.tsx (~80 líneas)

Badge visual que muestra estado de integridad
Verde: todo OK
Amarillo: advertencias
Rojo: anomalías detectadas
[MODIFY] POS Page - Minimal Integration
Ubicación: 
apps/web/app/dashboard/pos/page.tsx

SIN agregar código nuevo. Solo importar componente:

// Al inicio del archivo
import { CashSessionSelector } from '@/app/dashboard/cajas/components/CashSessionSelector';
// En el render, reemplazar sección de caja existente (si existe)
<section className="cash-session">
  <CashSessionSelector compact onSelect={setSesionCaja} />
</section>
Verification Plan
Automated Tests
1. Backend Unit Tests
Cash Movements Service

npm test apps/erp-api/src/modules/cajas/services/cash-movements.service.spec.ts
✅ Registra movimiento con secuencia consecutiva
✅ Valida cuadre matemático (saldo_anterior + monto = saldo_nuevo)
✅ Rechaza inserción con secuencia duplicada
✅ Detecta gaps en secuencia
Cash Reconciliation Service

npm test apps/erp-api/src/modules/cajas/services/cash-reconciliation.service.spec.ts
✅ Calcula total de denominaciones correctamente
✅ Detecta discrepancia entre monto declarado y denominaciones
✅ Aplica tolerancia de $10 en cierre
✅ Clasifica diferencia como sobrante/faltante
Cash Fraud Detection Service

npm test apps/erp-api/src/modules/cajas/services/cash-fraud-detection.service.spec.ts
✅ Detecta > 2 ajustes manuales por turno
✅ Identifica gaps en timestamps
✅ Alerta si usuario tiene patrón de faltantes
Cash Closing Service

npm test apps/erp-api/src/modules/cajas/services/cash-closing.service.spec.ts
✅ Bloquea cierre si hay ventas pendientes
✅ Calcula hash SHA-256 correctamente
✅ Verifica integridad post-cierre
✅ Requiere supervisor si diferencia > tolerancia
2. Backend Integration Tests
npm run test:e2e
Flujo completo de sesión de caja:

Apertura con denominaciones
Registro de 10 ventas (movimientos)
Retiro de $300 (sin supervisor)
Retiro de $600 (requiere supervisor)
Cambio de turno con arqueo
Cierre con diferencia de $5 (dentro de tolerancia)
Verificación de hash de integridad
Casos de error:

Intento de abrir segunda caja para mismo usuario
Apertura con monto fuera de rango sin supervisor
Cierre con ventas pendientes
Retiro dejando saldo < mínimo operativo
Manual Verification
1. Flujo de Apertura con Supervisor
Pasos:

Abrir caja con monto de $50 (< mínimo de $100)
Sistema debe solicitar PIN de supervisor
Ingresar PIN incorrecto → debe rechazar
Ingresar PIN correcto → debe permitir apertura
Verificar registro en tabla autorizaciones_especiales
Éxito: Apertura registrada con supervisor_id y razon_autorizacion

2. Control de Concurrencia
Pasos:

Usuario Juan abre Caja #1
Juan intenta abrir Caja #2
Sistema debe rechazar con mensaje: "Ya tiene caja #1 abierta"
Juan cierra Caja #1
Juan puede abrir Caja #2
Éxito: Validación de concurrencia funcionando

3. Cambio de Turno
Pasos:

Cajero María tiene sesión abierta con $1000
Iniciar cambio de turno a Cajero Pedro
Sistema congela nuevas transacciones
Contar efectivo: $1005 (sobrante de $5)
Capturar foto de billetes y firmas
Confirmar cambio de turno
Verificar que Pedro puede hacer ventas
Verificar registro en tabla cambios_turno
Éxito: Cambio documentado, $5 de sobrante registrado

4. Cierre con Diferencia > Tolerancia
Pasos:

Sesión con saldo esperado de $2000
Contar efectivo: $1980 (faltante de $20)
Sistema debe solicitar justificación
Ingresar nota: "Billetes rotos entregados a bóveda"
Solicitar PIN de supervisor
Cerrar sesión
Descargar PDF de cierre
Verificar que PDF incluye:
Diferencia de -$20
Justificación
Firma de supervisor
Éxito: Cierre registrado con diferencia justificada

5. Verificación de Integridad
Pasos:

Cerrar sesión de caja
Intentar modificar monto_cierre directamente en BD
Verificar que trigger impide modificación
Ejecutar función de verificación de hash
Debe retornar false (integridad comprometida)
Alerta debe generarse en auditoría
Éxito: Sistema detecta manipulación

6. Detección de Fraude
Pasos:

Crear sesión con 5 ajustes manuales
Ejecutar detectarAnomalias(sesionId)
Debe retornar anomalía tipo AJUSTES_EXCESIVOS
Crear movimiento con timestamp 10:00
Crear movimiento con timestamp 09:00
Ejecutar detectarAnomalias(sesionId)
Debe retornar anomalía tipo TIMESTAMP_SOSPECHOSO
Éxito: Anomalías detectadas automáticamente

Resumen de Archivos Nuevos
Backend (12 archivos, ~2300 líneas totales)
Migrations:

supabase/migrations/XXX__cash_operations_complete.sql (250 líneas)
Services: 2. apps/erp-api/src/modules/cajas/services/cash-movements.service.ts (200 líneas) 3. apps/erp-api/src/modules/cajas/services/cash-withdrawals.service.ts (150 líneas) 4. apps/erp-api/src/modules/cajas/services/cash-reconciliation.service.ts (180 líneas) 5. apps/erp-api/src/modules/cajas/services/cash-fraud-detection.service.ts (220 líneas) 6. apps/erp-api/src/modules/cajas/services/cash-audit.service.ts (180 líneas) 7. apps/erp-api/src/modules/cajas/services/cash-shift-changes.service.ts (200 líneas) 8. apps/erp-api/src/modules/cajas/services/cash-closing.service.ts (280 líneas) 9. apps/erp-api/src/modules/cajas/services/cash-reports.service.ts (320 líneas) 10. apps/erp-api/src/modules/cajas/services/cash-concurrency.service.ts (120 líneas) 11. apps/erp-api/src/modules/cajas/services/cash-authorization.service.ts (150 líneas)

Tests: 12. Archivos 
.spec.ts
 para cada servicio (~800 líneas totales)

Frontend (12 archivos, ~2200 líneas totales)
Page:

apps/web/app/dashboard/cajas/page.tsx (350 líneas)
Components: 2. apps/web/app/dashboard/cajas/components/DenominationForm.tsx (150 líneas) 3. apps/web/app/dashboard/cajas/components/CashOpenDialog.tsx (180 líneas) 4. apps/web/app/dashboard/cajas/components/CashClosingDialog.tsx (280 líneas) 5. apps/web/app/dashboard/cajas/components/ShiftChangeDialog.tsx (250 líneas) 6. apps/web/app/dashboard/cajas/components/CashMovementsTable.tsx (120 líneas) 7. apps/web/app/dashboard/cajas/components/CashWithdrawalDialog.tsx (200 líneas) 8. apps/web/app/dashboard/cajas/components/CashOperationsPanel.tsx (150 líneas) 9. apps/web/app/dashboard/cajas/components/CashIntegrityBadge.tsx (80 líneas) 10. apps/web/app/dashboard/cajas/components/CashSessionSelector.tsx (120 líneas) 11. apps/web/app/dashboard/cajas/components/ActiveCashSession.tsx (100 líneas) 12. apps/web/app/dashboard/cajas/components/CashActions.tsx (120 líneas)

Modificaciones Mínimas (2 archivos)
apps/erp-api/src/modules/cajas/cajas.service.ts
 - Solo routing (10 líneas agregadas)
apps/web/app/dashboard/pos/page.tsx
 - Solo import (5 líneas agregadas)
Cronograma Estimado
Fase 1: Infraestructura Base (3 días)

Migración de BD
Cash Movements Service
Cash Reconciliation Service
Tests unitarios
Fase 2: Controles de Seguridad (2 días)

Cash Authorization Service
Cash Concurrency Service
Cash Audit Service
Tests de seguridad
Fase 3: Operaciones Avanzadas (3 días)

Cash Withdrawals Service
Cash Shift Changes Service
Cash Fraud Detection Service
Tests de fraude
Fase 4: Cierre e Integridad (2 días)

Cash Closing Service
Cash Reports Service
Hash criptográfico
Tests de integridad
Fase 5: Frontend Componentes (4 días)

Página principal de cajas
Diálogos (apertura,cierre, cambio turno, retiros)
Tabla de movimientos
Integración con POS
Fase 6: Testing & Fixes (2 días)

Tests E2E
Verificación manual
Corrección de bugs
Total: 16 días hábiles (~3 semanas)