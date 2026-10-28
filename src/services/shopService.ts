import { demoShopService } from './demoShopService';
import { apiShopService } from './apiShopService';
import { isApiMode } from './apiClient';

export { ShopServiceError } from './shopErrors';
export type { ShopClientIdentity } from './apiShopService';

export const shopService =
  isApiMode || (import.meta as ImportMeta & { env?: ImportMetaEnv }).env?.VITE_SHOP_MODE === 'api'
    ? apiShopService
    : demoShopService;
