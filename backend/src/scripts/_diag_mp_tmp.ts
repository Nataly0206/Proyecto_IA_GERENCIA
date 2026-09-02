import { getPool, closePool } from '../config/db';

async function q(pool: any, label: string, sql: string) {
  console.log(`\n===== ${label} =====`);
  const r = await pool.request().query(sql);
  console.table(r.recordset);
  const total = r.recordset.reduce((acc: number, row: any) => acc + Number(row.PesoLibras || 0), 0);
  console.log('Total:', total);
}

async function main() {
  const pool = await getPool();

  const base = (where: string) => `
    SELECT
      COALESCE(NULLIF(LTRIM(RTRIM(v.Item)), ''), 'Sin item') AS Item,
      SUM(v.PesoLibras) AS PesoLibras,
      SUM(v.CantidadSerial) AS CantidadSerial
    FROM dbo.AV_MateriaPrima v
    WHERE COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') = 'CACESA'
      AND COALESCE(NULLIF(LTRIM(RTRIM(v.TipoMateria)), ''), 'Sin tipo') = 'FRESCO'
      ${where}
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(v.Item)), ''), 'Sin item')
    ORDER BY Item
  `;

  await q(pool, 'Sin filtro de fecha (todo el historico)', base(''));
  await q(pool, 'Mes actual (agosto, DiaProduccion2024)', base("AND CAST(v.DiaProduccion2024 AS date) BETWEEN '2026-08-01' AND '2026-08-31'"));
  await q(pool, 'Ultimos 30 dias (2026-08-03 a 2026-09-02, filtro default de la app)', base("AND CAST(v.DiaProduccion2024 AS date) BETWEEN '2026-08-03' AND '2026-09-02'"));

  console.log('\n===== Filas duplicadas? COUNT(*) vs COUNT(DISTINCT IdOrdenProduccion) CACESA/FRESCO, ultimos 30 dias =====');
  const r2 = await pool.request().query(`
    SELECT COUNT(*) AS TotalFilas, COUNT(DISTINCT v.IdOrdenProduccion) AS OrdenesDistintas
    FROM dbo.AV_MateriaPrima v
    WHERE COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') = 'CACESA'
      AND COALESCE(NULLIF(LTRIM(RTRIM(v.TipoMateria)), ''), 'Sin tipo') = 'FRESCO'
      AND CAST(v.DiaProduccion2024 AS date) BETWEEN '2026-08-03' AND '2026-09-02'
  `);
  console.table(r2.recordset);

  console.log('\n===== Item vs Talla: alguna vez no coinciden? CACESA/FRESCO ultimos 30 dias =====');
  const r3 = await pool.request().query(`
    SELECT v.Item, v.Talla, COUNT(*) n, SUM(v.PesoLibras) libras, SUM(v.CantidadSerial) uds
    FROM dbo.AV_MateriaPrima v
    WHERE COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') = 'CACESA'
      AND COALESCE(NULLIF(LTRIM(RTRIM(v.TipoMateria)), ''), 'Sin tipo') = 'FRESCO'
      AND CAST(v.DiaProduccion2024 AS date) BETWEEN '2026-08-03' AND '2026-09-02'
    GROUP BY v.Item, v.Talla
    ORDER BY v.Item, v.Talla
  `);
  console.table(r3.recordset);

  console.log('\n===== Distinct fkTipo / TipoOP / TipoCuenta CACESA/FRESCO ultimos 30 dias =====');
  const r4 = await pool.request().query(`
    SELECT v.fkTipo, v.TipoOP, v.TipoCuenta, COUNT(*) n, SUM(v.PesoLibras) libras
    FROM dbo.AV_MateriaPrima v
    WHERE COALESCE(NULLIF(LTRIM(RTRIM(v.NombrePropietario)), ''), NULLIF(LTRIM(RTRIM(v.NombreGrupo)), ''), 'Sin proveedor') = 'CACESA'
      AND COALESCE(NULLIF(LTRIM(RTRIM(v.TipoMateria)), ''), 'Sin tipo') = 'FRESCO'
      AND CAST(v.DiaProduccion2024 AS date) BETWEEN '2026-08-03' AND '2026-09-02'
    GROUP BY v.fkTipo, v.TipoOP, v.TipoCuenta
  `);
  console.table(r4.recordset);

  await closePool().catch(() => {});
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
