import sql from 'mssql';
import { getAuthPool } from '../config/authDb';

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const isoDate = (value: unknown) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value ?? '').slice(0, 10);

export interface ClienteInput {
  nombre: string; identidad?: string; telefono: string; telefonoAlterno?: string;
  direccion?: string; correo?: string; referenciaNombre?: string;
  referenciaTelefono?: string; notas?: string;
}

export interface PrestamoInput {
  clienteId: number; monto: number; tasaPeriodo: number; cantidadCuotas: number;
  frecuencia: 'diario' | 'semanal' | 'quincenal' | 'mensual';
  tipoAmortizacion: 'cuota_fija' | 'interes_fijo' | 'solo_interes';
  fechaDesembolso: string; fechaPrimeraCuota: string; recargoDiario?: number; notas?: string;
}

async function actualizarRecargos(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    UPDATE q SET
      recargo = ROUND(DATEDIFF(day, q.fecha_vencimiento, CAST(GETDATE() AS date)) * p.recargo_diario, 2),
      monto = q.capital + q.interes + ROUND(DATEDIFF(day, q.fecha_vencimiento, CAST(GETDATE() AS date)) * p.recargo_diario, 2)
    FROM dbo.prestamos_cuotas q
    JOIN dbo.prestamos p ON p.id = q.prestamo_id
    WHERE p.estado = N'activo' AND q.estado <> N'pagada'
      AND q.fecha_vencimiento < CAST(GETDATE() AS date) AND p.recargo_diario > 0;

    UPDATE p SET total_pagar = x.total
    FROM dbo.prestamos p
    JOIN (SELECT prestamo_id, SUM(monto) total FROM dbo.prestamos_cuotas GROUP BY prestamo_id) x
      ON x.prestamo_id = p.id
    WHERE p.estado = N'activo';
  `);
}

function addPeriod(date: Date, frequency: PrestamoInput['frecuencia'], index: number): Date {
  const next = new Date(date);
  if (frequency === 'diario') next.setUTCDate(next.getUTCDate() + index);
  if (frequency === 'semanal') next.setUTCDate(next.getUTCDate() + index * 7);
  if (frequency === 'quincenal') next.setUTCDate(next.getUTCDate() + index * 15);
  if (frequency === 'mensual') next.setUTCMonth(next.getUTCMonth() + index);
  return next;
}

export function calcularPlan(input: PrestamoInput) {
  const principal = money(input.monto);
  const rate = input.tasaPeriodo / 100;
  const n = input.cantidadCuotas;
  const first = new Date(`${input.fechaPrimeraCuota}T00:00:00Z`);
  let balance = principal;
  const rows: { numero: number; fechaVencimiento: string; capital: number; interes: number; monto: number }[] = [];
  const fixedPayment = rate === 0 ? principal / n : principal * (rate * (1 + rate) ** n) / ((1 + rate) ** n - 1);
  const flatInterest = principal * rate;
  for (let i = 1; i <= n; i += 1) {
    let interest = 0;
    let capital = 0;
    if (input.tipoAmortizacion === 'cuota_fija') {
      interest = balance * rate;
      capital = i === n ? balance : fixedPayment - interest;
    } else if (input.tipoAmortizacion === 'interes_fijo') {
      interest = flatInterest;
      capital = i === n ? balance : principal / n;
    } else {
      interest = flatInterest;
      capital = i === n ? balance : 0;
    }
    capital = money(capital);
    interest = money(interest);
    balance = money(Math.max(0, balance - capital));
    rows.push({
      numero: i,
      fechaVencimiento: addPeriod(first, input.frecuencia, i - 1).toISOString().slice(0, 10),
      capital,
      interes: interest,
      monto: money(capital + interest),
    });
  }
  const totalInteres = money(rows.reduce((sum, row) => sum + row.interes, 0));
  const totalPagar = money(rows.reduce((sum, row) => sum + row.monto, 0));
  return { cuotas: rows, totalInteres, totalPagar, cuotaEstimada: rows[0]?.monto ?? 0 };
}

export async function crearCliente(input: ClienteInput) {
  const pool = await getAuthPool();
  const result = await pool.request()
    .input('nombre', sql.NVarChar(180), input.nombre.trim())
    .input('identidad', sql.NVarChar(30), input.identidad?.trim() || null)
    .input('telefono', sql.NVarChar(30), input.telefono.trim())
    .input('telefonoAlterno', sql.NVarChar(30), input.telefonoAlterno?.trim() || null)
    .input('direccion', sql.NVarChar(500), input.direccion?.trim() || null)
    .input('correo', sql.NVarChar(254), input.correo?.trim().toLowerCase() || null)
    .input('referenciaNombre', sql.NVarChar(180), input.referenciaNombre?.trim() || null)
    .input('referenciaTelefono', sql.NVarChar(30), input.referenciaTelefono?.trim() || null)
    .input('notas', sql.NVarChar(1000), input.notas?.trim() || null)
    .query(`INSERT INTO dbo.prestamos_clientes
      (nombre, identidad, telefono, telefono_alterno, direccion, correo, referencia_nombre, referencia_telefono, notas)
      OUTPUT INSERTED.id VALUES (@nombre,@identidad,@telefono,@telefonoAlterno,@direccion,@correo,@referenciaNombre,@referenciaTelefono,@notas)`);
  return { id: Number(result.recordset[0].id) };
}

export async function listarClientes() {
  const pool = await getAuthPool();
  await actualizarRecargos(pool);
  const result = await pool.request().query(`SELECT c.id, c.nombre, c.identidad, c.telefono,
    c.telefono_alterno AS telefonoAlterno, c.direccion, c.correo, c.referencia_nombre AS referenciaNombre,
    c.referencia_telefono AS referenciaTelefono, c.notas, c.activo,
    COUNT(p.id) AS cantidadPrestamos,
    ISNULL(SUM(CASE WHEN p.estado = N'activo' THEN p.total_pagar - ISNULL(pg.pagado,0) ELSE 0 END),0) AS saldoPendiente
    FROM dbo.prestamos_clientes c
    LEFT JOIN dbo.prestamos p ON p.cliente_id=c.id
    LEFT JOIN (SELECT prestamo_id,SUM(monto) pagado FROM dbo.prestamos_pagos GROUP BY prestamo_id) pg ON pg.prestamo_id=p.id
    GROUP BY c.id,c.nombre,c.identidad,c.telefono,c.telefono_alterno,c.direccion,c.correo,c.referencia_nombre,c.referencia_telefono,c.notas,c.activo
    ORDER BY c.nombre`);
  return result.recordset;
}

export async function crearPrestamo(input: PrestamoInput) {
  const plan = calcularPlan(input);
  const pool = await getAuthPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const inserted = await new sql.Request(tx)
      .input('clienteId', sql.BigInt, input.clienteId).input('monto', sql.Decimal(18,2), input.monto)
      .input('tasa', sql.Decimal(9,4), input.tasaPeriodo).input('cantidad', sql.Int, input.cantidadCuotas)
      .input('frecuencia', sql.NVarChar(20), input.frecuencia).input('tipo', sql.NVarChar(30), input.tipoAmortizacion)
      .input('desembolso', sql.Date, input.fechaDesembolso).input('primera', sql.Date, input.fechaPrimeraCuota)
      .input('interes', sql.Decimal(18,2), plan.totalInteres).input('total', sql.Decimal(18,2), plan.totalPagar)
      .input('cuota', sql.Decimal(18,2), plan.cuotaEstimada).input('recargo', sql.Decimal(18,2), input.recargoDiario ?? 0)
      .input('notas', sql.NVarChar(1000), input.notas?.trim() || null)
      .query(`INSERT INTO dbo.prestamos
        (cliente_id,monto,tasa_periodo,cantidad_cuotas,frecuencia,tipo_amortizacion,fecha_desembolso,fecha_primera_cuota,total_interes,total_pagar,cuota_estimada,recargo_diario,notas)
        OUTPUT INSERTED.id VALUES (@clienteId,@monto,@tasa,@cantidad,@frecuencia,@tipo,@desembolso,@primera,@interes,@total,@cuota,@recargo,@notas)`);
    const id = Number(inserted.recordset[0].id);
    await new sql.Request(tx).input('id', sql.BigInt, id).query(`UPDATE dbo.prestamos SET numero=N'PRE-'+RIGHT(N'000000'+CONVERT(nvarchar(20),id),6) WHERE id=@id`);
    for (const row of plan.cuotas) {
      await new sql.Request(tx).input('prestamoId', sql.BigInt, id).input('numero', sql.Int, row.numero)
        .input('fecha', sql.Date, row.fechaVencimiento).input('capital', sql.Decimal(18,2), row.capital)
        .input('interes', sql.Decimal(18,2), row.interes).input('monto', sql.Decimal(18,2), row.monto)
        .query(`INSERT INTO dbo.prestamos_cuotas(prestamo_id,numero,fecha_vencimiento,capital,interes,monto)
          VALUES(@prestamoId,@numero,@fecha,@capital,@interes,@monto)`);
    }
    await tx.commit();
    return { id, numero: `PRE-${String(id).padStart(6, '0')}`, ...plan };
  } catch (error) { await tx.rollback(); throw error; }
}

export async function listarPrestamos() {
  const pool = await getAuthPool();
  await actualizarRecargos(pool);
  const result = await pool.request().query(`SELECT p.id,p.numero,p.cliente_id AS clienteId,c.nombre AS cliente,c.telefono,
    p.monto,p.tasa_periodo AS tasaPeriodo,p.cantidad_cuotas AS cantidadCuotas,p.frecuencia,p.tipo_amortizacion AS tipoAmortizacion,
    CONVERT(varchar(10),p.fecha_desembolso,23) AS fechaDesembolso,CONVERT(varchar(10),p.fecha_primera_cuota,23) AS fechaPrimeraCuota,
    p.total_interes AS totalInteres,p.total_pagar AS totalPagar,p.cuota_estimada AS cuotaEstimada,p.recargo_diario AS recargoDiario,
    p.estado,ISNULL(pg.pagado,0) AS pagado,p.total_pagar-ISNULL(pg.pagado,0) AS saldo,
    ISNULL(v.cuotasVencidas,0) AS cuotasVencidas,ISNULL(v.diasMora,0) AS diasMora,v.proximoVencimiento
    FROM dbo.prestamos p JOIN dbo.prestamos_clientes c ON c.id=p.cliente_id
    LEFT JOIN (SELECT prestamo_id,SUM(monto) pagado FROM dbo.prestamos_pagos GROUP BY prestamo_id) pg ON pg.prestamo_id=p.id
    OUTER APPLY (SELECT COUNT(*) cuotasVencidas,
      ISNULL(DATEDIFF(day,MIN(fecha_vencimiento),CAST(GETDATE() AS date)),0) diasMora,
      CONVERT(varchar(10),MIN(CASE WHEN pagado<monto THEN fecha_vencimiento END),23) proximoVencimiento
      FROM dbo.prestamos_cuotas q WHERE q.prestamo_id=p.id AND q.pagado<q.monto AND q.fecha_vencimiento<CAST(GETDATE() AS date)) v
    ORDER BY CASE WHEN p.estado=N'activo' THEN 0 ELSE 1 END,p.id DESC`);
  return result.recordset;
}

export async function obtenerPrestamo(id: number) {
  const pool = await getAuthPool();
  const [loans, installments, payments] = await Promise.all([
    pool.request().input('id',sql.BigInt,id).query(`SELECT p.*,c.nombre cliente,c.telefono FROM dbo.prestamos p JOIN dbo.prestamos_clientes c ON c.id=p.cliente_id WHERE p.id=@id`),
    pool.request().input('id',sql.BigInt,id).query(`SELECT id,numero,CONVERT(varchar(10),fecha_vencimiento,23) fechaVencimiento,capital,interes,recargo,monto,pagado,estado FROM dbo.prestamos_cuotas WHERE prestamo_id=@id ORDER BY numero`),
    pool.request().input('id',sql.BigInt,id).query(`SELECT id,numero,monto,metodo,referencia,notas,creado_en AS creadoEn FROM dbo.prestamos_pagos WHERE prestamo_id=@id ORDER BY id DESC`),
  ]);
  return { prestamo: loans.recordset[0] ?? null, cuotas: installments.recordset, pagos: payments.recordset };
}

export async function registrarPago(prestamoId: number, monto: number, metodo: string, referencia?: string, notas?: string) {
  const pool = await getAuthPool();
  const tx = new sql.Transaction(pool); await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await new sql.Request(tx).input('id', sql.BigInt, prestamoId).query(`
      UPDATE q SET
        recargo=ROUND(DATEDIFF(day,q.fecha_vencimiento,CAST(GETDATE() AS date))*p.recargo_diario,2),
        monto=q.capital+q.interes+ROUND(DATEDIFF(day,q.fecha_vencimiento,CAST(GETDATE() AS date))*p.recargo_diario,2)
      FROM dbo.prestamos_cuotas q JOIN dbo.prestamos p ON p.id=q.prestamo_id
      WHERE p.id=@id AND p.estado=N'activo' AND q.estado<>N'pagada'
        AND q.fecha_vencimiento<CAST(GETDATE() AS date) AND p.recargo_diario>0;
      UPDATE p SET total_pagar=x.total FROM dbo.prestamos p
      JOIN (SELECT prestamo_id,SUM(monto) total FROM dbo.prestamos_cuotas WHERE prestamo_id=@id GROUP BY prestamo_id) x ON x.prestamo_id=p.id
      WHERE p.id=@id;
    `);
    const loan = await new sql.Request(tx).input('id',sql.BigInt,prestamoId).query(`SELECT id,cliente_id,total_pagar,estado FROM dbo.prestamos WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`);
    if (!loan.recordset[0] || loan.recordset[0].estado !== 'activo') throw new Error('El préstamo no está activo.');
    const paid = await new sql.Request(tx).input('id',sql.BigInt,prestamoId).query(`SELECT ISNULL(SUM(monto),0) total FROM dbo.prestamos_pagos WHERE prestamo_id=@id`);
    const balance = money(Number(loan.recordset[0].total_pagar)-Number(paid.recordset[0].total));
    if (monto <= 0 || monto > balance + 0.001) throw new Error(`El pago debe ser mayor que cero y no superar el saldo de L ${balance.toFixed(2)}.`);
    const payment = await new sql.Request(tx).input('prestamoId',sql.BigInt,prestamoId).input('clienteId',sql.BigInt,loan.recordset[0].cliente_id)
      .input('monto',sql.Decimal(18,2),monto).input('metodo',sql.NVarChar(30),metodo).input('referencia',sql.NVarChar(100),referencia?.trim()||null)
      .input('notas',sql.NVarChar(500),notas?.trim()||null).query(`INSERT INTO dbo.prestamos_pagos(prestamo_id,cliente_id,monto,metodo,referencia,notas) OUTPUT INSERTED.id VALUES(@prestamoId,@clienteId,@monto,@metodo,@referencia,@notas)`);
    const paymentId=Number(payment.recordset[0].id);
    await new sql.Request(tx).input('id',sql.BigInt,paymentId).query(`UPDATE dbo.prestamos_pagos SET numero=N'REC-'+RIGHT(N'000000'+CONVERT(nvarchar(20),id),6) WHERE id=@id`);
    const installments=await new sql.Request(tx).input('id',sql.BigInt,prestamoId).query(`SELECT id,monto,pagado FROM dbo.prestamos_cuotas WITH (UPDLOCK) WHERE prestamo_id=@id AND pagado<monto ORDER BY numero`);
    let remaining=money(monto);
    for(const installment of installments.recordset){ if(remaining<=0) break; const applied=money(Math.min(remaining,Number(installment.monto)-Number(installment.pagado))); const newPaid=money(Number(installment.pagado)+applied);
      await new sql.Request(tx).input('cuotaId',sql.BigInt,installment.id).input('pagado',sql.Decimal(18,2),newPaid).input('estado',sql.NVarChar(20),newPaid>=Number(installment.monto)-0.001?'pagada':'parcial').query(`UPDATE dbo.prestamos_cuotas SET pagado=@pagado,estado=@estado WHERE id=@cuotaId`);
      await new sql.Request(tx).input('pagoId',sql.BigInt,paymentId).input('cuotaId',sql.BigInt,installment.id).input('monto',sql.Decimal(18,2),applied).query(`INSERT INTO dbo.prestamos_pago_aplicaciones VALUES(@pagoId,@cuotaId,@monto)`); remaining=money(remaining-applied);
    }
    if(money(balance-monto)<=0) await new sql.Request(tx).input('id',sql.BigInt,prestamoId).query(`UPDATE dbo.prestamos SET estado=N'pagado',actualizado_en=SYSUTCDATETIME() WHERE id=@id`);
    await tx.commit(); return { id:paymentId,numero:`REC-${String(paymentId).padStart(6,'0')}`,saldo:money(balance-monto) };
  } catch(error){await tx.rollback();throw error;}
}

export async function resumen() {
  const pool=await getAuthPool();
  await actualizarRecargos(pool);
  const [metrics,due,overdue,recent]=await Promise.all([
    pool.request().query(`SELECT ISNULL((SELECT SUM(monto) FROM dbo.prestamos WHERE estado=N'activo'),0) capitalPrestado,
      ISNULL((SELECT SUM(monto) FROM dbo.prestamos_pagos),0) dineroRecuperado,
      ISNULL((SELECT SUM(a.monto) FROM dbo.prestamos_pago_aplicaciones a JOIN dbo.prestamos_cuotas q ON q.id=a.cuota_id WHERE a.monto>0),0) totalCobrado,
      ISNULL((SELECT SUM(CASE WHEN q.interes<=q.pagado THEN q.interes ELSE q.pagado END) FROM dbo.prestamos_cuotas q),0) interesesCobrados,
      ISNULL((SELECT SUM(monto-pagado) FROM dbo.prestamos_cuotas WHERE fecha_vencimiento=CAST(GETDATE() AS date) AND pagado<monto),0) cobrosHoy,
      ISNULL((SELECT SUM(monto-pagado) FROM dbo.prestamos_cuotas WHERE fecha_vencimiento<CAST(GETDATE() AS date) AND pagado<monto),0) totalVencido`),
    pool.request().query(`SELECT TOP 20 q.id cuotaId,p.id prestamoId,p.numero,c.nombre cliente,c.telefono,q.numero cuota,q.monto-q.pagado pendiente
      FROM dbo.prestamos_cuotas q JOIN dbo.prestamos p ON p.id=q.prestamo_id JOIN dbo.prestamos_clientes c ON c.id=p.cliente_id
      WHERE q.fecha_vencimiento=CAST(GETDATE() AS date) AND q.pagado<q.monto ORDER BY c.nombre`),
    pool.request().query(`SELECT p.id prestamoId,p.numero,c.nombre cliente,c.telefono,COUNT(*) cuotasVencidas,
      DATEDIFF(day,MIN(q.fecha_vencimiento),CAST(GETDATE() AS date)) diasMora,SUM(q.monto-q.pagado) vencido
      FROM dbo.prestamos_cuotas q JOIN dbo.prestamos p ON p.id=q.prestamo_id JOIN dbo.prestamos_clientes c ON c.id=p.cliente_id
      WHERE q.fecha_vencimiento<CAST(GETDATE() AS date) AND q.pagado<q.monto AND p.estado=N'activo'
      GROUP BY p.id,p.numero,c.nombre,c.telefono ORDER BY diasMora DESC`),
    pool.request().query(`SELECT TOP 15 pg.id,pg.numero,c.nombre cliente,pg.monto,pg.metodo,pg.creado_en creadoEn FROM dbo.prestamos_pagos pg JOIN dbo.prestamos_clientes c ON c.id=pg.cliente_id ORDER BY pg.id DESC`),
  ]);
  return { metricas:metrics.recordset[0],cobrosHoy:due.recordset,morosos:overdue.recordset,pagosRecientes:recent.recordset };
}

export async function reporte(desde:string,hasta:string){const pool=await getAuthPool();const result=await pool.request().input('desde',sql.Date,desde).input('hasta',sql.Date,hasta).query(`SELECT CONVERT(varchar(10),CAST(creado_en AS date),23) fecha,COUNT(*) pagos,SUM(monto) cobrado FROM dbo.prestamos_pagos WHERE CAST(creado_en AS date) BETWEEN @desde AND @hasta GROUP BY CAST(creado_en AS date) ORDER BY fecha DESC`);return result.recordset;}
