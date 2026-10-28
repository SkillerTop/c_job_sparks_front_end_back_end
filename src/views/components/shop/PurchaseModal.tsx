import { ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/views/components/common/Modal';
import { Feedback } from '@/views/components/common/Feedback';
import { SparkIcon } from '@/views/components/common/SparkIcon';

import { FULFILLMENT_ROLE_LABELS } from '@/constants/fulfillment';
import type { FulfillmentContact } from '@/models';
import type { DeliveryMethod, PurchaseFulfillmentChoice, ShopProduct, SpendableSparkBalances } from '@/models/shop';
import { SelectField } from '@/views/components/ui/SelectField';
import { ProductVisual } from './ProductVisual';
import { RarityBadge } from './RarityBadge';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';
import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


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
  const shopText = useLocalizedShopText();
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('OfficePickup');
  const [officeName, setOfficeName] = useState('Main office');
  const assignedContact = contacts.find((contact) => contact.id === product?.fulfillmentContactId);
  const officeOptions = useMemo(
    () => contacts
      .filter((contact) => contact.role === 'OfficeManager' && contact.officeName)
      .map((contact) => contact.officeName!)
      .filter((office, index, offices) => offices.indexOf(office) === index),
    [contacts],
  );
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
  }, [product, contacts, officeOptions]);
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
      title={shopText.purchase.title}
      description={shopText.purchase.serverCheck}
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
            <Feedback tone="error"><LocalizedText>This product has no active responsible person. Contact an administrator.</LocalizedText></Feedback>
          )}
          {needsFulfillment && (
            <div className={styles.fulfillmentFields}>
              <p><strong><LocalizedText>Reward fulfillment</LocalizedText></strong><br /><LocalizedText>The responsible person is configured by an administrator for this product.</LocalizedText></p>
              {assignedContact && (
                <p>
                  <strong><LocalizedText>Responsible person:</LocalizedText></strong><br />
                  {assignedContact.name} · {FULFILLMENT_ROLE_LABELS[assignedContact.role]} · {assignedContact.email}
                  <LocalizedText>{assignedContact.officeName ? ` · ${assignedContact.officeName}` : ''}</LocalizedText>
                </p>
              )}
              {product.fulfillmentKind === 'Physical' && (
                <>
                  <label>
                    <span><LocalizedText>Delivery</LocalizedText></span>
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
                      <span><LocalizedText>Pickup office</LocalizedText></span>
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
              {product.fulfillmentKind === 'Certificate' && <small><LocalizedText>The certificate will be ordered to your work email.</LocalizedText></small>}
              {product.fulfillmentKind === 'ITEquipment' && <small><LocalizedText>Your manager will coordinate one request with IT and accounting.</LocalizedText></small>}
            </div>
          )}
          <dl className={styles.purchaseSummary}>
            <div>
              <dt>{shopText.labels.price}</dt>
              <dd><SparkAmount amount={product.price} sparkType={product.priceSparkType} /></dd>
            </div>
            <div>
              <dt>{shopText.purchase.currentBalance}</dt>
              <dd><SparkAmount amount={available} sparkType={product.priceSparkType} /></dd>
            </div>
            <div className={styles.purchaseAfter}>
              <dt>{shopText.purchase.afterPurchase}</dt>
              <dd><SparkAmount amount={Math.max(0, after)} sparkType={product.priceSparkType} /></dd>
            </div>
          </dl>
          <p className={styles.secureNote}>
            <ShieldCheck size={16} aria-hidden="true" /> {shopText.purchase.atomicOperation}
          </p>
          <div className={styles.shopModalActions}>
            <button className={styles.shopSecondaryButton} type="button" disabled={loading} onClick={onClose}>
              {shopText.purchase.cancel}
            </button>
            <button className={styles.shopPrimaryButton} type="button" disabled={loading || (needsFulfillment && !assignedContact) || (needsFulfillment && deliveryMethod === 'OfficePickup' && !officeName)} onClick={() => onConfirm(fulfillment)}>
              {loading ? <span className={styles.shopSpinner} aria-hidden="true" /> : (
                <SparkIcon type={product.priceSparkType} size={16} animated={false} />
              )}
              {loading ? shopText.purchase.processing : shopText.purchase.confirm}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
