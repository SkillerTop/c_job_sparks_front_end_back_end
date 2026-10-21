export type PerformanceImportKind = 'KPI' | 'Evaluation';

export interface PerformanceRewardTier {
  minimum: number;
  reward: number;
}

export interface PerformanceThresholds {
  kpi: PerformanceRewardTier[];
  personalCards: PerformanceRewardTier[];
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  kpi: [
    { minimum: 1.02, reward: 1 },
    { minimum: 1.07, reward: 2 },
    { minimum: 1.12, reward: 3 },
  ],
  personalCards: [
    { minimum: 3.5, reward: 1 },
    { minimum: 4.2, reward: 2 },
    { minimum: 4.5, reward: 3 },
  ],
};

const isTier = (value: unknown): value is PerformanceRewardTier => {
  if (!value || typeof value !== 'object') return false;
  const tier = value as Partial<PerformanceRewardTier>;
  return typeof tier.minimum === 'number' && Number.isFinite(tier.minimum) && tier.minimum >= 0 &&
    typeof tier.reward === 'number' && Number.isSafeInteger(tier.reward) && tier.reward >= 0;
};

const isOrdered = (tiers: PerformanceRewardTier[]) =>
  tiers.length === 3 && tiers.every(isTier) && tiers.every((tier, index) =>
    index === 0 || tier.minimum > tiers[index - 1]!.minimum);

export const performanceThresholdsFromConfiguration = (configuration: unknown): PerformanceThresholds => {
  const candidate = configuration && typeof configuration === 'object'
    ? (configuration as { performanceThresholds?: Partial<PerformanceThresholds> }).performanceThresholds
    : undefined;
  if (!candidate || !Array.isArray(candidate.kpi) || !Array.isArray(candidate.personalCards) ||
      !isOrdered(candidate.kpi) || !isOrdered(candidate.personalCards))
    return structuredClone(DEFAULT_PERFORMANCE_THRESHOLDS);
  return { kpi: structuredClone(candidate.kpi), personalCards: structuredClone(candidate.personalCards) };
};

export const performanceRewardFor = (
  kind: PerformanceImportKind,
  value: number,
  thresholds: PerformanceThresholds,
) => {
  if (!Number.isFinite(value) || value < 0) return 0;
  const tiers = kind === 'KPI' ? thresholds.kpi : thresholds.personalCards;
  return tiers.reduce((reward, tier) => value >= tier.minimum ? tier.reward : reward, 0);
};
