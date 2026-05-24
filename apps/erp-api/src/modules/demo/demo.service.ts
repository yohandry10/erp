import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { TenantContextService } from '../../shared/tenant/tenant-context.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CreateDemoTenantDto, ConvertDemoToRealDto } from './dto/create-demo-tenant.dto';
import { StripeService } from './stripe.service';
import { parseCertificateBuffer } from '../../shared/utils/certificate.utils';

const PLANES = {
  basico: {
    id: 'basico',
    nombre: 'Plan Básico',
    precio_mensual: 99.0,
    precio_anual: 990.0,
    moneda: 'PEN',
    usuarios: 5,
    facturas_mes: 1000,
  },
  profesional: {
    id: 'profesional',
    nombre: 'Plan Profesional',
    precio_mensual: 199.0,
    precio_anual: 1990.0,
    moneda: 'PEN',
    usuarios: 15,
    facturas_mes: -1,
  },
  enterprise: {
    id: 'enterprise',
    nombre: 'Plan Enterprise',
    precio_mensual: 499.0,
    precio_anual: 4990.0,
    moneda: 'PEN',
    usuarios: -1,
    facturas_mes: -1,
  },
};

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly stripeService: StripeService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private get client() {
    return this.supabase.getPublicClient();
  }

  async createDemoTenant(dto: CreateDemoTenantDto = {}) {
    const diasDuracion = dto.dias_duracion || 14;
    const nombre = dto.nombre || 'DEMO COMERCIAL SAC';

    try {
      const { data, error } = await this.client.rpc('create_demo_tenant', {
        p_nombre: nombre,
        p_dias_duracion: diasDuracion,
      });

      if (error) throw new Error(error.message);
      if (!data || !data.success) throw new Error('No se pudo crear el tenant demo');

      // Seed operacional best-effort: el RPC crea tenant + empresa + admin pero
      // deja el tenant "esqueleto". Agregamos datos mínimos para que el demo sea
      // realmente usable (POS, CPE, Inventario, Contabilidad). Una falla aquí
      // NO debe romper el flujo de creación de demo.
      // Como /api/demo/create es Public (sin auth), no hay tenant context en
      // AsyncLocalStorage. Lo seteamos explícitamente para que el guard de
      // tablas multi-tenant deje pasar los inserts.
      const seedResult = await this.tenantContext.run(
        {
          tenantId: data.tenant_id,
          userId: data.user_id,
          isSuperAdmin: true, // seed system-level
        },
        () =>
          this.seedDemoOperationalData(data.tenant_id, data.user_id).catch((err) => {
            this.logger.warn(
              `[demo seed] fallo parcial al hidratar tenant ${data.tenant_id}: ${err?.message || err}`,
            );
            return { aprobadorUserId: null, aprobadorEmail: null, aprobadorPassword: null };
          }),
      );

      const token = this.jwtService.sign({
        sub: data.user_id,
        tenant_id: data.tenant_id,
        email: data.email,
        is_demo: true,
      });

      return {
        success: true,
        tenant_id: data.tenant_id,
        user_id: data.user_id,
        email: data.email,
        password: data.password,
        token,
        expires_at: data.expires_at,
        dias_restantes: data.dias_restantes,
        // Segundo user para flujos que requieren segregación de funciones
        // (e.g., aprobar OC que tú no creaste).
        aprobador_user_id: seedResult.aprobadorUserId,
        aprobador_email: seedResult.aprobadorEmail,
        aprobador_password: seedResult.aprobadorPassword,
      };
    } catch (error) {
      throw new BadRequestException(`Error creando tenant demo: ${error.message}`);
    }
  }

  // ============================================================================
  // SEED OPERACIONAL — datos mínimos para que el demo sea funcional
  // ============================================================================

  /**
   * Hidrata el tenant demo con datos operativos mínimos: almacén, plan contable
   * básico, métodos de pago, caja y certificado de prueba.
   * Cada paso es independiente (allSettled) para que una falla parcial no rompa
   * los demás. Sin esto los e2e/flujos cross-module fallan por gaps de setup
   * (no por bugs).
   */
  /**
   * Resultado del seed operacional. Incluye datos del segundo user "aprobador"
   * que el flow de aprobación de OC requiere (segregación de funciones).
   */
  private async seedDemoOperationalData(
    tenantId: string,
    primerUserId: string,
  ): Promise<{ aprobadorUserId: string | null; aprobadorEmail: string | null; aprobadorPassword: string | null }> {
    let aprobadorResult: { userId: string; email: string; password: string } | null = null;
    const results = await Promise.allSettled([
      this.seedAlmacenDefault(tenantId),
      this.seedPlanContableMinimo(tenantId),
      this.seedMetodosPago(tenantId),
      this.seedCajaDefault(tenantId),
      this.seedCertificadoDemo(tenantId),
      this.seedSegundoUserAprobador(tenantId, primerUserId).then((r) => {
        aprobadorResult = r;
      }),
    ]);
    const stepNames = ['almacen', 'plan_cuentas', 'metodos_pago', 'caja', 'certificado', 'aprobador'];
    const failures = results
      .map((r, i) => ({ r, step: stepNames[i] }))
      .filter((x) => x.r.status === 'rejected');
    if (failures.length) {
      this.logger.warn(
        `[demo seed] ${failures.length}/${results.length} pasos fallaron para tenant ${tenantId}: ${failures
          .map((f) => `${f.step}=${(f.r as PromiseRejectedResult).reason?.message || 'unknown'}`)
          .join(', ')}`,
      );
    } else {
      this.logger.log(`[demo seed] tenant ${tenantId} hidratado con datos operativos completos`);
    }
    return {
      aprobadorUserId: aprobadorResult?.userId ?? null,
      aprobadorEmail: aprobadorResult?.email ?? null,
      aprobadorPassword: aprobadorResult?.password ?? null,
    };
  }

  /**
   * Crea un segundo usuario con rol ADMIN para permitir el flujo de aprobación
   * con segregación de funciones (quien crea ≠ quien aprueba).
   *
   * El RPC create_demo_tenant solo crea 1 user. El endpoint
   * /api/compras/ordenes/:id/aprobar bloquea autoaprobación: si created_by ===
   * aprobador_id, lanza 400. Sin este segundo user, todo flow que incluya
   * aprobar OC falla (compras-vertical, contabilidad-completo, sire-completo).
   */
  private async seedSegundoUserAprobador(
    tenantId: string,
    primerUserId: string,
  ): Promise<{ userId: string; email: string; password: string }> {
    void primerUserId; // referencia futura: log audit / no-op por ahora
    const aprobadorId = randomUUID();
    const tenantShort = tenantId.slice(0, 8);
    const email = `aprobador-${tenantShort}@temp.local`;
    const password = `APR${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. usuarios_sistema (auth)
    const { error: usuarioError } = await this.adminClient.from('usuarios_sistema').insert({
      id: aprobadorId,
      tenant_id: tenantId,
      nombre: 'Aprobador',
      apellido: 'Demo',
      email,
      nombre_usuario: 'aprobador',
      password_hash: passwordHash,
      activo: true,
      estado: 'ACTIVO',
      is_super_admin: false,
      is_demo_user: true,
      demo_email_temp: email,
    });
    if (usuarioError) throw new Error(`aprobador usuarios_sistema: ${usuarioError.message}`);

    // 2. users (dominio, espejo del id)
    const { error: usersError } = await this.adminClient.from('users').insert({
      id: aprobadorId,
      tenant_id: tenantId,
      email,
      nombre: 'Aprobador',
      apellido: 'Demo',
      activo: true,
      estado: 'ACTIVO',
    });
    if (usersError) throw new Error(`aprobador users: ${usersError.message}`);

    // 3. Linkar al rol ADMIN existente (RPC ya lo creó)
    const { data: adminRole, error: roleError } = await this.adminClient
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('nombre', 'ADMIN')
      .maybeSingle();
    if (roleError || !adminRole?.id) {
      throw new Error(`aprobador rol ADMIN no encontrado: ${roleError?.message || 'sin data'}`);
    }
    const { error: linkError } = await this.adminClient.from('user_roles').insert({
      usuario_sistema_id: aprobadorId,
      role_id: adminRole.id,
      tenant_id: tenantId,
    });
    if (linkError) throw new Error(`aprobador user_roles: ${linkError.message}`);

    return { userId: aprobadorId, email, password };
  }

  // Para los seeds operacionales usamos getClient() (service_role) porque las
  // tablas multi-tenant están bloqueadas para getPublicClient(). El RPC
  // create_demo_tenant ya validó tenant_id, así que es seguro.
  private get adminClient() {
    return this.supabase.getClient();
  }

  private async seedAlmacenDefault(tenantId: string): Promise<void> {
    // Importante: además de `estado` (text), las tablas multi-tenant tienen
    // `activo` (boolean) que es lo que filtran los services. Sin éste el endpoint
    // devuelve [] aunque el row exista en DB.
    const { error } = await this.adminClient.from('almacenes').insert({
      tenant_id: tenantId,
      codigo: 'ALM-PRINCIPAL',
      nombre: 'Almacén Principal',
      estado: 'ACTIVO',
      activo: true,
      es_principal: true,
    });
    if (error) throw new Error(`almacenes insert: ${error.message}`);
  }

  /**
   * Plan contable mínimo PCGE peruano (elementos 1-9). Los e2e de contabilidad
   * exigen cuentas 10, 12, 20, 40 al menos. Insertamos las 9 raíces para tener
   * estructura completa, todas con activo=true (campo que el e2e filtra).
   */
  private async seedPlanContableMinimo(tenantId: string): Promise<void> {
    const cuentas = [
      // Elementos PCGE peruano + cuentas de detalle que los e2e contables/RRHH
      // consultan explícitamente (621/627 RRHH, 411/403 planillas).
      { codigo: '10', nombre: 'Efectivo y Equivalentes de Efectivo', tipo: 'ACTIVO' },
      { codigo: '12', nombre: 'Cuentas por Cobrar Comerciales - Terceros', tipo: 'ACTIVO' },
      { codigo: '20', nombre: 'Mercaderías', tipo: 'ACTIVO' },
      { codigo: '40', nombre: 'Tributos por Pagar', tipo: 'PASIVO' },
      { codigo: '403', nombre: 'Instituciones Públicas (ESSALUD/ONP)', tipo: 'PASIVO' },
      { codigo: '411', nombre: 'Remuneraciones por Pagar', tipo: 'PASIVO' },
      { codigo: '42', nombre: 'Cuentas por Pagar Comerciales - Terceros', tipo: 'PASIVO' },
      { codigo: '50', nombre: 'Capital', tipo: 'PATRIMONIO' },
      { codigo: '60', nombre: 'Compras', tipo: 'GASTO' },
      { codigo: '621', nombre: 'Remuneraciones - Sueldos y Salarios', tipo: 'GASTO' },
      { codigo: '627', nombre: 'Servicios Prestados por Terceros', tipo: 'GASTO' },
      { codigo: '70', nombre: 'Ventas', tipo: 'INGRESO' },
      { codigo: '94', nombre: 'Gastos de Administración', tipo: 'GASTO' },
    ];
    const rows = cuentas.map((c) => ({
      tenant_id: tenantId,
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo,
      estado: 'ACTIVO',
      activo: true,
      acepta_movimiento: true,
      nivel: 2,
    }));
    const { error } = await this.adminClient.from('plan_cuentas').insert(rows);
    if (error) throw new Error(`plan_cuentas insert: ${error.message}`);
  }

  private async seedMetodosPago(tenantId: string): Promise<void> {
    const metodos = [
      { codigo: 'EFECTIVO', nombre: 'Efectivo' },
      { codigo: 'TARJETA', nombre: 'Tarjeta' },
      { codigo: 'TRANSFERENCIA', nombre: 'Transferencia bancaria' },
      { codigo: 'YAPE', nombre: 'Yape / Plin' },
    ].map((m) => ({ tenant_id: tenantId, ...m, estado: 'ACTIVO', activo: true }));
    const { error } = await this.adminClient.from('metodos_pago').insert(metodos);
    if (error) throw new Error(`metodos_pago insert: ${error.message}`);
  }

  private async seedCajaDefault(tenantId: string): Promise<void> {
    const { error } = await this.adminClient.from('cajas').insert({
      tenant_id: tenantId,
      codigo: 'CAJA-001',
      nombre: 'Caja Principal',
      estado: 'ACTIVO',
      activo: true,
    });
    if (error) throw new Error(`cajas insert: ${error.message}`);
  }

  /**
   * Carga certs/demo.pfx + PFX_PASS en empresa_config.certificado_pfx para que
   * CPE/GRE puedan firmar comprobantes en modo demo. Sin esto, todo flujo
   * fiscal falla con "Certificado digital inválido".
   * Solo aplica si PFX_PATH y PFX_PASS están configurados en .env.
   */
  private async seedCertificadoDemo(tenantId: string): Promise<void> {
    const pfxPath = process.env.PFX_PATH;
    const pfxPass = process.env.PFX_PASS;
    if (!pfxPath || !pfxPass) {
      throw new Error('PFX_PATH/PFX_PASS no configurados — skip cert seed');
    }
    // Resolver path absoluto: PFX_PATH puede ser relativo al repo root.
    const repoRoot = path.resolve(__dirname, '../../../../../..');
    const absPath = path.isAbsolute(pfxPath) ? pfxPath : path.join(repoRoot, pfxPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`PFX no encontrado en ${absPath}`);
    }
    const buffer = fs.readFileSync(absPath);
    // Validamos el cert para obtener expiry; si está roto, abortamos el seed.
    const metadata = parseCertificateBuffer(buffer, pfxPass);
    const hexValue = `\\x${buffer.toString('hex')}`;
    const { error } = await this.adminClient
      .from('empresa_config')
      .update({
        certificado_pfx: hexValue,
        certificado_password: pfxPass,
        certificado_expira_en: metadata.validTo.toISOString(),
        // RUC válido SUNAT (módulo 11): prefijo 20 + 8 dígitos + checksum.
        // El sistema valida correctamente en otros endpoints (proveedores,
        // clientes), por eso necesitamos un RUC que cumpla el algoritmo.
        // 20123456786 → suma 148, 11 - (148 mod 11) = 6 ✓
        ruc: '20123456786',
        direccion_fiscal: 'Av. Demo 123, Lima',
        configuracion_completa: true,
      })
      .eq('tenant_id', tenantId);
    if (error) throw new Error(`empresa_config update (certificado): ${error.message}`);
  }

  async getDemoStatus(tenantId: string) {
    const { data, error } = await this.client
      .from('empresa_config')
      .select('is_demo, demo_expires_at, demo_created_at, demo_conversion_attempted, plan')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) throw new NotFoundException('Tenant no encontrado');

    if (!data.is_demo) {
      return { is_demo: false, message: 'Este no es un tenant demo' };
    }

    const now = new Date();
    const expiresAt = new Date(data.demo_expires_at);
    const diasRestantes = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      is_demo: true,
      is_expired: diasRestantes <= 0,
      expires_at: data.demo_expires_at,
      created_at: data.demo_created_at,
      dias_restantes: Math.max(0, diasRestantes),
      conversion_attempted: data.demo_conversion_attempted,
      planes_disponibles: Object.values(PLANES),
      stripe_enabled: this.stripeService.isConfigured(),
    };
  }

  getPlanes() {
    return {
      planes: Object.values(PLANES).map((p) => ({
        ...p,
        facturas_mes: p.facturas_mes === -1 ? 'Ilimitado' : p.facturas_mes,
        usuarios: p.usuarios === -1 ? 'Ilimitado' : p.usuarios,
      })),
      stripe_enabled: this.stripeService.isConfigured(),
    };
  }

  /**
   * Inicia conversión - genera URL de pago Stripe o instrucciones manuales
   */
  async convertToReal(tenantId: string, dto: ConvertDemoToRealDto) {
    const status = await this.getDemoStatus(tenantId);
    if (!status.is_demo) throw new BadRequestException('Este no es un tenant demo');

    const plan = PLANES[dto.plan_id || 'basico'];
    if (!plan) throw new BadRequestException('Plan no válido');

    // Validar RUC único
    const { data: existingRuc } = await this.client
      .from('empresa_config')
      .select('tenant_id')
      .eq('ruc', dto.ruc)
      .neq('tenant_id', tenantId)
      .single();
    if (existingRuc) throw new BadRequestException('El RUC ya está registrado');

    // Validar email único
    const { data: existingEmail } = await this.client
      .from('usuarios_sistema')
      .select('id')
      .eq('email', dto.email)
      .neq('tenant_id', tenantId)
      .single();
    if (existingEmail) throw new BadRequestException('El email ya está registrado');

    // Guardar datos pendientes de conversión
    await this.client
      .from('empresa_config')
      .update({
        demo_conversion_attempted: true,
        // Guardar datos pendientes en metadata
      })
      .eq('tenant_id', tenantId);

    const monto = dto.periodo === 'anual' ? plan.precio_anual : plan.precio_mensual;

    // Si Stripe está configurado, crear sesión de checkout
    if (this.stripeService.isConfigured()) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const { url, sessionId } = await this.stripeService.createCheckoutSession({
        tenantId,
        planId: dto.plan_id || 'basico',
        periodo: dto.periodo || 'mensual',
        email: dto.email,
        razonSocial: dto.razon_social,
        ruc: dto.ruc,
        successUrl: `${baseUrl}/demo/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/demo/cancel`,
      });

      // Guardar datos para completar después del pago
      await this.client.from('demo_conversiones_pendientes').insert({
        tenant_id: tenantId,
        stripe_session_id: sessionId,
        razon_social: dto.razon_social,
        ruc: dto.ruc,
        email: dto.email,
        password_hash: await bcrypt.hash(dto.password, 10),
        telefono: dto.telefono,
        plan_id: dto.plan_id || 'basico',
        periodo: dto.periodo || 'mensual',
        monto,
        estado: 'PENDIENTE',
      });

      return {
        success: true,
        payment_url: url,
        session_id: sessionId,
        plan: plan.nombre,
        monto,
        moneda: plan.moneda,
      };
    }

    // Sin Stripe - modo manual o testing
    if (process.env.DEMO_SKIP_PAYMENT === 'true') {
      return this.completarConversion(tenantId, dto);
    }

    return {
      success: true,
      payment_pending: true,
      plan: plan.nombre,
      plan_id: plan.id,
      periodo: dto.periodo || 'mensual',
      monto,
      moneda: plan.moneda,
      datos_empresa: {
        razon_social: dto.razon_social,
        ruc: dto.ruc,
        email: dto.email,
        telefono: dto.telefono,
      },
      instrucciones: 'Contacte a ventas@erp.pe para completar el pago',
    };
  }

  /**
   * Completa la conversión después del pago (llamado por webhook)
   */
  async completarConversion(tenantId: string, dto: ConvertDemoToRealDto) {
    const authClient = this.supabase.getClient();
    const passwordHash = dto.password_hash || (await bcrypt.hash(dto.password, 10));

    try {
      const { error: empresaError } = await authClient
        .from('empresa_config')
        .update({
          razon_social: dto.razon_social,
          ruc: dto.ruc,
          telefono: dto.telefono,
          is_demo: false,
          demo_expires_at: null,
          demo_conversion_attempted: true,
          estado: 'ACTIVO',
          plan: (dto.plan_id || 'basico').toUpperCase(),
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

      if (empresaError) throw empresaError;

      const { error: usuarioError } = await authClient
        .from('usuarios_sistema')
        .update({
          email: dto.email,
          password_hash: passwordHash,
          is_demo_user: false,
          demo_email_temp: null,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('is_demo_user', true);

      if (usuarioError) throw usuarioError;

      const { data: usuario } = await authClient
        .from('usuarios_sistema')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('email', dto.email)
        .single();

      const token = this.jwtService.sign({
        sub: usuario.id,
        tenant_id: tenantId,
        email: dto.email,
        is_demo: false,
      });

      return {
        success: true,
        message: 'Cuenta activada exitosamente',
        token,
        tenant_id: tenantId,
        email: dto.email,
        plan: dto.plan_id || 'basico',
      };
    } catch (error) {
      throw new BadRequestException(`Error activando cuenta: ${error.message}`);
    }
  }

  /**
   * Procesa webhook de Stripe cuando el pago es exitoso
   */
  async procesarPagoExitoso(sessionId: string) {
    // Obtener datos de la conversión pendiente
    const { data: conversion } = await this.client
      .from('demo_conversiones_pendientes')
      .select('*')
      .eq('stripe_session_id', sessionId)
      .eq('estado', 'PENDIENTE')
      .single();

    if (!conversion) {
      throw new BadRequestException('Conversión no encontrada o ya procesada');
    }

    // Completar la conversión
    const result = await this.completarConversion(conversion.tenant_id, {
      razon_social: conversion.razon_social,
      ruc: conversion.ruc,
      email: conversion.email,
      password: '', // No se usa, usamos password_hash
      password_hash: conversion.password_hash,
      telefono: conversion.telefono,
      plan_id: conversion.plan_id,
      periodo: conversion.periodo,
    });

    // Marcar como completada
    await this.client
      .from('demo_conversiones_pendientes')
      .update({ estado: 'COMPLETADA', completed_at: new Date().toISOString() })
      .eq('stripe_session_id', sessionId);

    return result;
  }
}
