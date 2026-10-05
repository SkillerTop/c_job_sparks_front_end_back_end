import type {
  Employee,
  ProjectTeam,
  QualityGate,
  Role,
  SparkSettings,
  SparkTransaction,
  SparkType,
} from '@/models';
import { todayIso } from './quarter';

export const calculateBalances = (transactions: SparkTransaction[], employeeId: string) => {
  const initial: Record<SparkType, number> = { White: 0, Yellow: 0, Blue: 0, Radiant: 0 };
  return transactions
    .filter((transaction) => transaction.employeeId === employeeId && transaction.status === 'Completed')
    .reduce((balance, transaction) => {
      balance[transaction.sparkType] += transaction.amount;
      return balance;
    }, initial);
};

export const calculateLifetimeEarnings = (transactions: SparkTransaction[], employeeId: string) => {
  const initial: Record<SparkType, number> = { White: 0, Yellow: 0, Blue: 0, Radiant: 0 };
  const earnings = transactions
    .filter(
      (transaction) =>
        transaction.employeeId === employeeId &&
        transaction.status === 'Completed' &&
        transaction.source !== 'Conversion' &&
        (transaction.amount > 0 || transaction.source.endsWith(' Correction')),
    )
    .reduce((earnings, transaction) => {
      earnings[transaction.sparkType] += transaction.amount;
      return earnings;
    }, initial);
  for (const type of Object.keys(earnings) as SparkType[]) earnings[type] = Math.max(0, earnings[type]);
  return earnings;
};

export const kpiReward = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value < 1.02) return 0;
  if (value < 1.07) return 1;
  if (value < 1.12) return 2;
  return 3;
};

export const evaluationReward = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value < 3.5) return 0;
  if (value < 4.2) return 1;
  if (value < 4.5) return 2;
  return 3;
};

export const conversionRule = (
  from: SparkType,
  settings: Pick<SparkSettings, 'whiteToYellow' | 'yellowToBlue' | 'conversionFee'>,
) => {
  if (from === 'White')
    return {
      ratio: settings.whiteToYellow,
      to: 'Yellow' as const,
      feeType: 'White' as const,
      fee: settings.conversionFee,
      totalCost: settings.whiteToYellow + settings.conversionFee,
    };
  if (from === 'Yellow')
    return {
      ratio: settings.yellowToBlue,
      to: 'Blue' as const,
      feeType: 'Yellow' as const,
      fee: settings.conversionFee,
      totalCost: settings.yellowToBlue + settings.conversionFee,
    };
  return null;
};

export const isQualityGateActive = (employeeId: string, gates: QualityGate[], date = todayIso()) =>
  gates.some(
    (gate) =>
      gate.employeeId === employeeId &&
      gate.status === 'Active' &&
      gate.startDate <= date &&
      gate.endDate >= date,
  );

export const recognitionQuota = (
  senderId: string,
  role: Role,
  settings: SparkSettings,
  employees: Employee[],
  projectTeams: ProjectTeam[] = [],
) => {
  const activeEmployeeIds = new Set(
    employees
      .filter((employee) => employee.active && employee.role !== 'Administrator')
      .map((employee) => employee.id),
  );
  const teamColleagueIds = new Set(
    projectTeams
      .filter(
        (team) =>
          team.active &&
          team.members.some(
            (member) => member.employeeId === senderId && member.workedHours > 0,
          ),
      )
      .flatMap((team) =>
        team.members
          .filter(
            (member) =>
              member.employeeId !== senderId &&
              member.workedHours > 0 &&
              activeEmployeeIds.has(member.employeeId),
          )
          .map((member) => member.employeeId),
      ),
  );
  return (
    settings.peerBaseLimit +
    (role === 'Coordinator'
      ? Math.floor(teamColleagueIds.size / settings.coordinatorTeamMultiplier)
      : 0)
  );
};

export const gpmWhiteAwardQuota = (controlledCoordinatorCount: number, multiplier: number) =>
  controlledCoordinatorCount > 0 ? Math.ceil(controlledCoordinatorCount / multiplier) : 0;

export const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
