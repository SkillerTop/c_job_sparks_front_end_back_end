import type {
  SpendableSparkBalances,
  SpendableSparkType,
  ShopCategoryFilter,
  ShopInventoryItem,
  ShopProduct,
  ShopSort,
  SparkPriceComponent,
} from '@/models/shop';
import { getActiveLocale } from '@/utils/locale';

export type ProductAction =
  | 'buy'
  | 'insufficient'
  | 'purchased'
  | 'activated'
  | 'sold-out'
  | 'soon';

export const SPENDABLE_SPARK_TYPES: SpendableSparkType[] = ['White', 'Yellow', 'Blue'];

export const emptySpendableBalances = (): SpendableSparkBalances => ({ White: 0, Yellow: 0, Blue: 0 });

export const formatSparkAmount = (value: number) => value.toLocaleString(getActiveLocale());

export const formatSparkPrice = (amount: number, sparkType: SpendableSparkType) =>
  `${formatSparkAmount(amount)} ${sparkType} ${amount === 1 ? 'Spark' : 'Sparks'}`;

export const getProductPriceComponents = (
  product: Pick<ShopProduct, 'price' | 'priceSparkType' | 'priceComponents'>,
): SparkPriceComponent[] => {
  const configured = product.priceComponents?.filter((component) =>
    SPENDABLE_SPARK_TYPES.includes(component.sparkType) && Number.isSafeInteger(component.amount) && component.amount > 0,
  );
  return configured?.length
    ? configured
    : [{ sparkType: product.priceSparkType, amount: product.price }];
};

export const formatProductPrice = (
  product: Pick<ShopProduct, 'price' | 'priceSparkType' | 'priceComponents'>,
) => getProductPriceComponents(product)
  .map((component) => formatSparkPrice(component.amount, component.sparkType))
  .join(' + ');

export const getMissingPriceComponents = (
  product: Pick<ShopProduct, 'price' | 'priceSparkType' | 'priceComponents'>,
  balances: SpendableSparkBalances,
) => getProductPriceComponents(product)
  .map((component) => ({
    ...component,
    available: balances[component.sparkType],
    missing: Math.max(0, component.amount - balances[component.sparkType]),
  }))
  .filter((component) => component.missing > 0);

export const getProductPriceCoverage = (
  product: Pick<ShopProduct, 'price' | 'priceSparkType' | 'priceComponents'>,
  balances: SpendableSparkBalances,
) => Math.min(...getProductPriceComponents(product).map((component) =>
  Math.min(100, Math.max(0, (balances[component.sparkType] / component.amount) * 100)),
));

const PRICE_SORT_WEIGHT: Record<SpendableSparkType, number> = { White: 1, Yellow: 10, Blue: 80 };

const comparablePrice = (product: ShopProduct) => getProductPriceComponents(product)
  .reduce((total, component) => total + component.amount * PRICE_SORT_WEIGHT[component.sparkType], 0);

export const filterAndSortProducts = (
  products: ShopProduct[],
  category: ShopCategoryFilter,
  sort: ShopSort,
) => {
  const filtered = products.filter((product) => {
    if (category === 'All') return true;
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
  if (getMissingPriceComponents(product, balances).length) return 'insufficient';
  return 'buy';
};

export const isProductNew = (product: ShopProduct, now = Date.now()) =>
  now - Date.parse(product.createdAt) <= 1000 * 60 * 60 * 24 * 45;

export const durationLabel = (hours: number | null) => {
  const locale = getActiveLocale();
  const language = locale.startsWith('uk') ? 'uk' : locale.startsWith('ru') ? 'ru' : 'en';
  if (!hours) return language === 'uk' ? 'Без обмеження часу' : language === 'ru' ? 'Без ограничения времени' : 'No time limit';
  const unit = (value: number, en: [string, string], uk: [string, string, string], ru: [string, string, string]) => {
    if (language === 'en') return `${value} ${value === 1 ? en[0] : en[1]}`;
    const category = new Intl.PluralRules(locale).select(value);
    const index = category === 'one' ? 0 : category === 'few' ? 1 : 2;
    const forms = language === 'uk' ? uk : ru;
    return `${value.toLocaleString(locale)} ${forms[index]}`;
  };
  if (hours % 168 === 0) {
    const weeks = hours / 168;
    return unit(weeks, ['week', 'weeks'], ['тиждень', 'тижні', 'тижнів'], ['неделя', 'недели', 'недель']);
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    return unit(days, ['day', 'days'], ['день', 'дні', 'днів'], ['день', 'дня', 'дней']);
  }
  return unit(hours, ['hour', 'hours'], ['година', 'години', 'годин'], ['час', 'часа', 'часов']);
};
