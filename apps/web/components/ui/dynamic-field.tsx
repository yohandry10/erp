import React from 'react';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Label } from './label';
import { useCountryConfig } from '../../hooks/use-country-config';

interface DynamicFieldProps {
  name: string;
  type?: 'text' | 'select' | 'number' | 'date' | 'documento' | 'moneda';
  value: any;
  onChange: (value: any) => void;
  options?: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
}

export const DynamicField: React.FC<DynamicFieldProps> = ({
  name,
  type = 'text',
  value,
  onChange,
  options,
  className,
  placeholder
}) => {
  const {
    getLabel,
    getValidationRule,
    isFieldRequired,
    getDocumentTypes,
    getTaxTypes,
    getCurrencies
  } = useCountryConfig();

  const label = getLabel(name);
  const required = isFieldRequired(name);
  const validationRule = getValidationRule(name);

  // Obtener opciones dinámicas según el tipo de campo
  const getDynamicOptions = () => {
    switch (type) {
      case 'documento':
        return getDocumentTypes().map(doc => ({
          value: doc.codigo,
          label: doc.nombre
        }));
      case 'moneda':
        return getCurrencies().map(currency => ({
          value: currency.code,
          label: `${currency.name} (${currency.symbol})`
        }));
      default:
        switch (name) {
          case 'tipoDocumento':
            return getDocumentTypes().map(doc => ({
              value: doc.codigo,
              label: doc.nombre
            }));
          case 'tipoImpuesto':
            return getTaxTypes().map(tax => ({
              value: tax.codigo,
              label: tax.nombre
            }));
          case 'moneda':
            return getCurrencies().map(currency => ({
              value: currency.code,
              label: `${currency.name} (${currency.symbol})`
            }));
          default:
            return options || [];
        }
    }
  };

  const fieldOptions = getDynamicOptions();

  const renderField = () => {
    switch (type) {
      case 'select':
      case 'documento':
      case 'moneda':
        return (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={className}>
              <SelectValue placeholder={placeholder || `Seleccionar ${label}`} />
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className={className}
            placeholder={placeholder}
            min={validationRule?.min}
            max={validationRule?.max}
            step={validationRule?.step || 0.01}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={className}
            placeholder={placeholder}
          />
        );

      default:
        return (
          <Input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={className}
            placeholder={placeholder}
            maxLength={validationRule?.maxLength}
            pattern={validationRule?.pattern}
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {renderField()}
      {validationRule?.helpText && (
        <p className="text-sm text-muted-foreground">{validationRule.helpText}</p>
      )}
    </div>
  );
};