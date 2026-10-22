import { ApiError } from '../middleware/errorHandler';

export type Frecuencia = 'semanal' | 'quincenal' | 'mensual' | 'trimestral' | 'semestral' | 'anual';
export type TipoAmortizacion = 'cuota_fija' | 'capital_fijo' | 'solo_interes' | 'pago_unico' | 'balon' | 'creciente' | 'extraordinarias' | 'manual';
export const FRECUENCIAS: Frecuencia[] = ['semanal', 'quincenal', 'mensual', 'trimestral', 'semestral', 'anual'];
export const TIPOS_AMORTIZACION: TipoAmortizacion[] = ['cuota_fija', 'capital_fijo', 'solo_interes', 'pago_unico', 'balon', 'creciente', 'extraordinarias', 'manual'];
export const PERIODOS_ANIO: Record<Frecuencia, number> = { semanal: 52, quincenal: 24, mensual: 12, trimestral: 4, semestral: 2, anual: 1 };
export const money = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export interface OpcionesPlan {
  gracia?: { periodos: number; tipo: 'parcial' | 'capitalizar' | 'diferir'; cobroDiferido?: 'primera' | 'repartido' | 'ultima' };
  interesPagoUnico?: 'simple' | 'compuesto';
  balon?: { valor: number; unidad: 'monto' | 'porcentaje'; base: 'cuota_fija' | 'capital_fijo' };
  crecimiento?: { modo: 'fijo' | 'variable'; porcentaje?: number; cadaPeriodos?: number; indice?: string; variaciones?: { periodo: number; porcentaje: number }[] };
  baseExtraordinarias?: 'cuota_fija' | 'capital_fijo';
  extraordinarias?: { periodo: number; monto: number }[];
  calendario?: { fechaVencimiento: string; capital: number; interes: number; cargos: number }[];
}
export interface PlanInput {
  monto: number; tasaAnual: number; cantidadCuotas: number; frecuencia: Frecuencia;
  tipoAmortizacion: TipoAmortizacion; fechaPrimeraCuota: string; cargoCuota: number; opciones?: OpcionesPlan;
}
export interface CuotaCalculada { capital: number; interes: number; cargos: number; monto: number; interesDiferido?: number }
export interface CuotaPlan extends CuotaCalculada { numero: number; fechaVencimiento: string; saldo: number; concepto: string }
function fail(message: string): never { throw new ApiError(400, message); }
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const amount = (value: unknown, label: string, min = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > 1e12 || Math.abs(value - money(value)) > 1e-6) fail(`${label}: ingresa un monto válido con máximo dos decimales.`);
  return value as number;
};
const integer = (value: unknown, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) fail(`${label}: ingresa un entero entre ${min} y ${max}.`);
};

/** Valida también las opciones: simular y guardar usan exactamente estas reglas. */
export function validarPlan(input: PlanInput): void {
  amount(input.monto, 'Monto', 0.01); amount(input.cargoCuota, 'Cargos');
  if (!Number.isFinite(input.tasaAnual) || input.tasaAnual < 0 || input.tasaAnual > 200 || Math.abs(input.tasaAnual * 10000 - Math.round(input.tasaAnual * 10000)) > 1e-6) fail('La tasa anual debe estar entre 0 y 200%, con máximo cuatro decimales.');
  integer(input.cantidadCuotas, 1, 1000, 'Cantidad de períodos');
  if (!FRECUENCIAS.includes(input.frecuencia) || !TIPOS_AMORTIZACION.includes(input.tipoAmortizacion) || !validDate(input.fechaPrimeraCuota)) fail('Frecuencia, amortización o fecha no válidas.');
  const o = input.opciones ?? {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) fail('Opciones de amortización no válidas.');
  const n = input.cantidadCuotas, g = o.gracia?.periodos ?? 0;
  if (o.gracia) {
    if (n < 2) fail('La gracia requiere al menos un período adicional para amortizar el préstamo.');
    integer(g, 1, n - 1, 'Períodos de gracia');
    if (['manual', 'pago_unico'].includes(input.tipoAmortizacion)) fail('El calendario manual y el pago único no usan una gracia adicional.');
    if (!['parcial', 'capitalizar', 'diferir'].includes(o.gracia.tipo)) fail('Tipo de gracia no válido.');
    if (o.gracia.tipo === 'diferir' && !['primera', 'repartido', 'ultima'].includes(o.gracia.cobroDiferido ?? '')) fail('Elige cuándo cobrar los intereses diferidos.');
  }
  if (input.tipoAmortizacion === 'pago_unico' && !['simple', 'compuesto'].includes(o.interesPagoUnico ?? '')) fail('Elige interés simple o compuesto para el pago único.');
  if (input.tipoAmortizacion === 'balon') {
    if (!o.balon || !['monto', 'porcentaje'].includes(o.balon.unidad) || !['cuota_fija', 'capital_fijo'].includes(o.balon.base)) fail('Configura el capital balón y el método de las cuotas regulares.');
    amount(o.balon.valor, 'Capital balón', 0.01);
    if (n - g < 2 || (o.balon.unidad === 'porcentaje' && o.balon.valor >= 100) || (o.balon.unidad === 'monto' && o.balon.valor >= input.monto)) fail('El balón debe ser menor que el monto recibido y requiere al menos dos períodos después de la gracia.');
    const residual = money(o.balon.unidad === 'porcentaje' ? input.monto * o.balon.valor / 100 : o.balon.valor);
    if (residual <= 0 || residual >= input.monto) fail('El capital balón debe ser al menos 0.01 y menor que el monto recibido.');
  }
  if (input.tipoAmortizacion === 'creciente') {
    const c = o.crecimiento;
    if (!c || !['fijo', 'variable'].includes(c.modo)) fail('Configura el crecimiento de las cuotas.');
    if (c.modo === 'fijo') {
      if (!Number.isFinite(c.porcentaje) || c.porcentaje! < 0 || c.porcentaje! > 100) fail('El crecimiento fijo debe estar entre 0 y 100%.');
      integer(c.cadaPeriodos, 1, n, 'Frecuencia del crecimiento');
    } else {
      if (typeof c.indice !== 'string' || !c.indice.trim() || c.indice.length > 100 || !Array.isArray(c.variaciones) || !c.variaciones.length || c.variaciones.length > n) fail('Ingresa el nombre del índice y sus variaciones por período.');
      const seen = new Set<number>();
      for (const row of c.variaciones) {
        if (!row || typeof row !== 'object') fail('Variación no válida.');
        integer(row.periodo, g + 2, n, 'Período de variación');
        if (seen.has(row.periodo) || !Number.isFinite(row.porcentaje) || row.porcentaje <= -100 || row.porcentaje > 100) fail('Las variaciones deben ser únicas por período, mayores que -100% y hasta 100%.');
        seen.add(row.periodo);
      }
    }
  }
  if (input.tipoAmortizacion === 'extraordinarias') {
    if (!['cuota_fija', 'capital_fijo'].includes(o.baseExtraordinarias ?? '') || !Array.isArray(o.extraordinarias) || !o.extraordinarias.length || o.extraordinarias.length > n) fail('Elige el plan base y agrega al menos un abono extraordinario.');
    const seen = new Set<number>();
    for (const row of o.extraordinarias) {
      if (!row || typeof row !== 'object') fail('Abono programado no válido.');
      integer(row.periodo, g + 1, n, 'Período del abono extraordinario');
      amount(row.monto, 'Abono extraordinario', 0.01);
      if (seen.has(row.periodo)) fail('Solo se permite un abono extraordinario por período.');
      seen.add(row.periodo);
    }
  }
  if (input.tipoAmortizacion === 'manual') {
    if (!Array.isArray(o.calendario) || o.calendario.length !== n) fail('El calendario manual debe tener una fila por cuota.');
    let previous = '';
    for (const row of o.calendario) {
      if (!row || typeof row !== 'object' || !validDate(row.fechaVencimiento) || row.fechaVencimiento <= previous) fail('Las fechas del calendario deben ser válidas y estar en orden, sin repetirse.');
      amount(row.capital, 'Capital'); amount(row.interes, 'Interés'); amount(row.cargos, 'Cargos');
      if (money(row.capital + row.interes + row.cargos) <= 0) fail('Cada cuota manual debe tener un monto mayor que cero.');
      previous = row.fechaVencimiento;
    }
    if (o.calendario[0].fechaVencimiento !== input.fechaPrimeraCuota) fail('La primera fecha del calendario debe coincidir con la primera cuota.');
    if (money(o.calendario.reduce((sum, row) => sum + row.capital, 0)) !== money(input.monto)) fail('El capital del calendario debe sumar exactamente el monto recibido.');
  }
}

export function fechaPeriodo(first: string, frequency: Frecuencia, index: number): string {
  const date = new Date(`${first}T00:00:00Z`);
  const months = ({ mensual: 1, trimestral: 3, semestral: 6, anual: 12 } as Partial<Record<Frecuencia, number>>)[frequency];
  if (months) {
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months * index, 1));
    next.setUTCDate(Math.min(date.getUTCDate(), new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
    return next.toISOString().slice(0, 10);
  }
  date.setUTCDate(date.getUTCDate() + index * (frequency === 'semanal' ? 7 : 15));
  return date.toISOString().slice(0, 10);
}

export const cuotaFija = (principal: number, rate: number, n: number) => rate === 0 ? principal / n : principal * rate / -Math.expm1(-n * Math.log1p(rate));

export function calcularPlan(input: PlanInput) {
  validarPlan(input);
  const o = input.opciones ?? {}, n = input.cantidadCuotas, grace = o.gracia?.periodos ?? 0;
  const rate = input.tasaAnual / 100 / PERIODOS_ANIO[input.frecuencia];
  const cuotas: CuotaPlan[] = [];
  let balance = money(input.monto), interesCapitalizado = 0, diferido = 0;
  const push = (numero: number, capital: number, interes: number, cargos: number, concepto: string, fecha?: string, interesDiferido = 0) => {
    const row = { numero, fechaVencimiento: fecha ?? fechaPeriodo(input.fechaPrimeraCuota, input.frecuencia, numero - 1), capital: money(capital), interes: money(interes), cargos: money(cargos), monto: money(capital + interes + cargos), saldo: balance, concepto, interesDiferido };
    if (!validDate(row.fechaVencimiento)) fail('El plazo genera una fecha de vencimiento fuera del rango permitido.');
    if (![row.capital, row.interes, row.cargos, row.monto, row.saldo].every(v => Number.isFinite(v) && v >= 0 && v <= 1e12)) fail('El plan excede los límites de cálculo. Revisa el monto, plazo y crecimiento.');
    cuotas.push(row);
  };
  if (input.tipoAmortizacion === 'manual') {
    o.calendario!.forEach((row, index) => { balance = money(balance - row.capital); push(index + 1, row.capital, row.interes, row.cargos, 'Calendario manual', row.fechaVencimiento); });
  } else if (input.tipoAmortizacion === 'pago_unico') {
    const interest = money(input.monto * (o.interesPagoUnico === 'compuesto' ? Math.expm1(n * Math.log1p(rate)) : rate * n));
    balance = 0;
    push(1, input.monto, interest, input.cargoCuota, `Pago único · ${n} períodos · interés ${o.interesPagoUnico}`, input.fechaPrimeraCuota);
  } else {
    for (let i = 1; i <= grace; i += 1) {
      const interest = money(balance * rate);
      if (o.gracia!.tipo === 'capitalizar') { balance = money(balance + interest); interesCapitalizado = money(interesCapitalizado + interest); }
      if (o.gracia!.tipo === 'diferir') diferido = money(diferido + interest);
      push(i, 0, o.gracia!.tipo === 'parcial' ? interest : 0, o.gracia!.tipo === 'parcial' ? input.cargoCuota : 0,
        o.gracia!.tipo === 'capitalizar' ? `Gracia total · capitaliza ${interest.toFixed(2)}` : o.gracia!.tipo === 'diferir' ? `Gracia total · difiere ${interest.toFixed(2)}` : 'Gracia parcial · solo intereses');
    }
    const principal = balance, count = n - grace;
    const tipo = input.tipoAmortizacion === 'extraordinarias' ? o.baseExtraordinarias! : input.tipoAmortizacion;
    const balon = input.tipoAmortizacion === 'balon' ? money(o.balon!.unidad === 'porcentaje' ? input.monto * o.balon!.valor / 100 : o.balon!.valor) : 0;
    const regularCount = input.tipoAmortizacion === 'balon' ? count - 1 : count;
    const fixed = input.tipoAmortizacion === 'balon'
      ? cuotaFija(principal - balon / (1 + rate) ** regularCount, rate, regularCount)
      : cuotaFija(principal, rate, count);
    const fixedCapital = (principal - balon) / regularCount;
    const weights: number[] = [];
    let weight = 1;
    for (let j = 0; j < count; j += 1) {
      if (input.tipoAmortizacion === 'creciente' && j > 0) {
        const c = o.crecimiento!;
        const growth = c.modo === 'fijo' ? (j % c.cadaPeriodos! === 0 ? c.porcentaje! : 0) : c.variaciones!.find(row => row.periodo === grace + j + 1)?.porcentaje ?? 0;
        weight *= 1 + growth / 100;
      }
      weights.push(weight);
    }
    const firstGrowing = principal / weights.reduce((sum, w, j) => sum + w / (1 + rate) ** (j + 1), 0);
    let deferredLeft = diferido;
    for (let j = 0; j < count && balance > 0; j += 1) {
      const numero = grace + j + 1, last = j === count - 1;
      let interest = money(balance * rate), capital = 0;
      if (last) capital = balance;
      else if (tipo === 'capital_fijo' || (tipo === 'balon' && o.balon!.base === 'capital_fijo')) capital = Math.min(balance, money(fixedCapital));
      else if (tipo !== 'solo_interes') {
        const target = tipo === 'creciente' ? money(firstGrowing * weights[j]) : money(fixed);
        if (target < interest) fail('La cuota calculada no cubre el interés. Reduce el crecimiento o el plazo para evitar amortización negativa.');
        capital = Math.min(balance, money(target - interest));
      }
      // Ajusta el último pago regular por centavos para dejar exactamente el balón pactado.
      if (tipo === 'balon' && j === count - 2) capital = money(balance - balon);
      const extra = input.tipoAmortizacion === 'extraordinarias' ? o.extraordinarias!.find(row => row.periodo === numero)?.monto ?? 0 : 0;
      if (extra > (last ? balance : money(balance - capital))) fail(`El abono extraordinario del período ${numero} excede el capital disponible después de la cuota regular.`);
      capital = money(capital + (last ? 0 : extra));
      balance = money(balance - capital);
      let deferredCharge = 0;
      if (deferredLeft > 0) {
        deferredCharge = balance === 0 || last || o.gracia?.cobroDiferido === 'primera' ? deferredLeft
          : o.gracia?.cobroDiferido === 'repartido' ? Math.min(deferredLeft, money(diferido / count)) : 0;
        interest = money(interest + deferredCharge); deferredLeft = money(deferredLeft - deferredCharge);
      }
      push(numero, capital, interest, input.cargoCuota, extra > 0 ? `Cuota + abono programado ${extra.toFixed(2)}` : last && tipo === 'balon' ? 'Cuota balón' : 'Cuota', undefined, deferredCharge);
    }
    if (input.tipoAmortizacion === 'extraordinarias' && o.extraordinarias!.some(row => row.periodo > cuotas[cuotas.length - 1].numero)) fail('Hay abonos programados después de que el préstamo queda liquidado. Ajusta el calendario.');
  }
  const sum = (key: 'capital' | 'interes' | 'cargos' | 'monto') => {
    const total = money(cuotas.reduce((acc, row) => acc + row[key], 0));
    if (!Number.isFinite(total) || total > 1e12) fail('El total del plan excede el límite permitido. Reduce los importes o el plazo.');
    return total;
  };
  return { cuotas, interesCapitalizado, capitalFinanciado: money(input.monto + interesCapitalizado), totalInteres: money(sum('interes') + interesCapitalizado), totalCargos: sum('cargos'), totalPagar: sum('monto'), primeraCuota: cuotas.find(row => row.monto > 0)?.monto ?? 0, ultimaCuota: cuotas[cuotas.length - 1]?.monto ?? 0 };
}
