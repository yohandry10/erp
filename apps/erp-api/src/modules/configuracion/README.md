# Configuration Module

This module provides configuration management services for the ERP system, including wizard progress tracking, GRE thresholds management, and configuration status validation.

## Features

### Configuration Service

The `ConfigurationService` provides the following functionality:

1. **Configuration Status Management**
   - `getConfigurationStatus(tenantId)` - Get complete configuration status including certificate and RUC validation
   - `isConfigurationComplete(tenantId)` - Check if configuration is complete
   - `updateEmpresaConfig(tenantId, config)` - Update empresa configuration

2. **GRE Thresholds Management**
   - `getGREThresholds(tenantId)` - Get GRE automatic creation thresholds
   - `updateGREThresholds(tenantId, thresholds)` - Update GRE thresholds

3. **Wizard Progress Tracking**
   - `getWizardProgress(tenantId)` - Get wizard progress for a tenant
   - `saveWizardStep(tenantId, stepData)` - Save wizard step progress
   - `calculateWizardCompletionPercentage(pasosCompletados, totalSteps)` - Calculate completion percentage
   - `completeWizard(tenantId)` - Mark wizard as completed

## API Endpoints

### Configuration Status

```
GET /api/configuration/status
```

Returns the configuration status for the current tenant, including:
- Completion status and percentage
- Missing configuration items
- Certificate validation status
- RUC configuration status

**Response:**
```json
{
  "success": true,
  "data": {
    "isComplete": false,
    "completionPercentage": 75,
    "missingItems": ["Certificado digital"],
    "certificate": {
      "exists": false,
      "isValid": false
    },
    "ruc": {
      "isConfigured": true,
      "missingFields": []
    }
  }
}
```

### Wizard Progress

```
GET /api/configuration/wizard/progress
```

Returns the wizard progress for the current tenant.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "pasoActual": 3,
    "pasosCompletados": [1, 2, 3],
    "completionPercentage": 60,
    "completado": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### Save Wizard Step

```
POST /api/configuration/wizard/step
```

Saves the current wizard step progress.

**Request Body:**
```json
{
  "pasoActual": 3,
  "configuracionTemporal": {
    "ruc": "20000000001",
    "razonSocial": "Mi Empresa SAC"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Progreso del wizard guardado exitosamente",
  "data": {
    "id": "uuid",
    "pasoActual": 3,
    "pasosCompletados": [1, 2, 3],
    "completionPercentage": 60
  }
}
```

### Complete Configuration

```
POST /api/configuration/complete
```

Marks the configuration wizard as completed. Validates that all required configuration is complete before marking as done.

**Response:**
```json
{
  "success": true,
  "message": "Configuración completada exitosamente",
  "data": {
    "completedAt": "2024-01-01T00:00:00Z"
  }
}
```

### GRE Thresholds

```
GET /api/configuration/gre-thresholds
```

Returns the GRE automatic creation thresholds.

**Response:**
```json
{
  "success": true,
  "data": {
    "umbralGREAutomatico": 700.0,
    "greAutomaticoHabilitado": true
  }
}
```

```
PUT /api/configuration/gre-thresholds
```

Updates the GRE automatic creation thresholds.

**Request Body:**
```json
{
  "umbralGREAutomatico": 800.0,
  "greAutomaticoHabilitado": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Umbrales de GRE actualizados exitosamente",
  "data": {
    "umbralGREAutomatico": 800.0,
    "greAutomaticoHabilitado": true
  }
}
```

## Database Schema

The module uses the following database tables:

### wizard_progress

Stores wizard progress for each tenant:

```sql
CREATE TABLE wizard_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  paso_actual INTEGER DEFAULT 1,
  pasos_completados JSONB DEFAULT '[]',
  configuracion_temporal JSONB,
  completado BOOLEAN DEFAULT FALSE,
  completado_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### empresa_config (extended)

Extended with new columns for configuration tracking:

```sql
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS
  configuracion_completa BOOLEAN DEFAULT FALSE,
  fecha_validacion_certificado TIMESTAMP,
  certificado_expira_en DATE,
  umbral_gre_automatico DECIMAL(10,2) DEFAULT 700.00,
  gre_automatico_habilitado BOOLEAN DEFAULT TRUE,
  ultima_validacion TIMESTAMP,
  errores_configuracion JSONB;
```

## Integration

The Configuration Service integrates with:

- **ValidationService** - For certificate and RUC validation
- **SupabaseService** - For database operations
- **Auth Module** - For tenant context via `@CurrentUser()` decorator

## Usage Example

```typescript
import { ConfigurationService } from './modules/configuracion';

// In a controller or service
constructor(private readonly configService: ConfigurationService) {}

async checkConfiguration(tenantId: string) {
  const status = await this.configService.getConfigurationStatus(tenantId);
  
  if (!status.isComplete) {
    console.log('Missing items:', status.missingItems);
    console.log('Completion:', status.completionPercentage + '%');
  }
}
```

## Requirements Covered

This implementation covers the following requirements from the spec:

- **Requirement 3.1**: Configuration status verification
- **Requirement 3.2**: Wizard progress tracking
- **Requirement 3.4**: Configuration validation
- **Requirement 3.5**: Step-by-step wizard flow
- **Requirement 3.6**: Progress persistence
- **Requirement 3.7**: Configuration completeness indicators
