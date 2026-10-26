const assert=require('node:assert/strict');
const {test}=require('node:test');
const {PDFParse}=require('pdf-parse');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const {makePdf,plan,pdfFromObjects}=require('./telegram-fixtures.cjs');
const {extractLoan,readDocument}=require('../dist/telegram/extract');
const live=process.env.TELEGRAM_TEST_AI==='true';
async function images(){
 const parser=new PDFParse({data:new Uint8Array(makePdf())});
 try{const result=await parser.getScreenshot({desiredWidth:1200,imageBuffer:true,imageDataUrl:false});return Buffer.from(result.pages[0].data);}finally{await parser.destroy();}
}
async function scannedPdf(png){
 const image=await loadImage(png),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,image.width,image.height);ctx.drawImage(image,0,0);const jpeg=canvas.toBuffer('image/jpeg');const content='q 612 0 0 842 0 0 cm /Im0 Do Q';
 return pdfFromObjects(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,Buffer.from('\nendstream')]),`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
}
function exact(actual){assert.equal(actual.cuotas.length,3);assert.equal(actual.monto,1000);assert.equal(actual.moneda,'HNL');for(let i=0;i<3;i++)for(const key of ['numero','fechaVencimiento','capital','interes','cargos','monto'])assert.equal(actual.cuotas[i][key],plan.cuotas[i][key]);}
test('El PDF escaneado se convierte a imagen sin perder la página',async()=>{const pdf=await scannedPdf(await images());const content=await readDocument(pdf);assert.equal(content.text,'');assert.equal(content.images.length,1);});
test('NVIDIA real: PDF de texto, imagen y PDF escaneado preservan las tres cuotas', {skip:!live,timeout:600000},async()=>{
 const png=await images(),scan=await scannedPdf(png);
 for(const [name,data] of [['PDF texto',makePdf()],['Imagen',png],['PDF escaneado',scan]]){exact(await extractLoan(data));console.log(`${name}: fechas e importes exactos`);}
});
