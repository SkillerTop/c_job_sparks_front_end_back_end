export interface SeedCategoryDefinition {
  id: string;
  seedVersionId: string;
  code: string;
  sparkType: 'White' | 'Yellow' | 'Blue';
  usageType: 'PeerRecognition' | 'Award';
  name: string;
  description: string;
  amount: number;
  repeatPeriod: 'Unlimited' | 'Quarterly' | 'Yearly';
}

const whiteDefinitions = [
  ['Knowledge Sharing', 'Shares useful knowledge in a form colleagues can understand and reuse.'],
  ['Documentation Hero', 'Creates or improves clear documentation that makes future work easier and safer.'],
  ['Technical Guidance', 'Provides timely technical direction that helps a colleague or team move forward.'],
  ['Quality Guardian', 'Protects quality by identifying risks, defects or missing checks before delivery.'],
  ['Attention to Detail', 'Catches an important detail and prevents rework, ambiguity or avoidable risk.'],
  ['Engineering Excellence', 'Demonstrates exceptionally strong engineering judgment, accuracy and ownership.'],
  ['Smart Solution', 'Finds a practical, thoughtful solution that simplifies work or improves the result.'],
  ['Delivery Recovery', 'Takes concrete action that gets a difficult delivery back on track.'],
  ['Coordination Excellence', 'Coordinates people and dependencies clearly so shared work succeeds.'],
  ['Leadership Support', 'Supports colleagues with calm ownership, initiative and constructive leadership.'],
  ['Communication Excellence', 'Communicates complex or sensitive information clearly and respectfully.'],
] as const;

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const peerIds = ['0001', '0102', '0103', '0104', '0105', '0106', '0107', '0108', '0109', '0110', '0111'];
const peerVersionIds = ['1001', '1102', '1103', '1104', '1105', '1106', '1107', '1108', '1109', '1110', '1111'];
const awardIds = ['0201', '0202', '0203', '0204', '0205', '0206', '0003', '0208', '0209', '0210', '0211'];
const awardVersionIds = ['1201', '1202', '1203', '1204', '1205', '1206', '1003', '1208', '1209', '1210', '1211'];

const whiteCategories = whiteDefinitions.flatMap(([name, description], index): SeedCategoryDefinition[] => [
  {
    id: `88888888-${peerIds[index]}-4000-8000-00000000${peerIds[index]}`,
    seedVersionId: `88888888-${peerVersionIds[index]}-4000-8000-00000000${peerVersionIds[index]}`,
    code: index === 0 ? 'knowledge-sharing' : `${slug(name)}-peer`,
    sparkType: 'White',
    usageType: 'PeerRecognition',
    name,
    description,
    amount: 1,
    repeatPeriod: 'Unlimited',
  },
  {
    id: `88888888-${awardIds[index]}-4000-8000-00000000${awardIds[index]}`,
    seedVersionId: `88888888-${awardVersionIds[index]}-4000-8000-00000000${awardVersionIds[index]}`,
    code: index === 6 ? 'smart-solution' : `${slug(name)}-award`,
    sparkType: 'White',
    usageType: 'Award',
    name,
    description,
    amount: 1,
    repeatPeriod: 'Quarterly',
  },
]);

const yellowCategories: SeedCategoryDefinition[] = [
  ['0002', '1002', 'referral', 'Successful employee referral', 'Referred a colleague who joined C-Job and successfully completed probation.', 1],
  ['0302', '1302', 'proposal', 'Implemented automation proposal', 'Proposed a script or automation that was accepted, built and put into real use.', 2],
  ['0303', '1303', 'team-tool', 'Tool or script for one team (project or client team)', 'Created and implemented a tool or script for one project team or one client team with proven impact.', 4],
  ['0304', '1304', 'cross-team', 'Cross-team solution and department training', 'Designed and implemented a solution used by several teams, improved quality or efficiency, and trained the department.', 7],
  ['0305', '1305', 'deadline', 'Critical delivery deadline rescue', 'Closed a critical deadline or made a specific contribution that prevented a delivery failure.', 1],
  ['0306', '1306', 'quality-save', 'Serious issue caught before delivery', 'Found a serious error before the work was sent to the client.', 1],
  ['0307', '1307', 'checklist', 'Reusable self-check list', 'Prepared a high-quality self-check list that is actively reused by several colleagues. It must be confirmed by relevant self-check lists in the project folder for at least one month.', 1],
  ['0308', '1308', 'client-feedback', 'Named positive client feedback', 'Received explicit positive client feedback that names the employee and their contribution.', 2],
  ['0309', '1309', 'acting-lead', 'First acting coordinator or lead assignment', 'Successfully acted as coordinator or lead for the first time, without previous coordination experience.', 1],
  ['0310', '1310', 'training', 'Recorded internal training', 'Independently prepared, delivered and recorded training for junior specialists or the department.', 2],
].map(([id, versionId, code, name, description, amount]) => ({
  id: `88888888-${id}-4000-8000-00000000${id}`,
  seedVersionId: `88888888-${versionId}-4000-8000-00000000${versionId}`,
  code: String(code), sparkType: 'Yellow', usageType: 'Award', name: String(name),
  description: String(description), amount: Number(amount), repeatPeriod: 'Quarterly',
}));

const blueCategories: SeedCategoryDefinition[] = [
  ['0004', '1004', 'employee-of-year', 'Employee of the Year', 'Annual department distinction, limited to one recipient for every ten active department employees.', 1],
  ['0402', '1402', 'long-term-automation', 'Long-term Automation / Tool / Framework', 'Developed an automation, tool or framework with a long-term positive effect across C-Job.', 1],
  ['0403', '1403', 'cross-department-system', 'Cross-department System / Process / Toolkit', 'Created a system, process or toolkit that improves work or efficiency and is used by multiple departments.', 2],
  ['0404', '1404', 'engineering-standards', 'Engineering Standards Contribution', 'Made a key contribution to C-Job engineering standards.', 1],
  ['0405', '1405', 'international-conference', 'International Conference Representation', 'Successfully spoke at an international conference as a C-Job representative.', 1],
  ['0406', '1406', 'successful-department-project', 'Most Successful Department Project', 'Coordinated the department’s most successful project of the year, considering savings percentage, total hours, quality and client feedback.', 1],
].map(([id, versionId, code, name, description, amount]) => ({
  id: `88888888-${id}-4000-8000-00000000${id}`,
  seedVersionId: `88888888-${versionId}-4000-8000-00000000${versionId}`,
  code: String(code), sparkType: 'Blue', usageType: 'Award', name: String(name),
  description: String(description), amount: Number(amount), repeatPeriod: 'Yearly',
}));

export const SEED_CATEGORY_CATALOG: SeedCategoryDefinition[] = [
  ...whiteCategories,
  ...yellowCategories,
  ...blueCategories,
];
