# 🖥️ ERP Suite Desktop

<!-- DOC-NAV:START -->
> Documentación canónica: `docs/README.md`. Estado vigente: `docs/CURRENT_STATE.md`.
<!-- DOC-NAV:END -->

Aplicación desktop del sistema ERP tributario peruano construida con Tauri + Next.js.

## Estado vigente

La app desktop es **offline-first operativa con sincronización**: empaqueta la UI web como cliente Tauri y usa SQLite local para continuidad sin red. Cuando hay conexión consume el backend API real mediante `NEXT_PUBLIC_API_URL`; cuando no hay conexión o el usuario activa `offline_mode`, las lecturas usan cache/snapshots locales y las escrituras serializables se guardan en SQLite para sincronizarse después.

La base autoritativa final y la respuesta SUNAT/OSE viven fuera del dispositivo. En offline, la app desktop puede generar documentos fiscales locales, PDF local, hash, correlativo SQLite y cola de envío; no declara aceptación SUNAT/CDR hasta que el backend/SUNAT/OSE procese la cola al reconectar.

## Características Desktop

### Seguridad y configuración
- **Cliente nativo Tauri** para operar contra el API del ERP.
- **Configuración local mínima** para preferencias desktop; no reemplaza la configuración fiscal del backend.
- **Certificados y credenciales fiscales**: se gestionan en el backend/wizard del ERP.
- **Secreto fiscal local protegido**: si el desktop conserva una contraseña de certificado en `config.json`, en Windows se guarda con DPAPI y los backups la redactan.
- **Superficie Tauri reducida**: el runtime desktop no expone `tauri-plugin-shell` ni capability `shell:default`.
- **POS + caja local-first** en SQLite desktop para operar ventas, apertura y cierre sin red sobre datos sincronizados.
- **Clientes e inventario base local-first**: clientes, productos, almacenes/movimientos por snapshot y alta/edición/eliminación local de clientes/productos con sincronización posterior.
- **Ventas comerciales local-first**: cotizaciones y pedidos se pueden listar, consultar, crear, editar y eliminar localmente; los pedidos reservan stock local y quedan pendientes de sincronización.
- **Cobertura genérica local-first para módulos restantes**: RRHH, compras, finanzas, contabilidad, documentos, configuración operativa, usuarios y reportes JSON hidratan snapshots locales. Las escrituras JSON no especializadas se guardan como registros locales pendientes y se sincronizan con el backend.
- **Mapeo local-remoto**: las entidades creadas offline guardan metadata de ID local en la cola y registran el ID autoritativo devuelto por backend al sincronizar.
- **Cache binario básico**: PDFs/reportes/binarios ya descargados online se guardan en SQLite desktop para relectura offline.
- **Paquete fiscal local**: ventas POS offline generan documento fiscal local con XML, hash, PDF base64, correlativo local y estado `PENDIENTE_ENVIO` cuando la configuración fiscal local está completa.
- **Adjuntos offline**: las cargas `FormData` serializables se guardan en cola con archivos en base64 y se reconstruyen al sincronizar.
- **Sesión y permisos offline**: desktop conserva snapshot local de sesión y permisos para operar sin consultar `/auth/profile` o RBAC remoto mientras no haya red.
- **Outbox offline durable por tenant** en SQLite desktop para operaciones pendientes de otros módulos.
- **Cache local de lecturas por tenant** para que pantallas ya visitadas puedan consultarse sin red sin mezclar empresas.
- **Navegación entre módulos optimizada**: el sidebar limita el prefetch inicial y mantiene prefetch bajo intención de usuario.

### 📄 Procesamiento de Documentos
- **CPE**: Facturas, Boletas, Notas de Crédito/Débito
- **GRE**: Guías de Remisión Electrónicas
- **Firma/preparación XML local**: el desktop prepara XML local con digest/certificado y lo deja pendiente de envío.
- **Generación PDF local**: disponible en desktop para representación offline.

### 🖨️ Impresión Directa
- **Impresoras Fiscales**: Soporte para impresoras térmicas
- **Impresión Silenciosa**: Sin diálogos del sistema
- **Múltiples Formatos**: A4, tickets, formatos personalizados

### 📊 Exportación SIRE
- **Formato SUNAT**: Exportación directa para SIRE
- **Validación**: Verificación de datos antes de exportar
- **Períodos**: Exportación por rangos de fechas
- **Export local offline**: desktop puede generar un reporte local desde documentos fiscales pendientes/emitidos. La validación y aceptación oficial siguen fuera del dispositivo.

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
- `mark_offline_request_failed(id, error, responseStatus)` - Marcar operación fallida
- `delete_offline_request(id)` - Eliminar operación local
- `list_local_id_mappings()` - Listar mapeos local-remoto confirmados por sync.
- `cache_binary_response(endpoint, url, status, headers, bodyBase64)` - Guardar respuesta binaria local.
- `get_binary_response(endpoint, url)` - Leer respuesta binaria local.
- `generate_offline_fiscal_document(document)` - Generar documento fiscal local con XML/PDF/hash/correlativo y cola de envío.
- `hydrate_local_first_response(endpoint, url, status, headers, body)` - Hidratar SQLite con snapshots POS/caja al operar online.
- `get_local_first_response(endpoint, url)` - Leer snapshots/tablas locales para endpoints POS/caja offline.
- `process_local_first_write(request)` - Procesar transacciones locales de POS/caja y dejar sync pendiente.

### Procesamiento de Documentos
- `sign_xml(xmlContent)` - Prepara/firma localmente usando el certificado configurado y marca el XML como pendiente de envío externo.
- `send_to_sunat(signedXml)` - Encola el XML firmado para envío backend/SUNAT/OSE al reconectar; no simula aceptación.
- `generate_pdf(xmlContent, template)` - Genera PDF local básico para operación offline.

### Impresión
- `get_printers()` - Obtener impresoras disponibles
- `print_document(pdfData, printerName)` - Imprimir documento

### Base de Datos
- `backup_database(backupPath)` - Exporta backup JSON de configuración desktop y cola offline; la BD autoritativa sigue en backend/BD.
- `export_sire_data(periodo, tenantId?)` - Exporta datos fiscales locales del desktop para continuidad offline; la presentación/validación oficial queda para backend/SUNAT.

## Modo Offline

El modo offline tiene dos niveles:

- **POS + caja local-first**: productos, clientes, métodos de pago, empresa, ventas recientes, cajas y sesión abierta se hidratan en SQLite cuando hay red. Sin red, el POS lee SQLite; ventas, apertura y cierre de caja se guardan transaccionalmente en SQLite, descuentan stock local y quedan pendientes de sincronización.
- **Fiscal POS offline**: si RUC/razón social están configurados, cada venta POS local genera un documento fiscal local con serie/correlativo SQLite, XML, hash, PDF y cola de envío. El estado sigue pendiente hasta recibir respuesta SUNAT/OSE.
- **Clientes e inventario base local-first**: `/dashboard/ventas/clientes` y `/dashboard/inventario/productos` pueden leer SQLite offline. Crear, editar y eliminar clientes/productos se guarda localmente y se encola para sync. Inventario comparte la tabla local de productos con POS, por lo que el stock descontado por ventas offline se refleja en el catálogo local.
- **Ventas comerciales local-first**: `/dashboard/ventas/cotizaciones` y `/dashboard/ventas/pedidos` leen SQLite offline. Crear/editar/eliminar cotizaciones y pedidos se guarda en SQLite y se encola para sync. Los pedidos creados offline reservan stock local, pero confirmación, despacho, facturación y GRE/CPE quedan sujetos al backend.
- **Resto de módulos**: continuidad operativa local-first genérica. `GET` JSON hidrata snapshots SQLite y los mezcla con registros locales pendientes; `POST/PUT/DELETE` JSON serializable se guarda como entidad local con `sync_status=pending` y también se encola para sincronización.
- **Binarios ya visitados**: reportes/PDFs/archivos descargados online se pueden consultar offline desde SQLite mientras no excedan el límite local.
- **Adjuntos y formularios multipart**: cuando una operación usa `FormData`, la cola offline conserva campos y archivos para rearmar el `multipart/form-data` al reconectar.
- **Sesión/RBAC**: si el usuario ya inició sesión antes, desktop usa snapshot local de sesión y permisos; un usuario nuevo sin sesión previa todavía necesita conexión para autenticarse por primera vez.
- `offline_mode`: fuerza el uso de cache/outbox sin intentar red; sirve para operar deliberadamente sin conexión.
- `/dashboard/offline`: muestra estado de conexión, pendientes, fallidos, conflictos, mapeos local-remoto, permite reintentar y refrescar snapshots base.
- El indicador superior muestra `Offline` y el número de operaciones pendientes.
- Al reconectar, la cola se puede sincronizar contra el backend API real vigente en `NEXT_PUBLIC_API_URL`.
- `pnpm run test:offline` verifica cache de lectura, cache binario, cola de escritura, sincronización exitosa, fallo persistido, mapeos local-remoto y dispatch local-first POS/genérico.
- La matriz de smoke desktop/static export del 2026-05-25 cubrio 108 rutas exportadas con API simulada: 108/108 OK.
- La pasada de cierre del 2026-06-03 revalidó build Tauri, `test:offline`, type-check web/backend, `cargo check` y `git diff --check`. Además dejó el almacenamiento local, fiscales, binarios, SIRE y snapshots aislados por tenant.

Restricciones deliberadas:

- Las cargas `FormData` se soportan para cola offline cuando los archivos pueden leerse en memoria; archivos enormes deben validarse operacionalmente por tamaño/tiempo de sync.
- El cache de respuestas tiene limite por entrada y falla suave si el almacenamiento local esta lleno; la respuesta online no se invalida por un fallo de cache.
- Las operaciones fiscales no obtienen CDR en offline; quedan pendientes hasta procesarse en backend.
- Conflictos de negocio, correlativos y validaciones SUNAT/OSE se resuelven en backend al sincronizar.
- La firma criptográfica SUNAT/OSE definitiva depende del certificado real del cliente y de la validación externa; el desktop deja el paquete local preparado y trazable.
- La contraseña local del certificado no se considera respaldo autoritativo; el onboarding/backend siguen siendo la fuente de configuración fiscal productiva.
- POS/caja offline es autoritativo solo para el dispositivo local hasta sincronizar. Si otro dispositivo vende el mismo stock offline, el backend debe conciliar conflictos al recibir la cola.
- Clientes/productos/cotizaciones/pedidos y registros genéricos creados offline usan IDs locales temporales; al sincronizar se registra el mapeo local-remoto y el siguiente refresh hidrata el estado autoritativo.
- En módulos genéricos, el registro local permite continuar la operación de UI, pero las reglas de negocio profundas, asientos definitivos, conciliaciones, permisos remotos y validaciones fiscales se confirman al sincronizar.

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
