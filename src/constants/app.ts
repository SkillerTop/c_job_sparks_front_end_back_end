import type { Role, SparkType } from '@/models';

export const APP_NAME = 'C-Job Sparks';
export const BUSINESS_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM', 'Head', 'Top Management'];
export const MEMBER_WORKSPACE_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM', 'Head'];
export const PEER_RECOGNITION_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM'];
export const PERFORMANCE_ROLES: Role[] = ['Employee', 'Coordinator', 'GPM'];
export const SHOP_ROLES: Role[] = [...MEMBER_WORKSPACE_ROLES, 'Top Management'];
export const COMPANY_ACHIEVEMENT_ROLES: Role[] = ['GPM', 'Top Management', 'Administrator'];
export const ALL_ROLES: Role[] = [...BUSINESS_ROLES, 'Administrator'];
export const SPARK_TYPES: SparkType[] = ['White', 'Yellow', 'Blue', 'Radiant'];

export const RECOGNITION_CATEGORIES = [
  'Knowledge Sharing',
  'Documentation Hero',
  'Technical Guidance',
  'Quality Guardian',
  'Attention to Detail',
  'Engineering Excellence',
  'Smart Solution',
  'Delivery Recovery',
  'Coordination Excellence',
  'Leadership Support',
  'Communication Excellence',
];

export const RECOGNITION_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Knowledge Sharing': 'Shares useful knowledge in a form colleagues can understand and reuse.',
  'Documentation Hero': 'Creates or improves clear documentation that makes future work easier and safer.',
  'Technical Guidance': 'Provides timely technical direction that helps a colleague or team move forward.',
  'Quality Guardian': 'Protects quality by identifying risks, defects or missing checks before delivery.',
  'Attention to Detail': 'Catches an important detail and prevents rework, ambiguity or avoidable risk.',
  'Engineering Excellence': 'Demonstrates exceptionally strong engineering judgment, accuracy and ownership.',
  'Smart Solution': 'Finds a practical, thoughtful solution that simplifies work or improves the result.',
  'Delivery Recovery': 'Takes concrete action that gets a difficult delivery back on track.',
  'Coordination Excellence': 'Coordinates people and dependencies clearly so shared work succeeds.',
  'Leadership Support': 'Supports colleagues with calm ownership, initiative and constructive leadership.',
  'Communication Excellence': 'Communicates complex or sensitive information clearly and respectfully.',
};

export const YELLOW_CATEGORIES: Array<{
  id: string;
  label: string;
  amount: number;
  description: string;
}> = [
  {
    id: 'referral',
    label: 'Successful employee referral',
    amount: 1,
    description: 'Referred a colleague who joined C-Job and successfully completed probation.',
  },
  {
    id: 'proposal',
    label: 'Implemented automation proposal',
    amount: 2,
    description: 'Proposed a script or automation that was accepted, built and put into real use.',
  },
  {
    id: 'team-tool',
    label: 'Tool or script for one team (project or client team)',
    amount: 4,
    description:
      'Created and implemented a tool or script for one project team or one client team with proven impact.',
  },
  {
    id: 'cross-team',
    label: 'Cross-team solution and department training',
    amount: 7,
    description:
      'Designed and implemented a solution used by several teams, improved quality or efficiency, and trained the department.',
  },
  {
    id: 'deadline',
    label: 'Critical delivery deadline rescue',
    amount: 1,
    description: 'Closed a critical deadline or made a specific contribution that prevented a delivery failure.',
  },
  {
    id: 'quality-save',
    label: 'Serious issue caught before delivery',
    amount: 1,
    description: 'Found a serious error before the work was sent to the client.',
  },
  {
    id: 'checklist',
    label: 'Reusable self-check list',
    amount: 1,
    description:
      'Prepared a high-quality self-check list that is actively reused by several colleagues. It must be confirmed by relevant self-check lists in the project folder for at least one month.',
  },
  {
    id: 'client-feedback',
    label: 'Named positive client feedback',
    amount: 2,
    description: 'Received explicit positive client feedback that names the employee and their contribution.',
  },
  {
    id: 'acting-lead',
    label: 'First acting coordinator or lead assignment',
    amount: 1,
    description:
      'Successfully acted as coordinator or lead for the first time, without previous coordination experience.',
  },
  {
    id: 'training',
    label: 'Recorded internal training',
    amount: 2,
    description: 'Independently prepared, delivered and recorded training for junior specialists or the department.',
  },
];

export const BLUE_CATEGORY_DEFINITIONS = [
  {
    name: 'Employee of the Year',
    amount: 1,
    description:
      'Annual department distinction, limited to one recipient for every ten active department employees.',
  },
  {
    name: 'Long-term Automation / Tool / Framework',
    amount: 1,
    description:
      'Developed an automation, tool or framework with a long-term positive effect across C-Job.',
  },
  {
    name: 'Cross-department System / Process / Toolkit',
    amount: 2,
    description:
      'Created a system, process or toolkit that improves work or efficiency and is used by multiple departments.',
  },
  {
    name: 'Engineering Standards Contribution',
    amount: 1,
    description: 'Made a key contribution to C-Job engineering standards.',
  },
  {
    name: 'International Conference Representation',
    amount: 1,
    description: 'Successfully spoke at an international conference as a C-Job representative.',
  },
  {
    name: 'Most Successful Department Project',
    amount: 1,
    description:
      'Coordinated the department’s most successful project of the year, considering savings percentage, total hours, quality and client feedback.',
  },
] as const;

export const BLUE_CATEGORIES = BLUE_CATEGORY_DEFINITIONS.map((category) => category.name);

export const BLUE_CATEGORY_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  BLUE_CATEGORY_DEFINITIONS.map((category) => [category.name, category.description]),
);

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Employee: 'Personal workspace and peer recognition',
  Coordinator: 'Team recognition and project-based Yellow awards',
  GPM: 'Company team and White/Yellow awards',
  Head: 'Approvals, department awards and quality',
  'Top Management': 'Company-wide Radiant recognition',
  Administrator: 'Reference data, imports and system rules',
};
