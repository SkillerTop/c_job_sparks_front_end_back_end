import { Filter, MoveHorizontal, Search } from 'lucide-react';
import { useState } from 'react';
import { BalanceCard } from '@/views/components/common/BalanceCard';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Modal } from '@/views/components/common/Modal';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { SelectField } from '@/views/components/ui/SelectField';
import { useLedgerController } from '@/controllers/useLedgerController';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import type { SparkTransaction, SparkType } from '@/models';
import { formatDateTime } from '@/utils/formatters';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function MySparksPage() {
  const { localize } = useUserPreferences();
  const controller = useLedgerController();
  const [selected, setSelected] = useState<SparkTransaction | null>(null);
  return (
    <PageTransition>
      <PageHeader
        eyebrow="Personal ledger"
        title="My Sparks"
        description={controller.radiantOnly
          ? 'This role keeps a Radiant-only personal ledger. Radiant awards are permanent and read-only.'
          : 'Every credit and debit remains visible. Your balance is calculated from this immutable history.'}
      />
      <div className={styles.balanceGridCompact}>
        {controller.visibleTypes.map((type, index) => (
          <BalanceCard key={type} type={type} value={controller.balances[type]} index={index} />
        ))}
      </div>
      <section className={styles.panel} aria-labelledby="ledger-title">
        <div className={styles.panelHeaderStack}>
          <div>
            <p className={styles.eyebrow}><LocalizedText>Transaction history</LocalizedText></p>
            <h2 id="ledger-title"><LocalizedText>Spark Ledger</LocalizedText></h2>
          </div>
          <div className={styles.filters}>
            <label className={styles.searchField}>
              <span className={styles.srOnly}><LocalizedText>Search ledger</LocalizedText></span>
              <Search size={16} />
              <input
                value={controller.query}
                onChange={(event) => controller.setQuery(event.target.value)}
                placeholder={localize('Search source or category')}
              />
            </label>
            <SelectField
              value={controller.type}
              onChange={(value) => controller.setType(value as 'All' | SparkType)}
              options={['All', ...controller.visibleTypes].map((value) => ({
                value: value as 'All' | SparkType,
                label: value,
              }))}
              ariaLabel="Filter ledger by Spark type"
              icon={<Filter size={15} />}
              variant="filter"
            />
            <SelectField
              value={controller.direction}
              onChange={(value) => controller.setDirection(value as 'All' | 'Credit' | 'Debit')}
              options={['All', 'Credit', 'Debit'].map((value) => ({
                value: value as 'All' | 'Credit' | 'Debit',
                label: value,
              }))}
              ariaLabel="Filter ledger by transaction direction"
              variant="filter"
            />
          </div>
        </div>
        {controller.transactions.length === 0 ? (
          <EmptyState
            title="No matching transactions"
            description="Try a different Spark type, direction or search term."
          />
        ) : (
          <>
            <p className={styles.mobileScrollHint}>
              <MoveHorizontal size={16} aria-hidden="true" /> <LocalizedText>Swipe sideways to view all transaction details.
            </LocalizedText></p>
            <div
              className={`${styles.tableScroller} ${styles.ledgerScroller}`}
              tabIndex={0}
              aria-label={localize('Scrollable Spark transaction table')}
            >
              <table className={styles.dataTable}>
                <caption className={styles.srOnly}><LocalizedText>All Spark transactions for the current employee</LocalizedText></caption>
                <thead>
                  <tr>
                    <th scope="col"><LocalizedText>Date</LocalizedText></th>
                    <th scope="col"><LocalizedText>Activity</LocalizedText></th>
                    <th scope="col"><LocalizedText>Source</LocalizedText></th>
                    <th scope="col"><LocalizedText>Amount</LocalizedText></th>
                    <th scope="col"><LocalizedText>Status</LocalizedText></th>
                    <th scope="col">
                      <span className={styles.srOnly}><LocalizedText>Details</LocalizedText></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {controller.transactions.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.dateTime)}</td>
                      <td>
                        <strong>{item.category}</strong>
                        <span>{item.description}</span>
                      </td>
                      <td>{item.source}</td>
                      <td>
                        <SparkBadge type={item.sparkType} amount={item.amount} compact />
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td>
                        <button className={styles.rowButton} type="button" onClick={() => setSelected(item)}>
                          <LocalizedText>Details
                        </LocalizedText></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <Modal
        open={Boolean(selected)}
        title="Transaction details"
        description="This ledger entry is read-only and cannot be deleted."
        onClose={() => setSelected(null)}
      >
        {selected && (
          <dl className={styles.detailGrid}>
            <div>
              <dt><LocalizedText>Transaction ID</LocalizedText></dt>
              <dd>{selected.id}</dd>
            </div>
            <div>
              <dt><LocalizedText>Date / time</LocalizedText></dt>
              <dd>{formatDateTime(selected.dateTime)}</dd>
            </div>
            <div>
              <dt><LocalizedText>Spark type</LocalizedText></dt>
              <dd>
                <SparkBadge type={selected.sparkType} />
              </dd>
            </div>
            <div>
              <dt><LocalizedText>Amount</LocalizedText></dt>
              <dd>
                {selected.amount > 0 ? '+' : ''}
                {selected.amount}
              </dd>
            </div>
            <div>
              <dt><LocalizedText>Transaction type</LocalizedText></dt>
              <dd>{selected.transactionType}</dd>
            </div>
            <div>
              <dt><LocalizedText>Source</LocalizedText></dt>
              <dd>{selected.source}</dd>
            </div>
            <div>
              <dt><LocalizedText>Category</LocalizedText></dt>
              <dd>{selected.category}</dd>
            </div>
            <div>
              <dt><LocalizedText>Quarter</LocalizedText></dt>
              <dd>{selected.quarter}</dd>
            </div>
            <div className={styles.detailWide}>
              <dt><LocalizedText>Description</LocalizedText></dt>
              <dd>{selected.description}</dd>
            </div>
            <div>
              <dt><LocalizedText>Employee</LocalizedText></dt>
              <dd>{controller.employeeLabel(selected.employeeId)}</dd>
            </div>
            <div>
              <dt><LocalizedText>Awarded by</LocalizedText></dt>
              <dd>{controller.employeeLabel(selected.awardedBy)}</dd>
            </div>
            <div>
              <dt><LocalizedText>Approved by</LocalizedText></dt>
              <dd>{controller.employeeLabel(selected.approvedBy)}</dd>
            </div>
            <div>
              <dt><LocalizedText>Related request</LocalizedText></dt>
              <dd><LocalizedText>{selected.relatedRequestId ?? 'No linked request'}</LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Status</LocalizedText></dt>
              <dd>
                <StatusBadge status={selected.status} />
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </PageTransition>
  );
}
