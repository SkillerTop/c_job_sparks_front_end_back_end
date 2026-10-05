export class ShopServiceError extends Error {
  constructor(
    message: string,
    readonly code = 'SHOP_ERROR',
    readonly status = 0,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ShopServiceError';
  }
}
