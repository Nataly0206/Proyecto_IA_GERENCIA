# Importar planes de pagos desde Telegram

Se mantienen las dos entradas del módulo: préstamo calculado y documento importado.
El préstamo importado copia el calendario original. No utiliza `calcularPlan`, tasa
ni frecuencia para generar cuotas. La tasa y frecuencia son datos informativos.

## Preparación local

En `backend/.env`:

```dotenv
TELEGRAM_BOT_TOKEN=token_entregado_por_BotFather
TELEGRAM_LOANS_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
```

El lector usa `NVIDIA_API_KEY` o `AI_API_KEY` y `AI_BASE_URL` existentes. Opcionalmente
se pueden configurar `TELEGRAM_LOANS_AI_KEY` y `TELEGRAM_LOANS_AI_URL` para un
proveedor compatible con Chat Completions y visión. Las variables opcionales vacías
no anulan la clave existente. Los documentos se envían al proveedor configurado para
extraer su contenido.

Desde `backend`:

```sh
npm install
npm run migrate
npm run dev
```

En otra terminal, también desde `backend`:

```sh
npm run telegram:dev
```

El bot es un proceso independiente: reiniciar la API no inicia otra instancia ni
interrumpe la lectura de un PDF. Usa long polling y no necesita túnel, URL pública
ni webhook para probar localmente. El proceso muestra el usuario del bot al arrancar.
Después de cambiar `.env`, reiniciar los procesos para cargar la nueva configuración.
La migración 14 ya se aplicó a la base local durante la implementación.

## Vinculación y uso

1. Abrir **Préstamos → Telegram → Vincular Telegram** con una cuenta que tenga
   permiso de Préstamos y su contraseña actualizada.
2. Copiar el comando `/vincular CODIGO` y enviarlo al chat privado del bot. El código
   vence en diez minutos y es de un solo uso.
3. Enviar PDF o foto del plan. El bot crea un **borrador**, no un préstamo.
4. Revisar el resumen y el CSV con todas las cuotas. Si faltan datos, abrir
   **Préstamos → Telegram → Actualizar documentos → Revisar**, completarlos y pulsar
   **Guardar revisión**. No se adivinan fechas, moneda, principal ni intereses.
5. Confirmar desde el bot o desde la pantalla. Solo entonces se crea el préstamo y,
   si corresponde, su acreedor. El detalle del préstamo permite descargar el original.

Comandos: `/ayuda`, `/borradores`, `/ver ID`, `/cancelar ID`. Las correcciones avanzadas
por chat también admiten `/datos ID {"moneda":"HNL"}` y
`/cuota ID 1 {"capital":200,"interes":70.12,"cargos":2.15,"monto":272.27}`.

Los borradores cancelados se pueden reabrir desde la pantalla. No se eliminan archivos
ni registros físicamente al cancelar o eliminar lógicamente el préstamo.

## Reglas

- PDF de hasta 20 páginas; JPG, PNG y WebP; archivo de hasta 15 MB; imágenes de hasta
  25 megapíxeles. Se normalizan imágenes a JPEG RGB para el lector.
- Se procesan todas las páginas. PDF escaneado o mixto se renderiza completo; el PDF
  de texto se extrae por página. Una salida truncada del modelo se rechaza.
- Hasta 1.000 cuotas. Se copian fechas, capital, interés, cargos y monto explícito;
  las fechas pueden ser irregulares y no se regeneran según la frecuencia.
- Cada total debe coincidir con capital + interés + cargos, sin redondeos correctivos.
  El capital debe sumar monto recibido + interés capitalizado explícito, si existe.
- No se registra mientras falten datos obligatorios o las sumas difieran. Las
  advertencias del lector se muestran en la revisión, antes de confirmar.
- Los permisos de la cuenta se comprueban en cada interacción y antes de confirmar.
  Los chats de grupos se ignoran. Desvincular revoca el acceso del chat.
- El hash del documento evita reimportar el mismo archivo para la misma cuenta. La
  confirmación es transaccional e idempotente; las revisiones viejas se rechazan.
  También se rechaza repetir acreedor + referencia de un préstamo vigente.
- El préstamo lleva `origen=telegram` y `tipo_amortizacion=manual`; mantiene pagos,
  saldos, reportes y eliminación lógica del módulo.
- El original se conserva en SQL Server junto al borrador y préstamo. Los borradores
  son privados de su usuario; el original de un préstamo registrado está disponible
  para los usuarios que pueden consultar ese préstamo en el módulo compartido.
- El cursor de Telegram y la reserva de una sola instancia se guardan en SQL. No
  iniciar el mismo token en dos entornos; si ya tiene webhook, el worker se detiene
  sin borrarlo. Usar otro bot para desarrollo si el de producción está activo.

## Pruebas

```sh
# Validación y flujo del bot con Telegram simulado; no necesita token.
npm run test:telegram

# Crear una base local aislada para las pruebas de SQL/HTTP.
AUTH_DB_DATABASE=DashboardGerencialAuth_Telegram_QA npm run migrate
npm run test:telegram:sql

# Lector real de NVIDIA: PDF de texto, foto y PDF escaneado sintéticos.
# Usa la clave del lector, pero no necesita token de Telegram.
npm run test:telegram:ai
```

Las pruebas SQL se limitan a `DashboardGerencialAuth_Telegram_QA`; no insertan préstamos
ficticios en la base de la aplicación. Verifican la copia literal con el motor de
amortización deshabilitado, dos confirmaciones simultáneas, permisos, cancelación,
conservación del original y que los préstamos calculados continúan funcionando.
Las pruebas de IA son optativas porque consultan al proveedor externo.

Fuentes técnicas: [Telegram Bot API](https://core.telegram.org/bots/api),
[NVIDIA Nemotron 3.5 Super VL](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b),
[pdf-parse](https://github.com/mehmet-kozan/pdf-parse).
