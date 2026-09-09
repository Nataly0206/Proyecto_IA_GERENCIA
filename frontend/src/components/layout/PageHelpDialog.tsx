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
    purpose: 'Resume cuánta materia prima (camarón entero) ha entrado a planta y cómo se reparte por proveedor, mes y gramaje.',
    sections: [
      { title: 'Indicadores de hoy, semana y mes', body: 'Muestran las libras recibidas hoy, en la semana, en lo que va del mes y el promedio por semana (libras del mes ÷ número de semanas transcurridas). Estos contadores no cambian con el filtro de fechas.' },
      { title: 'Materia prima por proveedor', body: 'Tarjetas con las libras recibidas por proveedor en el rango de fechas seleccionado.' },
      { title: 'Materia Prima por Proveedor/Gramaje — Mensual', body: 'Una sola tarjeta con las libras recibidas en los últimos 3 meses con datos, agrupadas por mes y, a elección, por proveedor o por gramaje (talla del camarón, ej. "51/60") — usa el selector Proveedor/Gramaje para cambiar. Tiene vista de tabla, gráfica comparativa y gráfica de tendencia. El botón "Proveedores" abre una lista de casillas para elegir cuáles se muestran; esa selección se guarda en este navegador para tu usuario.' },
      { title: 'Detalle de Materia Prima por Talla', body: 'Tabla cruzada con una fila por proveedor y una columna por talla. Incluye el total de cada proveedor, el total de cada talla y el total general. Responde al rango de fechas del filtro.' },
    ],
    dataNote: 'Los nombres que aparecen aquí corresponden a proveedores registrados en las fuentes operativas; se muestran para dar trazabilidad a las compras de materia prima.',
  },
  recepcion: {
    title: 'Recepción',
    purpose: 'Resume el camarón que ingresa desde las fincas y cuánto queda pendiente de pasar a proceso.',
    sections: [
      { title: 'Indicadores de recepción', body: 'Muestran las libras recibidas hoy, durante la semana actual (lunes a hoy), durante el mes actual y el saldo pendiente de procesar. No cambian al modificar el rango histórico.' },
      { title: 'Remisiones recibidas — detalle', body: 'Una fila por remisión, finca y laguna dentro del rango de fechas, con libras de remisión, libras de basura, libras de cola y de cabeza pesadas, el total cola + cabeza y dos rendimientos: "finca" (cola ÷ libras de remisión) y "planta" (cola ÷ (cola + cabeza)). La fila de Total suma las libras y recalcula los rendimientos de forma ponderada sobre el rango. Es la misma información del tablero de Power BI (vista RemisionesPlantaPBI).' },
    ],
  },
  descabezado: {
    title: 'Descabezado',
    purpose: 'Mide el volumen descabezado, la dotación y la producción de cola y cabezas.',
    sections: [
      { title: 'Indicadores de volumen', body: 'Muestran las libras descabezadas hoy, en la semana actual y en el mes actual, además de las personas distintas que trabajaron hoy.' },
      { title: 'Por qué muestra personas', body: 'El número de personas es un conteo de individuos distintos con registros operativos. Se usa para entender la dotación que produjo el volumen; el resumen no muestra sus nombres.' },
      { title: 'Tablas diaria y mensual', body: 'Muestran fecha, personas únicas, libras de cola, libras de cabezas, libras totales y rendimiento por hora. La tabla mensual cuenta a cada persona una sola vez dentro de cada mes.' },
    ],
  },
  clasificado: {
    title: 'Clasificado',
    purpose: 'Explica cuánto producto fue clasificado, en qué tallas quedó y qué mesa fue responsable del registro.',
    sections: [
      { title: 'Indicadores de libras', body: 'Tres contadores: libras clasificadas hoy (día en curso), por semana (lunes a domingo en curso) y por mes (mes en curso). No cambian con el rango de fechas del filtro.' },
      { title: 'Inventario de clasificado disponible', body: 'Tabla con el producto clasificado que sigue disponible (no transferido ni procesado): bins y libras por talla. “Ver detalle” abre el desglose por finca, laguna/ciclo, remisión, lote y talla inicial, cruzado por destino, con totales por filas y columnas. Es una foto del momento, no depende del filtro.' },
      { title: 'Por qué aparecen nombres de personas', body: 'El sistema de origen identifica cada máquina o mesa de clasificado mediante el nombre de su responsable. Por eso la tarjeta "Libras Clasificadas por Máquina" puede mostrar nombres: no representa producción individual, sino la mesa y las libras registradas bajo su responsable.' },
      { title: 'Por talla y por máquina', body: 'La talla explica la composición del producto clasificado; la máquina o responsable permite ubicar dónde se clasificó. Las tarjetas por talla y por máquina responden al rango de fechas y turno; las tablas "Clasificado por Talla" diaria y mensual muestran la evolución por talla (la mensual, últimos 12 meses).' },
    ],
    dataNote: 'Los nombres proceden del catálogo DCP_RESPONSABLES de la base operativa. Deben interpretarse como identificadores de mesa y utilizarse únicamente para seguimiento interno autorizado.',
  },
  pelado: {
    title: 'Pelado',
    purpose: 'Muestra el volumen pelado y cómo se distribuye entre salas, estilos y personal registrado.',
    sections: [
      { title: 'Indicadores de hoy', body: 'Resumen las libras peladas durante el día y los registros operativos disponibles.' },
      { title: 'Por sala, estilo y talla', body: 'Los tres desgloses parten de los mismos registros de libras, por lo que sus totales concilian. Si un registro no tiene sala o talla catalogada se conserva como “Sin sala” o “Sin talla” para no perderlo.' },
      { title: 'Por talla · hoy', body: 'El botón "Por talla · hoy" en la esquina de la tabla de Actividad de Pelado por Sala abre el detalle de libras peladas del día en curso agrupadas por talla, con su total. No cambia con el filtro de fechas. El detalle "Libras Peladas por Talla" de la página sí responde al rango y turno seleccionados.' },
      { title: 'Personas y pago', body: 'Cuando se muestran empleados, el valor representa personas distintas con registros en el período. Se relaciona con libras y pago para analizar capacidad y costo real, no para sumar empleados entre filas.' },
      { title: 'Períodos', body: 'Los reportes diarios usan el rango y turno seleccionados. Los mensuales muestran los últimos 12 meses.' },
    ],
  },
  dashboard: {
    title: 'IQF',
    purpose: 'Resume la producción congelada y el rendimiento por hora de las líneas IQF.',
    sections: [
      { title: 'Contadores actuales', body: 'Muestran la actividad IQF disponible para el día en curso y sirven como lectura rápida de la operación.' },
      { title: 'Libras congeladas netas', body: 'Agrupa las libras por tipo de proceso. Excluye FRESH TAIL, porque corresponde a compra de materia prima, y reempaque, para evitar mezclar movimientos que no representan congelación neta nueva.' },
      { title: 'Rendimiento por hora', body: 'Compara el promedio de libras por hora por línea IQF. La vista diaria usa el rango seleccionado; la mensual muestra los últimos 12 meses. La línea SAL se excluye porque no corresponde a una línea IQF comparable.' },
    ],
  },
  exportaciones: {
    title: 'Exportaciones',
    purpose: 'Da seguimiento al producto despachado: sus clientes, estilos y contenedores.',
    sections: [
      { title: 'Semana en curso', body: 'Los indicadores muestran las libras exportadas de lunes a domingo, repartidas entre Francia, UK, AC Holding y terceros (todo lo que no es de los tres anteriores), más el total de la semana.' },
      { title: 'Detalle de contenedores', body: 'Muestra fecha, contenedor, cliente, estilo, másteres y libras para rastrear exactamente qué se despachó — una fila por contenedor, estilo y cliente.' },
      { title: 'Por estilo y por cliente', body: 'El estilo explica la mezcla exportada y el cliente identifica el destino comercial. Las tarjetas por estilo responden al rango de fechas del filtro; la tabla mensual por cliente muestra los últimos 6 meses.' },
    ],
    dataNote: 'Los nombres de clientes se muestran porque son necesarios para comprobar el cumplimiento de cada pedido y contenedor.',
  },
  inventory: {
    title: 'Inventario',
    purpose: 'Permite explorar el producto disponible agrupándolo por las dimensiones que sean útiles para la consulta.',
    sections: [
      { title: 'Filas y agrupaciones', body: 'Puedes arrastrar dimensiones como cliente, estilo, item, talla o empaque para cambiar el nivel de detalle. Los subtotales y el gran total se recalculan con esa estructura.' },
      { title: 'Filtros', body: 'El ícono de filtro en cada columna limita los registros visibles. Las preferencias de agrupación y filtros quedan guardadas en este navegador para tu usuario.' },
      { title: 'Peso y cantidad serial', body: 'Peso kilos suma el peso disponible; cantidad serial cuenta las unidades o seriales asociados. Los nombres de clientes e items permiten identificar a qué producto corresponde el saldo.' },
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
