/**
 * Datos simulados para el módulo de Préstamos (solo para ver cómo se ve cada pantalla).
 *
 *   npm run seed:prestamos            → borra los datos demo anteriores y los vuelve a crear
 *   npm run seed:prestamos -- --limpiar → solo borra los datos demo
 *
 * Todo lo demo se identifica porque el acreedor empieza con "[DEMO]". La limpieza
 * solo toca préstamos de esos acreedores; los datos reales no se modifican.
 */
import sql from 'mssql';
import { closeAuthPool, getAuthPool } from '../config/authDb';
import { fechaPeriodo } from '../services/amortizacion';
import {
  crearAcreedor, crearPrestamo, registrarAbono, registrarPago, PrestamoInput,
} from '../services/prestamos.service';

const PREFIJO = '[DEMO] ';
const USUARIO = 'demo';
const HOY = new Date().toISOString().slice(0, 10);

const acreedores = [
  { clave: 'ficohsa', nombre: 'Banco Ficohsa', tipo: 'banco', contacto: 'Ejecutivo corporativo', telefono: '2280-1000' },
  { clave: 'bac', nombre: 'BAC Credomatic', tipo: 'banco', contacto: 'Banca empresarial', telefono: '2216-0200' },
  { clave: 'atlantida', nombre: 'Banco Atlántida', tipo: 'banco', contacto: 'Gerencia PYME', telefono: '2280-0000' },
  { clave: 'coop', nombre: 'Cooperativa Sagrada Familia', tipo: 'cooperativa', contacto: 'Oficial de crédito', telefono: '2782-0000' },
  { clave: 'proveedor', nombre: 'Alimentos Acuícolas del Sur', tipo: 'proveedor', contacto: 'Crédito y cobros', telefono: '2780-5555' },
  { clave: 'socio', nombre: 'Préstamo de socio', tipo: 'persona', contacto: '', telefono: '' },
] as const;
type Clave = typeof acreedores[number]['clave'];

interface Escenario {
  acreedor: Clave;
  prestamo: Omit<PrestamoInput, 'acreedorId'>;
  /** Paga completas las cuotas que vencen en o antes de esta fecha (cada una en su fecha). */
  pagarHasta?: string;
  /** Pago parcial adicional sobre la siguiente cuota pendiente. */
  parcial?: { fecha: string; monto: number };
  abono?: { fecha: string; monto: number; modo: 'cuota' | 'plazo' };
}

const mesesAtras = (n: number, dia = 15) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, dia)).toISOString().slice(0, 10);
};
const semanasAtras = (n: number) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n * 7);
  return d.toISOString().slice(0, 10);
};

const escenarios: Escenario[] = [
  { // Préstamo grande en lempiras, al día, con un abono a capital que reduce la cuota.
    acreedor: 'ficohsa',
    prestamo: {
      moneda: 'HNL', monto: 5_000_000, tasaAnual: 14, cantidadCuotas: 36, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija',
      cargoCuota: 350, fechaDesembolso: mesesAtras(17, 10), fechaPrimeraCuota: mesesAtras(16, 10),
      referencia: 'FIC-CAP-2025-0187', notas: 'Capital de trabajo temporada alta.',
    },
    pagarHasta: HOY,
    abono: { fecha: mesesAtras(4, 20), monto: 500_000, modo: 'cuota' },
  },
  { // Dólares, con cuotas vencidas (mora) y un pago parcial.
    acreedor: 'bac',
    prestamo: {
      moneda: 'USD', monto: 250_000, tasaAnual: 9.5, cantidadCuotas: 24, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija',
      cargoCuota: 25, fechaDesembolso: mesesAtras(12, 1), fechaPrimeraCuota: mesesAtras(11, 1),
      referencia: 'BAC-USD-77421', notas: 'Compra de túnel de congelación IQF.',
    },
    pagarHasta: mesesAtras(3, 2),
    parcial: { fecha: mesesAtras(2, 5), monto: 4_000 },
  },
  { // Bullet trimestral: solo intereses y el capital al vencimiento.
    acreedor: 'atlantida',
    prestamo: {
      moneda: 'USD', monto: 500_000, tasaAnual: 8, cantidadCuotas: 8, frecuencia: 'trimestral', tipoAmortizacion: 'solo_interes',
      cargoCuota: 0, fechaDesembolso: mesesAtras(10, 1), fechaPrimeraCuota: mesesAtras(7, 1), baseCalculo: 'ACTUAL_360',
      referencia: 'ATL-BUL-2026-004', notas: 'Línea de exportación. Capital al vencimiento.',
    },
    pagarHasta: HOY,
  },
  { // Semanal: llena el flujo semanal.
    acreedor: 'coop',
    prestamo: {
      moneda: 'HNL', monto: 800_000, tasaAnual: 18, cantidadCuotas: 52, frecuencia: 'semanal', tipoAmortizacion: 'cuota_fija',
      cargoCuota: 0, fechaDesembolso: semanasAtras(23), fechaPrimeraCuota: semanasAtras(22),
      referencia: 'CSF-8812', notas: 'Reparación de estanques.',
    },
    pagarHasta: semanasAtras(1),
  },
  { // Personalizado: crédito de proveedor con abonos de capital irregulares.
    acreedor: 'proveedor',
    prestamo: (() => {
      const primera = mesesAtras(2, 28);
      const capitales = [150_000, 0, 200_000, 0, 250_000, 0, 400_000];
      const calendario = capitales.map((capital, i) => ({ fechaVencimiento: fechaPeriodo(primera, 'mensual', i), capital }));
      return {
        moneda: 'HNL' as const, monto: 1_000_000, tasaAnual: 12, cantidadCuotas: calendario.length, frecuencia: 'mensual' as const,
        tipoAmortizacion: 'personalizado' as const, cargoCuota: 0, fechaDesembolso: mesesAtras(3, 28), fechaPrimeraCuota: primera,
        referencia: 'FAC-ALIM-3390', notas: 'Financiamiento de alimento balanceado.', opciones: { calendario },
      };
    })(),
    pagarHasta: mesesAtras(1, 1),
  },
  { // Préstamo ya liquidado (estado "pagado").
    acreedor: 'atlantida',
    prestamo: {
      moneda: 'HNL', monto: 300_000, tasaAnual: 12, cantidadCuotas: 6, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija',
      cargoCuota: 0, fechaDesembolso: mesesAtras(10, 5), fechaPrimeraCuota: mesesAtras(9, 5),
      referencia: 'ATL-HNL-1102', notas: 'Préstamo puente, liquidado.',
    },
    pagarHasta: HOY,
  },
  { // Recién desembolsado, sin pagos aún, sin interés.
    acreedor: 'socio',
    prestamo: {
      moneda: 'USD', monto: 60_000, tasaAnual: 0, cantidadCuotas: 12, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija',
      cargoCuota: 0, fechaDesembolso: semanasAtras(2), fechaPrimeraCuota: mesesAtras(-1, 1),
      notas: 'Aporte de socio sin intereses.',
    },
  },
];

async function limpiar() {
  const pool = await getAuthPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const filtro = `SELECT p.id FROM dbo.prestamos p JOIN dbo.prestamos_acreedores a ON a.id = p.acreedor_id WHERE a.nombre LIKE N'[[]DEMO]%'`;
    const q = (text: string) => new sql.Request(tx).query(text);
    await q(`UPDATE dbo.prestamos_telegram_importaciones SET prestamo_id = NULL WHERE prestamo_id IN (${filtro})`).catch(() => undefined);
    await q(`DELETE ap FROM dbo.prestamos_pago_aplicaciones ap JOIN dbo.prestamos_pagos pg ON pg.id = ap.pago_id WHERE pg.prestamo_id IN (${filtro})`);
    await q(`DELETE FROM dbo.prestamos_pagos WHERE prestamo_id IN (${filtro})`);
    await q(`DELETE FROM dbo.prestamos_cuotas WHERE prestamo_id IN (${filtro})`);
    const borrados = await q(`DELETE FROM dbo.prestamos WHERE id IN (${filtro})`);
    await q(`DELETE FROM dbo.prestamos_acreedores WHERE nombre LIKE N'[[]DEMO]%'`);
    await tx.commit();
    console.log(`Datos demo eliminados (${borrados.rowsAffected[0]} préstamos).`);
  } catch (error) { await tx.rollback(); throw error; }
}

async function cuotasPendientes(prestamoId: number) {
  const pool = await getAuthPool();
  const r = await pool.request().input('id', sql.BigInt, prestamoId).query(`
    SELECT CONVERT(varchar(10), fecha_vencimiento, 23) AS fecha, monto - pagado AS saldo
    FROM dbo.prestamos_cuotas WHERE eliminado_en IS NULL AND prestamo_id = @id AND pagado < monto ORDER BY numero`);
  return r.recordset as { fecha: string; saldo: number }[];
}

async function sembrar() {
  const ids = {} as Record<Clave, number>;
  for (const a of acreedores) {
    ids[a.clave] = (await crearAcreedor({ nombre: PREFIJO + a.nombre, tipo: a.tipo, contacto: a.contacto, telefono: a.telefono, notas: 'Dato de prueba' }, USUARIO)).id;
  }
  const metodos = ['transferencia', 'debito_automatico', 'cheque'];
  for (const [i, e] of escenarios.entries()) {
    const { id, numero } = await crearPrestamo({ ...e.prestamo, acreedorId: ids[e.acreedor] }, USUARIO);
    let pagos = 0;
    const pagarHasta = async (limite: string) => {
      for (const c of await cuotasPendientes(id)) {
        if (c.fecha > limite) break;
        await registrarPago(id, { monto: Number(c.saldo), fecha: c.fecha, metodo: metodos[(i + pagos) % metodos.length], referencia: `TRX-${id}-${pagos + 1}` }, USUARIO);
        pagos += 1;
      }
    };
    // El abono se aplica en su fecha: primero las cuotas anteriores, luego el abono, luego el resto.
    if (e.abono) {
      await pagarHasta(e.abono.fecha);
      await registrarAbono(id, { monto: e.abono.monto, fecha: e.abono.fecha, metodo: 'transferencia', referencia: `ABONO-${id}`, notas: 'Abono extraordinario (demo)' }, e.abono.modo, USUARIO);
    }
    if (e.pagarHasta) await pagarHasta(e.pagarHasta);
    if (e.parcial) await registrarPago(id, { monto: e.parcial.monto, fecha: e.parcial.fecha, metodo: 'transferencia', notas: 'Pago parcial (demo)' }, USUARIO);
    console.log(`  ${numero} · ${e.acreedor.padEnd(10)} · ${e.prestamo.moneda} ${e.prestamo.monto.toLocaleString('es-HN')} · ${pagos} pagos`);
  }
}

async function main() {
  await limpiar();
  if (!process.argv.includes('--limpiar')) {
    console.log('Creando datos demo...');
    await sembrar();
    console.log('Listo.');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => closeAuthPool());
