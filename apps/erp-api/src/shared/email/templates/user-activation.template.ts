import { EmailTemplate } from '../interfaces/email-config.interface';
import { escapeHtml, escapeUrl } from './sanitize';

export interface UserActivationTemplateData {
  userName: string;
  userEmail: string;
  temporaryPassword: string;
  loginUrl: string;
  supportEmail: string;
  appName: string;
  appUrl: string;
}

export function generateUserActivationEmail(data: UserActivationTemplateData): EmailTemplate {
  const subject = `${data.appName} - Bienvenido, tu cuenta ha sido creada`;

  const userName = escapeHtml(data.userName);
  const userEmail = escapeHtml(data.userEmail);
  const temporaryPassword = escapeHtml(data.temporaryPassword);
  const appName = escapeHtml(data.appName);
  const loginUrl = escapeUrl(data.loginUrl);
  const supportEmail = escapeHtml(data.supportEmail);
  const appUrl = escapeUrl(data.appUrl);

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a ${appName}</title>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👋 Bienvenido a ${appName}</h1>
    </div>
    
    <div class="content">
      <h2>Hola ${userName},</h2>
      
      <p>
        Tu cuenta ha sido creada exitosamente en <strong>${appName}</strong>. 
        Ahora puedes acceder al sistema usando las siguientes credenciales temporales:
      </p>
      
      <div class="credentials-box">
        <h3>🔑 Tus Credenciales de Acceso</h3>
        
        <div class="credential-item">
          <div class="credential-label">Email / Usuario</div>
          <div class="credential-value">${userEmail}</div>
        </div>
        
        <div class="credential-item">
          <div class="credential-label">Contraseña Temporal</div>
          <div class="credential-value password-value">${temporaryPassword}</div>
        </div>
      </div>
      
      <div class="warning-box">
        <p>
          ⚠️ <strong>IMPORTANTE:</strong> Esta es una contraseña temporal. 
          Por seguridad, te recomendamos cambiar tu contraseña inmediatamente después de iniciar sesión por primera vez.
        </p>
      </div>
      
      <div class="button-container">
        <a href="${loginUrl}" class="button">Iniciar Sesión Ahora</a>
      </div>
      
      <p>
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </p>
      <p>
        ${loginUrl}
      </p>
      
      <hr class="divider">
      
      <div class="info-box">
        <p>
          💡 <strong>Primeros pasos:</strong><br>
          Después de iniciar sesión, te recomendamos:
        </p>
        <ul>
          <li>Cambiar tu contraseña temporal por una contraseña segura</li>
          <li>Completar tu perfil de usuario</li>
          <li>Explorar las funcionalidades disponibles</li>
        </ul>
      </div>
      
      <p>
        Por tu seguridad, te recomendamos:
      </p>
      <ul>
        <li>Usar una contraseña fuerte con al menos 8 caracteres</li>
        <li>Incluir mayúsculas, minúsculas, números y símbolos especiales</li>
        <li>No compartir tus credenciales con nadie</li>
        <li>Cambiar tu contraseña periódicamente</li>
      </ul>
    </div>
    
    <div class="footer">
      <p>
        Si tienes alguna pregunta o necesitas ayuda, contáctanos en 
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
Hola ${data.userName},

Tu cuenta ha sido creada exitosamente en ${data.appName}.

TUS CREDENCIALES DE ACCESO:

Email / Usuario: ${data.userEmail}
Contraseña Temporal: ${data.temporaryPassword}

IMPORTANTE: Esta es una contraseña temporal. Por seguridad, te recomendamos cambiar tu contraseña inmediatamente después de iniciar sesión por primera vez.

Inicia sesión aquí: ${loginUrl}

PRIMEROS PASOS:
- Cambiar tu contraseña temporal por una contraseña segura
- Completar tu perfil de usuario
- Explorar las funcionalidades disponibles

RECOMENDACIONES DE SEGURIDAD:
- Usar una contraseña fuerte con al menos 8 caracteres
- Incluir mayúsculas, minúsculas, números y símbolos especiales
- No compartir tus credenciales con nadie
- Cambiar tu contraseña periódicamente

Si tienes alguna pregunta o necesitas ayuda, contáctanos en ${supportEmail}

---
© ${new Date().getFullYear()} ${appName}. Todos los derechos reservados.
${appUrl}
  `.trim();

  return { subject, html, text };
}

