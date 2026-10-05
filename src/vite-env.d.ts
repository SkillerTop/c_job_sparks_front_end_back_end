/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SHOP_MODE?: 'demo' | 'api';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
