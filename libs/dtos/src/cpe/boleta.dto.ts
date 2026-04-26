import { CreateFacturaDto, FacturaDto, TipoDocumento } from './factura.dto';

// Boleta uses the same structure as Factura but with different document type
export class CreateBoletaDto extends CreateFacturaDto {
  tipo_documento = TipoDocumento.BOLETA; // Boleta de Venta
}

export class BoletaDto extends FacturaDto {} 