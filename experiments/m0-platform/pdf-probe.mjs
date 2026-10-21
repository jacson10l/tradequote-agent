import React from 'react';
import { Document, Page, Text, View, Font, renderToFile } from '@react-pdf/renderer';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const require=createRequire(import.meta.url);
export const heading='合成报价 / Angebot / عرض سعر';
export const arabic='مرحبا بالعالم';
export const rows=Array.from({length:120},(_,i)=>`ROW-${String(i+1).padStart(3,'0')} | VALVE-${i+1} | 3 × 0.10 USD = 0.30 USD`);
export function fontPath(pkg,subset,ext='woff') {return join(dirname(require.resolve(`@fontsource/${pkg}/package.json`)),'files',`${pkg}-${subset}-400-normal.${ext}`);}
export async function htmlFixture() {
  const face=async(name,pkg,subset)=>`@font-face{font-family:${name};src:url(data:font/woff2;base64,${(await readFile(fontPath(pkg,subset,'woff2'))).toString('base64')}) format('woff2');font-weight:400;}`;
  const css=(await Promise.all([face('ProbeLatin','noto-sans','latin'),face('ProbeCJK','noto-sans-sc','chinese-simplified'),face('ProbeArabic','noto-sans-arabic','arabic')])).join('');
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${css}body{font-family:ProbeLatin,ProbeCJK; color:#1f1f1f;font-size:11px}h1{font-size:20px;font-weight:400}.rtl{font-family:ProbeArabic;direction:rtl;text-align:right}table{border-collapse:collapse;width:100%}thead{display:table-header-group}tr{break-inside:avoid}td,th{padding:8px;border-bottom:1px solid #e5e5e5}th{background:#fff8e0;text-align:left}footer{margin-top:16px}</style><h1>合成报价 / Angebot</h1><p>中文：数量、单价、金额。 Deutsch: Größe, gemäß, zwölf.</p><p class="rtl" lang="ar">${arabic} — عرض سعر 123 USD</p><table><thead><tr><th>SYNTHETIC QUOTE · DRAFT</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x}</td></tr>`).join('')}</tbody></table><footer>END-OF-QUOTE · 此文档仅为技术测试</footer>`;
}
export async function reactPdfFixture(dir) {
  Font.register({family:'ProbeLatin',src:fontPath('noto-sans','latin')});
  Font.register({family:'ProbeCJK',src:fontPath('noto-sans-sc','chinese-simplified')});
  Font.register({family:'ProbeArabic',src:fontPath('noto-sans-arabic','arabic')});
  const e=React.createElement;
  const doc=e(Document,{},e(Page,{size:'A4',style:{padding:30,fontFamily:'ProbeLatin',fontSize:10}},
    e(Text,{style:{fontFamily:'ProbeCJK',fontSize:18}},'合成报价'),
    e(Text,{},'Angebot: Größe, gemäß, zwölf.'),
    e(Text,{style:{fontFamily:'ProbeArabic',textAlign:'right'}},arabic),
    e(Text,{fixed:true,style:{marginVertical:10}},'SYNTHETIC QUOTE · DRAFT'),
    ...rows.map((r,i)=>e(View,{key:i,wrap:false,style:{paddingVertical:8,borderBottomWidth:0.5}},e(Text,{},r))),
    e(Text,{},'END-OF-QUOTE')));
  await renderToFile(doc,`${dir}/react-pdf.pdf`);
}
