import { EmailTemplate } from '../interfaces/email-config.interface';

export interface PasswordResetTemplateData {
  userName: string;
  resetLink: string;
  expirationHours: number;
  supportEmail: string;
  appName: string;
  appUrl: string;
}

export function generatePasswordResetEmail(data: PasswordResetTemplateData): EmailTemplate {
  const subject = `${data.appName} - Restablecer contraseña`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecer Contraseña</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .content h2 {
      color: #333;
      font-size: 22px;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .content p {
      margin: 16px 0;
      color: #555;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .warning-box {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .warning-box p {
      margin: 0;
      color: #856404;
      font-size: 14px;
    }
    .info-box {
      background-color: #e7f3ff;
      border-left: 4px solid #2196f3;
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .info-box p {
      margin: 0;
      color: #0c5460;
      font-size: 14px;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 30px;
      text-align: center;
      border-top: 1px solid #e9ecef;
    }
    .footer p {
      margin: 8px 0;
      color: #6c757d;
      font-size: 13px;
    }
    .footer a {
      color: #667eea;
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    .divider {
      border: none;
      border-top: 1px solid #e9ecef;
      margin: 24px 0;
    }
    @media only screen and (max-width: 600px) {
      .container {
        margin: 20px 10px;
      }
      .header {
        padding: 30px 20px;
      }
      .header h1 {
        font-size: 24px;
      }
      .content {
        padding: 30px 20px;
      }
      .button {
        padding: 12px 24px;
        font-size: 15px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Restablecer Contraseña</h1>
    </div>
    
    <div class="content">
      <h2>Hola ${data.userName},</h2>
      
      <p>
        Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>${data.appName}</strong>.
      </p>
      
      <p>
        Si fuiste tú quien solicitó este cambio, haz clic en el botón de abajo para crear una nueva contraseña:
      </p>
      
      <div class="button-container">
        <a href="${data.resetLink}" class="button">Restablecer mi contraseña</a>
      </div>
      
      <div class="info-box">
        <p>
          ⏰ <strong>Este enlace expirará en ${data.expirationHours} horas.</strong> Después de este tiempo, deberás solicitar un nuevo enlace de restablecimiento.
        </p>
      </div>
      
      <p style="font-size: 14px; color: #6c757d;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </p>
      <p style="word-break: break-all; font-size: 13px; color: #667eea; background-color: #f8f9fa; padding: 12px; border-radius: 4px;">
        ${data.resetLink}
      </p>
      
      <hr class="divider">
      
      <div class="warning-box">
        <p>
          ⚠️ <strong>¿No solicitaste este cambio?</strong><br>
          Si no fuiste tú quien solicitó restablecer la contraseña, puedes ignorar este correo de forma segura. Tu contraseña actual no será modificada y tu cuenta permanecerá protegida.
        </p>
      </div>
      
      <p style="margin-top: 24px; font-size: 14px; color: #6c757d;">
        Por tu seguridad, te recomendamos:
      </p>
      <ul style="color: #6c757d; font-size: 14px; margin-top: 8px;">
        <li>Usar una contraseña fuerte con al menos 8 caracteres</li>
        <li>Incluir mayúsculas, minúsculas, números y símbolos especiales</li>
        <li>No reutilizar contraseñas de otras cuentas</li>
        <li>Cambiar tu contraseña periódicamente</li>
      </ul>
    </div>
    
    <div class="footer">
      <p>
        Si necesitas ayuda, contáctanos en 
        <a href="mailto:${data.supportEmail}">${data.supportEmail}</a>
      </p>
      <p style="margin-top: 16px;">
        © ${new Date().getFullYear()} ${data.appName}. Todos los derechos reservados.
      </p>
      <p>
        <a href="${data.appUrl}" style="color: #667eea;">Visitar ${data.appName}</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Restablecer contraseña

Hola ${data.userName},

Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en ${data.appName}.

Si fuiste tú quien solicitó este cambio, usa el siguiente enlace para crear una nueva contraseña:

${data.resetLink}

IMPORTANTE: Este enlace expirará en ${data.expirationHours} horas.

¿No solicitaste este cambio?
Si no fuiste tú quien solicitó restablecer la contraseña, puedes ignorar este correo de forma segura. Tu contraseña actual no será modificada.

Recomendaciones de seguridad:
- Usar una contraseña fuerte con al menos 8 caracteres
- Incluir mayúsculas, minúsculas, números y símbolos especiales
- No reutilizar contraseñas de otras cuentas
- Cambiar tu contraseña periódicamente

Si necesitas ayuda, contáctanos en ${data.supportEmail}

---
© ${new Date().getFullYear()} ${data.appName}. Todos los derechos reservados.
${data.appUrl}
  `.trim();

  return { subject, html, text };
}

