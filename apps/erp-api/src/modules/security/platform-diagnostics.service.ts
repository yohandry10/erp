import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../shared/email/email.service';
import { sendDiagnosticEvent } from '../../shared/observability/sentry';

/**
 * Comprobaciones que un superadmin dispara para confirmar, en el despliegue en
 * curso, que el correo saliente y la captura de errores llegan a su destino.
 */
@Injectable()
export class PlatformDiagnosticsService {
  constructor(
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  private remitente(): string {
    return String(this.config.get<string>('EMAIL_FROM_ADDRESS') ?? '').trim().toLowerCase();
  }

  async enviarCorreoPrueba(destinatario: string) {
    const remitente = this.remitente();
    const dominio = remitente.split('@')[1];
    const destino = destinatario.trim().toLowerCase();
    // Sólo al dominio del remitente: la prueba no puede usarse como relay hacia
    // direcciones ajenas a la organización que opera el ERP.
    if (!dominio || destino.split('@')[1] !== dominio) {
      throw new BadRequestException(`El correo de prueba sólo se envía a direcciones de ${dominio || 'el dominio del remitente configurado'}`);
    }
    if (!this.emailService.isConfigured()) {
      throw new ServiceUnavailableException('El correo saliente no está configurado en este despliegue');
    }
    const enviadoEn = new Date().toISOString();
    const enviado = await this.emailService.sendEmail({
      to: destino,
      subject: 'Prueba de correo saliente del ERP',
      text: `Este correo confirma que el ERP envía correo desde ${remitente}. Enviado ${enviadoEn}.`,
      html: `<p>Este correo confirma que el ERP envía correo desde <strong>${remitente}</strong>.</p><p>Enviado ${enviadoEn}.</p>`,
    });
    if (!enviado) {
      throw new ServiceUnavailableException('El servidor de correo rechazó el envío; revisar los registros del API');
    }
    return { success: true, data: { destinatario: destino, remitente, enviado_en: enviadoEn } };
  }

  async enviarEventoSentry() {
    const resultado = await sendDiagnosticEvent();
    if (!resultado) {
      throw new ServiceUnavailableException('La captura de errores no está configurada en este despliegue');
    }
    if (!resultado.delivered) {
      throw new ServiceUnavailableException('Sentry no confirmó la recepción del evento en 5 s');
    }
    return {
      success: true,
      data: {
        event_id: resultado.eventId,
        tipo: 'PlatformDiagnosticError',
        entorno: this.config.get<string>('SENTRY_ENVIRONMENT') || 'production',
        release: this.config.get<string>('APP_COMMIT_SHA') || null,
      },
    };
  }
}
