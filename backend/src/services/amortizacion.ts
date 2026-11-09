import { ApiError } from '../middleware/errorHandler';

export type Frecuencia = 'semanal' | 'quincenal' | 'mensual' | 'trimestral' | 'semestral' | 'anual';
/** Tipos soportados al crear préstamos: 'cuota_fija' = Francés, 'solo_interes' = Bullet, 'personalizado' = hitos de capital. */
export type TipoAmortizacion = 'cuota_fija' | 'solo_interes' | 'personalizado'
  // Legado: préstamos ya registrados (o importados por Telegram) con otros métodos. No se pueden crear nuevos.
  | 'capital_fijo' | 'pago_unico' | 'balon' | 'creciente' | 'extraordinarias' | 'manual';
export type BaseCalculo = '30_360' | 'ACTUAL_360';
export const BASES_CALCULO: BaseCalculo[] = ['30_360', 'ACTUAL_360'];
export const FRECUENCIAS: Frecuencia[] = ['semanal', 'quincenal', 'mensual', 'trimestral', 'semestral', 'anual'];
/** 'manual': las cuotas (fecha, capital, interés y cargos) se guardan exactamente como se ingresan, sin calcular nada. */
export const TIPOS_AMORTIZACION: TipoAmortizacion[] = ['cuota_fija', 'solo_interes', 'personalizado', 'manual'];
/** Frecuencias disponibles al crear préstamos (las demás solo existen en préstamos anteriores). */
export const FRECUENCIAS_NUEVAS: Frecuencia[] = ['semanal', 'mensual', 'trimestral'];
export const PERIODOS_ANIO: Record<Frecuencia, number> = { semanal: 52, quincenal: 24, mensual: 12, trimestral: 4, semestral: 2, anual: 1 };
export const money = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export interface OpcionesPlan {
  /** Personalizado: un hito por cuota (fecha y capital). Interés y cargos solo vienen en calendarios legados/importados. */
  calendario?: { fechaVencimiento: string; capital: number; interes?: number; cargos?: number }[];
}
export interface PlanInput {
  monto: number; tasaAnual: number; cantidadCuotas: number; frecuencia: Frecuencia;
  tipoAmortizacion: TipoAmortizacion; fechaPrimeraCuota: string; cargoCuota: number; opciones?: OpcionesPlan;
  baseCalculo?: BaseCalculo; fechaDesembolso?: string;
}
export interface CuotaCalculada { capital: number; interes: number; cargos: number; monto: number; interesDiferido?: number }
export interface CuotaPlan extends CuotaCalculada { numero: number; fechaVencimiento: string; saldo: number; concepto: string; semanaIso?: number; anioIso?: number; mesNombre?: string; anio?: number }
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

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** Semana ISO 8601 (equivale a DATEPART(ISO_WEEK, fecha)), año ISO, nombre del mes y año calendario. */
export function infoFecha(fecha: string) {
  const d = new Date(`${fecha}T00:00:00Z`);
  const mesNombre = MESES[d.getUTCMonth()], anio = d.getUTCFullYear();
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // jueves de la misma semana ISO
  const anioIso = d.getUTCFullYear();
  const semanaIso = Math.ceil(((d.getTime() - Date.UTC(anioIso, 0, 1)) / 86400000 + 1) / 7);
  return { semanaIso, anioIso, mesNombre, anio };
}

/** Valida el plan. Simular y guardar usan exactamente estas reglas. */
export function validarPlan(input: PlanInput): void {
  amount(input.monto, 'Monto', 0.01); amount(input.cargoCuota, 'Cargos');
  if (!Number.isFinite(input.tasaAnual) || input.tasaAnual < 0 || input.tasaAnual > 200 || Math.abs(input.tasaAnual * 10000 - Math.round(input.tasaAnual * 10000)) > 1e-6) fail('La tasa anual debe estar entre 0 y 200%, con máximo cuatro decimales.');
  integer(input.cantidadCuotas, 1, 600, 'Número de cuotas');
  if (!FRECUENCIAS_NUEVAS.includes(input.frecuencia)) fail('Elige frecuencia semanal, mensual o trimestral.');
  if (!TIPOS_AMORTIZACION.includes(input.tipoAmortizacion)) fail('Elige Cuota fija (Francés), Solo interés al vencimiento (Bullet), Personalizada o Manual.');
  if (!validDate(input.fechaPrimeraCuota)) fail('La fecha del primer pago no es válida.');
  if (input.baseCalculo !== undefined && !BASES_CALCULO.includes(input.baseCalculo)) fail('Base de cálculo no válida.');
  if (input.fechaDesembolso !== undefined && !validDate(input.fechaDesembolso)) fail('La fecha de desembolso no es válida.');
  if (input.tipoAmortizacion === 'personalizado' || input.tipoAmortizacion === 'manual') {
    const manual = input.tipoAmortizacion === 'manual';
    const rows = input.opciones?.calendario;
    if (!Array.isArray(rows) || rows.length !== input.cantidadCuotas) fail(manual ? `El plazo (${input.cantidadCuotas}) debe coincidir con las cuotas pegadas (${Array.isArray(rows) ? rows.length : 0}).` : 'La amortización personalizada debe tener un hito de capital por cuota.');
    if (manual) rows.forEach(row => { if (!row || typeof row !== 'object' || row.interes === undefined) fail('Cada cuota manual necesita capital e interés.'); amount(row.cargos ?? 0, 'Cargos'); });
    let previous = '';
    for (const row of rows) {
      if (!row || typeof row !== 'object' || !validDate(row.fechaVencimiento) || row.fechaVencimiento <= previous) fail('Las fechas de pago deben ser válidas y estar en orden, sin repetirse.');
      amount(row.capital, 'Capital');
      if (row.interes !== undefined) amount(row.interes, 'Interés');
      previous = row.fechaVencimiento;
    }
    if (rows[0].fechaVencimiento !== input.fechaPrimeraCuota) fail('La primera fecha del calendario debe coincidir con la fecha del primer pago.');
    const diff = money(rows.reduce((sum, row) => sum + row.capital, 0) - input.monto);
    if (diff !== 0) fail(`Descuadre por ${Math.abs(diff).toFixed(2)}: la suma de abonos a capital debe ser igual al monto del desembolso.`);
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
const diasEntre = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/**
 * Motor de amortización (semanal, mensual o trimestral) con tres modalidades:
 *  - cuota_fija: Francés, C = P·i(1+i)^n / ((1+i)^n − 1), i = tasa anual / períodos por año (52, 12 o 4).
 *  - solo_interes: Bullet, intereses por período y todo el capital en la última cuota.
 *  - personalizado: el usuario define el capital de cada cuota; el interés se calcula sobre el saldo.
 * Base 30/360: interés = saldo × tasa / períodos por año. Base ACTUAL/360: saldo × tasa × días transcurridos / 360.
 * En la última cuota el capital es exactamente el saldo remanente (saldo final 0.00).
 */
export function calcularPlan(input: PlanInput) {
  validarPlan(input);
  const n = input.cantidadCuotas, base = input.baseCalculo ?? '30_360', tasa = input.tasaAnual / 100, rate = tasa / PERIODOS_ANIO[input.frecuencia];
  const manual = input.tipoAmortizacion === 'manual';
  const fechas = input.tipoAmortizacion === 'personalizado' || manual
    ? input.opciones!.calendario!.map(row => row.fechaVencimiento)
    : Array.from({ length: n }, (_, i) => fechaPeriodo(input.fechaPrimeraCuota, input.frecuencia, i));
  const cuotas: CuotaPlan[] = [];
  let balance = money(input.monto), anterior = input.fechaDesembolso ?? fechaPeriodo(input.fechaPrimeraCuota, input.frecuencia, -1);
  const cuota = input.tipoAmortizacion === 'cuota_fija' ? money(cuotaFija(input.monto, rate, n)) : 0;
  for (let i = 0; i < n; i += 1) {
    const fecha = fechas[i], last = i === n - 1;
    // Personalizada: si el hito trae interés (p. ej. tasa variable del banco) se respeta tal cual; si no, se calcula.
    const fijo = input.tipoAmortizacion === 'personalizado' || manual ? input.opciones!.calendario![i].interes : undefined;
    const cargos = manual ? money(input.opciones!.calendario![i].cargos ?? 0) : input.cargoCuota;
    const interes = fijo !== undefined ? money(fijo) : money(base === 'ACTUAL_360' ? balance * tasa * Math.max(0, diasEntre(anterior, fecha)) / 360 : balance * rate);
    let capital: number, concepto = 'Cuota';
    if (last) { capital = balance; if (input.tipoAmortizacion === 'solo_interes') concepto = 'Cuota final · capital al vencimiento'; }
    else if (input.tipoAmortizacion === 'cuota_fija') capital = Math.min(balance, Math.max(0, money(cuota - interes)));
    else if (input.tipoAmortizacion === 'solo_interes') capital = 0;
    else { capital = input.opciones!.calendario![i].capital; if (capital > 0) concepto = 'Abono a capital'; }
    capital = money(capital); balance = money(balance - capital);
    const row: CuotaPlan = { numero: i + 1, fechaVencimiento: fecha, capital, interes, cargos, monto: money(capital + interes + cargos), saldo: balance, concepto, interesDiferido: 0, ...infoFecha(fecha) };
    if (!validDate(row.fechaVencimiento)) fail('El plazo genera una fecha de vencimiento fuera del rango permitido.');
    if (![row.capital, row.interes, row.cargos, row.monto, row.saldo].every(v => Number.isFinite(v) && v >= 0 && v <= 1e12)) fail('El plan excede los límites de cálculo. Revisa el monto, plazo y tasa.');
    cuotas.push(row); anterior = fecha;
  }
  if (cuotas[n - 1].saldo !== 0) fail('El plan no cuadra: el saldo final debe ser 0.00.');
  const sum = (key: 'capital' | 'interes' | 'cargos' | 'monto') => money(cuotas.reduce((acc, row) => acc + row[key], 0));
  return { cuotas, interesCapitalizado: 0, capitalFinanciado: money(input.monto), totalInteres: sum('interes'), totalCargos: sum('cargos'), totalPagar: sum('monto'), primeraCuota: cuotas[0].monto, ultimaCuota: cuotas[n - 1].monto };
}
