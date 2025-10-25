import assert from 'assert';
import { ProveedoresService } from '../src/modules/compras/services/proveedores.service';

// Mock del repositorio
const mockRepository = {
  findAll: async () => [],
  findById: async () => null,
  findByRuc: async () => null,
  create: async (dto: any) => ({ id: 'test-id', ...dto }),
  update: async () => ({}),
  softDelete: async () => ({})
};

const service = new ProveedoresService(mockRepository as any);

async function testEmailValidation() {
  const tenantId = 'test-tenant-123';
  
  // Test 1: Email válido debe pasar
  console.log('Test 1: Email válido debe pasar');
  try {
    const validDto = {
      ruc: '20123456789',
      razon_social: 'Test Company SAC',
      email: 'contacto@testcompany.com',
      condiciones_pago: 'CONTADO' as any,
      limite_credito: 0,
      dias_credito: 0
    };
    
    await service.create(validDto, tenantId);
    console.log('✅ Email válido aceptado correctamente');
  } catch (error: any) {
    console.error('❌ Error inesperado con email válido:', error.message);
    throw error;
  }

  // Test 2: Email sin @ debe fallar
  console.log('\nTest 2: Email sin @ debe fallar');
  try {
    const invalidDto1 = {
      ruc: '20123456788',
      razon_social: 'Test Company 2 SAC',
      email: 'contactotestcompany.com',
      condiciones_pago: 'CONTADO' as any,
      limite_credito: 0,
      dias_credito: 0
    };
    
    await service.create(invalidDto1, tenantId);
    console.error('❌ Email sin @ fue aceptado incorrectamente');
    throw new Error('Validación falló: email sin @ fue aceptado');
  } catch (error: any) {
    if (error.message.includes('email') && error.message.includes('válido')) {
      console.log('✅ Email sin @ rechazado correctamente');
    } else {
      console.error('❌ Error inesperado:', error.message);
      throw error;
    }
  }

  // Test 3: Email sin dominio debe fallar
  console.log('\nTest 3: Email sin dominio debe fallar');
  try {
    const invalidDto2 = {
      ruc: '20123456787',
      razon_social: 'Test Company 3 SAC',
      email: 'contacto@',
      condiciones_pago: 'CONTADO' as any,
      limite_credito: 0,
      dias_credito: 0
    };
    
    await service.create(invalidDto2, tenantId);
    console.error('❌ Email sin dominio fue aceptado incorrectamente');
    throw new Error('Validación falló: email sin dominio fue aceptado');
  } catch (error: any) {
    if (error.message.includes('email') && error.message.includes('válido')) {
      console.log('✅ Email sin dominio rechazado correctamente');
    } else {
      console.error('❌ Error inesperado:', error.message);
      throw error;
    }
  }

  // Test 4: Email sin extensión debe fallar
  console.log('\nTest 4: Email sin extensión debe fallar');
  try {
    const invalidDto3 = {
      ruc: '20123456786',
      razon_social: 'Test Company 4 SAC',
      email: 'contacto@testcompany',
      condiciones_pago: 'CONTADO' as any,
      limite_credito: 0,
      dias_credito: 0
    };
    
    await service.create(invalidDto3, tenantId);
    console.error('❌ Email sin extensión fue aceptado incorrectamente');
    throw new Error('Validación falló: email sin extensión fue aceptado');
  } catch (error: any) {
    if (error.message.includes('email') && error.message.includes('válido')) {
      console.log('✅ Email sin extensión rechazado correctamente');
    } else {
      console.error('❌ Error inesperado:', error.message);
      throw error;
    }
  }

  // Test 5: Email con espacios debe fallar
  console.log('\nTest 5: Email con espacios debe fallar');
  try {
    const invalidDto4 = {
      ruc: '20123456785',
      razon_social: 'Test Company 5 SAC',
      email: 'contacto @testcompany.com',
      condiciones_pago: 'CONTADO' as any,
      limite_credito: 0,
      dias_credito: 0
    };
    
    await service.create(invalidDto4, tenantId);
    console.error('❌ Email con espacios fue aceptado incorrectamente');
    throw new Error('Validación falló: email con espacios fue aceptado');
  } catch (error: any) {
    if (error.message.includes('email') && error.message.includes('válido')) {
      console.log('✅ Email con espacios rechazado correctamente');
    } else {
      console.error('❌ Error inesperado:', error.message);
      throw error;
    }
  }

  // Test 6: Email válido con subdominios debe pasar
  console.log('\nTest 6: Email válido con subdominios debe pasar');
  try {
    const validDto2 = {
      ruc: '20123456784',
      razon_social: 'Test Company 6 SAC',
      email: 'contacto@ventas.testcompany.com.pe',
      condiciones_pago: 'CONTADO' as any,
      limite_credito: 0,
      dias_credito: 0
    };
    
    await service.create(validDto2, tenantId);
    console.log('✅ Email con subdominios aceptado correctamente');
  } catch (error: any) {
    console.error('❌ Error inesperado con email válido con subdominios:', error.message);
    throw error;
  }

  // Test 7: Email vacío debe fallar (si es requerido)
  console.log('\nTest 7: Email vacío debe fallar');
  try {
    const invalidDto5 = {
      ruc: '20123456783',
      razon_social: 'Test Company 7 SAC',
      email: '',
      condiciones_pago: 'CONTADO' as any,
      limite_credito: 0,
      dias_credito: 0
    };
    
    await service.create(invalidDto5, tenantId);
    console.error('❌ Email vacío fue aceptado incorrectamente');
    throw new Error('Validación falló: email vacío fue aceptado');
  } catch (error: any) {
    if (error.message.includes('email') && error.message.includes('válido')) {
      console.log('✅ Email vacío rechazado correctamente');
    } else {
      console.error('❌ Error inesperado:', error.message);
      throw error;
    }
  }

  console.log('\n✅ Todas las pruebas de validación de email pasaron correctamente');
}

// Ejecutar tests
testEmailValidation()
  .then(() => {
    console.log('\n🎉 Suite de tests de email completada exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Suite de tests falló:', error);
    process.exit(1);
  });
