export interface SharedCategoryDefinition {
  code: string;
  name: string;
  description: string;
  amount: number;
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

export const WHITE_CATEGORY_DEFINITIONS: readonly SharedCategoryDefinition[] = whiteDefinitions.map(
  ([name, description], index) => ({
    code: index === 0 ? 'knowledge-sharing' : slug(name),
    name,
    description,
    amount: 1,
  }),
);

export interface SeededSharedCategoryDefinition extends SharedCategoryDefinition {
  seedId: string;
  seedVersionId: string;
}

export const YELLOW_CATEGORY_DEFINITIONS: readonly SeededSharedCategoryDefinition[] = [
  { seedId: '0002', seedVersionId: '1002', code: 'referral', name: 'Successful employee referral', description: 'Referred a colleague who joined C-Job and successfully completed probation.', amount: 1 },
  { seedId: '0302', seedVersionId: '1302', code: 'proposal', name: 'Implemented automation proposal', description: 'Proposed a script or automation that was accepted, built and put into real use.', amount: 2 },
  { seedId: '0303', seedVersionId: '1303', code: 'team-tool', name: 'Tool or script for one team (project or client team)', description: 'Created and implemented a tool or script for one project team or one client team with proven impact.', amount: 4 },
  { seedId: '0304', seedVersionId: '1304', code: 'cross-team', name: 'Cross-team solution and department training', description: 'Designed and implemented a solution used by several teams, improved quality or efficiency, and trained the department.', amount: 7 },
  { seedId: '0305', seedVersionId: '1305', code: 'deadline', name: 'Critical delivery deadline rescue', description: 'Closed a critical deadline or made a specific contribution that prevented a delivery failure.', amount: 1 },
  { seedId: '0306', seedVersionId: '1306', code: 'quality-save', name: 'Serious issue caught before delivery', description: 'Found a serious error before the work was sent to the client.', amount: 1 },
  { seedId: '0307', seedVersionId: '1307', code: 'checklist', name: 'Reusable self-check list', description: 'Prepared a high-quality self-check list that is actively reused by several colleagues. It must be confirmed by relevant self-check lists in the project folder for at least one month.', amount: 1 },
  { seedId: '0308', seedVersionId: '1308', code: 'client-feedback', name: 'Named positive client feedback', description: 'Received explicit positive client feedback that names the employee and their contribution.', amount: 2 },
  { seedId: '0309', seedVersionId: '1309', code: 'acting-lead', name: 'First acting coordinator or lead assignment', description: 'Successfully acted as coordinator or lead for the first time, without previous coordination experience.', amount: 1 },
  { seedId: '0310', seedVersionId: '1310', code: 'training', name: 'Recorded internal training', description: 'Independently prepared, delivered and recorded training for junior specialists or the department.', amount: 2 },
];

export const BLUE_CATEGORY_DEFINITIONS: readonly SeededSharedCategoryDefinition[] = [
  { seedId: '0004', seedVersionId: '1004', code: 'employee-of-year', name: 'Employee of the Year', description: 'Annual department distinction, limited to one recipient for every ten active department employees.', amount: 1 },
  { seedId: '0402', seedVersionId: '1402', code: 'long-term-automation', name: 'Long-term Automation / Tool / Framework', description: 'Developed an automation, tool or framework with a long-term positive effect across C-Job.', amount: 1 },
  { seedId: '0403', seedVersionId: '1403', code: 'cross-department-system', name: 'Cross-department System / Process / Toolkit', description: 'Created a system, process or toolkit that improves work or efficiency and is used by multiple departments.', amount: 2 },
  { seedId: '0404', seedVersionId: '1404', code: 'engineering-standards', name: 'Engineering Standards Contribution', description: 'Made a key contribution to C-Job engineering standards.', amount: 1 },
  { seedId: '0405', seedVersionId: '1405', code: 'international-conference', name: 'International Conference Representation', description: 'Successfully spoke at an international conference as a C-Job representative.', amount: 1 },
  { seedId: '0406', seedVersionId: '1406', code: 'successful-department-project', name: 'Most Successful Department Project', description: 'Coordinated the department’s most successful project of the year, considering savings percentage, total hours, quality and client feedback.', amount: 1 },
];
