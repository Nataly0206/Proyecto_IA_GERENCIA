const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../dist/config/authDb');
const service = require('../dist/services/preload.service');
const original = db.getAuthPool;
const userId = '00000000-0000-4000-8000-000000000001';
// Only table variables are changed; no real loads or inventory are touched.
const fixture = `
DECLARE @Loads TABLE(id int,revision int,usuario_id uniqueidentifier,creado_en datetime2,contenido nvarchar(max),eliminado_en datetime2,eliminado_por uniqueidentifier);
DECLARE @Users TABLE(id uniqueidentifier,nombre nvarchar(100));
DECLARE @Edits TABLE(carga_id int,revision int,usuario_id uniqueidentifier,motivo nvarchar(2000),anterior nvarchar(max),nuevo nvarchar(max));
INSERT @Users VALUES('${userId}',N'Prueba');
INSERT @Loads VALUES(1,2,'${userId}','2026-10-27',N'{"notes":"Prueba","filters":{},"items":[]}',NULL,NULL),
(2,3,'${userId}','2026-10-27',N'{"notes":"Conservar","filters":{},"items":[]}','2026-10-27','${userId}');
INSERT @Edits VALUES(1,2,'${userId}',N'Historial previo',N'{}',N'{}');
`;
let connection, lastState;
before(async () => {
  connection = await original();
  db.getAuthPool = async () => ({ request: () => {
    const req = connection.request();
    return {
      input(...args) { req.input(...args); return this; },
      async query(query) {
        const rewritten = query.replaceAll('dbo.dashboard_precargas','@Loads')
          .replaceAll('dbo.dashboard_usuarios','@Users').replaceAll('dbo.dashboard_cargas_ediciones','@Edits');
        const result = await req.query(fixture + rewritten + `; SELECT id,revision,contenido,eliminado_en,eliminado_por,(SELECT COUNT(*) FROM @Edits) AS editCount FROM @Loads ORDER BY id;`);
        lastState = result.recordsets.at(-1);
        return result;
      },
    };
  } });
});
after(async () => { db.getAuthPool = original; await db.closeAuthPool(); });

test('Eliminar conserva contenido e historial y registra fecha, usuario y revisión', async () => {
  assert.equal(await service.deletePreload(1,2,userId),true);
  const row = lastState[0];
  assert.equal(row.revision,3); assert.ok(row.eliminado_en);
  assert.equal(row.eliminado_por,userId); assert.equal(row.editCount,1);
  assert.equal(JSON.parse(row.contenido).notes,'Prueba');
});
test('Una revisión vieja o una carga eliminada no se puede eliminar otra vez', async () => {
  assert.equal(await service.deletePreload(1,1,userId),false);
  assert.equal(lastState[0].eliminado_en,null);
  assert.equal(await service.deletePreload(2,3,userId),false);
  assert.equal(lastState[1].revision,3);
});
test('Historial y acceso directo omiten eliminadas', async () => {
  assert.deepEqual((await service.listPreloads()).map(row=>row.id),[1]);
  assert.equal(await service.getPreload(2),null);
  assert.equal((await service.getPreload(1)).id,1);
});
test('Una edición concurrente no resucita ni modifica la carga eliminada', async () => {
  assert.equal(await service.updatePreload(2,3,userId,'Prueba',{}),undefined);
  assert.equal(lastState[1].revision,3);
  assert.equal(JSON.parse(lastState[1].contenido).notes,'Conservar');
  assert.equal(lastState[1].editCount,1);
});
