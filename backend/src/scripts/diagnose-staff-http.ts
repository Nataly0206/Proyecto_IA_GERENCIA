import {env} from '../config/env';
(async()=>{
 const base='http://localhost:3002';
 const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:process.env.ADMIN_USER??'admin',password:env.LOGIN_PASSWORD})});
 console.log('login',login.status);
 if(!login.ok)return;
 const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const start=Date.now();
 const response=await fetch(`${base}/api/dashboard/personal-produccion?fecha=2026-11-20&refresh=true`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(90000)});
 const body=await response.json() as any;
 console.log(JSON.stringify({status:response.status,ms:Date.now()-start,error:body.error,summary:body.summary,employees:body.employees?.length,absenceDataAvailable:body.absenceDataAvailable,locationAvailable:body.locationAvailable,activityPeople:body.employees?.filter((p:any)=>p.dailyActivities?.length).length,report:body.report,warnings:body.warnings}));
})().catch(e=>{console.error(String(e));process.exitCode=1});
