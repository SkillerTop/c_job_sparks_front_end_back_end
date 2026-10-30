import { MapPin } from 'lucide-react';
import { SHOP_LOCATIONS } from '@/constants/shop';
import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';
import type { ShopLocation } from '@/models/shop';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { Modal } from '@/views/components/common/Modal';
import styles from '@/views/styles/shop.module.css';

export function ShopLocationDialog({
  open,
  onSelect,
}: {
  open: boolean;
  onSelect: (location: ShopLocation) => void;
}) {
  const shopText = useLocalizedShopText();
  const { localize } = useUserPreferences();
  return (
    <Modal
      open={open}
      title={shopText.shop.locationDialogTitle}
      description={shopText.shop.locationDialogDescription}
      onClose={() => undefined}
      dismissible={false}
    >
      <div className={styles.shopLocationDialogBody}>
        <p>{localize(shopText.shop.locationDialogHint)}</p>
        <div className={styles.shopLocationOptions}>
          {SHOP_LOCATIONS.map((item) => (
            <button key={item.value} type="button" onClick={() => onSelect(item.value)}>
              <MapPin size={20} aria-hidden="true" />
              <span>{localize(item.label)}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
