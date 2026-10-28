import type { FulfillmentContact } from '@/models';

export const REWARD_FULFILLMENT_CONTACTS = [
  { id: 'd1000000-0000-4000-8000-000000000001', name: 'Andrey Zherebetsky', email: 'a.zherebetsky@c-job.com.ua', role: 'Director', officeName: null },
  { id: 'd1000000-0000-4000-8000-000000000002', name: 'Olga Kalnauz', email: 'o.kalnauz@c-job.com.ua', role: 'Director', officeName: null },
  { id: 'd1000000-0000-4000-8000-000000000003', name: 'Marharyta Nazarenko', email: 'm.nazarenko@c-job.com.ua', role: 'OfficeManager', officeName: 'Main office' },
  { id: 'd1000000-0000-4000-8000-000000000004', name: 'Miglena Keranova', email: 'm.keranova@c-job.com.ua', role: 'OfficeManager', officeName: 'Varna office' },
  { id: 'd1000000-0000-4000-8000-000000000005', name: 'Mariya Petrenko', email: 'm.petrenko@c-job.com.ua', role: 'OfficeManager', officeName: 'Gdansk office' },
  { id: 'd1000000-0000-4000-8000-000000000006', name: 'Mykhailo Balanovskyi', email: 'm.balanovskiy@c-job.com.ua', role: 'DepartmentHead', officeName: 'Pipes & Systems Department' },
  { id: 'd1000000-0000-4000-8000-000000000007', name: 'Ivan Tatko', email: 'i.tatko@c-job.com.ua', role: 'DepartmentHead', officeName: 'Hull & Basic Design Department' },
  { id: 'd1000000-0000-4000-8000-000000000008', name: 'Mariia Klimova', email: 'm.klimova@c-job.com.ua', role: 'DepartmentHead', officeName: 'Hull Outfitting & Equipment Department' },
  { id: 'd1000000-0000-4000-8000-000000000009', name: 'Dmytro Volik', email: 'd.volik@c-job.com.ua', role: 'DepartmentHead', officeName: 'Structural Analysis and R&D' },
  { id: 'd1000000-0000-4000-8000-000000000010', name: 'Yevhen (Test)', email: 'y.petrashenko@c-job.com.ua', role: 'OfficeManager', officeName: null },
] satisfies FulfillmentContact[];

export const FULFILLMENT_ROLE_LABELS: Record<FulfillmentContact['role'], string> = {
  Director: 'Director',
  OfficeManager: 'Office manager',
  DepartmentHead: 'Department head',
};
