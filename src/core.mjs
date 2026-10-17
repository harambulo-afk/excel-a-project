/** Pure conversion logic. All dates use UTC arithmetic as timezone-free wall time. */
export const MAX_TASKS = 2000;
const MINUTE = 60000, DAY = 86400000;
const normalize = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9%]/g,'');
const ALIASES = {
  id:['id'], name:['nombre','tarea','nombredetarea','taskname'], level:['nivel','outlinelevel'],
  start:['inicio','comienzo','start'], finish:['fin','finish'], duration:['duracion','duraciondias','duration'],
  predecessors:['predecesoras','predecesores','predecessors'], contact:['responsable','contacto'],
  progress:['avancefisico%','avancefisico','physicalpercentcomplete'], notes:['notas','notes']
};
export function dateString(ms) { return new Date(ms).toISOString().slice(0,19); }
export function displayDate(ms) { if(!Number.isFinite(ms))return '—'; const s=dateString(ms);return `${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)} ${s.slice(11,16)}`; }
export function parseDate(value, end=false) {
  if(value instanceof Date) { if(!Number.isFinite(+value)||value.getUTCFullYear()<1901||value.getUTCFullYear()>2100||value.getUTCSeconds()||value.getUTCMilliseconds())throw Error('Fecha inválida. Usa minutos enteros y años entre 1901 y 2100.'); return value.toISOString().slice(11,19)==='00:00:00' ? +value+(end?17:8)*3600000 : +value; }
  const s=String(value??'').trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(!m) {const n=s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);if(n)m=[n[0],n[3],n[2],n[1],n[4],n[5],n[6]];}
  if(!m)throw Error('Usa una fecha de Excel, AAAA-MM-DD o DD/MM/AAAA; hora opcional HH:mm.');
  const [y,mo,d,h,mi,se]=[+m[1],+m[2],+m[3],m[4]===undefined?(end?17:8):+m[4],+(m[5]||0),+(m[6]||0)];
  const dt=new Date(Date.UTC(y,mo-1,d,h,mi,se));
  if(y<1901||y>2100||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d||h>23||mi>59||se!==0)throw Error('Fecha fuera de rango o inválida. Usa minutos enteros y años entre 1901 y 2100.');
  return +dt;
}
function number(value,label) {const s=String(value).trim().replace(',','.');if(!/^-?\d+(\.\d+)?$/.test(s))throw Error(`${label}: escribe un número.`);return Number(s);}
const blank=v=>v===undefined||v===null||String(v).trim()==='';
function midnight(ms){const d=new Date(ms);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());}
export function workingDay(ms, days=5){const d=new Date(ms).getUTCDay();return days===7||(d!==0&&(days===6||d!==6));}
function intervals(ms,days){const b=midnight(ms);return workingDay(ms,days)?[[b+8*3600000,b+12*3600000],[b+13*3600000,b+17*3600000]]:[];}
export function workingMinutes(start,finish,days=5){let total=0;for(let d=midnight(start);d<=finish;d+=DAY)for(const [a,b]of intervals(d,days))total+=Math.max(0,Math.min(b,finish)-Math.max(a,start))/MINUTE;return total;}
export function addWork(start,minutes,days=5){
  if(minutes===0)return start;
  let remaining=minutes, cursor=start;
  for(let guard=0;guard<80000;guard++){
    for(const [a,b] of intervals(cursor,days)){const at=Math.max(a,cursor);if(at>=b)continue;const available=(b-at)/MINUTE;if(remaining<=available)return at+remaining*MINUTE;remaining-=available;}
    cursor=midnight(cursor)+DAY;
  }
  throw Error('La duración excede el rango admitido.');
}
export function parseLinks(text){
  if(blank(text))return [];
  return String(text).split(/[;,]/).filter(x=>x.trim()).map(part=>{
    const m=part.trim().toUpperCase().match(/^(\d+)\s*(FC|CC|FF|CF|FS|SS|SF)?\s*([+-]\s*\d+(?:\.\d+)?\s*[DH])?$/);
    if(!m)throw Error(`Predecesora «${part}» inválida. Ejemplo: 20FC;30CC+1d.`);
    const type={FC:1,FS:1,CC:3,SS:3,FF:0,CF:2,SF:2}[m[2]||'FC'];
    const lag=m[3]?.replace(/\s/g,'')||'0D';const lagMinutes=Number(lag.slice(0,-1))*(lag.endsWith('D')?480:60);
    if(Math.abs(lagMinutes)>480*3650||!Number.isInteger(lagMinutes))throw Error('El desfase debe expresarse en minutos enteros y no superar 3650 días.');
    return {id:Number(m[1]),type,lagMinutes};
  });
}
export function analyze(matrix,options={}) {
  const days=Number(options.days??5), title=String(options.title||'Cronograma').trim().slice(0,200);
  const issues=[], tasks=[];const issue=(severity,row,field,message)=>issues.push({severity,row,field,message});
  if(![5,6,7].includes(days))issue('error',0,'Calendario','Selecciona 5, 6 o 7 días laborables.');
  if(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(title))issue('error',0,'Nombre del proyecto','Hay caracteres de control incompatibles con XML.');
  if(!Array.isArray(matrix)||matrix.length<2)return {tasks,issues:[{severity:'error',row:1,field:'Archivo',message:'La hoja debe tener encabezados y al menos una tarea.'}],days,title};
  const cols={};matrix[0].forEach((h,i)=>{const k=Object.keys(ALIASES).find(k=>ALIASES[k].includes(normalize(h)));if(k){if(cols[k]!==undefined)issue('error',1,String(h),'Encabezado duplicado.');else cols[k]=i;}});
  for(const k of ['id','name','start'])if(cols[k]===undefined)issue('error',1,k,'Falta la columna '+({id:'ID',name:'Nombre',start:'Inicio'}[k])+'.');
  if(cols.duration===undefined&&cols.finish===undefined)issue('error',1,'Duración','Incluye Duración (días) o Fin.');
  const rows=matrix.slice(1).map((r,i)=>({r,row:i+2})).filter(({r})=>r.some(v=>!blank(v)));
  if(rows.length>MAX_TASKS)issue('error',0,'Archivo',`Máximo ${MAX_TASKS} tareas por archivo.`);
  if(!rows.length)issue('error',0,'Archivo','No hay tareas para convertir.');
  if(issues.some(x=>x.severity==='error'))return {tasks,issues,days,title};
  for(const {r,row} of rows){
    const get=k=>r[cols[k]];let t={row,id:NaN,name:String(get('name')??'').trim(),level:1,links:[],contact:String(get('contact')??'').trim(),notes:String(get('notes')??'').trim(),progress:0,start:NaN,finish:NaN,minutes:NaN};
    try {t.id=number(get('id'),'ID');if(!Number.isSafeInteger(t.id)||t.id<1||t.id>2147483646)throw Error('El ID debe ser un entero positivo menor que 2147483647.');}catch(e){issue('error',row,'ID',e.message);}
    if(!t.name||t.name.length>512)issue('error',row,'Nombre','Escribe un nombre de 1 a 512 caracteres.');
    if(t.contact.length>512)issue('error',row,'Responsable','Máximo 512 caracteres.');
    if(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(t.name+t.notes+t.contact))issue('error',row,'Texto','Hay caracteres de control incompatibles con XML.');
    try {t.level=blank(get('level'))?1:number(get('level'),'Nivel');if(!Number.isInteger(t.level)||t.level<1||t.level>20)throw Error('Nivel entero entre 1 y 20.');}catch(e){issue('error',row,'Nivel',e.message);}
    try {t.links=parseLinks(get('predecessors'));}catch(e){issue('error',row,'Predecesoras',e.message);}
    try {t.progress=blank(get('progress'))?0:number(get('progress'),'Avance físico');if(!Number.isInteger(t.progress)||t.progress<0||t.progress>100)throw Error('Usa un entero de 0 a 100.');}catch(e){issue('error',row,'Avance físico',e.message);}
    t.raw={start:get('start'),finish:get('finish'),duration:get('duration')};tasks.push(t);
  }
  // Do not build outlines or date calculations from invalid structural values.
  if(issues.some(x=>x.severity==='error'))return {tasks,issues,days,title};
  const map=new Map(), outline=[];
  tasks.forEach((t,i)=>{
    if(map.has(t.id))issue('error',t.row,'ID',`El ID ${t.id} está duplicado.`);map.set(t.id,t);
    if(t.level>(i?tasks[i-1].level:0)+1)issue('error',t.row,'Nivel','La jerarquía debe comenzar en 1 y aumentar como máximo un nivel por fila.');
    outline.length=t.level;outline[t.level-1]=(outline[t.level-1]||0)+1;t.outline=outline.join('.');
    t.summary=Boolean(tasks[i+1]&&tasks[i+1].level>t.level);
    if(t.summary){if(t.links.length)issue('error',t.row,'Predecesoras','Vincula tareas de detalle, no resúmenes.');if(Object.values(t.raw).some(v=>!blank(v)))issue('warning',t.row,'Resumen','Las fechas y duración del resumen se calculan desde sus subtareas.');return;}
    try{
      t.start=parseDate(t.raw.start);
      if(!blank(t.raw.duration)){const d=number(t.raw.duration,'Duración');if(d<0||d>3650||!Number.isInteger(Math.round(d*480*1e6)/1e6))throw Error('Duración entre 0 y 3650 días, equivalente a minutos enteros.');t.minutes=Math.round(d*480);}
      else if(!blank(t.raw.finish)){const finish=parseDate(t.raw.finish,true);if(finish<t.start)throw Error('Fin anterior al inicio.');t.minutes=workingMinutes(t.start,finish,days);}
      else throw Error('Completa Duración (días) o Fin.');
      if(t.minutes>0&&!intervals(t.start,days).some(([a,b])=>t.start>=a&&t.start<b))throw Error('El inicio debe caer en la jornada 08:00–12:00 o 13:00–17:00 del calendario elegido.');
      t.finish=addWork(t.start,t.minutes,days);
      if(new Date(t.finish).getUTCFullYear()>2100)throw Error('El fin calculado supera el año 2100.');
      if(!blank(t.raw.finish)&&parseDate(t.raw.finish,true)!==t.finish)throw Error('Fin y duración no coinciden con el calendario. Para un hito usa la misma fecha y hora en Inicio y Fin.');
      if(t.minutes===0&&!workingDay(t.start,days))issue('warning',t.row,'Inicio','El hito cae en un día no laborable; Project puede moverlo.');
    }catch(e){issue('error',t.row,'Fechas y duración',e.message);}
  });
  for(let i=tasks.length-1;i>=0;i--){const t=tasks[i];if(t.summary){const children=[];for(let j=i+1;j<tasks.length&&tasks[j].level>t.level;j++)if(!tasks[j].summary&&Number.isFinite(tasks[j].finish))children.push(tasks[j]);if(children.length){t.start=Math.min(...children.map(x=>x.start));t.finish=Math.max(...children.map(x=>x.finish));t.minutes=workingMinutes(t.start,t.finish,days);}}}
  for(const t of tasks){const seen=new Set();for(const l of t.links){if(!map.has(l.id))issue('error',t.row,'Predecesoras',`No existe la tarea ${l.id}.`);else if(l.id===t.id)issue('error',t.row,'Predecesoras','Una tarea no puede depender de sí misma.');else if(map.get(l.id).summary)issue('error',t.row,'Predecesoras',`La tarea ${l.id} es un resumen. Vincula una tarea de detalle.`);if(seen.has(l.id))issue('error',t.row,'Predecesoras',`Vínculo duplicado a ${l.id}.`);seen.add(l.id);}}
  // Kahn's algorithm avoids recursion overflow on long chains.
  const incoming=new Map(tasks.map(t=>[t.id,0])), next=new Map(tasks.map(t=>[t.id,[]]));
  for(const t of tasks)for(const l of t.links)if(map.has(l.id)){incoming.set(t.id,incoming.get(t.id)+1);next.get(l.id).push(t.id);}
  const queue=tasks.filter(t=>incoming.get(t.id)===0).map(t=>t.id);let count=0;
  for(let i=0;i<queue.length;i++){count++;for(const n of next.get(queue[i])||[]){incoming.set(n,incoming.get(n)-1);if(incoming.get(n)===0)queue.push(n);}}
  if(count<tasks.length)issue('error',0,'Predecesoras','Hay un ciclo de dependencias. Revisa las tareas: '+tasks.filter(t=>incoming.get(t.id)>0).map(t=>t.id).slice(0,15).join(', ')+'.');
  if(!tasks.some(t=>t.links.length)&&tasks.length>1)issue('warning',0,'Lógica','No hay dependencias. Las fechas aisladas no definen una ruta crítica.');
  for(const t of tasks)for(const l of t.links){const p=map.get(l.id);if(!p||p.summary||!Number.isFinite(t.finish)||!Number.isFinite(p.finish))continue;
    const source=[0,1].includes(l.type)?p.finish:p.start,target=[0,2].includes(l.type)?t.finish:t.start;
    const gap=target>=source?workingMinutes(source,target,days):-workingMinutes(target,source,days);
    if(gap<l.lagMinutes)issue('warning',t.row,'Secuencia',`La fecha de referencia no satisface el vínculo con ${p.id}. Project podrá reprogramar esta tarea.`);
  }
  return {tasks,issues,days,title};
}
export function escapeXml(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
const tag=(n,v)=>`<${n}>${escapeXml(v)}</${n}>`;
const duration=m=>`PT${Math.floor(m/60)}H${m%60}M0S`;
export function toProjectXml(result){
  if(result.issues.some(i=>i.severity==='error')||!result.tasks.length)throw Error('Corrige los errores antes de exportar.');
  const {tasks,days,title}=result, start=Math.min(...tasks.map(t=>t.start));
  // Project's XML importer can omit links with sparse UIDs. Use consecutive
  // interchange IDs and retain the user's original Excel ID in task Notes.
  const uids=new Map(tasks.map((t,i)=>[t.id,i+1]));
  const calendar=Array.from({length:7},(_,i)=>{const work=days===7||(i!==0&&(days===6||i!==6));return `<WeekDay><DayType>${i+1}</DayType><DayWorking>${+work}</DayWorking>${work?'<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>':''}</WeekDay>`;}).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project">`+
    tag('SaveVersion',12)+tag('Name',title)+tag('ScheduleFromStart',1)+tag('StartDate',dateString(start))+tag('CalendarUID',1)+tag('DefaultStartTime','08:00:00')+tag('DefaultFinishTime','17:00:00')+tag('MinutesPerDay',480)+tag('MinutesPerWeek',days*480)+tag('DaysPerMonth',20)+tag('DefaultTaskType',1)+tag('DurationFormat',7)+tag('WorkFormat',2)+tag('NewTasksEffortDriven',0)+tag('NewTasksEstimated',0)+tag('WeekStartDay',1)+
    `<Calendars><Calendar><UID>1</UID>${tag('Name',`${days} días por semana - 8 horas`)}<IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>${calendar}</WeekDays></Calendar></Calendars><Tasks>`+
    tasks.map((t,i)=>'<Task>'+tag('UID',uids.get(t.id))+tag('ID',i+1)+tag('Name',t.name)+tag('Type',1)+tag('IsNull',0)+tag('Contact',t.contact)+tag('WBS',t.outline)+tag('OutlineNumber',t.outline)+tag('OutlineLevel',t.level)+tag('Start',dateString(t.start))+tag('Finish',dateString(t.finish))+tag('Duration',duration(t.minutes))+tag('DurationFormat',7)+tag('EffortDriven',0)+tag('Estimated',0)+tag('Milestone',+(t.minutes===0&&!t.summary))+tag('Summary',+t.summary)+tag('PercentComplete',0)+tag('ActualDuration',duration(0))+tag('RemainingDuration',duration(t.minutes))+tag('ConstraintType',t.summary?0:4)+tag('CalendarUID',-1)+(t.summary?'':tag('ConstraintDate',dateString(t.start)))+tag('Notes',`ID de Excel: ${t.id}${t.notes?'\n'+t.notes:''}`)+tag('PhysicalPercentComplete',t.progress)+t.links.map(l=>`<PredecessorLink>${tag('PredecessorUID',uids.get(l.id))}${tag('Type',l.type)}<CrossProject>0</CrossProject>${tag('LinkLag',l.lagMinutes*10)}<LagFormat>7</LagFormat></PredecessorLink>`).join('')+'</Task>').join('')+'</Tasks></Project>';
}
