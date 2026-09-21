import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { env } from '../config/env';

const databaseName = env.AUTH_DB_DATABASE;
if (!/^[A-Za-z0-9_-]{1,128}$/.test(databaseName)) {
  throw new Error('AUTH_DB_DATABASE solo puede contener letras, números, guiones y guion bajo.');
}

const connectionBase: sql.config = {
  server: env.AUTH_DB_SERVER,
  port: env.AUTH_DB_PORT,
  user: env.AUTH_DB_USER,
  password: env.AUTH_DB_PASSWORD,
  options: {
    encrypt: env.AUTH_DB_ENCRYPT,
    trustServerCertificate: env.AUTH_DB_TRUST_SERVER_CERTIFICATE,
  },
  connectionTimeout: 15000,
  requestTimeout: 60000,
};

async function migrate(): Promise<void> {
  const master = await new sql.ConnectionPool({ ...connectionBase, database: 'master' }).connect();
  try {
    await master.request().query(`
      IF DB_ID(N'${databaseName}') IS NULL
        CREATE DATABASE [${databaseName}];
    `);
  } finally {
    await master.close();
  }

  const pool = await new sql.ConnectionPool({ ...connectionBase, database: databaseName }).connect();
  try {
    await pool.request().query(`
      IF OBJECT_ID('dbo.dashboard_migraciones', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.dashboard_migraciones (
          version INT NOT NULL PRIMARY KEY,
          nombre NVARCHAR(200) NOT NULL,
          aplicada_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;

      IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 1)
      BEGIN
        CREATE TABLE dbo.dashboard_usuarios (
          id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
          usuario NVARCHAR(60) NOT NULL,
          nombre NVARCHAR(150) NOT NULL,
          correo NVARCHAR(254) NOT NULL,
          password_hash NVARCHAR(100) NOT NULL,
          debe_cambiar_password BIT NOT NULL DEFAULT 1,
          es_administrador BIT NOT NULL DEFAULT 0,
          activo BIT NOT NULL DEFAULT 1,
          creado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          actualizado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT UQ_dashboard_usuarios_usuario UNIQUE (usuario),
          CONSTRAINT UQ_dashboard_usuarios_correo UNIQUE (correo)
        );

        CREATE TABLE dbo.dashboard_sesiones (
          token_hash CHAR(64) NOT NULL PRIMARY KEY,
          usuario_id UNIQUEIDENTIFIER NOT NULL,
          expira_en DATETIME2 NOT NULL,
          creado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_dashboard_sesiones_usuario
            FOREIGN KEY (usuario_id) REFERENCES dbo.dashboard_usuarios(id) ON DELETE CASCADE
        );
        CREATE INDEX IX_dashboard_sesiones_expira ON dbo.dashboard_sesiones(expira_en);

        INSERT INTO dbo.dashboard_migraciones (version, nombre)
        VALUES (1, N'crear usuarios y sesiones');
      END;
    `);

    const count = await pool.request().query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM dbo.dashboard_usuarios',
    );
    if (count.recordset[0].total === 0) {
      const hash = await bcrypt.hash(env.LOGIN_PASSWORD, 12);
      await pool.request()
        .input('usuario', sql.NVarChar(60), env.ADMIN_USER.trim().toLowerCase())
        .input('nombre', sql.NVarChar(150), env.ADMIN_NAME.trim())
        .input('correo', sql.NVarChar(254), env.ADMIN_EMAIL.trim().toLowerCase())
        .input('hash', sql.NVarChar(100), hash)
        .query(`
          INSERT INTO dbo.dashboard_usuarios
            (usuario, nombre, correo, password_hash, debe_cambiar_password, es_administrador)
          VALUES (@usuario, @nombre, @correo, @hash, 0, 1)
        `);
      console.log(`[migrate] Usuario administrador creado: ${env.ADMIN_USER}`);
    }

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 2)
      BEGIN
        CREATE TABLE dbo.dashboard_usuarios_permisos (
          usuario_id UNIQUEIDENTIFIER NOT NULL,
          permiso NVARCHAR(50) NOT NULL,
          creado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_dashboard_usuarios_permisos PRIMARY KEY (usuario_id, permiso),
          CONSTRAINT FK_dashboard_usuarios_permisos_usuario
            FOREIGN KEY (usuario_id) REFERENCES dbo.dashboard_usuarios(id) ON DELETE CASCADE
        );

        INSERT INTO dbo.dashboard_migraciones (version, nombre)
        VALUES (2, N'crear permisos por usuario');
      END;
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 3)
      BEGIN
        INSERT INTO dbo.dashboard_usuarios_permisos (usuario_id, permiso)
        SELECT u.id, N'inventario'
        FROM dbo.dashboard_usuarios u
        WHERE u.es_administrador = 0
          AND EXISTS (
            SELECT 1 FROM dbo.dashboard_usuarios_permisos p
            WHERE p.usuario_id = u.id AND p.permiso = N'iqf'
          )
          AND EXISTS (
            SELECT 1 FROM dbo.dashboard_usuarios_permisos p
            WHERE p.usuario_id = u.id AND p.permiso = N'pelado'
          )
          AND EXISTS (
            SELECT 1 FROM dbo.dashboard_usuarios_permisos p
            WHERE p.usuario_id = u.id AND p.permiso = N'usuarios'
          )
          AND NOT EXISTS (
            SELECT 1 FROM dbo.dashboard_usuarios_permisos p
            WHERE p.usuario_id = u.id AND p.permiso = N'inventario'
          );

        INSERT INTO dbo.dashboard_migraciones (version, nombre)
        VALUES (3, N'agregar permiso de inventario');
      END;
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 4)
      BEGIN
        CREATE TABLE dbo.dashboard_inventario_preferencias (
          usuario_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
          preferencias NVARCHAR(MAX) NOT NULL,
          actualizado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_dashboard_inventario_preferencias_usuario
            FOREIGN KEY (usuario_id) REFERENCES dbo.dashboard_usuarios(id) ON DELETE CASCADE,
          CONSTRAINT CK_dashboard_inventario_preferencias_json CHECK (ISJSON(preferencias) = 1)
        );

        INSERT INTO dbo.dashboard_migraciones (version, nombre)
        VALUES (4, N'crear preferencias de inventario por usuario');
      END;
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 5)
      BEGIN
        CREATE TABLE dbo.dashboard_password_resets (
          usuario_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
          codigo_hash CHAR(64) NOT NULL,
          expira_en DATETIME2 NOT NULL,
          intentos TINYINT NOT NULL DEFAULT 0,
          creado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_dashboard_password_resets_usuario
            FOREIGN KEY (usuario_id) REFERENCES dbo.dashboard_usuarios(id) ON DELETE CASCADE
        );
        CREATE INDEX IX_dashboard_password_resets_expira
          ON dbo.dashboard_password_resets(expira_en);

        INSERT INTO dbo.dashboard_migraciones (version, nombre)
        VALUES (5, N'crear codigos de recuperacion de contraseña');
      END;
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 6)
      BEGIN
        CREATE TABLE dbo.dashboard_usuarios_preferencias (
          usuario_id UNIQUEIDENTIFIER NOT NULL,
          clave NVARCHAR(80) NOT NULL,
          valor NVARCHAR(MAX) NOT NULL,
          actualizado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_dashboard_usuarios_preferencias PRIMARY KEY (usuario_id, clave),
          CONSTRAINT FK_dashboard_usuarios_preferencias_usuario
            FOREIGN KEY (usuario_id) REFERENCES dbo.dashboard_usuarios(id) ON DELETE CASCADE,
          CONSTRAINT CK_dashboard_usuarios_preferencias_json CHECK (ISJSON(valor) = 1)
        );

        INSERT INTO dbo.dashboard_migraciones (version, nombre)
        VALUES (6, N'crear preferencias generales por usuario');
      END;
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.dashboard_migraciones WHERE version = 7)
      BEGIN
        CREATE TABLE dbo.dashboard_configuracion_compartida (
          clave NVARCHAR(80) NOT NULL PRIMARY KEY,
          valor NVARCHAR(MAX) NOT NULL,
          actualizado_en DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT CK_dashboard_configuracion_compartida_json CHECK (ISJSON(valor) = 1)
        );

        INSERT INTO dbo.dashboard_migraciones (version, nombre)
        VALUES (7, N'crear configuración compartida');
      END;
    `);

    console.log(`[migrate] Base [${databaseName}] lista y actualizada.`);
  } finally {
    await pool.close();
  }
}

migrate().catch((error) => {
  console.error('[migrate] Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
