# Manual de Uso - Sistema Demo ERP

## 🚀 Crear una Demo (14 días)

```bash
curl -X POST http://localhost:3002/api/demo/create \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Mi Empresa SAC"}'
```

**Response:**
```json
{
  "success": true,
  "tenant_id": "uuid",
  "email": "demo-xxx@temp.local",
  "password": "ABC12345",
  "token": "eyJ...",
  "expires_at": "2025-12-13T...",
  "dias_restantes": 14
}
```

---

## 📊 Consultar Estado

```bash
curl http://localhost:3002/api/demo/status \
  -H "Authorization: Bearer <token>"
```

---

## 💰 Ver Planes Disponibles

```bash
curl http://localhost:3002/api/demo/planes
```

**Response:**
```json
{
  "planes": [
    {"id": "basico", "nombre": "Plan Básico", "precio_mensual": 99, "precio_anual": 990},
    {"id": "profesional", "nombre": "Plan Profesional", "precio_mensual": 199, "precio_anual": 1990},
    {"id": "enterprise", "nombre": "Plan Enterprise", "precio_mensual": 499, "precio_anual": 4990}
  ],
  "stripe_enabled": true
}
```

---

## 💳 Convertir a Cuenta Real (Pagar con Stripe)

```bash
curl -X POST http://localhost:3002/api/demo/convert-to-real \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "razon_social": "MI EMPRESA SAC",
    "ruc": "20123456789",
    "email": "admin@miempresa.pe",
    "password": "MiPassword123!",
    "plan_id": "profesional",
    "periodo": "anual"
  }'
```

**Response (con Stripe configurado):**
```json
{
  "success": true,
  "payment_url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "session_id": "cs_xxx",
  "plan": "Plan Profesional",
  "monto": 1990,
  "moneda": "PEN"
}
```

El usuario es redirigido a Stripe para completar el pago. Al pagar exitosamente:
1. Stripe envía webhook a `/api/webhooks/stripe`
2. El sistema activa la cuenta automáticamente
3. Usuario recibe email de bienvenida

---

## ⚙️ Configuración de Stripe

### Variables de Entorno Requeridas

```env
# Stripe API Keys
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Price IDs de Stripe (crear en Dashboard de Stripe)
STRIPE_PRICE_BASICO_MENSUAL=price_xxx
STRIPE_PRICE_BASICO_ANUAL=price_xxx
STRIPE_PRICE_PROFESIONAL_MENSUAL=price_xxx
STRIPE_PRICE_PROFESIONAL_ANUAL=price_xxx
STRIPE_PRICE_ENTERPRISE_MENSUAL=price_xxx
STRIPE_PRICE_ENTERPRISE_ANUAL=price_xxx

# URL del frontend para redirecciones
FRONTEND_URL=https://tu-dominio.com
```

### Configurar Webhook en Stripe Dashboard

1. Ir a Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://tu-dominio.com/api/webhooks/stripe`
3. Seleccionar eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.deleted`
   - `invoice.paid`
4. Copiar el Signing Secret a `STRIPE_WEBHOOK_SECRET`

### Crear Productos y Precios en Stripe

```bash
# Crear producto
stripe products create --name="Plan Básico ERP"

# Crear precio mensual
stripe prices create \
  --product=prod_xxx \
  --unit-amount=9900 \
  --currency=pen \
  --recurring[interval]=month

# Crear precio anual
stripe prices create \
  --product=prod_xxx \
  --unit-amount=99000 \
  --currency=pen \
  --recurring[interval]=year
```

---

## ⏰ Política de Expiración

| Estado | Acción |
|--------|--------|
| Días 1-14 | Demo activa, uso normal |
| Día 0 | Demo expirada, solo puede pagar |
| Día -30 | Datos eliminados permanentemente |

**NO hay extensiones. Si le gusta, paga. Si no, adiós.**

---

## 📋 Datos Incluidos en Demo

- 2 Almacenes
- 2 Cajas POS  
- 10 Clientes
- 5 Proveedores
- 20 Productos con stock
- 1 Cuenta bancaria

---

## 🔧 Modo Testing (sin Stripe)

Para desarrollo sin Stripe configurado:

```env
DEMO_SKIP_PAYMENT=true
```

Esto permite conversión directa sin proceso de pago.

---

## 📡 Endpoints Resumen

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| POST | `/api/demo/create` | No | Crear demo |
| GET | `/api/demo/status` | Sí | Ver estado |
| GET | `/api/demo/planes` | No | Ver planes |
| POST | `/api/demo/convert-to-real` | Sí | Iniciar pago |
| POST | `/api/webhooks/stripe` | No* | Webhook Stripe |

*El webhook usa firma de Stripe para autenticación

---

## 🗄️ Migración Requerida

Ejecutar en Supabase:

```sql
-- Migración 145: Tabla para conversiones pendientes
CREATE TABLE IF NOT EXISTS demo_conversiones_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  stripe_session_id VARCHAR(255) UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  ruc VARCHAR(11) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  telefono VARCHAR(50),
  plan_id VARCHAR(50) NOT NULL DEFAULT 'basico',
  periodo VARCHAR(20) NOT NULL DEFAULT 'mensual',
  monto NUMERIC(10,2) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_demo_conv_session ON demo_conversiones_pendientes(stripe_session_id);
GRANT SELECT, INSERT, UPDATE ON demo_conversiones_pendientes TO service_role;
```
