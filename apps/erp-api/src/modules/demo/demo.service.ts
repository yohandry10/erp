import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseService } from "../../shared/supabase/supabase.service";
import { TenantContextService } from "../../shared/tenant/tenant-context.service";
import { AuthService } from "../auth/auth.service";
import * as bcrypt from "bcrypt";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import {
  CreateDemoTenantDto,
  ConvertDemoToRealDto,
} from "./dto/create-demo-tenant.dto";
import { StripeService } from "./stripe.service";
import {
  parseCertificateBuffer,
  toPostgresBytea,
} from "../../shared/utils/certificate.utils";
import {
  encryptBuffer,
  encryptText,
} from "../../shared/utils/secure-config.utils";
import { CacheInvalidationService } from "../../shared/cache/cache-invalidation.service";

const PLANES = {
  basico: {
    id: "basico",
    nombre: "Plan Básico",
    precio_mensual: 99.0,
    precio_anual: 990.0,
    moneda: "PEN",
    usuarios: 5,
    facturas_mes: 1000,
  },
  profesional: {
    id: "profesional",
    nombre: "Plan Profesional",
    precio_mensual: 199.0,
    precio_anual: 1990.0,
    moneda: "PEN",
    usuarios: 15,
    facturas_mes: -1,
  },
  enterprise: {
    id: "enterprise",
    nombre: "Plan Enterprise",
    precio_mensual: 499.0,
    precio_anual: 4990.0,
    moneda: "PEN",
    usuarios: -1,
    facturas_mes: -1,
  },
};

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly authService: AuthService,
    private readonly stripeService: StripeService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  private get client() {
    return this.supabase.getPublicClient();
  }

  async createDemoTenant(dto: CreateDemoTenantDto = {}) {
    const diasDuracion = dto.dias_duracion || 14;
    const nombre = dto.nombre || "DEMO COMERCIAL SAC";

    try {
      const { data, error } = await this.client.rpc("create_demo_tenant", {
        p_nombre: nombre,
        p_dias_duracion: diasDuracion,
      });

      if (error) throw new Error(error.message);
      if (!data || !data.success)
        throw new Error("No se pudo crear el tenant demo");

      // Seed operacional best-effort: el RPC crea tenant + empresa + admin pero
      // deja el tenant "esqueleto". Agregamos datos mínimos para que el demo sea
      // realmente usable (POS, CPE, Inventario, Contabilidad). Una falla aquí
      // NO debe romper el flujo de creación de demo.
      // Como /api/demo/create es Public (sin auth), no hay tenant context en
      // AsyncLocalStorage. Lo seteamos explícitamente para que el guard de
      // tablas multi-tenant deje pasar los inserts.
      const seedResult = await this.tenantContext.run(
        {
          tenantId: data.tenant_id,
          userId: data.user_id,
          isSuperAdmin: true, // seed system-level
        },
        () =>
          this.seedDemoOperationalData(data.tenant_id, data.user_id).catch(
            (err) => {
              this.logger.warn(
                `[demo seed] fallo parcial al hidratar tenant ${data.tenant_id}: ${err?.message || err}`,
              );
              return {
                aprobadorUserId: null,
                aprobadorEmail: null,
                aprobadorPassword: null,
              };
            },
          ),
      );

      // El dashboard puede consultar sus métricas apenas inicia la sesión. Si
      // algún dato quedó cacheado durante la hidratación, lo descartamos antes
      // de devolver las credenciales para que la primera vista refleje el seed.
      await this.cacheInvalidation.invalidateAllTenantCache(data.tenant_id);

      // Emitir siempre una sesión revocable. Los JWT firmados directamente sin
      // `session_token` son rechazados por JwtStrategy y dejaban el token de la
      // respuesta /demo/create inutilizable.
      const authResult = await this.authService.login(
        { email: data.email, password: data.password },
        "demo-api",
        "demo-create",
      );
      const token = authResult.access_token;

      return {
        success: true,
        tenant_id: data.tenant_id,
        user_id: data.user_id,
        email: data.email,
        password: data.password,
        token,
        expires_at: data.expires_at,
        dias_restantes: data.dias_restantes,
        // Segundo user para flujos que requieren segregación de funciones
        // (e.g., aprobar OC que tú no creaste).
        aprobador_user_id: seedResult.aprobadorUserId,
        aprobador_email: seedResult.aprobadorEmail,
        aprobador_password: seedResult.aprobadorPassword,
      };
    } catch (error) {
      throw new BadRequestException(
        `Error creando tenant demo: ${error.message}`,
      );
    }
  }

  // ============================================================================
  // SEED OPERACIONAL — datos mínimos para que el demo sea funcional
  // ============================================================================

  /**
   * Hidrata el tenant demo con datos operativos mínimos: almacén, plan contable
   * básico, métodos de pago, caja y certificado de prueba.
   * Cada paso es independiente (allSettled) para que una falla parcial no rompa
   * los demás. Sin esto los e2e/flujos cross-module fallan por gaps de setup
   * (no por bugs).
   */
  /**
   * Resultado del seed operacional. Incluye datos del segundo user "aprobador"
   * que el flow de aprobación de OC requiere (segregación de funciones).
   */
  private async seedDemoOperationalData(
    tenantId: string,
    primerUserId: string,
  ): Promise<{
    aprobadorUserId: string | null;
    aprobadorEmail: string | null;
    aprobadorPassword: string | null;
  }> {
    let aprobadorResult: {
      userId: string;
      email: string;
      password: string;
    } | null = null;
    // Productos/existencias dependen del almacén principal. Ejecutar ambos en
    // paralelo hacía que el seed fallara de forma intermitente aun en tenants
    // recién creados. El resto de pasos sí es independiente.
    const [almacenResult] = await Promise.allSettled([
      this.seedAlmacenDefault(tenantId),
    ]);
    const independentResults = await Promise.allSettled([
      this.seedPlanContableMinimo(tenantId),
      this.seedMetodosPago(tenantId),
      this.seedCajaDefault(tenantId, primerUserId),
      this.seedCertificadoDemo(tenantId),
      this.seedProductosDemo(tenantId),
      this.seedClientesDemo(tenantId),
      this.seedProveedoresDemo(tenantId),
      this.seedCuentaBancariaDemo(tenantId),
      this.seedEmpleadoDemo(tenantId),
      this.seedSegundoUserAprobador(tenantId, primerUserId).then((r) => {
        aprobadorResult = r;
      }),
    ]);
    const results = [almacenResult, ...independentResults];
    const stepNames = [
      "almacen",
      "plan_cuentas",
      "metodos_pago",
      "caja",
      "certificado",
      "productos",
      "clientes",
      "aprobador",
    ];
    const failures = results
      .map((r, i) => ({ r, step: stepNames[i] }))
      .filter((x) => x.r.status === "rejected");
    if (failures.length) {
      this.logger.warn(
        `[demo seed] ${failures.length}/${results.length} pasos fallaron para tenant ${tenantId}: ${failures
          .map(
            (f) =>
              `${f.step}=${(f.r as PromiseRejectedResult).reason?.message || "unknown"}`,
          )
          .join(", ")}`,
      );
    } else {
      this.logger.log(
        `[demo seed] tenant ${tenantId} hidratado con datos operativos completos`,
      );
    }
    return {
      aprobadorUserId: aprobadorResult?.userId ?? null,
      aprobadorEmail: aprobadorResult?.email ?? null,
      aprobadorPassword: aprobadorResult?.password ?? null,
    };
  }

  /**
   * Crea un segundo usuario con rol ADMIN para permitir el flujo de aprobación
   * con segregación de funciones (quien crea ≠ quien aprueba).
   *
   * El RPC create_demo_tenant solo crea 1 user. El endpoint
   * /api/compras/ordenes/:id/aprobar bloquea autoaprobación: si created_by ===
   * aprobador_id, lanza 400. Sin este segundo user, todo flow que incluya
   * aprobar OC falla (compras-vertical, contabilidad-completo, sire-completo).
   */
  private async seedSegundoUserAprobador(
    tenantId: string,
    primerUserId: string,
  ): Promise<{ userId: string; email: string; password: string }> {
    void primerUserId; // referencia futura: log audit / no-op por ahora
    const aprobadorId = randomUUID();
    const tenantShort = tenantId.slice(0, 8);
    const email = `aprobador-${tenantShort}@temp.local`;
    const password = `APR${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. usuarios_sistema (auth)
    const { error: usuarioError } = await this.adminClient
      .from("usuarios_sistema")
      .insert({
        id: aprobadorId,
        tenant_id: tenantId,
        nombre: "Aprobador",
        apellido: "Demo",
        email,
        nombre_usuario: "aprobador",
        password_hash: passwordHash,
        activo: true,
        estado: "ACTIVO",
        is_super_admin: false,
        is_demo_user: true,
        demo_email_temp: email,
      });
    if (usuarioError)
      throw new Error(`aprobador usuarios_sistema: ${usuarioError.message}`);

    // 2. users (dominio, espejo del id)
    const { error: usersError } = await this.adminClient.from("users").insert({
      id: aprobadorId,
      tenant_id: tenantId,
      email,
      nombre: "Aprobador",
      apellido: "Demo",
      activo: true,
      estado: "ACTIVO",
    });
    if (usersError) throw new Error(`aprobador users: ${usersError.message}`);

    // 3. Linkar al rol ADMIN existente (RPC ya lo creó)
    const { data: adminRole, error: roleError } = await this.adminClient
      .from("roles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("nombre", "ADMIN")
      .maybeSingle();
    if (roleError || !adminRole?.id) {
      throw new Error(
        `aprobador rol ADMIN no encontrado: ${roleError?.message || "sin data"}`,
      );
    }
    const { error: linkError } = await this.adminClient
      .from("user_roles")
      .insert({
        usuario_sistema_id: aprobadorId,
        role_id: adminRole.id,
        tenant_id: tenantId,
      });
    if (linkError)
      throw new Error(`aprobador user_roles: ${linkError.message}`);

    return { userId: aprobadorId, email, password };
  }

  // Para los seeds operacionales usamos getClient() (service_role) porque las
  // tablas multi-tenant están bloqueadas para getPublicClient(). El RPC
  // create_demo_tenant ya validó tenant_id, así que es seguro.
  private get adminClient() {
    return this.supabase.getClient();
  }

  private async seedAlmacenDefault(tenantId: string): Promise<void> {
    // Importante: además de `estado` (text), las tablas multi-tenant tienen
    // `activo` (boolean) que es lo que filtran los services. Sin éste el endpoint
    // devuelve [] aunque el row exista en DB.
    const { error } = await this.adminClient.from("almacenes").insert({
      tenant_id: tenantId,
      codigo: "ALM-PRINCIPAL",
      nombre: "Almacén Principal",
      estado: "ACTIVO",
      activo: true,
      es_principal: true,
    });
    if (error) throw new Error(`almacenes insert: ${error.message}`);
  }

  /**
   * Plan contable mínimo PCGE peruano (elementos 1-9). Los e2e de contabilidad
   * exigen cuentas 10, 12, 20, 40 al menos. Insertamos las 9 raíces para tener
   * estructura completa, todas con activo=true (campo que el e2e filtra).
   */
  private async seedPlanContableMinimo(tenantId: string): Promise<void> {
    const cuentas = [
      // Elementos PCGE peruano + cuentas de detalle que los e2e contables/RRHH
      // consultan explícitamente (621/627 RRHH, 411/403 planillas).
      {
        codigo: "10",
        nombre: "Efectivo y Equivalentes de Efectivo",
        tipo: "ACTIVO",
      },
      {
        codigo: "12",
        nombre: "Cuentas por Cobrar Comerciales - Terceros",
        tipo: "ACTIVO",
      },
      { codigo: "20", nombre: "Mercaderías", tipo: "ACTIVO" },
      { codigo: "40", nombre: "Tributos por Pagar", tipo: "PASIVO" },
      {
        codigo: "403",
        nombre: "Instituciones Públicas (ESSALUD/ONP)",
        tipo: "PASIVO",
      },
      { codigo: "411", nombre: "Remuneraciones por Pagar", tipo: "PASIVO" },
      {
        codigo: "42",
        nombre: "Cuentas por Pagar Comerciales - Terceros",
        tipo: "PASIVO",
      },
      { codigo: "50", nombre: "Capital", tipo: "PATRIMONIO" },
      { codigo: "60", nombre: "Compras", tipo: "GASTO" },
      {
        codigo: "621",
        nombre: "Remuneraciones - Sueldos y Salarios",
        tipo: "GASTO",
      },
      {
        codigo: "627",
        nombre: "Servicios Prestados por Terceros",
        tipo: "GASTO",
      },
      { codigo: "70", nombre: "Ventas", tipo: "INGRESO" },
      { codigo: "94", nombre: "Gastos de Administración", tipo: "GASTO" },
    ];
    const rows = cuentas.map((c) => ({
      tenant_id: tenantId,
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo,
      estado: "ACTIVO",
      activo: true,
      acepta_movimiento: true,
      nivel: 2,
    }));
    const { error } = await this.adminClient.from("plan_cuentas").insert(rows);
    if (error) throw new Error(`plan_cuentas insert: ${error.message}`);
  }

  private async seedMetodosPago(tenantId: string): Promise<void> {
    // `tipo` decide qué entra a la gaveta: sin él, la columna cae a su default
    // 'EFECTIVO' y una venta con tarjeta infla el efectivo esperado al arqueo.
    // La taxonomía es la del catálogo global (migración 024).
    const metodos = [
      { codigo: "EFECTIVO", nombre: "Efectivo", tipo: "EFECTIVO" },
      { codigo: "TARJETA", nombre: "Tarjeta", tipo: "TARJETA" },
      { codigo: "TRANSFERENCIA", nombre: "Transferencia bancaria", tipo: "TRANSFERENCIA" },
      { codigo: "YAPE", nombre: "Yape / Plin", tipo: "BILLETERA_DIGITAL" },
    ].map((m) => ({
      tenant_id: tenantId,
      ...m,
      estado: "ACTIVO",
      activo: true,
    }));
    const { error } = await this.adminClient
      .from("metodos_pago")
      .insert(metodos);
    if (error) throw new Error(`metodos_pago insert: ${error.message}`);
  }

  private async seedCajaDefault(tenantId: string, primerUserId?: string): Promise<void> {
    const { data: almacen, error: almacenError } = await this.adminClient
      .from("almacenes")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("codigo", "ALM-PRINCIPAL")
      .single();
    if (almacenError || !almacen?.id) {
      throw new Error(`caja: almacén principal no disponible: ${almacenError?.message || "sin id"}`);
    }

    const { data: caja, error } = await this.adminClient
      .from("cajas")
      .insert({
        tenant_id: tenantId,
        codigo: "CAJA-001",
        nombre: "Caja Principal",
        estado: "ACTIVO",
        almacen_id: almacen.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`cajas insert: ${error.message}`);

    // El demo promete "datos de ejemplo listos": dejar la caja YA ABIERTA con un
    // fondo inicial y atribuida al usuario demo. Sin esto, POS arranca bloqueado
    // ("Caja cerrada") y Cajas exige abrir sesión a mano en un tenant demo.
    if (caja?.id && primerUserId) {
      const { error: sesionError } = await this.adminClient
        .from("sesiones_caja")
        .insert({
          tenant_id: tenantId,
          caja_id: caja.id,
          cajero_id: primerUserId,
          abierto_por: primerUserId,
          monto_inicio: 100,
          moneda: "PEN",
          estado: "ABIERTA",
        });
      if (sesionError) {
        this.logger.warn(`[demo seed] sesión de caja abierta: ${sesionError.message}`);
      }
    }
  }

  /**
   * Carga certs/demo.pfx + DEMO_PFX_PASS en empresa_config.certificado_pfx para que
   * CPE/GRE puedan firmar comprobantes en modo demo. Sin esto, todo flujo
   * fiscal falla con "Certificado digital inválido".
   * No usa PFX_PATH/PFX_PASS porque esos pueden apuntar al certificado fiscal
   * real de un contribuyente.
   */
  private async seedCertificadoDemo(tenantId: string): Promise<void> {
    // 1) Config fiscal base SIEMPRE, independiente del PFX. Antes vivía en el
    //    mismo update que el certificado: si el PFX fallaba, el demo quedaba
    //    sin dirección fiscal ni SOL secundario y el usuario veía el modal
    //    "Configuración Incompleta" en un tenant que promete datos de ejemplo.
    const { error: baseError } = await this.adminClient
      .from("empresa_config")
      .update({
        // RUC válido SUNAT (módulo 11): prefijo 20 + 8 dígitos + checksum.
        // El sistema valida correctamente en otros endpoints (proveedores,
        // clientes), por eso necesitamos un RUC que cumpla el algoritmo.
        // 20123456786 → suma 148, 11 - (148 mod 11) = 6 ✓
        ruc: "20123456786",
        direccion_fiscal: "Av. Demo 123, Lima",
        ubigeo: "150101",
        departamento: "LIMA",
        provincia: "LIMA",
        distrito: "LIMA",
        configuracion_completa: true,
        // Credenciales SOL secundarias de homologación (usuario beta estándar
        // de SUNAT). Sin esto getConfigurationStatus() reporta la configuración
        // incompleta y el POS muestra el banner de advertencia permanente.
        sunat_environment: "homologacion",
        sunat_username: "20123456786MODDATOS",
        sunat_password: "MODDATOS",
        // Sin series no se puede numerar ni un comprobante, asi que el POS del
        // demo quedaba cojo justo en lo que el cliente entra a probar. Se usan
        // las series estandar: F para factura, B para boleta y FC para la nota
        // de credito que afecta a una factura.
        serie_factura: "F001",
        serie_boleta: "B001",
        serie_nota_credito: "FC01",
        // La columna gre_automatico_habilitado viene por defecto en true, lo que
        // exige una serie de guia de remision que el demo no necesita: la GRE es
        // logistica avanzada, no parte del circuito que se prueba aqui.
        gre_automatico_habilitado: false,
        gre_obligatorio: false,
        // Regimen general: es el que aplica a una S.A.C. como la del demo y sin
        // el la configuracion fiscal nunca se da por completa.
        regimen_tributario: "GENERAL",
      })
      .eq("tenant_id", tenantId);
    if (baseError)
      throw new Error(`empresa_config update (config fiscal demo): ${baseError.message}`);

    // 2) Certificado demo para firmar CPE/GRE en modo demo.
    const pfxPath = process.env.DEMO_PFX_PATH || "certs/demo.pfx";
    const pfxPass = process.env.DEMO_PFX_PASS || "12345678910";
    const absPath = this.resolveDemoPfxPath(pfxPath);
    if (!absPath) {
      throw new Error(`PFX demo no encontrado: ${pfxPath} (cwd=${process.cwd()})`);
    }
    const buffer = fs.readFileSync(absPath);
    // Validamos el cert para obtener expiry; si está roto, abortamos el seed.
    const metadata = parseCertificateBuffer(buffer, pfxPass);
    const encryptedCertificate = encryptBuffer(this.configService, buffer);
    const encryptedPassword = encryptText(this.configService, pfxPass);
    const { error } = await this.adminClient
      .from("empresa_config")
      .update({
        certificado_pfx: toPostgresBytea(encryptedCertificate),
        certificado_password: encryptedPassword,
        certificado_expira_en: metadata.validTo.toISOString(),
      })
      .eq("tenant_id", tenantId);
    if (error)
      throw new Error(`empresa_config update (certificado): ${error.message}`);
  }

  /**
   * Resuelve el fixture tanto en ts-jest/dev (`src/...`) como en el artefacto
   * compilado (`dist/src/...`). Basarse en una cantidad fija de `..` rompía el
   * seed al ejecutar `node dist/src/main.js`.
   */
  private resolveDemoPfxPath(configuredPath: string): string | null {
    if (path.isAbsolute(configuredPath)) {
      return fs.existsSync(configuredPath) ? configuredPath : null;
    }

    const candidates = [
      path.resolve(process.cwd(), configuredPath),
      path.resolve(process.cwd(), "..", "..", configuredPath),
      path.resolve(__dirname, "..", "..", "..", "..", "..", configuredPath),
      path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
        configuredPath,
      ),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  /**
   * Catálogo de ejemplo prometido por la landing de demo ("datos de ejemplo
   * incluidos"). Sin esto el POS/Inventario arrancan vacíos y el usuario no
   * puede probar una venta sin crear productos a mano.
   */
  private async seedProductosDemo(tenantId: string): Promise<void> {
    const productos = [
      {
        codigo: "DEMO-001",
        nombre: "Café Molido Premium 250g",
        categoria: "ALIMENTOS",
        precio_venta: 25.0,
        precio_compra: 18.0,
        stock_actual: 50,
      },
      {
        codigo: "DEMO-002",
        nombre: "Azúcar Rubia 1kg",
        categoria: "ALIMENTOS",
        precio_venta: 6.5,
        precio_compra: 4.8,
        stock_actual: 120,
      },
      {
        codigo: "DEMO-003",
        nombre: "Cuaderno A4 96 hojas",
        categoria: "OFICINA",
        precio_venta: 8.9,
        precio_compra: 5.5,
        stock_actual: 80,
      },
      {
        codigo: "DEMO-004",
        nombre: "Audífonos Bluetooth",
        categoria: "ELECTRONICA",
        precio_venta: 89.9,
        precio_compra: 60.0,
        stock_actual: 15,
      },
      {
        codigo: "DEMO-005",
        nombre: "Detergente Líquido 1L",
        categoria: "HOGAR",
        precio_venta: 14.5,
        precio_compra: 10.0,
        stock_actual: 40,
      },
    ];
    const rows = productos.map((p) => ({
      tenant_id: tenantId,
      ...p,
      // El saldo se inicializa después mediante aplicar_movimiento_inventario_tx.
      stock_actual: 0,
      stock: 0,
      descripcion: "Producto de ejemplo (demo)",
      activo: true,
      codigo_barras: p.codigo,
      stock_minimo: 5,
      stock_reservado: 0,
      impuesto: 18,
      es_servicio: false,
      controla_stock: true,
      afectacion_igv: "10",
      favorito: false,
      imagen_url: "",
    }));
    const { data: inserted, error } = await this.adminClient
      .from("productos")
      .insert(rows)
      .select("id, codigo, stock_actual");
    if (error) throw new Error(`productos insert: ${error.message}`);

    // producto_existencias es la fuente física de verdad. El stock inicial debe
    // entrar por el mismo writer transaccional que POS, recepciones y ajustes;
    // nunca se insertan saldos y kardex por caminos separados.
    const { data: almacenDemo } = await this.adminClient
      .from("almacenes")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("codigo", "ALM-PRINCIPAL")
      .maybeSingle();

    if (almacenDemo?.id && inserted?.length) {
      const datosPorCodigo = new Map(productos.map((p) => [p.codigo, p]));
      for (const producto of inserted) {
        const datos = datosPorCodigo.get(producto.codigo);
        const { error: movimientoError } = await this.adminClient.rpc(
          "aplicar_movimiento_inventario_tx",
          {
            p_tenant_id: tenantId,
            p_producto_id: producto.id,
            p_almacen_id: almacenDemo.id,
            p_tipo: "ENTRADA",
            p_cantidad: datos?.stock_actual ?? producto.stock_actual,
            p_referencia_tipo: "STOCK_INICIAL_DEMO",
            p_referencia_id: randomUUID(),
            p_notas: "Stock inicial demo",
            p_metadata: {
              source: "demo_seed",
              costo_unitario: datos?.precio_compra ?? 0,
            },
          },
        );
        if (movimientoError) {
          throw new Error(`stock inicial canónico: ${movimientoError.message}`);
        }
      }
    } else if (!almacenDemo?.id) {
      throw new Error(
        "producto_existencias: almacén demo ALM-PRINCIPAL no encontrado",
      );
    }

  }

  /**
   * Clientes de ejemplo: el POS exige seleccionar un cliente con documento
   * válido (≥8 dígitos) para procesar la venta. Sin esto no se puede vender.
   * RUC 20600000013 pasa la validación módulo 11 de SUNAT.
   */
  private async seedClientesDemo(tenantId: string): Promise<void> {
    const clientes = [
      // Sin ceros a la izquierda: numero_documento es integer y el POS valida
      // la longitud del documento como string (≥8 dígitos).
      {
        tipo: "PERSONA",
        documento_tipo: "DNI",
        documento: "99999999",
        razon_social: "Cliente General",
      },
      {
        tipo: "PERSONA",
        documento_tipo: "DNI",
        documento: "12345678",
        razon_social: "Juan Pérez Demo",
      },
      {
        tipo: "EMPRESA",
        documento_tipo: "RUC",
        documento: "20600000013",
        razon_social: "COMERCIAL ANDINA DEMO S.A.C.",
      },
    ];
    const rows = clientes.map((c) => {
      const docNum = Number(c.documento);
      const docSeguro =
        Number.isSafeInteger(docNum) && docNum <= 2147483647 ? docNum : null;
      return {
        tenant_id: tenantId,
        tipo: c.tipo,
        tipo_documento: c.documento_tipo,
        documento_tipo: c.documento_tipo,
        documento_numero: docSeguro,
        numero_documento: docSeguro,
        razon_social: c.razon_social,
        nombre: c.razon_social,
        codigo: c.documento,
        ruc: c.documento_tipo === "RUC" ? c.documento : null,
        activo: true,
      };
    });
    const { error } = await this.adminClient.from("clientes").insert(rows);
    if (error) throw new Error(`clientes insert: ${error.message}`);
  }

  /**
   * Sin una cuenta bancaria no hay tesoreria ni conciliacion posibles: la
   * pantalla de pagos no tiene donde cargar el egreso y la conciliacion no
   * tiene contra que cuadrar. Se siembra una en soles.
   */
  private async seedCuentaBancariaDemo(tenantId: string): Promise<void> {
    const { error } = await this.adminClient.from("cuentas_bancarias").insert({
      tenant_id: tenantId,
      nombre: "BCP Cuenta Corriente Soles",
      codigo: "BCP-CTE-PEN",
      banco: "BCP",
      numero_cuenta: "194-1234567-0-56",
      tipo_cuenta: "CORRIENTE",
      moneda: "PEN",
      saldo: 0,
      saldo_actual: 0,
      saldo_contable: 0,
      permite_sobregiro: false,
      activa: true,
      activo: true,
    });
    if (error) throw new Error(`cuentas_bancarias insert: ${error.message}`);
  }
  /**
   * Sin proveedores no se puede crear una orden de compra, asi que el circuito
   * Compras -> Inventario -> CxP quedaba inalcanzable en el demo. Los RUC llevan
   * digito verificador correcto porque el alta los valida por modulo 11.
   */
  /**
   * Sin empleados no hay planillas, contratos ni asistencia que probar: RRHH
   * quedaba tan inalcanzable como lo estaban compras sin proveedores o la
   * conciliacion sin cuenta bancaria.
   *
   * Se siembra con hijos a cargo a proposito, porque asi el demo ejercita la
   * asignacion familiar, el concepto legal que mas facil pasa inadvertido
   * cuando no se calcula.
   */
  private async seedEmpleadoDemo(tenantId: string): Promise<void> {
    const { data: empleado, error: empleadoError } = await this.adminClient
      .from("empleados")
      .insert({
        tenant_id: tenantId,
        nombres: "María Elena",
        apellidos: "Quispe Huamán",
        tipo_documento: "DNI",
        numero_documento: "44556677",
        email: "mquispe@demo.local",
        puesto: "Asistente Administrativo",
        fecha_ingreso: "2024-01-15",
        estado: "activo",
        tiene_hijos: true,
        cantidad_hijos: 1,
        asignacion_familiar: true,
        activo: true,
      })
      .select("id")
      .single();

    if (empleadoError)
      throw new Error(`empleados insert: ${empleadoError.message}`);

    const { error: contratoError } = await this.adminClient
      .from("contratos")
      .insert({
        tenant_id: tenantId,
        id_empleado: empleado.id,
        empleado_id: empleado.id,
        tipo_contrato: "INDEFINIDO",
        fecha_inicio: "2024-01-15",
        sueldo_bruto: 2500,
        regimen_pensionario: "ONP",
        estado: "VIGENTE",
      });

    if (contratoError)
      throw new Error(`contratos insert: ${contratoError.message}`);
  }

  private async seedProveedoresDemo(tenantId: string): Promise<void> {
    const proveedores = [
      {
        ruc: "20512345671",
        razon_social: "DISTRIBUIDORA ANDINA S.A.C.",
        contacto: "Ventas Corporativas",
        email: "ventas@distribuidoraandina.demo",
        telefono: "013456789",
        direccion: "Av. Argentina 1234, Callao",
        dias_credito: 30,
      },
      {
        ruc: "20487654320",
        razon_social: "IMPORTACIONES DEL SUR E.I.R.L.",
        contacto: "Mesa de Pedidos",
        email: "pedidos@impsur.demo",
        telefono: "014567890",
        direccion: "Jr. Cusco 456, Lima",
        dias_credito: 15,
      },
    ];

    const rows = proveedores.map((prov) => ({
      tenant_id: tenantId,
      razon_social: prov.razon_social,
      nombre: prov.razon_social,
      codigo: prov.ruc,
      ruc: prov.ruc,
      tipo_documento: "RUC",
      documento_tipo: "RUC",
      documento_numero: prov.ruc,
      numero_documento: prov.ruc,
      contacto: prov.contacto,
      email: prov.email,
      telefono: prov.telefono,
      direccion: prov.direccion,
      dias_credito: prov.dias_credito,
      condiciones_pago: "CREDITO",
      activo: true,
    }));

    const { error } = await this.adminClient.from("proveedores").insert(rows);
    if (error) throw new Error(`proveedores insert: ${error.message}`);
  }

  async getDemoStatus(tenantId: string) {
    const { data, error } = await this.client
      .from("empresa_config")
      .select(
        "is_demo, demo_expires_at, demo_created_at, demo_conversion_attempted, plan",
      )
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) throw new NotFoundException("Tenant no encontrado");

    if (!data.is_demo) {
      return { is_demo: false, message: "Este no es un tenant demo" };
    }

    const now = new Date();
    const expiresAt = new Date(data.demo_expires_at);
    const diasRestantes = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      is_demo: true,
      is_expired: diasRestantes <= 0,
      expires_at: data.demo_expires_at,
      created_at: data.demo_created_at,
      dias_restantes: Math.max(0, diasRestantes),
      conversion_attempted: data.demo_conversion_attempted,
      planes_disponibles: Object.values(PLANES),
      stripe_enabled: this.stripeService.isConfigured(),
    };
  }

  getPlanes() {
    return {
      planes: Object.values(PLANES).map((p) => ({
        ...p,
        facturas_mes: p.facturas_mes === -1 ? "Ilimitado" : p.facturas_mes,
        usuarios: p.usuarios === -1 ? "Ilimitado" : p.usuarios,
      })),
      stripe_enabled: this.stripeService.isConfigured(),
    };
  }

  /**
   * Inicia conversión - genera URL de pago Stripe o instrucciones manuales
   */
  async convertToReal(tenantId: string, dto: ConvertDemoToRealDto) {
    const status = await this.getDemoStatus(tenantId);
    if (!status.is_demo)
      throw new BadRequestException("Este no es un tenant demo");

    const plan = PLANES[dto.plan_id || "basico"];
    if (!plan) throw new BadRequestException("Plan no válido");

    // Validar RUC único
    const { data: existingRuc } = await this.client
      .from("empresa_config")
      .select("tenant_id")
      .eq("ruc", dto.ruc)
      .neq("tenant_id", tenantId)
      .single();
    if (existingRuc) throw new BadRequestException("El RUC ya está registrado");

    // Validar email único
    const { data: existingEmail } = await this.client
      .from("usuarios_sistema")
      .select("id")
      .eq("email", dto.email)
      .neq("tenant_id", tenantId)
      .single();
    if (existingEmail)
      throw new BadRequestException("El email ya está registrado");

    // Guardar datos pendientes de conversión
    await this.client
      .from("empresa_config")
      .update({
        demo_conversion_attempted: true,
        // Guardar datos pendientes en metadata
      })
      .eq("tenant_id", tenantId);

    const monto =
      dto.periodo === "anual" ? plan.precio_anual : plan.precio_mensual;

    // Si Stripe está configurado, crear sesión de checkout
    if (this.stripeService.isConfigured()) {
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const { url, sessionId } = await this.stripeService.createCheckoutSession(
        {
          tenantId,
          planId: dto.plan_id || "basico",
          periodo: dto.periodo || "mensual",
          email: dto.email,
          razonSocial: dto.razon_social,
          ruc: dto.ruc,
          successUrl: `${baseUrl}/demo/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}/demo/cancel`,
        },
      );

      // Guardar datos para completar después del pago
      await this.client.from("demo_conversiones_pendientes").insert({
        tenant_id: tenantId,
        stripe_session_id: sessionId,
        razon_social: dto.razon_social,
        ruc: dto.ruc,
        email: dto.email,
        password_hash: await bcrypt.hash(dto.password, 10),
        telefono: dto.telefono,
        plan_id: dto.plan_id || "basico",
        periodo: dto.periodo || "mensual",
        monto,
        estado: "PENDIENTE",
      });

      return {
        success: true,
        payment_url: url,
        session_id: sessionId,
        plan: plan.nombre,
        monto,
        moneda: plan.moneda,
      };
    }

    // Sin Stripe - modo manual o testing
    if (process.env.DEMO_SKIP_PAYMENT === "true") {
      return this.completarConversion(tenantId, dto);
    }

    return {
      success: true,
      payment_pending: true,
      plan: plan.nombre,
      plan_id: plan.id,
      periodo: dto.periodo || "mensual",
      monto,
      moneda: plan.moneda,
      datos_empresa: {
        razon_social: dto.razon_social,
        ruc: dto.ruc,
        email: dto.email,
        telefono: dto.telefono,
      },
      instrucciones: "Contacte a ventas@erp.pe para completar el pago",
    };
  }

  /**
   * Completa la conversión después del pago (llamado por webhook)
   */
  async completarConversion(tenantId: string, dto: ConvertDemoToRealDto) {
    const authClient = this.supabase.getClient();
    const passwordHash =
      dto.password_hash || (await bcrypt.hash(dto.password, 10));

    try {
      const { error: empresaError } = await authClient
        .from("empresa_config")
        .update({
          razon_social: dto.razon_social,
          ruc: dto.ruc,
          telefono: dto.telefono,
          is_demo: false,
          demo_expires_at: null,
          demo_conversion_attempted: true,
          estado: "ACTIVO",
          plan: (dto.plan_id || "basico").toUpperCase(),
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId);

      if (empresaError) throw empresaError;

      const { error: usuarioError } = await authClient
        .from("usuarios_sistema")
        .update({
          email: dto.email,
          password_hash: passwordHash,
          is_demo_user: false,
          demo_email_temp: null,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("is_demo_user", true);

      if (usuarioError) throw usuarioError;

      const { data: usuario } = await authClient
        .from("usuarios_sistema")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", dto.email)
        .single();

      if (!usuario?.id) {
        throw new Error("Usuario convertido no encontrado");
      }

      const authResult = await this.authService.login(
        { email: dto.email, password: dto.password },
        "demo-webhook",
        "demo-conversion",
      );
      const token = authResult.access_token;

      return {
        success: true,
        message: "Cuenta activada exitosamente",
        token,
        tenant_id: tenantId,
        email: dto.email,
        plan: dto.plan_id || "basico",
      };
    } catch (error) {
      throw new BadRequestException(`Error activando cuenta: ${error.message}`);
    }
  }

  /**
   * Procesa webhook de Stripe cuando el pago es exitoso
   */
  async procesarPagoExitoso(sessionId: string) {
    // Obtener datos de la conversión pendiente
    const { data: conversion } = await this.client
      .from("demo_conversiones_pendientes")
      .select("*")
      .eq("stripe_session_id", sessionId)
      .eq("estado", "PENDIENTE")
      .single();

    if (!conversion) {
      throw new BadRequestException("Conversión no encontrada o ya procesada");
    }

    // Completar la conversión
    const result = await this.completarConversion(conversion.tenant_id, {
      razon_social: conversion.razon_social,
      ruc: conversion.ruc,
      email: conversion.email,
      password: "", // No se usa, usamos password_hash
      password_hash: conversion.password_hash,
      telefono: conversion.telefono,
      plan_id: conversion.plan_id,
      periodo: conversion.periodo,
    });

    // Marcar como completada
    await this.client
      .from("demo_conversiones_pendientes")
      .update({ estado: "COMPLETADA", completed_at: new Date().toISOString() })
      .eq("stripe_session_id", sessionId);

    return result;
  }
}
