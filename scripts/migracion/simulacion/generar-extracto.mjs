// Extracto sintético de un ERP en tablas DBF de distribución médica, para la
// simulación local de la migración (nunca datos reales). Trae lo que trae un
// extracto de verdad: CP850, registros borrados, códigos con mayúsculas mezcladas,
// unidades sin homologar, documentos cerrados y anulados, lotes vencidos,
// cuentas en dólares con sobregiro, históricos que no se migran y una tabla
// de usuarios con claves. Determinista por semilla.
//
// Variantes: la primera entrega trae errores reales sembrados (`plantados`);
// `corregido` es la reentrega del cliente tras el ensayo; `cambio` altera un
// precio ya migrado para probar el rechazo por origen cambiado.
import fs from 'node:fs';
import path from 'node:path';
import { escribirDbf } from '../escribir-dbf.mjs';

function azar(semilla) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entre = (min, max) => min + Math.floor(r() * (max - min + 1));
  return { r, entre, uno: (lista) => lista[Math.floor(r() * lista.length)], si: (p) => r() < p };
}

const pad = (n, l) => String(n).padStart(l, '0');
const redondear = (n, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
const dia = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);

function ruc(prefijo, cuerpo) {
  const base = `${prefijo}${pad(cuerpo, 8)}`;
  const suma = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((s, f, i) => s + f * Number(base[i]), 0);
  const resto = 11 - (suma % 11);
  return base + (resto === 10 ? 0 : resto === 11 ? 1 : resto);
}

const TIPOS_CLIENTE = ['Hospital', 'Clínica', 'Policlínico', 'Centro Médico', 'Botica', 'Laboratorio Clínico'];
const LUGARES = ['San José', 'Nuestra Señora de Fátima', 'Santa Mónica', 'El Niño Jesús', 'San Martín de Porres', 'Los Ángeles',
  'Señor de los Milagros', 'Santa Rosa', 'Daniel Alcides Carrión', 'La Esperanza', 'Virgen de Guadalupe', 'San Juan de Dios'];
const CIUDADES = ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Piura', 'Cusco', 'Huancayo', 'Iquitos', 'Ica', 'Tacna'];
const NOMBRES = ['María', 'José', 'Rosa', 'Luis', 'Carmen', 'Jorge', 'Ana', 'Víctor', 'Lucía', 'Ángel'];
const APELLIDOS = ['Pérez', 'Quispe', 'Huamán', 'Mamani', 'Rojas', 'Núñez', 'Gutiérrez', 'Chávez', 'Cárdenas', 'Ramírez'];
const FAMILIAS = [
  { familia: 'MEDICAMENTOS', lote: 1, unidades: ['UND', 'CJA'], items: ['Amoxicilina 500 mg x 100 tab', 'Paracetamol 500 mg x 100 tab',
    'Omeprazol 20 mg x 30 cáp', 'Ceftriaxona 1 g ampolla', 'Metformina 850 mg x 30 tab', 'Ibuprofeno 400 mg x 100 tab',
    'Dexametasona 4 mg ampolla', 'Ranitidina 300 mg x 30 tab'] },
  { familia: 'DISPOSITIVOS', lote: 0.5, unidades: ['UND', 'CJA', 'PAR'], items: ['Jeringa descartable 5 ml', 'Catéter endovenoso N°20',
    'Guantes de nitrilo talla M x 100', 'Mascarilla quirúrgica x 50', 'Equipo de venoclisis', 'Sonda Foley N°16'] },
  { familia: 'INSUMOS', lote: 0, unidades: ['UND', 'CJA', 'PAR'], items: ['Gasa estéril 10x10 x 100', 'Esparadrapo 5 cm x 5 m',
    'Algodón hidrófilo 500 g', 'Bata descartable', 'Gorro quirúrgico x 100'] },
  { familia: 'REACTIVOS', lote: 1, unidades: ['LT', 'KG'], items: ['Solución salina 0,9% 1 L', 'Glucosa en polvo', 'Reactivo hemoglobina',
    'Alcohol etílico 96°'] },
];

/** Escribe el extracto en `dir` y devuelve lo sembrado y los conteos. */
export function generarExtracto(dir, { semilla = 582, escala = 1, corregido = false, cambio = false, fechaCorte = '2026-10-31' } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const { r, entre, uno, si } = azar(semilla);
  const n = (base) => Math.max(1, Math.round(base * escala));
  const plantados = [];
  const conteos = {};
  const tabla = (archivo, campos, filas, opciones) => {
    escribirDbf(path.join(dir, archivo), campos, filas, opciones);
    conteos[archivo.replace(/\..+$/, '')] = filas.length;
  };

  // Clientes: empresas con RUC válido y personas con DNI; inactivos y borrados.
  const clientes = [];
  const documentos = new Set();
  for (let i = 1; i <= n(600); i++) {
    const persona = si(0.15);
    let doc;
    do doc = persona ? pad(entre(10000000, 79999999), 8) : ruc('20', entre(10000000, 99999999)); while (documentos.has(doc));
    documentos.add(doc);
    const ciudad = uno(CIUDADES);
    const razon = persona ? `${uno(NOMBRES)} ${uno(APELLIDOS)} ${uno(APELLIDOS)}`
      : `${uno(TIPOS_CLIENTE)} ${uno(LUGARES)} ${ciudad} ${uno(['S.A.C.', 'E.I.R.L.', 'S.A.'])}`;
    const dominio = `cliente${i}.pe`;
    clientes.push({ CODCLI: `C${pad(i, 5)}`, RAZON: razon.slice(0, 60), TIPDOC: persona ? '1' : '6', NRODOC: doc,
      DIRECC: `Av. ${uno(LUGARES)} ${entre(100, 2999)}, ${ciudad}`, EMAIL: si(0.2) ? `COMPRAS@${dominio.toUpperCase()}` : `compras@${dominio}`,
      TELEF: `0${entre(1, 84)} ${entre(200000, 799999)}`, LIMCRE: si(0.6) ? entre(5, 200) * 1000 : 0, ACTIVO: i % 20 !== 0,
      FECALT: dia('2012-01-01', entre(0, 5000)), OBSERV: si(0.1) ? 'Cliente con convenio marco' : '' });
  }
  if (!corregido) {
    clientes[6].EMAIL = 'compras@@hospital-error.pe';
    plantados.push({ archivo: 'clientes', id: clientes[6].CODCLI, causa: 'email inválido en el sistema anterior' });
  }
  const activos = clientes.filter((c) => c.ACTIVO);
  tabla('CLIENTES.DBF', [
    { nombre: 'CODCLI', tipo: 'C', largo: 10 }, { nombre: 'RAZON', tipo: 'C', largo: 60 }, { nombre: 'TIPDOC', tipo: 'C', largo: 1 },
    { nombre: 'NRODOC', tipo: 'C', largo: 11 }, { nombre: 'DIRECC', tipo: 'C', largo: 60 }, { nombre: 'EMAIL', tipo: 'C', largo: 50 },
    { nombre: 'TELEF', tipo: 'C', largo: 15 }, { nombre: 'LIMCRE', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'ACTIVO', tipo: 'L', largo: 1 },
    { nombre: 'FECALT', tipo: 'D', largo: 8 }, { nombre: 'OBSERV', tipo: 'M', largo: 4 },
  ], [...clientes, ...[1, 2, 3].map((k) => ({ ...clientes[k], CODCLI: `CB${k}`, NRODOC: '' }))], { borrados: [clientes.length, clientes.length + 1, clientes.length + 2] });

  // Proveedores.
  const proveedores = [];
  for (let i = 1; i <= n(150); i++) {
    let doc;
    do doc = ruc('20', entre(10000000, 99999999)); while (documentos.has(doc));
    documentos.add(doc);
    proveedores.push({ CODPRO: `P${pad(i, 4)}`, RAZON: `${uno(['Droguería', 'Laboratorios', 'Distribuidora', 'Importadora'])} ${uno(LUGARES)} S.A.C.`,
      NRODOC: doc, DIRECC: `Jr. ${uno(LUGARES)} ${entre(100, 999)}, Lima`, EMAIL: `ventas@proveedor${i}.pe`, TELEF: `01 ${entre(2000000, 7999999)}`,
      DETRAC: si(0.2), TASDET: 0.04, ACTIVO: i % 25 !== 0 });
  }
  if (!corregido) {
    proveedores[2].EMAIL = '';
    plantados.push({ archivo: 'proveedores', id: proveedores[2].CODPRO, causa: 'proveedor sin correo en el sistema anterior' });
  }
  const provActivos = proveedores.filter((p) => p.ACTIVO);
  tabla('PROVEED.DBF', [
    { nombre: 'CODPRO', tipo: 'C', largo: 10 }, { nombre: 'RAZON', tipo: 'C', largo: 60 }, { nombre: 'NRODOC', tipo: 'C', largo: 11 },
    { nombre: 'DIRECC', tipo: 'C', largo: 60 }, { nombre: 'EMAIL', tipo: 'C', largo: 50 }, { nombre: 'TELEF', tipo: 'C', largo: 15 },
    { nombre: 'DETRAC', tipo: 'L', largo: 1 }, { nombre: 'TASDET', tipo: 'N', largo: 6, decimales: 4 }, { nombre: 'ACTIVO', tipo: 'L', largo: 1 },
  ], proveedores);

  const almacenes = [['01', 'Almacén central Lima', 'Av. Argentina 2450, Callao'], ['02', 'Almacén Arequipa', 'Parque Industrial, Arequipa'],
    ['03', 'Almacén Trujillo', 'Av. Mansiche 1200, Trujillo'], ['04', 'Almacén de cuarentena', 'Av. Argentina 2450, Callao']]
    .map(([CODALM, NOMBRE, DIRECC]) => ({ CODALM, NOMBRE, DIRECC, PRINCIPAL: CODALM === '01' }));
  tabla('ALMACEN.DBF', [{ nombre: 'CODALM', tipo: 'C', largo: 2 }, { nombre: 'NOMBRE', tipo: 'C', largo: 40 },
    { nombre: 'DIRECC', tipo: 'C', largo: 60 }, { nombre: 'PRINCIPAL', tipo: 'L', largo: 1 }], almacenes);

  const plan = [['10', 'Efectivo y equivalentes de efectivo'], ['104', 'Cuentas corrientes en instituciones financieras'],
    ['1041', 'Cuentas corrientes operativas'], ['104101', 'BCP cuenta corriente soles'], ['104102', 'BCP cuenta corriente dólares'],
    ['104103', 'Interbank cuenta corriente soles'], ['104104', 'BBVA cuenta corriente soles'], ['104199', 'Fondo fijo (sin uso)'],
    ['12', 'Cuentas por cobrar comerciales - terceros'], ['121', 'Facturas, boletas y otros comprobantes por cobrar'],
    ['1212', 'Emitidas en cartera'], ['20', 'Mercaderías'], ['201', 'Mercaderías manufacturadas'], ['2011', 'Mercaderías manufacturadas - costo'],
    ['42', 'Cuentas por pagar comerciales - terceros'], ['421', 'Facturas, boletas y otros comprobantes por pagar'], ['4212', 'Emitidas'],
    ['50', 'Capital'], ['501', 'Capital social'], ['5011', 'Acciones']]
    .map(([CUENTA, DESCRI]) => ({ CUENTA, DESCRI, NIVEL: CUENTA.length <= 2 ? 1 : CUENTA.length <= 3 ? 2 : CUENTA.length <= 4 ? 3 : 4, MOVIM: CUENTA.length >= 4 }));
  tabla('PLANCTA.DBF', [{ nombre: 'CUENTA', tipo: 'C', largo: 12 }, { nombre: 'DESCRI', tipo: 'C', largo: 60 },
    { nombre: 'NIVEL', tipo: 'N', largo: 2 }, { nombre: 'MOVIM', tipo: 'L', largo: 1 }], plan);

  // Artículos: un código en minúsculas duplica a otro (el sistema anterior no distingue) y una unidad sin homologar.
  const articulos = [];
  for (let i = 1; i <= n(1500); i++) {
    const f = uno(FAMILIAS);
    const lote = r() < f.lote;
    const costo = redondear(0.4 + r() ** 2 * 600, 2);
    articulos.push({ CODART: `MED-${pad(i, 4)}`, DESCRI: `${uno(f.items)} ${uno(['', 'genérico', 'marca A', 'marca B'])}`.trim().slice(0, 60),
      FAMILIA: f.familia, UNIDAD: uno(f.unidades), PRECIO: redondear(costo * (1.25 + r() * 0.6), 2), COSTO: costo, LOTE: lote,
      DIASVIDA: lote ? uno([0, 30, 90, 180]) : 0, IGV: f.familia === 'MEDICAMENTOS' && si(0.2) ? 'E' : 'S', ACTIVO: i % 30 !== 0 });
  }
  Object.assign(articulos[Math.min(40, articulos.length - 1)], { UNIDAD: 'GLN', DESCRI: 'Alcohol etílico 70° galón', LOTE: false, DIASVIDA: 0 });
  if (cambio) articulos[0].PRECIO = redondear(articulos[0].PRECIO + 1.5, 2);
  const base = articulos[Math.min(98, articulos.length - 1)];
  const duplicado = { ...base, CODART: base.CODART.toLowerCase(), DESCRI: `${base.DESCRI} (copia)` };
  if (!corregido) plantados.push({ archivo: 'productos', id: duplicado.CODART, causa: 'código repetido con otra capitalización' });
  const artActivos = articulos.filter((a) => a.ACTIVO);
  tabla('ARTICULO.DBF', [
    { nombre: 'CODART', tipo: 'C', largo: 15 }, { nombre: 'DESCRI', tipo: 'C', largo: 60 }, { nombre: 'FAMILIA', tipo: 'C', largo: 20 },
    { nombre: 'UNIDAD', tipo: 'C', largo: 4 }, { nombre: 'PRECIO', tipo: 'Y', largo: 8 }, { nombre: 'COSTO', tipo: 'Y', largo: 8 },
    { nombre: 'LOTE', tipo: 'L', largo: 1 }, { nombre: 'DIASVIDA', tipo: 'N', largo: 4 }, { nombre: 'IGV', tipo: 'C', largo: 1 },
    { nombre: 'ACTIVO', tipo: 'L', largo: 1 },
  ], [...articulos, duplicado], { borrados: corregido ? [articulos.length] : [] });

  const TC = 3.752;
  const bancos = [
    { CODBAN: '001', BANCO: 'BCP', NROCTA: '193-1234567-0-11', MONEDA: 'S', CTACON: '104101', SALDO: 152340.55, TC: 0 },
    { CODBAN: '002', BANCO: 'BCP', NROCTA: '193-7654321-1-22', MONEDA: 'D', CTACON: '104102', SALDO: 25000, TC },
    { CODBAN: '003', BANCO: 'INTERBANK', NROCTA: '200-3001234567', MONEDA: 'S', CTACON: '104103', SALDO: 48210.3, TC: 0 },
    { CODBAN: '004', BANCO: 'BBVA', NROCTA: '0011-0123-0100045678', MONEDA: 'S', CTACON: '104104', SALDO: -3500, TC: 0 },
  ].map((b) => ({ ...b, FECSAL: fechaCorte }));
  tabla('BANCOS.DBF', [
    { nombre: 'CODBAN', tipo: 'C', largo: 3 }, { nombre: 'BANCO', tipo: 'C', largo: 20 }, { nombre: 'NROCTA', tipo: 'C', largo: 25 },
    { nombre: 'MONEDA', tipo: 'C', largo: 1 }, { nombre: 'CTACON', tipo: 'C', largo: 12 }, { nombre: 'SALDO', tipo: 'N', largo: 14, decimales: 2 },
    { nombre: 'FECSAL', tipo: 'D', largo: 8 }, { nombre: 'TC', tipo: 'N', largo: 8, decimales: 4 },
  ], bancos);

  // Listas de precios: cabecera y detalle, sólo artículos activos y sin repetir.
  const listas = [{ IDLIS: 'L01', NOMBRE: 'Hospitales públicos', MONEDA: 'S' }, { IDLIS: 'L02', NOMBRE: 'Clínicas privadas', MONEDA: 'S' },
    { IDLIS: 'L03', NOMBRE: 'Exportación', MONEDA: 'D' }].map((l) => ({ ...l, FECINI: '2026-01-01', CODCLI: '' }));
  const listaDet = [];
  for (const l of listas) {
    const elegidos = new Set();
    while (elegidos.size < Math.min(n(300), artActivos.length)) elegidos.add(uno(artActivos));
    for (const a of elegidos) listaDet.push({ IDLIS: l.IDLIS, CODART: a.CODART,
      PRECIO: l.MONEDA === 'D' ? redondear(a.PRECIO / TC, 4) : redondear(a.PRECIO * (l.IDLIS === 'L01' ? 0.92 : 1.05), 4), CANMIN: uno([1, 1, 1, 10, 50]) });
  }
  tabla('LISTAPRE.DBF', [{ nombre: 'IDLIS', tipo: 'C', largo: 4 }, { nombre: 'NOMBRE', tipo: 'C', largo: 40 }, { nombre: 'MONEDA', tipo: 'C', largo: 1 },
    { nombre: 'FECINI', tipo: 'D', largo: 8 }, { nombre: 'CODCLI', tipo: 'C', largo: 10 }], listas);
  tabla('LISTADET.DBF', [{ nombre: 'IDLIS', tipo: 'C', largo: 4 }, { nombre: 'CODART', tipo: 'C', largo: 15 },
    { nombre: 'PRECIO', tipo: 'N', largo: 12, decimales: 4 }, { nombre: 'CANMIN', tipo: 'N', largo: 8 }], listaDet);

  // Documentos por cobrar y por pagar: abiertos, cancelados y notas de crédito.
  const documento = (prefijo, tercero, i, cerrados) => {
    const fecemi = dia(fechaCorte, -entre(1, 240));
    const total = redondear(entre(150, 45000) + r(), 2);
    const tip = si(0.8) ? '01' : si(0.75) ? '03' : '07';
    return { IDDOC: i, [prefijo]: tercero, TIPDOC: tip, SERIE: tip === '03' ? 'B001' : 'F001', NUMERO: pad(i, 8), FECEMI: fecemi,
      FECVEN: dia(fecemi, uno([0, 15, 30, 60, 90])), MONEDA: 'S', TOTAL: total,
      SALDO: si(cerrados) ? 0 : si(0.5) ? total : redondear(total * (0.1 + r() * 0.8), 2) };
  };
  const cxc = Array.from({ length: n(900) }, (_, k) => documento('CODCLI', uno(activos).CODCLI, 100000 + k, 0.4));
  // Se genera siempre para que la reentrega consuma el mismo azar; sólo la primera lo trae.
  const huerfano = { ...documento('CODCLI', 'C99999', 199999, 0), TIPDOC: '01' };
  if (!corregido) {
    cxc.push(huerfano);
    plantados.push({ archivo: 'cxc', id: 'CXC-199999', causa: 'documento de un cliente que no existe' });
  }
  const docCampos = (tercero) => [
    { nombre: 'IDDOC', tipo: 'N', largo: 8 }, { nombre: tercero, tipo: 'C', largo: 10 }, { nombre: 'TIPDOC', tipo: 'C', largo: 2 },
    { nombre: 'SERIE', tipo: 'C', largo: 4 }, { nombre: 'NUMERO', tipo: 'C', largo: 8 }, { nombre: 'FECEMI', tipo: 'D', largo: 8 },
    { nombre: 'FECVEN', tipo: 'D', largo: 8 }, { nombre: 'MONEDA', tipo: 'C', largo: 1 }, { nombre: 'TOTAL', tipo: 'N', largo: 12, decimales: 2 },
    { nombre: 'SALDO', tipo: 'N', largo: 12, decimales: 2 }];
  tabla('CXCDOC.DBF', docCampos('CODCLI'), cxc);
  const cxp = Array.from({ length: n(400) }, (_, k) => {
    const d = documento('CODPRO', uno(provActivos).CODPRO, 300000 + k, 0.5);
    return { ...d, SERIE: `F${pad(entre(1, 30), 3)}` };
  });
  tabla('CXPDOC.DBF', docCampos('CODPRO'), cxp);

  // Contratos de suministro con OC del cliente y cronograma.
  const contratos = [], contDet = [], ocCab = [], ocDet = [], cronog = [];
  let idOc = 0;
  for (let c = 1; c <= n(40); c++) {
    const cerrado = c % 7 === 0;
    const desde = dia(fechaCorte, -entre(30, 300));
    const hasta = dia(fechaCorte, entre(90, 400));
    const cliente = uno(activos.filter((x) => x.TIPDOC === '6'));
    contratos.push({ IDCONT: c, NUMERO: `LP-${pad(c, 3)}-2026`, CODCLI: cliente.CODCLI,
      DESCRIP: `Suministro de ${uno(['medicamentos', 'insumos médicos', 'dispositivos', 'reactivos'])} para ${cliente.RAZON}`.slice(0, 60),
      MONEDA: 'S', FECINI: desde, FECFIN: hasta, ESTADO: cerrado ? 'C' : 'V', NOTAS: si(0.3) ? 'Adenda 1 firmada' : '', ALTA: `${desde}T09:00:00Z` });
    const agotado = c === 3 && !corregido;
    if (agotado) plantados.push({ archivo: 'contratos', id: String(c), causa: 'contrato ejecutado al 100% pero vigente en el sistema anterior' });
    if (c === 3 && corregido) contratos.at(-1).ESTADO = 'C';
    const lineas = [];
    const usados = new Set();
    for (let item = 1; item <= entre(3, 6); item++) {
      let a;
      do a = uno(artActivos); while (usados.has(a.CODART));
      usados.add(a.CODART);
      const cantidad = entre(20, 400) * 10;
      const ent = c === 3 ? cantidad : si(0.15) ? cantidad : Math.floor(cantidad * r() * 0.7);
      const linea = { IDCONT: c, ITEM: item, CODART: a.CODART, CANTIDAD: cantidad, CANTENT: ent, PRECIO: redondear(a.PRECIO * 0.95, 2) };
      contDet.push(linea);
      lineas.push({ ...linea, linea, comprometido: 0 });
    }
    if (cerrado || c === 3) continue;
    for (let o = 0; o < entre(1, 4); o++) {
      // Lo comprometido en OC no supera lo abierto de la línea del contrato.
      const abiertas = lineas.filter((l) => l.CANTIDAD - l.CANTENT - l.comprometido >= 20);
      if (!abiertas.length) break;
      const id = `OC-${pad(++idOc, 4)}`;
      const fecha = dia(desde, entre(0, Math.max(0, Math.round((Date.parse(fechaCorte) - Date.parse(desde)) / 86400000))));
      const anulada = si(0.08);
      ocCab.push({ IDOC: id, IDCONT: c, NUMOC: `OC-2026-${pad(idOc, 4)}`, FECHA: fecha, ANULADA: anulada });
      let item = 0;
      for (const l of abiertas.slice(0, entre(1, abiertas.length))) {
        const abierto = l.CANTIDAD - l.CANTENT - l.comprometido;
        const cantidad = Math.max(10, Math.floor(abierto * 0.4 / 10) * 10);
        const entregada = Math.floor(cantidad * r() * 0.5);
        if (!anulada) l.comprometido += cantidad;
        ocDet.push({ IDOC: id, ITEM: ++item, ITEMCONT: l.ITEM, CANTIDAD: cantidad, CANTENT: entregada });
        if (anulada) continue;
        let pendiente = cantidad - entregada;
        // Lo ya entregado en el sistema anterior queda como entrega histórica (E): no se migra.
        if (entregada) cronog.push({ IDOC: id, ITEM: item, NROENT: 0, FECENT: dia(fecha, 5), CANTIDAD: entregada, CANTENT: entregada,
          LUGAR: 'Almacén del cliente; puerta 2', ESTADO: 'E' });
        for (let k = 1; pendiente > 0 && k <= 3; k++) {
          const parte = k === 3 ? pendiente : Math.max(1, Math.floor(pendiente / (4 - k)));
          const parcial = k === 1 && si(0.2) ? Math.floor(parte / 3) : 0;
          const minimo = Math.max(Date.parse(fecha), Date.parse(dia(fechaCorte, -20)));
          const fecent = new Date(Math.min(Date.parse(hasta), minimo + entre(0, 120) * 86400000)).toISOString().slice(0, 10);
          cronog.push({ IDOC: id, ITEM: item, NROENT: k, FECENT: fecent, CANTIDAD: parte, CANTENT: parcial,
            LUGAR: `${uno(['Almacén central', 'Farmacia', 'Sede norte; puerta 3'])} del cliente`, ESTADO: 'P' });
          pendiente -= parte;
        }
      }
    }
  }
  tabla('CONTRATO.DBF', [
    { nombre: 'IDCONT', tipo: 'I', largo: 4 }, { nombre: 'NUMERO', tipo: 'C', largo: 20 }, { nombre: 'CODCLI', tipo: 'C', largo: 10 },
    { nombre: 'DESCRIP', tipo: 'C', largo: 60 }, { nombre: 'MONEDA', tipo: 'C', largo: 1 }, { nombre: 'FECINI', tipo: 'D', largo: 8 },
    { nombre: 'FECFIN', tipo: 'D', largo: 8 }, { nombre: 'ESTADO', tipo: 'C', largo: 1 }, { nombre: 'NOTAS', tipo: 'M', largo: 4 },
    { nombre: 'ALTA', tipo: 'T', largo: 8 },
  ], contratos);
  tabla('CONTDET.DBF', [
    { nombre: 'IDCONT', tipo: 'I', largo: 4 }, { nombre: 'ITEM', tipo: 'N', largo: 3 }, { nombre: 'CODART', tipo: 'C', largo: 15 },
    { nombre: 'CANTIDAD', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'CANTENT', tipo: 'N', largo: 12, decimales: 2 },
    { nombre: 'PRECIO', tipo: 'Y', largo: 8 },
  ], contDet);
  tabla('OCCAB.DBF', [{ nombre: 'IDOC', tipo: 'C', largo: 8 }, { nombre: 'IDCONT', tipo: 'I', largo: 4 }, { nombre: 'NUMOC', tipo: 'C', largo: 15 },
    { nombre: 'FECHA', tipo: 'D', largo: 8 }, { nombre: 'ANULADA', tipo: 'L', largo: 1 }], ocCab);
  tabla('OCDET.DBF', [{ nombre: 'IDOC', tipo: 'C', largo: 8 }, { nombre: 'ITEM', tipo: 'N', largo: 3 }, { nombre: 'ITEMCONT', tipo: 'N', largo: 3 },
    { nombre: 'CANTIDAD', tipo: 'B', largo: 8 }, { nombre: 'CANTENT', tipo: 'B', largo: 8 }], ocDet);
  const csv = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  fs.writeFileSync(path.join(dir, 'CRONOG.csv'), ['IDOC;ITEM;NROENT;FECENT;CANTIDAD;CANTENT;LUGAR;ESTADO',
    ...cronog.map((x) => [x.IDOC, x.ITEM, x.NROENT, x.FECENT, x.CANTIDAD, x.CANTENT, x.LUGAR, x.ESTADO].map(csv).join(';'))].join('\r\n') + '\r\n', 'latin1');
  conteos.CRONOG = cronog.length;

  // OC de compra y pedidos de venta: abiertos, cerrados y anulados; siempre algo pendiente en los abiertos.
  const documentosConLineas = (cantidad, prefijo, tercero, campoEjec, abiertoEstado) => {
    const cab = [], det = [];
    for (let i = 1; i <= cantidad; i++) {
      const estado = si(0.65) ? abiertoEstado : si(0.7) ? 'C' : 'A';
      const id = `${prefijo}${pad(i, 5)}`;
      cab.push({ id, estado, tercero: tercero(), fecha: dia(fechaCorte, -entre(1, 60)) });
      const lineas = entre(1, 5);
      const usados = new Set();
      for (let item = 1; item <= lineas; item++) {
        let a;
        do a = uno(artActivos); while (usados.has(a.CODART));
        usados.add(a.CODART);
        const cant = entre(1, 50) * 10;
        const ejec = item === 1 ? Math.floor(cant * r() * 0.6) : si(0.3) ? cant : Math.floor(cant * r());
        det.push({ id, item, CODART: a.CODART, CANT: cant, [campoEjec]: ejec, PRECIO: prefijo === 'OCC' ? a.COSTO : a.PRECIO });
      }
    }
    return { cab, det };
  };
  const compras = documentosConLineas(n(60), 'OCC', () => uno(provActivos).CODPRO, 'CANREC', 'P');
  tabla('OCCOMPRA.DBF', [{ nombre: 'IDOC', tipo: 'C', largo: 8 }, { nombre: 'NUMERO', tipo: 'C', largo: 15 }, { nombre: 'CODPRO', tipo: 'C', largo: 10 },
    { nombre: 'FECHA', tipo: 'D', largo: 8 }, { nombre: 'MONEDA', tipo: 'C', largo: 1 }, { nombre: 'CODALM', tipo: 'C', largo: 2 },
    { nombre: 'ESTADO', tipo: 'C', largo: 1 }, { nombre: 'FECENT', tipo: 'D', largo: 8 }],
  compras.cab.map((c) => ({ IDOC: c.id, NUMERO: `OCF-2026-${c.id.slice(-5)}`, CODPRO: c.tercero, FECHA: c.fecha, MONEDA: 'S',
    CODALM: uno(['01', '01', '02', '03']), ESTADO: c.estado, FECENT: dia(fechaCorte, entre(5, 45)) })));
  tabla('OCCDET.DBF', [{ nombre: 'IDOC', tipo: 'C', largo: 8 }, { nombre: 'ITEM', tipo: 'N', largo: 3 }, { nombre: 'CODART', tipo: 'C', largo: 15 },
    { nombre: 'CANT', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'CANREC', tipo: 'N', largo: 12, decimales: 2 },
    { nombre: 'PRECIO', tipo: 'N', largo: 12, decimales: 4 }],
  compras.det.map((d) => ({ IDOC: d.id, ITEM: d.item, CODART: d.CODART, CANT: d.CANT, CANREC: d.CANREC, PRECIO: d.PRECIO })));
  const ventas = documentosConLineas(n(200), 'PV', () => uno(activos).CODCLI, 'CANDES', 'P');
  tabla('PEDIDO.DBF', [{ nombre: 'IDPED', tipo: 'C', largo: 8 }, { nombre: 'NUMERO', tipo: 'C', largo: 15 }, { nombre: 'CODCLI', tipo: 'C', largo: 10 },
    { nombre: 'FECHA', tipo: 'D', largo: 8 }, { nombre: 'MONEDA', tipo: 'C', largo: 1 }, { nombre: 'ESTADO', tipo: 'C', largo: 1 }],
  ventas.cab.map((c) => ({ IDPED: c.id, NUMERO: `PED-2026-${c.id.slice(-5)}`, CODCLI: c.tercero, FECHA: c.fecha, MONEDA: 'S',
    ESTADO: c.estado === 'C' ? 'F' : c.estado })));
  tabla('PEDDET.DBF', [{ nombre: 'IDPED', tipo: 'C', largo: 8 }, { nombre: 'ITEM', tipo: 'N', largo: 3 }, { nombre: 'CODART', tipo: 'C', largo: 15 },
    { nombre: 'CANT', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'CANDES', tipo: 'N', largo: 12, decimales: 2 },
    { nombre: 'PRECIO', tipo: 'N', largo: 12, decimales: 4 }],
  ventas.det.map((d) => ({ IDPED: d.id, ITEM: d.item, CODART: d.CODART, CANT: d.CANT, CANDES: d.CANDES, PRECIO: d.PRECIO })));

  // Stock por almacén: lotes con vencimiento (también vencidos), sin lote para el resto, y ceros que no se migran.
  const saldos = [];
  // Un lote tiene un solo vencimiento aunque esté en varios almacenes (y en el sistema anterior se escriba con minúscula).
  const vencimientos = new Map();
  for (const a of artActivos) {
    for (const alm of ['01', '02', '03'].slice(0, entre(1, 3))) {
      const lotes = a.LOTE ? entre(1, 3) : 1;
      for (let k = 0; k < lotes; k++) {
        const stock = si(0.08) ? 0 : entre(1, 120) * 5;
        const lote = a.LOTE ? `${si(0.2) ? 'l' : 'L'}${pad(entre(2301, 2612), 4)}${'ABC'[k]}` : '';
        const vence = a.LOTE ? dia(fechaCorte, entre(-60, 900)) : null;
        const clave = `${a.CODART}|${lote.toUpperCase()}`;
        if (lote && !vencimientos.has(clave)) vencimientos.set(clave, vence);
        saldos.push({ CODART: a.CODART, CODALM: alm, STOCK: stock, COSTO: a.COSTO, LOTE: lote, FECVEN: lote ? vencimientos.get(clave) : null });
      }
    }
  }
  const idStock = (s) => `stock:${s.CODART}:${s.LOTE ? `${s.LOTE.toUpperCase()}:` : ''}ORI-${s.CODALM}:${fechaCorte}`;
  const sinLote = saldos.find((s) => s.LOTE && s.STOCK > 0);
  const repetido = saldos.find((s) => s.LOTE && s.STOCK > 0 && s !== sinLote);
  // El mismo lote en el almacén de cuarentena: en la primera entrega, con otro vencimiento.
  saldos.push({ ...repetido, CODALM: '04', STOCK: 10, FECVEN: corregido ? repetido.FECVEN : dia(repetido.FECVEN, 180) });
  if (corregido) Object.assign(sinLote, { LOTE: 'L-REG-01' });
  else {
    Object.assign(sinLote, { LOTE: '', FECVEN: null });
    plantados.push({ archivo: 'stock', id: idStock(sinLote), causa: 'producto con control de lote sin lote ni vencimiento en el sistema anterior' });
    plantados.push({ archivo: 'stock', id: idStock(saldos.at(-1)), causa: 'mismo lote con otro vencimiento en otro almacén' });
  }
  tabla('SALDOS.DBF', [{ nombre: 'CODART', tipo: 'C', largo: 15 }, { nombre: 'CODALM', tipo: 'C', largo: 2 },
    { nombre: 'STOCK', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'COSTO', tipo: 'N', largo: 12, decimales: 4 },
    { nombre: 'LOTE', tipo: 'C', largo: 15 }, { nombre: 'FECVEN', tipo: 'D', largo: 8 }], saldos);

  // Balance al corte desde los propios libros del sistema anterior: cuadra y coincide con bancos, cartera, stock y proveedores.
  const abiertoCxc = redondear(cxc.filter((d) => ['01', '03'].includes(d.TIPDOC)).reduce((s, d) => s + d.SALDO, 0));
  const abiertoCxp = redondear(cxp.filter((d) => ['01', '03'].includes(d.TIPDOC)).reduce((s, d) => s + d.SALDO, 0));
  const inventario = redondear(saldos.filter((s) => s.STOCK > 0).reduce((t, s) => t + redondear(s.STOCK * s.COSTO), 0));
  const lineasBalance = [
    ...bancos.map((b) => {
      const local = redondear(b.SALDO * (b.TC || 1));
      return { CUENTA: b.CTACON, DEBE: Math.max(local, 0), HABER: Math.max(-local, 0), DESCRI: `Saldo ${b.BANCO} ${b.MONEDA === 'D' ? 'US$' : 'S/'}` };
    }),
    { CUENTA: '1212', DEBE: abiertoCxc, HABER: 0, DESCRI: 'Cartera de clientes al corte' },
    { CUENTA: '2011', DEBE: inventario, HABER: 0, DESCRI: 'Inventario valorizado al corte' },
    { CUENTA: '4212', DEBE: 0, HABER: abiertoCxp, DESCRI: 'Proveedores al corte' },
  ];
  const debe = redondear(lineasBalance.reduce((s, l) => s + l.DEBE, 0));
  const haber = redondear(lineasBalance.reduce((s, l) => s + l.HABER, 0));
  lineasBalance.push({ CUENTA: '5011', DEBE: 0, HABER: redondear(debe - haber), DESCRI: 'Capital y resultados acumulados' });
  tabla('SALDOCTA.DBF', [{ nombre: 'CUENTA', tipo: 'C', largo: 12 }, { nombre: 'DEBE', tipo: 'N', largo: 14, decimales: 2 },
    { nombre: 'HABER', tipo: 'N', largo: 14, decimales: 2 }, { nombre: 'DESCRI', tipo: 'C', largo: 40 }], lineasBalance);

  // Históricos sin equivalente operativo: quedan sólo en el archivo íntegro.
  tabla('KARDEX.DBF', [{ nombre: 'FECHA', tipo: 'D', largo: 8 }, { nombre: 'CODART', tipo: 'C', largo: 15 }, { nombre: 'CODALM', tipo: 'C', largo: 2 },
    { nombre: 'TIPMOV', tipo: 'C', largo: 1 }, { nombre: 'CANT', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'COSTO', tipo: 'N', largo: 12, decimales: 4 },
    { nombre: 'DOCREF', tipo: 'C', largo: 15 }, { nombre: 'GLOSA', tipo: 'C', largo: 40 }],
  Array.from({ length: n(40000) }, (_, k) => {
    const a = uno(articulos);
    const ingreso = si(0.45);
    return { FECHA: dia('2019-01-02', Math.floor(k * 2850 / n(40000))), CODART: a.CODART, CODALM: uno(['01', '02', '03']), TIPMOV: ingreso ? 'I' : 'S',
      CANT: entre(1, 200), COSTO: a.COSTO, DOCREF: ingreso ? `OCF-${pad(entre(1, 9999), 5)}` : `F001-${pad(entre(1, 99999), 6)}`,
      GLOSA: ingreso ? `Ingreso por compra ${uno(['local', 'importación'])}` : `Salida a ${uno(['hospital', 'clínica', 'botica'])} ${uno(CIUDADES)}` };
  }), { borrados: [5, 77, 1024] });
  tabla('VENTAS.DBF', [{ nombre: 'NRODOC', tipo: 'C', largo: 13 }, { nombre: 'FECHA', tipo: 'D', largo: 8 }, { nombre: 'CODCLI', tipo: 'C', largo: 10 },
    { nombre: 'TOTAL', tipo: 'N', largo: 12, decimales: 2 }, { nombre: 'ESTADO', tipo: 'C', largo: 1 }],
  Array.from({ length: n(15000) }, (_, k) => ({ NRODOC: `F001-${pad(k + 1, 8)}`, FECHA: dia('2019-01-02', Math.floor(k * 2850 / n(15000))),
    CODCLI: uno(clientes).CODCLI, TOTAL: redondear(entre(50, 30000) + r()), ESTADO: si(0.97) ? 'E' : 'A' })));
  tabla('ASIENTOS.DBF', [{ nombre: 'NROASI', tipo: 'N', largo: 8 }, { nombre: 'FECHA', tipo: 'D', largo: 8 }, { nombre: 'CUENTA', tipo: 'C', largo: 12 },
    { nombre: 'DEBE', tipo: 'N', largo: 14, decimales: 2 }, { nombre: 'HABER', tipo: 'N', largo: 14, decimales: 2 }, { nombre: 'GLOSA', tipo: 'C', largo: 40 }],
  Array.from({ length: n(20000) }, (_, k) => {
    const monto = redondear(entre(10, 20000) + r());
    return { NROASI: Math.floor(k / 2) + 1, FECHA: dia('2019-01-02', Math.floor(k * 2850 / n(20000))), CUENTA: uno(plan).CUENTA,
      DEBE: k % 2 ? 0 : monto, HABER: k % 2 ? monto : 0, GLOSA: uno(['Provisión de ventas', 'Pago a proveedores', 'Cobranza', 'Planilla']) };
  }));
  tabla('USUARIOS.DBF', [{ nombre: 'USUARIO', tipo: 'C', largo: 10 }, { nombre: 'NOMBRE', tipo: 'C', largo: 40 }, { nombre: 'CLAVE', tipo: 'C', largo: 20 },
    { nombre: 'NIVEL', tipo: 'N', largo: 1 }],
  ['ADMIN', 'CONTA1', 'CAJA1', 'ALMACEN1', 'VENTAS1', 'VENTAS2', 'COMPRAS1', 'GERENTE'].map((u, k) => ({ USUARIO: u,
    NOMBRE: `${uno(NOMBRES)} ${uno(APELLIDOS)}`, CLAVE: `clave${pad(entre(1000, 9999), 4)}!`, NIVEL: k ? 2 : 9 })));
  tabla('PARAMETR.DBF', [{ nombre: 'PARAM', tipo: 'C', largo: 20 }, { nombre: 'VALOR', tipo: 'C', largo: 60 }],
    [['EMPRESA', 'Distribuidora Médica Sintética S.A.C.'], ['RUC', ruc('20', 55823011)], ['IGV', '18'], ['MONEDA', 'S'],
      ['CORTE', fechaCorte]].map(([PARAM, VALOR]) => ({ PARAM, VALOR })));
  fs.writeFileSync(path.join(dir, 'AUDITORIA.csv'), ['FECHA;USUARIO;ACCION;DETALLE',
    ...Array.from({ length: n(2000) }, (_, k) => [dia('2024-01-01', Math.floor(k / 3)), uno(['ADMIN', 'CAJA1', 'VENTAS1']),
      uno(['ALTA', 'MODIFICA', 'ANULA']), `Documento ${pad(k, 6)}; módulo ${uno(['ventas', 'compras', 'almacén'])}`].map(csv).join(';'))].join('\r\n') + '\r\n', 'latin1');
  conteos.AUDITORIA = n(2000);
  return { plantados, conteos, cortes: { fechaCorte, abiertoCxc, abiertoCxp, inventario, bancos_local: redondear(bancos.reduce((s, b) => s + b.SALDO * (b.TC || 1), 0)) } };
}
