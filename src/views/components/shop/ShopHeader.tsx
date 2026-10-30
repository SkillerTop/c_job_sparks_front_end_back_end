import { motion, useReducedMotion } from 'framer-motion';

import { MapPin } from 'lucide-react';
import type { ShopLocation, SpendableSparkBalances } from '@/models/shop';
import { SHOP_LOCATIONS } from '@/constants/shop';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { SparkWallet } from './SparkWallet';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function ShopHeader({ balances, loading, location, onLocationChange }: {
  balances: SpendableSparkBalances | null;
  loading: boolean;
  location: ShopLocation | null;
  onLocationChange: (location: ShopLocation) => void;
}) {
  const shopText = useLocalizedShopText();
  const { localize } = useUserPreferences();
  const reduced = useReducedMotion();
  return (
    <header className={styles.shopHero}>
      <span className={styles.heroGlow} aria-hidden="true" />
      <div className={styles.heroParticles} aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((particle) => (
          <motion.span
            key={particle}
            animate={reduced ? undefined : { y: [0, -7, 0], opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 3.4 + particle * 0.38, repeat: Infinity, delay: particle * 0.24 }}
          />
        ))}
      </div>
      <div className={styles.heroCopy}>
        <p className={styles.shopEyebrow}>{shopText.shop.eyebrow}</p>
        <h1>{shopText.shop.title}</h1>
        <p>{shopText.shop.description}</p>
      </div>
      <div className={styles.shopHeroAside}>
        <label className={styles.shopLocationPicker}>
          <span><MapPin size={15} aria-hidden="true" /> {shopText.shop.locationLabel}</span>
          <select
            value={location ?? ''}
            onChange={(event) => onLocationChange(event.target.value as ShopLocation)}
            aria-label={shopText.shop.locationLabel}
          >
            {!location && <option value="" disabled>{localize(shopText.shop.locationDialogTitle)}</option>}
            {SHOP_LOCATIONS.map((item) => <option key={item.value} value={item.value}>{localize(item.label)}</option>)}
          </select>
        </label>
        <SparkWallet balances={balances} loading={loading} />
      </div>
    </header>
  );
}
