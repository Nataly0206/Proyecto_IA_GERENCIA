import type { StaffEmployee } from './production-staff.model';
import { hasProductionShiftEvidence } from './production-staff-shift';

export const STAFF_TIME_ZONE = 'America/Tegucigalpa';
const localDay = (now: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: STAFF_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);
const localMinutes = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: STAFF_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now).split(':').map(Number);
  return parts[0] * 60 + parts[1];
};
export function isProductionShiftDue(person: StaffEmployee, day: string, now: Date): boolean {
  if (!hasProductionShiftEvidence(person)) return false;
  const schedule = person.productionShift!;
  const today = localDay(now), minute = localMinutes(now);
  if (day === today) return minute > schedule.entranceDeadline!;
  // La parte posterior a medianoche del turno B pertenece a la jornada anterior.
  const previous = new Date(`${today}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return day === previous.toISOString().slice(0, 10) && schedule.shift === 'B'
    && schedule.nightEnd !== null && minute <= schedule.nightEnd;
}
const deadlineLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
/** Solo el turno identificado cuya ventana de entrada ya venció puede generar una falta provisional. */
export function applyProvisionalStaffAbsences(people: StaffEmployee[], day: string, now: Date): StaffEmployee[] {
  return people.map(person => person.status === 'pending' && person.sources.includes('payroll')
    && !person.hasAttendance && !person.firstPunch && !person.lastPunch && !person.entry && !person.exit
    && !person.paymentConcepts?.length && isProductionShiftDue(person, day, now)
    ? { ...person, status: 'absent', reportMark: 'X', provisionalAbsence: true,
      reason: `Falta provisional del turno ${person.productionShift!.shift}: pasó su hora límite de entrada (${deadlineLabel(person.productionShift!.entranceDeadline!)}) sin pago, marcación ni novedad. Turno según ${person.productionShift!.basis}. Se recalcula al registrar asistencia.` }
    : person);
}
