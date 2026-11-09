import type { SparkPriceComponent, SpendableSparkType } from '@/models/shop';

export type TaskBoardStatus = 'Active' | 'Booked' | 'Completed' | 'Cancelled';
export type TaskBoardFilter = 'all' | 'active' | 'booked' | 'completed' | 'mine' | 'assigned';

export interface TaskBoardDraft {
  title: string;
  description: string;
  rewardComponents: SparkPriceComponent[];
  dueDate: string | null;
}

export interface TaskBoardPermissions {
  canEdit: boolean;
  canCancel: boolean;
  canBook: boolean;
  canUnassign: boolean;
  canComplete: boolean;
  canViewHistory: boolean;
}

export interface TaskBoardItem extends TaskBoardDraft {
  id: string;
  rewardSparkType: SpendableSparkType;
  rewardAmount: number;
  authorId: string;
  authorName: string;
  authorDepartmentId: string | null;
  authorDepartmentName: string;
  status: TaskBoardStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  bookedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
  permissions: TaskBoardPermissions;
}

export interface TaskBoardPage {
  items: TaskBoardItem[];
  nextCursor: string | null;
  hasNext: boolean;
}

export interface TaskBoardApprovalSession {
  id: string;
  stage: 'First' | 'Second' | 'Ready';
  expiresAt?: string;
}

export interface TaskBoardEvent {
  id: string;
  eventType: string;
  actorName: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}
