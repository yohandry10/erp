import { EmailTemplate } from '../interfaces/email-config.interface';

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

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a ${data.appName}</title>
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
    .credentials-box {
      background-color: #f8f9fa;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 24px;
      margin: 24px 0;
    }
    .credentials-box h3 {
      color: #667eea;
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 18px;
    }
    .credential-item {
      margin: 12px 0;
      padding: 12px;
      background-color: #ffffff;
      border-radius: 6px;
      border-left: 4px solid #667eea;
    }
    .credential-label {
      font-weight: 600;
      color: #6c757d;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .credential-value {
      font-size: 16px;
      color: #333;
      font-family: 'Courier New', monospace;
      word-break: break-all;
    }
    .password-value {
      font-size: 20px;
      font-weight: 700;
      color: #667eea;
      letter-spacing: 2px;
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
      <h1>👋 Bienvenido a ${data.appName}</h1>
    </div>
    
    <div class="content">
      <h2>Hola ${data.userName},</h2>
      
      <p>
        Tu cuenta ha sido creada exitosamente en <strong>${data.appName}</strong>. 
        Ahora puedes acceder al sistema usando las siguientes credenciales temporales:
      </p>
      
      <div class="credentials-box">
        <h3>🔑 Tus Credenciales de Acceso</h3>
        
        <div class="credential-item">
          <div class="credential-label">Email / Usuario</div>
          <div class="credential-value">${data.userEmail}</div>
        </div>
        
        <div class="credential-item">
          <div class="credential-label">Contraseña Temporal</div>
          <div class="credential-value password-value">${data.temporaryPassword}</div>
        </div>
      </div>
      
      <div class="warning-box">
        <p>
          ⚠️ <strong>IMPORTANTE:</strong> Esta es una contraseña temporal. 
          Por seguridad, te recomendamos cambiar tu contraseña inmediatamente después de iniciar sesión por primera vez.
        </p>
      </div>
      
      <div class="button-container">
        <a href="${data.loginUrl}" class="button">Iniciar Sesión Ahora</a>
      </div>
      
      <p style="font-size: 14px; color: #6c757d;">
        Si el botón no funciona, copia y pega este enlace en tu navegador:
      </p>
      <p style="word-break: break-all; font-size: 13px; color: #667eea; background-color: #f8f9fa; padding: 12px; border-radius: 4px;">
        ${data.loginUrl}
      </p>
      
      <hr class="divider">
      
      <div class="info-box">
        <p>
          💡 <strong>Primeros pasos:</strong><br>
          Después de iniciar sesión, te recomendamos:
        </p>
        <ul style="margin-top: 8px; padding-left: 20px; color: #0c5460;">
          <li>Cambiar tu contraseña temporal por una contraseña segura</li>
          <li>Completar tu perfil de usuario</li>
          <li>Explorar las funcionalidades disponibles</li>
        </ul>
      </div>
      
      <p style="margin-top: 24px; font-size: 14px; color: #6c757d;">
        Por tu seguridad, te recomendamos:
      </p>
      <ul style="color: #6c757d; font-size: 14px; margin-top: 8px;">
        <li>Usar una contraseña fuerte con al menos 8 caracteres</li>
        <li>Incluir mayúsculas, minúsculas, números y símbolos especiales</li>
        <li>No compartir tus credenciales con nadie</li>
        <li>Cambiar tu contraseña periódicamente</li>
      </ul>
    </div>
    
    <div class="footer">
      <p>
        Si tienes alguna pregunta o necesitas ayuda, contáctanos en 
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
Hola ${data.userName},

Tu cuenta ha sido creada exitosamente en ${data.appName}.

TUS CREDENCIALES DE ACCESO:

Email / Usuario: ${data.userEmail}
Contraseña Temporal: ${data.temporaryPassword}

IMPORTANTE: Esta es una contraseña temporal. Por seguridad, te recomendamos cambiar tu contraseña inmediatamente después de iniciar sesión por primera vez.

Inicia sesión aquí: ${data.loginUrl}

PRIMEROS PASOS:
- Cambiar tu contraseña temporal por una contraseña segura
- Completar tu perfil de usuario
- Explorar las funcionalidades disponibles

RECOMENDACIONES DE SEGURIDAD:
- Usar una contraseña fuerte con al menos 8 caracteres
- Incluir mayúsculas, minúsculas, números y símbolos especiales
- No compartir tus credenciales con nadie
- Cambiar tu contraseña periódicamente

Si tienes alguna pregunta o necesitas ayuda, contáctanos en ${data.supportEmail}

---
© ${new Date().getFullYear()} ${data.appName}. Todos los derechos reservados.
${data.appUrl}
  `.trim();

  return { subject, html, text };
}

