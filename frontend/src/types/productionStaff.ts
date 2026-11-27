export type StaffStatus = 'present' | 'absent' | 'excused' | 'off' | 'noProduction' | 'pending' | 'conflict';
export type StaffKind = 'production' | 'machine' | 'auxiliary' | 'supervisor' | 'unknown';
export type PayrollSource = 'calendar' | 'action' | 'clock' | 'attendance' | 'report' | 'payment' | 'payroll' | 'weighing' | 'activity';
export interface StaffEmployee {
  id: number; code: string; name: string; department: string; division: string; job: string; shift: string;
  kind: StaffKind; wildcard: boolean; status: StaffStatus; reason: string;
  area: string; areaBasis: string; areaDay: string | null; areaTime: string | null;
  /**
   * Actividad del día (catálogo Dcp_Actividades). Si la persona no tiene actividad específica,
   * el proceso con el sufijo de ACTIVITY_PROCESS_SUFFIX; las demás actividades del día van en otherActivities.
   */
  activityAssignment?: { source: 'check' | 'weighing' | 'unknown' | 'conflict'; process: string; line: string; start: string | null; end: string | null };
  activity: string; activityBasis: string; otherActivities: string[];
  dailyActivities?: { activity: string; line: string; process: string; area: string; start: string | null; end: string | null; hours: number | null }[];
  /** Renglón de la lista de departamentos de planta (1.1 Descabezado … 2.3 RRHH, gestión ambiental y mantenimiento). */
  plantDepartment: string; plantDepartmentBasis: string;
  paymentConcepts?: string[];
  derivedAbsence?: boolean;
  provisionalAbsence?: boolean;
  productionShift?: { shift: 'A' | 'B'; basis: string; active: boolean; entranceDeadline: number | null; nightEnd: number | null };
  biometricMarked: boolean; biometricEntry: boolean; biometricReview: boolean; hasPositivePayment: boolean;
  punchCount: number; hasCheck: boolean;
  /** Asistencia según STB (chequeo o pesa del día): base de las tarjetas Obra / Auxiliares. */
  stbAttendance?: boolean;
  actions: { code: string; label: string }[]; entry: string | null; exit: string | null;
  reportMark: 'A' | 'X' | null; firstPunch: string | null; lastPunch: string | null;
  sources: PayrollSource[]; hasAttendance: boolean; absenceRecorded: boolean;
}
export interface StaffCounts {
  biometricMarked: number; biometricEntry: number; biometricReview: number; biometricWithoutPayment: number; checkedPeople: number;
  derivedAbsent?: number;
  total: number; present: number; absent: number; provisionalAbsent?: number; confirmedAbsent?: number; excused: number; off: number;
  noProduction: number; pending: number; conflict: number; production: number;
  machine?: number; supervisor?: number; auxiliary: number; unknown: number; wildcard: number; absenceRate: number | null;
}
export interface StaffResponse {
  absenceReconciliation?: { recorded: number; conflicts: number; actionReference: number | null };
  absenceDataAvailable?: boolean;
  absenceCutoff?: { mode: 'production-shift' | 'checks-weighing' | 'biometric-checks'; timeZone: string; active: boolean };
  reconciliation?: { paymentPeople: number; payrollPeople: number; matchedPeople: number; onlyPaymentPeople: number; onlyPayrollPeople: number };
  attendanceReferences?: { source: 'STBPayroll'; activeSupervisors: number; latestAbsences: { day: string; count: number; report: string } | null } | null;
  locationSource: 'STB_data'; locationAvailable: boolean;
  report: { name: string; dayStart: string; cutoffVerified: boolean };
  source: 'STBPayroll' | 'STB_data' | 'STB_data + STBPayroll'; day: string; today: string; updatedAt: string; lastAttendance: string | null;
  warnings: string[]; summary: StaffCounts; areas: (StaffCounts & { area: string; presentProduction: number; presentAuxiliary: number; presentUnknown: number })[];
  employees: StaffEmployee[]; limitations: string[];
}
export interface StaffHistoryDay extends StaffCounts {
  shifts?: (StaffCounts & { shift: string })[];
  absenceDataAvailable?: boolean;
  day: string;
  presentMachine?: number; absentMachine?: number; presentSupervisor?: number; absentSupervisor?: number;
  presentProduction?: number; absentProduction?: number; presentAuxiliary?: number; absentAuxiliary?: number;
  /** Altas y bajas de planilla de ese día (solo en /personal-produccion/rango). */
  hires?: number; exits?: number; hiresProduction?: number; hiresAuxiliary?: number; exitsProduction?: number; exitsAuxiliary?: number;
}
export interface StaffHistoryResponse {
  report: { name: string; dayStart: string; cutoffVerified: boolean };
  source: 'STBPayroll' | 'STB_data' | 'STB_data + STBPayroll'; from: string; to: string; today: string; updatedAt: string; lastAttendance: string | null;
  warnings: string[]; days: StaffHistoryDay[]; limitations: string[];
}
