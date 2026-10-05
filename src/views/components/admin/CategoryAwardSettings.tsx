import { Save, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useSpark } from '@/controllers/SparkContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { Feedback } from '@/views/components/common/Feedback';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import type { SparkCategory } from '@/models';
import styles from '@/views/styles/app.module.css';

const editableSparkTypes: SparkCategory['sparkType'][] = ['White', 'Yellow', 'Blue'];
const sparkTypeOrder = Object.fromEntries(editableSparkTypes.map((type, index) => [type, index]));

const isEditableCategory = (category: SparkCategory) => editableSparkTypes.includes(category.sparkType);

export function CategoryAwardSettings() {
  const { snapshot, saveReference, mutating } = useSpark();
  const { t } = useUserPreferences();
  const categories = snapshot!.categories
    .filter(isEditableCategory)
    .sort((left, right) =>
      left.sparkType === right.sparkType
        ? left.name.localeCompare(right.name)
        : sparkTypeOrder[left.sparkType] - sparkTypeOrder[right.sparkType],
    );
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(categories.map((category) => [category.id, category.amount])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const saveAmount = async (category: SparkCategory) => {
    const amount = amounts[category.id];
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      setMessage({ tone: 'error', text: t('adminCategory.invalid') });
      return;
    }
    setSavingId(category.id);
    setMessage(null);
    try {
      await saveReference({ kind: 'categories', data: { ...category, amount } });
      setMessage({
        tone: 'success',
        text: t('adminCategory.updated', { name: category.name, amount, type: category.sparkType }),
      });
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : t('adminCategory.error'),
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="category-award-settings-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>{t('adminCategory.eyebrow')}</p>
          <h2 id="category-award-settings-title">{t('adminCategory.title')}</h2>
          <p className={styles.mutedCopy}>{t('adminCategory.description')}</p>
        </div>
        <SlidersHorizontal size={20} aria-hidden="true" />
      </div>
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.tableScroller} tabIndex={0} aria-label={t('adminCategory.title')}>
        <table className={styles.dataTable}>
          <caption className={styles.srOnly}>{t('adminCategory.description')}</caption>
          <thead>
            <tr>
              <th>{t('adminCategory.category')}</th>
              <th>{t('adminCategory.current')}</th>
              <th>{t('adminCategory.newReward')}</th>
              <th>{t('adminCategory.status')}</th>
              <th><span className={styles.srOnly}>{t('adminCategory.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => {
              const amount = amounts[category.id];
              const invalid = !Number.isInteger(amount) || amount < 1 || amount > 100;
              const unchanged = amount === category.amount;
              return (
                <tr key={category.id}>
                  <td>
                    <strong>{category.name}</strong>
                    <span>{category.description}</span>
                  </td>
                  <td><SparkBadge type={category.sparkType} amount={category.amount} /></td>
                  <td>
                    <label className={styles.categoryAmountField}>
                      <span className={styles.srOnly}>
                        {t('adminCategory.amountFor', { name: category.name })}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={amount}
                        aria-invalid={invalid || undefined}
                        disabled={mutating}
                        onChange={(event) => {
                          setAmounts((current) => ({
                            ...current,
                            [category.id]: Number(event.target.value),
                          }));
                          setMessage(null);
                        }}
                      />
                    </label>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${category.active ? styles.statusApproved : styles.statusCancelled}`}>
                      {category.active ? t('adminCategory.active') : t('adminCategory.inactive')}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={mutating || savingId === category.id || invalid || unchanged}
                      onClick={() => void saveAmount(category)}
                    >
                      {savingId === category.id ? <span className={styles.spinner} /> : <Save size={15} />}
                      {savingId === category.id ? t('adminCategory.saving') : t('adminCategory.save')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.infoNote}>{t('adminCategory.policy')}</p>
    </section>
  );
}
