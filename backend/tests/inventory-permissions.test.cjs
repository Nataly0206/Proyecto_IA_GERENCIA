const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const inventory=require('../dist/services/inventory.service');
const preloads=require('../dist/services/preload.service');
inventory.getInventory=async()=>[];
preloads.listPreloads=async()=>[];
preloads.getLatestClientPreload=async client=>client==='Cliente' ? {notes:'EMB-0099'} : client==='Sin número' ? {notes:'EMBARQUE'} : null;
const router=require('../dist/routes/inventory.routes').default;

test('Inventario PT y Cargas tienen permisos independientes en la API',async()=>{
 const app=express();
 app.use(express.json());
 app.use((req,res,next)=>{res.locals.authUser={id:'test',esAdministrador:req.headers.admin==='true',permisos:(req.headers.permissions||'').split(',')};next();});
 app.use('/inventory',router);
 const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}/inventory`;
 try {
  for(const [permissions,stock,loads] of [['inventario',200,403],['cargas',403,200],['inventario,cargas',200,200],['',403,403]]){
   assert.equal((await fetch(base,{headers:{permissions}})).status,stock,`stock: ${permissions}`);
   assert.equal((await fetch(`${base}/preloads`,{headers:{permissions}})).status,loads,`loads: ${permissions}`);
  }
  for(const [method,path] of [['POST','/preloads'],['GET','/preloads/latest-client'],['GET','/preloads/next-shipping-code'],['GET','/preloads/1/edit'],['POST','/preloads/1/refresh'],['PUT','/preloads/1'],['DELETE','/preloads/1'],['GET','/preloads/1/report']]) {
   assert.equal((await fetch(base+path,{method,headers:{permissions:'inventario'}})).status,403,`${method} ${path}`);
  }
  const suggestion=await fetch(`${base}/preloads/next-shipping-code?client=Cliente`,{headers:{permissions:'cargas'}});
  assert.equal(suggestion.status,200);
  assert.deepEqual(await suggestion.json(),{previous:'EMB-0099',code:'EMB-0100'});
  assert.equal((await fetch(`${base}/preloads/next-shipping-code?client=Nuevo`,{headers:{permissions:'cargas'}})).status,404);
  assert.equal((await fetch(`${base}/preloads/next-shipping-code?client=${encodeURIComponent('Sin número')}`,{headers:{permissions:'cargas'}})).status,422);
  assert.equal((await fetch(`${base}/preloads/next-shipping-code`,{headers:{permissions:'cargas'}})).status,400);
  for(const method of ['GET','PUT']) assert.equal((await fetch(`${base}/preferences`,{method,headers:{permissions:'cargas'}})).status,403);
  assert.equal((await fetch(base,{headers:{admin:'true'}})).status,200);
  assert.equal((await fetch(`${base}/preloads`,{headers:{admin:'true'}})).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('correlativo conserva formato y aumenta el último número sin perder precisión',()=>{
 const {nextShippingCode}=require('../dist/utils/shippingCode');
 for(const [previous,next] of [['EMB-0099','EMB-0100'],['0009','0010'],['999','1000'],['CLIENTE 003-A','CLIENTE 004-A'],['  EMB-01  ','EMB-02'],['9007199254740999','9007199254741000']]) assert.equal(nextShippingCode(previous),next);
 assert.equal(nextShippingCode('SIN NUMERO'),null);
 assert.equal(nextShippingCode(''),null);
});
