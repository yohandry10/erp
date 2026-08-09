"use client";

import { useState, useCallback, useEffect } from "react";
import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  Calendar,
  FileText,
  Landmark,
  Receipt,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardTheme } from "@/hooks/use-dashboard-theme";
import { useCountryContext } from "@/hooks/use-country-context";

type VistaContable =
  | "estado-resultados"
  | "registro-compras"
  | "balance-comprobacion"
  | "kardex-valorizado"
  | "libro-caja-bancos"
  | "registro-activos-fijos"
  | "libro-planillas"
  | "libro-inventarios-balances"
  | "registro-costos"
  | "libros-electronicos-sunat";

const vistas: Array<{
  id: VistaContable;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    id: "estado-resultados",
    title: "Estado de Resultados",
    description: "Análisis financiero y rentabilidad operativa.",
    icon: BarChart3,
  },
  {
    id: "registro-compras",
    title: "Registro de Compras",
    description: "Detalle tributario y contable de adquisiciones.",
    icon: Receipt,
  },
  {
    id: "balance-comprobacion",
    title: "Balance de Comprobación",
    description: "Validación de saldos, debe y haber.",
    icon: Scale,
  },
  {
    id: "kardex-valorizado",
    title: "Kardex Valorizado",
    description: "Control valorizado de inventario.",
    icon: Boxes,
  },
  {
    id: "libro-caja-bancos",
    title: "Libro Caja y Bancos",
    description: "Trazabilidad de caja, bancos y movimientos.",
    icon: Landmark,
  },
  {
    id: "registro-activos-fijos",
    title: "Registro Activos Fijos",
    description: "Activos, depreciación y valor neto.",
    icon: Building2,
  },
  {
    id: "libro-planillas",
    title: "Libro de Planillas",
    description: "Integración contable con RRHH.",
    icon: Users,
  },
  {
    id: "libro-inventarios-balances",
    title: "Inventarios y Balances",
    description: "Libro de inventarios, activos y patrimonio.",
    icon: BookOpen,
  },
  {
    id: "registro-costos",
    title: "Registro de Costos",
    description: "Centros de costo y costos operativos.",
    icon: Calculator,
  },
  {
    id: "libros-electronicos-sunat",
    title: "Libros Electrónicos SUNAT",
    description: "Preparación de libros electrónicos.",
    icon: ShieldCheck,
  },
];

export default function ContabilidadPage() {
  const [vistaActual, setVistaActual] =
    useState<VistaContable>("registro-compras");
  const [loading, setLoading] = useState(false);
  const { theme } = useDashboardTheme();
  const country = useCountryContext();
  const isArgentina = country.paisCodigo === "AR";
  const isColombia = country.paisCodigo === "CO";
  const isPeru = country.paisCodigo === "PE";
  const darkMode = theme === "dark";
  const vistasLocalizadas = vistas.map((vista) =>
    vista.id === "libros-electronicos-sunat" && (isArgentina || isColombia)
      ? {
          ...vista,
          title: isArgentina
            ? "Libros IVA y contables"
            : "Libros contables y reportes DIAN",
          description: isArgentina
            ? "Libro IVA Ventas, IVA Compras, Diario y Mayor para Argentina."
            : "Diario, Mayor, Inventarios y Balances, auxiliares y soporte para información exógena.",
        }
      : vista,
  );

  const [registroCompras, setRegistroCompras] = useState<any>(null);
  const [estadoResultados, setEstadoResultados] = useState<any>(null);
  const [balanceComprobacion, setBalanceComprobacion] = useState<any>(null);
  // El endpoint responde con el array de cuentas y sus movimientos: no existe
  // un campo totalCuentas, asi que el balance salia siempre en 0 aunque hubiera
  // asientos contabilizados.
  const totalCuentasBalance = Array.isArray(balanceComprobacion)
    ? balanceComprobacion.length
    : Array.isArray(balanceComprobacion?.cuentas)
      ? balanceComprobacion.cuentas.length
      : Number(balanceComprobacion?.totalCuentas) || 0;
  const [kardexValorizado, setKardexValorizado] = useState<any>(null);
  // El endpoint responde con el array de movimientos, no con un resumen: los
  // contadores se derivan de el en vez de leer campos que no existen.
  const movimientosKardex = Array.isArray(kardexValorizado)
    ? kardexValorizado
    : [];
  const productosValorizados = new Set(
    movimientosKardex.map(
      (mov: any) => mov?.producto_id ?? mov?.producto_codigo,
    ),
  ).size;
  const valorTotalKardex = movimientosKardex.reduce(
    (suma: number, mov: any) => suma + (Number(mov?.valor_total) || 0),
    0,
  );
  const [libroCajaBancos, setLibroCajaBancos] = useState<any>(null);
  const [registroActivosFijos, setRegistroActivosFijos] = useState<any>(null);
  const [libroPlanillas, setLibroPlanillas] = useState<any>(null);
  const [libroInventariosBalances, setLibroInventariosBalances] =
    useState<any>(null);
  const [registroCostos, setRegistroCostos] = useState<any>(null);
  const [librosElectronicosSunat, setLibrosElectronicosSunat] =
    useState<any>(null);

  const libroCajaBancosItems = Array.isArray(libroCajaBancos)
    ? libroCajaBancos
    : [];
  const saldoEfectivo = libroCajaBancosItems.reduce(
    (suma: number, cuenta: any) => suma + (Number(cuenta?.saldoFinal) || 0),
    0,
  );
  const movimientosCajaBancos = libroCajaBancosItems.reduce(
    (suma: number, cuenta: any) =>
      suma + (Array.isArray(cuenta?.movimientos) ? cuenta.movimientos.length : 0),
    0,
  );

  const activosFijosItems = Array.isArray(registroActivosFijos)
    ? registroActivosFijos
    : [];
  const valorBrutoActivos = activosFijosItems.reduce(
    (suma: number, activo: any) =>
      suma +
      (Number(activo?.valor_adquisicion) ||
        Number(activo?.debe) - Number(activo?.haber) ||
        0),
    0,
  );
  const depreciacionActivos = activosFijosItems.reduce(
    (suma: number, activo: any) =>
      suma + (Number(activo?.depreciacion_acumulada) || 0),
    0,
  );
  const valorNetoActivos = activosFijosItems.reduce(
    (suma: number, activo: any) =>
      suma +
      (Number(activo?.valor_neto) ||
        Math.max(
          0,
          (Number(activo?.valor_adquisicion) || 0) -
            (Number(activo?.depreciacion_acumulada) || 0),
        )),
    0,
  );

  const planillaItems = Array.isArray(libroPlanillas) ? libroPlanillas : [];
  const asientosPlanilla = new Set(
    planillaItems.map((item: any) => item?.asiento_id).filter(Boolean),
  ).size;
  const debePlanilla = planillaItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.debe) || 0),
    0,
  );
  const haberPlanilla = planillaItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.haber) || 0),
    0,
  );

  const inventariosItems = Array.isArray(libroInventariosBalances)
    ? libroInventariosBalances
    : [];
  const inventarioInicial = inventariosItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.saldoInicial) || 0),
    0,
  );
  const entradasInventario = inventariosItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.entradas) || 0),
    0,
  );
  const salidasInventario = inventariosItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.salidas) || 0),
    0,
  );
  const inventarioFinal = inventariosItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.saldoFinal) || 0),
    0,
  );

  const costosItems = Array.isArray(registroCostos) ? registroCostos : [];
  const centrosConCostos = new Set(
    costosItems.map((item: any) => item?.centro_costo_id).filter(Boolean),
  ).size;
  const debeCostos = costosItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.debe) || 0),
    0,
  );
  const haberCostos = costosItems.reduce(
    (suma: number, item: any) => suma + (Number(item?.haber) || 0),
    0,
  );

  const asientosPle = Array.isArray(librosElectronicosSunat)
    ? librosElectronicosSunat
    : [];
  const lineasPle = asientosPle.reduce(
    (suma: number, asiento: any) =>
      suma +
      (Array.isArray(asiento?.detalle_asientos)
        ? asiento.detalle_asientos.length
        : 0),
    0,
  );

  const { get } = useApi();

  // La exportacion PLE existia en el backend sin ninguna ruta ni boton que la
  // alcanzara: el contador no podia bajar ningun libro electronico.
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;
  const [pleAnio, setPleAnio] = useState(String(hoy.getFullYear()));
  const [pleMes, setPleMes] = useState(
    String(hoy.getMonth() + 1).padStart(2, "0"),
  );
  const [pleLibroEnCurso, setPleLibroEnCurso] = useState<string | null>(null);
  const [pleError, setPleError] = useState<string | null>(null);

  const LIBROS_PLE: Array<{ id: string; etiqueta: string }> = [
    { id: "registro-ventas", etiqueta: "Registro de Ventas 14.1" },
    { id: "registro-compras", etiqueta: "Registro de Compras 8.1" },
    { id: "libro-diario", etiqueta: "Libro Diario 5.1" },
    { id: "libro-mayor", etiqueta: "Libro Mayor 6.1" },
    { id: "balance-comprobacion", etiqueta: "Balance de Comprobación 3.17" },
    { id: "todos", etiqueta: "Descargar todos" },
  ];

  const descargarPle = async (libro: string) => {
    setPleError(null);
    setPleLibroEnCurso(libro);
    try {
      const response = await get(
        `/contabilidad/ple/${libro}?anio=${Number(pleAnio)}&mes=${Number(pleMes)}`,
      );
      if (!response?.success || !Array.isArray(response.data)) {
        // El mensaje del backend dice que falta configurar (por ejemplo el RUC);
        // tragarselo dejaria al contador sin saber por que no baja nada.
        setPleError(response?.message || "No se pudo generar el archivo PLE");
        return;
      }
      for (const archivo of response.data as Array<{
        filename: string;
        content: string;
      }>) {
        const blob = new Blob([archivo.content], {
          type: "text/plain;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.setAttribute("download", archivo.filename);
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        URL.revokeObjectURL(url);
      }
      // Al pedir todos, alguno puede fallar sin tumbar al resto: se avisa cual.
      if (response.message) setPleError(response.message);
    } catch (error: any) {
      setPleError(error?.message || "No se pudo generar el archivo PLE");
    } finally {
      setPleLibroEnCurso(null);
    }
  };

  const renderDescargasPle = () => (
    <Card
      className={cn(
        "overflow-hidden",
        darkMode &&
          "border-cyan-400/20 bg-card/70 text-foreground shadow-2xl shadow-blue-950/20",
      )}
    >
      <CardHeader
        className={cn(
          "border-b",
          darkMode ? "border-cyan-400/10 bg-card/45" : "border-border bg-card",
        )}
      >
        <CardTitle className={cn("text-lg", darkMode && "text-foreground")}>
          Descargar libros electrónicos (PLE)
        </CardTitle>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Archivos TXT con la estructura de SUNAT, listos para el validador PVS.
          El nombre lo arma el sistema con el RUC y el período.
        </p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="ple-anio"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Año
            </label>
            <input
              id="ple-anio"
              type="number"
              min="2000"
              max="2100"
              value={pleAnio}
              onChange={(event) => setPleAnio(event.target.value)}
              className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="ple-mes"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Mes
            </label>
            <select
              id="ple-mes"
              value={pleMes}
              onChange={(event) => setPleMes(event.target.value)}
              className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, indice) =>
                String(indice + 1).padStart(2, "0"),
              ).map((mes) => (
                <option key={mes} value={mes}>
                  {mes}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {LIBROS_PLE.map((libro) => (
            <Button
              key={libro.id}
              type="button"
              variant={libro.id === "todos" ? "default" : "outline"}
              size="sm"
              disabled={pleLibroEnCurso !== null}
              onClick={() => descargarPle(libro.id)}
            >
              {pleLibroEnCurso === libro.id ? "Generando…" : libro.etiqueta}
            </Button>
          ))}
        </div>

        {pleError && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {pleError}
          </p>
        )}
      </CardContent>
    </Card>
  );

  const formatearMoneda = (valor: number) => {
    return new Intl.NumberFormat(country.locale || "es-PE", {
      style: "currency",
      currency: country.moneda || "PEN",
    }).format(valor);
  };

  const cargarEstadoResultados = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get(
        `/api/contabilidad/estados/estado-resultados?anio=${anioActual}&mes=${mesActual}`,
      );
      if (response?.success) setEstadoResultados(response.data);
    } catch (error) {
      console.error("Error cargando estado de resultados:", error);
    } finally {
      setLoading(false);
    }
  }, [anioActual, get, mesActual]);

  const cargarRegistroCompras = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get("/api/contabilidad/registro-compras");
      if (response && response.success) setRegistroCompras(response.data);
    } catch (error) {
      console.error("Error cargando registro de compras:", error);
    } finally {
      setLoading(false);
    }
  }, [get]);

  const cargarBalanceComprobacion = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get(
        `/api/contabilidad/balance-comprobacion?anio=${anioActual}&mes=${mesActual}`,
      );
      if (response && response.success) setBalanceComprobacion(response.data);
    } catch (error) {
      console.error("Error cargando balance de comprobación:", error);
    } finally {
      setLoading(false);
    }
  }, [anioActual, get, mesActual]);

  const cargarKardexValorizado = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get("/api/contabilidad/kardex-valorizado");
      if (response && response.success) setKardexValorizado(response.data);
    } catch (error) {
      console.error("Error cargando kardex valorizado:", error);
    } finally {
      setLoading(false);
    }
  }, [get]);

  const cargarLibroCajaBancos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get("/api/contabilidad/libro-caja-bancos");
      if (response && response.success) setLibroCajaBancos(response.data);
    } catch (error) {
      console.error("Error cargando libro de caja y bancos:", error);
    } finally {
      setLoading(false);
    }
  }, [get]);

  const cargarRegistroActivosFijos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get("/api/contabilidad/registro-activos-fijos");
      if (response && response.success) setRegistroActivosFijos(response.data);
    } catch (error) {
      console.error("Error cargando registro de activos fijos:", error);
    } finally {
      setLoading(false);
    }
  }, [get]);

  const cargarLibroPlanillas = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get("/api/contabilidad/libro-planillas");
      if (response && response.success) setLibroPlanillas(response.data);
    } catch (error) {
      console.error("Error cargando libro de planillas:", error);
    } finally {
      setLoading(false);
    }
  }, [get]);

  const cargarLibroInventariosBalances = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get(
        "/api/contabilidad/libro-inventarios-balances",
      );
      if (response && response.success)
        setLibroInventariosBalances(response.data);
    } catch (error) {
      console.error("Error cargando libro de inventarios y balances:", error);
    } finally {
      setLoading(false);
    }
  }, [get]);

  const cargarRegistroCostos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await get("/api/contabilidad/registro-costos");
      if (response && response.success) setRegistroCostos(response.data);
    } catch (error) {
      console.error("Error cargando registro de costos:", error);
    } finally {
      setLoading(false);
    }
  }, [get]);

  const cargarLibrosElectronicosSunat = useCallback(async () => {
    if (isArgentina || isColombia) {
      setLibrosElectronicosSunat({
        librosConfigurados: 4,
        archivosGenerados: 0,
        ultimoEnvio: isColombia ? "Sin generar" : "Sin presentar",
        estadoPLE: "Libro IVA Ventas / Compras",
      });
      return;
    }
    setLoading(true);
    try {
      const response = await get("/api/contabilidad/libros-electronicos-sunat");
      if (response && response.success)
        setLibrosElectronicosSunat(response.data);
    } catch (error) {
      console.error("Error cargando libros electrónicos SUNAT:", error);
    } finally {
      setLoading(false);
    }
  }, [get, isArgentina, isColombia]);

  const cargarDatos = useCallback(async () => {
    if (vistaActual === "estado-resultados") await cargarEstadoResultados();
    else if (vistaActual === "registro-compras") await cargarRegistroCompras();
    else if (vistaActual === "balance-comprobacion")
      await cargarBalanceComprobacion();
    else if (vistaActual === "kardex-valorizado")
      await cargarKardexValorizado();
    else if (vistaActual === "libro-caja-bancos") await cargarLibroCajaBancos();
    else if (vistaActual === "registro-activos-fijos")
      await cargarRegistroActivosFijos();
    else if (vistaActual === "libro-planillas") await cargarLibroPlanillas();
    else if (vistaActual === "libro-inventarios-balances")
      await cargarLibroInventariosBalances();
    else if (vistaActual === "registro-costos") await cargarRegistroCostos();
    else if (vistaActual === "libros-electronicos-sunat")
      await cargarLibrosElectronicosSunat();
  }, [
    cargarBalanceComprobacion,
    cargarEstadoResultados,
    cargarKardexValorizado,
    cargarLibroCajaBancos,
    cargarLibroInventariosBalances,
    cargarLibroPlanillas,
    cargarLibrosElectronicosSunat,
    cargarRegistroActivosFijos,
    cargarRegistroCompras,
    cargarRegistroCostos,
    vistaActual,
  ]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // El radar resume cuatro modulos, pero cargarDatos solo trae la vista activa:
  // los otros tres contadores quedaban en 0 y parecia que esos modulos no tenian
  // datos. Se cargan una vez al abrir la pantalla, con independencia de la vista.
  useEffect(() => {
    void Promise.allSettled([
      cargarEstadoResultados(),
      cargarRegistroCompras(),
      cargarBalanceComprobacion(),
      cargarKardexValorizado(),
      cargarLibroCajaBancos(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentVista =
    vistasLocalizadas.find((vista) => vista.id === vistaActual) ??
    vistasLocalizadas[0];
  const CurrentIcon = currentVista.icon;

  const metricClass = cn(
    "rounded-lg border p-4",
    darkMode ? "border-cyan-400/15 bg-card/45" : "border-border bg-card",
  );

  const labelClass = cn(
    "text-xs font-semibold uppercase tracking-[0.16em]",
    darkMode ? "text-primary/80" : "text-muted-foreground",
  );
  const valueClass = cn(
    "mt-2 text-2xl font-bold",
    darkMode ? "text-foreground" : "text-foreground",
  );

  const renderLoading = () => (
    <Card
      className={cn(
        "border-dashed",
        darkMode && "border-cyan-400/20 bg-card/45 text-foreground/90",
      )}
    >
      <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400/20 border-t-cyan-300" />
        <p
          className={cn(
            "text-sm font-medium",
            darkMode ? "text-muted-foreground" : "text-foreground/80",
          )}
        >
          Cargando información contable...
        </p>
      </CardContent>
    </Card>
  );

  const renderPanel = (
    title: string,
    description: string,
    metrics: Array<{ label: string; value: string | number }>,
  ) => {
    if (loading) return renderLoading();

    return (
      <Card
        className={cn(
          "overflow-hidden",
          darkMode &&
            "border-cyan-400/20 bg-card/70 text-foreground shadow-2xl shadow-blue-950/20",
        )}
      >
        <CardHeader
          className={cn(
            "border-b",
            darkMode
              ? "border-cyan-400/10 bg-card/45"
              : "border-border bg-card",
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle
                className={cn("text-2xl", darkMode && "text-foreground")}
              >
                {title}
              </CardTitle>
              <p
                className={cn(
                  "mt-2 max-w-2xl text-sm",
                  darkMode ? "text-muted-foreground" : "text-muted-foreground",
                )}
              >
                {description}
              </p>
            </div>
            <div
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                darkMode
                  ? "border-cyan-400/20 bg-cyan-400/10 text-primary"
                  : "border-blue-100 bg-primary/10 text-primary",
              )}
            >
              Datos reales del tenant
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className={metricClass}>
                <div className={labelClass}>{metric.label}</div>
                <div className={valueClass}>{metric.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderContent = () => {
    if (vistaActual === "estado-resultados") {
      return renderPanel(
        "Estado de Resultados",
        "Ingresos, costos, gastos y utilidad del periodo actual.",
        [
          {
            label: "Ingresos",
            value: formatearMoneda(
              Number(estadoResultados?.ingresos?.total_ingresos) || 0,
            ),
          },
          {
            label: "Costo de ventas",
            value: formatearMoneda(
              Number(estadoResultados?.costos?.costo_ventas) || 0,
            ),
          },
          {
            label: "Gastos",
            value: formatearMoneda(
              Number(estadoResultados?.gastos?.total_gastos) || 0,
            ),
          },
          {
            label: "Utilidad neta",
            value: formatearMoneda(
              Number(estadoResultados?.utilidad_neta) || 0,
            ),
          },
        ],
      );
    }

    if (vistaActual === "registro-compras") {
      return renderPanel(
        "Registro de Compras",
        "Registro detallado de compras para control tributario y contable.",
        [
          { label: "Estado", value: "Activo" },
          { label: "Total registros", value: registroCompras?.total || 0 },
          { label: "Origen", value: "Compras" },
        ],
      );
    }

    if (vistaActual === "balance-comprobacion") {
      return renderPanel(
        "Balance de Comprobación",
        "Balance contable para validar saldos y consistencia de cuentas.",
        [
          { label: "Estado", value: "Activo" },
          {
            label: "Total cuentas",
            value: Array.isArray(balanceComprobacion?.cuentas)
              ? balanceComprobacion.cuentas.length
              : totalCuentasBalance,
          },
          { label: "Control", value: "Debe/Haber" },
        ],
      );
    }

    if (vistaActual === "kardex-valorizado") {
      return renderPanel(
        "Kardex Valorizado",
        "Control valorizado de inventarios con método de valuación operativo.",
        [
          {
            label: "Método",
            value: kardexValorizado?.metodoValuacion || "PROMEDIO",
          },
          { label: "Total productos", value: productosValorizados },
          { label: "Valor total", value: formatearMoneda(valorTotalKardex) },
        ],
      );
    }

    if (vistaActual === "libro-caja-bancos") {
      return renderPanel(
        "Libro de Caja y Bancos",
        "Control separado de caja, bancos y movimientos financieros.",
        [
          {
            label: "Saldo efectivo",
            value: formatearMoneda(saldoEfectivo),
          },
          {
            label: "Cuentas",
            value: libroCajaBancosItems.length,
          },
          {
            label: "Movimientos",
            value: movimientosCajaBancos,
          },
        ],
      );
    }

    if (vistaActual === "registro-activos-fijos") {
      return renderPanel(
        "Registro de Activos Fijos",
        "Control de activos, depreciación acumulada y valor neto.",
        [
          {
            label: "Total activos",
            value: activosFijosItems.length,
          },
          {
            label: "Valor bruto",
            value: formatearMoneda(valorBrutoActivos),
          },
          {
            label: "Valor neto",
            value: formatearMoneda(valorNetoActivos),
          },
          {
            label: "Depreciación",
            value: formatearMoneda(depreciacionActivos),
          },
        ],
      );
    }

    if (vistaActual === "libro-planillas") {
      return renderPanel(
        "Libro de Planillas",
        "Integración contable con remuneraciones y descuentos de RRHH.",
        [
          { label: "Movimientos", value: planillaItems.length },
          {
            label: "Asientos",
            value: asientosPlanilla,
          },
          {
            label: "Debe",
            value: formatearMoneda(debePlanilla),
          },
          {
            label: "Haber",
            value: formatearMoneda(haberPlanilla),
          },
        ],
      );
    }

    if (vistaActual === "libro-inventarios-balances") {
      return renderPanel(
        "Libro de Inventarios y Balances",
        "Libro completo de inventarios, activos, pasivos y patrimonio.",
        [
          {
            label: "Inventario inicial",
            value: formatearMoneda(inventarioInicial),
          },
          {
            label: "Inventario final",
            value: formatearMoneda(inventarioFinal),
          },
          {
            label: "Entradas",
            value: formatearMoneda(entradasInventario),
          },
          {
            label: "Salidas",
            value: formatearMoneda(salidasInventario),
          },
        ],
      );
    }

    if (vistaActual === "registro-costos") {
      return renderPanel(
        "Registro de Costos",
        "Control por centros de costo con costos directos e indirectos.",
        [
          {
            label: "Movimientos",
            value: costosItems.length,
          },
          {
            label: "Centros de costo",
            value: centrosConCostos,
          },
          {
            label: "Debe",
            value: formatearMoneda(debeCostos),
          },
          {
            label: "Haber",
            value: formatearMoneda(haberCostos),
          },
        ],
      );
    }

    const panelLibros = renderPanel(
      isArgentina
        ? "Libros IVA y contables"
        : isColombia
          ? "Libros contables y reportes DIAN"
          : "Libros Electrónicos SUNAT",
      isArgentina
        ? "Libro IVA Ventas, Libro IVA Compras, Diario y Mayor del tenant argentino."
        : isColombia
          ? "Libros contables obligatorios y preparación de información tributaria para DIAN."
          : "Preparación para PLE y control de archivos electrónicos.",
      [
        {
          label: "Asientos disponibles",
          value: asientosPle.length,
        },
        {
          label: "Líneas contables",
          value: lineasPle,
        },
        {
          label: "Generación",
          value: "A solicitud",
        },
        {
          label: isArgentina ? "Estado registral" : "Estado PLE",
          value: asientosPle.length > 0 ? "Datos disponibles" : "Sin datos",
        },
      ],
    );

    // El PLE es de SUNAT: Argentina y Colombia tienen sus propios formatos.
    if (isArgentina || isColombia) return panelLibros;

    return (
      <div className="space-y-6">
        {panelLibros}
        {renderDescargasPle()}
      </div>
    );
  };

  const connectedMetrics = [
    ["Compras", registroCompras?.total || 0],
    ["Cuentas en balance", totalCuentasBalance],
    ["Productos valorizados", productosValorizados],
    ["Movimientos caja/bancos", movimientosCajaBancos],
  ];

  const controlItems = [
    ["Origen operativo", currentVista.title],
    ["Tenant", "Aislado"],
    ["Trazabilidad", "Documento origen"],
    [
      "Cuadre",
      vistaActual === "balance-comprobacion" ? "Debe/Haber" : "Por vista",
    ],
  ];

  const operationalLinks = [
    {
      title: "Asientos",
      description: "Libro diario y detalle debe/haber.",
      href: "/dashboard/contabilidad/asientos",
      icon: FileText,
    },
    {
      title: "Estados",
      description: "Balance, resultados y comprobación.",
      href: "/dashboard/contabilidad/estados",
      icon: BarChart3,
    },
    {
      title: "Monitoreo",
      description: "Eventos contables y reintentos.",
      href: "/dashboard/contabilidad/monitoreo",
      icon: ShieldCheck,
    },
    {
      title: "Periodos",
      description: "Control de apertura y cierre.",
      href: "/dashboard/contabilidad/periodos",
      icon: Calendar,
    },
    {
      title: "Centros de costo",
      description: "Asignación operativa por unidad.",
      href: "/dashboard/contabilidad/centros-costo",
      icon: Calculator,
    },
    {
      title: "Consignaciones",
      description: "Mercadería de terceros, venta, devolución y cierre.",
      href: "/dashboard/contabilidad/consignaciones",
      icon: Boxes,
    },
    {
      title: "Presupuestos",
      description: "Ejecución y alertas del periodo.",
      href: "/dashboard/contabilidad/presupuestos",
      icon: Landmark,
    },
    {
      title: "Consolidación",
      description: "Grupos empresariales y reportes configurables.",
      href: "/dashboard/contabilidad/consolidacion",
      icon: Building2,
    },
    ...(isPeru
      ? [
          {
            title: "Impuestos Perú",
            description: "Borrador mensual IGV/Renta y constancias SUNAT.",
            href: "/dashboard/contabilidad/impuestos",
            icon: Receipt,
          },
          {
            title: "Renta anual e ITAN",
            description: "Conciliación FV 710, escala RMT e ITAN.",
            href: "/dashboard/contabilidad/impuestos/anual",
            icon: Calculator,
          },
        ]
      : []),
  ];

  const barMetrics = connectedMetrics.map(([label, value]) => {
    const numericValue = Number(value) || 0;
    const maxValue = Math.max(
      ...connectedMetrics.map(([, metricValue]) => Number(metricValue) || 0),
      1,
    );
    const percentage = Math.max(8, Math.round((numericValue / maxValue) * 100));
    const widthClass =
      percentage >= 90
        ? "w-full"
        : percentage >= 75
          ? "w-10/12"
          : percentage >= 60
            ? "w-8/12"
            : percentage >= 45
              ? "w-6/12"
              : percentage >= 30
                ? "w-4/12"
                : percentage >= 15
                  ? "w-2/12"
                  : "w-1/12";
    return { label, value, widthClass };
  });

  return (
    <div
      className={cn(
        "min-h-screen p-4 transition-colors",
        darkMode
          ? "bg-gradient-to-br from-background via-muted/50 to-background text-foreground"
          : "bg-muted/30 text-foreground",
      )}
    >
      <div className="mx-auto max-w-[1500px] space-y-4">
        <section
          className={cn(
            "rounded-2xl border px-5 py-4 shadow-2xl",
            darkMode
              ? "border-cyan-400/20 bg-card/70 shadow-blue-950/20"
              : "border-border bg-card shadow-slate-200/70",
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div
                className={cn(
                  "mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
                  darkMode
                    ? "border-cyan-400/25 bg-cyan-400/10 text-primary"
                    : "border-blue-100 bg-primary/10 text-primary",
                )}
              >
                ERP Ledger Center
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Contabilidad
              </h1>
              <p
                className={cn(
                  "mt-2 max-w-3xl text-sm leading-6",
                  darkMode ? "text-muted-foreground" : "text-muted-foreground",
                )}
              >
                Libros, balances y registros contables conectados a operaciones
                reales del ERP.
              </p>
            </div>
          </div>
        </section>

        <Card
          className={cn(
            "overflow-hidden",
            darkMode &&
              "border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20",
          )}
        >
          <CardHeader className="border-b border-cyan-400/10 px-4 py-3">
            <CardTitle
              className={cn(
                "text-sm uppercase tracking-[0.16em]",
                darkMode && "text-primary",
              )}
            >
              Vistas contables
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {vistasLocalizadas.map((vista) => {
                const Icon = vista.icon;
                const active = vistaActual === vista.id;

                return (
                  <button
                    key={vista.id}
                    type="button"
                    onClick={() => setVistaActual(vista.id)}
                    className={cn(
                      "flex min-h-[76px] w-full items-start gap-3 rounded-xl border p-3 text-left transition",
                      active
                        ? darkMode
                          ? "border-primary/60 bg-accent text-accent-foreground shadow-lg shadow-cyan-950/20"
                          : "border-blue-200 bg-primary/10 text-blue-950"
                        : darkMode
                          ? "border-cyan-400/15 bg-card/45 text-muted-foreground hover:bg-cyan-400/10"
                          : "border-border bg-card text-foreground/85 hover:bg-muted/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-lg p-2",
                        active
                          ? "bg-primary text-primary-foreground"
                          : darkMode
                            ? "bg-card text-primary"
                            : "bg-muted text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">
                        {vista.title}
                      </span>
                      <span
                        className={cn(
                          "mt-1 line-clamp-2 block text-xs leading-5",
                          darkMode
                            ? "text-muted-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {vista.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className={cn(metricClass, "md:col-span-2 xl:col-span-2")}>
              <div className={labelClass}>Vista activa</div>
              <div
                className={cn(
                  "mt-2 flex items-center gap-2 text-lg font-bold",
                  darkMode ? "text-foreground" : "text-foreground",
                )}
              >
                <CurrentIcon className="h-5 w-5 text-primary" />
                {currentVista.title}
              </div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Integración</div>
              <div className={valueClass}>ERP</div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Estado</div>
              <div className={valueClass}>{loading ? "Sync" : "Operativo"}</div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Tenant</div>
              <div className={valueClass}>Aislado</div>
            </div>
            <div className={metricClass}>
              <div className={labelClass}>Cuadre</div>
              <div className={valueClass}>Activo</div>
            </div>
          </div>

          {renderContent()}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.42fr)]">
            <Card
              className={cn(
                "overflow-hidden",
                darkMode &&
                  "border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20",
              )}
            >
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle
                  className={cn("text-base", darkMode && "text-foreground")}
                >
                  Radar operativo contable
                </CardTitle>
                <p
                  className={cn(
                    "text-xs",
                    darkMode
                      ? "text-muted-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  Señales conectadas a módulos reales; no se agregan métricas
                  inventadas.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-2">
                {barMetrics.map((metric) => (
                  <div
                    key={metric.label}
                    className={cn(
                      "rounded-xl border p-4",
                      darkMode
                        ? "border-cyan-400/15 bg-card/45"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          darkMode
                            ? "text-foreground/90"
                            : "text-foreground/85",
                        )}
                      >
                        {metric.label}
                      </span>
                      <span
                        className={cn(
                          "text-sm font-bold",
                          darkMode ? "text-foreground" : "text-foreground",
                        )}
                      >
                        {metric.value}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "mt-3 h-2 overflow-hidden rounded-full",
                        darkMode ? "bg-card" : "bg-muted",
                      )}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-300",
                          metric.widthClass,
                        )}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card
              className={cn(
                "overflow-hidden",
                darkMode &&
                  "border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20",
              )}
            >
              <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
                <CardTitle
                  className={cn("text-base", darkMode && "text-foreground")}
                >
                  Control de consistencia
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-1">
                {controlItems.map(([label, value]) => (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-3",
                      darkMode
                        ? "border-cyan-400/15 bg-card/45"
                        : "border-border bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-[0.14em]",
                        darkMode ? "text-primary/80" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold",
                        darkMode ? "text-foreground" : "text-foreground",
                      )}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card
            className={cn(
              "overflow-hidden",
              darkMode &&
                "border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20",
            )}
          >
            <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
              <CardTitle
                className={cn("text-base", darkMode && "text-foreground")}
              >
                Flujos contables principales
              </CardTitle>
              <p
                className={cn(
                  "text-xs",
                  darkMode ? "text-muted-foreground" : "text-muted-foreground",
                )}
              >
                Accesos compactos a las pantallas que sostienen la operación
                diaria.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              {operationalLinks.map((link) => {
                const Icon = link.icon;

                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "group flex items-start gap-3 rounded-xl border p-4 transition",
                      darkMode
                        ? "border-cyan-400/15 bg-card/45 text-foreground/90 hover:border-cyan-300/35 hover:bg-cyan-400/10"
                        : "border-border bg-card text-foreground/85 hover:border-blue-200 hover:bg-primary/10",
                    )}
                  >
                    <span
                      className={cn(
                        "rounded-lg p-2",
                        darkMode
                          ? "bg-card text-primary group-hover:bg-blue-600 group-hover:text-white"
                          : "bg-muted text-primary",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block text-sm font-bold",
                          darkMode ? "text-foreground" : "text-foreground",
                        )}
                      >
                        {link.title}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block text-xs leading-5",
                          darkMode
                            ? "text-muted-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {link.description}
                      </span>
                    </span>
                  </a>
                );
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
