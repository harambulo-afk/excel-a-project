import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=p=>fs.readFile(path.join(root,p),'utf8');
await fs.mkdir(path.join(root,'dist'),{recursive:true});
const modules=[];
for(const f of ['core','workbook','demo','template-data','app'])modules.push((await read(`src/${f}.mjs`)).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,''));
const vendor=(await read('vendor/exceljs.min.js')).replace(/\/\/# sourceMappingURL=.*$/gm,'');
let html=await read('index.html');
const css=await read('src/style.css');
const [awaitedLicense,awaitedExcelLicense]=await Promise.all([read('LICENSE'),read('vendor/EXCELJS-LICENSE')]);
html=html.replace('<link rel="stylesheet" href="./src/style.css">',()=>'<style>'+css+'</style>');
html=html.replace('<script defer src="./vendor/exceljs.min.js"></script>',()=>'<script>'+modulesafe(vendor)+'</script>');
html=html.replace('<script type="module" src="./src/app.mjs"></script>',()=>'<script>document.addEventListener("DOMContentLoaded",()=>{\n'+modulesafe(modules.join('\n'))+'\n});</script>');
// Keep license notices inside the single-file distribution as well.
html=html.replace('</head>',()=>`<!--\n${[awaitedLicense,awaitedExcelLicense].join('\n\n').replace(/--/g,'- -')}\n-->\n</head>`);
await fs.writeFile(path.join(root,'dist/index.html'),html);
await fs.copyFile(path.join(root,'public/Plantilla_Excel_a_Project.xlsx'),path.join(root,'dist/Plantilla_Excel_a_Project.xlsx'));
await fs.copyFile(path.join(root,'vendor/EXCELJS-LICENSE'),path.join(root,'dist/EXCELJS-LICENSE'));
await fs.copyFile(path.join(root,'LICENSE'),path.join(root,'dist/LICENSE'));
console.log('Creado dist/index.html. Funciona sin conexión con doble clic.');
function modulesafe(s){return s.replace(/<\/script/gi,'<\\/script');}
