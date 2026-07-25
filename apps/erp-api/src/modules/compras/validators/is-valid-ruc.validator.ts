import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'isValidRuc', async: false })
export class IsValidRucConstraint implements ValidatorConstraintInterface {
  validate(ruc: string, args: ValidationArguments): boolean {
    if (!ruc) {
      return false;
    }

    const cleanRuc = ruc.trim();

    // Validar que solo contenga números
    if (!/^\d+$/.test(cleanRuc)) {
      return false;
    }

    // Scope inicial: Peru/SUNAT. Otros paises quedan en roadmap.
    return cleanRuc.length === 11;
  }

  defaultMessage(args: ValidationArguments): string {
    return 'El RUC debe tener 11 dígitos y contener solo números';
  }
}

export function IsValidRuc(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidRucConstraint,
    });
  };
}
