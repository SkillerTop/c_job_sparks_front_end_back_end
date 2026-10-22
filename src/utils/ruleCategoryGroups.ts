import type { SparkCategory, SparkType } from '@/models';

export interface RuleCategoryGroup {
  key: string;
  label: string;
  sparkType: SparkType;
  usageType: Extract<SparkCategory['usageType'], 'PeerRecognition' | 'Award'>;
  categories: SparkCategory[];
}

const awardSparkTypes: SparkType[] = ['White', 'Yellow', 'Blue'];

export function buildRuleCategoryGroups(categories: SparkCategory[]): RuleCategoryGroup[] {
  const active = categories.filter((category) => category.active);

  return [
    {
      key: 'peer-white',
      label: 'Peer Recognition categories',
      sparkType: 'White',
      usageType: 'PeerRecognition',
      categories: active.filter((category) => category.usageType === 'PeerRecognition'),
    },
    ...awardSparkTypes.map((sparkType) => ({
      key: `award-${sparkType.toLowerCase()}`,
      label: sparkType === 'Blue' ? 'Blue award grounds' : `${sparkType} award categories`,
      sparkType,
      usageType: 'Award' as const,
      categories: active.filter(
        (category) => category.usageType === 'Award' && category.sparkType === sparkType,
      ),
    })),
  ];
}
