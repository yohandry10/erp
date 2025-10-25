import { validate } from 'class-validator';
import { CreateProveedorDto } from '../src/modules/compras/dto/create-proveedor.dto';

async function testDTOEmailValidation() {
  console.log('=== Testing DTO Email Validation ===\n');

  // Test 1: Valid email should pass
  console.log('Test 1: Valid email should pass');
  const validDto = new CreateProveedorDto();
  validDto.ruc = '20123456789';
  validDto.razon_social = 'Test Company SAC';
  validDto.email = 'contacto@testcompany.com';

  const validErrors = await validate(validDto);
  const emailErrors = validErrors.filter(e => e.property === 'email');
  
  if (emailErrors.length === 0) {
    console.log('✅ Valid email passed DTO validation\n');
  } else {
    console.error('❌ Valid email failed DTO validation:', emailErrors);
    throw new Error('Valid email should not have validation errors');
  }

  // Test 2: Invalid email without @ should fail
  console.log('Test 2: Invalid email without @ should fail');
  const invalidDto1 = new CreateProveedorDto();
  invalidDto1.ruc = '20123456789';
  invalidDto1.razon_social = 'Test Company SAC';
  invalidDto1.email = 'contactotestcompany.com';

  const errors1 = await validate(invalidDto1);
  const emailErrors1 = errors1.filter(e => e.property === 'email');
  
  if (emailErrors1.length > 0) {
    console.log('✅ Invalid email (no @) rejected by DTO validation');
    console.log('   Error message:', Object.values(emailErrors1[0].constraints || {})[0]);
    console.log('');
  } else {
    console.error('❌ Invalid email (no @) passed DTO validation');
    throw new Error('Invalid email should have validation errors');
  }

  // Test 3: Invalid email without domain should fail
  console.log('Test 3: Invalid email without domain should fail');
  const invalidDto2 = new CreateProveedorDto();
  invalidDto2.ruc = '20123456789';
  invalidDto2.razon_social = 'Test Company SAC';
  invalidDto2.email = 'contacto@';

  const errors2 = await validate(invalidDto2);
  const emailErrors2 = errors2.filter(e => e.property === 'email');
  
  if (emailErrors2.length > 0) {
    console.log('✅ Invalid email (no domain) rejected by DTO validation');
    console.log('   Error message:', Object.values(emailErrors2[0].constraints || {})[0]);
    console.log('');
  } else {
    console.error('❌ Invalid email (no domain) passed DTO validation');
    throw new Error('Invalid email should have validation errors');
  }

  // Test 4: Invalid email without extension should fail
  console.log('Test 4: Invalid email without extension should fail');
  const invalidDto3 = new CreateProveedorDto();
  invalidDto3.ruc = '20123456789';
  invalidDto3.razon_social = 'Test Company SAC';
  invalidDto3.email = 'contacto@testcompany';

  const errors3 = await validate(invalidDto3);
  const emailErrors3 = errors3.filter(e => e.property === 'email');
  
  if (emailErrors3.length > 0) {
    console.log('✅ Invalid email (no extension) rejected by DTO validation');
    console.log('   Error message:', Object.values(emailErrors3[0].constraints || {})[0]);
    console.log('');
  } else {
    console.error('❌ Invalid email (no extension) passed DTO validation');
    throw new Error('Invalid email should have validation errors');
  }

  // Test 5: Empty email should fail
  console.log('Test 5: Empty email should fail');
  const invalidDto4 = new CreateProveedorDto();
  invalidDto4.ruc = '20123456789';
  invalidDto4.razon_social = 'Test Company SAC';
  invalidDto4.email = '';

  const errors4 = await validate(invalidDto4);
  const emailErrors4 = errors4.filter(e => e.property === 'email');
  
  if (emailErrors4.length > 0) {
    console.log('✅ Empty email rejected by DTO validation');
    console.log('   Error message:', Object.values(emailErrors4[0].constraints || {})[0]);
    console.log('');
  } else {
    console.error('❌ Empty email passed DTO validation');
    throw new Error('Empty email should have validation errors');
  }

  // Test 6: Valid email with subdomains should pass
  console.log('Test 6: Valid email with subdomains should pass');
  const validDto2 = new CreateProveedorDto();
  validDto2.ruc = '20123456789';
  validDto2.razon_social = 'Test Company SAC';
  validDto2.email = 'contacto@ventas.testcompany.com.pe';

  const validErrors2 = await validate(validDto2);
  const emailErrors5 = validErrors2.filter(e => e.property === 'email');
  
  if (emailErrors5.length === 0) {
    console.log('✅ Valid email with subdomains passed DTO validation\n');
  } else {
    console.error('❌ Valid email with subdomains failed DTO validation:', emailErrors5);
    throw new Error('Valid email with subdomains should not have validation errors');
  }

  // Test 7: Email with special characters should pass
  console.log('Test 7: Valid email with special characters should pass');
  const validDto3 = new CreateProveedorDto();
  validDto3.ruc = '20123456789';
  validDto3.razon_social = 'Test Company SAC';
  validDto3.email = 'contacto+ventas@testcompany.com';

  const validErrors3 = await validate(validDto3);
  const emailErrors6 = validErrors3.filter(e => e.property === 'email');
  
  if (emailErrors6.length === 0) {
    console.log('✅ Valid email with special characters passed DTO validation\n');
  } else {
    console.error('❌ Valid email with special characters failed DTO validation:', emailErrors6);
    throw new Error('Valid email with special characters should not have validation errors');
  }

  console.log('✅ All DTO email validation tests passed successfully');
}

// Run tests
testDTOEmailValidation()
  .then(() => {
    console.log('\n🎉 DTO validation test suite completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ DTO validation test suite failed:', error);
    process.exit(1);
  });
