import { ServiceUnavailableException } from '@nestjs/common';

/** Stable count and identity are required before a catalog can enable an operation. */
export async function readCompleteCatalog(
  client:any,table:string,selection:string,filter:(query:any)=>any,
  belongs:(row:any)=>boolean,orders:Array<[string,boolean]>=[['id',true]],
):Promise<any[]>{
  const rows:any[]=[];const ids=new Set<string>();let total:number|undefined;
  try{
  for(let offset=0;;offset+=1000){
    let query:any=client.from(table).select(selection,{count:'exact'});
    query=filter(query);
    for(const [field,ascending] of orders)query=query.order(field,{ascending});
    const {data,error,count}=(await query.range(offset,offset+999))||{};
    if(error||!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||(total!==undefined&&total!==count)||data.length!==Math.min(1000,Math.max(0,count-offset)))throw new ServiceUnavailableException('No se pudo completar el catálogo actual. Reintente la consulta.');
    total=count;
    for(const row of data){
      if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||!belongs(row))throw new ServiceUnavailableException('El catálogo es incompleto, contiene duplicados o pertenece a otra empresa.');
      ids.add(row.id);rows.push(row);
    }
    if(rows.length===total)return rows;
  }
  }catch(error){
    if(error instanceof ServiceUnavailableException)throw error;
    throw new ServiceUnavailableException('No se pudo completar el catálogo actual. Reintente la consulta.');
  }
}
