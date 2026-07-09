/*
  Crea un login/usuario de SOLO LECTURA para el backend del Dashboard IA
  (incluye el tool "query_database" del asistente IA), en reemplazo de
  "sa".

  Por qué: hoy la app se conecta como "sa" (control total de la instancia).
  El único freno para que el asistente IA escriba o dañe la base es un
  filtro de texto en el código (backend/src/services/ai.service.ts). Un
  bypass del filtro, o el modelo de IA siendo manipulado vía prompt
  injection, se traduciría en compromiso total del servidor SQL. Con este
  usuario, aunque el filtro fallara, SQL Server rechazaría cualquier
  escritura a nivel de permisos — que es donde debe estar la garantía real.

  Cómo aplicar:
    1. Ejecutar primero en un entorno de prueba/staging, NUNCA directo en
       producción sin probar.
    2. Reemplazar 'CAMBIA_ESTA_CONTRASEÑA' por una contraseña fuerte y
       única (no reusar la de "sa" ni ninguna otra existente).
    3. Ajustar la lista de vistas/tablas si el dashboard o el system
       prompt del asistente IA (ai.service.ts) referencian otras.
    4. Actualizar DB_USER / DB_PASSWORD en el .env de producción con este
       nuevo login y reiniciar el backend.
    5. Verificar que el dashboard y el chat de IA siguen funcionando.
    6. Solo entonces, deshabilitar o rotar la contraseña de "sa" /
       restringir su uso a administración manual.

  Nota sobre "ownership chaining" entre bases:
    Las vistas AV_* de PlantaEmpacadora dependen de tablas en Syspro (y de
    los sinónimos de STB_data que apuntan a Syspro, ver memoria del
    proyecto). Si el dueño (owner) de la vista y de los objetos base es
    "dbo" en ambas bases, SQL Server normalmente resuelve el acceso vía
    "ownership chaining" sin necesitar permisos directos sobre Syspro/
    STB_data. Si al probar con este usuario aparecen errores de permisos
    del tipo "SELECT permission denied on object ... Syspro", hay dos
    opciones (usar la de menor privilegio que resuelva el caso):
      a) Otorgar SELECT explícito sobre las tablas base concretas en
         Syspro que la vista necesita (nunca db_datareader completo).
      b) Habilitar cross-db ownership chaining SOLO entre PlantaEmpacadora
         y Syspro (no a nivel de instancia completa):
         ALTER DATABASE Syspro SET DB_CHAINING ON;
         ALTER DATABASE PlantaEmpacadora SET DB_CHAINING ON;
      Evitar `sp_configure 'cross db ownership chaining', 1` a nivel de
      servidor: afecta a TODAS las bases, no solo a estas dos.
*/

USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'dashboard_ia_readonly')
BEGIN
    CREATE LOGIN dashboard_ia_readonly
        WITH PASSWORD = 'CAMBIA_ESTA_CONTRASEÑA',
        CHECK_POLICY = ON,
        CHECK_EXPIRATION = OFF;
END
GO

USE PlantaEmpacadora;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'dashboard_ia_readonly')
BEGIN
    CREATE USER dashboard_ia_readonly FOR LOGIN dashboard_ia_readonly;
END
GO

-- Sin roles amplios (db_datareader, db_owner, etc.): solo SELECT objeto
-- por objeto sobre lo que el dashboard y el asistente IA realmente usan.

GRANT SELECT ON dbo.AV_Produccion_Diaria           TO dashboard_ia_readonly;
GRANT SELECT ON dbo.AV_Produccion_Diaria_Resumen    TO dashboard_ia_readonly;
GRANT SELECT ON dbo.AV_Produccion_Diaria_2020       TO dashboard_ia_readonly;
GRANT SELECT ON dbo.EquiposIQF                      TO dashboard_ia_readonly;
GRANT SELECT ON dbo.AV_Facturas_Resumen             TO dashboard_ia_readonly;
GRANT SELECT ON dbo.AV_Facturas                     TO dashboard_ia_readonly;
GRANT SELECT ON dbo.AV_RecepcionLibras              TO dashboard_ia_readonly;
GRANT SELECT ON dbo.AV_LotesRemision                TO dashboard_ia_readonly;
GRANT SELECT ON dbo.AV_Items                        TO dashboard_ia_readonly;
GO

-- Verificación rápida (ejecutar como dashboard_ia_readonly o con
-- EXECUTE AS USER = 'dashboard_ia_readonly'):
--   SELECT TOP 5 * FROM dbo.AV_Produccion_Diaria;
--   INSERT INTO dbo.AV_Produccion_Diaria ... -- debe fallar con permiso denegado
