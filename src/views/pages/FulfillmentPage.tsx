import { PackageCheck, RefreshCcw, Save, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fulfillmentStatusOptions } from '@/constants/fulfillment';
import { useFulfillmentController } from '@/controllers/useFulfillmentController';
import type { RewardFulfillment } from '@/models/shop';
import { formatDateTime } from '@/utils/formatters';
import { EmptyState } from '@/views/components/common/EmptyState';
import { Feedback } from '@/views/components/common/Feedback';
import { LocalizedText } from '@/views/components/common/LocalizedText';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SelectField } from '@/views/components/ui/SelectField';
import appStyles from '@/views/styles/app.module.css';
import shopStyles from '@/views/styles/shop.module.css';

function FulfillmentEditor({
  item,
  busy,
  onSave,
}: {
  item: RewardFulfillment;
  busy: boolean;
  onSave: (status: RewardFulfillment['status'], notes: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(item.status);
  const [notes, setNotes] = useState(item.notes ?? '');
  useEffect(() => {
    setStatus(item.status);
    setNotes(item.notes ?? '');
  }, [item.status, item.notes]);
  const final = item.status === 'Delivered' || item.status === 'Cancelled';
  return (
    <article className={shopStyles.fulfillmentEditorCard}>
      <span className={shopStyles.adminPurchaseIcon}><PackageCheck size={16} aria-hidden="true" /></span>
      <div className={shopStyles.fulfillmentEditorDetails}>
        <strong>{item.employeeName} · {item.rewardKind}</strong>
        <small>{item.contactName}{item.officeName ? ` · ${item.officeName}` : ''}</small>
        <small>{item.sourceType} · {formatDateTime(item.requestedAt)}</small>
        {item.valuablePrizeDescription && <p>{item.valuablePrizeDescription}</p>}
      </div>
      <div className={shopStyles.fulfillmentEditorControls}>
        <SelectField
          value={status}
          disabled={busy || final}
          onChange={(value) => setStatus(value as RewardFulfillment['status'])}
          options={fulfillmentStatusOptions(item.status)}
          ariaLabel={`Fulfillment status for ${item.employeeName}`}
        />
        <label>
          <span><LocalizedText>Operational notes</LocalizedText></span>
          <textarea
            rows={2}
            maxLength={2000}
            value={notes}
            disabled={busy || final}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={shopStyles.shopPrimaryButton}
          disabled={busy || final || status === item.status}
          onClick={() => void onSave(status, notes)}
        >
          <Save size={15} aria-hidden="true" />
          <LocalizedText>{busy ? 'Saving…' : 'Save status'}</LocalizedText>
        </button>
      </div>
    </article>
  );
}

export function FulfillmentPage() {
  const controller = useFulfillmentController();

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Office operations"
        title="Reward fulfillment"
        description="Track physical rewards, certificates, equipment and Radiant prizes until delivery."
        action={(
          <label className={appStyles.searchField}>
            <span className={appStyles.srOnly}><LocalizedText>Search fulfillment requests</LocalizedText></span>
            <Search size={16} aria-hidden="true" />
            <input value={controller.query} onChange={(event) => controller.setQuery(event.target.value)} placeholder="Search requests" />
          </label>
        )}
      />
      {controller.message && <Feedback tone={controller.message.tone}>{controller.message.text}</Feedback>}
      {controller.loading ? (
        <div className={appStyles.loadingScreen} role="status"><LocalizedText>Loading reward fulfillment…</LocalizedText></div>
      ) : controller.visibleItems.length === 0 ? (
        <EmptyState title="No reward fulfillment requests" description="New requests will appear here after a fulfilled award or shop purchase." />
      ) : (
        <section className={shopStyles.fulfillmentEditorList} aria-label="Reward fulfillment requests">
          {controller.visibleItems.map((item) => (
            <FulfillmentEditor
              key={item.id}
              item={item}
              busy={controller.busyId === item.id}
              onSave={(status, notes) => controller.update(item, status, notes)}
            />
          ))}
        </section>
      )}
      {controller.hasNext && (
        <button type="button" className={shopStyles.shopSecondaryButton} disabled={controller.loadingMore} onClick={() => void controller.loadMore()}>
          <RefreshCcw size={15} aria-hidden="true" />
          <LocalizedText>{controller.loadingMore ? 'Loading…' : 'Load more fulfillment requests'}</LocalizedText>
        </button>
      )}
    </PageTransition>
  );
}
