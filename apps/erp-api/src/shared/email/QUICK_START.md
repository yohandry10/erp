# 🚀 Email Service - Quick Start Guide

## ⚡ Configuración en 2 Minutos

### Opción 1: Development con Mailtrap (Recomendado)

```bash
# 1. Crear cuenta gratuita en https://mailtrap.io/
# 2. Copiar credenciales SMTP de tu inbox
# 3. Agregar a .env:

echo '
# Email Configuration
EMAIL_PROVIDER=smtp
EMAIL_FROM_ADDRESS=test@example.com
EMAIL_FROM_NAME=ERP Test
SUPPORT_EMAIL=support@example.com
APP_NAME=ERP System
APP_URL=http://localhost:3000

SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=tu_usuario_mailtrap
SMTP_PASS=tu_password_mailtrap
' >> .env

# 4. Reiniciar servidor
npm run start:dev
```

---

### Opción 2: Producción con SendGrid

```bash
# 1. Crear cuenta en https://sendgrid.com/
# 2. Generar API Key con permisos "Mail Send"
# 3. Agregar a .env:

echo '
# Email Configuration
EMAIL_PROVIDER=sendgrid
EMAIL_FROM_ADDRESS=noreply@tudominio.com
EMAIL_FROM_NAME=Tu Empresa
SUPPORT_EMAIL=soporte@tudominio.com
APP_NAME=Tu Empresa ERP
APP_URL=https://tudominio.com

SENDGRID_API_KEY=SG.tu_api_key_aqui
' >> .env

# 4. Reiniciar servidor
npm run start:dev
```

---

## ✅ Verificar Configuración

```bash
# Probar flujo completo de password reset
curl -X POST http://localhost:3001/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Debería retornar:
# {
#   "message": "Si el email existe en nuestro sistema, recibirás un enlace de reset de contraseña."
# }

# Revisar logs del servidor:
# [EmailService] Email service initialized with provider: smtp
# [EmailService] Sending password reset email to test@example.com
# [EmailService] Email sent successfully to test@example.com (messageId: ...)
```

---

## 📧 Ver Emails

### Mailtrap
Ir a: https://mailtrap.io/inboxes → Ver tu inbox

### SendGrid
Ir a: https://app.sendgrid.com/ → Activity

---

## 🔧 Troubleshooting Rápido

### Email no llega

```bash
# 1. Verificar que variables existen
cat .env | grep EMAIL

# 2. Revisar logs del servidor
# Buscar: [EmailService] Failed to send email

# 3. Test manual de configuración
curl http://localhost:3001/auth/verify-email-config
```

### Error "Email service not configured"

```bash
# Reiniciar servidor después de cambiar .env
npm run start:dev
```

---

## 📚 Documentación Completa

Para guía detallada, ver:
- `EMAIL_SERVICE_SETUP.md` - Setup completo
- `ENVIRONMENT_VARIABLES.md` - Variables necesarias
- `../../RESUMEN_MEJORAS_PASSWORD_RESET.md` - Seguridad

---

## 🎯 Next Steps

1. ✅ Configurar email (Mailtrap o SendGrid)
2. ✅ Reiniciar servidor
3. ✅ Probar flujo de password reset
4. ✅ Ver email en inbox del proveedor
5. 🔄 (Opcional) Verificar dominio en SendGrid para producción

---

**¿Listo? ¡Tu email service está funcionando!** 🎉

