export type StaffStatus = 'present' | 'absent' | 'excused' | 'off' | 'noProduction' | 'pending' | 'conflict';
export type StaffKind = 'production' | 'auxiliary' | 'unknown';
export type PayrollSource = 'calendar' | 'action' | 'clock' | 'attendance' | 'report';
export interface StaffEmployee {
  id: number; code: string; name: string; department: string; division: string; job: string; shift: string;
  kind: StaffKind; wildcard: boolean; status: StaffStatus; reason: string;
  area: string; areaBasis: string; areaDay: string | null; areaTime: string | null;
  actions: { code: string; label: string }[]; entry: string | null; exit: string | null;
  reportMark: 'A' | 'X' | null; firstPunch: string | null; lastPunch: string | null;
  sources: PayrollSource[]; hasAttendance: boolean; absenceRecorded: boolean;
}
export interface StaffCounts {
  total: number; present: number; absent: number; excused: number; off: number;
  noProduction: number; pending: number; conflict: number; production: number;
  auxiliary: number; unknown: number; wildcard: number; absenceRate: number | null;
}
export interface StaffResponse {
  locationSource: 'STB_data'; locationAvailable: boolean;
  report: { name: string; dayStart: string; cutoffVerified: boolean };
  source: 'STBPayroll'; day: string; today: string; updatedAt: string; lastAttendance: string | null;
  warnings: string[]; summary: StaffCounts; areas: (StaffCounts & { area: string; presentProduction: number; presentAuxiliary: number; presentUnknown: number })[];
  employees: StaffEmployee[]; limitations: string[];
}
export interface StaffHistoryDay extends StaffCounts { day: string }
export interface StaffHistoryResponse {
  report: { name: string; dayStart: string; cutoffVerified: boolean };
  source: 'STBPayroll'; from: string; to: string; today: string; updatedAt: string; lastAttendance: string | null;
  warnings: string[]; days: StaffHistoryDay[]; limitations: string[];
}
