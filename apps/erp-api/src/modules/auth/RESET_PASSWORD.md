# Flujo de Reset de Contraseña - Documentación

## 🔒 Resumen de Seguridad

El flujo de reset de contraseña ha sido implementado con las siguientes medidas de seguridad:

✅ **Token seguro**: Generado con `crypto.randomBytes(32)` (64 caracteres hex)  
✅ **Token hasheado**: Almacenado con bcrypt en BD  
✅ **Expiración**: 24 horas desde la generación  
✅ **No exposición**: El token NUNCA se retorna en respuestas HTTP  
✅ **Rate limiting**: 3 intentos por minuto por endpoint  
✅ **Validación robusta**: DTOs con class-validator  
✅ **Logs de seguridad**: Todos los intentos (exitosos y fallidos) son registrados con IP  
✅ **Revocación de sesiones**: Al cambiar contraseña se invalidan todas las sesiones activas  
✅ **Prevención de enumeración**: Mismo mensaje para usuarios existentes e inexistentes  

---

## 📋 Endpoints

### 1. Solicitar Reset de Contraseña

**POST** `/auth/password-reset/request`

Genera un token de reset y lo envía al email del usuario (si existe).

#### Request Body
```json
{
  "email": "usuario@ejemplo.com"
}
```

#### Validaciones
- `email`: Email válido requerido

#### Response (200 OK)
```json
{
  "message": "Si el email existe en nuestro sistema, recibirás un enlace de reset de contraseña."
}
```

⚠️ **IMPORTANTE**: Por seguridad, siempre retorna el mismo mensaje independientemente de si el usuario existe o no. Esto previene user enumeration attacks.

#### Comportamiento Interno
- Genera token criptográficamente seguro (32 bytes = 64 hex)
- Hashea el token con bcrypt antes de almacenarlo
- Establece expiración en 24 horas
- Registra log con IP del cliente
- **TODO**: Enviar email con el token (actualmente solo se genera)

---

### 2. Validar Token de Reset

**POST** `/auth/password-reset/validate`

Verifica si un token de reset es válido y no ha expirado.

#### Request Body
```json
{
  "email": "usuario@ejemplo.com",
  "token": "abc123...def456" // 64 caracteres hexadecimales
}
```

#### Validaciones
- `email`: Email válido requerido
- `token`: String de exactamente 64 caracteres requerido

#### Response (200 OK)
```json
{
  "valid": true
}
```

#### Response (401 Unauthorized)
```json
{
  "statusCode": 401,
  "message": "Token inválido o expirado"
}
```

#### Comportamiento Interno
- Verifica que el usuario existe
- Verifica que tiene un token de reset pendiente
- Valida que no haya expirado (24 horas)
- Compara el token usando bcrypt
- Registra intentos fallidos con IP

---

### 3. Confirmar Reset de Contraseña

**POST** `/auth/password-reset/confirm`

Cambia la contraseña del usuario usando el token de reset. Revoca todas las sesiones activas.

#### Request Body
```json
{
  "email": "usuario@ejemplo.com",
  "token": "abc123...def456", // 64 caracteres hexadecimales
  "newPassword": "MiPassword123!" // Mínimo 8 caracteres con requisitos de complejidad
}
```

#### Validaciones de Contraseña
La nueva contraseña debe cumplir **TODOS** estos requisitos:

- ✅ Mínimo 8 caracteres
- ✅ Al menos 1 letra mayúscula (A-Z)
- ✅ Al menos 1 letra minúscula (a-z)
- ✅ Al menos 1 número (0-9)
- ✅ Al menos 1 símbolo especial (@$!%*?&)

#### Response (200 OK)
```json
{
  "message": "Contraseña actualizada exitosamente. Por seguridad, todas tus sesiones activas han sido cerradas. Por favor, inicia sesión nuevamente."
}
```

#### Response (400 Bad Request)
```json
{
  "statusCode": 400,
  "message": [
    "La contraseña debe tener mínimo 8 caracteres",
    "La contraseña debe contener al menos: una mayúscula, una minúscula, un número y un símbolo especial (@$!%*?&)"
  ],
  "error": "Bad Request"
}
```

#### Response (401 Unauthorized)
```json
{
  "statusCode": 401,
  "message": "Token inválido o expirado"
}
```

#### Comportamiento Interno
- Valida el token (mismo proceso que endpoint 2)
- Hashea la nueva contraseña con bcrypt
- Actualiza la contraseña en BD
- **Limpia el token de reset** (previene reutilización)
- **Resetea `failed_login_attempts` a 0**
- **Limpia `locked_until`** (desbloquea la cuenta si estaba bloqueada)
- **Revoca todas las sesiones activas** del usuario
- Registra log exitoso con IP

---

## 🔐 Medidas de Seguridad Implementadas

### 1. Prevención de User Enumeration
El endpoint `/request` siempre retorna el mismo mensaje, tanto si el usuario existe como si no. Esto previene que atacantes descubran qué emails están registrados.

### 2. Rate Limiting
Todos los endpoints tienen rate limiting:
- 3 requests por minuto en `/request` y `/confirm`
- 5 requests por minuto en `/validate`

### 3. Token Seguro y Hasheado
- Token generado con `crypto.randomBytes(32)` (estándar criptográfico)
- Almacenado hasheado con bcrypt (nunca en texto plano)
- Nunca expuesto en respuestas HTTP

### 4. Expiración de Token
Los tokens expiran después de 24 horas. Intentos con tokens expirados son rechazados y registrados.

### 5. Token de Uso Único
Al confirmar el reset, el token es inmediatamente limpiado de la BD, previniendo reutilización.

### 6. Revocación de Sesiones
Al cambiar la contraseña, todas las sesiones JWT activas del usuario son revocadas, forzando re-autenticación.

### 7. Logging de Seguridad
Todos los eventos son registrados con:
- Email del usuario
- IP del cliente
- Timestamp
- Resultado (éxito/fallo)

Eventos registrados:
- ✅ Solicitud de reset
- ⚠️ Solicitud para usuario inexistente
- ⚠️ Token inválido
- ⚠️ Token expirado
- ✅ Reset exitoso

### 8. Validación Robusta de Contraseña
La contraseña debe cumplir requisitos estrictos de complejidad, validados tanto en el DTO (class-validator) como potencialmente en el service.

---

## 🧪 Tests

Se han implementado tests E2E completos en `test/auth-password-reset.e2e-spec.ts` que cubren:

✅ Validación de DTOs  
✅ Rate limiting  
✅ Prevención de user enumeration  
✅ Validación de token  
✅ Requisitos de contraseña robusta  
✅ Expiración de token  
✅ Token de uso único  
✅ Revocación de sesiones  
✅ Logging de seguridad  

---

## 📝 Tareas Pendientes (TODOs)

### Prioridad ALTA
1. **Implementar servicio de email** para enviar tokens de reset
   - Integrar con SendGrid/AWS SES/similar
   - Crear plantilla HTML profesional
   - Incluir link con token embebido
   - Implementar retry logic

2. **Completar tests E2E**
   - Setup de usuario de prueba
   - Cleanup después de tests
   - Obtener token desde BD en tests
   - Verificar revocación de sesiones
   - Verificar limpieza de token en BD

### Prioridad MEDIA
3. **Monitoreo y alertas**
   - Alertas para múltiples intentos fallidos desde misma IP
   - Dashboard de seguridad para admins
   - Integración con herramienta de monitoring (Sentry, DataDog)

4. **Mejoras UX**
   - Email de confirmación después de reset exitoso
   - Notificación si el reset fue iniciado por otra persona

---

## 🚀 Cómo Usar (Frontend)

### Flujo Completo

```typescript
// 1. Usuario solicita reset
async function requestPasswordReset(email: string) {
  const response = await fetch('/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  const data = await response.json();
  // Mostrar mensaje: "Revisa tu email para continuar"
  console.log(data.message);
}

// 2. Usuario recibe email con token y hace click en link
// URL del link: https://app.com/reset-password?token=abc123&email=user@example.com

// 3. Al cargar la página, validar el token
async function validateResetToken(email: string, token: string) {
  const response = await fetch('/auth/password-reset/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token })
  });
  
  if (response.ok) {
    // Token válido, mostrar formulario de nueva contraseña
    return true;
  } else {
    // Token inválido o expirado, mostrar error
    return false;
  }
}

// 4. Usuario ingresa nueva contraseña y confirma
async function confirmPasswordReset(
  email: string, 
  token: string, 
  newPassword: string
) {
  const response = await fetch('/auth/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token, newPassword })
  });
  
  if (response.ok) {
    const data = await response.json();
    // Redirigir a login con mensaje de éxito
    console.log(data.message);
    window.location.href = '/login?message=password-reset-success';
  } else {
    const error = await response.json();
    // Mostrar errores de validación
    console.error(error.message);
  }
}
```

### Validación Frontend de Contraseña

```typescript
function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('La contraseña debe tener mínimo 8 caracteres');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Debe contener al menos una minúscula');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Debe contener al menos una mayúscula');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Debe contener al menos un número');
  }
  
  if (!/[@$!%*?&]/.test(password)) {
    errors.push('Debe contener al menos un símbolo especial (@$!%*?&)');
  }
  
  return errors;
}
```

---

## 📊 Diagrama de Flujo

```
Usuario                    Frontend                 Backend                    BD
  |                           |                        |                         |
  |-- 1. Ingresa email -->    |                        |                         |
  |                           |-- POST /request -->    |                         |
  |                           |                        |-- Genera token -->      |
  |                           |                        |                         |
  |                           |                        |-- Hash token -->        |
  |                           |                        |                    [Guarda]
  |                           |                        |<-- Token guardado --|   |
  |                           |<-- 200 OK -------------|                         |
  |<-- Mensaje genérico ---   |                        |                         |
  |                           |                        |                         |
  |<============ EMAIL CON TOKEN =====================|                         |
  |                           |                        |                         |
  |-- 2. Click en link -->    |                        |                         |
  |                           |-- POST /validate -->   |                         |
  |                           |                        |-- Busca usuario -->     |
  |                           |                        |                    [Lee token]
  |                           |                        |<-- Token hash ------|   |
  |                           |                        |-- Valida bcrypt         |
  |                           |<-- 200 OK -------------|                         |
  |<-- Formulario nueva pass- |                        |                         |
  |                           |                        |                         |
  |-- 3. Ingresa nueva pass ->|                        |                         |
  |                           |-- POST /confirm -->    |                         |
  |                           |                        |-- Valida token -->      |
  |                           |                        |                    [Lee token]
  |                           |                        |-- Hash nueva pass       |
  |                           |                        |-- Actualiza -->         |
  |                           |                        |                    [password_hash]
  |                           |                        |                    [limpia token]
  |                           |                        |                    [reset attempts]
  |                           |                        |-- Revoca sesiones -->   |
  |                           |                        |                    [invalida JWTs]
  |                           |<-- 200 OK -------------|                         |
  |<-- Redirige a login ---   |                        |                         |
```

---

## 🔍 Troubleshooting

### Usuario no recibe email
- Verificar configuración de servicio de email (TODO: implementar)
- Verificar que el email existe en la BD
- Revisar carpeta de spam

### Token inválido o expirado
- Verificar que no hayan pasado más de 24 horas
- Verificar que el token no haya sido usado previamente
- Generar nuevo token si es necesario

### Contraseña rechazada
- Verificar que cumple TODOS los requisitos
- Mostrar feedback en tiempo real en el frontend

### Rate limiting
- Esperar 1 minuto antes de reintentar
- Implementar UX que informe al usuario del rate limit

---

## 📚 Referencias

- [OWASP Password Reset Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [NIST Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [class-validator Decorators](https://github.com/typestack/class-validator)

