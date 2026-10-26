import { runTelegramWorker } from './worker';
import { closeAuthPool } from '../config/authDb';
import { ApiError } from '../middleware/errorHandler';
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
runTelegramWorker(controller.signal).catch(error => {
  console.error(`[telegram] ${error instanceof ApiError ? error.message : 'No se pudo iniciar. Ejecuta las migraciones y revisa la conexión de AUTH_DB.'}`);
  process.exitCode = 1;
}).finally(() => closeAuthPool());
