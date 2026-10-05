import { useState, type FormEvent } from 'react';
import { Save, Settings2 } from 'lucide-react';
import { useSpark } from '@/controllers/SparkContext';
import { Feedback } from '@/views/components/common/Feedback';
import { SelectField } from '@/views/components/ui/SelectField';
import type { SparkSettings } from '@/models';
import styles from '@/views/styles/app.module.css';

const numericFields: Array<{
  key: keyof Pick<
    SparkSettings,
    | 'whiteToYellow'
    | 'yellowToBlue'
    | 'conversionFee'
    | 'yellowQuarterlyLimit'
    | 'peerBaseLimit'
    | 'coordinatorTeamMultiplier'
  >;
  label: string;
  min: number;
}> = [
  { key: 'whiteToYellow', label: 'White per Yellow', min: 1 },
  { key: 'yellowToBlue', label: 'Yellow per Blue', min: 1 },
  { key: 'conversionFee', label: 'Fee added to each bundle', min: 0 },
  { key: 'yellowQuarterlyLimit', label: 'Direct Yellow / quarter', min: 1 },
  { key: 'peerBaseLimit', label: 'Base peer nominations / quarter', min: 1 },
  { key: 'coordinatorTeamMultiplier', label: 'Team members per extra nomination', min: 1 },
];

export function EconomySettings() {
  const { snapshot, updateSettings } = useSpark();
  const [settings, setSettings] = useState(() => structuredClone(snapshot!.settings));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings(settings);
      setMessage({
        tone: 'success',
        text: 'Spark rules saved. New operations use these values; existing transactions keep their original terms.',
      });
    } catch (caught) {
      setMessage({
        tone: 'error',
        text: caught instanceof Error ? caught.message : 'Could not save settings.',
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className={styles.panel} onSubmit={(event) => void save(event)}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Configurable Spark policy</p>
          <h2>Spark economy</h2>
        </div>
        <Settings2 size={20} />
      </div>
      {message && <Feedback tone={message.tone}>{message.text}</Feedback>}
      <div className={styles.fieldGrid}>
        {numericFields.map(({ key, label, min }) => (
          <label className={styles.formField} key={key}>
            <span>{label}</span>
            <input
              type="number"
              required
              min={min}
              max={1000}
              step={1}
              value={settings[key]}
              onChange={(event) =>
                setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))
              }
            />
          </label>
        ))}
        <label className={styles.formField}>
          <span>Disenchant rate (%)</span>
          <input
            type="number"
            required
            min={1}
            max={100}
            step={1}
            value={Math.round(settings.disenchantRate * 100)}
            onChange={(event) =>
              setSettings((current) => ({ ...current, disenchantRate: Number(event.target.value) / 100 }))
            }
          />
        </label>
        <label className={styles.formField}>
          <span>Accounting currency</span>
          <SelectField
            value={settings.currency}
            onChange={(currency) => setSettings((current) => ({ ...current, currency }))}
            options={['EUR', 'USD', 'GBP'].map((currency) => ({ value: currency, label: currency }))}
            ariaLabel="Accounting currency"
          />
        </label>
        {(['White', 'Yellow', 'Blue'] as const).map((type) => (
          <label key={type} className={styles.formField}>
            <span>
              {type} base value ({settings.currency})
            </span>
            <input
              type="number"
              required
              min={0.01}
              step={0.01}
              value={settings.sparkMoneyValues[type]}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  sparkMoneyValues: { ...current.sparkMoneyValues, [type]: Number(event.target.value) },
                }))
              }
            />
          </label>
        ))}
      </div>
      <p className={styles.mutedCopy}>
        Conversion fees are added on top of the displayed ratio. Base values and currency are
        internal accounting policy values, not live currency exchange rates.
      </p>
      <button type="submit" className={styles.primaryButtonWide} disabled={saving}>
        {saving ? <span className={styles.spinner} /> : <Save size={16} />}
        {saving ? 'Saving…' : 'Save rules'}
      </button>
    </form>
  );
}
