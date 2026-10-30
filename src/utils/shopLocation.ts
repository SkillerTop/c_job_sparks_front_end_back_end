import type { ShopLocation } from '@/models/shop';

const LOCATIONS: ReadonlySet<string> = new Set(['Ukraine', 'Poland', 'Bulgaria']);
const storageKey = (accountId: string) => `c-job-sparks:shop-location:v1:${accountId}`;

export const isShopLocation = (value: unknown): value is ShopLocation =>
  typeof value === 'string' && LOCATIONS.has(value);

export const readShopLocation = (accountId: string): ShopLocation | null => {
  try {
    const value = globalThis.localStorage?.getItem(storageKey(accountId));
    return isShopLocation(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeShopLocation = (accountId: string, location: ShopLocation) => {
  try {
    globalThis.localStorage?.setItem(storageKey(accountId), location);
  } catch {
    // A private browser session may block storage; the in-memory selection still works.
  }
};
