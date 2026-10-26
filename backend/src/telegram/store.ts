import crypto from 'crypto';
import sql from 'mssql';
import { getAuthPool } from '../config/authDb';
import { ApiError } from '../middleware/errorHandler';
import { AuthUser, getUserById } from '../services/auth.service';
import { guardarPrestamo, TIPOS_ACREEDOR } from '../services/prestamos.service';
import { importedLoanErrors, importedLoanToPlan, normalizeImportedLoan, ImportedLoan } from './plan';

export const sha256 = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
export function canImport(user: AuthUser | null): user is AuthUser {
  return Boolean(user?.activo && !user.debeCambiarPassword && (user.esAdministrador || user.permisos.includes('prestamos')));
}
export async function linkStatus(userId: string) {
  const r = await (await getAuthPool()).request().input('user', sql.UniqueIdentifier, userId)
    .query('SELECT CONVERT(varchar(30),chat_id) chatId FROM dbo.prestamos_telegram_vinculos WHERE usuario_id=@user');
  return { vinculado: Boolean(r.recordset[0]?.chatId), chatId: r.recordset[0]?.chatId ?? null };
}
export async function createLinkCode(userId: string) {
  const code = crypto.randomBytes(12).toString('hex');
  await (await getAuthPool()).request().input('user', sql.UniqueIdentifier, userId).input('hash', sql.Char(64), sha256(code))
    .query(`MERGE dbo.prestamos_telegram_vinculos WITH(HOLDLOCK) t USING(SELECT @user id) s ON t.usuario_id=s.id
      WHEN MATCHED THEN UPDATE SET codigo_hash=@hash,expira_en=DATEADD(MINUTE,10,SYSUTCDATETIME()),actualizado_en=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(usuario_id,codigo_hash,expira_en) VALUES(@user,@hash,DATEADD(MINUTE,10,SYSUTCDATETIME()));`);
  return { comando: `/vincular ${code}`, expiraEnSegundos: 600 };
}
export async function unlink(userId: string) {
  await (await getAuthPool()).request().input('user', sql.UniqueIdentifier, userId)
    .query('UPDATE dbo.prestamos_telegram_vinculos SET chat_id=NULL,codigo_hash=NULL,expira_en=NULL,actualizado_en=SYSUTCDATETIME() WHERE usuario_id=@user');
}
export async function linkChat(chatId: string, code: string) {
  const pool = await getAuthPool();
  const found = await pool.request().input('hash', sql.Char(64), sha256(code))
    .query('SELECT usuario_id id FROM dbo.prestamos_telegram_vinculos WHERE codigo_hash=@hash AND expira_en>SYSUTCDATETIME()');
  const user = found.recordset[0] ? await getUserById(found.recordset[0].id) : null;
  if (!canImport(user)) throw new ApiError(403, 'Código vencido o usuario sin permiso de Préstamos. Genera otro código en el sistema.');
  try {
    const result = await pool.request().input('user', sql.UniqueIdentifier, user.id).input('chat', sql.BigInt, chatId).input('hash', sql.Char(64), sha256(code))
      .query(`UPDATE dbo.prestamos_telegram_vinculos SET chat_id=@chat,codigo_hash=NULL,expira_en=NULL,actualizado_en=SYSUTCDATETIME()
        WHERE usuario_id=@user AND codigo_hash=@hash AND expira_en>SYSUTCDATETIME()`);
    if (!result.rowsAffected[0]) throw new ApiError(409, 'El código ya se utilizó. Genera uno nuevo.');
    return user;
  } catch (error) {
    if ([2601, 2627].includes((error as { number: number }).number)) throw new ApiError(409, 'Este chat ya está vinculado a otro usuario. Desvincúlalo desde esa cuenta.');
    throw error;
  }
}
export async function userForChat(chatId: string) {
  const r = await (await getAuthPool()).request().input('chat', sql.BigInt, chatId)
    .query('SELECT usuario_id id FROM dbo.prestamos_telegram_vinculos WHERE chat_id=@chat');
  const user = r.recordset[0] ? await getUserById(r.recordset[0].id) : null;
  if (!canImport(user)) throw new ApiError(403, 'Vincula tu cuenta desde Préstamos → Telegram antes de enviar documentos.');
  return user;
}
function toDraft(row: Record<string, any>) {
  const plan = normalizeImportedLoan(JSON.parse(row.plan_json));
  return { id: String(row.id), archivoNombre: row.archivo_nombre, estado: row.estado, revision: Number(row.revision),
    prestamoId: row.prestamo_id ? Number(row.prestamo_id) : null, plan, errores: importedLoanErrors(plan) };
}
export async function findDocument(userId: string, hash: string) {
  const r = await (await getAuthPool()).request().input('user', sql.UniqueIdentifier, userId).input('hash', sql.Char(64), hash)
    .query('SELECT id,archivo_nombre,estado,revision,prestamo_id,plan_json FROM dbo.prestamos_telegram_importaciones WHERE usuario_id=@user AND archivo_hash=@hash');
  return r.recordset[0] ? toDraft(r.recordset[0]) : null;
}
export async function saveDraft(user: AuthUser, chatId: string, file: { name: string; mime: string; data: Buffer }, plan: ImportedLoan) {
  const hash = sha256(file.data), existing = await findDocument(user.id, hash);
  if (existing) return existing;
  const id = crypto.randomUUID();
  try {
    await (await getAuthPool()).request().input('id', sql.UniqueIdentifier, id).input('user', sql.UniqueIdentifier, user.id)
      .input('chat', sql.BigInt, chatId).input('hash', sql.Char(64), hash).input('name', sql.NVarChar(200), file.name.slice(0, 200))
      .input('mime', sql.VarChar(80), file.mime).input('file', sql.VarBinary(sql.MAX), file.data)
      .input('plan', sql.NVarChar(sql.MAX), JSON.stringify(plan))
      .query(`INSERT dbo.prestamos_telegram_importaciones(id,usuario_id,chat_id,archivo_hash,archivo_nombre,archivo_mime,archivo,plan_json)
        VALUES(@id,@user,@chat,@hash,@name,@mime,@file,@plan)`);
  } catch (error) {
    if ([2601, 2627].includes((error as { number: number }).number)) {
      const duplicate = await findDocument(user.id, hash);
      if (duplicate) return duplicate;
    }
    throw error;
  }
  return getDraft(user.id, id);
}
export async function getDraft(userId: string, id: string) {
  const r = await (await getAuthPool()).request().input('id', sql.UniqueIdentifier, id).input('user', sql.UniqueIdentifier, userId)
    .query('SELECT id,archivo_nombre,estado,revision,prestamo_id,plan_json FROM dbo.prestamos_telegram_importaciones WHERE id=@id AND usuario_id=@user');
  if (!r.recordset[0]) throw new ApiError(404, 'Borrador no encontrado en tu cuenta.');
  return toDraft(r.recordset[0]);
}
export async function listDrafts(userId: string) {
  const r = await (await getAuthPool()).request().input('user', sql.UniqueIdentifier, userId)
    .query(`SELECT TOP 50 id,archivo_nombre,estado,revision,prestamo_id,plan_json FROM dbo.prestamos_telegram_importaciones WHERE usuario_id=@user ORDER BY creado_en DESC`);
  return r.recordset.map(toDraft);
}
export async function updateDraft(userId: string, id: string, revision: number, value: unknown) {
  const plan = normalizeImportedLoan(value);
  const r = await (await getAuthPool()).request().input('id', sql.UniqueIdentifier, id).input('user', sql.UniqueIdentifier, userId)
    .input('revision', sql.Int, revision).input('plan', sql.NVarChar(sql.MAX), JSON.stringify(plan))
    .query(`UPDATE dbo.prestamos_telegram_importaciones SET plan_json=@plan,revision=revision+1,actualizado_en=SYSUTCDATETIME()
      WHERE id=@id AND usuario_id=@user AND revision=@revision AND estado=N'borrador'`);
  if (!r.rowsAffected[0]) throw new ApiError(409, 'El borrador cambió o ya se procesó. Vuelve a abrirlo.');
  return getDraft(userId, id);
}
export async function cancelDraft(userId: string, id: string) {
  const r = await (await getAuthPool()).request().input('id', sql.UniqueIdentifier, id).input('user', sql.UniqueIdentifier, userId)
    .query(`UPDATE dbo.prestamos_telegram_importaciones SET estado=N'cancelado',revision=revision+1,actualizado_en=SYSUTCDATETIME() WHERE id=@id AND usuario_id=@user AND estado=N'borrador'`);
  if (!r.rowsAffected[0]) throw new ApiError(409, 'El borrador ya se procesó.');
}
export async function reopenDraft(userId: string, id: string) {
  const r = await (await getAuthPool()).request().input('id', sql.UniqueIdentifier, id).input('user', sql.UniqueIdentifier, userId)
    .query(`UPDATE dbo.prestamos_telegram_importaciones SET estado=N'borrador',revision=revision+1,actualizado_en=SYSUTCDATETIME() WHERE id=@id AND usuario_id=@user AND estado=N'cancelado'`);
  if (!r.rowsAffected[0]) throw new ApiError(409, 'Solo se pueden reabrir borradores cancelados.');
  return getDraft(userId, id);
}
export async function originalDocument(userId: string, id: string) {
  const r = await (await getAuthPool()).request().input('id', sql.UniqueIdentifier, id).input('user', sql.UniqueIdentifier, userId)
    .query('SELECT archivo,archivo_nombre,archivo_mime FROM dbo.prestamos_telegram_importaciones WHERE id=@id AND usuario_id=@user');
  if (!r.recordset[0]) throw new ApiError(404, 'Documento no encontrado en tu cuenta.');
  return r.recordset[0];
}
export async function confirmDraft(user: AuthUser, id: string, revision: number) {
  if (!canImport(await getUserById(user.id))) throw new ApiError(403, 'Ya no tienes permiso para registrar préstamos.');
  const tx = new sql.Transaction(await getAuthPool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const r = await new sql.Request(tx).input('id', sql.UniqueIdentifier, id).input('user', sql.UniqueIdentifier, user.id)
      .query('SELECT estado,revision,plan_json,prestamo_id FROM dbo.prestamos_telegram_importaciones WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND usuario_id=@user');
    const row = r.recordset[0];
    if (!row) throw new ApiError(404, 'Borrador no encontrado.');
    if (row.estado === 'registrado') { await tx.commit(); return { id: Number(row.prestamo_id), yaRegistrado: true }; }
    if (row.estado !== 'borrador' || row.revision !== revision) throw new ApiError(409, 'El borrador cambió o fue cancelado. Revisa la versión actual antes de confirmar.');
    const draft = normalizeImportedLoan(JSON.parse(row.plan_json)), errors = importedLoanErrors(draft);
    if (errors.length) throw new ApiError(400, errors.join('\n'));
    let acreedorId = draft.acreedorId;
    if (!acreedorId) {
      const creditors = await new sql.Request(tx).input('name', sql.NVarChar(180), draft.acreedor)
        .query('SELECT id,eliminado_en FROM dbo.prestamos_acreedores WITH(UPDLOCK,HOLDLOCK) WHERE nombre=@name');
      if (creditors.recordset[0]?.eliminado_en) throw new ApiError(409, 'El acreedor del documento está eliminado. Selecciona un acreedor activo en el borrador.');
      acreedorId = creditors.recordset[0] ? Number(creditors.recordset[0].id) : null;
      if (!acreedorId) {
        const created = await new sql.Request(tx).input('name', sql.NVarChar(180), draft.acreedor)
          .input('type', sql.NVarChar(30), TIPOS_ACREEDOR.includes(draft.tipoAcreedor) ? draft.tipoAcreedor : 'otro')
          .input('user', sql.NVarChar(60), user.usuario)
          .query('INSERT dbo.prestamos_acreedores(nombre,tipo,creado_por) OUTPUT INSERTED.id VALUES(@name,@type,@user)');
        acreedorId = Number(created.recordset[0].id);
      }
    }
    const { input, plan } = importedLoanToPlan(draft, acreedorId);
    if (input.referencia) {
      const duplicate = await new sql.Request(tx).input('creditor', sql.BigInt, acreedorId).input('ref', sql.NVarChar(60), input.referencia)
        .query('SELECT id FROM dbo.prestamos WITH(UPDLOCK,HOLDLOCK) WHERE acreedor_id=@creditor AND referencia=@ref AND eliminado_en IS NULL');
      if (duplicate.recordset[0]) throw new ApiError(409, 'Ya existe un préstamo activo con ese acreedor y referencia.');
    }
    const loan = await guardarPrestamo(input, user.usuario, plan, tx, 'telegram');
    await new sql.Request(tx).input('id', sql.UniqueIdentifier, id).input('loan', sql.BigInt, loan.id)
      .query(`UPDATE dbo.prestamos_telegram_importaciones SET prestamo_id=@loan,estado=N'registrado',actualizado_en=SYSUTCDATETIME() WHERE id=@id`);
    await tx.commit();
    return { id: loan.id, numero: loan.numero, yaRegistrado: false };
  } catch (error) { await tx.rollback(); throw error; }
}
