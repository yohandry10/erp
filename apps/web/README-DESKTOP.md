# 🖥️ ERP Suite Desktop

Aplicación desktop del sistema ERP tributario peruano construida con Tauri + Next.js.

## Estado vigente

La app desktop es **online-first con soporte offline local**: empaqueta la UI web como cliente Tauri y consume el backend API real mediante `NEXT_PUBLIC_API_URL`. Cuando no hay conexión o el usuario activa `offline_mode`, las lecturas pueden usar cache local reciente y las escrituras JSON serializables se guardan en SQLite local para sincronizarse después.

La base autoritativa, firma fiscal, CPE/GRE/SIRE, certificado, credenciales SUNAT/OSE y generación fiscal autoritativa viven en el backend. En offline, esos flujos quedan en estado pendiente/local; no se declara aceptación SUNAT/CDR hasta que el backend procese la cola.

## Características Desktop

### Seguridad y configuración
- **Cliente nativo Tauri** para operar contra el API del ERP.
- **Configuración local mínima** para preferencias desktop; no reemplaza la configuración fiscal del backend.
- **Certificados y credenciales fiscales**: se gestionan en el backend/wizard del ERP.
- **POS + caja local-first** en SQLite desktop para operar ventas, apertura y cierre sin red sobre datos sincronizados.
- **Outbox offline durable** en SQLite desktop para operaciones pendientes de otros módulos.
- **Cache local de lecturas** para que pantallas ya visitadas puedan consultarse sin red.
- **Navegación entre módulos optimizada**: el sidebar limita el prefetch inicial y mantiene prefetch bajo intención de usuario.

### 📄 Procesamiento de Documentos
- **CPE**: Facturas, Boletas, Notas de Crédito/Débito
- **GRE**: Guías de Remisión Electrónicas
- **Firma XML y envío fiscal**: ejecutados por el backend API.
- **Generación PDF**: ejecutada por el backend API.

### 🖨️ Impresión Directa
- **Impresoras Fiscales**: Soporte para impresoras térmicas
- **Impresión Silenciosa**: Sin diálogos del sistema
- **Múltiples Formatos**: A4, tickets, formatos personalizados

### 📊 Exportación SIRE
- **Formato SUNAT**: Exportación directa para SIRE
- **Validación**: Verificación de datos antes de exportar
- **Períodos**: Exportación por rangos de fechas
- **Ejecución autoritativa**: backend API.

## 🚀 Instalación y Desarrollo

### Prerrequisitos
```bash
# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Instalar Tauri CLI
cargo install tauri-cli

# O usar pnpm
pnpm add -D @tauri-apps/cli
```

### Desarrollo
```bash
# Instalar dependencias
pnpm install

# Desarrollo desktop
pnpm run desktop:dev

# Solo frontend (para desarrollo web)
pnpm run dev
```

### Build de Producción
```bash
# Build completo desktop
pnpm run desktop:build

# Prueba de cache/outbox/sync offline
pnpm run test:offline

# Los ejecutables estarán en:
# Windows: apps/web/src-tauri/target/release/erp-suite-desktop.exe
# Linux: apps/web/src-tauri/target/release/erp-suite-desktop
# macOS: apps/web/src-tauri/target/release/erp-suite-desktop.app
```

## 📁 Estructura Desktop

```
apps/web/
├── src-tauri/           # Backend Rust
│   ├── src/
│   │   ├── main.rs      # Entry point
│   │   ├── lib.rs       # Comandos Tauri
│   │   ├── database.rs  # Prototipo legacy no autoritativo
│   │   ├── crypto.rs    # Prototipo legacy no conectado
│   │   ├── sunat.rs     # Prototipo legacy no conectado
│   │   ├── pdf.rs       # Prototipo legacy no conectado
│   │   └── printer.rs   # Impresión directa
│   ├── Cargo.toml       # Dependencias Rust
│   └── tauri.conf.json  # Configuración Tauri
├── hooks/
│   └── useTauri.ts      # Hook React para Tauri
└── components/desktop/  # Componentes específicos desktop
    ├── DesktopConfig.tsx
    ├── DesktopStatus.tsx
    └── DesktopActions.tsx
```

## ⚙️ Configuración

### Primera Configuración
1. **Datos de la Empresa**
   - RUC
   - Razón Social
   - Endpoint SUNAT (producción/beta)

2. **Certificado Digital**
   - Seleccionar archivo .pfx
   - Ingresar contraseña
   - Validación automática

3. **Impresoras**
   - Detección automática
   - Configuración por defecto
   - Impresoras térmicas (POS)

### Archivos de Configuración
```
%APPDATA%/com.erpsuite.desktop/     # Windows
~/.config/com.erpsuite.desktop/     # Linux
~/Library/Application Support/com.erpsuite.desktop/  # macOS
├── config.json          # Preferencias locales desktop
├── erp_local.sqlite     # Cola offline durable y metadatos locales
├── erp_local.sqlite-wal # WAL de SQLite, si hay actividad pendiente
├── offline_outbox.json.migrated # Cola legacy migrada, si existía
└── logs/                # Logs de la aplicación
```

## 🔧 Comandos Tauri Disponibles

### Configuración
- `load_config()` - Cargar configuración
- `save_config(config)` - Guardar configuración
- `get_offline_status()` - Resumen de cola offline
- `enqueue_offline_request(request)` - Guardar operación local pendiente
- `list_offline_requests()` - Listar operaciones locales
- `mark_offline_request_synced(id, responseStatus, responseBody)` - Marcar operación sincronizada
- `mark_offline_request_failed(id, error)` - Marcar operación fallida
- `delete_offline_request(id)` - Eliminar operación local
- `hydrate_local_first_response(endpoint, url, status, headers, body)` - Hidratar SQLite con snapshots POS/caja al operar online.
- `get_local_first_response(endpoint, url)` - Leer snapshots/tablas locales para endpoints POS/caja offline.
- `process_local_first_write(request)` - Procesar transacciones locales de POS/caja y dejar sync pendiente.

### Procesamiento de Documentos
- `sign_xml(xmlContent)` - Existe para compatibilidad, pero responde que la firma se hace en backend.
- `send_to_sunat(signedXml)` - Existe para compatibilidad, pero responde que el envío fiscal se hace en backend.
- `generate_pdf(xmlContent, template)` - Existe para compatibilidad, pero responde que el PDF fiscal se hace en backend.

### Impresión
- `get_printers()` - Obtener impresoras disponibles
- `print_document(pdfData, printerName)` - Imprimir documento

### Base de Datos
- `backup_database(backupPath)` - Exporta backup JSON de configuración desktop y cola offline; la BD autoritativa sigue en backend/BD.
- `export_sire_data(periodo)` - Existe para compatibilidad, pero la exportación se hace en backend.

## Modo Offline

El modo offline tiene dos niveles:

- **POS + caja local-first**: productos, clientes, métodos de pago, empresa, ventas recientes, cajas y sesión abierta se hidratan en SQLite cuando hay red. Sin red, el POS lee SQLite; ventas, apertura y cierre de caja se guardan transaccionalmente en SQLite, descuentan stock local y quedan pendientes de sincronización.
- **Resto de módulos**: continuidad operativa por cache/outbox. `GET` devuelve última respuesta JSON/text cacheada; `POST/PUT/PATCH/DELETE` serializable se guarda en `erp_local.sqlite` y la UI recibe `202` con `offline_queue_id`.
- `offline_mode`: fuerza el uso de cache/outbox sin intentar red; sirve para operar deliberadamente sin conexión.
- `/dashboard/offline`: muestra estado de conexión, pendientes, fallidos, sincronizados y permite reintentar.
- El indicador superior muestra `Offline` y el número de operaciones pendientes.
- Al reconectar, la cola se puede sincronizar contra el backend API real vigente en `NEXT_PUBLIC_API_URL`.
- `pnpm run test:offline` verifica cache de lectura, cola de escritura, sincronización exitosa, fallo persistido y dispatch local-first POS.
- La matriz de smoke desktop/static export del 2026-05-25 cubrio 108 rutas exportadas con API simulada: 108/108 OK.

Restricciones deliberadas:

- No se cachean PDFs/binarios ni `FormData`.
- El cache de respuestas tiene limite por entrada y falla suave si el almacenamiento local esta lleno; la respuesta online no se invalida por un fallo de cache.
- Las operaciones fiscales no obtienen CDR en offline; quedan pendientes hasta procesarse en backend.
- Conflictos de negocio, correlativos y validaciones SUNAT/OSE se resuelven en backend al sincronizar.
- POS/caja offline es autoritativo solo para el dispositivo local hasta sincronizar. Si otro dispositivo vende el mismo stock offline, el backend debe conciliar conflictos al recibir la cola.

## 🛠️ Desarrollo de Funcionalidades

### Agregar Nuevo Comando Tauri
1. **Backend Rust** (`src-tauri/src/lib.rs`):
```rust
#[tauri::command]
async fn mi_comando(parametro: String) -> Result<String, String> {
    // Lógica del comando
    Ok("resultado".to_string())
}

// Agregar al invoke_handler
.invoke_handler(tauri::generate_handler![
    // ... otros comandos
    mi_comando
])
```

2. **Frontend TypeScript** (`hooks/useTauri.ts`):
```typescript
const miComando = async (parametro: string): Promise<string | null> => {
    try {
        return await invoke<string>('mi_comando', { parametro });
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
};
```

### Integrar con Componentes React
```tsx
import { useTauri } from '@/hooks/useTauri';

export default function MiComponente() {
    const { isDesktop, miComando } = useTauri();

    if (!isDesktop) {
        return <div>Solo disponible en desktop</div>;
    }

    return (
        <button onClick={() => miComando('test')}>
            Ejecutar Comando
        </button>
    );
}
```

## 🔍 Debugging

### Logs de Desarrollo
```bash
# Ver logs de Rust
RUST_LOG=debug pnpm run desktop:dev

# Ver logs de Tauri
TAURI_DEBUG=1 pnpm run desktop:dev
```

### DevTools
- **Frontend**: DevTools de Chrome integradas
- **Backend**: Logs en consola de Rust
- **Datos locales desktop**: inspeccionar `config.json` y `erp_local.sqlite`; la base autoritativa se revisa en Supabase/Postgres.

## 📦 Distribución

### Configurar Firma de Código
```toml
# tauri.conf.json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.sectigo.com"
    }
  }
}
```

### Auto-actualizaciones
```toml
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://releases.erpsuite.com/{{target}}/{{arch}}/{{current_version}}"],
      "dialog": true
    }
  }
}
```

## 🚨 Troubleshooting

### Problemas Comunes

1. **Error de certificado**
   - Verificar formato .pfx
   - Validar contraseña
   - Comprobar fecha de expiración

2. **Error de impresión**
   - Verificar drivers de impresora
   - Comprobar permisos del sistema
   - Probar con impresora por defecto

3. **Error de base de datos**
   - Verificar permisos de escritura
   - Comprobar espacio en disco
   - Restaurar desde backup

### Logs de Error
```bash
# Ver logs detallados
tail -f ~/.config/com.erpsuite.desktop/logs/app.log
```

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit cambios: `git commit -am 'Agregar nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Crear Pull Request

## 📄 Licencia

MIT License - ver [LICENSE](../../LICENSE) para detalles.
