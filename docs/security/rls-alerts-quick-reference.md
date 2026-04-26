# Referencia Rápida: Alertas RLS

## Comandos Esenciales

### Consultar Alertas Activas
```sql
-- Alertas sin reconocer
SELECT * FROM v_rls_alerts_unacknowledged;

-- Alertas de las últimas 24 horas
SELECT * FROM v_rls_alerts_recent;
```

### Reconocer Alerta
```sql
SELECT acknowledge_rls_alert('alert-uuid-aqui');
```

### Estadísticas
```sql
-- Últimos 7 días
SELECT * FROM get_alert_statistics(7);
```

### Gestión de Configuración
```sql
-- Ver configuraciones
SELECT alert_name, enabled, severity_threshold 
FROM rls_alert_config;

-- Deshabilitar alerta
SELECT disable_rls_alert('repeated_violations');

-- Habilitar alerta
SELECT enable_rls_alert('repeated_violations');
```

## Tipos de Alertas

| Alerta | Severidad | Condición | Umbral |
|--------|-----------|-----------|--------|
| `critical_cross_tenant` | CRITICAL | Acceso cross-tenant | 1 violación |
| `missing_tenant_context` | CRITICAL | Sin contexto tenant | 1 violación |
| `repeated_violations` | WARNING | Violaciones repetidas | 5 en 15 min |
| `table_under_attack` | CRITICAL | Tabla bajo ataque | 10 en 10 min |

## Escuchar Alertas en Tiempo Real

### PostgreSQL
```sql
LISTEN rls_alert;
```

### Node.js
```typescript
supabase
  .channel('rls-alerts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'rls_alert_history'
  }, (payload) => {
    console.error('🚨 Alert:', payload.new);
  })
  .subscribe();
```

## Mantenimiento

```sql
-- Limpiar alertas antiguas (90 días)
SELECT cleanup_old_rls_alerts(90);
```

## Troubleshooting

```sql
-- Verificar alertas habilitadas
SELECT alert_name, enabled FROM rls_alert_config;

-- Verificar trigger activo
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgname = 'trg_rls_alert';
```

## Contacto

Para soporte: Equipo de Seguridad
