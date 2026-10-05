import { CheckCircle2, Clock3, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import styles from '@/views/styles/app.module.css';

const iconMap = {
  Approved: CheckCircle2,
  Completed: CheckCircle2,
  Active: ShieldAlert,
  Pending: Clock3,
  Created: Clock3,
  Rejected: XCircle,
  Cancelled: XCircle,
  Expired: XCircle,
  Exported: CheckCircle2,
  Paid: CheckCircle2,
  Available: CheckCircle2,
  Ready: CheckCircle2,
  Blocked: ShieldAlert,
  Disabled: ShieldAlert,
  Scheduled: Clock3,
  Invalid: XCircle,
  Unknown: XCircle,
  Reversed: RotateCcw,
};

export function StatusBadge({ status }: { status: string }) {
  const Icon = iconMap[status as keyof typeof iconMap] ?? Clock3;
  return (
    <span className={`${styles.statusBadge} ${styles[`status${status.replace(/\s/g, '')}`] ?? ''}`}>
      <Icon size={13} />
      {status}
    </span>
  );
}
