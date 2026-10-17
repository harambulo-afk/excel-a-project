import { analyze, toProjectXml, displayDate, escapeXml } from './core.mjs';
import { readWorkbook, sheetMatrix } from './workbook.mjs';
import { DEMO } from './demo.mjs';
import { TEMPLATE_BASE64 } from './template-data.mjs';

const $=id=>document.getElementById(id), esc=escapeXml;
let matrix=null,book=null,result=null,extraIssues=[],tab='table',generation=0;
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function reset(){matrix=null;result=null;extraIssues=[];book=null;$('export').disabled=true;$('metrics').hidden=true;$('validation').hidden=true;$('ack-label').hidden=true;$('ack').checked=false;$('empty').hidden=false;$('table-view').hidden=true;$('gantt-view').hidden=true;$('table-view').replaceChildren();$('gantt-view').replaceChildren();$('sheet-field').hidden=true;$('range').textContent='Sin datos';$('preview-title').textContent='Tu cronograma aparecerá aquí';}
function exportState(){const errors=result?.issues.some(x=>x.severity==='error'),warnings=result?.issues.some(x=>x.severity==='warning');$('export').disabled=!result||!result.tasks.length||errors||(warnings&&!$('ack').checked);}
function recalculate(){
  if(!matrix)return;$('ack').checked=false;
  result=analyze(matrix,{days:$('days').value,title:$('title').value});result.issues.unshift(...extraIssues);
  const errors=result.issues.filter(x=>x.severity==='error'),warnings=result.issues.filter(x=>x.severity==='warning');
  $('preview-title').textContent=result.title;$('empty').hidden=true;$('metrics').hidden=false;
  const metrics=[['Tareas de detalle',result.tasks.filter(t=>!t.summary).length],['Fases',result.tasks.filter(t=>t.summary).length],['Hitos',result.tasks.filter(t=>!t.summary&&t.minutes===0).length],['Dependencias',result.tasks.reduce((s,t)=>s+t.links.length,0)]];
  $('metrics').innerHTML=metrics.map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('validation').hidden=false;
  $('validation').innerHTML=result.issues.length?`<details ${errors.length?'open':''}><summary><span class="${errors.length?'error-tag':'warning-tag'}">${errors.length} errores · ${warnings.length} avisos</span> — revisar observaciones</summary><ul>${result.issues.slice(0,150).map(i=>`<li><strong class="${i.severity==='error'?'error-tag':'warning-tag'}">${i.row?'Fila '+i.row:'General'} · ${esc(i.field)}</strong><br>${esc(i.message)}</li>`).join('')}</ul>${result.issues.length>150?'<p>Se muestran las primeras 150 observaciones. Corrige el archivo y vuelve a cargarlo.</p>':''}</details>`:'<div class="success">✓ Validación completada. Puedes descargar el XML.</div>';
  $('ack-label').hidden=!warnings.length||!!errors.length;
  status(errors.length?'Corrige los errores en Excel y vuelve a cargar el archivo.':warnings.length?'El archivo se puede convertir después de revisar los avisos.':'Tareas revisadas. El XML está listo para abrir como proyecto nuevo.');
  const valid=result.tasks.filter(t=>Number.isFinite(t.start)&&Number.isFinite(t.finish));
  if(valid.length)$('range').textContent=displayDate(Math.min(...valid.map(t=>t.start))).slice(0,10)+' — '+displayDate(Math.max(...valid.map(t=>t.finish))).slice(0,10);
  renderTable();renderGantt(valid);selectTab(tab);exportState();
}
function renderTable(){
  $('table-view').innerHTML='<table><thead><tr><th>ID Excel</th><th>Tarea</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Predecesoras</th><th>Responsable</th><th>Avance físico</th></tr></thead><tbody>'+result.tasks.map(t=>`<tr class="${t.summary?'summary':''}"><td>${esc(t.id)}</td><td class="task"><span class="task-name" style="padding-left:${Math.max(0,(t.level-1)*12)}px">${esc(t.name)}</span>${t.summary?'<span class="tag">Resumen</span>':t.minutes===0?'<span class="tag milestone">Hito</span>':''}</td><td class="date">${displayDate(t.start)}</td><td class="date">${displayDate(t.finish)}</td><td>${Number.isFinite(t.minutes)?Math.round(t.minutes/480*1000)/1000:'—'}</td><td>${t.links.map(l=>`${l.id}${{0:'FF',1:'FC',2:'CF',3:'CC'}[l.type]}${l.lagMinutes?(l.lagMinutes>0?'+':'')+l.lagMinutes/60+'h':''}`).join('; ')||'—'}</td><td>${esc(t.contact)||'—'}</td><td>${t.summary?'—':t.progress+' %'}</td></tr>`).join('')+'</tbody></table>';
}
function renderGantt(tasks){
  if(!tasks.length){$('gantt-view').textContent='Completa las fechas para ver el Gantt.';return;}
  const day=86400000, min=Math.floor(Math.min(...tasks.map(t=>t.start))/day)*day,max=Math.max(...tasks.map(t=>t.finish)),count=Math.ceil((max-min)/day)+1;
  // Long projects use weekly columns to bound DOM size and horizontal width.
  const step=count>120?7:1,cols=Math.ceil(count/step),width=cols*32;
  let html=`<div class="gantt-grid" style="grid-template-columns:240px ${width}px"><div class="gantt-name head">Tarea · fechas de referencia</div><div class="gantt-track head">`;
  for(let i=0;i<cols;i++){const d=new Date(min+i*step*day);html+=`<span class="tick">${d.getUTCDate()}<small>${d.getUTCMonth()+1}/${String(d.getUTCFullYear()).slice(2)}</small></span>`;}
  html+='</div>';
  for(const t of tasks){const left=(t.start-min)/day/step*32,w=Math.max(4,(t.finish-t.start)/day/step*32),label=`${t.name}: ${displayDate(t.start)} a ${displayDate(t.finish)}`;html+=`<div class="gantt-name" title="${esc(t.name)}" style="padding-left:${12+(t.level-1)*12}px;${t.summary?'font-weight:700':''}">${esc(t.id)} · ${esc(t.name)}</div><div class="gantt-track"><div role="img" aria-label="${esc(label)}" title="${esc(label)}" class="bar ${t.summary?'summary':t.minutes===0?'milestone':''}" style="left:${left}px;width:${w}px">${!t.summary&&t.minutes>0?`<span class="bar-progress" style="width:${t.progress}%"></span>`:''}</div></div>`;}
  $('gantt-view').innerHTML=html+'</div>';
}
function selectTab(value){tab=value;$('table-tab').setAttribute('aria-selected',value==='table');$('gantt-tab').setAttribute('aria-selected',value==='gantt');$('table-view').hidden=!result||value!=='table';$('gantt-view').hidden=!result||value!=='gantt';}
async function loadFile(file){
  if(!file)return;const token=++generation;reset();$('file-name').textContent=file.name;
  try{if(!/\.xlsx$/i.test(file.name))throw Error('Selecciona un archivo .xlsx. Los formatos .xls, .xlsm y .mpp no se admiten.');if(file.size>10*1024*1024)throw Error('El archivo supera 10 MB.');status('Leyendo y validando el libro…');const loaded=await readWorkbook(await file.arrayBuffer(),globalThis.ExcelJS);if(token!==generation)return;book=loaded;$('sheet').replaceChildren(...book.worksheets.map(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;return o;}));const preferred=book.worksheets.find(s=>s.name.toLowerCase()==='tareas')||book.worksheets[0];$('sheet').value=preferred.id;$('sheet-field').hidden=book.worksheets.length===1;$('title').value=file.name.replace(/\.xlsx$/i,'').slice(0,200);loadSheet();}
  catch(e){if(token!==generation)return;reset();status(e.message||'No se pudo leer el libro.',true);}
}
function loadSheet(){try{const parsed=sheetMatrix(book.getWorksheet(Number($('sheet').value)));matrix=parsed.matrix;extraIssues=parsed.warnings;recalculate();}catch(e){matrix=null;result=null;$('export').disabled=true;$('metrics').hidden=true;$('validation').hidden=true;$('ack-label').hidden=true;$('table-view').hidden=true;$('gantt-view').hidden=true;$('empty').hidden=false;status(e.message,true);}}
function demo(){generation++;reset();matrix=DEMO.map(r=>[...r]);$('file-name').textContent='Ejemplo ficticio · estudio eléctrico';$('title').value='Estudio de ampliación eléctrica';$('days').value='5';$('file').value='';recalculate();}
$('file').addEventListener('change',e=>loadFile(e.target.files[0]));$('sheet').addEventListener('change',loadSheet);
for(const id of ['title','days'])$(id).addEventListener('change',recalculate);
$('title').addEventListener('input',()=>{if(result){result.title=$('title').value.trim()||'Cronograma';$('preview-title').textContent=result.title;}});
$('demo').addEventListener('click',demo);$('demo-empty').addEventListener('click',demo);$('ack').addEventListener('change',exportState);
$('table-tab').addEventListener('click',()=>selectTab('table'));$('gantt-tab').addEventListener('click',()=>selectTab('gantt'));
for(const id of ['table-tab','gantt-tab'])$(id).addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();selectTab(tab==='table'?'gantt':'table');$(tab+'-tab').focus();}});
$('export').addEventListener('click',()=>{try{exportState();if($('export').disabled)return;const name=result.title.replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,80)||'cronograma';download(toProjectXml(result),name+'.xml','application/xml;charset=utf-8');status('XML descargado. Ábrelo en Project como un proyecto nuevo.');}catch(e){status(e.message,true);}});
$('template').addEventListener('click',()=>download(Uint8Array.from(atob(TEMPLATE_BASE64),c=>c.charCodeAt(0)),'Plantilla_Excel_a_Project.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
const drop=$('dropzone');for(const ev of ['dragenter','dragover'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag');});for(const ev of ['dragleave','drop'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag');});drop.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
$('guide-open').addEventListener('click',()=>$('guide').showModal());$('guide-close').addEventListener('click',()=>$('guide').close());
