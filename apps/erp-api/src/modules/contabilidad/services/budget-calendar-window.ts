const countryZones: Record<string,string> = {
  PE:'America/Lima', CO:'America/Bogota', EC:'America/Guayaquil',
  BO:'America/La_Paz', CL:'America/Santiago', AR:'America/Argentina/Buenos_Aires',
  MX:'America/Mexico_City',
};

// Resolve each boundary independently: offsets can change within a month.
function localMidnight(epoch: number, zone: string): string {
  const formatter=new Intl.DateTimeFormat('en-CA',{
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  });
  let candidate=epoch;
  for(let attempt=0;attempt<5;attempt++) {
    const parts=Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const wall=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
    const corrected=epoch-(wall-candidate);
    if(corrected===candidate)return new Date(candidate).toISOString();
    candidate=corrected;
  }
  throw new Error('No se pudo resolver el límite del mes contable.');
}

export function budgetCalendarWindow(year:number,month:number,country:unknown) {
  const code=typeof country==='string'?country.trim().toUpperCase():'';
  if(!Number.isInteger(year)||year<1900||year>9999||!Number.isInteger(month)||month<1||month>12||!Object.prototype.hasOwnProperty.call(countryZones,code)) {
    throw new Error('El calendario del presupuesto está incompleto.');
  }
  const zone=countryZones[code];
  return {desde:localMidnight(Date.UTC(year,month-1,1),zone),
    hasta:localMidnight(Date.UTC(year,month,1),zone),zonaHoraria:zone};
}
