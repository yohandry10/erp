import { Injectable, BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';

const PLANES_STRIPE = {
  basico: {
    mensual: process.env.STRIPE_PRICE_BASICO_MENSUAL || 'price_basico_mensual',
    anual: process.env.STRIPE_PRICE_BASICO_ANUAL || 'price_basico_anual',
  },
  profesional: {
    mensual: process.env.STRIPE_PRICE_PROFESIONAL_MENSUAL || 'price_profesional_mensual',
    anual: process.env.STRIPE_PRICE_PROFESIONAL_ANUAL || 'price_profesional_anual',
  },
  enterprise: {
    mensual: process.env.STRIPE_PRICE_ENTERPRISE_MENSUAL || 'price_enterprise_mensual',
    anual: process.env.STRIPE_PRICE_ENTERPRISE_ANUAL || 'price_enterprise_anual',
  },
};

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
    email: string;
    razonSocial: string;
    ruc: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; sessionId: string }> {
    if (!this.stripe) {
      throw new BadRequestException('Stripe no está configurado. Configure STRIPE_SECRET_KEY');
    }

    const priceId = PLANES_STRIPE[params.planId]?.[params.periodo];
    if (!priceId) {
      throw new BadRequestException(`Plan ${params.planId} con periodo ${params.periodo} no encontrado`);
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: params.email,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: {
          tenant_id: params.tenantId,
          plan_id: params.planId,
          periodo: params.periodo,
          razon_social: params.razonSocial,
          ruc: params.ruc,
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
