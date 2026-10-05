import type {
  SpendableSparkBalances,
  SpendableSparkType,
  ShopCategoryFilter,
  ShopInventoryItem,
  ShopProduct,
  ShopSort,
} from '@/models/shop';

export type ProductAction =
  | 'buy'
  | 'insufficient'
  | 'purchased'
  | 'activated'
  | 'sold-out'
  | 'soon';

export const SPENDABLE_SPARK_TYPES: SpendableSparkType[] = ['White', 'Yellow', 'Blue'];

export const emptySpendableBalances = (): SpendableSparkBalances => ({ White: 0, Yellow: 0, Blue: 0 });

export const formatSparkAmount = (value: number) => value.toLocaleString('en-US');

export const formatSparkPrice = (amount: number, sparkType: SpendableSparkType) =>
  `${formatSparkAmount(amount)} ${sparkType} ${amount === 1 ? 'Spark' : 'Sparks'}`;

const PRICE_SORT_WEIGHT: Record<SpendableSparkType, number> = { White: 1, Yellow: 10, Blue: 80 };

const comparablePrice = (product: ShopProduct) => product.price * PRICE_SORT_WEIGHT[product.priceSparkType];

export const filterAndSortProducts = (
  products: ShopProduct[],
  category: ShopCategoryFilter,
  sort: ShopSort,
) => {
  const filtered = products.filter((product) => {
    if (category === 'All') return true;
    if (category === 'Popular') return product.isFeatured || product.category === 'Popular';
    return product.category === category;
  });
  return [...filtered].sort((a, b) => {
    if (sort === 'price-asc') return comparablePrice(a) - comparablePrice(b) || a.name.localeCompare(b.name);
    if (sort === 'price-desc') return comparablePrice(b) - comparablePrice(a) || a.name.localeCompare(b.name);
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    return Number(b.isFeatured) - Number(a.isFeatured) || comparablePrice(a) - comparablePrice(b);
  });
};

const isWithinAvailability = (product: ShopProduct, now = Date.now()) => {
  const starts = product.availableFrom ? Date.parse(product.availableFrom) : null;
  const ends = product.availableUntil ? Date.parse(product.availableUntil) : null;
  return (!starts || starts <= now) && (!ends || ends > now);
};

export const getProductAction = (
  product: ShopProduct,
  balances: SpendableSparkBalances,
  inventory: ShopInventoryItem[],
  now = Date.now(),
): ProductAction => {
  if (!product.isActive || !isWithinAvailability(product, now)) return 'soon';
  if (product.stock !== null && product.stock <= 0) return 'sold-out';
  const owned = inventory.find((item) => item.product.id === product.id && item.status !== 'Expired');
  if (owned && product.productType !== 'Consumable') {
    return owned.status === 'Active' ? 'activated' : 'purchased';
  }
  if (balances[product.priceSparkType] < product.price) return 'insufficient';
  return 'buy';
};

export const isProductNew = (product: ShopProduct, now = Date.now()) =>
  now - Date.parse(product.createdAt) <= 1000 * 60 * 60 * 24 * 45;

export const durationLabel = (hours: number | null) => {
  if (!hours) return 'No time limit';
  if (hours % 168 === 0) {
    const weeks = hours / 168;
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};
