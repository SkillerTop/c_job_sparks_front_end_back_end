export const FULFILLMENT_STATUSES = [
  'Requested', 'InProgress', 'Ordered', 'Ready', 'Delivered', 'Cancelled',
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
