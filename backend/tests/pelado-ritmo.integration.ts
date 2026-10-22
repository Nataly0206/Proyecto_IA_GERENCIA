import assert from 'node:assert/strict';
import { getStbPool, closeStbPool } from '../src/config/stbDb';
import { PELADO_RITMO_ULTIMA_HORA_QUERY } from '../src/services/stb.queries';
import { getPeladoLibrasHoy } from '../src/services/dashboard.service';

async function main() {
  const pool = await getStbPool();
  try {
    const tables = `
      DECLARE @Cabeceras TABLE (ID_ASIGNACION_LIBRAS_EMPLEADO int, FECHA date);
      DECLARE @Detalles TABLE (ID_ASIGNACION_LIBRAS_EMPLEADO int, HORA time NULL, LIBRAS decimal(18,2), ANULADO bit);
      INSERT INTO @Cabeceras VALUES (1, '2026-10-21'), (2, '2026-10-22');
    `;
    const fixtureQuery = PELADO_RITMO_ULTIMA_HORA_QUERY
      .replace('dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS_DET', '@Detalles')
      .replace('dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS', '@Cabeceras');
    const cases = [
      { clock: '2026-10-22T10:30:00', expected: 3200, inserts: `
        INSERT INTO @Detalles VALUES
          (2,'09:30:00',900,0), (2,'09:45:00',2000,0), (2,'10:00:00',1000,0),
          (2,'10:30:00',200,0), (2,'10:31:00',500,0), (2,'10:00:00',10000,1),
          (1,'10:00:00',8000,0), (2,NULL,9999,0);` },
      { clock: '2026-10-22T00:30:00', expected: 3000, inserts: `
        INSERT INTO @Detalles VALUES
          (1,'23:30:00',900,0), (1,'23:40:00',2000,0), (2,'00:10:00',1000,0),
          (2,'01:00:00',500,0), (1,'23:50:00',10000,1);` },
      { clock: '2026-10-22T10:30:00', expected: 0, inserts: '' },
      { clock: '2026-10-22T10:30:00', expected: 1000, inserts: `
        INSERT INTO @Detalles VALUES (2,'10:20:00',1000,0);` },
    ];
    for (const c of cases) {
      const query = fixtureQuery.replace('GETDATE()', `CAST('${c.clock}' AS datetime)`);
      const result = await pool.request().query(tables + c.inserts + query);
      assert.equal(Number(result.recordset[0].Libras), c.expected);
      assert.equal(result.recordset[0].Hasta, c.clock);
    }
    // Comprueba también la conexión del servicio con las tablas reales (solo lectura).
    const live = await getPeladoLibrasHoy();
    assert(Number.isFinite(live.librasPorHoraPromedio));
    assert(Number.isFinite(live.ritmoUltimaHora.libras));
    assert(live.ritmoUltimaHora.desde && live.ritmoUltimaHora.hasta);
    console.log('OK: últimos 60 minutos, límites, anulados, registros futuros, medianoche, sin actividad, sin extrapolación y respuesta del servicio. Solo lectura; fixtures en variables de tabla.');
  } finally { await closeStbPool(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
