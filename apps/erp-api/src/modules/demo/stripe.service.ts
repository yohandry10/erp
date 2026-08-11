import { Injectable, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe | null = null;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    }
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  /**
   * Crea una sesión de checkout de Stripe
   */
  async createCheckoutSession(params: {
    tenantId: string;
    planId: string;
    periodo: string;
    monto: number;
    moneda: string;
    mesesPagados: number;
    mesesBonificados: number;
    mesesServicio: number;
    email: string;
    razonSocial: string;
    ruc: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe no está configurado. Configure STRIPE_SECRET_KEY');
    }

    if (!Number.isFinite(params.monto) || params.monto <= 0) {
      throw new BadRequestException('El monto comercial no es válido');
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        // Los contratos son paquetes prepagados con meses bonificados. Un cobro
        // único evita que Stripe renueve antes de consumir la bonificación; la
        // vigencia se gobierna por el snapshot durable confirmado en PostgreSQL.
        mode: 'payment',
        customer_email: params.email,
        line_items: [
          {
            price_data: {
              currency: params.moneda.toLowerCase(),
              unit_amount: Math.round(params.monto * 100),
              product_data: {
                name: `ERP ${params.planId} - ${params.periodo}`,
                description: `${params.mesesPagados} meses pagados + ${params.mesesBonificados} meses bonificados (${params.mesesServicio} meses de servicio)`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          tenant_id: params.tenantId,
          plan_id: params.planId,
          periodo: params.periodo,
          razon_social: params.razonSocial,
          ruc: params.ruc,
          meses_pagados: String(params.mesesPagados),
          meses_bonificados: String(params.mesesBonificados),
          meses_servicio: String(params.mesesServicio),
        },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      });

      return {
        url: session.url!,
        sessionId: session.id,
      };
    } catch (error) {
      throw new BadRequestException(`Error creando sesión de pago: ${error.message}`);
    }
  }

  /**
   * Verifica la firma del webhook de Stripe
   */
  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) {
      throw new BadRequestException('Stripe no está configurado');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET no configurado');
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      throw new BadRequestException(`Webhook signature verification failed: ${error.message}`);
    }
  }

  /**
   * Obtiene los detalles de una sesión de checkout
   */
  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe no está configurado');
    }

    return this.stripe.checkout.sessions.retrieve(sessionId);
  }
}
