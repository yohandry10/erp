import { CPEIntegrationService } from './cpe-integration.service';
import { CpeXmlBuilder } from '../../cpe/cpe-xml.builder';

describe('D21: IGV de pedidos Perú conserva los centavos entre líneas y cabecera', () => {
  async function map(bases: number[], affectations = bases.map(() => '10'), pais = 'PE', rate = .18) {
    const service = new CPEIntegrationService({} as any, {} as any, {} as any, {} as any,
      { getTasaIgv: async () => rate } as any);
    jest.spyOn(service as any, 'obtenerSerieYNumero').mockResolvedValue({serie:'F001',numero:4});
    jest.spyOn(service as any, 'obtenerCostoPorProducto').mockResolvedValue(new Map());
    jest.spyOn(service as any, 'obtenerAfectacionPorProducto').mockResolvedValue(new Map(bases.map((_,i)=>['product-'+i,affectations[i]])));
    return (service as any).mapearPedidoACPE({id:'order',tenant_id:'tenant',detalle:bases.map((base,i)=>({
      id:'line-'+i,producto_id:'product-'+i,descripcion:'Línea '+i,cantidad:1,precio_unitario:base,subtotal:base,
    }))}, {documento_tipo:'RUC',ruc:'20600000013',razon_social:'Cliente prueba'},
    {pais,ruc:'20123456786',razon_social:'Emisor prueba',moneda_defecto:'PEN'});
  }

  it('dos líneas de0.03 generan una sola centésima de IGV en el CPE y el XML', async () => {
    const dto = await map([.03,.03]);
    expect(dto.total_igv).toBe(.01);
    expect(dto.total_venta).toBe(.07);
    expect(dto.items.map((line:any)=>line.igv)).toEqual([.01,0]);
    expect(dto.items.map((line:any)=>line.precio_venta)).toEqual([.04,.03]);
    const xml = new CpeXmlBuilder().generateXmlContent(dto);
    const lines = [...xml.matchAll(/<cac:InvoiceLine>[\s\S]*?<\/cac:InvoiceLine>/g)].map(match=>match[0]);
    const taxCents = lines.map(line=>Math.round(Number(line.match(/<cbc:TaxAmount[^>]*>([^<]+)/)?.[1])*100));
    expect(taxCents.reduce((a,b)=>a+b,0)).toBe(1);
    expect(lines.every(line=>line.includes('<cbc:Percent>18.00</cbc:Percent>'))).toBe(true);
    expect(xml).toContain('>0.07</cbc:PayableAmount>');
  });

  it.each([
    {name:'restos inferiores a medio centavo',bases:[.01,.01,.01]},
    {name:'varios centavos faltantes',bases:[.02,.02,.02]},
    {name:'varios redondeos hacia arriba',bases:[.03,.03,.03]},
    {name:'importes ordinarios',bases:[33.33,33.33,33.34]},
    {name:'999 líneas',bases:Array(999).fill(.03)},
  ])('conserva cabecera y evita impuestos negativos: $name', async ({bases}) => {
      const dto = await map(bases);
      expect(dto.items.reduce((sum:number,line:any)=>sum+Math.round(line.igv*100),0)).toBe(Math.round(dto.total_igv*100));
      for(const line of dto.items){
        expect(Math.abs(line.igv*100-Math.round(line.igv*100))).toBeLessThan(1e-8);
        expect(line.igv).toBeGreaterThanOrEqual(0);
        expect(Math.abs(line.igv-line.valor_venta*.18)).toBeLessThan(.01000001);
      }
  });

  it('no traslada el residuo a líneas exoneradas, inafectas o de exportación', async () => {
    const dto = await map([.03,100,.03,100,100],['10','20','10','30','40']);
    expect(dto.items.map((line:any)=>line.igv)).toEqual([.01,0,0,0,0]);
    expect(dto.total_venta).toBe(300.07);
  });

  it('conserva la tasa configurada en el XML, sin derivarla del cociente redondeado', async () => {
    const dto = await map([.07],['10'],'PE',.105);
    expect(dto.items[0].igv).toBe(.01);
    expect(new CpeXmlBuilder().generateXmlContent(dto)).toContain('<cbc:Percent>10.50</cbc:Percent>');
  });

  it('rechaza antes de emitir si el total comercial impide cumplir el importe positivo SUNAT3111', async () => {
    await expect(map([.07,.07],['10','10'],'PE',.105)).rejects.toThrow('no se puede conciliar');
  });
});
