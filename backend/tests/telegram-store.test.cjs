const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {test}=require('node:test');
const {plan,makePdf}=require('./telegram-fixtures.cjs');
const store=require('../dist/telegram/store');
const {getAuthPool,closeAuthPool}=require('../dist/config/authDb');
const {getUserById}=require('../dist/services/auth.service');
const amortizacion=require('../dist/services/amortizacion');
const {obtenerPrestamo,eliminarPrestamo,crearPrestamo}=require('../dist/services/prestamos.service');

test('SQL local: vinculación, borrador, confirmación idempotente y copia literal sin motor de cálculo', {skip:process.env.AUTH_DB_DATABASE!=='DashboardGerencialAuth_Telegram_QA'}, async()=>{
 let originalCalculate=amortizacion.calcularPlan;
 try {
 const pool=await getAuthPool();const rows=await pool.request().query('SELECT TOP 1 id FROM dbo.dashboard_usuarios WHERE activo=1');
 const user=await getUserById(rows.recordset[0].id);assert.ok(store.canImport(user));
 const code=await store.createLinkCode(user.id);const token=code.comando.split(' ')[1];const chat='4242424242';
 await store.linkChat(chat,token);assert.equal((await store.userForChat(chat)).id,user.id);
 await assert.rejects(()=>store.linkChat(chat,token),/Código vencido/);
 const unique=crypto.randomUUID();const input={...plan,referencia:unique};
 const file={name:'plan-prueba.pdf',mime:'application/pdf',data:Buffer.concat([makePdf(),Buffer.from('\n% '+unique)])};
 const draft=await store.saveDraft(user,chat,file,input);assert.equal(draft.estado,'borrador');assert.deepEqual(draft.errores,[]);
 assert.equal((await store.saveDraft(user,chat,file,input)).id,draft.id);
 assert.ok((await store.originalDocument(user.id,draft.id)).archivo.equals(file.data));
 await assert.rejects(()=>store.getDraft(crypto.randomUUID(),draft.id),/no encontrado/);
 await assert.rejects(()=>store.updateDraft(user.id,draft.id,999,input),/cambió/);
 const edited=await store.updateDraft(user.id,draft.id,draft.revision,input);assert.equal(edited.revision,2);
 await assert.rejects(()=>store.confirmDraft(user,draft.id,1),/cambió/);
 // Any accidental use of the amortization engine fails this real SQL test.
 amortizacion.calcularPlan=()=>{throw Error('No debe recalcular importaciones');};
 const [first,second]=await Promise.all([store.confirmDraft(user,draft.id,2),store.confirmDraft(user,draft.id,2)]);
 assert.equal(first.id,second.id);assert.ok(first.yaRegistrado||second.yaRegistrado);
 const saved=await obtenerPrestamo(first.id);assert.equal(saved.prestamo.origen,'telegram');
 assert.equal(saved.cuotas.length,3);
 for(let i=0;i<3;i++)for(const key of ['numero','fechaVencimiento','capital','interes','cargos','monto'])assert.equal(saved.cuotas[i][key],plan.cuotas[i][key]);
 const cancelled=await store.saveDraft(user,chat,{...file,data:Buffer.concat([file.data,Buffer.from('cancel')])},input);
 await store.cancelDraft(user.id,cancelled.id);await assert.rejects(()=>store.confirmDraft(user,cancelled.id,1),/cambió|cancelado/);
 assert.ok((await store.originalDocument(user.id,cancelled.id)).archivo.length);
 await eliminarPrestamo(first.id,user.usuario);assert.equal((await obtenerPrestamo(first.id)).prestamo,null);
 assert.ok((await store.originalDocument(user.id,draft.id)).archivo.length);
 amortizacion.calcularPlan=originalCalculate;
 const calculated=await crearPrestamo({acreedorId:saved.prestamo.acreedor_id||Number((await pool.request().query('SELECT TOP 1 id FROM dbo.prestamos_acreedores')).recordset[0].id),moneda:'HNL',monto:1000,tasaAnual:12,cantidadCuotas:3,frecuencia:'mensual',tipoAmortizacion:'cuota_fija',fechaDesembolso:'2026-10-26',fechaPrimeraCuota:'2026-11-26',cargoCuota:0},user.usuario);
 assert.equal(calculated.cuotas.length,3);assert.notEqual(calculated.cuotas[0].capital,200);
 await store.unlink(user.id);await assert.rejects(()=>store.userForChat(chat),/Vincula/);
 } finally {amortizacion.calcularPlan=originalCalculate;await closeAuthPool();}
});
