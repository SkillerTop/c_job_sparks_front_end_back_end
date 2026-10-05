export type Role = 'Employee' | 'Coordinator' | 'GPM' | 'Head' | 'Top Management' | 'Administrator';
export type SparkType = 'White' | 'Yellow' | 'Blue' | 'Radiant';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected';
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface Department {
  id: string;
  name: string;
  headId: string;
  active: boolean;
}

export interface Employee {
  id: string;
  name: string;
  initials: string;
  title: string;
  departmentId: string;
  role: Role;
  email: string;
  active: boolean;
  hasCoordinationExperience: boolean;
  managerId?: string;
}

export interface ProjectTeamMember {
  employeeId: string;
  responsibility: 'Coordinator' | 'Registrar' | 'Member';
  workedHours: number;
}

export interface ProjectTeam {
  id: string;
  name: string;
  gpmId: string;
  active: boolean;
  members: ProjectTeamMember[];
}

export interface SparkCategory {
  id: string;
  name: string;
  description: string;
  sparkType: Exclude<SparkType, 'Radiant'>;
  amount: number;
  period: 'Quarterly' | 'Yearly' | 'One-time' | 'Unrestricted';
  active: boolean;
}

export type ReferenceDraft =
  | { kind: 'employees'; data: Employee }
  | { kind: 'departments'; data: Department }
  | { kind: 'categories'; data: SparkCategory };

export interface SparkTransaction {
  id: string;
  employeeId: string;
  departmentId?: string;
  dateTime: string;
  sparkType: SparkType;
  amount: number;
  transactionType: 'Credit' | 'Debit';
  source: string;
  category: string;
  categoryId?: string;
  description: string;
  awardedBy?: string;
  approvedBy?: string;
  quarter: string;
  relatedRequestId?: string;
  status: 'Completed' | 'Reversed';
}

export interface PeerRecognition {
  id: string;
  senderId: string;
  recipientId: string;
  category: string;
  categoryId?: string;
  description: string;
  createdAt: string;
  status: RequestStatus;
  rejectionReason?: string;
}

export interface AwardRequest {
  id: string;
  employeeId: string;
  awardedBy: string;
  sparkType: SparkType;
  amount: number;
  category: string;
  categoryId?: string;
  description: string;
  createdAt: string;
  status: RequestStatus;
  source: string;
  rejectionReason?: string;
}

export interface QualityGate {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  createdBy: string;
  status: 'Active' | 'Expired' | 'Cancelled';
}

export interface PerformanceRecord {
  id: string;
  employeeId: string;
  quarter: string;
  kpi: number;
  evaluation: number;
  kpiReward: number;
  evaluationReward: number;
  kpiImported?: boolean;
  evaluationImported?: boolean;
}

export interface Achievement {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  sparkType: SparkType;
  category: string;
  date: string;
  awardedBy: string;
}

export interface DisenchantRequest {
  id: string;
  employeeId: string;
  departmentId: string;
  sparkType: Exclude<SparkType, 'Radiant'>;
  amount: number;
  rate: number;
  moneyValue: number;
  currency: string;
  createdAt: string;
  accountingPeriod: string;
  status: 'Created' | 'Exported' | 'Paid';
}

export interface AuditEvent {
  id: string;
  action: string;
  actorId: string;
  subjectId: string;
  dateTime: string;
  details: string;
}

export interface ImportPreview {
  id: string;
  kind: 'KPI' | 'Evaluation';
  quarter: string;
  fileName: string;
  employeesFound: number;
  employeesNotFound: number;
  invalidValues: number;
  qualityGateActive: number;
  expectedWhiteSparks: number;
  duplicate: boolean;
  rows: Array<{
    lineNumber: number;
    employeeId?: string;
    employee: string;
    value: number | string;
    reward: number;
    status: 'Ready' | 'Blocked' | 'Invalid' | 'Unknown';
    error?: string;
  }>;
}

export interface QualityGateInput {
  startDate: string;
  endDate: string;
  reason: string;
}

export interface SparkSettings {
  currentQuarter: string;
  whiteToYellow: number;
  yellowToBlue: number;
  conversionFee: number;
  yellowQuarterlyLimit: number;
  peerBaseLimit: number;
  coordinatorTeamMultiplier: number;
  disenchantRate: number;
  currency: string;
  sparkMoneyValues: Record<Exclude<SparkType, 'Radiant'>, number>;
}

export interface AppSnapshot {
  categories: SparkCategory[];
  employees: Employee[];
  departments: Department[];
  projectTeams: ProjectTeam[];
  transactions: SparkTransaction[];
  recognitions: PeerRecognition[];
  awardRequests: AwardRequest[];
  qualityGates: QualityGate[];
  performance: PerformanceRecord[];
  achievements: Achievement[];
  disenchantRequests: DisenchantRequest[];
  auditEvents: AuditEvent[];
  settings: SparkSettings;
}

export interface RecognitionInput {
  recipientId: string;
  category: string;
  description: string;
}

export interface AwardInput {
  employeeId: string;
  sparkType: SparkType;
  category: string;
  description: string;
}
