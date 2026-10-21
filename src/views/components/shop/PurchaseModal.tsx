import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '@/views/components/common/Modal';
import { Feedback } from '@/views/components/common/Feedback';
import { SparkIcon } from '@/views/components/common/SparkIcon';
import { SHOP_TEXT } from '@/constants/shop';
import { FULFILLMENT_ROLE_LABELS } from '@/constants/fulfillment';
import type { FulfillmentContact } from '@/models';
import type { DeliveryMethod, PurchaseFulfillmentChoice, ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { SelectField } from '@/views/components/ui/SelectField';
import { ProductVisual } from './ProductVisual';
import { RarityBadge } from './RarityBadge';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';

export function PurchaseModal({
  product,
  balances,
  loading,
  error,
  contacts,
  onClose,
  onConfirm,
}: {
  product: ShopProduct | null;
  balances: SpendableSparkBalances;
  loading: boolean;
  error: string | null;
  contacts: FulfillmentContact[];
  onClose: () => void;
  onConfirm: (fulfillment?: PurchaseFulfillmentChoice) => void;
}) {
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('OfficePickup');
  const [officeName, setOfficeName] = useState('Main office');
  const assignedContact = contacts.find((contact) => contact.id === product?.fulfillmentContactId);
  const officeOptions = contacts
    .filter((contact) => contact.role === 'OfficeManager' && contact.officeName)
    .map((contact) => contact.officeName!)
    .filter((office, index, offices) => offices.indexOf(office) === index);
  useEffect(() => {
    if (!product) return;
    const preferredOffice = contacts.find((contact) => contact.role === 'OfficeManager' && contact.officeName === 'Main office')
      ?.officeName ?? officeOptions[0] ?? '';
    setOfficeName(preferredOffice);
    setDeliveryMethod(product.fulfillmentKind === 'Certificate'
      ? 'WorkEmail'
      : product.fulfillmentKind === 'ITEquipment'
        ? 'InternalCoordination'
        : 'OfficePickup');
  }, [product?.id, contacts]);
  const available = product ? balances[product.priceSparkType] : 0;
  const after = product ? available - product.price : available;
  const needsFulfillment = product?.fulfillmentKind !== 'Virtual';
  const fulfillment = needsFulfillment && product ? {
    deliveryMethod,
    ...(deliveryMethod === 'OfficePickup' && officeName
      ? { officeName }
      : {}),
  } : undefined;
  return (
    <Modal
      open={Boolean(product)}
      title={SHOP_TEXT.purchase.title}
      description={SHOP_TEXT.purchase.serverCheck}
      onClose={() => !loading && onClose()}
    >
      {product && (
        <div className={styles.purchaseModalBody}>
          <div className={styles.purchaseProduct}>
            <ProductVisual product={product} size="modal" />
            <div>
              <RarityBadge rarity={product.rarity} />
              <h3>{product.name}</h3>
              <p>{product.description}</p>
            </div>
          </div>
          {error && <Feedback tone="error">{error}</Feedback>}
          {needsFulfillment && !assignedContact && (
            <Feedback tone="error">This product has no active responsible person. Contact an administrator.</Feedback>
          )}
          {needsFulfillment && (
            <div className={styles.fulfillmentFields}>
              <p><strong>Reward fulfillment</strong><br />The responsible person is configured by an administrator for this product.</p>
              {assignedContact && (
                <p>
                  <strong>Responsible person:</strong><br />
                  {assignedContact.name} · {FULFILLMENT_ROLE_LABELS[assignedContact.role]} · {assignedContact.email}
                  {assignedContact.officeName ? ` · ${assignedContact.officeName}` : ''}
                </p>
              )}
              {product.fulfillmentKind === 'Physical' && (
                <>
                  <label>
                    <span>Delivery</span>
                    <SelectField
                      value={deliveryMethod}
                      onChange={setDeliveryMethod}
                      options={[
                        { value: 'OfficePickup', label: 'Pick up at the selected office' },
                        { value: 'EmployeePaidDelivery', label: 'Delivery paid by employee' },
                      ]}
                      ariaLabel="Reward delivery method"
                    />
                  </label>
                  {deliveryMethod === 'OfficePickup' && (
                    <label>
                      <span>Pickup office</span>
                      <SelectField
                        value={officeName}
                        onChange={setOfficeName}
                        options={officeOptions.map((office) => ({ value: office, label: office }))}
                        ariaLabel="Reward pickup office"
                      />
                    </label>
                  )}
                </>
              )}
              {product.fulfillmentKind === 'Certificate' && <small>The certificate will be ordered to your work email.</small>}
              {product.fulfillmentKind === 'ITEquipment' && <small>Your manager will coordinate one request with IT and accounting.</small>}
            </div>
          )}
          <dl className={styles.purchaseSummary}>
            <div>
              <dt>{SHOP_TEXT.labels.price}</dt>
              <dd><SparkAmount amount={product.price} sparkType={product.priceSparkType} /></dd>
            </div>
            <div>
              <dt>{SHOP_TEXT.purchase.currentBalance}</dt>
              <dd><SparkAmount amount={available} sparkType={product.priceSparkType} /></dd>
            </div>
            <div className={styles.purchaseAfter}>
              <dt>{SHOP_TEXT.purchase.afterPurchase}</dt>
              <dd><SparkAmount amount={Math.max(0, after)} sparkType={product.priceSparkType} /></dd>
            </div>
          </dl>
          <p className={styles.secureNote}>
            <ShieldCheck size={16} aria-hidden="true" /> {SHOP_TEXT.purchase.atomicOperation}
          </p>
          <div className={styles.shopModalActions}>
            <button className={styles.shopSecondaryButton} type="button" disabled={loading} onClick={onClose}>
              {SHOP_TEXT.purchase.cancel}
            </button>
            <button className={styles.shopPrimaryButton} type="button" disabled={loading || (needsFulfillment && !assignedContact) || (needsFulfillment && deliveryMethod === 'OfficePickup' && !officeName)} onClick={() => onConfirm(fulfillment)}>
              {loading ? <span className={styles.shopSpinner} aria-hidden="true" /> : (
                <SparkIcon type={product.priceSparkType} size={16} animated={false} />
              )}
              {loading ? SHOP_TEXT.purchase.processing : SHOP_TEXT.purchase.confirm}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
