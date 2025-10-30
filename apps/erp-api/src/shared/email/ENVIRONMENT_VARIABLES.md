# Environment Variables para Email Service

Agregar estas variables a tu archivo `.env`:

```env
# ------------------------------
# Email Service Configuration
# ------------------------------

# Email Provider: sendgrid | aws-ses | smtp
EMAIL_PROVIDER=smtp

# From Address (remitente)
EMAIL_FROM_ADDRESS=noreply@erp.com
EMAIL_FROM_NAME=ERP System

# Support Email (usado en plantillas)
SUPPORT_EMAIL=soporte@erp.com

# App Info (usado en emails)
APP_NAME=ERP System
APP_URL=http://localhost:3000

# ------------------------------
# SendGrid Configuration
# (si EMAIL_PROVIDER=sendgrid)
# ------------------------------
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ------------------------------
# AWS SES Configuration
# (si EMAIL_PROVIDER=aws-ses)
# ------------------------------
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# ------------------------------
# SMTP Configuration
# (si EMAIL_PROVIDER=smtp)
# ------------------------------

# Gmail SMTP (ejemplo)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# Mailtrap SMTP (para testing)
# SMTP_HOST=smtp.mailtrap.io
# SMTP_PORT=2525
# SMTP_SECURE=false
# SMTP_USER=your-mailtrap-username
# SMTP_PASS=your-mailtrap-password
```

## Configuración Rápida para Development (Mailtrap)

1. Crear cuenta en https://mailtrap.io/
2. Copiar credenciales SMTP
3. Agregar a `.env`:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM_ADDRESS=test@example.com
EMAIL_FROM_NAME=ERP Test
SUPPORT_EMAIL=support@example.com
APP_NAME=ERP System
APP_URL=http://localhost:3000

SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=xxxxxxxxxxxxx
SMTP_PASS=xxxxxxxxxxxxx
```

## Configuración para Producción (SendGrid)

1. Crear cuenta en https://sendgrid.com/
2. Generar API Key con permisos "Mail Send"
3. Agregar a `.env`:

```env
EMAIL_PROVIDER=sendgrid
EMAIL_FROM_ADDRESS=noreply@tudominio.com
EMAIL_FROM_NAME=Tu Empresa
SUPPORT_EMAIL=soporte@tudominio.com
APP_NAME=Tu Empresa ERP
APP_URL=https://tudominio.com

SENDGRID_API_KEY=SG.your-actual-api-key-here
```

Ver `EMAIL_SERVICE_SETUP.md` para guía completa de configuración.

