import { SupabaseService } from '../../shared/supabase/supabase.service';
export declare class UsuariosService {
    private readonly supabase;
    constructor(supabase: SupabaseService);
    findAll(): Promise<any[]>;
    findOne(id: string): Promise<any>;
    create(userData: any): Promise<any>;
    update(id: string, userData: any): Promise<any>;
}
