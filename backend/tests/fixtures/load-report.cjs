const rows = [
  ['10670','FDIR0E-71/90','STBSA IQF 11.70 KG ANILLOST71/90',[
    ['ALGODON','A-36','2026-10-24','3125438',2450.4110,95],['CULCAMAR','33','2026-10-24','3125442',928.5768,36],
    ['GRANJAS MARINAS DEL','26','2026-10-22','3125322',3430.5754,133],['INMAR','07','2026-10-24','3125445',799.6078,31],
    ['MICHIGUISTE','M-71','2026-10-23','3125388',1676.5970,65],['RIVERMAR','R-21','2026-10-24','3125435',2630.9676,102]]],
  ['10671','F1IR8F-71/90','STBSA IQF 15.30 KG ANILLOST71/90',[
    ['ALGODON','A-36','2026-10-24','3125453',708.3384,21],['CULCAMAR','33','2026-10-24','3125447',708.3384,21],
    ['GRANJAS MARINAS DEL','26','2026-10-22','3125330',944.4512,28],['MICHIGUISTE','M-71','2026-10-22','3125336',775.7992,23],['RIVERMAR','R-28','2026-10-22','3125329',944.4512,28]]],
  ['10672','F1IR0G-61/70','STBSA IQF 11.34 KG ANILLOST61/70',[
    ['ALGODON','A-37','2026-10-20','3125221',2150.0172,86],['ALGODON','A-38','2026-10-19','3125174',75.0006,3],['MICHIGUISTE','M-71','2026-10-22','3125337',1875.0150,75]]],
  ['10673','F1IR0G-61/70','STBSA IQF 11.34 KG ANILLOST61/70',[
    ['CULCAMAR','33','2026-10-23','3125393',3475.0278,139],['CULCAMAR','33','2026-10-23','3125401',925.0074,37],
    ['MICHIGUISTE','M-71','2026-10-22','3125344',2300.0184,92],['MICHIGUISTE','M-71','2026-10-23','3125387',2650.0212,106],['RIVERMAR','R-21','2026-10-23','3125397',2275.0182,91]]],
];
const items = new Map();
for (const [order, code, name, lots] of rows) {
  const group = items.get(code) ?? { key: code, allocations: [] };
  for (const [farm, lagoon, date, production, pounds, serials] of lots) group.allocations.push({ noOrdenCompra: order, codigoItem: code, nombreItem: name, nombreFinca: farm, laguna: lagoon, fechaProduccion: date, codigoProduccion: production, color:'A2', pesoKilos:pounds/2.2046, cantidadSerial:serials });
  items.set(code,group);
}
module.exports = [...items.values()];
