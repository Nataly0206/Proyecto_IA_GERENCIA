import {getProductionStaff} from '../services/production-staff.service';
import {closePayrollPool} from '../config/payrollDb';
import {closeStbPool} from '../config/stbDb';
import {closeRedis} from '../config/redis';
(async()=>{try{const start=Date.now();const result=await getProductionStaff('2026-11-20',true);console.log(JSON.stringify({ms:Date.now()-start,summary:result.summary,employees:result.employees.length,absenceDataAvailable:result.absenceDataAvailable,locationAvailable:result.locationAvailable,activityPeople:result.employees.filter(p=>p.dailyActivities?.length).length,report:result.report,warnings:result.warnings}))}catch(e){console.error(e);process.exitCode=1}finally{await Promise.allSettled([closePayrollPool(),closeStbPool(),closeRedis()]);process.exit(process.exitCode??0)}})();
