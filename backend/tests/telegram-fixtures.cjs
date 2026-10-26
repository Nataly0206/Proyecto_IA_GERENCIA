const installments = [
  { numero: 1, fechaVencimiento: '2026-11-03', capital: 200, interes: 70.12, cargos: 2.15, monto: 272.27 },
  { numero: 2, fechaVencimiento: '2026-11-18', capital: 300, interes: 40.45, cargos: 7.29, monto: 347.74 },
  { numero: 3, fechaVencimiento: '2026-12-09', capital: 500, interes: 10.34, cargos: 0, monto: 510.34 },
];
const plan = { acreedor: 'BANCO PRUEBA TELEGRAM', acreedorId: null, tipoAcreedor: 'banco', moneda: 'HNL', monto: 1000, tasaAnual: 80, frecuencia: 'mensual', fechaDesembolso: '2026-10-26', referencia: 'QA-TELEGRAM-001', interesCapitalizado: 0, cantidadCuotas: 3, cuotas: installments, notas: '', advertencias: [] };
function pdfFromObjects(objects) {
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0]; let offset = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset); const part=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.isBuffer(objects[i])?objects[i]:Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);chunks.push(part);offset+=part.length;
  }
  const xref=offset;
  chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(chunks);
}
function makePdf() {
 const lines=['BANCO PRUEBA TELEGRAM - PLAN DE PAGO','Referencia: QA-TELEGRAM-001','Moneda: HNL. Monto recibido: 1000.00','Fecha de desembolso: 2026-10-26','Tasa de interes anual: 80%. Frecuencia: mensual.','Cantidad de cuotas: 3. Interes capitalizado: 0.00','Numero | Vencimiento | Capital | Interes | Cargos | Total',...installments.map(r=>`${r.numero} | ${r.fechaVencimiento} | ${r.capital.toFixed(2)} | ${r.interes.toFixed(2)} | ${r.cargos.toFixed(2)} | ${r.monto.toFixed(2)}`),'El calendario de fechas es contractual. No recalcular amortizacion.'];
 const stream='BT /F1 11 Tf 40 780 Td '+lines.map((line,i)=>(i?'0 -22 Td ':'')+'('+line.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+' ET';
 return pdfFromObjects(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`]);
}
module.exports={plan,makePdf,pdfFromObjects};
