import { useState, type FormEvent } from 'react';
import { Save, Settings2 } from 'lucide-react';
import { useSpark } from '@/controllers/SparkContext';
import { Feedback } from '@/views/components/common/Feedback';
import { SelectField } from '@/views/components/ui/SelectField';
import type { PerformanceThresholdSettings, SparkSettings } from '@/models';
import { performanceThresholdValidationIssue } from '@/utils/sparkRules';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


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
  const updatePerformanceTier = (
    source: keyof PerformanceThresholdSettings,
    index: number,
    field: 'minimum' | 'reward',
    value: number,
  ) => setSettings((current) => ({
    ...current,
    performanceThresholds: {
      ...current.performanceThresholds,
      [source]: current.performanceThresholds[source].map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier),
    },
  }));
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationIssue = performanceThresholdValidationIssue(settings.performanceThresholds);
    if (validationIssue) {
      setMessage({ tone: 'error', text: validationIssue });
      return;
    }
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
          <p className={styles.eyebrow}><LocalizedText>Configurable Spark policy</LocalizedText></p>
          <h2><LocalizedText>Spark economy</LocalizedText></h2>
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
          <span><LocalizedText>Disenchant rate (%)</LocalizedText></span>
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
          <span><LocalizedText>Accounting currency</LocalizedText></span>
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
              {type} <LocalizedText>base value (</LocalizedText>{settings.currency})
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
        <section className={`${styles.settingsSection} ${styles.fieldFull}`} aria-labelledby="performance-thresholds-title">
          <div>
            <p className={styles.eyebrow}><LocalizedText>Automatic White Sparks</LocalizedText></p>
            <h3 id="performance-thresholds-title"><LocalizedText>Performance reward thresholds</LocalizedText></h3>
            <p className={styles.mutedCopy}>
              <LocalizedText>Each row defines the minimum score and White reward for that tier. Scores below the first tier receive 0 White.
            </LocalizedText></p>
          </div>
          <div className={styles.thresholdGroups}>
            {([
              ['kpi', 'KPI', 0.01, undefined],
              ['personalCards', 'Personal Cards', 0.01, 5],
            ] as const).map(([source, label, step, max]) => (
              <fieldset className={styles.thresholdGroup} key={source}>
                <legend>{label}</legend>
                <div className={styles.thresholdHeader} aria-hidden="true">
                  <span><LocalizedText>Tier</LocalizedText></span><span><LocalizedText>Minimum score</LocalizedText></span><span><LocalizedText>White reward</LocalizedText></span>
                </div>
                {settings.performanceThresholds[source].map((tier, index) => (
                  <div className={styles.thresholdRow} key={`${source}-${index}`}>
                    <strong><LocalizedText>Tier </LocalizedText>{index + 1}</strong>
                    <label>
                      <span className={styles.srOnly}>{label} <LocalizedText>tier </LocalizedText>{index + 1} <LocalizedText>minimum score</LocalizedText></span>
                      <input
                        type="number"
                        required
                        min={0}
                        {...(max === undefined ? {} : { max })}
                        step={step}
                        value={tier.minimum}
                        onChange={(event) => updatePerformanceTier(source, index, 'minimum', Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <span className={styles.srOnly}>{label} <LocalizedText>tier </LocalizedText>{index + 1} <LocalizedText>White reward</LocalizedText></span>
                      <input
                        type="number"
                        required
                        min={0}
                        max={100}
                        step={1}
                        value={tier.reward}
                        onChange={(event) => updatePerformanceTier(source, index, 'reward', Number(event.target.value))}
                      />
                    </label>
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
        </section>
      </div>
      <p className={styles.mutedCopy}>
        <LocalizedText>Conversion fees are added on top of the displayed ratio. Base values and currency are
        internal accounting policy values, not live currency exchange rates.
      </LocalizedText></p>
      <button type="submit" className={styles.primaryButtonWide} disabled={saving}>
        {saving ? <span className={styles.spinner} /> : <Save size={16} />}
        <LocalizedText>{saving ? 'Saving…' : 'Save rules'}</LocalizedText>
      </button>
    </form>
  );
}
