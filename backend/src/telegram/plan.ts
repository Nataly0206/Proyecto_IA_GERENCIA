import { money, validDate, FRECUENCIAS, CuotaPlan } from '../services/amortizacion';
import { ApiError } from '../middleware/errorHandler';
import type { PrestamoInput } from '../services/prestamos.service';

export interface ImportedInstallment {
  numero: number; fechaVencimiento: string | null; capital: number | null;
  interes: number | null; cargos: number | null; monto: number | null;
}
export interface ImportedLoan {
  acreedor: string; acreedorId: number | null; tipoAcreedor: string;
  moneda: 'HNL' | 'USD' | null; monto: number | null; tasaAnual: number | null;
  frecuencia: string | null; fechaDesembolso: string | null; referencia: string;
  interesCapitalizado: number; cantidadCuotas: number | null;
  cuotas: ImportedInstallment[]; notas: string; advertencias: string[];
}
const text = (x: unknown, max: number) => typeof x === 'string' ? x.trim().slice(0, max) : '';
const numeric = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) ? x : null;
export function normalizeImportedLoan(value: unknown): ImportedLoan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'El documento no contiene un plan de pagos válido.');
  const x = value as Record<string, unknown>;
  if (!Array.isArray(x.cuotas) || x.cuotas.length > 1000) throw new ApiError(400, 'El plan admite hasta 1.000 cuotas.');
  return {
    acreedor: text(x.acreedor, 180), acreedorId: numeric(x.acreedorId), tipoAcreedor: text(x.tipoAcreedor, 30) || 'otro',
    moneda: x.moneda === 'USD' || x.moneda === 'HNL' ? x.moneda : null,
    monto: numeric(x.monto), tasaAnual: numeric(x.tasaAnual), frecuencia: text(x.frecuencia, 20) || null,
    fechaDesembolso: text(x.fechaDesembolso, 10) || null, referencia: text(x.referencia, 60),
    interesCapitalizado: numeric(x.interesCapitalizado) ?? 0, cantidadCuotas: numeric(x.cantidadCuotas),
    cuotas: x.cuotas.map((raw: unknown, index: number) => {
      const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      return { numero: numeric(row.numero) ?? index + 1, fechaVencimiento: text(row.fechaVencimiento, 10) || null,
        capital: numeric(row.capital), interes: numeric(row.interes), cargos: numeric(row.cargos), monto: numeric(row.monto) };
    }),
    notas: text(x.notas, 1000), advertencias: Array.isArray(x.advertencias) ? x.advertencias.map(v => text(v, 300)).filter(Boolean).slice(0, 20) : [],
  };
}
const validMoney = (x: number | null): x is number => x !== null && x >= 0 && x <= 1e12 && Math.abs(x - money(x)) < 1e-6;
export function importedLoanErrors(loan: ImportedLoan): string[] {
  const errors: string[] = [];
  if (!loan.acreedor && !(Number.isSafeInteger(loan.acreedorId) && loan.acreedorId! > 0)) errors.push('Falta el acreedor.');
  if (loan.acreedorId !== null && (!Number.isSafeInteger(loan.acreedorId) || loan.acreedorId <= 0)) errors.push('El acreedor seleccionado no es válido.');
  if (!loan.moneda) errors.push('Indica la moneda: HNL o USD.');
  if (!validMoney(loan.monto) || loan.monto <= 0) errors.push('Falta el monto recibido, con máximo dos decimales.');
  if (loan.tasaAnual === null || loan.tasaAnual < 0 || loan.tasaAnual > 200 || Math.abs(loan.tasaAnual * 10000 - Math.round(loan.tasaAnual * 10000)) > 1e-6) errors.push('Falta una tasa anual válida (0 si el documento indica que no hay interés).');
  if (!FRECUENCIAS.includes(loan.frecuencia as never)) errors.push('Indica la frecuencia del préstamo. Las fechas del documento se conservarán.');
  if (!validDate(loan.fechaDesembolso)) errors.push('Falta la fecha de desembolso (AAAA-MM-DD).');
  if (!validMoney(loan.interesCapitalizado)) errors.push('El interés capitalizado no es válido.');
  if (!loan.cuotas.length) errors.push('No se encontraron cuotas.');
  if (loan.cantidadCuotas !== null && loan.cantidadCuotas !== loan.cuotas.length) errors.push(`El documento indica ${loan.cantidadCuotas} cuotas, pero se leyeron ${loan.cuotas.length}.`);
  let previous = '';
  for (const [index, row] of loan.cuotas.entries()) {
    const label = `Cuota ${index + 1}`;
    if (row.numero !== index + 1) errors.push(`${label}: numeración incompleta o repetida.`);
    if (!validDate(row.fechaVencimiento) || row.fechaVencimiento < previous || (validDate(loan.fechaDesembolso) && row.fechaVencimiento < loan.fechaDesembolso)) errors.push(`${label}: fecha inválida, anterior al desembolso o fuera de orden.`);
    if (validDate(row.fechaVencimiento)) previous = row.fechaVencimiento;
    if (![row.capital, row.interes, row.cargos, row.monto].every(validMoney)) errors.push(`${label}: completa capital, interés, cargos y total con máximo dos decimales.`);
    else if (money(row.capital! + row.interes! + row.cargos!) !== money(row.monto!)) errors.push(`${label}: capital + interés + cargos no coincide con el total del documento.`);
  }
  if (validMoney(loan.monto) && loan.cuotas.every(row => validMoney(row.capital)) && money(loan.cuotas.reduce((n, row) => n + row.capital!, 0)) !== money(loan.monto + loan.interesCapitalizado)) errors.push('La suma del capital no coincide con monto recibido + interés capitalizado. Revisa si el documento está completo.');
  return errors;
}
/** Solo validación y copia literal. Nunca llama al motor de amortización. */
export function importedLoanToPlan(loan: ImportedLoan, acreedorId: number) {
  const errors = importedLoanErrors(loan);
  if (errors.length) throw new ApiError(400, errors.join('\n'));
  let balance = money(loan.monto! + loan.interesCapitalizado);
  const cuotas: CuotaPlan[] = loan.cuotas.map(row => {
    balance = money(balance - row.capital!);
    return { numero: row.numero, fechaVencimiento: row.fechaVencimiento!, capital: row.capital!, interes: row.interes!, cargos: row.cargos!, monto: row.monto!, saldo: balance, concepto: 'Plan original importado', interesDiferido: 0 };
  });
  const sum = (field: 'interes' | 'cargos' | 'monto') => money(cuotas.reduce((n, row) => n + row[field], 0));
  const input: PrestamoInput = { acreedorId, moneda: loan.moneda!, monto: loan.monto!, tasaAnual: loan.tasaAnual!, frecuencia: loan.frecuencia as PrestamoInput['frecuencia'], tipoAmortizacion: 'manual', fechaDesembolso: loan.fechaDesembolso!, fechaPrimeraCuota: cuotas[0].fechaVencimiento, cantidadCuotas: cuotas.length, cargoCuota: 0, referencia: loan.referencia, notas: loan.notas,
    opciones: { calendario: cuotas.map(row => ({ fechaVencimiento: row.fechaVencimiento, capital: row.capital, interes: row.interes, cargos: row.cargos })) } };
  return { input, plan: { cuotas, interesCapitalizado: loan.interesCapitalizado, capitalFinanciado: money(loan.monto! + loan.interesCapitalizado), totalInteres: money(sum('interes') + loan.interesCapitalizado), totalCargos: sum('cargos'), totalPagar: sum('monto'), primeraCuota: cuotas[0].monto, ultimaCuota: cuotas[cuotas.length - 1].monto } };
}
