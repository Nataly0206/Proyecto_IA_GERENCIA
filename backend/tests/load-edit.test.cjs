const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyLoadEdit,editCandidates,lotKey}=require('../dist/services/load-edit');
const {planPreload,itemKey}=require('../dist/services/preload-planner');
const base={nombreClientePrincipal:'Principal',nombreCliente:'Cliente',codigoItem:'ITEM',nombreItem:'Producto',estiloFinal:'IQF',marca:'Marca',talla:'71/90',empaque:'Caja',tipoItem:'PT',disponibilidad:'DISPONIBLE',fechaProduccion:'2026-10-19',noOrdenCompra:'1',codigoExterno:'A',pesoKilos:100,cantidadSerial:10,nombreFinca:'Finca',laguna:'A1',color:'A2',codigoProduccion:'PROD1'};
const second={...base,noOrdenCompra:'2',codigoProduccion:'PROD2',fechaProduccion:'2026-10-23',pesoKilos:200};
const key=itemKey(base);
const saved=planPreload([base],{},[{key,quantity:10}]);
const line=(allocations,requested=10)=>[{key,requested,allocations}];
test('reemplaza producción retirada con otra orden y recalcula kg y faltantes',()=>{
 const edited=applyLoadEdit(saved,[base,second],line([{key:lotKey(base),quantity:4},{key:lotKey(second),quantity:6}]));
 assert.equal(edited[0].assigned,10);assert.equal(edited[0].missing,0);assert.equal(edited[0].pesoKilos,160);
 assert.equal(saved[0].allocations[0].cantidadSerial,10);
});
test('puede reducir y dejar un faltante o cambiar cantidad solicitada',()=>{
 const edited=applyLoadEdit(saved,[base],line([{key:lotKey(base),quantity:6}],12));
 assert.equal(edited[0].missing,6);assert.equal(edited[0].pesoKilos,60);
});
test('conserva la asignación histórica aunque ya no aparezca en inventario',()=>{
 const edited=applyLoadEdit(saved,[],line([{key:lotKey(base),quantity:10}]));
 assert.equal(edited[0].pesoKilos,100);assert.equal(edited[0].assigned,10);
});
test('no permite aumentar una producción agotada ni exceder stock actual',()=>{
 assert.throws(()=>applyLoadEdit(saved,[],line([{key:lotKey(base),quantity:11}],11)),/existencia/);
 assert.throws(()=>applyLoadEdit(saved,[second],line([{key:lotKey(second),quantity:11}],11)),/existencia/);
});
test('no ofrece otro cliente, empaque, ni producciones sin orden o retenidas',()=>{
 const others=[{...second,nombreCliente:'Otro'},{...second,empaque:'Otro'},{...second,noOrdenCompra:'Sin orden'},{...second,disponibilidad:'RETENIDO'}];
 assert.equal(editCandidates(saved,others)[0].lots.length,1);
 assert.throws(()=>applyLoadEdit(saved,others,line([{key:lotKey(others[0]),quantity:1}])),/existencia/);
});
test('rechaza duplicados, cantidades fraccionarias y sobreasignaciones',()=>{
 assert.throws(()=>applyLoadEdit(saved,[base],line([{key:lotKey(base),quantity:1},{key:lotKey(base),quantity:1}])),/Revisa/);
 assert.throws(()=>applyLoadEdit(saved,[base],line([{key:lotKey(base),quantity:1.5}])),/enteros/);
 assert.throws(()=>applyLoadEdit(saved,[base],line([{key:lotKey(base),quantity:10}],9)),/supera/);
 assert.throws(()=>applyLoadEdit(saved,[base],[]),/Revisa/);
});
test('guarda exclusiones del autocompletado y permite conservar cantidades parciales',()=>{
 const lines=line([{key:lotKey(second),quantity:10}]);lines[0].excludedLots=[lotKey(base)];
 const edited=applyLoadEdit(saved,[base,second],lines);
 assert.deepEqual(edited[0].excludedLots,[lotKey(base)]);
 assert.deepEqual(editCandidates(edited,[base,second])[0].excludedLots,[lotKey(base)]);
 lines[0].allocations=[{key:lotKey(base),quantity:1}];
 const partial=applyLoadEdit(saved,[base,second],lines);
 assert.equal(partial[0].assigned,1);
 assert.equal(partial[0].missing,9);
 assert.deepEqual(partial[0].excludedLots,[lotKey(base)]);
});

test('rebaja solo asignaciones del cliente y lote, sin duplicar descuentos ni negativos',()=>{
 const {subtractLoad}=require('../dist/services/load-remainder');
 const partial=planPreload([base],{},[{key,quantity:6}]);
 const other={...base,nombreCliente:'Otro'};
 const held={...base,disponibilidad:'RETENIDO'};
 const inventory=[{...base,cantidadSerial:4,pesoKilos:40},{...base,cantidadSerial:4,pesoKilos:40},second,other,held];
 const remaining=subtractLoad(inventory,partial,'Cliente');
 assert.deepEqual(remaining.map(row=>row.cantidadSerial),[0,2,10,10,10]);
 assert.deepEqual(remaining.map(row=>row.pesoKilos),[0,20,200,100,100]);
 assert.equal(inventory[0].cantidadSerial,4);
 assert.equal(subtractLoad([base],saved,'Cliente')[0].cantidadSerial,0);
 const exhausted=subtractLoad([{...base,cantidadSerial:2,pesoKilos:20}],saved,'Cliente');
 assert.equal(exhausted[0].cantidadSerial,0);assert.equal(exhausted[0].pesoKilos,0);
 const next=planPreload(remaining,{},[{key,quantity:5}]);
 assert.equal(next[0].allocations[0].cantidadSerial,5);
 assert.equal(next[0].allocations[0].codigoProduccion,second.codigoProduccion);
 assert.equal(next[0].pesoKilos,100);
});

test('toma todos los códigos completos por antigüedad antes de los parciales',()=>{
 const partial={...base,parcial:true};
 const newest={...second,fechaProduccion:'2026-10-25',codigoProduccion:'NEW'};
 const result=planPreload([partial,newest,second],{},[{key,quantity:25}])[0];
 assert.deepEqual(result.allocations.map(row=>row.codigoProduccion),['PROD2','NEW','PROD1']);
 assert.deepEqual(result.allocations.map(row=>row.cantidadSerial),[10,10,5]);
});
