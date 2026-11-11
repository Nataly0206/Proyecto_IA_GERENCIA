import { ApiError } from '../middleware/errorHandler';
import { cuotaFija, money, PERIODOS_ANIO, Frecuencia } from './amortizacion';
export interface CuotaCambio { numero: number; fecha: string; capital: number; interes: number; cargos: number; pagado: number; interesDiferido: number }
export function recalcularTasa(cuotas: CuotaCambio[], desdeCuota: number, tasaAnual: number, tipo: string, frecuencia: Frecuencia) {
  if (!Number.isInteger(desdeCuota) || desdeCuota < 1 || !Number.isFinite(tasaAnual) || tasaAnual < 0 || tasaAnual > 200 || Math.abs(tasaAnual * 10000 - Math.round(tasaAnual * 10000)) > 1e-6)
    throw new ApiError(400, 'Indica una cuota válida y una tasa entre 0 y 200% con máximo cuatro decimales.');
  if (!['cuota_fija', 'capital_fijo', 'solo_interes', 'personalizado', 'manual'].includes(tipo)) throw new ApiError(400, 'Este tipo de préstamo requiere reprogramar su calendario.');
  const siguientes = cuotas.filter(q => q.numero >= desdeCuota);
  if (!siguientes.length || siguientes[0].numero !== desdeCuota) throw new ApiError(400, 'La cuota seleccionada no existe en el calendario vigente.');
  if (siguientes.some(q => q.pagado > 0)) throw new ApiError(400, 'Desde la cuota seleccionada no debe haber pagos, ni siquiera parciales. Selecciona una cuota posterior.');
  const periodos = PERIODOS_ANIO[frecuencia];
  if (!periodos) throw new ApiError(400, 'Frecuencia no válida.');
  let saldo = money(siguientes.reduce((s, q) => s + q.capital, 0));
  const nivelada = money(cuotaFija(saldo, tasaAnual / 100 / periodos, siguientes.length));
  const nuevas = siguientes.map((q, i) => {
    const ordinario = frecuencia === 'semanal' || frecuencia === 'quincenal'
      ? money(saldo * tasaAnual / 100 / periodos)
      : money(money(saldo * tasaAnual / 100 / 360) * (360 / periodos));
    const interes = money(ordinario + q.interesDiferido);
    const capital = i === siguientes.length - 1 ? saldo : tipo === 'cuota_fija'
      ? Math.min(saldo, Math.max(0, money(nivelada - ordinario))) : q.capital;
    saldo = money(saldo - capital);
    if (saldo < 0) throw new ApiError(400, 'El capital del calendario no cuadra.');
    return { ...q, capital, interes, monto: money(capital + interes + q.cargos), saldo };
  });
  return { cuotas: nuevas, totalAnterior: money(siguientes.reduce((s,q) => s + q.capital + q.interes + q.cargos, 0)), totalNuevo: money(nuevas.reduce((s,q) => s + q.monto, 0)) };
}
