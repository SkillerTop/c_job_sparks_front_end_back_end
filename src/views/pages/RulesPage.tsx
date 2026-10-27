import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Coins,
  Gauge,
  Search,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/views/components/common/PageHeader';
import { PageTransition } from '@/views/components/common/PageTransition';
import { SparkBadge } from '@/views/components/common/SparkBadge';
import { useSpark } from '@/controllers/SparkContext';
import type { PerformanceRewardTier, SparkType } from '@/models';
import { buildRuleCategoryGroups } from '@/utils/ruleCategoryGroups';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';import rulesStyles from '@/views/styles/rules.module.css';
import { LocalizedText } from '@/views/components/common/LocalizedText';


const tierDescriptions: Record<SparkType, string> = {
  White: 'Everyday peer recognition plus KPI and Personal Cards income.',
  Yellow: 'Significant measurable contribution.',
  Blue: 'Long-term impact with category-specific periods.',
  Radiant: 'Permanent company-wide distinction from Top Management.',
};

const performanceThresholdDescription = (tiers: PerformanceRewardTier[]) => {
  const score = (value: number) => value.toFixed(2);
  return [
    `x < ${score(tiers[0]!.minimum)} = 0`,
    ...tiers.map((tier, index) => index < tiers.length - 1
      ? `${score(tier.minimum)} ≤ x < ${score(tiers[index + 1]!.minimum)} = ${tier.reward}`
      : `x ≥ ${score(tier.minimum)} = ${tier.reward}`),
  ].join(' · ');
};

export function RulesPage() {
  const { snapshot } = useSpark();
  const { localize } = useUserPreferences();
  const [categoryQuery, setCategoryQuery] = useState('');
  const settings = snapshot!.settings;
  const categories = snapshot!.categories;
  const categoryGroups = useMemo(
    () => buildRuleCategoryGroups(categories),
    [categories],
  );
  const normalizedCategoryQuery = categoryQuery.trim().toLocaleLowerCase();
  const visibleCategoryGroups = useMemo(() => categoryGroups
    .map((group) => ({
      ...group,
      categories: normalizedCategoryQuery
        ? group.categories.filter((category) =>
            [category.name, category.description, group.label]
              .map((value) => localize(value).toLocaleLowerCase())
              .some((value) => value.includes(normalizedCategoryQuery)))
        : group.categories,
    }))
    .filter((group) => group.categories.length > 0),
  [categoryGroups, localize, normalizedCategoryQuery]);
  const visibleCategoryCount = visibleCategoryGroups.reduce(
    (total, group) => total + group.categories.length,
    0,
  );

  return (
    <PageTransition>
      <PageHeader
        eyebrow="Transparent system"
        title="C-Job Sparks rules — from A to Z"
        description="What the system is, who can recognize whom, how every Spark is created and what happens after it reaches your account."
      />

      <nav className={rulesStyles.rulesToc} aria-label={localize('Rules contents')}>
        <strong><LocalizedText>On this page</LocalizedText></strong>
        <div>
          <a href="#peer-rules-title"><LocalizedText>Peer recognition</LocalizedText></a>
          <a href="#role-rules-title"><LocalizedText>Role permissions</LocalizedText></a>
          <a href="#approval-rules-title"><LocalizedText>Approvals</LocalizedText></a>
          <a href="#performance-rules-title"><LocalizedText>Performance rewards</LocalizedText></a>
          <a href="#award-rules-title"><LocalizedText>Award categories</LocalizedText></a>
          <a href="#economy-rules-title"><LocalizedText>Spark economy</LocalizedText></a>
          <a href="#quality-rules-title"><LocalizedText>Quality and history</LocalizedText></a>
        </div>
      </nav>

      <section className={`${styles.panel} ${rulesStyles.rulesLead}`} aria-labelledby="rules-purpose-title">
        <span className={styles.largeIcon}>
          <BookOpen size={23} />
        </span>
        <div>
          <h2 id="rules-purpose-title"><LocalizedText>Recognition should be visible, fair and traceable</LocalizedText></h2>
          <p>
            <LocalizedText>C-Job Sparks turns specific work contributions into a permanent achievement and, when a reward
            applies, a Ledger transaction. Balances may change through conversion or disenchanting, but the
            original recognition story is never deleted. It recognizes contribution and behavior; it does not
            replace salary, bonuses or career progression.
          </LocalizedText></p>
        </div>
      </section>

      <section aria-labelledby="tier-rules-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}><LocalizedText>Four recognition tiers</LocalizedText></p>
            <h2 id="tier-rules-title"><LocalizedText>What each Spark means</LocalizedText></h2>
          </div>
        </div>
        <div className={rulesStyles.rulesTierGrid}>
          {(['White', 'Yellow', 'Blue', 'Radiant'] as SparkType[]).map((type) => (
            <article className={`${rulesStyles.rulesTierCard} ${styles[`tone${type}`]}`} key={type}>
              <SparkBadge type={type} />
              <h3>{type}</h3>
              <p>{tierDescriptions[type]}</p>
            </article>
          ))}
        </div>
      </section>

      <div className={rulesStyles.rulesGrid}>
        <section className={styles.panel} aria-labelledby="peer-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>Peer recognition</LocalizedText></p>
              <h2 id="peer-rules-title"><LocalizedText>Quarterly nominations</LocalizedText></h2>
            </div>
            <CalendarClock size={20} />
          </div>
          <ul className={rulesStyles.rulesList}>
            <li>
              <LocalizedText>Employees, Coordinators and GPMs start with </LocalizedText>{settings.peerBaseLimit} <LocalizedText>peer nominations per
              quarter. Heads and Top Management use their award workspaces instead.
            </LocalizedText></li>
            <li>
              <LocalizedText>A Coordinator receives one extra nomination for every </LocalizedText>{settings.coordinatorTeamMultiplier}{' '}
              <LocalizedText>active colleagues in their project team(s).
            </LocalizedText></li>
            <li><LocalizedText>Recipients are active Employees, Coordinators or GPMs; self-recognition is blocked.</LocalizedText></li>
            <li><LocalizedText>Pending requests reserve a nomination. Rejection releases it.</LocalizedText></li>
            <li><LocalizedText>Unused peer recognition expires on the last day of each quarter.</LocalizedText></li>
            <li><LocalizedText>The recipient’s Head approves or rejects the request. A rejection always includes a reason.</LocalizedText></li>
            <li>
              <LocalizedText>The sender must fill in all required details during Peer recognition, including the work, the
              contribution and why it deserves recognition.
            </LocalizedText></li>
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="role-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>Clear responsibility</LocalizedText></p>
              <h2 id="role-rules-title"><LocalizedText>Role permissions</LocalizedText></h2>
            </div>
            <Users size={20} />
          </div>
          <dl className={rulesStyles.roleRuleList}>
            <div>
              <dt><LocalizedText>Employee</LocalizedText></dt>
              <dd><LocalizedText>Peer recognition, own Sparks, achievements, conversion and disenchant requests.</LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Coordinator</LocalizedText></dt>
              <dd>
                <LocalizedText>Department team view plus Yellow award requests only for colleagues in a shared active project
                who have recorded project hours.
              </LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>GPM</LocalizedText></dt>
              <dd>
                <LocalizedText>Company-wide team view and White/Yellow award requests. GPM White allocation is based on active
                Coordinators and registrars under their control. GPMs can also review company achievements.
              </LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Head</LocalizedText></dt>
              <dd>
                <LocalizedText>Department approvals, direct White/Yellow/Blue awards, Quality Gates and the monthly
                Accounting list.
              </LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Top Management</LocalizedText></dt>
              <dd><LocalizedText>Company-wide Radiant awards, company achievements and read-only Reward Shop access.</LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Administrator</LocalizedText></dt>
              <dd><LocalizedText>Admin settings and company achievement oversight; administrative access gives no award rights.</LocalizedText></dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="approval-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>From nomination to history</LocalizedText></p>
              <h2 id="approval-rules-title"><LocalizedText>Who approves each reward</LocalizedText></h2>
            </div>
            <Workflow size={20} />
          </div>
          <dl className={rulesStyles.roleRuleList}>
            <div>
              <dt><LocalizedText>Peer recognition</LocalizedText></dt>
              <dd>
                <LocalizedText>The recipient’s Head approves or rejects it. Approval credits the White amount configured for the category; rejection returns the
                nomination.
              </LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Coordinator Yellow and GPM White/Yellow awards</LocalizedText></dt>
              <dd>
                <LocalizedText>They remain Pending until the recipient’s Head approves them. Rejections always include a
                reason.
              </LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Head awards</LocalizedText></dt>
              <dd>
                <LocalizedText>White, Yellow and Blue are awarded directly after all limits, duplicate rules and Quality
                Gates pass.
              </LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Top Management awards</LocalizedText></dt>
              <dd><LocalizedText>Radiant is awarded directly and never requires an additional approval.</LocalizedText></dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="performance-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>Automatic White Sparks</LocalizedText></p>
              <h2 id="performance-rules-title"><LocalizedText>KPI and personal cards rewards</LocalizedText></h2>
            </div>
            <Gauge size={20} />
          </div>
          <dl className={rulesStyles.roleRuleList}>
            <div>
              <dt><LocalizedText>KPI thresholds</LocalizedText></dt>
              <dd>{performanceThresholdDescription(settings.performanceThresholds.kpi)} <LocalizedText>White.</LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Personal cards thresholds</LocalizedText></dt>
              <dd>{performanceThresholdDescription(settings.performanceThresholds.personalCards)} <LocalizedText>White.</LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Quarterly import</LocalizedText></dt>
              <dd><LocalizedText>Admin previews and validates one result per employee, source and quarter before confirming it.</LocalizedText></dd>
            </div>
            <div>
              <dt><LocalizedText>Corrections and Quality Gates</LocalizedText></dt>
              <dd><LocalizedText>A replacement creates correction entries instead of duplicates. An active Quality Gate blocks the White credit.</LocalizedText></dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="award-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>Awards</LocalizedText></p>
              <h2 id="award-rules-title"><LocalizedText>Categories and safeguards</LocalizedText></h2>
            </div>
            <ShieldCheck size={20} />
          </div>
          <label className={rulesStyles.categorySearch}>
            <span><LocalizedText>Search award categories</LocalizedText></span>
            <span>
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={categoryQuery}
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder={localize('Search by category name or description')}
              />
            </span>
          </label>
          <p className={rulesStyles.searchStatus} role="status" aria-live="polite">
            {categoryQuery.trim()
              ? <><strong>{visibleCategoryCount}</strong>{' '}<LocalizedText>matching categories</LocalizedText></>
              : <LocalizedText>Category groups are collapsed until you open them.</LocalizedText>}
          </p>
          <div className={rulesStyles.rulesCategoryList}>
            {visibleCategoryGroups.map((group) => (
              <details
                className={rulesStyles.rulesDisclosure}
                key={`${group.key}-${normalizedCategoryQuery ? 'search' : 'browse'}`}
                open={normalizedCategoryQuery ? true : undefined}
              >
                <summary className={rulesStyles.rulesCategoryHeader}>
                  <SparkBadge type={group.sparkType} />
                  <span className={rulesStyles.rulesCategoryMeta}>
                    <span className={rulesStyles.rulesCategorySummary}>
                      <strong id={group.key}><LocalizedText>{group.label}</LocalizedText></strong>
                      <small><LocalizedText>{`${group.categories.length} active categories`}</LocalizedText></small>
                    </span>
                    <ChevronDown className={rulesStyles.rulesCategoryChevron} size={18} aria-hidden="true" />
                  </span>
                </summary>
                <ul aria-labelledby={group.key}>
                  {group.categories.map((category) => (
                    <li key={category.id}>
                      <div>
                        <strong><LocalizedText>{category.name}</LocalizedText></strong>
                        <p><LocalizedText>{category.description}</LocalizedText></p>
                      </div>
                      <span>
                        <LocalizedText>{group.sparkType === 'Yellow'
                          ? `${category.amount} Yellow · one category per employee per quarter`
                          : group.sparkType === 'Blue'
                            ? `${category.amount} Blue · ${category.period}`
                            : `${category.amount} White`}</LocalizedText>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {visibleCategoryGroups.length === 0 ? (
              <p className={styles.mutedCopy}><LocalizedText>No award categories match this search.</LocalizedText></p>
            ) : null}
          </div>
          <p className={rulesStyles.rulesNote}>
            <LocalizedText>Direct Yellow awards and pending Yellow requests together cannot exceed</LocalizedText>{' '}
            <strong>{settings.yellowQuarterlyLimit} <LocalizedText>per employee per quarter</LocalizedText></strong><LocalizedText>. The same Yellow category
            cannot be used twice in that quarter. White credits, converted Yellow, Blue and Radiant do not use
            this limit.
          </LocalizedText></p>
          <ul className={`${rulesStyles.rulesList} ${rulesStyles.rulesListSpaced}`}>
            <li><LocalizedText>There is no issuer limit on the number of awards or recipients.</LocalizedText></li>
            <li>
              <LocalizedText>An award that would exceed the configured Yellow limit of </LocalizedText>
              {settings.yellowQuarterlyLimit}{' '}
              <LocalizedText>is blocked in full and is never reduced automatically.</LocalizedText>
            </li>
            <li>
              <LocalizedText>The first acting coordinator or lead category is unavailable after coordination experience is
              recorded.
            </LocalizedText></li>
            <li><LocalizedText>Yellow requests require a specific achievement description before they can be submitted.</LocalizedText></li>
            <li>
              <LocalizedText>A GPM may request White awards: 1 for 1–3 active Coordinators or registrars under their control, 2
              for 4–6, and one additional White for each next group of 3.
            </LocalizedText></li>
            <li>
              <LocalizedText>Blue is awarded only by a Head. The same category cannot repeat for one employee during its
              configured quarterly, yearly or one-time period.
            </LocalizedText></li>
            <li><LocalizedText>Employee of the Year has an annual department quota of floor(active employees ÷ 10).</LocalizedText></li>
          </ul>
          <div className={rulesStyles.rulesNote}>
            <strong><LocalizedText>Radiant has no fixed categories.</LocalizedText></strong> <LocalizedText>Top Management chooses an employee, enters a required
            reason and description, and awards exactly 1 Radiant directly. It is permanent and needs no approval.
          </LocalizedText></div>
        </section>

        <section className={styles.panel} aria-labelledby="economy-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>Spark economy</LocalizedText></p>
              <h2 id="economy-rules-title"><LocalizedText>Convert and disenchant</LocalizedText></h2>
            </div>
            <Coins size={20} />
          </div>
          <div className={styles.ruleList}>
            <div>
              <span><LocalizedText>White → Yellow</LocalizedText></span>
              <strong>{settings.whiteToYellow} <LocalizedText>White = 1 Yellow</LocalizedText></strong>
            </div>
            <div>
              <span><LocalizedText>Yellow → Blue</LocalizedText></span>
              <strong>{settings.yellowToBlue} <LocalizedText>Yellow = 1 Blue</LocalizedText></strong>
            </div>
            <div>
              <span><LocalizedText>Additional conversion fee</LocalizedText></span>
              <strong>{settings.conversionFee} <LocalizedText>source Spark per bundle</LocalizedText></strong>
            </div>
          </div>
          <ul className={rulesStyles.rulesList}>
            <li>
              <LocalizedText>A complete White → Yellow bundle debits </LocalizedText>{settings.whiteToYellow + settings.conversionFee} <LocalizedText>White:
              </LocalizedText>{' '}{settings.whiteToYellow} <LocalizedText>for the conversion and </LocalizedText>{settings.conversionFee} <LocalizedText>as the fee.
            </LocalizedText></li>
            <li>
              <LocalizedText>A complete Yellow → Blue bundle debits </LocalizedText>{settings.yellowToBlue + settings.conversionFee} <LocalizedText>Yellow:
              </LocalizedText>{' '}{settings.yellowToBlue} <LocalizedText>for the conversion and </LocalizedText>{settings.conversionFee} <LocalizedText>as the fee.
            </LocalizedText></li>
            <li><LocalizedText>Radiant is permanent: it cannot be converted, spent or disenchanted.</LocalizedText></li>
            <li><LocalizedText>Blue cannot be converted. Only White and Yellow can be converted to the next tier.</LocalizedText></li>
            <li><LocalizedText>Submitting a disenchant request debits the selected Sparks immediately and creates a request.</LocalizedText></li>
            <li>
              <LocalizedText>The Head compiles the monthly request list and sends it to Accounting; the system never pays
              automatically.
            </LocalizedText></li>
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="quality-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>Quality and history</LocalizedText></p>
              <h2 id="quality-rules-title"><LocalizedText>What never happens silently</LocalizedText></h2>
            </div>
            <CheckCircle2 size={20} />
          </div>
          <ul className={rulesStyles.rulesList}>
            <li>
              <LocalizedText>An active Quality Gate blocks all positive White sources during its stated dates: KPI, Personal
              Cards, Peer Recognition, direct/manual awards and adjustments.
            </LocalizedText></li>
            <li><LocalizedText>Yellow, Blue and Radiant awards are not blocked by a Quality Gate.</LocalizedText></li>
            <li><LocalizedText>Every balance-changing operation creates a read-only Ledger entry.</LocalizedText></li>
            <li><LocalizedText>Achievements remain visible after Sparks are converted or disenchanted.</LocalizedText></li>
            <li><LocalizedText>Import replacements add correction entries; existing history is not overwritten.</LocalizedText></li>
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="team-rules-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}><LocalizedText>Team scope</LocalizedText></p>
              <h2 id="team-rules-title"><LocalizedText>Who appears in each team</LocalizedText></h2>
            </div>
            <Users size={20} />
          </div>
          <ul className={rulesStyles.rulesList}>
            <li><LocalizedText>A Coordinator sees active colleagues from their own department.</LocalizedText></li>
            <li>
              <LocalizedText>A Coordinator can award only colleagues in a shared active project team who have recorded hours on
              that project.
            </LocalizedText></li>
            <li><LocalizedText>A GPM sees active colleagues across the whole company.</LocalizedText></li>
            <li><LocalizedText>A Head works with their own department and can see the balances needed for management.</LocalizedText></li>
            <li><LocalizedText>Coordinator and GPM team cards keep colleague balances private.</LocalizedText></li>
            <li><LocalizedText>Every colleague card links directly to Peer recognition with that person already selected.</LocalizedText></li>
          </ul>
        </section>
      </div>
    </PageTransition>
  );
}
