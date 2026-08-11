import { MODULE_METADATA } from '@nestjs/common/constants';
import { UsuariosModule } from './usuarios.module';
import { AuditModule } from '../audit/audit.module';

describe('UsuariosModule', () => {
  it('importa AuditModule para resolver AuditService del controlador', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, UsuariosModule) ?? [];
    expect(imports).toContain(AuditModule);
  });
});
