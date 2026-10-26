const assert=require('node:assert/strict');
const {test}=require('node:test');
const crypto=require('node:crypto');
const store=require('../dist/telegram/store');
const extraction=require('../dist/telegram/extract');
const {ApiError}=require('../dist/middleware/errorHandler');
const {handleUpdate}=require('../dist/telegram/worker');
const {plan,makePdf}=require('./telegram-fixtures.cjs');
const user={id:crypto.randomUUID(),usuario:'qa',nombre:'Prueba',activo:true,debeCambiarPassword:false,esAdministrador:false,permisos:['prestamos']};
const makeMessage=patch=>({update_id:100,message:{message_id:1,chat:{id:42,type:'private'},from:{id:42},...patch}});
function fakeApi(){return{messages:[],csvs:[],async send(chat,text,markup){this.messages.push({chat,text,markup});},async csv(chat,name,text){this.csvs.push({chat,name,text});},async call(){},async download(){return makePdf();}};}

test('No lee documentos de usuarios sin vincular ni mensajes de grupos',async()=>{
 const original=store.userForChat;let downloads=0;const api=fakeApi();api.download=async()=>{downloads++;return makePdf();};
 store.userForChat=async()=>{throw new ApiError(403,'Vincula tu cuenta');};
 try{
  await assert.rejects(()=>handleUpdate(makeMessage({document:{file_id:'x'}}),api),/Vincula/);
  const group=makeMessage({document:{file_id:'x'},chat:{id:-42,type:'group'}});await handleUpdate(group,api);
  assert.equal(downloads,0);
 }finally{store.userForChat=original;}
});
test('El PDF solo genera borrador y revisión completa; la confirmación usa el usuario y revisión correctos',async()=>{
 const originals={user:store.userForChat,find:store.findDocument,save:store.saveDraft,confirm:store.confirmDraft,extract:extraction.extractLoan};
 const id=crypto.randomUUID();const draft={id,archivoNombre:'plan.pdf',estado:'borrador',revision:3,prestamoId:null,plan,errores:[]};let confirmed=0;
 store.userForChat=async()=>user;store.findDocument=async()=>null;store.saveDraft=async()=>draft;extraction.extractLoan=async()=>plan;
 store.confirmDraft=async(actualUser,actualId,revision)=>{assert.equal(actualUser.id,user.id);assert.equal(actualId,id);assert.equal(revision,3);confirmed++;return{id:9,numero:'PRE-000009',yaRegistrado:false};};
 try{
  const api=fakeApi();await handleUpdate(makeMessage({document:{file_id:'x',file_name:'plan.pdf'}}),api);
  assert.equal(confirmed,0);assert.equal(api.csvs.length,1);assert.match(api.csvs[0].text,/2026-12-09,500,10.34,0,510.34/);
  assert.ok(api.messages.some(x=>x.markup?.inline_keyboard.flat().some(button=>button.callback_data===`c:${id}:3`)));
  await handleUpdate({update_id:101,callback_query:{id:'cb',from:{id:42},data:`c:${id}:3`,message:{message_id:2,chat:{id:42,type:'private'},from:{id:999,is_bot:true}}}},api);
  assert.equal(confirmed,1);
 }finally{store.userForChat=originals.user;store.findDocument=originals.find;store.saveDraft=originals.save;store.confirmDraft=originals.confirm;extraction.extractLoan=originals.extract;}
});
test('Un documento ya registrado no vuelve a leerse ni crea otro préstamo',async()=>{
 const original={user:store.userForChat,find:store.findDocument,extract:extraction.extractLoan};
 store.userForChat=async()=>user;store.findDocument=async()=>({estado:'registrado',prestamoId:9});extraction.extractLoan=async()=>{throw Error('No debe volver a leer');};
 try{const api=fakeApi();await handleUpdate(makeMessage({photo:[{file_id:'x'}]}),api);assert.match(api.messages.at(-1).text,/ya registró/);}finally{store.userForChat=original.user;store.findDocument=original.find;extraction.extractLoan=original.extract;}
});
