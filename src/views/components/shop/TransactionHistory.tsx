import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';

import type { ShopSparkTransaction } from '@/models/shop';
import { formatDateTime } from '@/utils/formatters';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';


export function TransactionHistory({ transactions }: { transactions: ShopSparkTransaction[] }) {
  const shopText = useLocalizedShopText();
  const transactionLabel = (transaction: ShopSparkTransaction) => {
    if (transaction.transactionType === 'purchase') return shopText.history.purchase;
    return transaction.amount >= 0 ? shopText.history.manualCredit : shopText.history.manualDebit;
  };
  return (
    <section className={styles.historyPanel} aria-labelledby="shop-history-title">
      <div className={styles.historyHeader}>
        <div>
          <p className={styles.shopEyebrow}>{shopText.history.eyebrow}</p>
          <h2 id="shop-history-title">{shopText.history.title}</h2>
          <p>{shopText.history.immutable}</p>
        </div>
      </div>
      {transactions.length === 0 ? (
        <div className={styles.historyEmpty}>{shopText.history.empty}</div>
      ) : (
        <div className={styles.transactionList}>
          {transactions.map((transaction) => (
            <article key={transaction.id} className={styles.transactionRow}>
              <span className={styles.transactionIcon} aria-hidden="true">
                {transaction.transactionType === 'purchase' ? <ReceiptText /> :
                  transaction.amount >= 0 ? <ArrowDownLeft /> : <ArrowUpRight />}
              </span>
              <div className={styles.transactionMain}>
                <strong>{transaction.description}</strong>
                <span>{transactionLabel(transaction)} · {formatDateTime(transaction.createdAt)}</span>
                <code title={transaction.id}>{transaction.id}</code>
              </div>
              <div className={styles.transactionAmount} data-positive={transaction.amount >= 0}>
                <SparkAmount amount={transaction.amount} sparkType={transaction.sparkType} signed />
                <span>{shopText.history.completed}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
