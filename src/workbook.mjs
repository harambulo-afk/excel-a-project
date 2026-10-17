import { MAX_TASKS } from './core.mjs';
// Check central-directory sizes before decompression. ZIP64 is intentionally unsupported.
export function inspectZip(buffer){
  const a=new Uint8Array(buffer), v=new DataView(a.buffer,a.byteOffset,a.byteLength);
  if(a.length>10*1024*1024)throw Error('El archivo supera 10 MB.');
  let end=-1;for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('El archivo no es un XLSX válido.');
  const entries=v.getUint16(end+10,true),offset=v.getUint32(end+16,true);
  if(entries>5000||offset===0xffffffff)throw Error('El libro es demasiado grande o usa ZIP64.');
  let pos=offset,total=0;
  for(let i=0;i<entries;i++){
    if(pos+46>a.length||v.getUint32(pos,true)!==0x02014b50)throw Error('Estructura XLSX dañada.');
    const size=v.getUint32(pos+24,true);total+=size;
    if(total>100*1024*1024||size===0xffffffff)throw Error('El contenido descomprimido supera 100 MB.');
    pos+=46+v.getUint16(pos+28,true)+v.getUint16(pos+30,true)+v.getUint16(pos+32,true);
  }
}
export async function readWorkbook(buffer,ExcelJS){
  inspectZip(buffer);const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
  if(!wb.worksheets.length)throw Error('El libro no contiene hojas.');return wb;
}
export function sheetMatrix(sheet){
  if(sheet.rowCount>MAX_TASKS+100)throw Error(`La hoja contiene demasiadas filas. Usa hasta ${MAX_TASKS} tareas y elimina las filas vacías sobrantes.`);
  if(sheet.columnCount>100)throw Error('Máximo 100 columnas por hoja.');
  const matrix=[],warnings=[];
  for(let r=1;r<=sheet.rowCount;r++){
    const row=[];
    for(let c=1;c<=sheet.columnCount;c++){
      const cell=sheet.getCell(r,c);let value=cell.value;
      if(value&&typeof value==='object'&&!(value instanceof Date)){
        if('formula'in value||'sharedFormula'in value){
          if(value.result===undefined)throw Error(`La fórmula en ${cell.address} no tiene resultado guardado. Recalcula y guarda el libro en Excel, o pega valores.`);
          value=value.result;warnings.push({severity:'warning',row:r,field:cell.address,message:'Se usa el último resultado guardado de una fórmula. La aplicación no recalcula fórmulas.'});
        } else if('richText'in value)value=value.richText.map(x=>x.text).join('');
        else if('text'in value)value=value.text;
        else throw Error(`Valor de Excel no compatible en ${cell.address}. Corrige los errores de celda.`);
      }
      if(value&&typeof value==='object'&&!(value instanceof Date))throw Error(`Error o valor no admitido en ${cell.address}.`);
      if(typeof value==='number'&&cell.numFmt?.includes('%'))value*=100;
      row.push(value??'');
    }matrix.push(row);
  }
  return {matrix,warnings};
}
