import { PackageOpen, RefreshCcw, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { InventoryItem } from '@/views/components/shop/InventoryItem';
import { ShopSkeleton } from '@/views/components/shop/ShopSkeleton';
import { SparkWallet } from '@/views/components/shop/SparkWallet';
import { TransactionHistory } from '@/views/components/shop/TransactionHistory';
import { SHOP_TEXT } from '@/constants/shop';
import { useShop } from '@/controllers/ShopContext';
import type { ShopInventoryItem } from '@/models/shop';
import styles from '@/views/styles/shop.module.css';

export function InventoryPage() {
  const { snapshot, balances, loading, error, activatingId, activate, refresh } = useShop();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const activateItem = async (item: ShopInventoryItem) => {
    setMessage(null);
    try {
      await activate(item.id);
      setMessage({ tone: 'success', text: SHOP_TEXT.status.activationSuccess });
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : SHOP_TEXT.errors.activateItem,
      });
    }
  };

  return (
    <PageTransition>
      <div className={styles.inventoryPage}>
        <PageHeader
          eyebrow={SHOP_TEXT.inventory.eyebrow}
          title={SHOP_TEXT.inventory.title}
          description={SHOP_TEXT.inventory.description}
          action={<SparkWallet balances={balances} compact loading={loading} />}
        />
        {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
        {error && (
          <div className={styles.shopFeedback}>
            <Feedback tone="error">{error}</Feedback>
            <button type="button" className={styles.shopSecondaryButton} onClick={() => void refresh()}>
              <RefreshCcw size={15} /> {SHOP_TEXT.shop.retry}
            </button>
          </div>
        )}
        {loading && !snapshot ? (
          <ShopSkeleton count={4} />
        ) : snapshot?.inventory.length ? (
          <section className={styles.inventoryGrid} aria-label={SHOP_TEXT.inventory.acquiredItems}>
            {snapshot.inventory.map((item) => (
              <InventoryItem
                key={item.id}
                item={item}
                loading={activatingId === item.id}
                onActivate={(selected) => void activateItem(selected)}
              />
            ))}
          </section>
        ) : snapshot ? (
          <EmptyState
            title={SHOP_TEXT.inventory.emptyTitle}
            description={SHOP_TEXT.inventory.emptyDescription}
            action={
              <Link className={styles.shopPrimaryLink} to="/shop">
                <ShoppingBag size={16} /> {SHOP_TEXT.inventory.goToShop}
              </Link>
            }
          />
        ) : null}
        {snapshot && <TransactionHistory transactions={snapshot.transactions} />}
        {!snapshot && !loading && !error && (
          <div className={styles.inventoryPlaceholder}><PackageOpen size={24} /> {SHOP_TEXT.inventory.unavailable}</div>
        )}
      </div>
    </PageTransition>
  );
}
