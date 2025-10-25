# Compras Module Validators

This directory contains custom validators for the Compras (Purchases) module.

## IsValidRuc Validator

Custom class-validator decorator that validates RUC (Registro Único de Contribuyentes) numbers for Peru and Colombia.

### Usage

```typescript
import { IsValidRuc } from '../validators/is-valid-ruc.validator';

export class CreateProveedorDto {
  @IsValidRuc({ message: 'El RUC debe tener 11 dígitos (Perú) o 9 dígitos (Colombia) y contener solo números' })
  ruc: string;
}
```

### Validation Rules

- **Peru**: RUC must be exactly 11 numeric digits
- **Colombia**: RUC must be exactly 9 numeric digits
- Must contain only numeric characters (0-9)
- Leading and trailing whitespace is automatically trimmed
- Empty, null, or undefined values are rejected

### Examples

**Valid RUCs:**
- `20123456789` (Peru - 11 digits)
- `123456789` (Colombia - 9 digits)
- ` 20123456789 ` (with spaces, automatically trimmed)

**Invalid RUCs:**
- `2012345678A` (contains letters)
- `1234567890` (10 digits - invalid length)
- `12345678` (8 digits - too short)
- `123456789012` (12 digits - too long)
- `20-123-456` (contains special characters)
- `` (empty string)

### Implementation Details

The validator is implemented as a custom `class-validator` constraint:

1. **IsValidRucConstraint**: The constraint class that implements the validation logic
2. **IsValidRuc**: The decorator function that can be applied to DTO properties

The validation is synchronous and does not require external API calls.

### Error Message

Default error message: `"El RUC debe tener 11 dígitos (Perú) o 9 dígitos (Colombia) y contener solo números"`

You can customize the error message by passing a custom message in the decorator options.
