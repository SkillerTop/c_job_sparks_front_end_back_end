import type { SparkType } from '@/models';

export type SpendableSparkType = Exclude<SparkType, 'Radiant'>;
export type SpendableSparkBalances = Record<SpendableSparkType, number>;
export type ShopCategory = 'Popular' | 'Boosters' | 'Customization' | 'Features' | 'Exclusive';
export type ShopCategoryFilter = 'All' | ShopCategory;
export type ProductRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';
export type ProductType = 'Consumable' | 'Activatable' | 'Permanent';
export type InventoryStatus = 'Owned' | 'Active' | 'Used' | 'Expired';
export type ShopSort = 'popular' | 'price-asc' | 'price-desc' | 'newest';
export type ShopTransactionType = 'purchase' | 'refund' | 'adjustment';
export type ShopTransactionFilter = 'all' | 'purchase' | 'credit' | 'refund';

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  icon: string;
  category: ShopCategory;
  rarity: ProductRarity;
  price: number;
  priceSparkType: SpendableSparkType;
  productType: ProductType;
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
}

export interface ShopEffects {
  doubleWhiteSparks: boolean;
  focusMode: boolean;
  goldenProfileFrame: boolean;
  neonTheme: boolean;
  signatureBadge: boolean;
  vipStatus: boolean;
}

export interface PurchaseResult extends ShopSnapshot {
  purchase: ShopPurchase;
  inventoryItem: ShopInventoryItem;
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
}

export interface ProductDraft extends Omit<ShopProduct, 'id' | 'createdAt'> {
  id?: string;
}
