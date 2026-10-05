import { DEMO_SHOP_PRODUCTS } from '@/data/mockShopCatalog';
import type {
  AdminBalance,
  ProductDraft,
  PurchaseResult,
  ShopAdminState,
  ShopInventoryItem,
  ShopProduct,
  ShopPurchase,
  ShopSnapshot,
  ShopSparkTransaction,
  SpendableSparkBalances,
  SpendableSparkType,
} from '@/models/shop';
import type { ShopClientIdentity } from './shopService';
import { ShopServiceError } from './shopErrors';

const STORAGE_KEY = 'cjob-sparks.frontend-shop.v1';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const DEMO_IDENTITIES = [
  { id: 'emp-alex', email: 'alex.stone@c-job.test', balances: { White: 18, Yellow: 7, Blue: 2 } },
  { id: 'emp-maya', email: 'maya.chen@c-job.test', balances: { White: 0, Yellow: 0, Blue: 0 } },
  { id: 'emp-daniel', email: 'daniel.reed@c-job.test', balances: { White: 6, Yellow: 0, Blue: 0 } },
  { id: 'emp-nora', email: 'nora.ibrahim@c-job.test', balances: { White: 0, Yellow: 6, Blue: 0 } },
  { id: 'emp-sam', email: 'samuel.park@c-job.test', balances: { White: 0, Yellow: 0, Blue: 0 } },
  { id: 'emp-olivia', email: 'olivia.grant@c-job.test', balances: { White: 0, Yellow: 0, Blue: 0 } },
  { id: 'emp-victor', email: 'victor.hale@c-job.test', balances: { White: 0, Yellow: 0, Blue: 0 } },
  { id: 'emp-elena', email: 'elena.volkova@c-job.test', balances: { White: 0, Yellow: 0, Blue: 0 } },
  { id: 'emp-ida', email: 'ida.novak@c-job.test', balances: { White: 0, Yellow: 0, Blue: 0 } },
] as const;

interface StoredPurchase extends ShopPurchase {
  requestId: string;
}

interface StoredInventoryItem extends ShopInventoryItem {
  userId: string;
}

interface StoredTransaction extends ShopSparkTransaction {
  userId: string;
}

interface DemoShopState {
  version: 1;
  products: ShopProduct[];
  balances: Record<string, SpendableSparkBalances>;
  purchases: StoredPurchase[];
  inventory: StoredInventoryItem[];
  transactions: StoredTransaction[];
}

const makeId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createInitialState = (): DemoShopState => ({
  version: 1,
  products: copy(DEMO_SHOP_PRODUCTS) as ShopProduct[],
  balances: Object.fromEntries(DEMO_IDENTITIES.map(({ id, balances }) => [id, { ...balances }])),
  purchases: [],
  inventory: [],
  transactions: [],
});

const loadState = (): DemoShopState => {
  if (typeof globalThis.localStorage === 'undefined') return createInitialState();
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!stored) return createInitialState();
    const parsed = JSON.parse(stored) as DemoShopState;
    if (parsed.version !== 1 || !Array.isArray(parsed.products)) return createInitialState();
    return parsed;
  } catch {
    return createInitialState();
  }
};

const saveState = (state: DemoShopState) => {
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
};

const requireIdentity = (identity?: ShopClientIdentity) => {
  if (!identity) throw new ShopServiceError('Sign in to use the Reward Shop.', 'IDENTITY_REQUIRED', 401);
  return identity;
};

const requireAdmin = (identity?: ShopClientIdentity) => {
  const current = requireIdentity(identity);
  if (current.role !== 'Administrator') throw new ShopServiceError('Administrator access is required.', 'FORBIDDEN', 403);
  return current;
};

const ensureUser = (state: DemoShopState, identity: ShopClientIdentity) => {
  state.balances[identity.id] ??= { White: 0, Yellow: 0, Blue: 0 };
};

const expireInventory = (state: DemoShopState) => {
  const now = Date.now();
  for (const item of state.inventory) {
    if (item.status === 'Active' && item.expiresAt && Date.parse(item.expiresAt) <= now) item.status = 'Expired';
  }
};

const publicPurchase = ({ requestId: _requestId, ...purchase }: StoredPurchase): ShopPurchase => purchase;
const publicInventory = ({ userId: _userId, ...item }: StoredInventoryItem): ShopInventoryItem => item;
const publicTransaction = ({ userId: _userId, ...transaction }: StoredTransaction): ShopSparkTransaction => transaction;

const snapshotFor = (state: DemoShopState, identity: ShopClientIdentity): ShopSnapshot => {
  ensureUser(state, identity);
  expireInventory(state);
  return {
    products: copy(state.products),
    balances: { ...state.balances[identity.id] },
    inventory: state.inventory.filter((item) => item.userId === identity.id).map(publicInventory),
    transactions: state.transactions.filter((item) => item.userId === identity.id).map(publicTransaction),
    identity: { id: identity.id, email: identity.email, authenticated: true },
  };
};

const assertProductAvailable = (product: ShopProduct) => {
  const now = Date.now();
  if (!product.isActive) throw new ShopServiceError('This item is not available.', 'PRODUCT_NOT_AVAILABLE', 409);
  if (product.availableFrom && Date.parse(product.availableFrom) > now)
    throw new ShopServiceError('This offer has not started yet.', 'PRODUCT_NOT_AVAILABLE', 409);
  if (product.availableUntil && Date.parse(product.availableUntil) < now)
    throw new ShopServiceError('This offer has ended.', 'PRODUCT_NOT_AVAILABLE', 409);
  if (product.stock !== null && product.stock < 1) throw new ShopServiceError('This item is sold out.', 'SOLD_OUT', 409);
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'product';

const asDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });

export const demoShopService = {
  async getSnapshot(identity?: ShopClientIdentity): Promise<ShopSnapshot> {
    const current = requireIdentity(identity);
    const state = loadState();
    const snapshot = snapshotFor(state, current);
    saveState(state);
    return snapshot;
  },

  async purchase(productId: string, identity?: ShopClientIdentity, requestId = makeId('request')): Promise<PurchaseResult> {
    const current = requireIdentity(identity);
    if (current.role === 'Administrator' || current.role === 'Top Management') {
      throw new ShopServiceError('Your role can browse the Reward Shop but cannot make purchases.', 'FORBIDDEN', 403);
    }

    const state = loadState();
    ensureUser(state, current);
    expireInventory(state);

    const repeated = state.purchases.find((purchase) => purchase.userId === current.id && purchase.requestId === requestId);
    if (repeated) {
      if (repeated.productId !== productId)
        throw new ShopServiceError('This purchase request was already used for another item.', 'REQUEST_REUSED', 409);
      const item = state.inventory.find((entry) => entry.purchaseId === repeated.id && entry.userId === current.id);
      if (!item) throw new Error('The purchased item could not be found.');
      return { ...snapshotFor(state, current), purchase: publicPurchase(repeated), inventoryItem: publicInventory(item) };
    }

    const product = state.products.find((entry) => entry.id === productId);
    if (!product) throw new ShopServiceError('The selected item no longer exists.', 'PRODUCT_NOT_FOUND', 404);
    assertProductAvailable(product);

    const owned = state.inventory.some(
      (entry) => entry.userId === current.id && entry.product.id === product.id && (entry.status === 'Owned' || entry.status === 'Active'),
    );
    if (owned) throw new ShopServiceError('You already own an available copy of this item.', 'ALREADY_OWNED', 409);

    const balance = state.balances[current.id][product.priceSparkType];
    if (balance < product.price) {
      throw new ShopServiceError(
        `You need ${product.price - balance} more ${product.priceSparkType} Sparks.`,
        'INSUFFICIENT_SPARKS',
        409,
        { balance, price: product.price, missing: product.price - balance },
      );
    }

    const createdAt = new Date().toISOString();
    const purchase: StoredPurchase = {
      id: makeId('purchase'),
      requestId,
      userId: current.id,
      productId: product.id,
      productName: product.name,
      pricePaid: product.price,
      sparkTypePaid: product.priceSparkType,
      status: 'Completed',
      createdAt,
    };
    const inventoryItem: StoredInventoryItem = {
      id: makeId('inventory'),
      userId: current.id,
      purchaseId: purchase.id,
      status: 'Owned',
      activatedAt: null,
      expiresAt: null,
      createdAt,
      product: copy(product),
    };
    const transaction: StoredTransaction = {
      id: makeId('shop'),
      userId: current.id,
      sparkType: product.priceSparkType,
      amount: -product.price,
      transactionType: 'purchase',
      relatedPurchaseId: purchase.id,
      description: `Purchase: ${product.name}`,
      createdAt,
    };

    state.balances[current.id][product.priceSparkType] -= product.price;
    if (product.stock !== null) product.stock -= 1;
    state.purchases.unshift(purchase);
    state.inventory.unshift(inventoryItem);
    state.transactions.unshift(transaction);
    saveState(state);

    return {
      ...snapshotFor(state, current),
      purchase: publicPurchase(purchase),
      inventoryItem: publicInventory(inventoryItem),
    };
  },

  async activate(inventoryId: string, identity?: ShopClientIdentity): Promise<ShopSnapshot> {
    const current = requireIdentity(identity);
    const state = loadState();
    expireInventory(state);
    const item = state.inventory.find((entry) => entry.id === inventoryId && entry.userId === current.id);
    if (!item) throw new Error('The inventory item could not be found.');
    if (item.status !== 'Owned') throw new Error('This item cannot be activated again.');

    const activatedAt = new Date();
    item.activatedAt = activatedAt.toISOString();
    if (item.product.productType === 'Consumable') {
      item.status = 'Used';
    } else {
      item.status = 'Active';
      item.expiresAt = item.product.durationHours
        ? new Date(activatedAt.getTime() + item.product.durationHours * 60 * 60 * 1000).toISOString()
        : null;
    }
    saveState(state);
    return snapshotFor(state, current);
  },

  async getAdminState(identity?: ShopClientIdentity): Promise<ShopAdminState> {
    requireAdmin(identity);
    const state = loadState();
    const emails = new Map<string, string>(DEMO_IDENTITIES.map(({ id, email }) => [id, email]));
    const balances: AdminBalance[] = Object.entries(state.balances).map(([userId, value]) => ({
      userId,
      displayEmail: emails.get(userId) ?? userId,
      balances: { ...value },
      updatedAt: new Date().toISOString(),
    }));
    return { products: copy(state.products), purchases: state.purchases.map(publicPurchase), balances };
  },

  async saveProduct(draft: ProductDraft, identity?: ShopClientIdentity): Promise<ShopAdminState> {
    requireAdmin(identity);
    if (!draft.name.trim() || !draft.description.trim()) throw new Error('Name and description are required.');
    if (!Number.isInteger(draft.price) || draft.price < 1) throw new Error('Price must be a positive whole number.');

    const state = loadState();
    const existingIndex = draft.id ? state.products.findIndex((product) => product.id === draft.id) : -1;
    let id = draft.id || slugify(draft.name);
    if (existingIndex < 0 && state.products.some((product) => product.id === id)) id = `${id}-${Date.now().toString(36)}`;
    const product: ShopProduct = {
      ...draft,
      id,
      name: draft.name.trim(),
      description: draft.description.trim(),
      createdAt: existingIndex >= 0 ? state.products[existingIndex].createdAt : new Date().toISOString(),
    };
    if (existingIndex >= 0) state.products[existingIndex] = product;
    else state.products.unshift(product);
    saveState(state);
    return this.getAdminState(identity);
  },

  async adjustBalance(
    userId: string,
    sparkType: SpendableSparkType,
    amount: number,
    reason: string,
    identity?: ShopClientIdentity,
  ): Promise<ShopAdminState> {
    requireAdmin(identity);
    if (!Number.isInteger(amount) || amount === 0) throw new Error('Enter a non-zero whole amount.');
    if (reason.trim().length < 6) throw new Error('Provide a clear reason for this adjustment.');
    const state = loadState();
    state.balances[userId] ??= { White: 0, Yellow: 0, Blue: 0 };
    if (state.balances[userId][sparkType] + amount < 0) throw new Error('A Spark balance cannot become negative.');
    state.balances[userId][sparkType] += amount;
    state.transactions.unshift({
      id: makeId('adjustment'),
      userId,
      sparkType,
      amount,
      transactionType: 'adjustment',
      relatedPurchaseId: null,
      description: reason.trim(),
      createdAt: new Date().toISOString(),
    });
    saveState(state);
    return this.getAdminState(identity);
  },

  async uploadProductImage(file: File, identity?: ShopClientIdentity): Promise<{ imageUrl: string }> {
    requireAdmin(identity);
    if (!file.type.startsWith('image/')) throw new Error('Choose a supported image file.');
    if (file.size > MAX_IMAGE_BYTES) throw new Error('The image must be 2 MB or smaller.');
    return { imageUrl: await asDataUrl(file) };
  },
};
