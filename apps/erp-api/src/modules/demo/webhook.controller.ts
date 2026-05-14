import { Controller, Post, Req, Res, Headers, RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { DemoService } from './demo.service';
import { StripeService } from './stripe.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly demoService: DemoService,
    private readonly stripeService: StripeService,
  ) {}

  @Post('stripe')
  @Public()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Webhook de Stripe para procesar pagos' })
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!this.stripeService.isConfigured()) {
      return res.status(400).json({ error: 'Stripe no configurado' });
    }

    try {
      const event = this.stripeService.verifyWebhookSignature(req.rawBody!, signature);

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          
          // Solo procesar si el pago fue exitoso
          if (session.payment_status === 'paid') {
            await this.demoService.procesarPagoExitoso(session.id);
            console.log(`✅ Pago procesado para sesión: ${session.id}`);
          }
          break;
        }

        case 'customer.subscription.created': {
          // Suscripción creada - ya procesado en checkout.session.completed
          console.log('📝 Suscripción creada:', event.data.object);
          break;
        }

        case 'invoice.paid': {
          // Factura pagada (renovaciones)
          console.log('💰 Factura pagada:', event.data.object);
          break;
        }

        case 'customer.subscription.deleted': {
          // Suscripción cancelada
          console.log('❌ Suscripción cancelada:', event.data.object);
          // TODO: Marcar tenant como inactivo
          break;
        }

        default:
          console.log(`⚠️ Evento no manejado: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('❌ Error procesando webhook:', error.message);
      return res.status(400).json({ error: error.message });
    }
  }
}
