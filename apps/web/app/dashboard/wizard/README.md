# Configuration Wizard

<!-- DOC-NAV:START -->
> Navegacion documental: primero lee `docs/START_HERE.md`. Estado vivo: `docs/00_coordination/CURRENT_STATE.md` y `docs/00_coordination/FLOW_STATUS.md`. Mapa completo: `docs/DOC_NAVIGATION_MANIFEST.md`.
>
> Rol de este archivo: `frontend_local`.
>
> Leer tambien: `docs/START_HERE.md`, `docs/00_coordination/FLOW_STATUS.md`.
>
> Regla: si este documento contradice codigo verificado o docs canonicos, prevalecen codigo actual + `START_HERE` + `CURRENT_STATE` + `FLOW_STATUS`.
<!-- DOC-NAV:END -->

This directory contains the implementation of the Configuration Wizard for the SUNAT validations and GRE automation feature.

## Overview

The Configuration Wizard guides new users through the initial setup process, including:
- Company information (RUC, business name, address)
- Digital certificate upload
- Configuration validation
- Setup completion

## Structure

```
wizard/
├── types.ts                    # TypeScript interfaces and types
├── WizardContext.tsx          # React Context for wizard state management
├── useWizard.ts               # Custom hook for wizard logic and API calls
├── WizardContainer.tsx        # Main container with navigation and progress
├── page.tsx                   # Next.js page component
├── steps/
│   ├── WelcomeStep.tsx        # Introduction step
│   ├── RucConfigStep.tsx      # RUC configuration form
│   ├── CertificateUploadStep.tsx  # Certificate upload with validation
│   ├── ValidationStep.tsx     # Configuration validation results
│   └── CompletionStep.tsx     # Success confirmation
└── README.md                  # This file
```

## Features Implemented

### 7.1 Wizard Component Structure ✓
- Created modular wizard architecture with Context API
- Implemented state management with useReducer
- Created reusable wizard container with navigation
- Built custom hook for wizard logic

### 7.2 Wizard Steps Components ✓
- **WelcomeStep**: Introduction with feature overview
- **RucConfigStep**: Form for company data (RUC, business name, address)
- **CertificateUploadStep**: File upload with validation
- **ValidationStep**: Real-time validation results display
- **CompletionStep**: Success confirmation with next steps

### 7.3 Certificate Upload Functionality ✓
- File input for PFX/P12 certificates
- Password input with show/hide toggle
- Client-side file format validation
- Base64 conversion for API transmission
- Upload progress indicator
- File size validation (max 5MB)

### 7.4 Wizard Navigation and Validation ✓
- Next/Previous buttons with smart enabling
- Progress indicator showing current step
- Step completion tracking
- Validation before allowing navigation
- Auto-save progress on each step

### 7.5 Backend API Integration ✓
- `/api/configuration/wizard/progress` - Load saved progress
- `/api/configuration/wizard/step` - Save step data
- `/api/validations/certificate` - Validate certificate
- `/api/validations/ruc` - Validate RUC configuration
- `/api/configuration/complete` - Complete wizard

### 7.6 Auto-Launch for New Users ✓
- Configuration status check on dashboard load
- Modal prompt for incomplete configuration
- Persistent banner with completion percentage
- Dismissible banner with "Complete Setup" action
- Automatic redirect to wizard when needed

## Usage

### Accessing the Wizard

Users can access the wizard in three ways:

1. **Automatic Modal**: Shows on dashboard if configuration is incomplete
2. **Banner Link**: Click "Completar Configuración" in the dashboard banner
3. **Direct URL**: Navigate to `/dashboard/wizard`

### Wizard Flow

1. **Welcome** - Introduction and overview
2. **RUC Config** - Enter company information
3. **Certificate** - Upload digital certificate
4. **Validation** - System validates configuration
5. **Completion** - Success message and redirect to dashboard

## State Management

The wizard uses React Context API for state management:

```typescript
interface WizardState {
  currentStep: number
  steps: WizardStep[]
  configuration: WizardConfiguration
  validationResults: WizardValidationResults
  isLoading: boolean
  error: string | null
}
```

## API Integration

All API calls are handled through the `useWizard` hook:

```typescript
const {
  state,
  goToStep,
  nextStep,
  previousStep,
  updateConfiguration,
  loadProgress,
  saveStepProgress,
  validateCertificate,
  validateRuc,
  completeWizard,
  canGoNext,
} = useWizard()
```

## Styling

The wizard uses inline styles consistent with the existing dashboard design:
- Glassmorphism effects
- Gradient backgrounds
- Smooth transitions
- Responsive layout
- Accessible color contrast

## Error Handling

- Network errors are caught and displayed to users
- Validation errors show specific field issues
- File upload errors provide clear feedback
- API errors are logged and shown in UI

## Security

- Certificate files are converted to base64 for secure transmission
- Passwords are never logged or exposed
- File size limits prevent abuse
- File type validation prevents malicious uploads

## Future Enhancements

- Multi-language support
- Step-by-step tooltips
- Keyboard navigation
- Progress persistence across sessions
- Email notifications on completion
