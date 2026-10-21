import {
  Edit3,
  ImagePlus,
  PackageCheck,
  Plus,
  ReceiptText,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Feedback } from '@/views/components/common/Feedback';
import { Modal } from '@/views/components/common/Modal';
import { ProductVisual } from '@/views/components/shop/ProductVisual';
import { RarityBadge } from '@/views/components/shop/RarityBadge';
import { SparkAmount } from '@/views/components/shop/SparkAmount';
import { ShopSkeleton } from '@/views/components/shop/ShopSkeleton';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { SelectField } from '@/views/components/ui/SelectField';
import {
  FULFILLMENT_KIND_OPTIONS,
  PRODUCT_ICON_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  SHOP_CATEGORIES,
  SHOP_TEXT,
  RARITY_LABELS,
} from '@/constants/shop';
import { useShopAdminController } from '@/controllers/useShopAdminController';
import { FULFILLMENT_ROLE_LABELS } from '@/constants/fulfillment';
import type { ProductRarity, ProductType, ShopCategory, ShopProduct } from '@/models/shop';
import { formatDateTime } from '@/utils/formatters';
import { SPENDABLE_SPARK_TYPES } from '@/utils/shop';
import styles from '@/views/styles/shop.module.css';

const CATEGORY_OPTIONS = SHOP_CATEGORIES.filter((item) => item.value !== 'All').map((item) => ({
  value: item.value as ShopCategory,
  label: item.label,
}));
const RARITY_OPTIONS = (Object.entries(RARITY_LABELS) as Array<[ProductRarity, string]>).map(
  ([value, label]) => ({ value, label }),
);
const TYPE_OPTIONS: Array<{ value: ProductType; label: string }> = [...PRODUCT_TYPE_OPTIONS];
const ICON_OPTIONS = [...PRODUCT_ICON_OPTIONS];
const SPARK_TYPE_OPTIONS = SPENDABLE_SPARK_TYPES.map((value) => ({ value, label: `${value} Sparks` }));

const toDateTimeLocal = (value: string | null) => value ? value.slice(0, 16) : '';
const toNullableNumber = (value: string) => value === '' ? null : Number(value);

export function ShopAdminPanel() {
  const {
    state,
    loading,
    saving,
    uploading,
    editing,
    setEditing,
    message,
    adjustUser,
    setAdjustUser,
    adjustSparkType,
    setAdjustSparkType,
    adjustAmount,
    setAdjustAmount,
    adjustReason,
    setAdjustReason,
    previewProduct,
    openProduct,
    saveProduct,
    deleteProduct,
    uploadImage,
    submitAdjustment,
    updateFulfillment,
  } = useShopAdminController();
  const [productPendingDelete, setProductPendingDelete] = useState<ShopProduct | null>(null);

  const confirmDeleteProduct = async () => {
    if (!productPendingDelete) return;
    if (await deleteProduct(productPendingDelete.id)) setProductPendingDelete(null);
  };

  const submitProductForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveProduct();
  };

  const submitAdjustmentForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitAdjustment();
  };

  if (loading && !state) return <ShopSkeleton count={3} />;

  return (
    <div className={styles.shopAdmin}>
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <section className={styles.shopAdminPanel} aria-labelledby="shop-products-admin-title">
        <div className={styles.shopAdminHeader}>
          <div>
            <p className={styles.adminEyebrow}>{SHOP_TEXT.admin.catalogEyebrow}</p>
            <h2 id="shop-products-admin-title">{SHOP_TEXT.admin.catalogTitle}</h2>
            <p>{SHOP_TEXT.admin.catalogDescription}</p>
          </div>
          <button className={styles.shopPrimaryButton} type="button" onClick={() => openProduct()}>
            <Plus size={16} /> {SHOP_TEXT.admin.addProduct}
          </button>
        </div>
        <div className={styles.adminProductList}>
          {state?.products.map((product) => (
            <article key={product.id} className={styles.adminProductRow}>
              <ProductVisual product={product} size="inventory" />
              <div>
                <RarityBadge rarity={product.rarity} />
                <h3>{product.name}</h3>
                <p><SparkAmount amount={product.price} sparkType={product.priceSparkType} /> · {product.stock === null ? SHOP_TEXT.admin.unlimited : `${product.stock} ${SHOP_TEXT.admin.units}`}</p>
                {product.fulfillmentKind !== 'Virtual' && (
                  <small>
                    Responsible: {state.fulfillmentContacts.find((contact) => contact.id === product.fulfillmentContactId)?.name ?? 'Not assigned'}
                  </small>
                )}
              </div>
              <span className={product.isActive ? styles.adminStatusActive : styles.adminStatusDisabled}>
                {product.isActive ? SHOP_TEXT.admin.active : SHOP_TEXT.admin.disabled}
              </span>
              <div className={styles.adminProductActions}>
                <button className={styles.shopSecondaryButton} type="button" onClick={() => openProduct(product)}>
                  <Edit3 size={15} /> {SHOP_TEXT.admin.edit}
                </button>
                <button className={styles.shopDangerButton} type="button" onClick={() => setProductPendingDelete(product)}>
                  <Trash2 size={15} /> {SHOP_TEXT.admin.delete}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.shopAdminPanel} aria-labelledby="reward-fulfillment-title">
        <div className={styles.shopAdminHeader}>
          <div>
            <p className={styles.adminEyebrow}>Ordering and handover</p>
            <h2 id="reward-fulfillment-title">Reward fulfillment</h2>
            <p>Physical rewards, certificates, IT equipment and Radiant prizes stay tracked until delivery.</p>
          </div>
          <PackageCheck size={21} />
        </div>
        {state?.fulfillments.length ? (
          <div className={styles.adminPurchaseList}>
            {state.fulfillments.map((fulfillment) => (
              <article key={fulfillment.id}>
                <span className={styles.adminPurchaseIcon}><PackageCheck size={14} /></span>
                <div>
                  <strong>{fulfillment.employeeName} · {fulfillment.rewardKind}</strong>
                  <small>
                    {fulfillment.contactName} · {fulfillment.contactEmail}
                    {fulfillment.officeName ? ` · ${fulfillment.officeName}` : ''}
                    {fulfillment.valuablePrizeDescription ? ` · ${fulfillment.valuablePrizeDescription}` : ''}
                  </small>
                </div>
                <SelectField
                  value={fulfillment.status}
                  disabled={saving || fulfillment.status === 'Delivered' || fulfillment.status === 'Cancelled'}
                  onChange={(status) => void updateFulfillment(fulfillment.id, status, '')}
                  options={['Requested','InProgress','Ordered','Ready','Delivered','Cancelled'].map((status) => ({ value: status, label: status }))}
                  ariaLabel={`Fulfillment status for ${fulfillment.employeeName}`}
                />
              </article>
            ))}
          </div>
        ) : <p className={styles.adminEmpty}>No reward fulfillment requests yet.</p>}
      </section>

      <div className={styles.shopAdminGrid}>
        <section className={styles.shopAdminPanel} aria-labelledby="balance-adjust-title">
          <div className={styles.shopAdminHeader}>
            <div>
              <p className={styles.adminEyebrow}>{SHOP_TEXT.admin.balanceEyebrow}</p>
              <h2 id="balance-adjust-title">{SHOP_TEXT.admin.balanceTitle}</h2>
            </div>
            <SparkIcon type={adjustSparkType} size={22} animated={false} />
          </div>
          {state?.balances.length ? (
            <form className={styles.adminForm} onSubmit={submitAdjustmentForm}>
              <label>
                <span>{SHOP_TEXT.admin.user}</span>
                <SelectField
                  value={adjustUser}
                  onChange={setAdjustUser}
                  options={state.balances.map((balance) => ({
                    value: balance.userId,
                    label: `${balance.displayEmail} · W ${balance.balances.White} / Y ${balance.balances.Yellow} / B ${balance.balances.Blue}`,
                  }))}
                  ariaLabel={SHOP_TEXT.admin.userAria}
                />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.sparkType}</span>
                <SelectField
                  value={adjustSparkType}
                  onChange={setAdjustSparkType}
                  options={SPARK_TYPE_OPTIONS}
                  ariaLabel={SHOP_TEXT.admin.sparkTypeAria}
                />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.signedAmount}</span>
                <input
                  type="number"
                  min="-100000"
                  max="100000"
                  step="1"
                  required
                  value={adjustAmount}
                  onChange={(event) => setAdjustAmount(event.target.value)}
                  placeholder={SHOP_TEXT.admin.amountPlaceholder}
                />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.reason}</span>
                <textarea
                  required
                  minLength={6}
                  maxLength={240}
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  placeholder={SHOP_TEXT.admin.reasonPlaceholder}
                />
              </label>
              <button className={styles.shopPrimaryButton} type="submit" disabled={saving}>
                {saving ? <span className={styles.shopSpinner} /> : <ShieldCheck size={16} />}
                {SHOP_TEXT.admin.confirmAdjustment}
              </button>
            </form>
          ) : (
            <p className={styles.adminEmpty}>{SHOP_TEXT.admin.noUsers}</p>
          )}
        </section>

        <section className={styles.shopAdminPanel} aria-labelledby="shop-purchases-title">
          <div className={styles.shopAdminHeader}>
            <div>
              <p className={styles.adminEyebrow}>{SHOP_TEXT.admin.purchasesEyebrow}</p>
              <h2 id="shop-purchases-title">{SHOP_TEXT.admin.purchasesTitle}</h2>
            </div>
            <ReceiptText size={21} />
          </div>
          {state?.purchases.length ? (
            <div className={styles.adminPurchaseList}>
              {state.purchases.map((purchase) => (
                <article key={purchase.id}>
                  <span className={styles.adminPurchaseIcon}>{purchase.sparkTypePaid ? (
                    <SparkIcon type={purchase.sparkTypePaid} size={15} animated={false} />
                  ) : <ReceiptText size={14} />}</span>
                  <div>
                    <strong>{purchase.productName}</strong>
                    <small>{formatDateTime(purchase.createdAt)} · {purchase.userId}</small>
                  </div>
                  <span className={styles.adminPurchaseAmount}>{purchase.sparkTypePaid ? (
                    <SparkAmount amount={-purchase.pricePaid} sparkType={purchase.sparkTypePaid} signed compact />
                  ) : SHOP_TEXT.admin.legacyPurchase}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.adminEmpty}>{SHOP_TEXT.admin.noPurchases}</p>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? SHOP_TEXT.admin.editProduct : SHOP_TEXT.admin.newProduct}
        description={SHOP_TEXT.admin.editorDescription}
        onClose={() => !saving && !uploading && setEditing(null)}
      >
        {editing && previewProduct && (
          <form className={styles.productEditor} onSubmit={submitProductForm}>
            {message?.tone === 'error' && <Feedback tone="error">{message.text}</Feedback>}
            <div className={styles.editorPreview}>
              <ProductVisual product={previewProduct} size="modal" />
              <label className={styles.imageUploadButton}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  disabled={uploading || saving}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    void uploadImage(file);
                  }}
                />
                {uploading ? <span className={styles.shopSpinner} /> : <ImagePlus size={16} />}
                {uploading ? SHOP_TEXT.admin.uploading : SHOP_TEXT.admin.uploadImage}
              </label>
            </div>
            <div className={styles.editorGrid}>
              <label className={styles.editorWide}>
                <span>{SHOP_TEXT.admin.name}</span>
                <input required maxLength={90} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </label>
              <label className={styles.editorWide}>
                <span>{SHOP_TEXT.admin.description}</span>
                <textarea required maxLength={260} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.price}</span>
                <input type="number" min="0" max="1000000" step="1" required value={editing.price} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.priceSparkType}</span>
                <SelectField
                  value={editing.priceSparkType}
                  onChange={(priceSparkType) => setEditing({ ...editing, priceSparkType })}
                  options={SPARK_TYPE_OPTIONS}
                  ariaLabel={SHOP_TEXT.admin.priceSparkTypeAria}
                />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.stock}</span>
                <input type="number" min="0" max="1000000" step="1" value={editing.stock ?? ''} onChange={(event) => setEditing({ ...editing, stock: toNullableNumber(event.target.value) })} placeholder={SHOP_TEXT.admin.stockPlaceholder} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.category}</span>
                <SelectField value={editing.category} onChange={(category) => setEditing({ ...editing, category })} options={CATEGORY_OPTIONS} ariaLabel={SHOP_TEXT.admin.categoryAria} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.rarity}</span>
                <SelectField value={editing.rarity} onChange={(rarity) => setEditing({ ...editing, rarity })} options={RARITY_OPTIONS} ariaLabel={SHOP_TEXT.admin.rarityAria} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.productType}</span>
                <SelectField value={editing.productType} onChange={(productType) => setEditing({ ...editing, productType })} options={TYPE_OPTIONS} ariaLabel={SHOP_TEXT.admin.productTypeAria} />
              </label>
              <label>
                <span>Fulfillment</span>
                <SelectField
                  value={editing.fulfillmentKind}
                  onChange={(fulfillmentKind) => setEditing({
                    ...editing,
                    fulfillmentKind,
                    fulfillmentContactId: fulfillmentKind === 'Virtual'
                      ? null
                      : (editing.fulfillmentContactId ?? state?.fulfillmentContacts[0]?.id ?? null),
                  })}
                  options={FULFILLMENT_KIND_OPTIONS}
                  ariaLabel="Reward fulfillment type"
                />
              </label>
              {editing.fulfillmentKind !== 'Virtual' && (
                <label className={styles.editorWide}>
                  <span>Responsible person *</span>
                  <SelectField
                    value={editing.fulfillmentContactId ?? ''}
                    onChange={(fulfillmentContactId) => setEditing({ ...editing, fulfillmentContactId })}
                    options={(state?.fulfillmentContacts ?? []).map((contact) => ({
                      value: contact.id,
                      label: `${contact.name} · ${FULFILLMENT_ROLE_LABELS[contact.role]} · ${contact.email}${contact.officeName ? ` · ${contact.officeName}` : ''}`,
                    }))}
                    ariaLabel="Responsible for reward fulfillment"
                  />
                </label>
              )}
              <label>
                <span>{SHOP_TEXT.admin.icon}</span>
                <SelectField value={editing.icon} onChange={(icon) => setEditing({ ...editing, icon })} options={ICON_OPTIONS} ariaLabel={SHOP_TEXT.admin.iconAria} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.duration}</span>
                <input type="number" min="1" max="8760" step="1" value={editing.durationHours ?? ''} onChange={(event) => setEditing({ ...editing, durationHours: toNullableNumber(event.target.value) })} placeholder={SHOP_TEXT.admin.durationPlaceholder} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.availableFrom}</span>
                <input type="datetime-local" value={toDateTimeLocal(editing.availableFrom)} onChange={(event) => setEditing({ ...editing, availableFrom: event.target.value || null })} />
              </label>
              <label>
                <span>{SHOP_TEXT.admin.availableUntil}</span>
                <input type="datetime-local" value={toDateTimeLocal(editing.availableUntil)} onChange={(event) => setEditing({ ...editing, availableUntil: event.target.value || null })} />
              </label>
            </div>
            <fieldset className={styles.editorChecks}>
              <legend>{SHOP_TEXT.admin.state}</legend>
              <label><input type="checkbox" checked={editing.isActive} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} /> {SHOP_TEXT.admin.active}</label>
              <label><input type="checkbox" checked={editing.isFeatured} onChange={(event) => setEditing({ ...editing, isFeatured: event.target.checked })} /> {SHOP_TEXT.admin.featured}</label>
              <label><input type="checkbox" checked={editing.isLimited} onChange={(event) => setEditing({ ...editing, isLimited: event.target.checked })} /> {SHOP_TEXT.admin.limited}</label>
            </fieldset>
            <div className={styles.shopModalActions}>
              <button className={styles.shopSecondaryButton} type="button" disabled={saving || uploading} onClick={() => setEditing(null)}>{SHOP_TEXT.admin.cancel}</button>
              <button className={styles.shopPrimaryButton} type="submit" disabled={saving || uploading}>
                {saving ? <span className={styles.shopSpinner} /> : <Save size={16} />}
                {SHOP_TEXT.admin.save}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(productPendingDelete)}
        title={SHOP_TEXT.admin.deleteProductTitle}
        description={SHOP_TEXT.admin.deleteProductDescription}
        onClose={() => !saving && setProductPendingDelete(null)}
      >
        {productPendingDelete && (
          <div className={styles.deleteProductConfirmation}>
            <strong>{productPendingDelete.name}</strong>
            <p>{SHOP_TEXT.admin.deleteProductDescription}</p>
            <div className={styles.shopModalActions}>
              <button className={styles.shopSecondaryButton} type="button" disabled={saving} onClick={() => setProductPendingDelete(null)}>
                {SHOP_TEXT.admin.cancel}
              </button>
              <button className={styles.shopDangerButton} type="button" disabled={saving} onClick={() => void confirmDeleteProduct()}>
                {saving ? <span className={styles.shopSpinner} /> : <Trash2 size={16} />}
                {SHOP_TEXT.admin.confirmDeleteProduct}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
