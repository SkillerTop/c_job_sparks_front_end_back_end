import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthenticatedPrincipal, SpendableSparkType } from './domain.js';
import { canPurchase } from './domain.js';
import { conflict, forbidden, notFound } from './errors.js';
import { employeeBalances, postLedgerOperation } from './ledger.js';
import { one, rows } from './sql.js';

export interface AdminProductInput {
  id?: string | undefined;
  name: string;
  description: string;
  imageUrl?: string | null | undefined;
  category: 'Popular' | 'Boosters' | 'Customization' | 'Features' | 'Exclusive';
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  price: number;
  priceSparkType: SpendableSparkType;
  productType: 'Consumable' | 'Activatable' | 'Permanent';
  durationHours: number | null;
  stock: number | null;
  isActive: boolean;
  isFeatured: boolean;
  isLimited: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  effectCode?: ('theme_unlock' | 'profile_frame' | 'badge_unlock' | 'focus_mode' |
    'double_white' | 'streak_shield' | 'mission_reroll' | 'mystery_pack') | undefined;
}

interface ProductRow {
  id: string;
  version_id: string;
  name: string;
  description: string | null;
  category: string;
  rarity: string;
  price_spark_type: SpendableSparkType;
  price_amount: string | number;
  effect_code: string;
  effect_configuration: Record<string, unknown>;
  is_featured: boolean;
  is_limited: boolean;
  available_from: Date | string;
  available_to: Date | string | null;
  inventory_ttl_seconds: string | number | null;
  created_at: Date | string;
  image_url: string | null;
  available_quantity: string | number | null;
}

const productSelect = `
  SELECT p.id, pv.id AS version_id, pv.name, COALESCE(pv.description, pv.short_description) AS description,
         sc.name AS category, pv.rarity, pv.price_spark_type, pv.price_amount, pv.effect_code,
         pv.effect_configuration, pv.is_featured, pv.is_limited, pv.available_from, pv.available_to,
         pv.inventory_ttl_seconds, pv.created_at,
         CASE WHEN ma.id IS NULL THEN NULL ELSE '/api/v1/media/' || ma.id::text END AS image_url,
         ps.available_quantity
    FROM app.products p
    JOIN app.shop_categories sc ON sc.id=p.category_id
    JOIN LATERAL (
      SELECT value.* FROM app.product_versions value
       WHERE value.product_id=p.id AND value.status='Active'
         AND value.available_from <= clock_timestamp()
         AND (value.available_to IS NULL OR value.available_to > clock_timestamp())
       ORDER BY value.version DESC LIMIT 1
    ) pv ON true
    LEFT JOIN app.product_stock ps ON ps.product_id=p.id
    LEFT JOIN LATERAL (
      SELECT asset.id FROM app.product_media pm
      JOIN app.media_assets asset ON asset.id=pm.media_asset_id AND asset.status='Ready'
      WHERE pm.product_version_id=pv.id
      ORDER BY (pm.purpose='Thumbnail') DESC, pm.sort_order LIMIT 1
    ) ma ON true`;

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

const mapProduct = (product: ProductRow) => ({
  id: product.id,
  name: product.name,
  description: product.description ?? '',
  imageUrl: product.image_url,
  icon: 'Sparkles',
  category: product.category,
  rarity: product.rarity,
  price: Number(product.price_amount),
  priceSparkType: product.price_spark_type,
  productType: product.inventory_ttl_seconds ? 'Activatable' : 'Permanent',
  durationHours: product.inventory_ttl_seconds ? Number(product.inventory_ttl_seconds) / 3600 : null,
  stock: product.is_limited ? Number(product.available_quantity ?? 0) : null,
  isActive: true,
  isFeatured: product.is_featured,
  isLimited: product.is_limited,
  availableFrom: iso(product.available_from),
  availableUntil: iso(product.available_to),
  createdAt: iso(product.created_at),
  effectCode: product.effect_code,
});

export const shopSnapshot = async (db: PoolClient, principal: AuthenticatedPrincipal) => {
  const products = (await rows<ProductRow>(
    db,
    `${productSelect}
      WHERE p.is_active AND sc.is_active AND pv.is_purchasable
      ORDER BY pv.is_featured DESC, pv.sort_order, pv.name`,
  )).map(mapProduct);
  const balances = await employeeBalances(db, principal.employeeId);
  const inventoryRows = await rows<ProductRow & {
    inventory_id: string;
    purchaseId: string;
    status: string;
    activatedAt: Date | string | null;
    expiresAt: Date | string | null;
    itemCreatedAt: Date | string;
  }>(
    db,
    `SELECT ii.id AS inventory_id, pi.purchase_id AS "purchaseId",
            CASE ii.status WHEN 'Available' THEN 'Owned' ELSE ii.status END AS status,
            ii.activated_at AS "activatedAt", ii.expires_at AS "expiresAt", ii.acquired_at AS "itemCreatedAt",
            p.id,pv.id AS version_id,pv.name,COALESCE(pv.description,pv.short_description) AS description,
            category.name AS category,pv.rarity,pv.price_spark_type,pv.price_amount,pv.effect_code,
            pv.effect_configuration,pv.is_featured,pv.is_limited,pv.available_from,pv.available_to,
            pv.inventory_ttl_seconds,pv.created_at,NULL::text AS image_url,stock.available_quantity
       FROM app.inventory_items ii
       JOIN app.purchase_items pi ON pi.id=ii.purchase_item_id
       JOIN app.products p ON p.id=ii.product_id
       JOIN app.product_versions pv ON pv.id=ii.product_version_id
       JOIN app.shop_categories category ON category.id=p.category_id
       LEFT JOIN app.product_stock stock ON stock.product_id=p.id
      WHERE ii.owner_employee_id=$1
      ORDER BY ii.acquired_at DESC`,
    [principal.employeeId],
  );
  const inventory = inventoryRows.map((item) => ({
    id: item.inventory_id,
    purchaseId: item.purchaseId,
    status: item.status,
    activatedAt: iso(item.activatedAt),
    expiresAt: iso(item.expiresAt),
    createdAt: iso(item.itemCreatedAt),
    product: products.find((product) => product.id === item.id) ?? mapProduct(item),
  }));
  const purchaseRows = await rows<any>(
    db,
    `SELECT le.id::text AS id, sa.spark_type AS "sparkType", le.amount,
            CASE WHEN op.operation_type='Purchase' THEN 'purchase' ELSE 'adjustment' END AS "transactionType",
            pu.id AS "relatedPurchaseId",
            le.description, le.occurred_at AS "createdAt"
       FROM app.spark_ledger_entries le
       JOIN app.spark_accounts sa ON sa.id=le.account_id
       JOIN app.spark_operations op ON op.id=le.operation_id
       LEFT JOIN app.purchases pu ON pu.spark_operation_id=op.id
      WHERE sa.employee_id=$1 AND op.operation_type IN ('Purchase','AdministrativeAdjustment','Reversal')
      ORDER BY le.occurred_at DESC, le.id DESC LIMIT 100`,
    [principal.employeeId],
  );
  const purchases = purchaseRows.map((entry) => ({
    ...entry,
    amount: Number(entry.amount),
    createdAt: iso(entry.createdAt),
  }));
  return {
    products,
    balances: { White: balances.White, Yellow: balances.Yellow, Blue: balances.Blue },
    inventory,
    transactions: purchases,
    identity: { id: principal.employeeId, email: principal.email, authenticated: true },
  };
};

export const purchaseProduct = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  productId: string,
  requestId: string,
) => {
  if (!canPurchase(principal.role)) throw forbidden('Your role can view the shop but cannot purchase items.');
  const product = await one<ProductRow>(
    db,
    `${productSelect}
      WHERE p.id=$1 AND p.is_active AND sc.is_active AND pv.is_purchasable
      FOR UPDATE OF p`,
    [productId],
  ).catch(() => {
    throw notFound('Available product');
  });
  if (product.is_limited) {
    const stock = await one<{ available_quantity: string | number }>(
      db,
      `SELECT available_quantity FROM app.product_stock WHERE product_id=$1 FOR UPDATE`,
      [productId],
    );
    if (Number(stock.available_quantity) < 1) throw conflict('SOLD_OUT', 'This product is sold out.');
  }
  const purchaseId = randomUUID();
  const purchaseItemId = randomUUID();
  const inventoryId = randomUUID();
  const price = Number(product.price_amount);
  const ledger = await postLedgerOperation(db, {
    operationType: 'Purchase',
    actorUserId: principal.userId,
    subjectEmployeeId: principal.employeeId,
    sourceType: 'Purchase',
    sourceId: purchaseId,
    requestId,
    description: `Purchased ${product.name}.`,
    entries: [
      {
        employeeId: principal.employeeId,
        sparkType: product.price_spark_type,
        amount: -price,
        entryKind: 'Debit',
        sourceType: 'Purchase',
        sourceId: purchaseId,
        description: `Purchased ${product.name}.`,
      },
    ],
  });
  await db.query(
    `INSERT INTO app.purchases
      (id, employee_id, spark_operation_id, total_price_spark_type, total_price_amount, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [purchaseId, principal.employeeId, ledger.operationId, product.price_spark_type, price, JSON.stringify({ requestId })],
  );
  await db.query(
    `INSERT INTO app.purchase_items
      (id, purchase_id, product_id, product_version_id, product_name_snapshot, effect_code_snapshot,
       effect_configuration_snapshot, quantity, unit_price_spark_type, unit_price_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,1,$8,$9)`,
    [
      purchaseItemId,
      purchaseId,
      product.id,
      product.version_id,
      product.name,
      product.effect_code,
      JSON.stringify(product.effect_configuration),
      product.price_spark_type,
      price,
    ],
  );
  await db.query(
    `INSERT INTO app.inventory_items
      (id, owner_employee_id, purchase_item_id, product_id, product_version_id,
       effect_code, effect_configuration)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      inventoryId,
      principal.employeeId,
      purchaseItemId,
      product.id,
      product.version_id,
      product.effect_code,
      JSON.stringify(product.effect_configuration),
    ],
  );
  await db.query(
    `INSERT INTO app.inventory_events (inventory_item_id, event_type, actor_user_id)
     VALUES ($1,'Created',$2)`,
    [inventoryId, principal.userId],
  );
  if (product.is_limited) {
    await db.query(
      `INSERT INTO app.stock_movements
        (product_id, product_version_id, quantity_delta, balance_after, reason, source_type, source_id, actor_user_id)
       VALUES ($1,$2,-1,0,'Purchase','Purchase',$3,$4)`,
      [product.id, product.version_id, purchaseId, principal.userId],
    );
  }
  return {
    purchase: {
      id: purchaseId,
      userId: principal.employeeId,
      productId: product.id,
      productName: product.name,
      pricePaid: price,
      sparkTypePaid: product.price_spark_type,
      status: 'Completed',
      createdAt: new Date().toISOString(),
    },
    inventoryItem: {
      id: inventoryId,
      purchaseId,
      status: 'Owned',
      activatedAt: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      product: mapProduct(product),
    },
  };
};

export const activateInventoryItem = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  inventoryId: string,
) => {
  const item = await one<{
    id: string;
    effect_code: string;
    effect_configuration: Record<string, unknown>;
    status: string;
    inventory_ttl_seconds: string | number | null;
  }>(
    db,
    `SELECT ii.id, ii.effect_code, ii.effect_configuration, ii.status, pv.inventory_ttl_seconds
       FROM app.inventory_items ii
       JOIN app.product_versions pv ON pv.id=ii.product_version_id
      WHERE ii.id=$1 AND ii.owner_employee_id=$2 FOR UPDATE OF ii`,
    [inventoryId, principal.employeeId],
  ).catch(() => {
    throw notFound('Inventory item');
  });
  if (item.status !== 'Available') throw conflict('INVENTORY_STATE', 'This item is not available for activation.');
  if (!['theme_unlock', 'profile_frame', 'badge_unlock', 'focus_mode'].includes(item.effect_code))
    throw conflict('EFFECT_NOT_SUPPORTED', 'This product effect is not enabled.');
  const expiresAt = item.inventory_ttl_seconds
    ? new Date(Date.now() + Number(item.inventory_ttl_seconds) * 1000)
    : null;
  await db.query(
    `UPDATE app.inventory_items SET status='Active', activated_at=clock_timestamp(), expires_at=$2 WHERE id=$1`,
    [inventoryId, expiresAt],
  );
  await db.query(
    `INSERT INTO app.inventory_events (inventory_item_id, event_type, actor_user_id)
     VALUES ($1,'Activated',$2)`,
    [inventoryId, principal.userId],
  );
  await db.query(
    `INSERT INTO app.effect_grants
      (id, inventory_item_id, employee_id, effect_code, payload, expires_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [randomUUID(), inventoryId, principal.employeeId, item.effect_code, JSON.stringify(item.effect_configuration), expiresAt],
  );
};

const inferEffectCode = (input: AdminProductInput) => {
  if (input.effectCode) return input.effectCode;
  const name = input.name.toLowerCase();
  if (name.includes('frame')) return 'profile_frame' as const;
  if (name.includes('badge')) return 'badge_unlock' as const;
  if (input.category === 'Customization') return 'theme_unlock' as const;
  return 'focus_mode' as const;
};

export const shopAdminSnapshot = async (db: PoolClient) => {
  const products = (await rows<ProductRow & { product_is_active: boolean }>(db, `
    SELECT p.id,p.is_active AS product_is_active,pv.id AS version_id,pv.name,
           COALESCE(pv.description,pv.short_description) AS description,sc.name AS category,pv.rarity,
           pv.price_spark_type,pv.price_amount,pv.effect_code,pv.effect_configuration,pv.is_featured,pv.is_limited,
           pv.available_from,pv.available_to,pv.inventory_ttl_seconds,pv.created_at,
           CASE WHEN ma.id IS NULL THEN NULL ELSE '/api/v1/media/' || ma.id::text END AS image_url,
           ps.available_quantity
      FROM app.products p JOIN app.shop_categories sc ON sc.id=p.category_id
      JOIN LATERAL (SELECT value.* FROM app.product_versions value WHERE value.product_id=p.id
        ORDER BY value.version DESC LIMIT 1) pv ON true
      LEFT JOIN app.product_stock ps ON ps.product_id=p.id
      LEFT JOIN LATERAL (SELECT asset.id FROM app.product_media media
        JOIN app.media_assets asset ON asset.id=media.media_asset_id AND asset.status='Ready'
        WHERE media.product_version_id=pv.id ORDER BY (media.purpose='Thumbnail') DESC,media.sort_order LIMIT 1) ma ON true
      ORDER BY pv.created_at DESC`)).map((row) => ({ ...mapProduct(row), isActive: row.product_is_active }));
  const purchases = await rows<any>(db, `SELECT purchase.id,purchase.employee_id AS "userId",item.product_id AS "productId",
    item.product_name_snapshot AS "productName",purchase.total_price_amount::int AS "pricePaid",
    purchase.total_price_spark_type AS "sparkTypePaid",purchase.status,purchase.purchased_at AS "createdAt"
    FROM app.purchases purchase JOIN app.purchase_items item ON item.purchase_id=purchase.id
    ORDER BY purchase.purchased_at DESC LIMIT 500`);
  const balanceRows = await rows<any>(db, `SELECT employee.id AS user_id,
    COALESCE(employee.contact_email,user.email)::text AS display_email,account.spark_type,account.balance,
    GREATEST(employee.updated_at,account.updated_at) AS updated_at
    FROM app.employees employee LEFT JOIN app.users user ON user.id=employee.user_id
    LEFT JOIN app.spark_accounts account ON account.employee_id=employee.id
      AND account.spark_type IN ('White','Yellow','Blue') ORDER BY employee.display_name`);
  const balances = new Map<string, any>();
  for (const row of balanceRows) {
    const entry = balances.get(row.user_id) ?? {
      userId: row.user_id,
      displayEmail: row.display_email ?? '',
      balances: { White: 0, Yellow: 0, Blue: 0 },
      updatedAt: iso(row.updated_at),
    };
    if (row.spark_type) entry.balances[row.spark_type] = Number(row.balance);
    balances.set(row.user_id, entry);
  }
  return { products, purchases, balances: [...balances.values()] };
};

export const saveAdminProduct = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  input: AdminProductInput,
) => {
  const category = await one<{ id: string }>(db, `INSERT INTO app.shop_categories (id,code,name)
    VALUES ($1,$2,$3) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [
    randomUUID(), input.category.toLowerCase().replaceAll(' ', '-'), input.category,
  ]);
  const productId = input.id ?? randomUUID();
  let previousVersionId: string | null = null;
  if (input.id) {
    await one(db, `SELECT id FROM app.products WHERE id=$1 FOR UPDATE`, [productId]).catch(() => { throw notFound('Product'); });
    await db.query(`UPDATE app.products SET category_id=$2,is_active=$3 WHERE id=$1`, [productId, category.id, input.isActive]);
    const previous = await one<{ id: string }>(db, `SELECT id FROM app.product_versions WHERE product_id=$1
      ORDER BY version DESC LIMIT 1 FOR UPDATE`, [productId]);
    previousVersionId = previous.id;
    await db.query(`UPDATE app.product_versions SET status='Retired',available_to=clock_timestamp()
      WHERE id=$1 AND status='Active'`, [previous.id]);
  } else {
    await db.query(`INSERT INTO app.products (id,sku,category_id,is_active,created_by_user_id)
      VALUES ($1,$2,$3,$4,$5)`, [productId, `SKU-${productId}`, category.id, input.isActive, principal.userId]);
    await db.query(`INSERT INTO app.product_stock (product_id) VALUES ($1)`, [productId]);
  }
  const version = await one<{ next: number }>(db, `SELECT COALESCE(max(version),0)::int+1 AS next
    FROM app.product_versions WHERE product_id=$1`, [productId]);
  const versionId = randomUUID();
  const effectCode = inferEffectCode(input);
  const supported = ['theme_unlock', 'profile_frame', 'badge_unlock', 'focus_mode'].includes(effectCode);
  const availableFrom = input.availableFrom ? new Date(input.availableFrom) : new Date();
  const availableTo = input.availableUntil ? new Date(input.availableUntil) : null;
  await db.query(`INSERT INTO app.product_versions
    (id,product_id,version,name,description,rarity,price_spark_type,price_amount,effect_code,
     effect_configuration,status,is_purchasable,is_featured,is_limited,available_from,available_to,
     inventory_ttl_seconds,created_by_user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'Active',$11,$12,$13,$14,$15,$16,$17)`, [
    versionId, productId, version.next, input.name.trim(), input.description.trim(), input.rarity,
    input.priceSparkType, input.price, effectCode, JSON.stringify({ productType: input.productType }),
    input.isActive && supported, input.isFeatured, input.isLimited, availableFrom, availableTo,
    input.durationHours ? input.durationHours * 3600 : null, principal.userId,
  ]);
  if (previousVersionId)
    await db.query(`INSERT INTO app.product_media (product_version_id,media_asset_id,purpose,sort_order)
      SELECT $1,media_asset_id,purpose,sort_order FROM app.product_media WHERE product_version_id=$2`, [versionId, previousVersionId]);
  const mediaId = input.imageUrl?.match(/^\/api\/v1\/media\/([0-9a-f-]{36})$/i)?.[1];
  if (mediaId) {
    await db.query(`DELETE FROM app.product_media WHERE product_version_id=$1 AND purpose='Thumbnail'`, [versionId]);
    await db.query(`INSERT INTO app.product_media (product_version_id,media_asset_id,purpose,sort_order)
      VALUES ($1,$2,'Thumbnail',0)`, [versionId, mediaId]);
  }
  if (input.isLimited) {
    const stock = await one<{ available_quantity: string | number }>(db,
      `SELECT available_quantity FROM app.product_stock WHERE product_id=$1 FOR UPDATE`, [productId]);
    const delta = Number(input.stock ?? 0) - Number(stock.available_quantity);
    if (delta !== 0) await db.query(`INSERT INTO app.stock_movements
      (product_id,product_version_id,quantity_delta,balance_after,reason,actor_user_id,note)
      VALUES ($1,$2,$3,0,$4,$5,'Product saved from Shop Management')`, [
      productId, versionId, delta, input.id ? 'Correction' : 'InitialStock', principal.userId,
    ]);
  }
  return { productId, versionId, isPurchasable: input.isActive && supported };
};
