import type { PerformanceThresholdSettings, Role, SparkType } from '@/models';
import {
  BLUE_CATEGORY_DEFINITIONS as SHARED_BLUE_CATEGORY_DEFINITIONS,
  WHITE_CATEGORY_DEFINITIONS,
  YELLOW_CATEGORY_DEFINITIONS,
} from '../../server/shared/category-catalog';

export const BUSINESS_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Office Manager'];
export const MEMBER_WORKSPACE_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM', 'Head'];
export const PERSONAL_ECONOMY_ROLES: Role[] = ['Employee', 'Coordinator'];
export const PERSONAL_LEDGER_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management'];
export const PEER_RECOGNITION_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM'];
export const PERFORMANCE_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM'];
export const SHOP_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Office Manager', 'Administrator'];
export const COMPANY_ACHIEVEMENT_ROLES: Role[] = ['GPM', 'Head', 'Top Management', 'Administrator'];
export const ALL_ROLES: Role[] = [...BUSINESS_ROLES, 'Administrator'];
export const SPARK_TYPES: SparkType[] = ['White', 'Yellow', 'Blue', 'Radiant'];
export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholdSettings = {
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

export const RECOGNITION_CATEGORIES = WHITE_CATEGORY_DEFINITIONS.map((category) => category.name);

export const RECOGNITION_CATEGORY_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  WHITE_CATEGORY_DEFINITIONS.map((category) => [category.name, category.description]),
);

export const YELLOW_CATEGORIES: Array<{
  id: string;
  label: string;
  amount: number;
  description: string;
}> = YELLOW_CATEGORY_DEFINITIONS.map((category) => ({
  id: category.code,
  label: category.name,
  amount: category.amount,
  description: category.description,
}));

export const BLUE_CATEGORY_DEFINITIONS = SHARED_BLUE_CATEGORY_DEFINITIONS.map(
  ({ name, amount, description }) => ({ name, amount, description }),
);

export const BLUE_CATEGORIES = BLUE_CATEGORY_DEFINITIONS.map((category) => category.name);
