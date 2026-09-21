import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { DashboardView } from './DashboardLayout';

type HelpSection = {
  title: string;
  body: string;
};

type PageHelp = {
  title: string;
  purpose: string;
  sections: HelpSection[];
  dataNote?: string;
};

const PAGE_HELP: Record<DashboardView, PageHelp> = {
  'compra-materia-prima': {
    title: 'Compra de materia prima',
    purpose: 'Resume la materia prima recibida en libras WSO, su equivalente entero y cómo se reparte por proveedor, mes y talla.',
    sections: [
      { title: 'Indicadores HOSO de hoy, semana y mes', body: 'Muestran libras HOSO equivalentes para la última fecha registrada, su semana, su mes y el promedio HOSO por semana. Cada valor se calcula dividiendo el valor de la fuente entre 0.65. No cambian con el filtro de fechas.' },
      { title: 'Materia prima por proveedor — WSO y Entero', body: 'Hay una sola fila de tarjetas y una tarjeta por proveedor. El botón Proveedores permite elegir cuáles mostrar y conserva la selección para tu usuario. Dentro de cada tarjeta aparecen lado a lado las libras WSO registradas y su equivalente Entero (WSO ÷ 0.65); los porcentajes y la tarjeta TOTAL se recalculan con los proveedores visibles. El botón Ver detalle abre la matriz proveedor × talla.' },
      { title: 'Materia Prima por Proveedor/Talla — Mensual', body: 'Muestra libras WSO de los últimos 3 meses con datos. El selector Proveedor/Talla cambia la agrupación. Tiene vista de tabla y gráfica comparativa mensual. El botón Proveedores elige cuáles participan y guarda la selección para tu usuario.' },
      { title: 'Detalle de Materia Prima por Talla', body: 'Tabla cruzada con una fila por proveedor y una columna por talla. Incluye el total de cada proveedor, el total de cada talla y el total general. Responde al rango de fechas del filtro.' },
    ],
    dataNote: 'Los nombres que aparecen aquí corresponden a proveedores registrados en las fuentes operativas; se muestran para dar trazabilidad a las compras de materia prima.',
  },
  recepcion: {
    title: 'Recepción',
    purpose: 'Resume el camarón que ingresa desde las fincas y cuánto queda pendiente de pasar a proceso.',
    sections: [
      { title: 'Indicadores de recepción', body: 'Muestran las libras recibidas HOSO hoy, durante la semana actual (lunes a hoy), durante el mes actual y el saldo pendiente de procesar. El saldo pendiente conserva su rótulo propio. No cambian al modificar el rango histórico.' },
      { title: 'Remisiones recibidas — detalle', body: 'Una fila por remisión, finca y laguna dentro del rango de fechas, con libras de remisión, libras de basura, libras de cola y de cabeza pesadas, el total cola + cabeza y dos rendimientos: "finca" (cola ÷ libras de remisión) y "planta" (cola ÷ (cola + cabeza)). La fila de Total suma las libras y recalcula los rendimientos de forma ponderada sobre el rango. Es la misma información del tablero de Power BI (vista RemisionesPlantaPBI).' },
    ],
  },
  descabezado: {
    title: 'Descabezado',
    purpose: 'Mide el volumen descabezado, la dotación y la producción de cola y cabezas.',
    sections: [
      { title: 'Indicadores de volumen', body: 'Muestran las libras descabezadas hoy, en la semana actual y en el mes actual, las personas distintas que trabajaron hoy y, al final, las libras promedio por hora de hoy. Este promedio divide el total entero procesado entre las horas transcurridas desde el primer hasta el último registro válido del día.' },
      { title: 'Por qué muestra personas', body: 'El número de personas es un conteo de individuos distintos con registros operativos. Se usa para entender la dotación que produjo el volumen; el resumen no muestra sus nombres.' },
      { title: 'Tablas diaria y mensual', body: 'Muestran fecha, personas únicas, libras de cola, libras de cabezas, libras totales y rendimiento por hora. La tabla mensual cuenta a cada persona una sola vez dentro de cada mes.' },
    ],
  },
  clasificado: {
    title: 'Clasificado',
    purpose: 'Explica cuánto producto fue clasificado, en qué tallas quedó y en qué máquina se registró.',
    sections: [
      { title: 'Indicadores de libras', body: 'Muestran las libras clasificadas hoy, por semana y por mes, además de las libras clasificadas por hora de hoy. El rendimiento por hora divide las libras netas no anuladas de hoy entre el tiempo desde el inicio de clasificación más temprano hasta el final más tardío. No cambian con el rango histórico.' },
      { title: 'Inventario de clasificado disponible', body: 'Tabla con el producto clasificado que sigue disponible (no transferido ni procesado): bins y libras por talla. “Ver detalle” abre el desglose por finca, laguna/ciclo, remisión, lote y talla inicial, cruzado por destino, con totales por filas y columnas. Es una foto del momento, no depende del filtro.' },
      { title: 'Máquinas sin asignar', body: 'Los registros cuyo tanque de clasificación no identifica una máquina aparecen como “Sin máquina asignada”. Sus libras permanecen en el total.' },
      { title: 'Por talla y por máquina', body: 'La sección por máquina responde al rango de fechas y turno. Su selector “Máquinas” muestra u oculta tarjetas y recalcula solo el total de esa sección. El botón “Ver por talla” abre una tabla de libras por talla con los mismos filtros de fecha y turno, independiente del selector de máquinas. Las tablas "Clasificado por Talla" diaria y mensual comparten el orden de columnas guardado para todos; quien tenga el permiso de ordenar tallas puede arrastrar sus encabezados para cambiarlo. La mensual usa los últimos 12 meses.' },
    ],
    dataNote: 'La máquina procede de CL_LLENADO_RECIPIENTES.ID_TANQUE y del catálogo CL_TANQUES de la base operativa.',
  },
  pelado: {
    title: 'Pelado',
    purpose: 'Muestra el volumen pelado y cómo se distribuye entre salas, estilos y personal registrado.',
    sections: [
      { title: 'Indicadores de hoy', body: 'Resumen las libras peladas durante el día por estilo, el total y las libras por hora promedio. El promedio divide el total pelado de hoy entre el tiempo transcurrido desde el primer registro válido de pelado hasta la hora actual.' },
      { title: 'Por sala, estilo y talla', body: 'Los tres desgloses parten de los mismos registros de libras, por lo que sus totales concilian. “Libras Peladas por Estilo” muestra el botón “Ver por talla” en la esquina superior derecha; al pulsarlo abre una tabla con Talla, Libras peladas y Total para el mismo rango y turno. Si falta catálogo se conserva como “Sin sala” o “Sin talla”.' },
      { title: 'Por talla · hoy', body: 'El botón "Por talla · hoy" en la tabla de Actividad de Pelado por Sala abre el detalle exclusivo del día en curso y no cambia con el filtro. Es distinto de “Ver por talla” en Libras Peladas por Estilo, cuya tabla sí responde al rango y turno seleccionados.' },
      { title: 'Personas y pago', body: 'Cuando se muestran empleados, el valor representa personas distintas con registros en el período. Se relaciona con libras y pago para analizar capacidad y costo real, no para sumar empleados entre filas.' },
      { title: 'Períodos', body: 'Los reportes diarios usan el rango y turno seleccionados. Los mensuales muestran los últimos 12 meses.' },
    ],
  },
  dashboard: {
    title: 'IQF',
    purpose: 'Resume la producción congelada, el rendimiento por hora y las horas trabajadas por IQF.',
    sections: [
      { title: 'Contadores actuales', body: 'Muestran la actividad IQF disponible para el día en curso y sirven como lectura rápida de la operación.' },
      { title: 'Libras congeladas netas', body: 'Agrupa las libras por tipo de proceso. Excluye FRESH TAIL, porque corresponde a compra de materia prima, y reempaque, para evitar mezclar movimientos que no representan congelación neta nueva.' },
      { title: 'Seleccionar reporte diario o mensual', body: 'Cada tarjeta tiene una lista desplegable ajustada al ancho del texto. En la diaria puedes elegir “Rendimientos IQF x Hora — Diario” o “Horas Trabajadas por IQF — Diario”; en la mensual, “Rendimientos IQF x Hora — Mensual” o “Horas Trabajadas por IQF — Mensual”. Las selecciones son independientes. Diario respeta Desde, Hasta y Turno. Mensual usa los últimos 12 meses hasta hoy y el turno seleccionado; no cambia con Desde/Hasta y el mes actual puede estar incompleto.' },
      { title: 'Vistas de los dos indicadores', body: 'Rendimientos y Horas mantienen el mismo alto y tienen los mismos botones: Tabla y Gráfica en Diario; Tabla, Gráfica y Tendencia en Mensual. Los nombres son siempre IQF # 1 (Espiral), IQF # 2 (Lineal) e IQF # 3 (Lineal). En la gráfica mensual de rendimiento, las columnas comparan cada IQF y la línea “Promedio general” muestra las libras por hora promedio del mes. El eje presenta el mes abreviado con el año debajo.' },
      { title: 'Horas trabajadas por IQF', body: 'Se calculan entre la primera y la última lectura de cada turno y se suman por equipo y día. En Mensual, cada celda muestra el promedio de esas horas diarias durante los días con registros válidos de ese mes. Solo se incluyen turnos con más de 15 minutos entre lecturas; no se descuentan pausas. Son horas decimales: 7.60 equivale a 7 horas y 36 minutos.' },
      { title: 'Promedios de horas', body: 'En Tabla aparecen los equipos en columnas y cada día o mes en filas. La columna “Promedio” muestra la media entre los IQF con registro en esa fila. Al pie se muestra “Promedio diario” o “Promedio mensual” de cada equipo, además del promedio general de todas las celdas con registro. El pie de la columna Promedio es la media de los promedios de las filas. Las celdas sin registro se muestran con — y se excluyen de los promedios; no equivalen a un cero medido.' },
      { title: 'Rendimiento por hora', body: 'Compara el promedio de libras por hora de cada IQF. La vista diaria usa el rango seleccionado; la mensual muestra los últimos 12 meses y añade el promedio general ponderado de cada mes. La línea SAL se excluye porque no corresponde a una línea IQF comparable.' },
    ],
  },
  exportaciones: {
    title: 'Exportaciones',
    purpose: 'Da seguimiento al producto despachado: sus clientes, estilos y contenedores.',
    sections: [
      { title: 'Semana en curso', body: 'Los indicadores muestran el peso exportado de lunes a domingo, repartido entre Francia, UK, AC Holding y terceros (todo lo que no es de los tres anteriores), más el total de la semana. El selector de unidad en Filtros permite ver los pesos en lbs o kg.' },
      { title: 'Contenedores exportados', body: 'La tabla principal muestra una sola fila por contenedor, con fecha, referencia, cliente, cantidad de estilos, másteres, anillos por máster y peso total en la unidad seleccionada. “Ver detalle” abre su desglose por cliente y estilo; los conteos de másteres y contenedores no cambian al elegir kg o lbs.' },
      { title: 'Por estilo y por cliente', body: 'El estilo explica la mezcla exportada y el cliente identifica el destino comercial. Las tarjetas por estilo responden al rango de fechas del filtro; la tabla mensual muestra los últimos 6 meses y su botón Clientes permite elegir cuáles mostrar. La selección se guarda en tu cuenta y se recupera al iniciar sesión desde otro dispositivo.' },
    ],
    dataNote: 'Los nombres de clientes se muestran porque son necesarios para comprobar el cumplimiento de cada pedido y contenedor.',
  },
  inventory: {
    title: 'Inventario',
    purpose: 'Permite explorar el producto disponible agrupándolo por las dimensiones que sean útiles para la consulta.',
    sections: [
      { title: 'Filas y agrupaciones', body: 'Puedes arrastrar dimensiones como cliente, estilo, item, talla o empaque para cambiar el nivel de detalle. La tabla presenta una jerarquía según ese orden: cada valor repetido se muestra una sola vez hasta que cambia su grupo. Los subtotales y el gran total se recalculan con la estructura seleccionada.' },
      { title: 'Filtros', body: 'El ícono de filtro en cada columna limita los registros visibles. Las preferencias de agrupación y filtros quedan guardadas en tu cuenta y se recuperan al iniciar sesión.' },
      { title: 'Peso y cantidad serial', body: 'Peso kilos suma el peso disponible; cantidad serial cuenta las unidades o seriales asociados. Los nombres de clientes e items permiten identificar a qué producto corresponde el saldo.' },
    ],
  },
  'power-bi': {
    title: 'Power BI',
    purpose: 'Muestra el reporte corporativo de Power BI dentro del dashboard, sin solicitar un inicio de sesión adicional en Microsoft.',
    sections: [
      { title: 'Navegación', body: 'Usa las pestañas del reporte y sus controles internos para cambiar de página, explorar visualizaciones y aplicar filtros.' },
      { title: 'Filtros', body: 'El panel de filtros puede expandirse u ocultarse desde el propio reporte. Los datos y permisos disponibles son administrados en Power BI.' },
    ],
  },
  users: {
    title: 'Usuarios',
    purpose: 'Administra quién puede entrar al dashboard y qué secciones puede consultar.',
    sections: [
      { title: 'Datos mostrados', body: 'La tabla incluye nombre, usuario, correo, permisos y estado para identificar cada acceso y poder administrarlo correctamente.' },
      { title: 'Permisos', body: 'Cada permiso habilita una sección específica. Un administrador tiene acceso total; un usuario sin permisos no puede consultar módulos operativos.' },
      { title: 'Estado y contraseña', body: 'Activo permite iniciar sesión, inactivo bloquea el acceso y contraseña temporal indica que la persona debe cambiarla al ingresar.' },
    ],
    dataNote: 'Los nombres y correos son datos de administración de acceso. Solo se muestran a usuarios autorizados para gestionar cuentas.',
  },
};

export default function PageHelpDialog({ view, open, onClose }: {
  view: DashboardView;
  open: boolean;
  onClose: () => void;
}) {
  const help = PAGE_HELP[view];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{ pr: 6, pb: 1.25 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ width: 34, height: 34, borderRadius: 1, display: 'grid', placeItems: 'center', bgcolor: 'rgba(22, 74, 139, 0.08)', color: 'primary.main' }}>
            <HelpOutlineIcon />
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary" fontWeight={800}>Ayuda de esta página</Typography>
            <Typography variant="h6" fontWeight={800}>{help.title}</Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} aria-label="Cerrar ayuda" sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{help.purpose}</Typography>
        <Stack spacing={2} divider={<Divider flexItem />}>
          {help.sections.map((section) => (
            <Box key={section.title}>
              <Typography variant="subtitle2" fontWeight={800} gutterBottom>{section.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{section.body}</Typography>
            </Box>
          ))}
          {help.dataNote && (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'rgba(15, 118, 110, 0.07)', border: 1, borderColor: 'rgba(15, 118, 110, 0.18)' }}>
              <Typography variant="subtitle2" fontWeight={800} gutterBottom>Uso de los datos</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{help.dataNote}</Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
