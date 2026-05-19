import { EmailTemplate } from '../interfaces/email-config.interface';
import { escapeHtml, escapeUrl } from './sanitize';

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

  const userName = escapeHtml(data.userName);
  const appName = escapeHtml(data.appName);
  const resetLink = escapeUrl(data.resetLink);
  const supportEmail = escapeHtml(data.supportEmail);
  const appUrl = escapeUrl(data.appUrl);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecer Contraseña</title>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Restablecer Contraseña</h1>
    </div>
    
    <div class="content">
      <h2>Hola ${userName},</h2>
      
      <p>
        Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>${appName}</strong>.
      </p>
      
      <p>
        Si fuiste tú quien solicitó este cambio, haz clic en el botón de abajo para crear una nueva contraseña:
      </p>
      
      <div class="button-container">
        <a href="${resetLink}" class="button">Restablecer mi contraseña</a>
      </div>
      
      <div class="info-box">
        <p>
          ⏰ <strong>Este enlace expirará en ${data.expirationHours} horas.</strong> Después de este tiempo, deberás solicitar un nuevo enlace de restablecimiento.
        </p>
      </div>
      
      <p>
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </p>
      <p>
        ${resetLink}
      </p>
      
      <hr class="divider">
      
      <div class="warning-box">
        <p>
          ⚠️ <strong>¿No solicitaste este cambio?</strong><br>
          Si no fuiste tú quien solicitó restablecer la contraseña, puedes ignorar este correo de forma segura. Tu contraseña actual no será modificada y tu cuenta permanecerá protegida.
        </p>
      </div>
      
      <p>
        Por tu seguridad, te recomendamos:
      </p>
      <ul>
        <li>Usar una contraseña fuerte con al menos 8 caracteres</li>
        <li>Incluir mayúsculas, minúsculas, números y símbolos especiales</li>
        <li>No reutilizar contraseñas de otras cuentas</li>
        <li>Cambiar tu contraseña periódicamente</li>
      </ul>
    </div>
    
    <div class="footer">
      <p>
        Si necesitas ayuda, contáctanos en 
        <a href="mailto:${supportEmail}">${supportEmail}</a>
      </p>
      <p>
        © ${new Date().getFullYear()} ${appName}. Todos los derechos reservados.
      </p>
      <p>
        <a href="${appUrl}">Visitar ${appName}</a>
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

${resetLink}

IMPORTANTE: Este enlace expirará en ${data.expirationHours} horas.

¿No solicitaste este cambio?
Si no fuiste tú quien solicitó restablecer la contraseña, puedes ignorar este correo de forma segura. Tu contraseña actual no será modificada.

Recomendaciones de seguridad:
- Usar una contraseña fuerte con al menos 8 caracteres
- Incluir mayúsculas, minúsculas, números y símbolos especiales
- No reutilizar contraseñas de otras cuentas
- Cambiar tu contraseña periódicamente

Si necesitas ayuda, contáctanos en ${supportEmail}

---
© ${new Date().getFullYear()} ${appName}. Todos los derechos reservados.
${appUrl}
  `.trim();

  return { subject, html, text };
}

