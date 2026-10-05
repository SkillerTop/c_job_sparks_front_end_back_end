import { motion, useReducedMotion } from 'framer-motion';
import { SHOP_TEXT } from '@/constants/shop';
import type { SpendableSparkBalances } from '@/models/shop';
import { SparkWallet } from './SparkWallet';
import styles from '@/views/styles/shop.module.css';

export function ShopHeader({ balances, loading }: { balances: SpendableSparkBalances | null; loading: boolean }) {
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
        <p className={styles.shopEyebrow}>{SHOP_TEXT.shop.eyebrow}</p>
        <h1>{SHOP_TEXT.shop.title}</h1>
        <p>{SHOP_TEXT.shop.description}</p>
      </div>
      <SparkWallet balances={balances} loading={loading} />
    </header>
  );
}
