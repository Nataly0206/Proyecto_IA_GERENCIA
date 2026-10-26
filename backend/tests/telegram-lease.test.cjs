const assert=require('node:assert/strict');
const {test}=require('node:test');
const sql=require('mssql');
const {env}=require('../dist/config/env');
const {getAuthPool,closeAuthPool}=require('../dist/config/authDb');
const {runTelegramWorker}=require('../dist/telegram/worker');
const qa=process.env.AUTH_DB_DATABASE==='DashboardGerencialAuth_Telegram_QA';
test('El worker persiste el cursor y libera su reserva al cerrar', {skip:!qa},async()=>{
 const old=env.TELEGRAM_BOT_TOKEN;env.TELEGRAM_BOT_TOKEN='qa-no-network';const controller=new AbortController();
 const id=Date.now();let requests=0;
 const api={async call(method,body){
  if(method==='getMe')return{id,username:'qa_sin_mensajes_reales'};
  if(method==='getWebhookInfo')return{url:''};
  if(method==='getUpdates'){
   requests++;
   if(requests===1){assert.equal(body.offset,0);return[{update_id:500,message:{message_id:1,chat:{id:-1,type:'group'},from:{id:42},text:'/ayuda'}}];}
   assert.equal(body.offset,501);controller.abort();return[];
  }
  throw Error('No debe enviar mensajes');
 }};
 try{
  await runTelegramWorker(controller.signal,api);
  const r=await(await getAuthPool()).request().input('id',sql.BigInt,id).query('SELECT siguiente_update,propietario FROM dbo.prestamos_telegram_worker WHERE bot_id=@id');
  assert.equal(Number(r.recordset[0].siguiente_update),501);assert.equal(r.recordset[0].propietario,null);
 }finally{controller.abort();env.TELEGRAM_BOT_TOKEN=old;await closeAuthPool();}
});
test('Un webhook activo se rechaza sin eliminarlo', {skip:!qa},async()=>{
 const old=env.TELEGRAM_BOT_TOKEN;env.TELEGRAM_BOT_TOKEN='qa-no-network';const calls=[];
 const api={async call(method){calls.push(method);if(method==='getMe')return{id:9,username:'qa'};if(method==='getWebhookInfo')return{url:'https://example.test/telegram'};throw Error('No debe modificar el webhook');}};
 try{await assert.rejects(()=>runTelegramWorker(new AbortController().signal,api),/webhook activo/);assert.deepEqual(calls,['getMe','getWebhookInfo']);}finally{env.TELEGRAM_BOT_TOKEN=old;}
});
