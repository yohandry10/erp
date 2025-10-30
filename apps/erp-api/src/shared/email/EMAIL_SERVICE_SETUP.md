## 📧 Email Service - Configuración y Uso

## 📋 Tabla de Contenidos

1. [Introducción](#introducción)
2. [Proveedores Soportados](#proveedores-soportados)
3. [Configuración por Proveedor](#configuración-por-proveedor)
4. [Uso del Servicio](#uso-del-servicio)
5. [Plantillas Disponibles](#plantillas-disponibles)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Introducción

El servicio de email del ERP soporta múltiples proveedores y está diseñado para ser robusto, con:

- ✅ Soporte multi-proveedor (SendGrid, AWS SES, SMTP genérico)
- ✅ Retry logic automático (3 intentos con exponential backoff)
- ✅ Logging completo de todos los intentos
- ✅ Plantillas HTML profesionales y responsivas
- ✅ Fallback a texto plano
- ✅ Configuración por variables de entorno

---

## 🔌 Proveedores Soportados

### 1. SendGrid (Recomendado para Producción)

**Pros:**
- ✅ Alta deliverability
- ✅ Analytics detallados
- ✅ API simple y confiable
- ✅ Free tier: 100 emails/día

**Cons:**
- ❌ Requiere cuenta y API key

**Cuándo usar:** Producción con volumen medio-alto de emails

---

### 2. AWS SES (Recomendado para Alta Escala)

**Pros:**
- ✅ Muy económico ($0.10 por 1000 emails)
- ✅ Alta escalabilidad
- ✅ Integración con AWS

**Cons:**
- ❌ Configuración más compleja
- ❌ Requiere verificación de dominios
- ❌ Sandbox mode inicial (requiere solicitar producción)

**Cuándo usar:** Producción con alto volumen o ya usando AWS

---

### 3. SMTP Genérico (Recomendado para Development)

**Pros:**
- ✅ Compatible con cualquier servidor SMTP
- ✅ Fácil de configurar
- ✅ Ideal para testing (Mailtrap, MailHog)

**Cons:**
- ❌ Puede tener problemas de deliverability
- ❌ Requiere gestión del servidor SMTP

**Cuándo usar:** Development, testing, o servidores SMTP propios

---

## ⚙️ Configuración por Proveedor

### Opción 1: SendGrid

#### Paso 1: Obtener API Key

1. Crear cuenta en [SendGrid](https://sendgrid.com/)
2. Ir a Settings → API Keys
3. Crear nuevo API key con permisos de "Mail Send"

#### Paso 2: Configurar `.env`

```env
EMAIL_PROVIDER=sendgrid
EMAIL_FROM_ADDRESS=noreply@tudominio.com
EMAIL_FROM_NAME=Tu Empresa
SUPPORT_EMAIL=soporte@tudominio.com

SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Paso 3: Verificar dominio (Producción)

Para mejor deliverability, verifica tu dominio en SendGrid:
1. Settings → Sender Authentication
2. Authenticate Your Domain
3. Seguir instrucciones para agregar registros DNS

---

### Opción 2: AWS SES

#### Paso 1: Configurar AWS SES

1. Ir a AWS Console → SES
2. Verificar email o dominio
3. Solicitar salir de Sandbox mode (para emails a cualquier destinatario)
4. Crear SMTP credentials

#### Paso 2: Configurar `.env`

```env
EMAIL_PROVIDER=aws-ses
EMAIL_FROM_ADDRESS=noreply@tudominio.com
EMAIL_FROM_NAME=Tu Empresa
SUPPORT_EMAIL=soporte@tudominio.com

AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

---

### Opción 3: SMTP (Gmail)

#### Paso 1: Habilitar App Password en Gmail

1. Ir a Google Account → Security
2. Habilitar 2-Step Verification
3. App passwords → Generate password para "Mail"

#### Paso 2: Configurar `.env`

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM_ADDRESS=tu-email@gmail.com
EMAIL_FROM_NAME=Tu Nombre
SUPPORT_EMAIL=soporte@tudominio.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx  # App password de 16 caracteres
```

---

### Opción 4: SMTP (Mailtrap - Para Testing)

#### Paso 1: Obtener credenciales

1. Crear cuenta en [Mailtrap](https://mailtrap.io/)
2. Ir a Inbox → SMTP Settings
3. Copiar credenciales

#### Paso 2: Configurar `.env`

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM_ADDRESS=test@example.com
EMAIL_FROM_NAME=Test Sender
SUPPORT_EMAIL=support@example.com

SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=xxxxxxxxxxxxx
SMTP_PASS=xxxxxxxxxxxxx
```

---

## 💻 Uso del Servicio

### 1. Inyectar el servicio

```typescript
import { EmailService } from '../../shared/email/email.service';

@Injectable()
export class YourService {
  constructor(private readonly emailService: EmailService) {}
}
```

### 2. Enviar email de password reset

```typescript
const emailSent = await this.emailService.sendPasswordResetEmail(
  'usuario@ejemplo.com',     // Email del destinatario
  'Juan Pérez',              // Nombre del usuario
  'token-de-reset-64-chars', // Token de reset
  '192.168.1.100'           // IP del cliente (opcional)
);

if (emailSent) {
  console.log('Email enviado exitosamente');
} else {
  console.error('Error enviando email');
}
```

### 3. Enviar email de confirmación de reset

```typescript
await this.emailService.sendPasswordResetConfirmationEmail(
  'usuario@ejemplo.com',
  'Juan Pérez',
  '192.168.1.100'
);
```

### 4. Enviar email genérico

```typescript
const sent = await this.emailService.sendEmail({
  to: 'destinatario@ejemplo.com',
  subject: 'Asunto del email',
  html: '<h1>Hola!</h1><p>Este es un email HTML</p>',
  text: 'Hola! Este es un email en texto plano',
  attachments: [
    {
      filename: 'documento.pdf',
      content: pdfBuffer,
      contentType: 'application/pdf'
    }
  ]
});
```

### 5. Verificar configuración

```typescript
const isConfigured = await this.emailService.verifyConfiguration();
if (!isConfigured) {
  console.error('Email service no está configurado correctamente');
}

const info = this.emailService.getConfigInfo();
console.log(info);
// { provider: 'smtp', configured: true, from: 'ERP System <noreply@erp.com>' }
```

---

## 📝 Plantillas Disponibles

### Password Reset Email

**Características:**
- ✅ Diseño moderno con gradiente
- ✅ Botón call-to-action destacado
- ✅ Warning box para seguridad
- ✅ Responsivo (mobile-friendly)
- ✅ Fallback a texto plano
- ✅ Link alternativo si botón no funciona

**Preview:**

```typescript
import { generatePasswordResetEmail } from './templates/password-reset.template';

const email = generatePasswordResetEmail({
  userName: 'Juan Pérez',
  resetLink: 'https://app.com/reset?token=...',
  expirationHours: 24,
  supportEmail: 'soporte@erp.com',
  appName: 'ERP System',
  appUrl: 'https://app.com'
});

// email.subject: "ERP System - Restablecer contraseña"
// email.html: HTML completo con estilos inline
// email.text: Versión texto plano
```

---

## 🧪 Testing

### Opción 1: Mailtrap (Recomendado)

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
```

**Ventajas:**
- Captura todos los emails sin enviarlos realmente
- Preview HTML en el dashboard
- Testing de spam score
- Validación de HTML

### Opción 2: MailHog (Local)

1. Instalar MailHog:
```bash
# macOS
brew install mailhog
mailhog

# Docker
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

2. Configurar `.env`:
```env
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
```

3. Ver emails en: http://localhost:8025

### Opción 3: Tests Unitarios

```typescript
// email.service.spec.ts
describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                EMAIL_PROVIDER: 'smtp',
                EMAIL_FROM_ADDRESS: 'test@example.com',
                EMAIL_FROM_NAME: 'Test',
                SMTP_HOST: 'localhost',
                SMTP_PORT: 1025,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  it('should send password reset email', async () => {
    const sent = await service.sendPasswordResetEmail(
      'user@example.com',
      'Test User',
      'a'.repeat(64),
      '127.0.0.1'
    );

    expect(sent).toBe(true);
  });
});
```

---

## 🔍 Troubleshooting

### Problema: "Email service not configured"

**Causa:** Variables de entorno faltantes o incorrectas

**Solución:**
1. Verificar que `.env` existe y tiene las variables correctas
2. Reiniciar el servidor después de cambiar `.env`
3. Verificar logs al iniciar:
```
[EmailService] Email service initialized with provider: smtp
```

---

### Problema: "Failed to send email after 3 attempts"

**Causa:** Credenciales incorrectas o problemas de red

**Solución:**

#### Para SendGrid:
```bash
# Verificar API key
curl -X POST https://api.sendgrid.com/v3/mail/send \
  -H "Authorization: Bearer SG.your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"personalizations":[{"to":[{"email":"test@example.com"}]}],"from":{"email":"from@example.com"},"subject":"Test","content":[{"type":"text/plain","value":"Test"}]}'
```

#### Para SMTP:
```bash
# Test de conexión SMTP (requiere netcat)
nc -zv smtp.gmail.com 587

# O con telnet
telnet smtp.gmail.com 587
```

#### Para AWS SES:
```bash
# Verificar credenciales AWS
aws ses verify-email-identity --email-address test@example.com --region us-east-1
```

---

### Problema: Emails van a spam

**Soluciones:**

1. **Verificar dominio** (SPF, DKIM, DMARC):
```dns
# SPF
example.com. TXT "v=spf1 include:sendgrid.net ~all"

# DKIM (SendGrid provee las keys)
# Seguir instrucciones de SendGrid

# DMARC
_dmarc.example.com. TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com"
```

2. **Usar dominio personalizado** en lugar de @gmail.com

3. **Evitar palabras spam** en subject y contenido

4. **Usar from address verificado** del mismo dominio

---

### Problema: Gmail bloquea emails

**Causa:** Gmail requiere "App Password" con 2FA

**Solución:**
1. Habilitar 2-Step Verification en Google Account
2. Generar App Password específico para "Mail"
3. Usar ese password de 16 caracteres en `SMTP_PASS`

---

### Problema: Rate limiting / Too many requests

**Causa:** Límites del proveedor excedidos

**Solución:**

| Proveedor | Free Tier Limit | Solución |
|-----------|-----------------|----------|
| SendGrid | 100/día | Upgrade a plan pagado |
| AWS SES | 62,000/mes en free tier | Upgrade o esperar reset mensual |
| Gmail | 500/día | Usar servicio dedicado |

---

## 📊 Monitoreo y Logs

### Logs de Email Service

El servicio registra automáticamente:

```typescript
// Inicio del servicio
[EmailService] Email service initialized with provider: smtp

// Email enviado exitosamente
[EmailService] Email sent successfully to user@example.com (messageId: <abc123@mail.com>, attempt: 1)

// Reintento
[EmailService] Failed to send email to user@example.com (attempt 1/3): Connection timeout

// Fallo completo
[EmailService] Failed to send email to user@example.com after 3 attempts: Connection refused
```

### Logs de Password Reset

```typescript
// Generación de token
[AuthService] Password reset token generated for user: user@example.com from IP: 192.168.1.1, expires: 2025-10-31T12:00:00.000Z

// Email enviado
[EmailService] Sending password reset email to user@example.com from IP: 192.168.1.1
[EmailService] Password reset email sent successfully to user@example.com from IP: 192.168.1.1

// Email fallido
[EmailService] Failed to send password reset email to user@example.com from IP: 192.168.1.1
[AuthService] Failed to send password reset email to user@example.com. Token generated but not delivered.
```

---

## 🚀 Mejores Prácticas

### 1. No Exponer Tokens
```typescript
// ❌ MAL
return { token: resetToken };

// ✅ BIEN
await emailService.sendPasswordResetEmail(...);
return { message: 'Email enviado' };
```

### 2. Logging Adecuado
```typescript
// ✅ BIEN
this.logger.log(`Email sent to ${email} from IP: ${ip}`);
this.logger.error(`Failed to send email: ${error.message}`, error.stack);
```

### 3. Graceful Degradation
```typescript
const sent = await this.emailService.sendEmail(...);
if (!sent) {
  // No throw - permitir que la app continúe
  this.logger.warn('Email not sent, but operation completed');
}
```

### 4. Testing en CI/CD
```yaml
# .github/workflows/test.yml
env:
  EMAIL_PROVIDER: smtp
  SMTP_HOST: localhost
  SMTP_PORT: 1025
  
services:
  mailhog:
    image: mailhog/mailhog
    ports:
      - 1025:1025
      - 8025:8025
```

---

## 📚 Referencias

- [Nodemailer Documentation](https://nodemailer.com/)
- [SendGrid API Docs](https://docs.sendgrid.com/)
- [AWS SES Developer Guide](https://docs.aws.amazon.com/ses/)
- [Email HTML Best Practices](https://www.campaignmonitor.com/css/)
- [SPF/DKIM/DMARC Setup](https://www.dmarcanalyzer.com/how-to-set-up-dmarc/)

---

**Última actualización:** 30 de octubre, 2025  
**Versión:** 1.0.0

