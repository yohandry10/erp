"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoletaDto = exports.CreateBoletaDto = void 0;
const factura_dto_1 = require("./factura.dto");
// Boleta uses the same structure as Factura but with different document type
class CreateBoletaDto extends factura_dto_1.CreateFacturaDto {
    constructor() {
        super(...arguments);
        this.tipo_documento = factura_dto_1.TipoDocumento.BOLETA; // Boleta de Venta
    }
}
exports.CreateBoletaDto = CreateBoletaDto;
class BoletaDto extends factura_dto_1.FacturaDto {
}
exports.BoletaDto = BoletaDto;
//# sourceMappingURL=boleta.dto.js.map