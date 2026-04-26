import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateDemoTenantDto, ConvertDemoToRealDto } from './dto/create-demo-tenant.dto';
import { StripeService } from './stripe.service';

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
  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly stripeService: StripeService,
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
      };
    } catch (error) {
      throw new BadRequestException(`Error creando tenant demo: ${error.message}`);
    }
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
