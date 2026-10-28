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
import { FULFILLMENT_KIND_OPTIONS, PRODUCT_ICON_OPTIONS, PRODUCT_TYPE_OPTIONS, SHOP_CATEGORIES, RARITY_LABELS } from '@/constants/shop';
import { useShopAdminController } from '@/controllers/useShopAdminController';
import { FULFILLMENT_ROLE_LABELS } from '@/constants/fulfillment';
import type { ProductRarity, ProductType, ShopCategory, ShopProduct } from '@/models/shop';
import { formatDateTime } from '@/utils/formatters';
import { SPENDABLE_SPARK_TYPES } from '@/utils/shop';
import styles from '@/views/styles/shop.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';
import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


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
  const shopText = useLocalizedShopText();
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
            <p className={styles.adminEyebrow}>{shopText.admin.catalogEyebrow}</p>
            <h2 id="shop-products-admin-title">{shopText.admin.catalogTitle}</h2>
            <p>{shopText.admin.catalogDescription}</p>
          </div>
          <button className={styles.shopPrimaryButton} type="button" onClick={() => openProduct()}>
            <Plus size={16} /> {shopText.admin.addProduct}
          </button>
        </div>
        <div className={styles.adminProductList}>
          {state?.products.map((product) => (
            <article key={product.id} className={styles.adminProductRow}>
              <ProductVisual product={product} size="inventory" />
              <div>
                <RarityBadge rarity={product.rarity} />
                <h3>{product.name}</h3>
                <p><SparkAmount amount={product.price} sparkType={product.priceSparkType} /> · <LocalizedText>{product.stock === null ? shopText.admin.unlimited : `${product.stock} ${shopText.admin.units}`}</LocalizedText></p>
                {product.fulfillmentKind !== 'Virtual' && (
                  <small>
                    <LocalizedText>Responsible: </LocalizedText><LocalizedText>{state.fulfillmentContacts.find((contact) => contact.id === product.fulfillmentContactId)?.name ?? 'Not assigned'}</LocalizedText>
                  </small>
                )}
              </div>
              <span className={product.isActive ? styles.adminStatusActive : styles.adminStatusDisabled}>
                {product.isActive ? shopText.admin.active : shopText.admin.disabled}
              </span>
              <div className={styles.adminProductActions}>
                <button className={styles.shopSecondaryButton} type="button" onClick={() => openProduct(product)}>
                  <Edit3 size={15} /> {shopText.admin.edit}
                </button>
                <button className={styles.shopDangerButton} type="button" onClick={() => setProductPendingDelete(product)}>
                  <Trash2 size={15} /> {shopText.admin.delete}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.shopAdminPanel} aria-labelledby="reward-fulfillment-title">
        <div className={styles.shopAdminHeader}>
          <div>
            <p className={styles.adminEyebrow}><LocalizedText>Ordering and handover</LocalizedText></p>
            <h2 id="reward-fulfillment-title"><LocalizedText>Reward fulfillment</LocalizedText></h2>
            <p><LocalizedText>Physical rewards, certificates, IT equipment and Radiant prizes stay tracked until delivery.</LocalizedText></p>
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
                    <LocalizedText>{fulfillment.officeName ? ` · ${fulfillment.officeName}` : ''}</LocalizedText>
                    <LocalizedText>{fulfillment.valuablePrizeDescription ? ` · ${fulfillment.valuablePrizeDescription}` : ''}</LocalizedText>
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
        ) : <p className={styles.adminEmpty}><LocalizedText>No reward fulfillment requests yet.</LocalizedText></p>}
      </section>

      <div className={styles.shopAdminGrid}>
        <section className={styles.shopAdminPanel} aria-labelledby="balance-adjust-title">
          <div className={styles.shopAdminHeader}>
            <div>
              <p className={styles.adminEyebrow}>{shopText.admin.balanceEyebrow}</p>
              <h2 id="balance-adjust-title">{shopText.admin.balanceTitle}</h2>
            </div>
            <SparkIcon type={adjustSparkType} size={22} animated={false} />
          </div>
          {state?.balances.length ? (
            <form className={styles.adminForm} onSubmit={submitAdjustmentForm}>
              <label>
                <span>{shopText.admin.user}</span>
                <SelectField
                  value={adjustUser}
                  onChange={setAdjustUser}
                  options={state.balances.map((balance) => ({
                    value: balance.userId,
                    label: `${balance.displayEmail} · W ${balance.balances.White} / Y ${balance.balances.Yellow} / B ${balance.balances.Blue}`,
                  }))}
                  ariaLabel={shopText.admin.userAria}
                />
              </label>
              <label>
                <span>{shopText.admin.sparkType}</span>
                <SelectField
                  value={adjustSparkType}
                  onChange={setAdjustSparkType}
                  options={SPARK_TYPE_OPTIONS}
                  ariaLabel={shopText.admin.sparkTypeAria}
                />
              </label>
              <label>
                <span>{shopText.admin.signedAmount}</span>
                <input
                  type="number"
                  min="-100000"
                  max="100000"
                  step="1"
                  required
                  value={adjustAmount}
                  onChange={(event) => setAdjustAmount(event.target.value)}
                  placeholder={shopText.admin.amountPlaceholder}
                />
              </label>
              <label>
                <span>{shopText.admin.reason}</span>
                <textarea
                  required
                  minLength={6}
                  maxLength={240}
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  placeholder={shopText.admin.reasonPlaceholder}
                />
              </label>
              <button className={styles.shopPrimaryButton} type="submit" disabled={saving}>
                {saving ? <span className={styles.shopSpinner} /> : <ShieldCheck size={16} />}
                {shopText.admin.confirmAdjustment}
              </button>
            </form>
          ) : (
            <p className={styles.adminEmpty}>{shopText.admin.noUsers}</p>
          )}
        </section>

        <section className={styles.shopAdminPanel} aria-labelledby="shop-purchases-title">
          <div className={styles.shopAdminHeader}>
            <div>
              <p className={styles.adminEyebrow}>{shopText.admin.purchasesEyebrow}</p>
              <h2 id="shop-purchases-title">{shopText.admin.purchasesTitle}</h2>
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
                  ) : shopText.admin.legacyPurchase}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.adminEmpty}>{shopText.admin.noPurchases}</p>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? shopText.admin.editProduct : shopText.admin.newProduct}
        description={shopText.admin.editorDescription}
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
                {uploading ? shopText.admin.uploading : shopText.admin.uploadImage}
              </label>
            </div>
            <div className={styles.editorGrid}>
              <label className={styles.editorWide}>
                <span>{shopText.admin.name}</span>
                <input required maxLength={90} value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </label>
              <label className={styles.editorWide}>
                <span>{shopText.admin.description}</span>
                <textarea required maxLength={260} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
              </label>
              <label>
                <span>{shopText.admin.price}</span>
                <input type="number" min="0" max="1000000" step="1" required value={editing.price} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })} />
              </label>
              <label>
                <span>{shopText.admin.priceSparkType}</span>
                <SelectField
                  value={editing.priceSparkType}
                  onChange={(priceSparkType) => setEditing({ ...editing, priceSparkType })}
                  options={SPARK_TYPE_OPTIONS}
                  ariaLabel={shopText.admin.priceSparkTypeAria}
                />
              </label>
              <label>
                <span>{shopText.admin.stock}</span>
                <input type="number" min="0" max="1000000" step="1" value={editing.stock ?? ''} onChange={(event) => setEditing({ ...editing, stock: toNullableNumber(event.target.value) })} placeholder={shopText.admin.stockPlaceholder} />
              </label>
              <label>
                <span>{shopText.admin.category}</span>
                <SelectField value={editing.category} onChange={(category) => setEditing({ ...editing, category })} options={CATEGORY_OPTIONS} ariaLabel={shopText.admin.categoryAria} />
              </label>
              <label>
                <span>{shopText.admin.rarity}</span>
                <SelectField value={editing.rarity} onChange={(rarity) => setEditing({ ...editing, rarity })} options={RARITY_OPTIONS} ariaLabel={shopText.admin.rarityAria} />
              </label>
              <label>
                <span>{shopText.admin.productType}</span>
                <SelectField value={editing.productType} onChange={(productType) => setEditing({ ...editing, productType })} options={TYPE_OPTIONS} ariaLabel={shopText.admin.productTypeAria} />
              </label>
              <label>
                <span><LocalizedText>Fulfillment</LocalizedText></span>
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
                  <span><LocalizedText>Responsible person *</LocalizedText></span>
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
                <span>{shopText.admin.icon}</span>
                <SelectField value={editing.icon} onChange={(icon) => setEditing({ ...editing, icon })} options={ICON_OPTIONS} ariaLabel={shopText.admin.iconAria} />
              </label>
              <label>
                <span>{shopText.admin.duration}</span>
                <input type="number" min="1" max="8760" step="1" value={editing.durationHours ?? ''} onChange={(event) => setEditing({ ...editing, durationHours: toNullableNumber(event.target.value) })} placeholder={shopText.admin.durationPlaceholder} />
              </label>
              <label>
                <span>{shopText.admin.availableFrom}</span>
                <input type="datetime-local" value={toDateTimeLocal(editing.availableFrom)} onChange={(event) => setEditing({ ...editing, availableFrom: event.target.value || null })} />
              </label>
              <label>
                <span>{shopText.admin.availableUntil}</span>
                <input type="datetime-local" value={toDateTimeLocal(editing.availableUntil)} onChange={(event) => setEditing({ ...editing, availableUntil: event.target.value || null })} />
              </label>
            </div>
            <fieldset className={styles.editorChecks}>
              <legend>{shopText.admin.state}</legend>
              <label><input type="checkbox" checked={editing.isActive} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} /> {shopText.admin.active}</label>
              <label><input type="checkbox" checked={editing.isFeatured} onChange={(event) => setEditing({ ...editing, isFeatured: event.target.checked })} /> {shopText.admin.featured}</label>
              <label><input type="checkbox" checked={editing.isLimited} onChange={(event) => setEditing({ ...editing, isLimited: event.target.checked })} /> {shopText.admin.limited}</label>
            </fieldset>
            <div className={styles.shopModalActions}>
              <button className={styles.shopSecondaryButton} type="button" disabled={saving || uploading} onClick={() => setEditing(null)}>{shopText.admin.cancel}</button>
              <button className={styles.shopPrimaryButton} type="submit" disabled={saving || uploading}>
                {saving ? <span className={styles.shopSpinner} /> : <Save size={16} />}
                {shopText.admin.save}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(productPendingDelete)}
        title={shopText.admin.deleteProductTitle}
        description={shopText.admin.deleteProductDescription}
        onClose={() => !saving && setProductPendingDelete(null)}
      >
        {productPendingDelete && (
          <div className={styles.deleteProductConfirmation}>
            <strong>{productPendingDelete.name}</strong>
            <p>{shopText.admin.deleteProductDescription}</p>
            <div className={styles.shopModalActions}>
              <button className={styles.shopSecondaryButton} type="button" disabled={saving} onClick={() => setProductPendingDelete(null)}>
                {shopText.admin.cancel}
              </button>
              <button className={styles.shopDangerButton} type="button" disabled={saving} onClick={() => void confirmDeleteProduct()}>
                {saving ? <span className={styles.shopSpinner} /> : <Trash2 size={16} />}
                {shopText.admin.confirmDeleteProduct}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
