import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';
import { SHOP_TEXT } from '@/constants/shop';
import type { ShopSparkTransaction } from '@/models/shop';
import { formatDateTime } from '@/utils/formatters';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';

const transactionLabel = (transaction: ShopSparkTransaction) => {
  if (transaction.transactionType === 'purchase') return SHOP_TEXT.history.purchase;
  return transaction.amount >= 0 ? SHOP_TEXT.history.manualCredit : SHOP_TEXT.history.manualDebit;
};

export function TransactionHistory({ transactions }: { transactions: ShopSparkTransaction[] }) {
  return (
    <section className={styles.historyPanel} aria-labelledby="shop-history-title">
      <div className={styles.historyHeader}>
        <div>
          <p className={styles.shopEyebrow}>{SHOP_TEXT.history.eyebrow}</p>
          <h2 id="shop-history-title">{SHOP_TEXT.history.title}</h2>
          <p>{SHOP_TEXT.history.immutable}</p>
        </div>
      </div>
      {transactions.length === 0 ? (
        <div className={styles.historyEmpty}>{SHOP_TEXT.history.empty}</div>
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
                <span>{SHOP_TEXT.history.completed}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
