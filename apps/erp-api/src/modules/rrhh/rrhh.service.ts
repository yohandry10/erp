import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../shared/supabase/supabase.service';

@Injectable()
export class RrhhService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getEmpleados() {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleados')
      .select(`
        *,
        departamentos(nombre),
        contratos(*)
      `);
    if (error) throw error;
    return {
      success: true,
      data: data || []
    };
  }

  async getDepartamentos() {
    const { data, error } = await this.supabaseService.getClient()
      .from('departamentos')
      .select('*');
    if (error) throw error;
    return data;
  }

  async createEmpleado(empleadoData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('empleados')
      .insert(empleadoData)
      .select();
    if (error) throw error;
    return data[0];
  }

  async createDepartamento(departamentoData: any) {
    const { data, error } = await this.supabaseService.getClient()
      .from('departamentos')
      .insert(departamentoData)
      .select();
    if (error) throw error;
    return data[0];
  }

  async debugEmpleadosContratos() {
    const client = this.supabaseService.getClient();
    
    console.log('🔍 DEBUG: Verificando empleados y contratos...');
    
    // Obtener empleados
    const { data: empleados, error: empleadosError } = await client
      .from('empleados')
      .select('*')
      .eq('estado', 'activo');
    
    console.log('👥 Empleados activos:', empleados?.length || 0);
    if (empleados) {
      empleados.forEach(emp => {
        console.log(`  - ${emp.nombres} ${emp.apellidos} (${emp.numero_documento})`);
      });
    }
    
    // Obtener contratos
    const { data: contratos, error: contratosError } = await client
      .from('contratos')
      .select('*')
      .eq('estado', 'vigente');
    
    console.log('📄 Contratos vigentes:', contratos?.length || 0);
    if (contratos) {
      contratos.forEach(cont => {
        console.log(`  - Empleado ID: ${cont.id_empleado}, Sueldo: ${cont.sueldo_bruto}`);
      });
    }
    
    // Obtener empleados CON contratos
    const { data: empleadosConContratos, error: joinError } = await client
      .from('empleados')
      .select('*, contratos(*)')
      .eq('estado', 'activo');
    
    console.log('👥 Empleados con contratos:', empleadosConContratos?.length || 0);
    if (empleadosConContratos) {
      empleadosConContratos.forEach(emp => {
        const contratoVigente = emp.contratos?.find(c => c.estado === 'vigente');
        console.log(`  - ${emp.nombres}: ${contratoVigente ? 'SÍ TIENE CONTRATO' : 'NO TIENE CONTRATO'}`);
      });
    }
    
    return {
      totalEmpleados: empleados?.length || 0,
      totalContratos: contratos?.length || 0,
      empleadosConContratosCount: empleadosConContratos?.length || 0,
      empleados,
      contratos,
      empleadosConContratos
    };
  }
} 