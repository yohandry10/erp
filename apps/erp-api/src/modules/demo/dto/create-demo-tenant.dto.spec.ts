import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConvertDemoToRealDto, CreateDemoTenantDto } from './create-demo-tenant.dto';

const base = {
  email: 'cliente@example.com',
  password: 'Segura123!',
  razon_social: 'Empresa Comercial SAC',
  ruc: '20123456786',
};

describe('ConvertDemoToRealDto commercial period', () => {
  it.each(['trimestral', 'semestral', 'anual'])('acepta el plazo %s', async (periodo) => {
    const dto = plainToInstance(ConvertDemoToRealDto, { ...base, periodo });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['mensual', '18_meses', ''])('rechaza el plazo no comercial %s', async (periodo) => {
    const dto = plainToInstance(ConvertDemoToRealDto, { ...base, periodo });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'periodo')).toBe(true);
  });
});

describe('CreateDemoTenantDto business sector', () => {
  it.each(['COMERCIO', 'DISTRIBUCION', 'SERVICIOS', 'RESTAURANTE', 'MANUFACTURA'])(
    'acepta el rubro %s',
    async (rubro) => {
      await expect(validate(plainToInstance(CreateDemoTenantDto, { rubro }))).resolves.toHaveLength(0);
    },
  );

  it('rechaza un rubro inventado por el cliente', async () => {
    const errors = await validate(plainToInstance(CreateDemoTenantDto, { rubro: 'CRIPTOCASINO' }));
    expect(errors.some((error) => error.property === 'rubro')).toBe(true);
  });
});
