import sql from 'mssql';
import { getAuthPool } from '../config/authDb';
import { ApiError } from '../middleware/errorHandler';

// Módulo de deuda propia: préstamos que la empresa RECIBE de bancos y otros
// acreedores. Las cuotas son obligaciones por pagar, no cuentas por cobrar.

import { calcularPlan, cuotaFija, money, PERIODOS_ANIO, PlanInput, CuotaCalculada, TipoAmortizacion, Frecuencia } from './amortizacion';
export { calcularPlan, FRECUENCIAS, TIPOS_AMORTIZACION } from './amortizacion';
export type { PlanInput } from './amortizacion';
export type Moneda = 'HNL' | 'USD';
export type ModoAbono = 'cuota' | 'plazo';
export const MONEDAS: Moneda[] = ['HNL', 'USD'];
export const TIPOS_ACREEDOR = ['banco', 'cooperativa', 'financiera', 'proveedor', 'persona', 'otro'];
export const METODOS_PAGO = ['transferencia', 'debito_automatico', 'cheque', 'efectivo', 'otro'];
export interface AcreedorInput { nombre: string; tipo: string; contacto?: string; telefono?: string; notas?: string }
export interface PrestamoInput extends PlanInput { acreedorId: number; moneda: Moneda; referencia?: string; fechaDesembolso: string; notas?: string }
export interface PagoInput { monto: number; fecha: string; metodo: string; referencia?: string; notas?: string }
const CAPITAL_PENDIENTE = `CASE WHEN q.pagado <= q.cargos + q.interes THEN q.capital ELSE q.monto - q.pagado END`;
const HOY = `CAST(GETDATE() AS date)`;

function generarCuotas(
  principal: number, rate: number, n: number, tipo: TipoAmortizacion, cargo: number, objetivo?: number,
): CuotaCalculada[] {
  const rows: CuotaCalculada[] = [];
  const nivelada = objetivo ?? (rate === 0 ? principal / n : cuotaFija(principal, rate, n));
  const capitalFijo = objetivo ?? principal / n;
  let balance = money(principal);
  for (let i = 1; i <= n && balance > 0; i += 1) {
    const interes = money(balance * rate);
    let capital = 0;
    if (i === n) capital = balance;
    else if (tipo === 'cuota_fija') capital = Math.min(balance, Math.max(0, money(nivelada - interes)));
    else if (tipo === 'capital_fijo') capital = Math.min(balance, money(capitalFijo));
    capital = money(capital);
    balance = money(balance - capital);
    rows.push({ capital, interes, cargos: money(cargo), monto: money(capital + interes + cargo) });
  }
  return rows;
}

export async function crearAcreedor(input: AcreedorInput, usuario: string) {
  const pool = await getAuthPool();
  try {
    const result = await pool.request()
      .input('nombre', sql.NVarChar(180), input.nombre)
      .input('tipo', sql.NVarChar(30), input.tipo)
      .input('contacto', sql.NVarChar(180), input.contacto || null)
      .input('telefono', sql.NVarChar(30), input.telefono || null)
      .input('notas', sql.NVarChar(1000), input.notas || null)
      .input('usuario', sql.NVarChar(60), usuario)
      .query(`INSERT INTO dbo.prestamos_acreedores (nombre, tipo, contacto, telefono, notas, creado_por)
        OUTPUT INSERTED.id VALUES (@nombre, @tipo, @contacto, @telefono, @notas, @usuario)`);
    return { id: Number(result.recordset[0].id) };
  } catch (error) {
    const code = (error as { number?: number }).number;
    if (code === 2601 || code === 2627) throw new ApiError(409, 'Ya existe un acreedor con ese nombre.');
    throw error;
  }
}

export async function editarAcreedor(id: number, input: AcreedorInput, usuario: string) {
  const pool = await getAuthPool();
  try {
    const result = await pool.request()
      .input('id', sql.BigInt, id)
      .input('nombre', sql.NVarChar(180), input.nombre)
      .input('tipo', sql.NVarChar(30), input.tipo)
      .input('contacto', sql.NVarChar(180), input.contacto || null)
      .input('telefono', sql.NVarChar(30), input.telefono || null)
      .input('notas', sql.NVarChar(1000), input.notas || null)
      .input('usuario', sql.NVarChar(60), usuario)
      .query(`UPDATE dbo.prestamos_acreedores SET nombre = @nombre, tipo = @tipo,
        contacto = @contacto, telefono = @telefono, notas = @notas,
        actualizado_en = SYSUTCDATETIME(), actualizado_por = @usuario
        WHERE id = @id AND eliminado_en IS NULL`);
    if (!result.rowsAffected[0]) throw new ApiError(404, 'Acreedor no encontrado.');
  } catch (error) {
    const code = (error as { number?: number }).number;
    if (code === 2601 || code === 2627) throw new ApiError(409, 'Ya existe un acreedor con ese nombre, incluso entre los eliminados.');
    throw error;
  }
}

export async function eliminarAcreedor(id: number, usuario: string) {
  const pool = await getAuthPool();
  const result = await pool.request().input('id', sql.BigInt, id)
    .input('usuario', sql.NVarChar(60), usuario)
    .query(`UPDATE dbo.prestamos_acreedores SET eliminado_en = SYSUTCDATETIME(), eliminado_por = @usuario
      WHERE id = @id AND eliminado_en IS NULL`);
  if (!result.rowsAffected[0]) throw new ApiError(404, 'Acreedor no encontrado.');
}

export async function listarAcreedores() {
  const pool = await getAuthPool();
  const saldo = (moneda: Moneda) => `ISNULL((SELECT SUM(${CAPITAL_PENDIENTE})
    FROM dbo.prestamos_cuotas q JOIN dbo.prestamos p ON p.id = q.prestamo_id
    WHERE q.eliminado_en IS NULL AND p.acreedor_id = a.id AND p.estado = N'activo' AND p.eliminado_en IS NULL AND p.moneda = N'${moneda}'), 0)`;
  const result = await pool.request().query(`
    SELECT a.id, a.nombre, a.tipo, a.contacto, a.telefono, a.notas,
      (SELECT COUNT(*) FROM dbo.prestamos p WHERE p.acreedor_id = a.id AND p.estado = N'activo' AND p.eliminado_en IS NULL) AS prestamosActivos,
      ${saldo('HNL')} AS saldoHNL,
      ${saldo('USD')} AS saldoUSD
    FROM dbo.prestamos_acreedores a
    WHERE a.eliminado_en IS NULL
    ORDER BY a.nombre`);
  return result.recordset;
}

export async function crearPrestamo(input: PrestamoInput, usuario: string) {
  return guardarPrestamo(input, usuario, calcularPlan(input));
}

export async function guardarPrestamo(input: PrestamoInput, usuario: string, plan: ReturnType<typeof calcularPlan>, externalTx?: sql.Transaction, origen = 'calculado') {
  const tx = externalTx ?? new sql.Transaction(await getAuthPool());
  if (!externalTx) await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const acreedor = await new sql.Request(tx).input('id', sql.BigInt, input.acreedorId)
      .query(`SELECT id FROM dbo.prestamos_acreedores WITH (UPDLOCK, HOLDLOCK) WHERE id = @id AND eliminado_en IS NULL`);
    if (!acreedor.recordset[0]) throw new ApiError(400, 'El acreedor seleccionado no existe.');
    const inserted = await new sql.Request(tx)
      .input('acreedorId', sql.BigInt, input.acreedorId)
      .input('referencia', sql.NVarChar(60), input.referencia || null)
      .input('moneda', sql.NVarChar(3), input.moneda)
      .input('monto', sql.Decimal(18, 2), input.monto)
      .input('tasa', sql.Decimal(9, 4), input.tasaAnual)
      .input('cantidad', sql.Int, input.cantidadCuotas)
      .input('frecuencia', sql.NVarChar(20), input.frecuencia)
      .input('tipo', sql.NVarChar(30), input.tipoAmortizacion)
      .input('desembolso', sql.Date, input.fechaDesembolso)
      .input('primera', sql.Date, input.fechaPrimeraCuota)
      .input('cargo', sql.Decimal(18, 2), input.cargoCuota)
      .input('notas', sql.NVarChar(1000), input.notas || null)
      .input('opciones', sql.NVarChar(sql.MAX), JSON.stringify(input.opciones ?? {}))
      .input('capitalizado', sql.Decimal(18, 2), plan.interesCapitalizado)
      .input('usuario', sql.NVarChar(60), usuario)
      .input('origen', sql.NVarChar(20), origen)
      .query(`INSERT INTO dbo.prestamos
        (acreedor_id, referencia, moneda, monto, tasa_anual, cantidad_cuotas, frecuencia, tipo_amortizacion,
         fecha_desembolso, fecha_primera_cuota, cargo_cuota, notas, creado_por, opciones_plan, interes_capitalizado, origen)
        OUTPUT INSERTED.id
        VALUES (@acreedorId, @referencia, @moneda, @monto, @tasa, @cantidad, @frecuencia, @tipo,
          @desembolso, @primera, @cargo, @notas, @usuario, @opciones, @capitalizado, @origen)`);
    const id = Number(inserted.recordset[0].id);
    await new sql.Request(tx).input('id', sql.BigInt, id)
      .query(`UPDATE dbo.prestamos SET numero = N'PRE-' + RIGHT(N'000000' + CONVERT(nvarchar(20), id), 6) WHERE id = @id`);
    for (const row of plan.cuotas) await insertarCuota(tx, id, row.numero, row.fechaVencimiento, row);
    if (!externalTx) await tx.commit();
    return { id, numero: `PRE-${String(id).padStart(6, '0')}`, ...plan };
  } catch (error) { if (!externalTx) await tx.rollback(); throw error; }
}

async function insertarCuota(tx: sql.Transaction, prestamoId: number, numero: number, fecha: string, row: CuotaCalculada & { concepto?: string }) {
  await new sql.Request(tx)
    .input('prestamoId', sql.BigInt, prestamoId).input('numero', sql.Int, numero).input('fecha', sql.Date, fecha)
    .input('capital', sql.Decimal(18, 2), row.capital).input('interes', sql.Decimal(18, 2), row.interes)
    .input('cargos', sql.Decimal(18, 2), row.cargos).input('monto', sql.Decimal(18, 2), row.monto)
    .input('concepto', sql.NVarChar(200), row.concepto ?? 'Cuota')
    .input('diferido', sql.Decimal(18, 2), row.interesDiferido ?? 0)
    .query(`INSERT INTO dbo.prestamos_cuotas (prestamo_id, numero, fecha_vencimiento, capital, interes, cargos, monto, concepto, interes_diferido)
      VALUES (@prestamoId, @numero, @fecha, @capital, @interes, @cargos, @monto, @concepto, @diferido)`);
}

export async function eliminarPrestamo(id: number, usuario: string) {
  const pool = await getAuthPool();
  const result = await pool.request().input('id', sql.BigInt, id)
    .input('usuario', sql.NVarChar(60), usuario)
    .query(`UPDATE dbo.prestamos SET eliminado_en = SYSUTCDATETIME(), eliminado_por = @usuario,
      actualizado_en = SYSUTCDATETIME() WHERE id = @id AND eliminado_en IS NULL`);
  if (!result.rowsAffected[0]) throw new ApiError(404, 'Préstamo no encontrado.');
}

export async function listarPrestamos() {
  const pool = await getAuthPool();
  const result = await pool.request().query(`
    SELECT p.id, p.numero, p.referencia, p.acreedor_id AS acreedorId, a.nombre AS acreedor, p.moneda, p.monto,
      p.tasa_anual AS tasaAnual, p.cantidad_cuotas AS cantidadCuotas, p.frecuencia,
      p.tipo_amortizacion AS tipoAmortizacion, CONVERT(varchar(10), p.fecha_desembolso, 23) AS fechaDesembolso,
      p.estado, p.opciones_plan AS opcionesPlan, ISNULL(x.saldoCapital, 0) AS saldoCapital, ISNULL(x.totalPendiente, 0) AS totalPendiente,
      ISNULL(x.cuotasPendientes, 0) AS cuotasPendientes, ISNULL(x.cuotasVencidas, 0) AS cuotasVencidas,
      ISNULL(x.vencido, 0) AS vencido, ISNULL(x.capitalSinPagos, 0) AS capitalSinPagos,
      ISNULL(pg.pagado, 0) AS pagado, n.proximaFecha, n.proximaCuota
    FROM dbo.prestamos p
    JOIN dbo.prestamos_acreedores a ON a.id = p.acreedor_id
    LEFT JOIN (SELECT prestamo_id, SUM(monto) pagado FROM dbo.prestamos_pagos GROUP BY prestamo_id) pg ON pg.prestamo_id = p.id
    OUTER APPLY (
      SELECT SUM(${CAPITAL_PENDIENTE}) saldoCapital, SUM(q.monto - q.pagado) totalPendiente, COUNT(*) cuotasPendientes,
        SUM(CASE WHEN q.fecha_vencimiento < ${HOY} THEN 1 ELSE 0 END) cuotasVencidas,
        SUM(CASE WHEN q.fecha_vencimiento < ${HOY} THEN q.monto - q.pagado ELSE 0 END) vencido,
        SUM(CASE WHEN q.pagado = 0 THEN q.capital ELSE 0 END) capitalSinPagos
      FROM dbo.prestamos_cuotas q WHERE q.eliminado_en IS NULL AND q.prestamo_id = p.id AND q.pagado < q.monto) x
    OUTER APPLY (
      SELECT TOP 1 CONVERT(varchar(10), q.fecha_vencimiento, 23) proximaFecha, q.monto - q.pagado proximaCuota
      FROM dbo.prestamos_cuotas q WHERE q.eliminado_en IS NULL AND q.prestamo_id = p.id AND q.pagado < q.monto ORDER BY q.numero) n
    WHERE p.eliminado_en IS NULL
    ORDER BY CASE WHEN p.estado = N'activo' THEN 0 ELSE 1 END, a.nombre, p.id DESC`);
  return result.recordset.map(row => ({ ...row,
    permiteReducirPlazo: ['cuota_fija', 'capital_fijo'].includes(row.tipoAmortizacion) && !JSON.parse(row.opcionesPlan ?? '{}').gracia,
  }));
}

export async function obtenerPrestamo(id: number) {
  const pool = await getAuthPool();
  const [loans, installments, payments, history] = await Promise.all([
    pool.request().input('id', sql.BigInt, id).query(`
      SELECT p.id, p.numero, p.referencia, a.nombre AS acreedor, p.moneda, p.monto, p.tasa_anual AS tasaAnual,
        p.cantidad_cuotas AS cantidadCuotas, p.frecuencia, p.tipo_amortizacion AS tipoAmortizacion,
        CONVERT(varchar(10), p.fecha_desembolso, 23) AS fechaDesembolso, p.notas, p.estado, p.opciones_plan AS opcionesPlan, p.interes_capitalizado AS interesCapitalizado,
        p.creado_por AS creadoPor, p.creado_en AS creadoEn, p.origen
      FROM dbo.prestamos p JOIN dbo.prestamos_acreedores a ON a.id = p.acreedor_id WHERE p.id = @id AND p.eliminado_en IS NULL`),
    pool.request().input('id', sql.BigInt, id).query(`
      SELECT id, numero, CONVERT(varchar(10), fecha_vencimiento, 23) AS fechaVencimiento,
        capital, interes, cargos, monto, pagado, estado, concepto, interes_diferido AS interesDiferido
      FROM dbo.prestamos_cuotas WHERE eliminado_en IS NULL AND prestamo_id = @id ORDER BY numero`),
    pool.request().input('id', sql.BigInt, id).query(`
      SELECT id, numero, tipo, CONVERT(varchar(10), fecha_pago, 23) AS fecha, monto, metodo, referencia, notas,
        creado_por AS creadoPor
      FROM dbo.prestamos_pagos WHERE prestamo_id = @id ORDER BY fecha_pago DESC, id DESC`),
    pool.request().input('id', sql.BigInt, id).query(`
      SELECT id, numero, CONVERT(varchar(10), fecha_vencimiento, 23) AS fechaVencimiento,
        capital, interes, cargos, monto, pagado, estado, concepto, interes_diferido AS interesDiferido,
        eliminado_en AS reemplazadaEn, eliminado_por AS reemplazadaPor, motivo_reemplazo AS motivo
      FROM dbo.prestamos_cuotas WHERE prestamo_id = @id AND eliminado_en IS NOT NULL ORDER BY eliminado_en DESC, numero`),
  ]);
  const prestamo = loans.recordset[0] ?? null;
  if (prestamo) prestamo.opciones = JSON.parse(prestamo.opcionesPlan ?? '{}');
  // El calendario es editable: avisa cuando su capital (más los abonos) deja de cuadrar con el monto recibido.
  const capitalCalendario = installments.recordset.reduce((sum, row) => sum + Number(row.capital), 0);
  const abonos = payments.recordset.filter((row) => row.tipo === 'abono_capital').reduce((sum, row) => sum + Number(row.monto), 0);
  const diferenciaCapital = prestamo ? money(capitalCalendario + abonos - Number(prestamo.monto) - Number(prestamo.interesCapitalizado)) : 0;
  return { prestamo, cuotas: installments.recordset, historialCuotas: history.recordset, pagos: payments.recordset, diferenciaCapital };
}

async function prestamoActivo(tx: sql.Transaction, prestamoId: number) {
  const loan = await new sql.Request(tx).input('id', sql.BigInt, prestamoId).query(`
    SELECT id, tasa_anual, frecuencia, tipo_amortizacion, estado, opciones_plan
    FROM dbo.prestamos WITH (UPDLOCK, HOLDLOCK) WHERE id = @id AND eliminado_en IS NULL`);
  const row = loan.recordset[0];
  if (!row) throw new ApiError(404, 'Préstamo no encontrado.');
  if (row.estado !== 'activo') throw new ApiError(400, 'El préstamo no está activo.');
  return row;
}

async function insertarPago(tx: sql.Transaction, prestamoId: number, tipo: 'cuota' | 'abono_capital', input: PagoInput, usuario: string) {
  const payment = await new sql.Request(tx)
    .input('prestamoId', sql.BigInt, prestamoId).input('tipo', sql.NVarChar(20), tipo)
    .input('fecha', sql.Date, input.fecha).input('monto', sql.Decimal(18, 2), input.monto)
    .input('metodo', sql.NVarChar(30), input.metodo).input('referencia', sql.NVarChar(100), input.referencia || null)
    .input('notas', sql.NVarChar(500), input.notas || null).input('usuario', sql.NVarChar(60), usuario)
    .query(`INSERT INTO dbo.prestamos_pagos (prestamo_id, tipo, fecha_pago, monto, metodo, referencia, notas, creado_por)
      OUTPUT INSERTED.id VALUES (@prestamoId, @tipo, @fecha, @monto, @metodo, @referencia, @notas, @usuario)`);
  const id = Number(payment.recordset[0].id);
  await new sql.Request(tx).input('id', sql.BigInt, id)
    .query(`UPDATE dbo.prestamos_pagos SET numero = N'PAG-' + RIGHT(N'000000' + CONVERT(nvarchar(20), id), 6) WHERE id = @id`);
  return { id, numero: `PAG-${String(id).padStart(6, '0')}` };
}

async function liquidarSiCorresponde(tx: sql.Transaction, prestamoId: number): Promise<boolean> {
  const result = await new sql.Request(tx).input('id', sql.BigInt, prestamoId).query(`
    UPDATE dbo.prestamos SET estado = N'pagado', actualizado_en = SYSUTCDATETIME()
    WHERE id = @id AND NOT EXISTS (SELECT 1 FROM dbo.prestamos_cuotas WHERE eliminado_en IS NULL AND prestamo_id = @id AND pagado < monto)`);
  return result.rowsAffected[0] > 0;
}

/** Pago de cuotas: se aplica en cascada desde la cuota pendiente más antigua. */
export async function registrarPago(prestamoId: number, input: PagoInput, usuario: string) {
  const pool = await getAuthPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await prestamoActivo(tx, prestamoId);
    const installments = await new sql.Request(tx).input('id', sql.BigInt, prestamoId).query(`
      SELECT id, capital, interes, cargos, monto, pagado FROM dbo.prestamos_cuotas WITH (UPDLOCK)
      WHERE eliminado_en IS NULL AND prestamo_id = @id AND pagado < monto ORDER BY numero`);
    const pendiente = money(installments.recordset.reduce((sum, q) => sum + Number(q.monto) - Number(q.pagado), 0));
    if (input.monto > pendiente + 0.001) {
      throw new ApiError(400, `El pago no puede superar lo pendiente del calendario (${pendiente.toFixed(2)}). Para adelantar capital usa un abono a capital.`);
    }
    const pago = await insertarPago(tx, prestamoId, 'cuota', input, usuario);
    let remaining = money(input.monto);
    for (const q of installments.recordset) {
      if (remaining <= 0) break;
      const previo = Number(q.pagado);
      const aplicado = money(Math.min(remaining, Number(q.monto) - previo));
      const nuevo = money(previo + aplicado);
      // Reparto del tramo aplicado: cargos → interés → capital.
      const topeCargos = Number(q.cargos);
      const topeInteres = topeCargos + Number(q.interes);
      const cargos = money(Math.min(nuevo, topeCargos) - Math.min(previo, topeCargos));
      const interes = money(Math.min(nuevo, topeInteres) - Math.min(previo, topeInteres));
      const capital = money(aplicado - cargos - interes);
      await new sql.Request(tx).input('cuotaId', sql.BigInt, q.id).input('pagado', sql.Decimal(18, 2), nuevo)
        .input('estado', sql.NVarChar(20), nuevo >= Number(q.monto) - 0.001 ? 'pagada' : 'parcial')
        .query(`UPDATE dbo.prestamos_cuotas SET pagado = @pagado, estado = @estado WHERE id = @cuotaId`);
      await new sql.Request(tx).input('pagoId', sql.BigInt, pago.id).input('cuotaId', sql.BigInt, q.id)
        .input('monto', sql.Decimal(18, 2), aplicado).input('capital', sql.Decimal(18, 2), capital)
        .input('interes', sql.Decimal(18, 2), interes).input('cargos', sql.Decimal(18, 2), cargos)
        .query(`INSERT INTO dbo.prestamos_pago_aplicaciones (pago_id, cuota_id, monto, capital, interes, cargos)
          VALUES (@pagoId, @cuotaId, @monto, @capital, @interes, @cargos)`);
      remaining = money(remaining - aplicado);
    }
    const liquidado = await liquidarSiCorresponde(tx, prestamoId);
    await tx.commit();
    return { ...pago, pendiente: money(pendiente - input.monto), liquidado };
  } catch (error) { await tx.rollback(); throw error; }
}

/**
 * Abono extra a capital: reduce el capital de las cuotas que aún no tienen
 * pagos y las recalcula con la tasa del préstamo. `cuota` conserva el plazo y
 * baja la cuota; `plazo` conserva la cuota y elimina las últimas.
 */
export async function registrarAbono(prestamoId: number, input: PagoInput, modo: ModoAbono, usuario: string) {
  const pool = await getAuthPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const loan = await prestamoActivo(tx, prestamoId);
    const pending = await new sql.Request(tx).input('id', sql.BigInt, prestamoId).query(`
      SELECT id, numero, CONVERT(varchar(10), fecha_vencimiento, 23) AS fecha, capital, interes, cargos, interes_diferido AS interesDiferido
      FROM dbo.prestamos_cuotas WITH (UPDLOCK) WHERE eliminado_en IS NULL AND prestamo_id = @id AND pagado = 0 AND monto > 0 ORDER BY numero`);
    const cuotas = pending.recordset;
    const capital = money(cuotas.reduce((sum, q) => sum + Number(q.capital), 0));
    if (!cuotas.length || capital <= 0) throw new ApiError(400, 'No hay cuotas sin pagos a las que aplicar el abono.');
    if (input.monto > capital + 0.001) {
      throw new ApiError(400, `El abono no puede superar el capital de las cuotas sin pagos (${capital.toFixed(2)}).`);
    }
    const tipo = loan.tipo_amortizacion as TipoAmortizacion;
    const opciones = JSON.parse(loan.opciones_plan ?? '{}');
    const tradicional = ['cuota_fija', 'capital_fijo', 'solo_interes'].includes(tipo) && !opciones.gracia;
    if (modo === 'plazo' && (!tradicional || tipo === 'solo_interes')) {
      throw new ApiError(400, 'Este plan conserva sus fechas y su estructura. Usa reducir cuota; para cambiar el plazo se requiere reprogramar el calendario.');
    }
    const pago = await insertarPago(tx, prestamoId, 'abono_capital', input, usuario);
    const nuevoCapital = money(capital - input.monto);
    const rate = Number(loan.tasa_anual) / 100 / PERIODOS_ANIO[loan.frecuencia as Frecuencia];
    let objetivo: number | undefined;
    if (modo === 'plazo' && tipo === 'cuota_fija') objetivo = Number(cuotas[0].capital) + Number(cuotas[0].interes);
    if (modo === 'plazo' && tipo === 'capital_fijo') objetivo = Number(cuotas[0].capital);
    let acumulado = 0, asignado = 0;
    const nuevas: CuotaCalculada[] = nuevoCapital <= 0 && tipo !== 'manual' && !cuotas.some(q => Number(q.interesDiferido) > 0) ? [] : tradicional
      ? generarCuotas(nuevoCapital, rate, cuotas.length, tipo, 0, objetivo)
      : cuotas.map(q => {
        // Preserva fechas y forma del plan (balón, índice, extras o manual).
        // Redondeo acumulado para que el capital cuadre exactamente al centavo.
        acumulado = money(acumulado + Number(q.capital));
        const destino = money(acumulado * nuevoCapital / capital);
        const capitalCuota = money(destino - asignado); asignado = destino;
        const interesDiferido = Number(q.interesDiferido);
        const interes = tipo === 'manual' ? Number(q.interes) : money(interesDiferido + (Number(q.interes) - interesDiferido) * nuevoCapital / capital);
        return { capital: capitalCuota, interes, interesDiferido, cargos: 0, monto: money(capitalCuota + interes) };
      });
    await new sql.Request(tx).input('id', sql.BigInt, prestamoId).input('usuario', sql.NVarChar(60), usuario)
      .query(`UPDATE dbo.prestamos_cuotas SET eliminado_en = SYSUTCDATETIME(), eliminado_por = @usuario,
        motivo_reemplazo = N'Abono a capital'
        WHERE eliminado_en IS NULL AND prestamo_id = @id AND pagado = 0 AND monto > 0`);
    for (let i = 0; i < nuevas.length; i += 1) {
      const cargos = Number(cuotas[i].cargos);
      await insertarCuota(tx, prestamoId, cuotas[i].numero, cuotas[i].fecha,
        { ...nuevas[i], cargos, monto: money(nuevas[i].capital + nuevas[i].interes + cargos), concepto: 'Recalculada por abono a capital' });
    }
    const liquidado = await liquidarSiCorresponde(tx, prestamoId);
    await tx.commit();
    return { ...pago, capitalRestante: nuevoCapital, cuotasRestantes: nuevas.length, liquidado };
  } catch (error) { await tx.rollback(); throw error; }
}

/** Ajuste manual de una cuota sin pagos, para igualar la tabla que entrega el banco. */
export async function editarCuota(
  prestamoId: number, cuotaId: number,
  input: { fechaVencimiento: string; capital: number; interes: number; cargos: number }, usuario: string,
) {
  const pool = await getAuthPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await prestamoActivo(tx, prestamoId);
    const result = await new sql.Request(tx).input('prestamoId', sql.BigInt, prestamoId)
      .input('cuotaId', sql.BigInt, cuotaId).input('usuario', sql.NVarChar(60), usuario)
      .query(`UPDATE dbo.prestamos_cuotas SET eliminado_en = SYSUTCDATETIME(), eliminado_por = @usuario,
        motivo_reemplazo = N'Ajuste manual'
        OUTPUT INSERTED.numero, INSERTED.interes_diferido AS interesDiferido
        WHERE id = @cuotaId AND prestamo_id = @prestamoId AND pagado = 0 AND eliminado_en IS NULL`);
    if (!result.recordset[0]) throw new ApiError(400, 'Solo se pueden editar cuotas vigentes sin pagos de un préstamo activo.');
    if (input.interes < Number(result.recordset[0].interesDiferido)) throw new ApiError(400, 'El interés de la cuota no puede ser menor que el interés diferido ya pactado.');
    await insertarCuota(tx, prestamoId, result.recordset[0].numero, input.fechaVencimiento,
      { ...input, interesDiferido: Number(result.recordset[0].interesDiferido), monto: money(input.capital + input.interes + input.cargos), concepto: 'Ajuste manual' });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; }
}

export async function resumen() {
  const pool = await getAuthPool();
  const [deuda, pagado, acreedores, agenda, recientes] = await Promise.all([
    pool.request().query(`
      SELECT p.moneda, COUNT(DISTINCT p.id) AS prestamos, SUM(${CAPITAL_PENDIENTE}) AS saldoCapital,
        SUM(q.monto - q.pagado) AS totalPendiente,
        SUM(CASE WHEN q.fecha_vencimiento < ${HOY} THEN q.monto - q.pagado ELSE 0 END) AS vencido,
        SUM(CASE WHEN q.fecha_vencimiento BETWEEN ${HOY} AND DATEADD(day, 30, ${HOY}) THEN q.monto - q.pagado ELSE 0 END) AS proximos30
      FROM dbo.prestamos p JOIN dbo.prestamos_cuotas q ON q.prestamo_id = p.id AND q.eliminado_en IS NULL
      WHERE q.eliminado_en IS NULL AND p.estado = N'activo' AND p.eliminado_en IS NULL AND q.pagado < q.monto
      GROUP BY p.moneda`),
    pool.request().query(`
      SELECT p.moneda,
        SUM(CASE WHEN pg.tipo = N'abono_capital' THEN pg.monto ELSE ISNULL(a.capital, 0) END) AS capitalPagado,
        SUM(ISNULL(a.interes, 0)) AS interesPagado, SUM(ISNULL(a.cargos, 0)) AS cargosPagados
      FROM dbo.prestamos_pagos pg JOIN dbo.prestamos p ON p.id = pg.prestamo_id
      LEFT JOIN (SELECT pago_id, SUM(capital) capital, SUM(interes) interes, SUM(cargos) cargos
        FROM dbo.prestamos_pago_aplicaciones GROUP BY pago_id) a ON a.pago_id = pg.id
      WHERE p.eliminado_en IS NULL
      GROUP BY p.moneda`),
    pool.request().query(`
      SELECT a.id AS acreedorId, a.nombre AS acreedor, p.moneda, COUNT(*) AS prestamos, SUM(p.monto) AS montoOriginal,
        SUM(ISNULL(x.saldoCapital, 0)) AS saldoCapital, SUM(ISNULL(x.totalPendiente, 0)) AS totalPendiente,
        SUM(ISNULL(x.vencido, 0)) AS vencido, CONVERT(varchar(10), MIN(x.proximaFecha), 23) AS proximaFecha
      FROM dbo.prestamos p JOIN dbo.prestamos_acreedores a ON a.id = p.acreedor_id
      OUTER APPLY (
        SELECT SUM(${CAPITAL_PENDIENTE}) saldoCapital, SUM(q.monto - q.pagado) totalPendiente,
          SUM(CASE WHEN q.fecha_vencimiento < ${HOY} THEN q.monto - q.pagado ELSE 0 END) vencido,
          MIN(q.fecha_vencimiento) proximaFecha
        FROM dbo.prestamos_cuotas q WHERE q.eliminado_en IS NULL AND q.prestamo_id = p.id AND q.pagado < q.monto) x
      WHERE p.estado = N'activo' AND p.eliminado_en IS NULL
      GROUP BY a.id, a.nombre, p.moneda
      ORDER BY p.moneda, saldoCapital DESC`),
    pool.request().query(`
      SELECT q.id AS cuotaId, p.id AS prestamoId, p.numero, a.nombre AS acreedor, p.moneda, q.numero AS cuota,
        CONVERT(varchar(10), q.fecha_vencimiento, 23) AS fechaVencimiento, q.monto - q.pagado AS pendiente,
        DATEDIFF(day, q.fecha_vencimiento, ${HOY}) AS diasAtraso
      FROM dbo.prestamos_cuotas q JOIN dbo.prestamos p ON p.id = q.prestamo_id
      JOIN dbo.prestamos_acreedores a ON a.id = p.acreedor_id
      WHERE q.eliminado_en IS NULL AND p.estado = N'activo' AND p.eliminado_en IS NULL AND q.pagado < q.monto AND q.fecha_vencimiento <= DATEADD(day, 30, ${HOY})
      ORDER BY q.fecha_vencimiento, a.nombre`),
    pool.request().query(`
      SELECT TOP 15 pg.id, pg.numero, pg.tipo, CONVERT(varchar(10), pg.fecha_pago, 23) AS fecha, a.nombre AS acreedor,
        p.numero AS prestamo, p.moneda, pg.monto, pg.creado_por AS creadoPor
      FROM dbo.prestamos_pagos pg JOIN dbo.prestamos p ON p.id = pg.prestamo_id
      JOIN dbo.prestamos_acreedores a ON a.id = p.acreedor_id
      WHERE p.eliminado_en IS NULL
      ORDER BY pg.fecha_pago DESC, pg.id DESC`),
  ]);
  const monedas = MONEDAS.map((moneda) => {
    const d = deuda.recordset.find((row) => row.moneda === moneda);
    const g = pagado.recordset.find((row) => row.moneda === moneda);
    return {
      moneda,
      prestamos: Number(d?.prestamos ?? 0),
      saldoCapital: Number(d?.saldoCapital ?? 0),
      totalPendiente: Number(d?.totalPendiente ?? 0),
      vencido: Number(d?.vencido ?? 0),
      proximos30: Number(d?.proximos30 ?? 0),
      capitalPagado: Number(g?.capitalPagado ?? 0),
      interesPagado: Number(g?.interesPagado ?? 0),
      cargosPagados: Number(g?.cargosPagados ?? 0),
    };
  }).filter((row) => row.prestamos > 0 || row.capitalPagado > 0 || row.interesPagado > 0);
  return { monedas, porAcreedor: acreedores.recordset, agenda: agenda.recordset, pagosRecientes: recientes.recordset };
}

/** Pagos realizados en el rango, con su reparto entre capital, interés y cargos. */
export async function reporte(desde: string, hasta: string) {
  const pool = await getAuthPool();
  const result = await pool.request().input('desde', sql.Date, desde).input('hasta', sql.Date, hasta).query(`
    SELECT pg.id, pg.numero, pg.tipo, CONVERT(varchar(10), pg.fecha_pago, 23) AS fecha, a.nombre AS acreedor,
      p.numero AS prestamo, p.referencia, p.moneda, pg.monto,
      CASE WHEN pg.tipo = N'abono_capital' THEN pg.monto ELSE ISNULL(x.capital, 0) END AS capital,
      ISNULL(x.interes, 0) AS interes, ISNULL(x.cargos, 0) AS cargos,
      pg.metodo, pg.referencia AS comprobante, pg.creado_por AS creadoPor
    FROM dbo.prestamos_pagos pg JOIN dbo.prestamos p ON p.id = pg.prestamo_id
    JOIN dbo.prestamos_acreedores a ON a.id = p.acreedor_id
    LEFT JOIN (SELECT pago_id, SUM(capital) capital, SUM(interes) interes, SUM(cargos) cargos
      FROM dbo.prestamos_pago_aplicaciones GROUP BY pago_id) x ON x.pago_id = pg.id
    WHERE p.eliminado_en IS NULL AND pg.fecha_pago BETWEEN @desde AND @hasta
    ORDER BY pg.fecha_pago DESC, pg.id DESC`);
  return result.recordset;
}
