export type Role = 'Employee' | 'Coordinator' | 'GPM' | 'Head' | 'Top Management' | 'Administrator';
export type SparkType = 'White' | 'Yellow' | 'Blue' | 'Radiant';
export type SparkBalances = Record<SparkType, number>;
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
  managerName?: string;
  managerEmail?: string;
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
  usageType: 'PeerRecognition' | 'Award' | 'Performance' | 'Administrative';
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
  amount: number;
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
  employeeName?: string;
  departmentId: string;
  sparkType: Exclude<SparkType, 'Radiant'>;
  amount: number;
  rate: number;
  moneyValue: number;
  currency: string;
  createdAt: string;
  accountingPeriod: string;
  status: 'Created' | 'Exported' | 'Paid' | 'Cancelled';
}

export interface FulfillmentContact {
  id: string;
  name: string;
  email: string;
  role: 'Director' | 'OfficeManager' | 'DepartmentHead';
  officeName: string | null;
}

export interface DisenchantReport {
  id: string;
  reportMonth: string;
  rangeStartedAt: string | null;
  rangeEndedAt: string;
  status: 'Created' | 'Submitted' | 'Paid';
  itemCount: number;
  moneyTotal: number;
  createdAt: string;
}

export interface DisenchantReportResult extends DisenchantReport {
  fileName: string;
  csv: string;
  lines: Array<{
    employeeName: string;
    sparkType: Exclude<SparkType, 'Radiant'>;
    sparkAmount: number;
    moneyAmount: number;
    currency: string;
  }>;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorId: string;
  actorName?: string;
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
  performanceThresholds: PerformanceThresholdSettings;
}

export interface PerformanceRewardTier {
  minimum: number;
  reward: number;
}

export interface PerformanceThresholdSettings {
  kpi: PerformanceRewardTier[];
  personalCards: PerformanceRewardTier[];
}

export interface AppSnapshot {
  shell?: {
    balances: SparkBalances;
    pendingApprovals: number;
    pendingDisenchant: number;
  };
  categories: SparkCategory[];
  employees: Employee[];
  departments: Department[];
  projectTeams: ProjectTeam[];
  transactions: SparkTransaction[];
  lifetimeEarnings?: SparkBalances;
  yellowAwardUsage?: Record<string, number>;
  departmentBalances: Record<string, SparkBalances>;
  recognitions: PeerRecognition[];
  awardRequests: AwardRequest[];
  qualityGates: QualityGate[];
  performance: PerformanceRecord[];
  achievements: Achievement[];
  disenchantRequests: DisenchantRequest[];
  disenchantReports: DisenchantReport[];
  fulfillmentContacts: FulfillmentContact[];
  auditEvents: AuditEvent[];
  shopEffects?: import('@/models/shop').ShopEffects;
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
  fulfillmentContactId?: string;
  radiantRewardKind?: 'RadiantAcrylic' | 'RadiantVesselModel';
  valuablePrizeDescription?: string;
}
