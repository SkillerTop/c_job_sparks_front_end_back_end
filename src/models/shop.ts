import type { SparkType } from '@/models';

export type SpendableSparkType = Exclude<SparkType, 'Radiant'>;
export type SpendableSparkBalances = Record<SpendableSparkType, number>;
export type ShopCategory = 'Merch' | 'Subscription' | 'Certificate' | 'Tool' | 'Service' | 'Other';
export type ShopCategoryFilter = 'All' | ShopCategory;
export type ProductRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export type ProductType = 'Consumable' | 'Activatable' | 'Permanent';
export type FulfillmentKind = 'Virtual' | 'Physical' | 'Certificate' | 'ITEquipment';
export type DeliveryMethod = 'OfficePickup' | 'EmployeePaidDelivery' | 'WorkEmail' | 'InternalCoordination';
export type InventoryStatus = 'Owned' | 'Active' | 'Used' | 'Expired';
export type ShopSort = 'popular' | 'price-asc' | 'price-desc' | 'newest';
export type ShopTransactionType = 'purchase' | 'refund' | 'adjustment';
export type ShopTransactionFilter = 'all' | 'purchase' | 'credit' | 'refund';

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  imageSrcSet?: string | null;
  imageSizes?: string;
  icon: string;
  category: ShopCategory;
  rarity: ProductRarity;
  price: number;
  priceSparkType: SpendableSparkType;
  productType: ProductType;
  fulfillmentKind: FulfillmentKind;
  fulfillmentContactId: string | null;
  effectCode?: string;
  durationHours: number | null;
  stock: number | null;
  isActive: boolean;
  isFeatured: boolean;
  isLimited: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  createdAt: string;
}

export interface ShopInventoryItem {
  id: string;
  purchaseId: string;
  status: InventoryStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  product: ShopProduct;
}

export interface ShopPurchase {
  id: string;
  userId: string;
  productId: string;
  productName: string;
  pricePaid: number;
  sparkTypePaid: SpendableSparkType | null;
  status: 'Completed' | 'Refunded' | 'Failed';
  createdAt: string;
}

export interface ShopSparkTransaction {
  id: string;
  sparkType: SpendableSparkType;
  amount: number;
  transactionType: ShopTransactionType;
  relatedPurchaseId: string | null;
  description: string;
  createdAt: string;
}

export interface ShopIdentity {
  id: string;
  email: string;
  authenticated: boolean;
}

export interface ShopSnapshot {
  products: ShopProduct[];
  balances: SpendableSparkBalances;
  inventory: ShopInventoryItem[];
  transactions: ShopSparkTransaction[];
  identity: ShopIdentity;
  fulfillmentContacts: import('@/models').FulfillmentContact[];
}

export interface ShopEffects {
  doubleWhiteSparks: boolean;
  focusMode: boolean;
  goldenProfileFrame: boolean;
  neonTheme: boolean;
  signatureBadge: boolean;
  vipStatus: boolean;
}

export const EMPTY_SHOP_EFFECTS: ShopEffects = {
  doubleWhiteSparks: false,
  focusMode: false,
  goldenProfileFrame: false,
  neonTheme: false,
  signatureBadge: false,
  vipStatus: false,
};

export interface PurchaseResult extends ShopSnapshot {
  purchase: ShopPurchase;
  inventoryItem: ShopInventoryItem;
  fulfillment: { id: string; status: 'Requested' } | null;
}

export interface AdminBalance {
  userId: string;
  displayEmail: string;
  balances: SpendableSparkBalances;
  updatedAt: string;
}

export interface ShopAdminState {
  products: ShopProduct[];
  purchases: ShopPurchase[];
  balances: AdminBalance[];
  fulfillmentContacts: import('@/models').FulfillmentContact[];
  fulfillments: RewardFulfillment[];
}

export interface RewardFulfillment {
  id: string;
  sourceType: 'RadiantAward' | 'ShopPurchase';
  awardId: string | null;
  purchaseId: string | null;
  employeeId: string;
  employeeName: string;
  contactName: string;
  contactEmail: string;
  rewardKind: 'RadiantAcrylic' | 'RadiantVesselModel' | 'ShopPhysical' | 'ShopCertificate' | 'ShopEquipment';
  deliveryMethod: DeliveryMethod;
  officeName: string | null;
  valuablePrizeDescription: string | null;
  status: 'Requested' | 'InProgress' | 'Ordered' | 'Ready' | 'Delivered' | 'Cancelled';
  requestedAt: string;
  updatedAt: string;
  notes: string | null;
}

export interface PurchaseFulfillmentChoice {
  deliveryMethod: DeliveryMethod;
  officeName?: string;
}

export interface ProductDraft extends Omit<ShopProduct, 'id' | 'createdAt'> {
  id?: string;
}
