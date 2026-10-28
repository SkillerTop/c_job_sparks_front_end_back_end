import type {
  Employee,
  ProjectTeam,
  QualityGate,
  Role,
  SparkSettings,
  SparkTransaction,
  SparkType,
  PerformanceRewardTier,
  PerformanceThresholdSettings,
} from '@/models';
import { getActiveLocale } from '@/utils/locale';
import { DEFAULT_PERFORMANCE_THRESHOLDS } from '@/constants/app';
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

const tieredReward = (value: number, tiers: PerformanceRewardTier[]) => {
  if (!Number.isFinite(value) || value < 0) return 0;
  return tiers.reduce((reward, tier) => value >= tier.minimum ? tier.reward : reward, 0);
};

export const kpiReward = (
  value: number,
  tiers = DEFAULT_PERFORMANCE_THRESHOLDS.kpi,
) => tieredReward(value, Array.isArray(tiers) ? tiers : DEFAULT_PERFORMANCE_THRESHOLDS.kpi);

export const evaluationReward = (
  value: number,
  tiers = DEFAULT_PERFORMANCE_THRESHOLDS.personalCards,
) => tieredReward(value, Array.isArray(tiers) ? tiers : DEFAULT_PERFORMANCE_THRESHOLDS.personalCards);

export const performanceThresholdValidationIssue = (thresholds: PerformanceThresholdSettings) => {
  for (const [source, tiers] of Object.entries(thresholds) as Array<
    [keyof PerformanceThresholdSettings, PerformanceRewardTier[]]
  >) {
    const label = source === 'kpi' ? 'KPI' : 'Personal Cards';
    if (tiers.length !== 3) return `${label} must have exactly three reward tiers.`;
    for (const [index, tier] of tiers.entries()) {
      if (!Number.isFinite(tier.minimum) || tier.minimum < 0)
        return `${label} Tier ${index + 1}: minimum score must be zero or greater.`;
      if (!Number.isSafeInteger(tier.reward) || tier.reward < 0)
        return `${label} Tier ${index + 1}: White reward must be a non-negative whole number.`;
      if (index > 0 && tier.minimum <= tiers[index - 1]!.minimum)
        return `${label} Tier ${index + 1}: minimum score must be greater than Tier ${index}.`;
      if (index > 0 && tier.reward < tiers[index - 1]!.reward)
        return `${label} Tier ${index + 1}: White reward cannot be lower than Tier ${index}.`;
    }
  }
  if (thresholds.personalCards.some((tier) => tier.minimum > 5))
    return 'Personal Cards minimum scores cannot exceed 5.';
  return null;
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
  new Intl.NumberFormat(getActiveLocale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
