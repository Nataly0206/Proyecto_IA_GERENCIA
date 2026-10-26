import crypto from 'crypto';
import sql from 'mssql';
import { setTimeout as delay } from 'timers/promises';
import { env } from '../config/env';
import { getAuthPool } from '../config/authDb';
import { ApiError } from '../middleware/errorHandler';
import { TelegramApi, TelegramMessage, TelegramUpdate } from './api';
import { extractLoan, documentMime, MAX_DOCUMENT_BYTES } from './extract';
import { normalizeImportedLoan } from './plan';
import * as store from './store';
import { uuid } from './routes';

const HELP = 'Envía un PDF o foto del plan de pagos (hasta 15 MB). Primero crearé un borrador: no se guarda el préstamo hasta que confirmes.\n\n/borradores — listar documentos\n/ver ID — revisar resumen y todas las cuotas\n/cancelar ID — cancelar borrador\nTambién puedes revisar y corregir todo desde Préstamos → Telegram.';
const format = (x: number | null) => x === null ? 'FALTA' : x.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeFailure = (error: unknown) => error instanceof ApiError ? error.message : 'Ocurrió un problema al guardar. Intenta nuevamente; no confirmes otro documento del mismo préstamo.';
export async function reviewDraft(api: TelegramApi, chatId: string, draft: Awaited<ReturnType<typeof store.getDraft>>, includeCsv = true) {
  if (draft.estado === 'registrado') { await api.send(chatId, `Este documento ya registró el préstamo #${draft.prestamoId}. No se creó otro.`); return; }
  if (draft.estado === 'cancelado') { await api.send(chatId, 'Este borrador está cancelado. Puedes reabrirlo desde Préstamos → Telegram; el documento original se conserva.'); return; }
  const p = draft.plan;
  const total = p.cuotas.every(row => row.monto !== null) ? p.cuotas.reduce((sum, row) => sum + row.monto!, 0) : null;
  const summary = `BORRADOR — SIN RECÁLCULO\nID: ${draft.id}\nArchivo: ${draft.archivoNombre}\nAcreedor: ${p.acreedor || (p.acreedorId ? `#${p.acreedorId}` : 'FALTA')}\nMoneda: ${p.moneda ?? 'FALTA'}\nRecibido: ${format(p.monto)}\nTasa anual: ${p.tasaAnual ?? 'FALTA'}%\nDesembolso: ${p.fechaDesembolso ?? 'FALTA'}\nFrecuencia: ${p.frecuencia ?? 'FALTA'}\nCuotas leídas: ${p.cuotas.length}\nPrimera: ${p.cuotas[0]?.fechaVencimiento ?? 'FALTA'}\nÚltima: ${p.cuotas[p.cuotas.length - 1]?.fechaVencimiento ?? 'FALTA'}\nTotal a pagar: ${format(total)}\n${p.advertencias.length ? '\nAdvertencias del documento:\n' + p.advertencias.join('\n') : ''}\n${draft.errores.length ? 'COMPLETAR ANTES DE CONFIRMAR:\n' + draft.errores.slice(0, 12).join('\n') : 'Revisa todas las cuotas del archivo adjunto antes de confirmar. Se copiarán exactamente como están.'}`;
  if (includeCsv) {
    const csv = 'Número,Fecha,Capital,Interés,Cargos,Total\n' + p.cuotas.map(row => [row.numero, row.fechaVencimiento ?? '', row.capital ?? '', row.interes ?? '', row.cargos ?? '', row.monto ?? ''].join(',')).join('\n');
    await api.csv(chatId, `revision-${draft.id}.csv`, csv);
  }
  await api.send(chatId, summary, { inline_keyboard: [
    ...(draft.errores.length ? [] : [[{ text: 'Confirmar préstamo', callback_data: `c:${draft.id}:${draft.revision}` }]]),
    [{ text: 'Cancelar borrador', callback_data: `x:${draft.id}` }],
  ] });
}
export async function handleUpdate(update: TelegramUpdate, api: TelegramApi): Promise<void> {
  const callback = update.callback_query;
  const message = update.message ?? callback?.message;
  if (!message || message.chat.type !== 'private') return;
  const sender = callback?.from.id ?? message.from?.id;
  if (!sender || sender !== message.chat.id || message.from?.is_bot && !callback) return;
  const chatId = String(message.chat.id), text = (update.message?.text ?? '').trim();
  if (callback) await api.call('answerCallbackQuery', { callback_query_id: callback.id });
  if (/^\/vincular\s+[a-f0-9]{24}$/i.test(text)) {
    const user = await store.linkChat(chatId, text.split(/\s+/)[1]);
    await api.send(chatId, `Cuenta vinculada: ${user.nombre}.\n${HELP}`); return;
  }
  const user = await store.userForChat(chatId);
  if (callback) {
    const [action, id, version] = (callback.data ?? '').split(':'); uuid(id ?? '');
    if (action === 'c') {
      const revision = Number(version);
      if (!Number.isInteger(revision) || revision < 1) throw new ApiError(400, 'Confirmación no válida.');
      const loan = await store.confirmDraft(user, id, revision);
      await api.send(chatId, `${loan.yaRegistrado ? 'Ya estaba registrado' : 'Préstamo registrado'}: ${'numero' in loan ? loan.numero : `#${loan.id}`}. Las cuotas se conservaron sin recalcular.`);
    } else if (action === 'x') { await store.cancelDraft(user.id, id); await api.send(chatId, 'Borrador cancelado. El documento se conserva.'); }
    return;
  }
  if (text === '/borradores') {
    const drafts = await store.listDrafts(user.id);
    await api.send(chatId, drafts.length ? drafts.map(draft => `${draft.estado} · ${draft.archivoNombre}\n/ver ${draft.id}`).join('\n\n') : 'Todavía no hay documentos enviados.'); return;
  }
  if (/^\/(ver|cancelar)\s+/.test(text)) {
    const [command, id] = text.split(/\s+/); uuid(id ?? '');
    if (command === '/cancelar') { await store.cancelDraft(user.id, id); await api.send(chatId, 'Borrador cancelado. El documento se conserva.'); }
    else await reviewDraft(api, chatId, await store.getDraft(user.id, id));
    return;
  }
  const patch = text.match(/^\/(datos|cuota)\s+(\S+)\s+(?:(\d+)\s+)?([\s\S]+)$/);
  if (patch) {
    const [, command, rawId, index, json] = patch, id = uuid(rawId);
    let value: Record<string, unknown>;
    try { value = JSON.parse(json); } catch { throw new ApiError(400, 'Los datos deben ser un objeto JSON válido. Consulta /ayuda para ver un ejemplo.'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Los datos deben ser un objeto.');
    const draft = await store.getDraft(user.id, id), plan = draft.plan;
    if (command === 'cuota') {
      const n = Number(index);
      if (!Number.isInteger(n) || n < 1 || n > plan.cuotas.length) throw new ApiError(400, 'Número de cuota no válido.');
      const allowed = ['numero', 'fechaVencimiento', 'capital', 'interes', 'cargos', 'monto'];
      if (Object.keys(value).some(key => !allowed.includes(key))) throw new ApiError(400, 'Solo puedes corregir número, fecha, capital, interés, cargos y monto de la cuota.');
      plan.cuotas[n - 1] = { ...plan.cuotas[n - 1], ...value };
    } else {
      const allowed = ['acreedor', 'acreedorId', 'tipoAcreedor', 'moneda', 'monto', 'tasaAnual', 'frecuencia', 'fechaDesembolso', 'referencia', 'interesCapitalizado', 'cantidadCuotas', 'notas'];
      if (Object.keys(value).some(key => !allowed.includes(key))) throw new ApiError(400, 'Usa /cuota para corregir una cuota o el formulario de Préstamos → Telegram.');
      Object.assign(plan, value);
    }
    await reviewDraft(api, chatId, await store.updateDraft(user.id, id, draft.revision, normalizeImportedLoan(plan))); return;
  }
  const document = message.document, photo = message.photo?.[message.photo.length - 1];
  if (document || photo) {
    const attachment = document ?? photo!;
    if ((attachment.file_size ?? 0) > MAX_DOCUMENT_BYTES) throw new ApiError(400, 'El archivo supera 15 MB.');
    await api.send(chatId, 'Estoy leyendo el plan. Todavía no se ha registrado ningún préstamo.');
    const data = await api.download(attachment.file_id);
    const existing = await store.findDocument(user.id, store.sha256(data));
    if (existing) { await reviewDraft(api, chatId, existing); return; }
    const mime = documentMime(data);
    const plan = await extractLoan(data);
    const draft = await store.saveDraft(user, chatId, { name: document?.file_name ?? 'plan-foto.jpg', mime, data }, plan);
    await reviewDraft(api, chatId, draft); return;
  }
  await api.send(chatId, HELP);
}

async function lease(botId: number, owner: string, release = false) {
  const request = (await getAuthPool()).request().input('bot', sql.BigInt, botId).input('owner', sql.UniqueIdentifier, owner);
  if (release) { await request.query('UPDATE dbo.prestamos_telegram_worker SET bloqueo_hasta=SYSUTCDATETIME(),propietario=NULL WHERE bot_id=@bot AND propietario=@owner'); return null; }
  const r = await request.query(`MERGE dbo.prestamos_telegram_worker WITH(HOLDLOCK) t USING(SELECT @bot id) s ON t.bot_id=s.id
    WHEN NOT MATCHED THEN INSERT(bot_id) VALUES(@bot);
    UPDATE dbo.prestamos_telegram_worker SET propietario=@owner,bloqueo_hasta=DATEADD(SECOND,90,SYSUTCDATETIME())
    OUTPUT INSERTED.siguiente_update siguiente WHERE bot_id=@bot AND (propietario=@owner OR bloqueo_hasta IS NULL OR bloqueo_hasta<SYSUTCDATETIME());`);
  return r.recordset?.[0] ? Number(r.recordset[0].siguiente) : null;
}
export async function runTelegramWorker(signal: AbortSignal, api = new TelegramApi()) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new ApiError(503, 'Agrega TELEGRAM_BOT_TOKEN en backend/.env antes de iniciar el bot.');
  const bot = await api.call<{ id: number; username: string }>('getMe');
  const webhook = await api.call<{ url: string }>('getWebhookInfo');
  if (webhook.url) throw new ApiError(409, 'El bot tiene un webhook activo. Usa un bot de prueba para local o retira ese webhook desde su entorno.');
  const owner = crypto.randomUUID();
  let offset = await lease(bot.id, owner);
  if (offset === null) throw new ApiError(409, 'Este bot ya está atendido por otra instancia.');
  console.log(`[telegram] @${bot.username} listo. Vincula tu cuenta desde Préstamos → Telegram.`);
  let leaseLost = false;
  const heartbeat = setInterval(() => { void lease(bot.id, owner).then(value => { if (value === null) leaseLost = true; }).catch(() => { leaseLost = true; }); }, 20_000);
  try {
    while (!signal.aborted && !leaseLost) {
      try {
        const updates: TelegramUpdate[] = await api.call<TelegramUpdate[]>('getUpdates', { offset, timeout: 20, limit: 10, allowed_updates: ['message', 'callback_query'] }, signal);
        for (const update of updates) {
          if (signal.aborted || leaseLost) break;
          try { await handleUpdate(update, api); }
          catch (error) {
            const message = update.message ?? update.callback_query?.message;
            if (error instanceof ApiError && message?.chat.type === 'private') await api.send(String(message.chat.id), safeFailure(error));
            else throw error;
          }
          offset = update.update_id + 1;
          await (await getAuthPool()).request().input('bot', sql.BigInt, bot.id).input('owner', sql.UniqueIdentifier, owner).input('offset', sql.BigInt, offset)
            .query('UPDATE dbo.prestamos_telegram_worker SET siguiente_update=@offset WHERE bot_id=@bot AND propietario=@owner');
        }
      } catch (error) {
        if (signal.aborted) break;
        if (error instanceof ApiError && error.statusCode === 409) throw error;
        console.error('[telegram] No se pudo procesar la actualización. Reintentando sin avanzar el cursor.');
        await delay(5000, undefined, { signal }).catch(() => undefined);
      }
    }
    if (leaseLost && !signal.aborted) throw new ApiError(409, 'Se perdió la reserva del bot. Revisa la conexión a la base de datos.');
  } finally { clearInterval(heartbeat); await lease(bot.id, owner, true).catch(() => undefined); }
}
