import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Coins,
  Gauge,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { useSpark } from '@/controllers/SparkContext';
import type { SparkType } from '@/models';
import styles from '@/views/styles/app.module.css';

const tierDescriptions: Record<SparkType, string> = {
  White: 'Everyday peer recognition plus KPI and Personal Cards income.',
  Yellow: 'Significant measurable contribution.',
  Blue: 'Long-term impact with category-specific periods.',
  Radiant: 'Permanent company-wide distinction from Top Management.',
};

export function RulesPage() {
  const { snapshot } = useSpark();
  const settings = snapshot!.settings;
  const categories = (type: SparkType) =>
    snapshot!.categories.filter((category) => category.active && category.sparkType === type);

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Transparent system"
        title="C-Job Sparks rules — from A to Z"
        description="What the system is, who can recognize whom, how every Spark is created and what happens after it reaches your account."
      />

      <section className={`${styles.panel} ${styles.rulesLead}`} aria-labelledby="rules-purpose-title">
        <span className={styles.largeIcon}>
          <BookOpen size={23} />
        </span>
        <div>
          <h2 id="rules-purpose-title">Recognition should be visible, fair and traceable</h2>
          <p>
            C-Job Sparks turns specific work contributions into a permanent achievement and, when a reward
            applies, a Ledger transaction. Balances may change through conversion or disenchanting, but the
            original recognition story is never deleted. It recognizes contribution and behavior; it does not
            replace salary, bonuses or career progression.
          </p>
        </div>
      </section>

      <section aria-labelledby="tier-rules-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Four recognition tiers</p>
            <h2 id="tier-rules-title">What each Spark means</h2>
          </div>
        </div>
        <div className={styles.rulesTierGrid}>
          {(['White', 'Yellow', 'Blue', 'Radiant'] as SparkType[]).map((type) => (
            <article className={`${styles.rulesTierCard} ${styles[`tone${type}`]}`} key={type}>
              <SparkBadge type={type} />
              <h3>{type}</h3>
              <p>{tierDescriptions[type]}</p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.rulesGrid}>
        <section className={styles.panel} aria-labelledby="peer-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Peer recognition</p>
              <h2 id="peer-rules-title">Quarterly nominations</h2>
            </div>
            <CalendarClock size={20} />
          </div>
          <ul className={styles.rulesList}>
            <li>
              Employees, Coordinators and GPMs start with {settings.peerBaseLimit} peer nomination per
              quarter. Heads and Top Management use their award workspaces instead.
            </li>
            <li>
              A Coordinator receives one extra nomination for every {settings.coordinatorTeamMultiplier}{' '}
              active colleagues in their project team(s).
            </li>
            <li>Recipients are active Employees, Coordinators or GPMs; self-recognition is blocked.</li>
            <li>Pending requests reserve a nomination. Rejection releases it.</li>
            <li>Unused peer recognition expires on the last day of each quarter.</li>
            <li>The recipient’s Head approves or rejects the request. A rejection always includes a reason.</li>
            <li>
              The sender must fill in all required details during Peer recognition, including the work, the
              contribution and why it deserves recognition.
            </li>
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="role-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Clear responsibility</p>
              <h2 id="role-rules-title">Role permissions</h2>
            </div>
            <Users size={20} />
          </div>
          <dl className={styles.roleRuleList}>
            <div>
              <dt>Employee</dt>
              <dd>Peer recognition, own Sparks, achievements, conversion and disenchant requests.</dd>
            </div>
            <div>
              <dt>Coordinator</dt>
              <dd>
                Department team view plus Yellow award requests only for colleagues in a shared active project
                who have recorded project hours.
              </dd>
            </div>
            <div>
              <dt>GPM</dt>
              <dd>
                Company-wide team view and White/Yellow award requests. GPM White allocation is based on active
                Coordinators and registrars under their control. GPMs can also review company achievements.
              </dd>
            </div>
            <div>
              <dt>Head</dt>
              <dd>
                Department approvals, direct White/Yellow/Blue awards, Quality Gates and the monthly
                Accounting list.
              </dd>
            </div>
            <div>
              <dt>Top Management</dt>
              <dd>Company-wide Radiant awards, company achievements and read-only Reward Shop access.</dd>
            </div>
            <div>
              <dt>Administrator</dt>
              <dd>Admin settings and company achievement oversight; administrative access gives no award rights.</dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="approval-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>From nomination to history</p>
              <h2 id="approval-rules-title">Who approves each reward</h2>
            </div>
            <Workflow size={20} />
          </div>
          <dl className={styles.roleRuleList}>
            <div>
              <dt>Peer recognition</dt>
              <dd>
                The recipient’s Head approves or rejects it. Approval credits 1 White; rejection returns the
                nomination.
              </dd>
            </div>
            <div>
              <dt>Coordinator Yellow and GPM White/Yellow awards</dt>
              <dd>
                They remain Pending until the recipient’s Head approves them. Rejections always include a
                reason.
              </dd>
            </div>
            <div>
              <dt>Head awards</dt>
              <dd>
                White, Yellow and Blue are awarded directly after all limits, duplicate rules and Quality
                Gates pass.
              </dd>
            </div>
            <div>
              <dt>Top Management awards</dt>
              <dd>Radiant is awarded directly and never requires an additional approval.</dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="performance-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Automatic White Sparks</p>
              <h2 id="performance-rules-title">KPI and personal cards rewards</h2>
            </div>
            <Gauge size={20} />
          </div>
          <dl className={styles.roleRuleList}>
            <div>
              <dt>KPI thresholds</dt>
              <dd>
                x &lt; 1.02 = 0 · 1.02 ≤ x &lt; 1.07 = 1 · 1.07 ≤ x &lt; 1.12 = 2 · x ≥ 1.12 = 3
                White.
              </dd>
            </div>
            <div>
              <dt>Personal cards thresholds</dt>
              <dd>
                x &lt; 3.50 = 0 · 3.50 ≤ x &lt; 4.20 = 1 · 4.20 ≤ x &lt; 4.50 = 2 · x ≥ 4.50 = 3
                White.
              </dd>
            </div>
            <div>
              <dt>Quarterly import</dt>
              <dd>Admin previews and validates one result per employee, source and quarter before confirming it.</dd>
            </div>
            <div>
              <dt>Corrections and Quality Gates</dt>
              <dd>A replacement creates correction entries instead of duplicates. An active Quality Gate blocks the White credit.</dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="award-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Awards</p>
              <h2 id="award-rules-title">Categories and safeguards</h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className={styles.rulesCategoryList}>
            {(['White', 'Yellow', 'Blue'] as SparkType[]).map((type) => (
              <details className={styles.rulesDisclosure} key={type} open>
                <summary className={styles.rulesCategoryHeader}>
                  <SparkBadge type={type} />
                  <span className={styles.rulesCategoryMeta}>
                    <strong id={`award-${type.toLowerCase()}`}>
                      {type === 'Blue'
                        ? 'Blue award grounds'
                        : `${categories(type).length} active categories`}
                    </strong>
                    <ChevronDown className={styles.rulesCategoryChevron} size={18} aria-hidden="true" />
                  </span>
                </summary>
                <ul aria-labelledby={`award-${type.toLowerCase()}`}>
                  {categories(type).map((category) => (
                    <li key={category.id}>
                      <div>
                        <strong>{category.name}</strong>
                        <p>{category.description}</p>
                      </div>
                      <span>
                        {type === 'Yellow'
                          ? `${category.amount} Yellow · one category per employee per quarter`
                          : type === 'Blue'
                            ? `${category.amount} Blue · ${category.period}`
                            : '1 White'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
          <p className={styles.rulesNote}>
            Direct Yellow awards and pending Yellow requests together cannot exceed{' '}
            <strong>{settings.yellowQuarterlyLimit} per employee per quarter</strong>. The same Yellow category
            cannot be used twice in that quarter. White credits, converted Yellow, Blue and Radiant do not use
            this limit.
          </p>
          <ul className={`${styles.rulesList} ${styles.rulesListSpaced}`}>
            <li>There is no issuer limit on the number of awards or recipients.</li>
            <li>
              An award that would exceed the 7 Yellow limit is blocked in full and is never reduced
              automatically.
            </li>
            <li>
              The first acting coordinator or lead category is unavailable after coordination experience is
              recorded.
            </li>
            <li>Yellow requests require a specific achievement description before they can be submitted.</li>
            <li>
              A GPM may request White awards: 1 for 1–3 active Coordinators or registrars under their control, 2
              for 4–6, and one additional White for each next group of 3.
            </li>
            <li>
              Blue is awarded only by a Head. The same category cannot repeat for one employee during its
              configured quarterly, yearly or one-time period.
            </li>
            <li>Employee of the Year has an annual department quota of floor(active employees ÷ 10).</li>
          </ul>
          <div className={styles.rulesNote}>
            <strong>Radiant has no fixed categories.</strong> Top Management chooses an employee, enters a required
            reason and description, and awards exactly 1 Radiant directly. It is permanent and needs no approval.
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="economy-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Spark economy</p>
              <h2 id="economy-rules-title">Convert and disenchant</h2>
            </div>
            <Coins size={20} />
          </div>
          <div className={styles.ruleList}>
            <div>
              <span>White → Yellow</span>
              <strong>{settings.whiteToYellow} White = 1 Yellow</strong>
            </div>
            <div>
              <span>Yellow → Blue</span>
              <strong>{settings.yellowToBlue} Yellow = 1 Blue</strong>
            </div>
            <div>
              <span>Additional conversion fee</span>
              <strong>{settings.conversionFee} source Spark per bundle</strong>
            </div>
          </div>
          <ul className={styles.rulesList}>
            <li>
              A complete White → Yellow bundle debits {settings.whiteToYellow + settings.conversionFee} White:
              {' '}{settings.whiteToYellow} for the conversion and {settings.conversionFee} as the fee.
            </li>
            <li>
              A complete Yellow → Blue bundle debits {settings.yellowToBlue + settings.conversionFee} Yellow:
              {' '}{settings.yellowToBlue} for the conversion and {settings.conversionFee} as the fee.
            </li>
            <li>Radiant is permanent: it cannot be converted, spent or disenchanted.</li>
            <li>Blue cannot be converted. Only White and Yellow can be converted to the next tier.</li>
            <li>Submitting a disenchant request debits the selected Sparks immediately and creates a request.</li>
            <li>
              The Head compiles the monthly request list and sends it to Accounting; the system never pays
              automatically.
            </li>
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="quality-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Quality and history</p>
              <h2 id="quality-rules-title">What never happens silently</h2>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <ul className={styles.rulesList}>
            <li>
              An active Quality Gate blocks all positive White sources during its stated dates: KPI, Personal
              Cards, Peer Recognition, direct/manual awards and adjustments.
            </li>
            <li>Yellow, Blue and Radiant awards are not blocked by a Quality Gate.</li>
            <li>Every balance-changing operation creates a read-only Ledger entry.</li>
            <li>Achievements remain visible after Sparks are converted or disenchanted.</li>
            <li>Import replacements add correction entries; existing history is not overwritten.</li>
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="team-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Team scope</p>
              <h2 id="team-rules-title">Who appears in each team</h2>
            </div>
            <Users size={20} />
          </div>
          <ul className={styles.rulesList}>
            <li>A Coordinator sees active colleagues from their own department.</li>
            <li>
              A Coordinator can award only colleagues in a shared active project team who have recorded hours on
              that project.
            </li>
            <li>A GPM sees active colleagues across the whole company.</li>
            <li>A Head works with their own department and can see the balances needed for management.</li>
            <li>Coordinator and GPM team cards keep colleague balances private.</li>
            <li>Every colleague card links directly to Peer recognition with that person already selected.</li>
          </ul>
        </section>
      </div>
    </PageTransition>
  );
}
