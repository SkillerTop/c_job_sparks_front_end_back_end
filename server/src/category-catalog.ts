import {
  BLUE_CATEGORY_DEFINITIONS,
  WHITE_CATEGORY_DEFINITIONS,
  YELLOW_CATEGORY_DEFINITIONS,
} from '../shared/category-catalog.js';

export interface SeedCategoryDefinition {
  id: string;
  seedVersionId: string;
  code: string;
  sparkType: 'White' | 'Yellow' | 'Blue';
  usageType: 'PeerRecognition' | 'Award';
  name: string;
  description: string;
  amount: number;
  repeatPeriod: 'Unlimited' | 'Quarterly' | 'Yearly';
}

const peerIds = ['0001', '0102', '0103', '0104', '0105', '0106', '0107', '0108', '0109', '0110', '0111'];
const peerVersionIds = ['1001', '1102', '1103', '1104', '1105', '1106', '1107', '1108', '1109', '1110', '1111'];
const awardIds = ['0201', '0202', '0203', '0204', '0205', '0206', '0003', '0208', '0209', '0210', '0211'];
const awardVersionIds = ['1201', '1202', '1203', '1204', '1205', '1206', '1003', '1208', '1209', '1210', '1211'];

const whiteCategories = WHITE_CATEGORY_DEFINITIONS.flatMap((definition, index): SeedCategoryDefinition[] => [
  {
    id: '88888888-' + peerIds[index] + '-4000-8000-00000000' + peerIds[index],
    seedVersionId: '88888888-' + peerVersionIds[index] + '-4000-8000-00000000' + peerVersionIds[index],
    code: index === 0 ? definition.code : definition.code + '-peer',
    sparkType: 'White',
    usageType: 'PeerRecognition',
    name: definition.name,
    description: definition.description,
    amount: definition.amount,
    repeatPeriod: 'Unlimited',
  },
  {
    id: '88888888-' + awardIds[index] + '-4000-8000-00000000' + awardIds[index],
    seedVersionId: '88888888-' + awardVersionIds[index] + '-4000-8000-00000000' + awardVersionIds[index],
    code: index === 6 ? definition.code : definition.code + '-award',
    sparkType: 'White',
    usageType: 'Award',
    name: definition.name,
    description: definition.description,
    amount: definition.amount,
    repeatPeriod: 'Quarterly',
  },
]);

const yellowCategories: SeedCategoryDefinition[] = YELLOW_CATEGORY_DEFINITIONS.map((category) => ({
  id: '88888888-' + category.seedId + '-4000-8000-00000000' + category.seedId,
  seedVersionId: '88888888-' + category.seedVersionId + '-4000-8000-00000000' + category.seedVersionId,
  code: category.code, sparkType: 'Yellow', usageType: 'Award', name: category.name,
  description: category.description, amount: category.amount, repeatPeriod: 'Quarterly',
}));

const blueCategories: SeedCategoryDefinition[] = BLUE_CATEGORY_DEFINITIONS.map((category) => ({
  id: '88888888-' + category.seedId + '-4000-8000-00000000' + category.seedId,
  seedVersionId: '88888888-' + category.seedVersionId + '-4000-8000-00000000' + category.seedVersionId,
  code: category.code, sparkType: 'Blue', usageType: 'Award', name: category.name,
  description: category.description, amount: category.amount, repeatPeriod: 'Yearly',
}));

export const SEED_CATEGORY_CATALOG: SeedCategoryDefinition[] = [
  ...whiteCategories,
  ...yellowCategories,
  ...blueCategories,
];
