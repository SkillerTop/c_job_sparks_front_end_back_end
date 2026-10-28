import { useMemo } from 'react';
import { SHOP_TEXT } from '@/constants/shop';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

type LocalizedTree<T> = T extends (...args: infer Args) => string
  ? (...args: Args) => string
  : T extends Record<string, unknown>
    ? { [Key in keyof T]: LocalizedTree<T[Key]> }
    : T;

const localizeTree = <T,>(value: T, localize: (text: string) => string): LocalizedTree<T> => {
  if (typeof value === 'string') return localize(value) as LocalizedTree<T>;
  if (typeof value === 'function') {
    return ((...args: unknown[]) => localize((value as (...parameters: unknown[]) => string)(...args))) as LocalizedTree<T>;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, localizeTree(item, localize)]),
    ) as LocalizedTree<T>;
  }
  return value as LocalizedTree<T>;
};

export function useLocalizedShopText() {
  const { localize } = useUserPreferences();
  return useMemo(() => localizeTree(SHOP_TEXT, localize), [localize]);
}
