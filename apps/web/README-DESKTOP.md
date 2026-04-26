# 🖥️ ERP Suite Desktop

Aplicación desktop del sistema ERP tributario peruano construida con Tauri + Next.js.

## ✨ Características Desktop

### 🔒 Seguridad Avanzada
- **Firma Digital**: Soporte nativo para certificados .pfx de SUNAT
- **Almacenamiento Local**: Base de datos SQLite embebida
- **Modo Offline**: Funciona sin conexión a internet
- **Certificados**: Validación y gestión de certificados digitales

### 📄 Procesamiento de Documentos
- **CPE**: Facturas, Boletas, Notas de Crédito/Débito
- **GRE**: Guías de Remisión Electrónicas
- **Firma XML**: Firma digital según estándares SUNAT
- **Generación PDF**: Representación impresa automática

### 🖨️ Impresión Directa
- **Impresoras Fiscales**: Soporte para impresoras térmicas
- **Impresión Silenciosa**: Sin diálogos del sistema
- **Múltiples Formatos**: A4, tickets, formatos personalizados

### 📊 Exportación SIRE
- **Formato SUNAT**: Exportación directa para SIRE
- **Validación**: Verificación de datos antes de exportar
- **Períodos**: Exportación por rangos de fechas

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
│   │   ├── database.rs  # SQLite local
│   │   ├── crypto.rs    # Firma digital
│   │   ├── sunat.rs     # Integración SUNAT
│   │   ├── pdf.rs       # Generación PDF
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
├── config.json          # Configuración general
├── erp_suite.db         # Base de datos SQLite
└── logs/                # Logs de la aplicación
```

## 🔧 Comandos Tauri Disponibles

### Configuración
- `load_config()` - Cargar configuración
- `save_config(config)` - Guardar configuración

### Procesamiento de Documentos
- `sign_xml(xmlContent)` - Firmar XML con certificado
- `send_to_sunat(signedXml)` - Enviar a SUNAT
- `generate_pdf(xmlContent, template)` - Generar PDF

### Impresión
- `get_printers()` - Obtener impresoras disponibles
- `print_document(pdfData, printerName)` - Imprimir documento

### Base de Datos
- `backup_database(backupPath)` - Crear backup
- `export_sire_data(periodo)` - Exportar datos SIRE

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
- **Base de datos**: SQLite browser o DBeaver

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