const assert=require('node:assert/strict');
const {test}=require('node:test');
const express=require('express');
const {env}=require('../dist/config/env');
const {getAuthPool,closeAuthPool}=require('../dist/config/authDb');
const {createSession,deleteSession}=require('../dist/services/auth.service');
const {sessionAuth,changedPasswordAuth,requirePermission}=require('../dist/middleware/sessionAuth');
const {errorHandler}=require('../dist/middleware/errorHandler');

test('HTTP: las rutas de Telegram exigen sesión y permiten vinculación y consulta sin exponer tokens', {skip:process.env.AUTH_DB_DATABASE!=='DashboardGerencialAuth_Telegram_QA'},async()=>{
 let server,token;const originalToken=env.TELEGRAM_BOT_TOKEN;
 try{
 const pool=await getAuthPool();const users=await pool.request().query('SELECT TOP 1 id FROM dbo.dashboard_usuarios WHERE es_administrador=1 AND activo=1');token=await createSession(users.recordset[0].id);
 const app=express();app.use(express.json({limit:'256kb'}));app.use('/api/prestamos',sessionAuth,changedPasswordAuth,requirePermission('prestamos'),require('../dist/routes/prestamos.routes').default);app.use(errorHandler);
 await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${server.address().port}/api/prestamos/telegram`;
 assert.equal((await fetch(base+'/estado')).status,401);
 const headers={Cookie:'dashboard_session='+token};
 const status=await(await fetch(base+'/estado',{headers})).json();assert.equal(typeof status.configurado,'boolean');assert.ok(!('token'in status));
 env.TELEGRAM_BOT_TOKEN='';assert.equal((await fetch(base+'/vinculacion',{method:'POST',headers})).status,503);
 env.TELEGRAM_BOT_TOKEN='qa-no-real-token';const code=await(await fetch(base+'/vinculacion',{method:'POST',headers})).json();assert.match(code.comando,/^\/vincular [a-f0-9]{24}$/);assert.equal(code.expiraEnSegundos,600);
 const drafts=await(await fetch(base+'/borradores',{headers})).json();assert.ok(Array.isArray(drafts));
 assert.equal((await fetch(base+'/borradores/id-invalido',{headers})).status,400);
 }finally{
 env.TELEGRAM_BOT_TOKEN=originalToken;if(server)await new Promise(resolve=>server.close(resolve));if(token)await deleteSession(token);await closeAuthPool();
 }
});
