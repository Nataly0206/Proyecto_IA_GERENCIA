import { env } from '../config/env';
import { ApiError } from '../middleware/errorHandler';
import { MAX_DOCUMENT_BYTES } from './extract';

export interface TelegramMessage {
  message_id: number; chat: { id: number; type: string }; from?: { id: number; is_bot?: boolean }; text?: string;
  document?: { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
  photo?: { file_id: string; file_size?: number }[];
}
export interface TelegramUpdate {
  update_id: number; message?: TelegramMessage;
  callback_query?: { id: string; from: { id: number }; message?: TelegramMessage; data?: string };
}
export class TelegramApi {
  constructor(private readonly token = env.TELEGRAM_BOT_TOKEN) {}
  async call<T>(method: string, body: object = {}, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, { method: 'POST', signal: signal ?? AbortSignal.timeout(40_000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new ApiError(502, 'No se pudo conectar con Telegram.'); }
    const result = await response.json() as { ok: boolean; result: T; error_code?: number };
    if (!response.ok || !result.ok) throw new ApiError(result.error_code === 409 ? 409 : 502,
      result.error_code === 409 ? 'Hay otro proceso o webhook usando este bot. Detén la otra instancia.' : `Telegram respondió HTTP ${response.status}.`);
    return result.result;
  }
  send(chatId: string, text: string, replyMarkup?: object) {
    return this.call('sendMessage', { chat_id: chatId, text: text.slice(0, 4000), ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
  }
  async csv(chatId: string, name: string, content: string) {
    const form = new FormData(); form.set('chat_id', chatId);
    form.set('document', new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }), name);
    let response: Response;
    try { response = await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(40_000) }); }
    catch { throw new ApiError(502, 'No se pudo enviar la revisión de cuotas a Telegram.'); }
    const result = await response.json() as { ok?: boolean };
    if (!response.ok || !result.ok) throw new ApiError(502, 'Telegram no recibió el archivo de revisión.');
  }
  async download(fileId: string): Promise<Buffer> {
    const file = await this.call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
    if (!file.file_path || (file.file_size ?? 0) > MAX_DOCUMENT_BYTES) throw new ApiError(400, 'El archivo no está disponible o supera 15 MB.');
    if (!/^[A-Za-z0-9_./-]+$/.test(file.file_path) || file.file_path.includes('..')) throw new ApiError(400, 'Ruta de archivo no válida.');
    let response: Response;
    try { response = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) }); }
    catch { throw new ApiError(502, 'No se pudo descargar el documento de Telegram.'); }
    if (!response.ok || !response.body) throw new ApiError(502, 'No se pudo descargar el documento.');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > MAX_DOCUMENT_BYTES) { await reader.cancel(); throw new ApiError(400, 'El documento supera 15 MB.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
}
