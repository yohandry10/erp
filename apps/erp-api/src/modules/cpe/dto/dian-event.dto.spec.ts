import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DIAN_IDENTITY_TYPES, normalizeDianIdentityType } from '../../fiscal/colombia/dian-document.util';
import { CreateDianEventDto } from './dian-event.dto';

describe('CreateDianEventDto identidad DIAN', () => {
  it.each(DIAN_IDENTITY_TYPES)('acepta el tipo oficial %s que entiende el normalizador', async (identityType) => {
    expect(normalizeDianIdentityType(identityType)).toBe(identityType);
    const dto = plainToInstance(CreateDianEventDto, {
      eventCode: '030',
      responsiblePerson: {
        identityType,
        identityNumber: identityType === '31' ? '9001234568' : '123456789',
        firstName: 'Ana',
        familyName: 'Pérez',
        jobTitle: 'Compradora',
        organizationDepartment: 'Compras',
      },
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['21', '42'])('rechaza el tipo no soportado %s en DTO, antes de orquestar', async (identityType) => {
    const dto = plainToInstance(CreateDianEventDto, {
      eventCode: '030',
      responsiblePerson: {
        identityType,
        identityNumber: '123456789',
        firstName: 'Ana', familyName: 'Pérez', jobTitle: 'Compradora',
        organizationDepartment: 'Compras',
      },
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
