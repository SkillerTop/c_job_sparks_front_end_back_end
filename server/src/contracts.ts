import type { Role } from './domain.js';

export const WORKSPACE_SECTIONS = [
  'dashboard', 'profile', 'sparks', 'recognition', 'achievements', 'company-achievements',
  'shop', 'inventory', 'convert', 'disenchant', 'team', 'award', 'approvals', 'admin', 'rules', 'all',
  'fulfillment',
] as const;

export type WorkspaceSectionContract = (typeof WORKSPACE_SECTIONS)[number];

export const WORKSPACE_SECTION_ROLES: Partial<Record<WorkspaceSectionContract, readonly Role[]>> = {
  sparks: ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management'],
  recognition: ['Employee', 'Coordinator', 'GPM'],
  achievements: ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management'],
  'company-achievements': ['GPM', 'Head', 'Top Management', 'Administrator'],
  shop: ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Office Manager', 'Administrator'],
  inventory: ['Employee', 'Coordinator'],
  convert: ['Employee', 'Coordinator'],
  disenchant: ['Employee', 'Coordinator'],
  team: ['GPM', 'Head'],
  award: ['Coordinator', 'GPM', 'Head', 'Top Management'],
  approvals: ['Head'],
  admin: ['Administrator'],
  fulfillment: ['Office Manager', 'Administrator'],
  rules: ['Employee', 'Coordinator', 'GPM', 'Head'],
  all: ['Administrator'],
};

export const FULFILLMENT_STATUSES = [
  'Requested', 'InProgress', 'Ordered', 'Ready', 'Delivered', 'Cancelled',
] as const;
export const FULFILLMENT_TARGET_STATUSES = [
  'InProgress', 'Ordered', 'Ready', 'Delivered', 'Cancelled',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  Requested: ['InProgress', 'Cancelled'],
  InProgress: ['Ordered', 'Ready', 'Cancelled'],
  Ordered: ['Ready', 'Cancelled'],
  Ready: ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

export const nextFulfillmentStatuses = (status: FulfillmentStatus) => FULFILLMENT_TRANSITIONS[status];
