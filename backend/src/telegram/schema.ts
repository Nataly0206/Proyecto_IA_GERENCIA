export const TELEGRAM_LOANS_MIGRATION = `
IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 14)
BEGIN
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  ALTER TABLE dbo.prestamos ADD origen NVARCHAR(20) NOT NULL CONSTRAINT DF_prestamos_origen DEFAULT N'calculado';
  CREATE TABLE dbo.prestamos_telegram_vinculos (
    usuario_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.dashboard_usuarios(id),
    chat_id BIGINT NULL, codigo_hash CHAR(64) NULL, expira_en DATETIME2 NULL,
    actualizado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX UX_telegram_chat ON dbo.prestamos_telegram_vinculos(chat_id) WHERE chat_id IS NOT NULL;
  CREATE TABLE dbo.prestamos_telegram_importaciones (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    usuario_id UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.dashboard_usuarios(id), chat_id BIGINT NOT NULL,
    archivo_hash CHAR(64) NOT NULL, archivo_nombre NVARCHAR(200) NOT NULL, archivo_mime VARCHAR(80) NOT NULL,
    archivo VARBINARY(MAX) NOT NULL, plan_json NVARCHAR(MAX) NOT NULL,
    estado NVARCHAR(20) NOT NULL DEFAULT N'borrador', revision INT NOT NULL DEFAULT 1,
    prestamo_id BIGINT NULL REFERENCES dbo.prestamos(id),
    creado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), actualizado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_telegram_documento UNIQUE(usuario_id, archivo_hash),
    CONSTRAINT CK_telegram_plan CHECK(ISJSON(plan_json)=1),
    CONSTRAINT CK_telegram_estado CHECK(estado IN(N'borrador',N'registrado',N'cancelado'))
  );
  CREATE TABLE dbo.prestamos_telegram_worker (
    bot_id BIGINT NOT NULL PRIMARY KEY, siguiente_update BIGINT NOT NULL DEFAULT 0,
    propietario UNIQUEIDENTIFIER NULL, bloqueo_hasta DATETIME2 NULL
  );
  INSERT dbo.dashboard_migraciones(version,nombre) VALUES(14,N'importación de planes por Telegram y documentos originales');
  COMMIT TRANSACTION;
END;
`;
