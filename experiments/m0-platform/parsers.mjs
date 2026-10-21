import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { writeFile, readFile } from 'node:fs/promises';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
export function assertFormat(extension) {
  if (!['xlsx','csv','pdf','docx'].includes(extension)) throw new Error('UNSUPPORTED_FORMAT');
}
export async function pdfSpans(file) {
  const task = getDocument({ data: new Uint8Array(await readFile(file)), useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const spans=[];
  try {
    for(let page=1;page<=doc.numPages;page++) {
      const p=await doc.getPage(page), text=await p.getTextContent();
      text.items.forEach((item,index)=> { if('str' in item && item.str.trim()) spans.push({text:item.str,location:{kind:'pdf',page,textSpanId:`p${page}-s${index}`,bbox:[item.transform[4],item.transform[5],item.width,item.height]},dir:item.dir}); });
    }
    return { pages:doc.numPages,spans,status:spans.length?'text':'needs_ocr' };
  } finally { await task.destroy(); }
}
export function docxLocations(xml) {
  const tree=new XMLParser({preserveOrder:true,ignoreAttributes:false}).parse(xml), rows=[];
  let paragraph=0,table=0;
  function text(nodes) { return nodes.map(n=>n['#text']!==undefined?String(n['#text']):Object.entries(n).filter(([k])=>k!==':@').map(([,v])=>Array.isArray(v)?text(v):'').join('')).join(''); }
  function walk(nodes,where={}) {
    for(const node of nodes) for(const [key,value] of Object.entries(node)) {
      if(!Array.isArray(value)) continue;
      if(key==='w:tbl') { const tableId=`table-${++table}`; let row=0;
        for(const r of value.filter(n=>n['w:tr'])) { let col=0; row++; for(const c of r['w:tr'].filter(n=>n['w:tc'])) walk(c['w:tc'],{tableId,cell:`R${row}C${++col}`}); }
      } else if(key==='w:p') rows.push({text:text(value),location:{kind:'docx',paragraphId:`paragraph-${++paragraph}`,...where}});
      else walk(value,where);
    }
  }
  walk(tree); return rows;
}
export async function parserProbe(dir) {
  const checks=[];
  const csv='\ufeffsku,name,price\r\nVALVE-01,"Valve, brass",0.10\r\nFABRIC-01,"Cotton\nroll",2.50\r\n';
  const records=parse(csv,{bom:true,columns:true,info:true});
  assert.equal(records[0].record.name,'Valve, brass'); assert.equal(records[1].record.name,'Cotton\nroll');
  assert.equal(records[0].info.lines,2); assert.equal(records[1].info.lines,4);
  assert.throws(()=>parse('a,b\n1,2,3',{columns:true})); checks.push('csv-bom-quotes-multiline-physical-line-and-malformed-row');
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('商品');
  sheet.addRow(['SKU','单价','数量','合计']); sheet.addRow(['VALVE-01','0.10',3,{formula:'B2*C2',result:0.3}]); sheet.getCell('D3').value={formula:'B3*C3'};
  await book.xlsx.writeFile(`${dir}/synthetic.xlsx`);
  const read=new ExcelJS.Workbook(); await read.xlsx.readFile(`${dir}/synthetic.xlsx`);
  const s=read.getWorksheet('商品'); assert.equal(s.getCell('B2').value,'0.10'); assert.equal(s.getCell('D2').result,0.3); assert.equal(s.getCell('D3').result,undefined);
  checks.push('xlsx-sheet-cell-location-cached-formula-and-missing-cache');
  const xml='<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>合成询盘 &lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>VALVE-01</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>数量 3</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';
  const zip=new JSZip(); zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'); zip.file('word/document.xml',xml);
  const buffer=await zip.generateAsync({type:'nodebuffer'}); await writeFile(`${dir}/synthetic.docx`,buffer);
  const extracted=await mammoth.extractRawText({buffer}); const locations=docxLocations(xml);
  assert.ok(extracted.value.includes('VALVE-01')); assert.equal(locations[1].location.cell,'R1C1'); assert.equal(locations[1].location.tableId,'table-1');
  const html=await mammoth.convertToHtml({buffer}); assert.ok(html.value.includes('&lt;script&gt;')); assert.ok(!html.value.includes('<script>'));
  await assert.rejects(()=>mammoth.extractRawText({buffer:Buffer.from('broken zip')})); checks.push('docx-text-table-paragraph-location-escaping-and-corruption');
  for(const ext of ['xls','doc','xlsm']) assert.throws(()=>assertFormat(ext),/UNSUPPORTED/); checks.push('legacy-xls-doc-and-macro-format-explicitly-unsupported');
  return {checks,sampleLocations:{csv:{kind:'csv',row:2,columns:['sku','name','price']},xlsx:{kind:'sheet',sheet:'商品',cellRange:'B2'},docx:locations[1].location},limits:['DOCX mapping validates basic paragraphs/tables only; merged cells, tracked changes and text boxes need broader fixtures','Formula values are caches, never recalculated; absent cache is missing data','needs_ocr is a routing signal, not OCR or proof of image-only input']};
}
